# CashReady — lean engineering playbook (XLM + Circle Testnet USDC)

**Version:** 7 November 2026  
**Target:** Stellar Blockchain Innovation Challenge showcase, **16 November 2026**  
**Team:** Founder/product lead + Engineer 1 (web/database) + Engineer 2 (Stellar/Soroban)  
**Scope:** 100% **Testnet**, fictional payout agents, simulated PHP banknotes, **no ML**, no real remittance provider, no actual USD/PHP conversion.

> **Product promise (prototype):** A recipient can request a specific cash amount at a fictional participating agent. That agent explicitly accepts and records a time-limited cash hold. After simulated pickup and independent operator approval, a *previously funded* Stellar Testnet payout releases to the designated agent wallet. A recipient reservation is not proof that cash physically exists.

## 1. Decisions frozen for the build

| Decision | Chosen design | Reason / what we give up |
|---|---|---|
| Codebase | One Next.js App Router TypeScript/Tailwind project + `contracts/` Rust directory | No multi-package workspace or service scaling |
| API | Next.js Route Handlers + Zod + server-side RBAC | No separate Python/Express backend |
| Database | Managed PostgreSQL + Prisma | Simple transactional reservations; provider dependency |
| Agents | 3 fictional agents; agent-entered inventory; no real network API | No real-world guarantee/partner validation |
| Find agent | Town selector, static labels/list | No Google Maps, GPS or routing convenience |
| Hold | Atomic Postgres conditional update; one active hold per payout | Core reservation integrity retained |
| Pickup | Cryptographically random one-time 6-digit PIN; HMAC verifier; role check; agent attestation + simulated recipient acknowledgement | Not incontrovertible physical delivery evidence |
| Payment | One minimal Soroban contract with **XLM and Circle Testnet USDC** selectable *per payout* | No FX/conversion or multi-currency basket |
| Signer roles | Demo funder signs funding; designated operator signs release; refund constrained by contract policy | Trusted operator required, not a decentralized physical-delivery proof |
| Failure handling | Contract prohibits second release/refund; DB stores settlement intent and reconciles RPC | Basic recovery, not complex arbitration |
| Refund | Explicit authorized refund of an unfulfilled funded payout; never auto-refund when a cash hold expires | Some manual resolution required |
| ML | **Removed** | No predictive ranking, cash forecasting or model evaluation |
| Claim | “Cash reservation confirmation + verifiable Testnet settlement” | Not a production cash guarantee or regulated remittance system |

**Sequence-critical decision:** The payout is funded **before** the recipient selects a cash-out agent. Therefore, do **not** hard-code an agent beneficiary at payout creation. Store only the immutable asset, amount, original funder, and operator. At authorized release, the operator supplies the selected and fulfilled agent wallet. This trusted release authority is an explicit demo trade-off.

**Design rule:** Payment state and cash-reservation state must be independent. An expired reservation releases only the off-chain cash hold, not an on-chain funded payout.

## 2. Exact tech choices and documentation

| Technology | Usage | Documentation |
|---|---|---|
| Next.js App Router | Three role screens + API | https://nextjs.org/docs/app |
| Tailwind CSS | Minimal accessible layout | https://tailwindcss.com/docs |
| PostgreSQL | Atomic inventory holds | https://www.postgresql.org/docs/current/explicit-locking.html |
| Prisma | Schema and migrations | https://www.prisma.io/docs |
| Zod | Validate all API payloads | https://zod.dev |
| `@stellar/stellar-sdk` | Accounts, classic assets, RPC, transaction status | https://stellar.github.io/js-stellar-sdk/ |
| Stellar CLI / Soroban SDK | Compile/test/deploy contract | https://developers.stellar.org/docs/build/smart-contracts |
| Stellar Lab | Verify network and transactions | https://lab.stellar.org |
| Friendbot | Testnet XLM | https://developers.stellar.org/docs/networks/testnet |
| Circle USDC faucet | Circle Testnet USDC | https://faucet.circle.com |
| Circle USDC Stellar reference | Verify the **Testnet** issuer | https://www.circle.com/multi-chain-usdc/stellar |
| Vitest / Playwright | Unit / browser tests | https://vitest.dev ; https://playwright.dev/docs/intro |
| Vercel + managed Postgres | Public hosted demonstration | https://vercel.com/docs |

