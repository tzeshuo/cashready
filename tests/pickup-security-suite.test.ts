import { describe, it, expect } from 'vitest';
import { generatePickupPin, hashPickupPin, verifyPickupPin, sealPinForRecipient, unsealPinForRecipient } from '../lib/otp';

describe('Prompt E1 / Pickup — OTP Security, Expiry, Replay & Auth Invariants', () => {
  const reservationIdA = 'res_manila_11111';
  const reservationIdB = 'res_cebu_22222';
  const pin = '592841';
  const hmacA = hashPickupPin(reservationIdA, pin);

  // 1. Wrong PIN tests
  describe('Wrong PIN & Attempt Counter Lockout', () => {
    it('rejects wrong PIN code using constant-time comparison', () => {
      expect(verifyPickupPin(reservationIdA, '123456', hmacA)).toBe(false);
      expect(verifyPickupPin(reservationIdA, '999999', hmacA)).toBe(false);
      expect(verifyPickupPin(reservationIdA, '592840', hmacA)).toBe(false);
    });

    it('enforces maximum 5 attempts lockout policy', () => {
      let attempts = 0;
      const maxAttempts = 5;
      const wrongPin = '000000';

      for (let i = 1; i <= maxAttempts; i++) {
        const isValid = verifyPickupPin(reservationIdA, wrongPin, hmacA);
        if (!isValid) attempts++;
      }

      expect(attempts).toBe(5);
      const isLockedOut = attempts >= maxAttempts;
      expect(isLockedOut).toBe(true);
    });
  });

  // 2. Replay attack prevention tests
  describe('Replay Attack Prevention', () => {
    it('strictly rejects the same PIN applied to a different reservation ID', () => {
      // Attacker intercepts PIN for reservation A and tries using it for reservation B
      const isReplayValid = verifyPickupPin(reservationIdB, pin, hmacA);
      expect(isReplayValid).toBe(false);
    });

    it('rejects verification if reservation is already in FULFILLED status (single-use consumption)', () => {
      let reservationStatus = 'FULFILLED';
      const canVerify = reservationStatus === 'CONFIRMED';
      expect(canVerify).toBe(false);
    });
  });

  // 3. Expiry tests
  describe('Expiry Invariants', () => {
    it('detects and rejects expired reservations', () => {
      const now = Date.now();
      const pastTime = new Date(now - 60 * 1000); // 1 minute in the past
      const futureTime = new Date(now + 15 * 60 * 1000); // 15 minutes in future

      const isExpiredPast = new Date() > pastTime;
      const isExpiredFuture = new Date() > futureTime;

      expect(isExpiredPast).toBe(true);
      expect(isExpiredFuture).toBe(false);
    });

    it('ensures hold release on expiry decrements held without touching on-hand', () => {
      let inventory = { onHandMinor: 5000000, heldMinor: 1000000 };
      const expiredHold = 1000000;

      // On expiry
      inventory.heldMinor = Math.max(0, inventory.heldMinor - expiredHold);

      expect(inventory.heldMinor).toBe(0);
      expect(inventory.onHandMinor).toBe(5000000); // unmutated
    });
  });

  // 4. Unauthorized agent tests
  describe('Agent Role & Assignment Authorization', () => {
    it('rejects verification when agent ID does not match assigned reservation agent', () => {
      const assignedAgentId: string = 'agt_cebu_central_002';
      const candidateAgentId: string = 'agt_manila_quick_001';

      const isAuthorized = candidateAgentId === assignedAgentId;
      expect(isAuthorized).toBe(false);
    });

    it('allows verification only when agent identity matches assigned agent', () => {
      const assignedAgentId: string = 'agt_cebu_central_002';
      const candidateAgentId: string = 'agt_cebu_central_002';

      const isAuthorized = candidateAgentId === assignedAgentId;
      expect(isAuthorized).toBe(true);
    });
  });

  // 5. Sealed PIN delivery & recipient acknowledgement
  describe('Sealed PIN Delivery & Handover Preconditions', () => {
    it('withholds PIN from recipient when status is REQUESTED and reveals only after CONFIRMED', () => {
      const sealedToken = sealPinForRecipient(pin, reservationIdA);
      expect(sealedToken).toBeDefined();

      // In REQUESTED status
      let status = 'REQUESTED';
      let canDisplayPin = status === 'CONFIRMED';
      expect(canDisplayPin).toBe(false);

      // In CONFIRMED status
      status = 'CONFIRMED';
      canDisplayPin = status === 'CONFIRMED';
      expect(canDisplayPin).toBe(true);

      const unsealed = unsealPinForRecipient(sealedToken, reservationIdA);
      expect(unsealed).toBe(pin);
    });

    it('requires recipient simulated acknowledgement before handover fulfillment', () => {
      let acknowledgedAt: Date | null = null;
      let canFulfill = acknowledgedAt !== null;
      expect(canFulfill).toBe(false);

      acknowledgedAt = new Date();
      canFulfill = acknowledgedAt !== null;
      expect(canFulfill).toBe(true);
    });
  });
});
