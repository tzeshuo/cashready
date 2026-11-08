# CashReady Interfaces & Type Contracts (Gate A Freeze)

## 1. Domain Entities & Schemas

### Asset Types
```typescript
export type SupportedAsset = 'XLM' | 'USDC';

export interface AssetConfig {
  code: SupportedAsset;
  issuer?: string; // Circle Testnet: GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
  sacContractId: string; // C...
  decimals: 7;
}
```

### Payout Status & Data Contract
```typescript
export type PayoutStatus = 'CREATED' | 'FUNDED' | 'RELEASED' | 'REFUNDED';

export interface PayoutDTO {
  payoutId: string; // UUID
  funderAddress: string; // G...
  selectedAgentAddress?: string; // G... (set upon fulfillment / release)
  asset: SupportedAsset;
  assetIssuer?: string;
  assetSacId: string;
  tokenAmountBaseUnits: string; // Integer base units serialized as string
  onchainPayoutId?: string; // u64 or bytes32 identifier
  payoutStatus: PayoutStatus;
  fundingTxHash?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Cash Reservation Status & Data Contract
```typescript
export type ReservationStatus = 
  | 'REQUESTED' 
  | 'CONFIRMED' 
  | 'REJECTED' 
  | 'EXPIRED' 
  | 'CANCELLED' 
  | 'FULFILLED';

export interface ReservationDTO {
  reservationId: string; // UUID
  payoutId: string;
  agentId: string;
  phpAmountMinor: number; // Integer centavos
  status: ReservationStatus;
  expiresAt: string;
  pinAttempts: number;
  pickupAt?: string;
  acknowledgedAt?: string;
  createdAt: string;
}
```

### Settlement Intent Data Contract
```typescript
export type SettlementStatus = 'PENDING' | 'CONFIRMED' | 'FAILED_RETRYABLE';

export interface SettlementIntentDTO {
  payoutId: string;
  approvalActor: string; // Operator ID
  status: SettlementStatus;
  txHash?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Agent & Inventory Data Contract
```typescript
export interface AgentDTO {
  id: string;
  name: string;
  town: string;
  receivingAddress: string; // G...
  operatingHours: string;
  active: boolean;
  inventory: {
    onHandMinor: number;
    heldMinor: number;
    bufferMinor: number;
    availableMinor: number;
  };
}
```

## 2. API Endpoints Specification

| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/api/payouts` | Funder | Create unfunded payout intent |
| `POST` | `/api/payouts/:id/confirm-funding` | Integration / Funder | Confirm on-chain funding transaction |
| `GET` | `/api/agents` | Recipient | List fictional agents (optional query `?town=`) |
| `POST` | `/api/reservations` | Recipient | Request cash hold for a funded payout |
| `POST` | `/api/reservations/:id/confirm` | Agent | Atomically accept reservation and hold cash |
| `POST` | `/api/reservations/:id/reject` | Agent | Decline reservation; no inventory mutation |
| `POST` | `/api/reservations/:id/verify-pickup` | Agent | Verify 6-digit OTP PIN, attest handover |
| `POST` | `/api/reservations/:id/acknowledge` | Recipient | Recipient simulated acknowledgement |
| `POST` | `/api/settlements/:payoutId/release` | Operator | Authorize and submit Soroban contract release |
| `GET` | `/api/payouts/:id/status` | Authorized | Get dual status (cash status + blockchain status) |

## 3. Soroban Smart Contract Interface (`cashready-payout`)

```rust
pub trait CashReadyPayoutTrait {
    // Escrow funds from authorized funder
    fn create_and_fund(
        env: Env, 
        payout_id: u128, 
        asset_sac: Address, 
        amount: i128, 
        funder: Address, 
        operator: Address
    );

    // Operator-only authorized release to fulfilling agent
    fn release(env: Env, payout_id: u128, agent_wallet: Address);

    // Authorized refund to original funder before release
    fn refund(env: Env, payout_id: u128);

    // Query on-chain payout state
    fn get_payout(env: Env, payout_id: u128) -> PayoutState;
}
```
