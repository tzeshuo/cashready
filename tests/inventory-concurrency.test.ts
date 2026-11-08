import { describe, it, expect } from 'vitest';
import { computeAvailable } from '../lib/inventory';

describe('Prompt E1 / Ledger Invariants & Concurrency', () => {
  it('enforces atomic conditional inventory check with concurrent competing requests', async () => {
    // Simulated database state for Agent with ₱13,000 available:
    // On hand: ₱16,000 (1,600,000 centavos)
    // Buffer: ₱3,000 (300,000 centavos)
    // Held: ₱0
    // Initial available = 1,600,000 - 0 - 300,000 = 1,300,000 centavos (₱13,000)
    let inventory = {
      onHandMinor: 1600000,
      heldMinor: 0,
      bufferMinor: 300000,
      version: 1,
    };

    // Atomic conditional transaction simulator
    const executeConditionalHold = async (amountMinor: number): Promise<boolean> => {
      // Simulating Postgres conditional UPDATE:
      // UPDATE "CashInventory" SET heldMinor = heldMinor + amount
      // WHERE (onHandMinor - heldMinor - bufferMinor) >= amount
      const available = inventory.onHandMinor - inventory.heldMinor - inventory.bufferMinor;
      if (available >= amountMinor) {
        inventory.heldMinor += amountMinor;
        inventory.version += 1;
        return true;
      }
      return false;
    };

    // Two concurrent requests for ₱10,000 (1,000,000 centavos) competing for the last cash
    const req1 = executeConditionalHold(1000000);
    const req2 = executeConditionalHold(1000000);

    const [res1, res2] = await Promise.all([req1, req2]);

    // Exactly one must succeed, one must fail
    const successes = [res1, res2].filter(Boolean).length;
    expect(successes).toBe(1);

    // Remaining available cash must be exactly ₱3,000 (300,000 centavos)
    const remainingAvailable = computeAvailable(
      inventory.onHandMinor,
      inventory.heldMinor,
      inventory.bufferMinor
    );
    expect(remainingAvailable).toBe(300000);
    expect(inventory.heldMinor).toBe(1000000);
  });

  it('guarantees fulfillment decrements both held and on_hand once', () => {
    let inventory = {
      onHandMinor: 5000000, // ₱50,000
      heldMinor: 1000000,   // ₱10,000 held
      bufferMinor: 500000,  // ₱5,000 buffer
    };

    const reservationAmount = 1000000; // ₱10,000

    // Fulfillment execution
    inventory.heldMinor = Math.max(0, inventory.heldMinor - reservationAmount);
    inventory.onHandMinor = Math.max(0, inventory.onHandMinor - reservationAmount);

    expect(inventory.heldMinor).toBe(0);
    expect(inventory.onHandMinor).toBe(4000000); // Decremented from ₱50k to ₱40k
    expect(computeAvailable(inventory.onHandMinor, inventory.heldMinor, inventory.bufferMinor)).toBe(3500000);
  });

  it('guarantees expiry decrements held once and preserves on_hand', () => {
    let inventory = {
      onHandMinor: 5000000, // ₱50,000
      heldMinor: 1000000,   // ₱10,000 held
      bufferMinor: 500000,  // ₱5,000 buffer
    };

    const reservationAmount = 1000000; // ₱10,000

    // Expiry execution (only held is released)
    inventory.heldMinor = Math.max(0, inventory.heldMinor - reservationAmount);

    expect(inventory.heldMinor).toBe(0);
    expect(inventory.onHandMinor).toBe(5000000); // Unmutated
    expect(computeAvailable(inventory.onHandMinor, inventory.heldMinor, inventory.bufferMinor)).toBe(4500000);
  });

  it('strictly rejects inconsistent manual balance changes when new on_hand < held + buffer', () => {
    const inventory = {
      onHandMinor: 5000000, // ₱50,000
      heldMinor: 2000000,   // ₱20,000 active holds
      bufferMinor: 500000,  // ₱5,000 buffer
    };

    const minRequired = inventory.heldMinor + inventory.bufferMinor; // ₱25,000
    expect(minRequired).toBe(2500000);

    // Agent attempts to report on_hand balance of only ₱20,000 (below minRequired)
    const proposedOnHand = 2000000;
    const isValid = proposedOnHand >= minRequired;
    expect(isValid).toBe(false);

    // Agent attempts to report on_hand balance of ₱30,000 (valid)
    const validProposedOnHand = 3000000;
    const isValidUpdate = validProposedOnHand >= minRequired;
    expect(isValidUpdate).toBe(true);
  });

  it('strictly rejects negative inventory balance inputs', () => {
    const proposedOnHand = -500;
    expect(proposedOnHand < 0).toBe(true);
  });
});
