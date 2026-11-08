import { describe, it, expect } from 'vitest';
import { generatePickupPin, hashPickupPin, verifyPickupPin } from '../lib/otp';
import { computeAvailable, toBaseUnits, fromBaseUnits, formatPhp } from '../lib/assets';

describe('Pickup OTP Security & HMAC Invariants', () => {
  const reservationId = 'res_test_uuid_12345';
  const pin = '482910';

  it('generates a 6-digit cryptographically secure PIN', () => {
    const generated = generatePickupPin();
    expect(generated).toMatch(/^\d{6}$/);
    const num = parseInt(generated, 10);
    expect(num).toBeGreaterThanOrEqual(100000);
    expect(num).toBeLessThanOrEqual(999999);
  });

  it('correctly verifies a matching PIN using HMAC-SHA256', () => {
    const hmac = hashPickupPin(reservationId, pin);
    const isMatch = verifyPickupPin(reservationId, pin, hmac);
    expect(isMatch).toBe(true);
  });

  it('strictly rejects an incorrect candidate PIN', () => {
    const hmac = hashPickupPin(reservationId, pin);
    const isMatch = verifyPickupPin(reservationId, '000000', hmac);
    expect(isMatch).toBe(false);
  });

  it('strictly rejects when applied against a different reservation ID (replay prevention)', () => {
    const hmac = hashPickupPin(reservationId, pin);
    const isMatch = verifyPickupPin('res_different_id_99999', pin, hmac);
    expect(isMatch).toBe(false);
  });

  it('strictly rejects empty or malformed inputs', () => {
    const hmac = hashPickupPin(reservationId, pin);
    expect(verifyPickupPin(reservationId, '', hmac)).toBe(false);
    expect(verifyPickupPin(reservationId, pin, '')).toBe(false);
  });
});

describe('Asset & Centavo Math Invariants', () => {
  it('correctly formats and parses 7-decimal base units', () => {
    const baseUnits = toBaseUnits('15.5');
    expect(baseUnits).toBe('155000000');

    const formatted = fromBaseUnits('155000000');
    expect(formatted).toBe('15.5000000');
  });

  it('correctly formats integer centavos into PHP currency strings', () => {
    expect(formatPhp(1500000)).toBe('₱15,000.00');
    expect(formatPhp(25050)).toBe('₱250.50');
  });
});