**USDC asset setup (critical):** Circle's Stellar Testnet USDC is an **issued Stellar asset**, code `USDC` with **Testnet issuer** `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`. This is NOT Circle's mainnet issuer. Verify the identifier against Circle's live reference at deployment time. Obtain Testnet USDC from Circle's faucet **after adding a USDC trustline** to receiving G-addresses. The faucet offers *nonredeemable test assets*, subject to its published rate limits. XLM is required for fees and reserve requirements even when sending USDC. Do not confuse the USDC `G...` classic issuer with the `C...` Stellar Asset Contract (SAC) address used from Soroban. Derive or verify SAC IDs on **Testnet** with the Stellar CLI, and record the results in deployment docs. Both XLM and USDC can be accessed through their asset contracts from Soroban. See https://github.com/stellar/stellar-dev-skill/blob/main/skills/agentic-payments/SKILL.md.

**Amounts:** On-chain XLM and Stellar-issued USDC use seven decimal places; store integer base units (`1 asset unit = 10,000,000 base units`) in Rust as `i128`. Serialize integer amounts as decimal *strings* across JSON/TypeScript boundaries, using `bigint` in application logic. Store PHP cash inventory as integer centavos (`₱15,000 = 1,500,000`). The fiat/payout mapping is a **demo parameter**, not a real exchange rate; never imply test XLM or test USDC is convertible to physical PHP.

## 3. Project structure

```text
cashready/
  app/
    recipient/ agent/ operator/
    api/agents/ api/payouts/ api/reservations/ api/settlements/
  lib/
    auth.ts  db.ts  inventory.ts  reservations.ts
    otp.ts  stellar.ts  assets.ts  validation.ts
  prisma/
    schema.prisma  seed.ts
  contracts/
    cashready-payout/ (Rust Soroban contract + tests)
  scripts/
    setup-testnet.ts  smoke-payout.ts
  docs/
    decisions.md  interfaces.md  test-cases.md
  .env.example
  README.md
```

## 4. Role and authorization matrix

| Action | Funder | Recipient | Assigned agent | Operator |
|---|---:|---:|---:|---:|
| Create/fund payout | ✓ | — | — | — |
| Choose location / request cash reservation | — | ✓ | — | — |
| Confirm/reject hold | — | — | ✓ | — |
| Enter pickup PIN / attest handover | — | — | ✓ | — |
| Acknowledge receipt (demo) | — | ✓ | — | — |
| Approve Soroban release | — | — | — | ✓ |
| Refund under defined cancellation rule | Authorized funder + contract policy | — | — | Authorized resolution if specified |

All permissions must be enforced by the **server**, not only by hiding buttons. Use authenticated seeded demo sessions, never unauthenticated role selection as the server's authorization source. Testnet-only operator secret must remain server-side; never send raw signing keys to client. The sender signs with a wallet or a clearly disclosed, limited demo funder account.

## 5. Domain model, status and cash invariant

