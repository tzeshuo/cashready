import {
  Horizon,
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  Networks,
  rpc,
  Address,
} from '@stellar/stellar-sdk';
import { CIRCLE_TESTNET_USDC_ISSUER, XLM_TESTNET_SAC_ID } from './assets';

export const STELLAR_TESTNET_PASSPHRASE =
  process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;
export const HORIZON_URL =
  process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
export const RPC_URL =
  process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';

export const horizonServer = new Horizon.Server(HORIZON_URL);
export const rpcServer = new rpc.Server(RPC_URL);

/**
 * Circle Testnet USDC Asset descriptor
 */
export const CircleTestnetUSDCAsset = new Asset(
  'USDC',
  CIRCLE_TESTNET_USDC_ISSUER
);

/**
 * Creates and funds a new Stellar Testnet account using Friendbot.
 */
export async function createAndFundTestnetAccount(): Promise<{
  publicKey: string;
  secretKey: string;
  funded: boolean;
}> {
  const pair = Keypair.random();
  const publicKey = pair.publicKey();
  const secretKey = pair.secret();

  try {
    const friendbotUrl = `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`;
    const response = await fetch(friendbotUrl);
    if (!response.ok) {
      throw new Error(`Friendbot funding failed with status: ${response.status}`);
    }
    return { publicKey, secretKey, funded: true };
  } catch (error) {
    console.error(`Failed to fund ${publicKey} with Friendbot:`, error);
    return { publicKey, secretKey, funded: false };
  }
}

/**
 * Checks balances of a Stellar Testnet account via Horizon.
 */
export async function getAccountBalances(publicKey: string): Promise<{
  xlm: string;
  usdc: string;
  hasUsdcTrustline: boolean;
}> {
  try {
    const account = await horizonServer.loadAccount(publicKey);
    let xlmBalance = '0';
    let usdcBalance = '0';
    let hasUsdcTrustline = false;

    for (const b of account.balances) {
      if (b.asset_type === 'native') {
        xlmBalance = b.balance;
      } else if (
        'asset_code' in b &&
        b.asset_code === 'USDC' &&
        'asset_issuer' in b &&
        b.asset_issuer === CIRCLE_TESTNET_USDC_ISSUER
      ) {
        usdcBalance = b.balance;
        hasUsdcTrustline = true;
      }
    }

    return { xlm: xlmBalance, usdc: usdcBalance, hasUsdcTrustline };
  } catch (error: any) {
    if (error.response?.status === 404) {
      return { xlm: '0', usdc: '0', hasUsdcTrustline: false };
    }
    throw error;
  }
}

/**
 * Submits a transaction to establish a Circle Testnet USDC trustline for an account.
 */
export async function establishUsdcTrustline(secretKey: string): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
}> {
  try {
    const pair = Keypair.fromSecret(secretKey);
    const account = await horizonServer.loadAccount(pair.publicKey());

    const transaction = new TransactionBuilder(account, {
      fee: '10000',
      networkPassphrase: STELLAR_TESTNET_PASSPHRASE,
    })
      .addOperation(
        Operation.changeTrust({
          asset: CircleTestnetUSDCAsset,
          limit: '1000000',
        })
      )
      .setTimeout(30)
      .build();

    transaction.sign(pair);
    const result = await horizonServer.submitTransaction(transaction);
    return { success: true, txHash: result.hash };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to establish trustline' };
  }
}

/**
 * Verifies a transaction status on Stellar Horizon or Soroban RPC.
 */
export async function verifyTransactionStatus(txHash: string): Promise<{
  confirmed: boolean;
  ledger?: number;
  error?: string;
}> {
  try {
    const tx = await horizonServer.getTransaction(txHash);
    return { confirmed: tx.successful, ledger: tx.ledger_attr };
  } catch (error: any) {
    return { confirmed: false, error: error.message || 'Transaction not found or pending' };
  }
}
