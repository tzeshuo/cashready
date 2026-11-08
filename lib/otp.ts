import crypto from 'crypto';

const HMAC_SECRET = process.env.HMAC_SECRET || 'cashready-default-dev-secret-do-not-use-in-prod-32';
const CIPHER_KEY = crypto.createHash('sha256').update(HMAC_SECRET).digest();

/**
 * Generates a cryptographically secure 6-digit one-time pickup code (100000 to 999999).
 */
export function generatePickupPin(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Computes an HMAC-SHA256 hash for a PIN strictly bound to a reservation ID.
 * Plaintext PINs are never stored in the database.
 */
export function hashPickupPin(reservationId: string, pin: string): string {
  const hmac = crypto.createHmac('sha256', HMAC_SECRET);
  hmac.update(`${reservationId}:${pin}`);
  return hmac.digest('hex');
}

/**
 * Verifies a supplied candidate PIN against the stored HMAC using constant-time comparison.
 */
export function verifyPickupPin(reservationId: string, candidatePin: string, storedHmac: string): boolean {
  if (!candidatePin || !storedHmac) return false;
  if (!/^\d{6}$/.test(candidatePin)) return false;

  const candidateHmac = hashPickupPin(reservationId, candidatePin);
  const candidateBuffer = Buffer.from(candidateHmac, 'hex');
  const storedBuffer = Buffer.from(storedHmac, 'hex');

  if (candidateBuffer.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidateBuffer, storedBuffer);
}

/**
 * Encrypts the one-time PIN with AES-256-GCM so only the authenticated recipient
 * can unseal it after agent confirmation. (Never stored in plaintext in the DB).
 */
export function sealPinForRecipient(pin: string, reservationId: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', CIPHER_KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(`${reservationId}:${pin}`, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Unseals the encrypted PIN for the recipient. Verifies authenticated tag and reservation ID.
 */
export function unsealPinForRecipient(sealed: string, reservationId: string): string | null {
  try {
    const parts = sealed.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, dataHex] = parts;

    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', CIPHER_KEY, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    const [decResId, pin] = decrypted.split(':');

    if (decResId !== reservationId) return null;
    return pin;
  } catch {
    return null;
  }
}
