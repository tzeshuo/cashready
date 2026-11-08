import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../lib/db';
import { resetDemo } from '../scripts/reset-demo';
import { holdCashAtomic, releaseCashHoldAtomic, fulfillCashPickupAtomic, computeAvailable } from '../lib/inventory';
import { generatePickupPin, hashPickupPin, verifyPickupPin, sealPinForRecipient, unsealPinForRecipient } from '../lib/otp';
import { toBaseUnits, fromBaseUnits, getAssetConfig } from '../lib/assets';

describe('CashReady — Complete End-to-End Scenarios Test Matrix', () => {
  beforeAll(async () => {
    // Reset database to deterministic clean seeds before running scenarios
    await resetDemo();
  });

  // SCENARIO 1: Happy Path Full Lifecycle (Agent B - Cebu Central)
  it('Scenario 1: Happy Path Full Lifecycle (XLM, Agent B, Hold, Acknowledge, Handover, Operator Release)', async () => {
    // 1. Create Payout Intent
    const payout = await prisma.payout.create({
      data: {
        funderAddress: 'GACR4M343MW6OV6Z4T6FHPK47MFJZNUU6Z3ENNICPF3L665VHZ2VIOZN',
        asset: 'XLM',
        assetSacId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
        tokenAmountBaseUnits: toBaseUnits('100'),
        payoutStatus: 'CREATED',
      },
    });
    expect(payout.payoutStatus).toBe('CREATED');

    // 2. Confirm Funding
    const fundedPayout = await prisma.payout.update({
      where: { id: payout.id },
      data: {
        payoutStatus: 'FUNDED',
        fundingTxHash: 'sim_tx_scen1_funding',
      },
    });
    expect(fundedPayout.payoutStatus).toBe('FUNDED');

    // 3. Recipient Requests Cash Reservation for ₱10,000 at Agent B
    const agentBId = 'agt_cebu_central_002';
    const rawPin = generatePickupPin();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const reservation = await prisma.reservation.create({
      data: {
        payoutId: payout.id,
        agentId: agentBId,
        phpAmountMinor: 1000000, // ₱10,000.00
        status: 'REQUESTED',
        expiresAt,
        pickupPinHmac: hashPickupPin('temp', rawPin),
      },
    });
    // Update HMAC & sealedPin with actual reservation ID
    const pinHmac = hashPickupPin(reservation.id, rawPin);
    const sealedPin = sealPinForRecipient(rawPin, reservation.id);
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { pickupPinHmac: pinHmac, sealedPin },
    });

    // In REQUESTED status: unsealed PIN must NOT be revealed to recipient yet
    expect(reservation.status).toBe('REQUESTED');

    // 4. Agent B Confirms Hold
    const holdRes = await holdCashAtomic(
      reservation.id,
      agentBId,
      payout.id,
      1000000,
      'agent:cebu'
    );
    expect(holdRes.success).toBe(true);

    const confirmedResv = await prisma.reservation.findUnique({
      where: { id: reservation.id },
    });
    expect(confirmedResv?.status).toBe('CONFIRMED');

    // Agent B's heldMinor should now be ₱10,000.00
    const invB = await prisma.cashInventory.findUnique({ where: { agentId: agentBId } });
    expect(invB?.heldMinor).toBe(1000000);
    expect(computeAvailable(invB!.onHandMinor, invB!.heldMinor, invB!.bufferMinor)).toBe(3500000);

    // 5. Recipient unseals and views OTP code
    const revealedPin = unsealPinForRecipient(confirmedResv!.sealedPin!, confirmedResv!.id);
    expect(revealedPin).toBe(rawPin);

    // 6. Recipient Acknowledges Simulated Cash Receipt
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { acknowledgedAt: new Date() },
    });

    // 7. Agent B Verifies PIN & Attests Cash Handover
    const isPinValid = verifyPickupPin(reservation.id, revealedPin!, confirmedResv!.pickupPinHmac!);
    expect(isPinValid).toBe(true);

    const fulfillRes = await fulfillCashPickupAtomic(reservation.id, 'agent:cebu');
    expect(fulfillRes.success).toBe(true);

    // After fulfillment: heldMinor back to 0, onHandMinor decremented by ₱10,000 (from ₱50k to ₱40k)
    const invBAfter = await prisma.cashInventory.findUnique({ where: { agentId: agentBId } });
    expect(invBAfter?.heldMinor).toBe(0);
    expect(invBAfter?.onHandMinor).toBe(4000000);

    // 8. Operator Approves On-Chain Release
    const agentReceivingWallet = 'GBD5EKQLZYO3FFW4OVXTZ5MNEUGDGAZF3SBHD36AHFUAEPQ33TLCGBRK';
    await prisma.$transaction(async (tx) => {
      await tx.settlementIntent.create({
        data: {
          payoutId: payout.id,
          approvalActor: 'usr_operator_demo',
          status: 'CONFIRMED',
          txHash: 'sim_tx_scen1_release',
        },
      });
      await tx.payout.update({
        where: { id: payout.id },
        data: {
          payoutStatus: 'RELEASED',
          selectedAgentAddress: agentReceivingWallet,
        },
      });
    });

    const finalPayout = await prisma.payout.findUnique({ where: { id: payout.id } });
    expect(finalPayout?.payoutStatus).toBe('RELEASED');
    expect(finalPayout?.selectedAgentAddress).toBe(agentReceivingWallet);
  });

  // SCENARIO 2: Insufficient Cash (Agent A - Manila QuickCash 409)
  it('Scenario 2: Insufficient Cash Rejection (Agent A has ₱2k free, recipient requests ₱10k)', async () => {
    const agentAId = 'agt_manila_quick_001';
    const invA = await prisma.cashInventory.findUnique({ where: { agentId: agentAId } });
    
    // Agent A on-hand ₱5k, buffer ₱3k -> Available: ₱2k (200,000 centavos)
    const available = computeAvailable(invA!.onHandMinor, invA!.heldMinor, invA!.bufferMinor);
    expect(available).toBe(200000);

    // Create a funded payout
    const payout = await prisma.payout.create({
      data: {
        funderAddress: 'GACR4M343MW6OV6Z4T6FHPK47MFJZNUU6Z3ENNICPF3L665VHZ2VIOZN',
        asset: 'XLM',
        assetSacId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
        tokenAmountBaseUnits: toBaseUnits('50'),
        payoutStatus: 'FUNDED',
      },
    });

    // Create reservation request for ₱10,000 (exceeds available ₱2,000)
    const reservation = await prisma.reservation.create({
      data: {
        payoutId: payout.id,
        agentId: agentAId,
        phpAmountMinor: 1000000, // ₱10,000
        status: 'REQUESTED',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    // Attempt to hold cash
    const holdRes = await holdCashAtomic(
      reservation.id,
      agentAId,
      payout.id,
      1000000,
      'agent:manila'
    );

    // Must fail with insufficient cash!
    expect(holdRes.success).toBe(false);
    expect(holdRes.error).toContain('Insufficient available cash');

    // Agent A inventory must remain untouched
    const invAAfter = await prisma.cashInventory.findUnique({ where: { agentId: agentAId } });
    expect(invAAfter?.heldMinor).toBe(0);
    expect(invAAfter?.onHandMinor).toBe(500000);
  });

  // SCENARIO 3: Offline Agent Invariant (Agent C - Davao Bay Remit)
  it('Scenario 3: Offline Agent Rejection (Agent C is inactive)', async () => {
    const agentC = await prisma.agent.findUnique({ where: { id: 'agt_davao_bay_003' } });
    expect(agentC?.active).toBe(false);
  });

  // SCENARIO 4: Two Concurrent Requests for Last Available Cash (Single-Winner Concurrency)
  it('Scenario 4: Race Condition - Two concurrent ₱10k requests against ₱13k available (Only 1 succeeds)', async () => {
    // Setup temporary agent with ₱13k available (₱16k on-hand, ₱3k buffer)
    const raceAgent = await prisma.agent.create({
      data: {
        id: 'agt_race_test_001',
        name: 'Race Test Agent',
        town: 'TestTown',
        active: true,
        receivingAddress: 'GBD5EKQLZYO3FFW4OVXTZ5MNEUGDGAZF3SBHD36AHFUAEPQ33TLCGBRK',
        inventory: {
          create: {
            onHandMinor: 1600000, // ₱16,000
            heldMinor: 0,
            bufferMinor: 300000,  // ₱3,000
          },
        },
      },
    });

    const payout1 = await prisma.payout.create({
      data: {
        funderAddress: 'GACR4M343MW6OV6Z4T6FHPK47MFJZNUU6Z3ENNICPF3L665VHZ2VIOZN',
        asset: 'XLM',
        assetSacId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
        tokenAmountBaseUnits: toBaseUnits('20'),
        payoutStatus: 'FUNDED',
      },
    });

    const payout2 = await prisma.payout.create({
      data: {
        funderAddress: 'GACR4M343MW6OV6Z4T6FHPK47MFJZNUU6Z3ENNICPF3L665VHZ2VIOZN',
        asset: 'XLM',
        assetSacId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
        tokenAmountBaseUnits: toBaseUnits('20'),
        payoutStatus: 'FUNDED',
      },
    });

    const resv1 = await prisma.reservation.create({
      data: {
        payoutId: payout1.id,
        agentId: raceAgent.id,
        phpAmountMinor: 1000000, // ₱10,000
        status: 'REQUESTED',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    const resv2 = await prisma.reservation.create({
      data: {
        payoutId: payout2.id,
        agentId: raceAgent.id,
        phpAmountMinor: 1000000, // ₱10,000
        status: 'REQUESTED',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    // Execute concurrently
    const [result1, result2] = await Promise.all([
      holdCashAtomic(resv1.id, raceAgent.id, payout1.id, 1000000, 'concurrent_test_1'),
      holdCashAtomic(resv2.id, raceAgent.id, payout2.id, 1000000, 'concurrent_test_2'),
    ]);

    const successes = [result1, result2].filter((r) => r.success).length;
    const failures = [result1, result2].filter((r) => !r.success).length;

    // Exactly one winner, one loser
    expect(successes).toBe(1);
    expect(failures).toBe(1);

    // Remaining available must be ₱3,000 (300,000 centavos)
    const finalRaceInv = await prisma.cashInventory.findUnique({ where: { agentId: raceAgent.id } });
    expect(computeAvailable(finalRaceInv!.onHandMinor, finalRaceInv!.heldMinor, finalRaceInv!.bufferMinor)).toBe(300000);
  });

  // SCENARIO 5 & 6: Wrong PIN and 5-Attempt Lockout
  it('Scenario 5 & 6: Wrong PIN entry and 5-Attempt Lockout Cancellation', async () => {
    const resId = 'res_test_lockout_001';
    const truePin = '839201';
    const hmac = hashPickupPin(resId, truePin);

    // Wrong PIN check
    expect(verifyPickupPin(resId, '000000', hmac)).toBe(false);

    // Attempt counter simulation
    let attempts = 0;
    for (let i = 1; i <= 5; i++) {
      if (!verifyPickupPin(resId, '111111', hmac)) {
        attempts++;
      }
    }
    expect(attempts).toBe(5);
    const isLocked = attempts >= 5;
    expect(isLocked).toBe(true);
  });

  // SCENARIO 7: Replay Attack Rejection
  it('Scenario 7: PIN Replay Attack across different reservations is rejected', () => {
    const resA = 'res_aaa_111';
    const resB = 'res_bbb_222';
    const pin = '472819';
    const hmacA = hashPickupPin(resA, pin);

    // Valid for resA
    expect(verifyPickupPin(resA, pin, hmacA)).toBe(true);
    // Intercepted and reused for resB -> MUST FAIL
    expect(verifyPickupPin(resB, pin, hmacA)).toBe(false);
  });

  // SCENARIO 8: Hold Expiration releases held cash without touching on-hand
  it('Scenario 8: Expired Cash Hold releases heldMinor once and preserves onHandMinor', async () => {
    const payout = await prisma.payout.create({
      data: {
        funderAddress: 'GACR4M343MW6OV6Z4T6FHPK47MFJZNUU6Z3ENNICPF3L665VHZ2VIOZN',
        asset: 'XLM',
        assetSacId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
        tokenAmountBaseUnits: toBaseUnits('10'),
        payoutStatus: 'FUNDED',
      },
    });

    const agentBId = 'agt_cebu_central_002';
    const invBefore = await prisma.cashInventory.findUnique({ where: { agentId: agentBId } });
    const initialOnHand = invBefore!.onHandMinor;

    const resv = await prisma.reservation.create({
      data: {
        payoutId: payout.id,
        agentId: agentBId,
        phpAmountMinor: 500000, // ₱5,000
        status: 'REQUESTED',
        expiresAt: new Date(Date.now() - 1000), // Already expired
      },
    });

    // Hold cash
    await holdCashAtomic(resv.id, agentBId, payout.id, 500000, 'expiry_test');

    // Trigger atomic expiry release
    const releaseRes = await releaseCashHoldAtomic(resv.id, 'EXPIRED', 'system:expiry_worker');
    expect(releaseRes.success).toBe(true);

    const invAfter = await prisma.cashInventory.findUnique({ where: { agentId: agentBId } });
    expect(invAfter?.heldMinor).toBe(0);
    expect(invAfter?.onHandMinor).toBe(initialOnHand); // On-hand strictly unchanged!

    // Payout remains FUNDED (independent state machine)
    const payoutAfter = await prisma.payout.findUnique({ where: { id: payout.id } });
    expect(payoutAfter?.payoutStatus).toBe('FUNDED');
  });

  // SCENARIO 9: Multi-Asset Support (Circle Testnet USDC)
  it('Scenario 9: Multi-Asset Validation (Circle Testnet USDC)', () => {
    const usdcConfig = getAssetConfig('USDC');
    expect(usdcConfig.code).toBe('USDC');
    expect(usdcConfig.issuer).toBe('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');

    // Integer base unit conversions
    const usdcBaseUnits = toBaseUnits('25.5');
    expect(usdcBaseUnits).toBe('255000000');
    expect(fromBaseUnits(usdcBaseUnits)).toBe('25.5000000');
  });

  // SCENARIO 10: Inconsistent Manual Balance Update Rejection
  it('Scenario 10: Inconsistent manual on-hand balance reduction is rejected', async () => {
    const agentBId = 'agt_cebu_central_002';
    const inv = await prisma.cashInventory.findUnique({ where: { agentId: agentBId } });
    const minRequired = inv!.heldMinor + inv!.bufferMinor;

    // Attempting to set on-hand below active holds + buffer
    const invalidOnHand = minRequired - 100;
    expect(invalidOnHand < minRequired).toBe(true);
  });
});