**Agent:** id, fictional name, town, active status, receiving Testnet account, inventory.  
**CashInventory:** agent_id unique, on_hand_minor, held_minor, buffer_minor, version/updated_at.  
**Payout:** payout_id, funder_address, selected_agent_address, asset (`XLM` | `USDC`), asset_issuer (for USDC), asset_SAC_id, token_amount_base_units, onchain_payout_id, payout_status (`CREATED`, `FUNDED`, `RELEASED`, `REFUNDED`), funding_tx_hash.  
**Reservation:** reservation_id, payout_id, agent_id, php_amount_minor, status (`REQUESTED`, `CONFIRMED`, `REJECTED`, `EXPIRED`, `CANCELLED`, `FULFILLED`), expires_at, pickup_pin_hmac, pin_attempts, pickup_at, acknowledged_at.  
**SettlementIntent:** unique payout_id, approval_actor, status (`PENDING`,`CONFIRMED`,`FAILED_RETRYABLE`), tx_hash, error, created_at.  
**AuditEvent:** id, actor, action, entity_ref, timestamp, safe metadata.

`available_minor = on_hand_minor - held_minor - buffer_minor`.

Use a transaction and conditional update that only increments `held_minor` when `on_hand_minor - held_minor - buffer_minor >= requested_amount`; insert the confirmed reservation and event in the SAME transaction. Unique constraint or transaction logic prevents two active confirmed reservations for one payout. Upon pickup: decrement **both** held and on_hand once; on cancel/expiry: decrement held once. Do not mutate `on_hand` for rejected requests. Never permit negative inventory through API actions. If the agent changes reported on-hand cash, enforce that it is still >= `held + buffer` or flag and require an operator resolution.

### State invariants

- No accepted hold before payout is confirmed `FUNDED` on Testnet.
- One payout has at most one active `CONFIRMED` cash hold.
- `CONFIRMED -> FULFILLED` only with valid PIN, assigned agent, recipient demo acknowledgement, and successful atomic inventory update.
- `CONFIRMED -> EXPIRED/CANCELLED` releases the cash hold once; payout remains `FUNDED`.
- `FULFILLED` does not imply `RELEASED`; represent `SETTLEMENT_PENDING` separately.
- Contract never releases or refunds more than once, and never permits mutation of asset or amount after funding.

## 6. Happy-path sequence

```mermaid
sequenceDiagram
  participant F as Funder
  participant W as CashReady web/API
  participant S as Soroban/Testnet
  participant R as Recipient
  participant A as Agent
  participant O as Operator
  F->>W: Create payout(asset XLM/USDC, amount, agent)
  W->>S: Authenticated create_and_fund (asset SAC)
  S-->>W: Confirmed funding + transaction ID
  W-->>R: Funded payout available for reservation
  R->>W: Request agent / pickup window
  W->>A: Pending request
  A->>W: Confirm (inventory conditional transaction)
  W-->>R: Confirmation + one-time pickup PIN
  R->>A: Arrive and show code (simulated)
  A->>W: Verify PIN, attest cash handover
  R->>W: Acknowledge simulated receipt
  O->>W: Approve settlement
  W->>S: Operator-authorized release(payout_id)
  S-->>W: Confirmed tx hash
  W-->>R: Collected; settlement completed
```

**Important:** In the hackathon build, the agent is fictional and no real physical cash changes hands. The real on-chain steps are Testnet funding and release.

## 7. Recommended contract surface

```text
create_and_fund(payout_id, asset_sac, amount_base_units, funder, operator)
release(payout_id, agent_wallet) // operator picks a confirmed agent when releasing
refund(payout_id)            // explicit, constrained cancellation path
get_payout(payout_id)
```

`create_and_fund` must transfer the selected asset from an appropriately authorized funder to contract custody; do not mark `FUNDED` until this succeeds. Contract recognizes only Testnet XLM SAC and Circle Testnet USDC SAC and rejects all other assets (derive/verify exact SAC IDs at setup). `release` uses the stored asset and amount; the **operator chooses the confirmed agent’s destination wallet at release** after the reservation is fulfilled. The trusted operator can redirect funds, which is an explicit MVP custody assumption. A production contract could require an on-chain registered-agent allowlist or signed recipient approval. `refund` returns the same asset to the original funder subject to explicit authorization and dispute/cancellation policy; no automatic refund on hold expiry. Contract state is one of `FUNDED`, `RELEASED`, `REFUNDED` and disallows the double-transition. The contract cannot verify PHP notes, pickup PINs, or operator inventory. Include contract tests for both assets, unauthorized release, replay, refund after release, and unsupported asset.

