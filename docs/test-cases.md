# CashReady Critical Acceptance Tests & Verification Matrix

This document maps directly to **Section 13 (Critical acceptance tests)** of the CashReady Playbook.

## 1. Matrix of Critical Tests

| # | Test Scenario | Preconditions | Execution / Trigger | Expected Result | Verified By |
|---|---|---|---|---|---|
| 1 | **Two concurrent ₱10k reservations against ₱13k free** | Agent available cash is ₱13,000 | Concurrent requests submitted simultaneously for ₱10,000 each | Exactly **one** reservation accepted (`CONFIRMED`); second rejected (`409 Insufficient cash`) | `tests/inventory-logic.test.ts` & DB atomic update |
| 2 | **Agent without sufficient cash** | Agent on-hand ₱5k, buffer ₱3k (available ₱2k) | Recipient requests ₱10k hold | `409 Conflict`; no held or on-hand mutation | `app/api/reservations/[id]/confirm` |
| 3 | **Idempotent confirm/expire/fulfill request repeated** | Reservation already `CONFIRMED` | Duplicate `POST /confirm` received | Returns 200 OK immediately; no duplicate hold or inventory deduction | `app/api/reservations/[id]/confirm` |
| 4 | **Incorrect / expired / reused PIN** | Reservation `CONFIRMED` with OTP | Candidate enters invalid code or tries reusing consumed code | Returns `401 Unauthorized`; attempts counter decremented; rejects release | `tests/otp-security.test.ts` & `verify-pickup` |
| 5 | **Wrong agent / recipient attempts operator endpoint** | Session role is `recipient` or `agent` | Calls `POST /api/settlements/:id/release` | Strict `403 Forbidden` enforced by server-side RBAC | `tests/rbac-authorization.test.ts` |
| 6 | **Payout not funded on-chain** | Payout status is `CREATED` | Recipient attempts `POST /api/reservations` | Rejects with `400 Bad Request`; cash hold blocked | `app/api/reservations` |
| 7 | **XLM funded, authorized release** | Payout funded with Testnet XLM; physical pickup `FULFILLED` | Operator submits release with agent G... address | Contract transfers XLM to agent wallet; status `RELEASED` | `app/api/settlements` & Soroban release |
| 8 | **Circle USDC funded, authorized release** | Payout funded with Circle Testnet USDC; physical pickup `FULFILLED` | Operator submits release with agent G... address | Agent wallet receives Circle Testnet USDC; tx hash recorded | `app/api/settlements` & Soroban release |
| 9 | **Operator double-clicks release** | Settlement intent already `CONFIRMED` | Operator clicks release button twice | Idempotent; duplicate release blocked; contract disallows double release | `app/api/settlements` & Soroban contract |
| 10 | **On-chain failure after cash marked collected** | Cash pickup `FULFILLED`; RPC timeout/network drop | Soroban transaction fails | Cash remains `FULFILLED`; settlement marked `FAILED_RETRYABLE`; no reversal of physical pickup | `lib/inventory.ts` & `settlements` |
| 11 | **Cash hold expires** | Reservation expired past 15-minute window | Expiry triggered | Only `heldMinor` is decremented; funded payout remains `FUNDED` | `lib/inventory.ts` |
| 12 | **Refund after release** | Payout already `RELEASED` | Funder attempts refund | Soroban contract and server reject refund attempt | Soroban contract invariant |

## 2. Automated Test Coverage
- **Unit & Security Tests:** `tests/otp-security.test.ts` (HMAC validation, replay attack rejection, centavo/base-unit conversions).
- **RBAC Tests:** `tests/rbac-authorization.test.ts` (401 on missing session, 403 on role mismatch, role passing).
- **Concurrency & Inventory Math:** `tests/inventory-logic.test.ts` (Available formula, single-winner race condition simulation).
