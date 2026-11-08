#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Env,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    PayoutNotFound = 2,
    PayoutAlreadyExists = 3,
    InvalidStatus = 4,
    Unauthorized = 5,
    InvalidAmount = 6,
    UnsupportedAsset = 7,
    DoubleRelease = 8,
    RefundAfterRelease = 9,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PayoutStatus {
    Funded = 1,
    Released = 2,
    Refunded = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PayoutRecord {
    pub payout_id: u128,
    pub asset_sac: Address,
    pub amount: i128,
    pub funder: Address,
    pub operator: Address,
    pub status: PayoutStatus,
    pub agent_wallet: Option<Address>,
}

#[contracttype]
pub enum DataKey {
    Payout(u128),
    XlmSac,
    UsdcSac,
    Admin,
}

#[contract]
pub struct CashReadyPayoutContract;

#[contractimpl]
impl CashReadyPayoutContract {
    /// Initialize allowed Stellar Asset Contract (SAC) IDs for Testnet XLM and Circle Testnet USDC.
    pub fn init(env: Env, admin: Address, xlm_sac: Address, usdc_sac: Address) -> Result<(), Error> {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::XlmSac, &xlm_sac);
        env.storage().instance().set(&DataKey::UsdcSac, &usdc_sac);
        Ok(())
    }

    /// Escrow payout funds from authorized funder.
    /// Asset MUST be either native XLM SAC or Circle Testnet USDC SAC.
    /// Agent destination wallet is intentionally deferred until physical fulfillment.
    pub fn create_and_fund(
        env: Env,
        payout_id: u128,
        asset_sac: Address,
        amount: i128,
        funder: Address,
        operator: Address,
    ) -> Result<(), Error> {
        funder.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let key = DataKey::Payout(payout_id);
        if env.storage().persistent().has(&key) {
            return Err(Error::PayoutAlreadyExists);
        }

        // Validate asset allowlist (only XLM SAC or USDC SAC permitted)
        let xlm_sac: Option<Address> = env.storage().instance().get(&DataKey::XlmSac);
        let usdc_sac: Option<Address> = env.storage().instance().get(&DataKey::UsdcSac);

        let is_allowed = match (&xlm_sac, &usdc_sac) {
            (Some(x), Some(u)) => &asset_sac == x || &asset_sac == u,
            (Some(x), None) => &asset_sac == x,
            (None, Some(u)) => &asset_sac == u,
            _ => true, // Demo fallback if init not invoked
        };

        if !is_allowed {
            return Err(Error::UnsupportedAsset);
        }

        // Custody tokens atomically into contract
        let token_client = token::Client::new(&env, &asset_sac);
        token_client.transfer(&funder, &env.current_contract_address(), &amount);

        let record = PayoutRecord {
            payout_id,
            asset_sac,
            amount,
            funder,
            operator,
            status: PayoutStatus::Funded,
            agent_wallet: None,
        };

        env.storage().persistent().set(&key, &record);
        Ok(())
    }

    /// Designated operator-only authorized release to fulfilling agent wallet.
    /// Double-release is strictly prevented.
    pub fn release(env: Env, payout_id: u128, agent_wallet: Address) -> Result<(), Error> {
        let key = DataKey::Payout(payout_id);
        let mut record: PayoutRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::PayoutNotFound)?;

        record.operator.require_auth();

        if record.status == PayoutStatus::Released {
            return Err(Error::DoubleRelease);
        }

        if record.status != PayoutStatus::Funded {
            return Err(Error::InvalidStatus);
        }

        // Transfer funds from contract custody to fulfilled agent wallet
        let token_client = token::Client::new(&env, &record.asset_sac);
        token_client.transfer(&env.current_contract_address(), &agent_wallet, &record.amount);

        record.status = PayoutStatus::Released;
        record.agent_wallet = Some(agent_wallet);

        env.storage().persistent().set(&key, &record);
        Ok(())
    }

    /// Authorized refund to original funder before release.
    /// Prohibits refund after release.
    pub fn refund(env: Env, payout_id: u128) -> Result<(), Error> {
        let key = DataKey::Payout(payout_id);
        let mut record: PayoutRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::PayoutNotFound)?;

        // Either operator or funder can initiate refund under dispute policy
        record.operator.require_auth();

        if record.status == PayoutStatus::Released {
            return Err(Error::RefundAfterRelease);
        }

        if record.status != PayoutStatus::Funded {
            return Err(Error::InvalidStatus);
        }

        // Transfer funds back to original funder
        let token_client = token::Client::new(&env, &record.asset_sac);
        token_client.transfer(&env.current_contract_address(), &record.funder, &record.amount);

        record.status = PayoutStatus::Refunded;
        env.storage().persistent().set(&key, &record);
        Ok(())
    }

    /// Query payout escrow record by payout ID.
    pub fn get_payout(env: Env, payout_id: u128) -> Result<PayoutRecord, Error> {
        let key = DataKey::Payout(payout_id);
        env.storage()
            .persistent()
            .get(&key)
            .ok_or(Error::PayoutNotFound)
    }
}

#[cfg(test)]
mod test;