**Security note:** A designated trusted operator is a deliberate MVP tradeoff. Avoid calling an agent PIN "trustless proof". For production, independent confirmations and regulated custody/partner agreements are essential.

## 8. Minimal APIs and acceptance

| Route | Role | Behavior / response |
|---|---|---|
| `POST /api/payouts` | funder | Create **unfunded** intent; validates chosen asset, units, asset, amount; return id and transaction instructions (agent chosen later) |
| `POST /api/payouts/:id/confirm-funding` | funder/operator integration | Verify the actual Testnet contract event/tx, asset, amount and payout ID before marking funded |
| `GET /api/agents?town=` | recipient | List three fictional active agents, reported cash and hours; no real-location claims |
| `POST /api/reservations` | recipient | Create pending request for one funded payout |
| `POST /api/reservations/:id/confirm` | assigned agent | Atomic inventory hold or 409 insufficient cash; idempotent |
| `POST /api/reservations/:id/verify-pickup` | assigned agent | PIN check, limited attempts, simulated recipient acknowledgement, atomic `FULFILLED` |
| `POST /api/settlements/:payoutId/release` | operator | Persist settlement intent, invoke contract, reconcile confirmed receipt; duplicates harmless |
| `GET /api/payouts/:id/status` | authorized participants | Separate cash status and blockchain status, include tx links |

`Zod` validates request shapes; roles are checked server-side; every money/hold mutation uses idempotency keys. All amounts sent over JSON as strings of integer minor/base units. Reject negative values and payouts without funded proof. `POST /api/reservations/:id/expire` can be an operator/demo action plus server-side lazy expiry, if a scheduled worker is omitted.

## 9. Pickup code and attestation

Generate a six-digit code using a CSPRNG; the server stores **HMAC-SHA256(secret, reservationId + ':' + code)**, never the code itself. The recipient is shown the code only after agent hold confirmation, and it must expire with the cash reservation. Agent API compares HMAC in constant time, enforces attempt counter and appropriate rate limiting, and consumes the code on successful use. Recipient must separately confirm simulated receipt before operator settlement approval. Record actor IDs, timestamps and reservation ID in an off-chain audit event. No pickup code, real identity, or recipient location is written to the public ledger. Optional SHA256 of a canonical fulfillment event is a commitment to record contents, **not** a proof of physical delivery; defer for MVP.

## 10. Settlement reconciliation

On operator release, write `SettlementIntent(PENDING, payout_id unique)` **before** broadcasting. Only authorized operator signs the Soroban call. Store the tx hash (when known) and poll/verify actual chain success. A client timeout is not proof of failure: query by hash and/or contract payout state before attempting anything again. Retry safely using the same payout ID. The contract must reject a second release, even if the DB is replayed. If cash pickup was completed but on-chain transaction failed, show `cash=FULFILLED`, `settlement=PENDING/FAILED_RETRYABLE`; never reverse actual cash collection as a software workaround. A cancellation of a cash hold must not auto-refund a funded payout. Test the refund path separately.

## 11. Exact AI coding-agent instructions

**Prepend this wrapper to every prompt:**

> Implement only the specified CashReady ticket in the existing repository. Read `docs/decisions.md` and `docs/interfaces.md` first. MVP uses Next.js TypeScript, Postgres/Prisma, Rust Soroban and Stellar **Testnet only**, supporting both **native XLM and Circle Testnet USDC**. Never add ML, maps, fiat FX, real agents, provider APIs or a custom token. Preserve independent reservation and payout state machines. Server-side RBAC and Zod are mandatory. Asset config must validate Testnet issuer and SAC IDs, with no mainnet substitutions. Never expose private keys or real PII. Add relevant tests; run lint/typecheck/cargo test; report changed files, tests, assumptions, blockers, and links to docs used. Do not claim physical cash has been cryptographically verified.

