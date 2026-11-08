#![cfg(test)]
use super::*;
use soroban_sdk::{
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    token::Client as TokenClient,
    token::StellarAssetClient as TokenAdminClient,
    Address, Env, IntoVal,
};

fn create_token_contract<'a>(env: &Env, admin: &Address) -> (TokenClient<'a>, TokenAdminClient<'a>) {
    let contract_id = env.register_stellar_asset_contract_v2(admin.clone());
    (
        TokenClient::new(env, &contract_id.address()),
        TokenAdminClient::new(env, &contract_id.address()),
    )
}

#[test]
fn test_successful_create_fund_and_release_xlm() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CashReadyPayoutContract);
    let client = CashReadyPayoutContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let (xlm_token, xlm_admin) = create_token_contract(&env, &token_admin);
    let usdc_admin_addr = Address::generate(&env);
    let (usdc_token, _) = create_token_contract(&env, &usdc_admin_addr);

    let admin = Address::generate(&env);
    client.init(&admin, &xlm_token.address, &usdc_token.address);

    let funder = Address::generate(&env);
    let operator = Address::generate(&env);
    let agent_wallet = Address::generate(&env);

    // Fund funder with 100 XLM (1,000,000,000 base units)
    xlm_admin.mint(&funder, &1_000_000_000);

    let payout_id: u128 = 1001;
    let amount: i128 = 500_000_000; // 50 XLM

    // 1. Create and fund
    client.create_and_fund(&payout_id, &xlm_token.address, &amount, &funder, &operator);

    let record = client.get_payout(&payout_id);
    assert_eq!(record.status, PayoutStatus::Funded);
    assert_eq!(record.amount, amount);
    assert_eq!(xlm_token.balance(&contract_id), amount);

    // 2. Operator release
    client.release(&payout_id, &agent_wallet);

    let updated_record = client.get_payout(&payout_id);
    assert_eq!(updated_record.status, PayoutStatus::Released);
    assert_eq!(updated_record.agent_wallet, Some(agent_wallet.clone()));
    assert_eq!(xlm_token.balance(&agent_wallet), amount);
    assert_eq!(xlm_token.balance(&contract_id), 0);
}

#[test]
fn test_successful_create_fund_and_release_usdc() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CashReadyPayoutContract);
    let client = CashReadyPayoutContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let (xlm_token, _) = create_token_contract(&env, &token_admin);
    let usdc_admin_addr = Address::generate(&env);
    let (usdc_token, usdc_admin) = create_token_contract(&env, &usdc_admin_addr);

    client.init(&admin, &xlm_token.address, &usdc_token.address);

    let funder = Address::generate(&env);
    let operator = Address::generate(&env);
    let agent_wallet = Address::generate(&env);

    // Fund funder with 50 USDC (500,000,000 base units)
    usdc_admin.mint(&funder, &500_000_000);

    let payout_id: u128 = 1002;
    let amount: i128 = 200_000_000; // 20 USDC

    client.create_and_fund(&payout_id, &usdc_token.address, &amount, &funder, &operator);
    assert_eq!(usdc_token.balance(&contract_id), amount);

    client.release(&payout_id, &agent_wallet);

    let record = client.get_payout(&payout_id);
    assert_eq!(record.status, PayoutStatus::Released);
    assert_eq!(usdc_token.balance(&agent_wallet), amount);
}

#[test]
#[should_panic(expected = "DoubleRelease")]
fn test_double_release_prevention() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CashReadyPayoutContract);
    let client = CashReadyPayoutContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let (xlm_token, xlm_admin) = create_token_contract(&env, &token_admin);

    client.init(&admin, &xlm_token.address, &xlm_token.address);

    let funder = Address::generate(&env);
    let operator = Address::generate(&env);
    let agent_wallet = Address::generate(&env);

    xlm_admin.mint(&funder, &1_000_000_000);

    let payout_id: u128 = 1003;
    let amount: i128 = 100_000_000;

    client.create_and_fund(&payout_id, &xlm_token.address, &amount, &funder, &operator);
    client.release(&payout_id, &agent_wallet);

    // Second release must panic / error with DoubleRelease
    client.release(&payout_id, &agent_wallet);
}

#[test]
#[should_panic(expected = "RefundAfterRelease")]
fn test_refund_after_release_prevention() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CashReadyPayoutContract);
    let client = CashReadyPayoutContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let (xlm_token, xlm_admin) = create_token_contract(&env, &token_admin);

    client.init(&admin, &xlm_token.address, &xlm_token.address);

    let funder = Address::generate(&env);
    let operator = Address::generate(&env);
    let agent_wallet = Address::generate(&env);

    xlm_admin.mint(&funder, &1_000_000_000);

    let payout_id: u128 = 1004;
    let amount: i128 = 100_000_000;

    client.create_and_fund(&payout_id, &xlm_token.address, &amount, &funder, &operator);
    client.release(&payout_id, &agent_wallet);

    // Attempting refund after release must fail
    client.refund(&payout_id);
}

#[test]
#[should_panic(expected = "UnsupportedAsset")]
fn test_unsupported_asset_rejection() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CashReadyPayoutContract);
    let client = CashReadyPayoutContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let (xlm_token, _) = create_token_contract(&env, &token_admin);
    let (usdc_token, _) = create_token_contract(&env, &token_admin);

    // Allowlist only XLM and USDC
    client.init(&admin, &xlm_token.address, &usdc_token.address);

    // Create an unapproved custom counterfeit token
    let fake_admin = Address::generate(&env);
    let (fake_token, fake_token_admin) = create_token_contract(&env, &fake_admin);

    let funder = Address::generate(&env);
    let operator = Address::generate(&env);

    fake_token_admin.mint(&funder, &1_000_000_000);

    // Should reject unsupported asset
    client.create_and_fund(&1005, &fake_token.address, &100_000_000, &funder, &operator);
}
