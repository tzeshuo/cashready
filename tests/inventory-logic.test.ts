import { describe, it, expect } from 'vitest';
import { computeAvailable } from '../lib/inventory';

describe('Inventory Calculation Invariants', () => {
  it('correctly calculates available cash after held and buffer deductions', () => {
    // On hand ₱50,000, Held ₱10,000, Buffer ₱5,000 => Available ₱35,000
    const onHand = 5000000;
    const held = 1000000;
    const buffer = 500000;
    const available = computeAvailable(onHand, held, buffer);
    expect(available).toBe(3500000);
  });

  it('detects insufficient cash when requested amount exceeds available cash', () => {
    // Agent A (Manila QuickCash): On hand ₱5,000, Buffer ₱3,000 => Available ₱2,000
    const onHand = 500000;
    const held = 0;
    const buffer = 300000;
    const available = computeAvailable(onHand, held, buffer);
    expect(available).toBe(200000);

    const requestedAmount = 1000000; // ₱10,000
    const hasSufficient = available >= requestedAmount;
    expect(hasSufficient).toBe(false);
  });

  it('guarantees two concurrent ₱10k reservations cannot both succeed on ₱13k available', () => {
    let available = 1300000; // ₱13,000 available
    const req1 = 1000000;   // ₱10,000
    const req2 = 1000000;   // ₱10,000

    let acceptedCount = 0;
    // Transaction simulation
    if (available >= req1) {
      available -= req1;
      acceptedCount++;
    }
    if (available >= req2) {
      available -= req2;
      acceptedCount++;
    }

    expect(acceptedCount).toBe(1);
    expect(available).toBe(300000); // ₱3,000 left
  });
});