**Prompt E1 / foundation:**

> Scaffold a single Next.js App Router TypeScript Tailwind application. Add `/recipient`, `/agent`, `/operator`, API Route Handlers, Prisma/Postgres, demo auth sessions with server-side RBAC and `.env.example`. Add `docs/decisions.md` describing chosen payout roles and immutability. Include scripts for seed and tests. No monorepo and no second backend.

**Prompt E1 / ledger:**

> Create Agent, Inventory, Payout, Reservation, SettlementIntent and AuditEvent Prisma models. Implement an atomic Postgres cash hold using one transaction, conditional `UPDATE` ensuring `on_hand-held-buffer >= amount`, uniqueness for one confirmed hold per payout, and tests with two concurrent requests for the last available cash. Fulfillment decrements held and on_hand once; expiry decrements held once. Reject inconsistent manual balance changes. Use integer PHP centavos.

**Prompt E1 / pickup:**

> Implement agent-confirmed reservation with a 6-digit CSPRNG code displayed to recipient only after confirmation. Store HMAC-SHA256 verification (server secret, reservation-scoped), enforce expiry, five attempts maximum and one-time use. Require assigned agent auth, recipient demo acknowledgement, and an event record before operator approval. Add tests for wrong PIN, replay, expiry and unauthorized agent.

**Prompt E2 / assets:**

