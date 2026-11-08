import { Keypair } from '@stellar/stellar-sdk';
import {
  createAndFundTestnetAccount,
  establishUsdcTrustline,
  getAccountBalances,
} from '../lib/stellar';
import {
  CIRCLE_TESTNET_USDC_ISSUER,
  XLM_TESTNET_SAC_ID,
} from '../lib/assets';
import fs from 'fs';
import path from 'path';

async function setupTestnet() {
  console.log('====================================================');
  console.log('       CashReady — Stellar Testnet Setup Utility    ');
  console.log('====================================================\n');

  console.log(`Target Network: Stellar TESTNET`);
  console.log(`Native XLM SAC ID: ${XLM_TESTNET_SAC_ID}`);
  console.log(`Circle Testnet USDC Issuer: ${CIRCLE_TESTNET_USDC_ISSUER}\n`);

  console.log('1. Setting up Operator account...');
  const operator = await createAndFundTestnetAccount();
  console.log(`   Operator Public Key: ${operator.publicKey}`);
  console.log(`   Friendbot XLM Funded: ${operator.funded ? '✓' : '✗'}`);

  console.log('\n2. Setting up Demo Funder account...');
  const funder = await createAndFundTestnetAccount();
  console.log(`   Funder Public Key: ${funder.publicKey}`);
  console.log(`   Friendbot XLM Funded: ${funder.funded ? '✓' : '✗'}`);

  console.log('\n3. Establishing Circle Testnet USDC Trustline on Funder account...');
  const trustlineResult = await establishUsdcTrustline(funder.secretKey);
  console.log(`   Trustline Status: ${trustlineResult.success ? '✓ Established' : '✗ Failed'}`);
  if (trustlineResult.txHash) {
    console.log(`   Trustline Tx: ${trustlineResult.txHash}`);
    console.log(`   Explorer Link: https://stellar.expert/explorer/testnet/tx/${trustlineResult.txHash}`);
  }

  console.log('\n4. Verifying account balances via Horizon...');
  const funderBalances = await getAccountBalances(funder.publicKey);
  console.log(`   Funder XLM: ${funderBalances.xlm} XLM`);
  console.log(`   Funder USDC: ${funderBalances.usdc} USDC (Trustline active: ${funderBalances.hasUsdcTrustline})`);

  console.log('\n====================================================');
  console.log('       Circle Testnet Faucet Instructions           ');
  console.log('====================================================');
  console.log(`To obtain Circle Testnet USDC for testing:`);
  console.log(`1. Visit: https://faucet.circle.com`);
  console.log(`2. Select 'Stellar Testnet'`);
  console.log(`3. Enter Funder Address: ${funder.publicKey}`);
  console.log(`4. Request 10 Testnet USDC (Tokens are nonredeemable test assets).`);
  console.log('====================================================\n');

  // Update .env safely without printing private keys
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    envContent = envContent.replace(
      /OPERATOR_PUBLIC_KEY=".*"/,
      `OPERATOR_PUBLIC_KEY="${operator.publicKey}"`
    );
    envContent = envContent.replace(
      /OPERATOR_SECRET_KEY=".*"/,
      `OPERATOR_SECRET_KEY="${operator.secretKey}"`
    );
    envContent = envContent.replace(
      /DEMO_FUNDER_PUBLIC_KEY=".*"/,
      `DEMO_FUNDER_PUBLIC_KEY="${funder.publicKey}"`
    );
    envContent = envContent.replace(
      /DEMO_FUNDER_SECRET_KEY=".*"/,
      `DEMO_FUNDER_SECRET_KEY="${funder.secretKey}"`
    );
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('✓ Successfully written Testnet keys to local .env (Private keys kept secure).\n');
  }
}

setupTestnet().catch((err) => {
  console.error('Testnet setup failed:', err);
  process.exit(1);
});
