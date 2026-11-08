# CashReady Architecture Decisions

## 1. Context & Problem Statement
CashReady is a cash-out reservation and remittance settlement prototype built on Stellar Testnet for the Stellar Blockchain Innovation Challenge showcase (November 2026). The prototype demonstrates how a remittance recipient can reserve a cash pickup at a participating agent, complete a simulated cash handover with an OTP PIN, and trigger an operator-authorized release of escrowed on-chain funds (native XLM or Circle Testnet USDC) to the agent's Stellar wallet.

## 2. Frozen Decisions

### Single Codebase & Framework
* **Decision:** Single Next.js App Router (TypeScript + Tailwind CSS) project with a `contracts/` directory for Rust Soroban smart contracts.
* **Rationale:** Eliminates monorepo orchestration overhead and secondary backend services. API routes handle server-side RBAC and database operations directly.

### Separation of Cash Hold and Blockchain Settlement
* **Decision:** Cash reservation state (`REQUESTED`, `CONFIRMED`, `REJECTED`, `EXPIRED`, `CANCELLED`, `FULFILLED`) is completely decoupled from on-chain payment custody state (`CREATED`, `FUNDED`, `RELEASED`, `REFUNDED`).
* **Rationale:** An expired reservation releases only the local database cash hold. It never triggers an automatic on-chain refund. A completed cash pickup marks the cash as `FULFILLED` independently of whether the blockchain release transaction is pending or retryable.

### Deferred Agent Selection (Sequence-Critical)
* **Decision:** The payout is funded on-chain **before** the recipient selects a cash-out agent. The contract stores only the payout ID, asset SAC, amount, original funder, and designated operator. The operator supplies the fulfilling agent's wallet address at the time of authorized release.
* **Rationale:** Allows flexible agent selection by the recipient after remittance funding, rather than locking funds to an agent who may not have cash on hand.

### Supported Assets
* **Decision:** Native Stellar Testnet XLM and Circle Testnet USDC only.
* **Circle Testnet USDC Issuer:** `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`
* **SAC (Stellar Asset Contract):** Exact `C...` contract identifiers derived on Testnet.
* **Units:** On-chain amounts stored as 7-decimal integer base units (`10,000,000` = 1.0 token) and handled as string / `bigint` in TypeScript. Cash amounts stored as integer centavos (`₱15,000 = 1,500,000`).

### Atomic Concurrency & Inventory Guarantees
* **Decision:** PostgreSQL conditional `UPDATE` using atomic transactions (`available = on_hand - held - buffer >= requested`).
* **Rationale:** Ensures two concurrent requests cannot overdraw an agent's cash supply. At most one confirmed cash hold per payout.

### Pickup Verification Security
* **Decision:** 6-digit CSPRNG one-time PIN. The server stores only `HMAC-SHA256(secret, reservationId + ':' + code)`.
* **Rationale:** Constant-time verification, maximum 5 attempts, one-time consumption. Plaintext PINs are never persisted in the database or written to the blockchain.

### Scope Exclusions (Explicit Trade-offs)
* **No Machine Learning:** Predictive cash forecasting and ML models are removed.
* **No Real-world Location/Maps:** Uses static town selector and 3 deterministic fictional agents.
* **No Real FX Conversion:** Payout token-to-PHP amounts are fixed demo parameters.
* **Trusted Operator MVP:** Operator executes the on-chain release transaction from a secure server environment. Not a decentralized proof of physical cash delivery.
