# CashReady — Lean Engineering Prototype (XLM + Circle Testnet USDC)

> **Stellar Blockchain Innovation Challenge (November 2026)**  
> Prototype for remittance cash-out reservations and smart-contract escrow settlement on Stellar Testnet.

---

## 1. Prototype Scope & Limitations
- **100% Stellar Testnet:** Assets are strictly nonredeemable testnet assets (native Testnet XLM and Circle Testnet USDC).
- **Simulated PHP Cash:** Agent physical cash inventory and pickup acknowledgements are simulated; no real Philippine Peso notes change hands.
- **No Machine Learning:** Predictive cash flow and forecasting models are explicitly removed to keep the architecture lean and deterministic.
- **Trusted Operator MVP:** Settlement release on-chain is executed by an authorized server-side operator after recipient pickup attestation.

---

## 2. Supported Stellar Assets
| Asset | Type | Network / Issuer | SAC Contract ID (Testnet) |
|---|---|---|---|
| **XLM** | Native Stellar Asset | Stellar Testnet | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| **USDC** | Circle Issued Asset | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` | Derived via Soroban CLI |

*Note: Circle Testnet USDC issuer differs from mainnet and requires a trustline before receiving tokens.*

---

## 3. Application Structure & Roles
- **`/recipient` (Recipient Portal):** Browse fictional agents by town (Manila, Cebu, Davao), request a time-limited cash hold on a funded remittance, view 6-digit OTP code, and acknowledge simulated cash collection.
- **`/agent` (Agent Desk):** Point-of-presence terminal. Accept reservations via atomic conditional database updates (`on_hand - held - buffer >= requested`), verify PIN with constant-time HMAC-SHA256, and attest cash handover.
- **`/operator` (Operator Console):** Independent settlement authority. Inspect fulfilled physical pickups, select confirmed agent destination wallet, and release escrowed on-chain funds.

---

## 4. Key Architectural Invariants
1. **Decoupled State Machine:** On-chain payment custody state (`CREATED`, `FUNDED`, `RELEASED`, `REFUNDED`) is independent of cash reservation state (`REQUESTED`, `CONFIRMED`, `FULFILLED`, `EXPIRED`, `CANCELLED`). Expired cash reservations release only the local cash hold, never an on-chain funded payout.
2. **Deferred Agent Beneficiary:** Payouts are funded before an agent is selected. The operator designates the fulfilling agent's wallet at release time.
3. **Atomic Concurrency Guarantee:** Cash holds use conditional database updates to ensure concurrent requests cannot overdraw available inventory.
4. **Zero Raw PIN Storage:** Only `HMAC-SHA256(secret, reservationId + ':' + code)` is saved; 5 attempts maximum with rate limiting.

---

## 5. Getting Started

### Prerequisites
- Node.js (v20+ or v22 LTS)
- PostgreSQL database

### Setup
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Generate Prisma Client and seed database
npx prisma generate
npx prisma db push
npm run prisma:seed

# 4. Run automated test suite
npm test

# 5. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.
