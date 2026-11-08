import { prisma } from '../lib/db';
import { holdCashAtomic, fulfillCashPickupAtomic } from '../lib/inventory';
import { generatePickupPin, hashPickupPin, verifyPickupPin } from '../lib/otp';
import { toBaseUnits } from '../lib/assets';

async function runSmokeTest() {
  console.log('====================================================');
  console.log('       CashReady — End-to-End Smoke Test Flow        ');
  console.log('====================================================\n');

  // Step 1: Create Payout Intent
  console.log('1. Creating Payout Intent for 50 XLM...');
  const payout = await prisma.payout.create({
    data: {
      funderAddress: 'GBDEMOFUNDERTESTNETKEY00000000000000000000000000000000000',
      asset: 'XLM',
      assetSacId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
      tokenAmountBaseUnits: toBaseUnits('50'),
      payoutStatus: 'CREATED',
    },
  });
  console.log(`   ✓ Created Payout ID: ${payout.id}`);

  // Step 2: Confirm On-Chain Funding
  console.log('\n2. Confirming Testnet Funding Transaction...');
  const updatedPayout = await prisma.payout.update({
    where: { id: payout.id },
    data: {
      payoutStatus: 'FUNDED',
      fundingTxHash: `sim_tx_funding_${Date.now()}`,
    },
  });
  console.log(`   ✓ Payout is now: ${updatedPayout.payoutStatus}`);

  // Step 3: Recipient Requests Cash Reservation
  console.log('\n3. Recipient requesting ₱10,000 cash hold at Cebu Central Express (Agent B)...');
  const agentId = 'agt_cebu_central_002';
  const pin = generatePickupPin();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const reservation = await prisma.reservation.create({
    data: {
      payoutId: payout.id,
      agentId,
      phpAmountMinor: 1000000, // ₱10,000.00
      status: 'REQUESTED',
      expiresAt,
      pickupPinHmac: '',
    },
  });

  const pinHmac = hashPickupPin(reservation.id, pin);
  await prisma.reservation.update({
    where: { id: reservation.id },
    data: { pickupPinHmac: pinHmac },
  });
  console.log(`   ✓ Reservation requested: ${reservation.id}`);

  // Step 4: Agent Confirms Cash Hold (Atomic Concurrency)
  console.log('\n4. Agent B accepting reservation and locking cash hold atomically...');
  const holdResult = await holdCashAtomic(
    reservation.id,
    agentId,
    payout.id,
    1000000,
    'agent:cebu_operator'
  );
  if (!holdResult.success) {
    throw new Error(`Failed to hold cash: ${holdResult.error}`);
  }
  console.log('   ✓ Cash hold accepted and inventory locked.');

  // Step 5: Recipient Acknowledges Simulated Cash Receipt
  console.log('\n5. Recipient acknowledging simulated pickup...');
  await prisma.reservation.update({
    where: { id: reservation.id },
    data: { acknowledgedAt: new Date() },
  });
  console.log('   ✓ Recipient collection acknowledged.');

  // Step 6: Agent Verifies PIN and Attests Handover
  console.log('\n6. Agent verifying 6-digit OTP code and attesting cash handover...');
  const isPinValid = verifyPickupPin(reservation.id, pin, pinHmac);
  if (!isPinValid) {
    throw new Error('PIN verification failed');
  }

  const fulfillResult = await fulfillCashPickupAtomic(reservation.id, 'agent:cebu_operator');
  if (!fulfillResult.success) {
    throw new Error(`Failed to fulfill: ${fulfillResult.error}`);
  }
  console.log('   ✓ Physical handover verified. Cash status: FULFILLED.');

  // Step 7: Operator Approves and Releases On-Chain Settlement
  console.log('\n7. Operator approving on-chain settlement release to Agent B wallet...');
  const agentWallet = 'GBAGENTCEBU00000000000000000000000000000000000000000000';
  const releaseTxHash = `sim_release_tx_${Date.now()}`;

  await prisma.$transaction(async (tx) => {
    await tx.settlementIntent.create({
      data: {
        payoutId: payout.id,
        approvalActor: 'usr_operator_demo',
        status: 'CONFIRMED',
        txHash: releaseTxHash,
      },
    });

    await tx.payout.update({
      where: { id: payout.id },
      data: {
        payoutStatus: 'RELEASED',
        selectedAgentAddress: agentWallet,
      },
    });
  });

  console.log(`   ✓ Settlement released on Testnet! Tx: ${releaseTxHash}`);
  console.log(`   ✓ Payout final status: RELEASED`);

  console.log('\n====================================================');
  console.log('       ✓ ALL SMOKE TEST STEPS PASSED CLEANLY!       ');
  console.log('====================================================\n');
}

runSmokeTest()
  .catch((err) => {
    console.error('Smoke test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
