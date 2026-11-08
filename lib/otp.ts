import crypto from 'crypto';

const HMAC_SECRET = process.env.HMAC_SECRET || 'cashready-default-dev-secret-do-not-use-in-prod';

/**
 * Generates a cryptographically secure 6-digit one-time pickup code.
 */
export function generatePickupPin(): string {
  // Generates integer between 100000 and 999999 inclusive
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Computes an HMAC-SHA256 hash for a PIN bound to a specific reservation ID.
 */
export function hashPickupPin(reservationId: string, pin: string): string {
  const hmac = crypto.createHmac('sha256', HMAC_SECRET);
  hmac.update(`${reservationId}:${pin}`);
  return hmac.digest('hex');
}

/**
 * Verifies a supplied PIN against the stored HMAC using constant-time comparison.
 */
export function verifyPickupPin(reservationId: string, candidatePin: string, storedHmac: string): boolean {
  if (!candidatePin || !storedHmac) return false;
  
  const candidateHmac = hashPickupPin(reservationId, candidatePin);
  const candidateBuffer = Buffer.from(candidateHmac, 'hex');
  const storedBuffer = Buffer.from(storedHmac, 'hex');

  if (candidateBuffer.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidateBuffer, storedBuffer);
}