> Create a Stellar Testnet setup script that generates/funds limited demo accounts with Friendbot XLM, adds USDC trustlines using Circle TESTNET issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`, and documents manual Circle Testnet faucet steps. Validate account XLM reserves, receipt of USDC, SAC contract IDs for native XLM and Circle USDC, and public network links. Do not print secrets or claim Testnet USDC is redeemable. Keep asset decimal amounts as bigint/base-unit strings.

**Prompt E2 / contract:**

> Implement minimal Rust Soroban payout escrow on Testnet. Asset allowlist is native XLM SAC or Circle Testnet USDC SAC; selected asset and amount are immutable for each payout, but the destination agent is chosen only after the physical reservation is fulfilled. `create_and_fund` must custody funds atomically with signer auth; `release(payout_id, agent_wallet)` only designated operator and only once; `refund` explicit authorization and only before release; query payout state. Add Rust tests for both assets, unsupported asset, insufficient funds, unauthorized signer, duplicate release, and refund-after-release.

**Prompt E1+E2 / integration:**

> Wire the frontend payout intent and funded transaction verification to the contract for either XLM or USDC. Block reservations until funding is verified. After PIN/acknowledgement and operator approval, persist a unique settlement intent, submit authorized Soroban release, reconcile RPC status and display tx link. Maintain cash status independent of chain status. Add smoke tests for both assets and retry/double-click failure.

**Prompt E1+E2 / showcase:**

> Create deterministic fictional agent seeds: A lacks cash, B can hold request, C offline. Provide a one-command local demo reset script, safe mock PHP ledger, testnet XLM/USDC asset selector, contract address, explorer links, critical tests, README, and a clear video storyboard. Clearly label simulated cash pickup and nonredeemable Testnet assets.

## 12. Two-engineer backlog gates

**Gate A — Interface freeze (Nov 7–8):** E1 and E2 bring `docs/interfaces.md`, type shapes (`asset`, `token_amount_base_units`, `payout_id`, `operator_wallet`, `release_agent_wallet` (selected after funded payout)), wallet authorization responsibilities, exact Circle issuer and verified SAC. The founder reviews tradeoffs; **do not code beyond scaffolding if unclear**.

**Gate B — Asset funding proof (Nov 9–10):** E2 shows **real Testnet XLM and Circle USDC** balances/funding tx, E1 shows atomic reservation and role screens. A USDC trustline failure must be diagnosed, not silently replaced with a custom "USDC" token.

**Gate C — End-to-end integration (Nov 11–12):** One complete pickup and operator release for each asset, plus a retry. Freeze scope afterward. If a feature cannot ship, present a smaller honest flow, not a simulated blockchain transaction.

**Gate D — QA and submission (Nov 13–15):** Critical tests, deployment, working URLs, publicly accessible repo/README, one-minute functional demo video, trifold, presentation. Showcase November 16.

### Daily founder check-in protocol

Engineers send **once per day**: (1) tickets done with PR/commit link; (2) screenshots or chain tx hash; (3) tests run and failures; (4) single biggest blocker; (5) next 24-hour plan. Bring the checkpoint report into this chat; review interface mismatch, payment custody, USDC availability, and scope cuts. Founder resolves product questions the same day. If blocked on USDC faucet, E2 continues XLM contract/testing while troubleshooting; do not substitute counterfeit USDC without explicitly labeling it as a mock and reducing the USDC claim.

### Escalate immediately if

- Asset issuer/SAC address or network cannot be verified.
- Funding is shown successful without on-chain evidence.
- A reservation can be confirmed twice or overdraw inventory.
- An agent alone can release on-chain funds.
- Settlement can happen more than once for a payout.
- Agent's wallet requires a missing USDC trustline.
- A code path conflates physical cash receipt and digital settlement.

## 13. Critical acceptance tests

| Test | Expected result |
|---|---|
| Two concurrent ₱10k reservations against only ₱13k free | Exactly one accepted |
| Agent without sufficient cash | 409; no funds or held amount mutated |
| Same confirm/expire/fulfill request repeated | No duplicate hold/release/deduction |
| Incorrect / expired / reused PIN | Reject; no payout approval |
| Wrong agent / recipient attempts operator endpoint | 403 |
| Payout not funded on-chain | No confirmed cash hold |
| XLM funded, authorized release | No — XLM reaches operator-selected confirmed agent wallet, tx verified |
| Circle USDC funded, authorized release | Issuer and trustline correct; agent receives Testnet USDC |
| Operator double-clicks release | Contract disallows second release |
| On-chain failure after cash marked collected | Cash `FULFILLED`, settlement `PENDING`; safe reconciliation |
| Cash hold expires | Only hold released; funded payout remains funded |
| Refund after release | Contract rejects |

## 14. Submission checklist

- [ ] Live Testnet app URL, clear demo-only disclaimer
- [ ] Deployed Soroban contract ID(s) and working explorer links
- [ ] XLM and Circle Testnet USDC test evidence (funder, contract, agent)
- [ ] Public GitHub repo and setup/run README
- [ ] `.env.example`, no secrets committed
- [ ] Runnable key tests and seed/reset process
- [ ] 60-second video of functioning prototype at public URL
- [ ] Three-minute showcase narrative and trifold board
- [ ] Document limits: fictional agents, simulated physical notes, no real FX/off-ramp, trusted attestation

## 15. Source references and verification notes

1. Challenge PDF supplied to the team: Problem Statement 3, showcase deliverables on pages 1–5.
2. Stellar: https://developers.stellar.org/docs/build/smart-contracts and https://stellar.github.io/js-stellar-sdk/ .
3. Circle Stellar USDC: https://www.circle.com/multi-chain-usdc/stellar .
4. Circle faucet: https://faucet.circle.com .
5. Stellar developer skill asset reference: https://github.com/stellar/stellar-dev-skill/blob/main/skills/agentic-payments/SKILL.md .
6. PostgreSQL row locking: https://www.postgresql.org/docs/current/explicit-locking.html .

**Accuracy note:** This playbook specifies a proposed Testnet implementation and design choices, not a deployed system. Reconfirm live SDK/CLI versions, asset identifiers and faucet terms at implementation time. Circle Testnet USDC is different from mainnet USDC and carries no redemption guarantee.
