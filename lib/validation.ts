import { z } from 'zod';

export const SupportedAssetEnum = z.enum(['XLM', 'USDC']);

// Create Payout Intent
export const CreatePayoutSchema = z.object({
  funderAddress: z.string().regex(/^G[A-Z0-9]{55}$/, 'Invalid Stellar G... address'),
  asset: SupportedAssetEnum,
  tokenAmountBaseUnits: z.string().regex(/^[1-9]\d*$/, 'Must be a positive integer base unit string'),
});

// Confirm Funding
export const ConfirmFundingSchema = z.object({
  fundingTxHash: z.string().min(10, 'Transaction hash is required'),
  onchainPayoutId: z.string().optional(),
});

// Create Cash Reservation
export const CreateReservationSchema = z.object({
  payoutId: z.string().uuid('Invalid payout UUID'),
  agentId: z.string().min(1, 'Agent ID is required'),
  phpAmountMinor: z.number().int().positive('PHP amount must be a positive integer in centavos'),
});

// Confirm Cash Hold
export const ConfirmReservationSchema = z.object({
  reservationId: z.string().uuid('Invalid reservation UUID'),
});

// Verify Pickup PIN
export const VerifyPickupSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
});

// Operator Settlement Release
export const ReleaseSettlementSchema = z.object({
  agentWallet: z.string().regex(/^G[A-Z0-9]{55}$/, 'Invalid receiving agent Stellar G... address'),
});
