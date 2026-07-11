# Billing / Partner Platform — §22 Test Matrix

Track E (pure financial domain logic, `src/billing/domain/**`) owns the LOGIC rows below.
Status legend:

- **AUTOMATED-PASS (n)** — covered by n deterministic vitest cases, green in `npx vitest run`.
- **PENDING-INTEGRATION** — the pure logic is tested; the end-to-end wiring (DB, Edge
  Function, Stripe object) belongs to another track/phase.
- **BLOCKED-EXTERNALLY** — cannot be executed until an external dependency (Nicolas /
  Stripe Sandbox) is delivered.

Numbering note: the §22 family numbers come from the master v1.0 FINAL spec (external to
this repo). Rows are grouped by the families assigned to Track E in the slice brief
(22.7 partially, 22.9, 22.10, 22.11, 22.12, 22.15 logic rows, plus refund/dispute and
netting). Orchestrator: adjust family headers if the master spec numbers differ.

Domain suite totals: **9 test files, 324 tests, all passing** (`src/billing/domain/*.test.ts`).

---

## §22.7 — 15-month benefit + conversion (Track E scope: classification + non-stacking logic)

| Case | Module / test file + name | Status |
|---|---|---|
| 15-month initial period classifies as ONE annual commission (C3) | `commissionRules.ts` / `commissionRules.test.ts` — "C3: the 15-month initial payment classifies as ONE annual commission" | AUTOMATED-PASS (1) |
| Conversion payment commissions at annual cadence, ONCE (C5) | `commissionRules.test.ts` — "conversion payment commissions ONCE" + allowed-when-first cases | AUTOMATED-PASS (3) |
| One 15-month benefit per qualifying initial annual purchase (§4.6 / A8) | `attribution.ts` / `attribution.test.ts` — "qualifying initial annual purchase → ONE 15-month benefit" | AUTOMATED-PASS (1) |
| Benefit on qualifying conversion to annual (§4.6) | `attribution.test.ts` — "qualifying conversion to annual → benefit" | AUTOMATED-PASS (1) |
| No second-code stacking on the same subscription (§4.6) | `attribution.test.ts` — "NO second code stacking on the same subscription" | AUTOMATED-PASS (1) |
| No repeat on renewals (§4.6) | `attribution.test.ts` — "NO repeat on renewals" | AUTOMATED-PASS (1) |
| No cancel-and-rebuy repeat (kind + lifetime prior use) (§4.6) | `attribution.test.ts` — "NO cancel-and-rebuy repeat" (2 cases) | AUTOMATED-PASS (2) |
| Partner's own free entitlement not eligible (§4.6) | `attribution.test.ts` — "partner's own free entitlement is NOT eligible" | AUTOMATED-PASS (1) |
| Invite-trial users ARE eligible buying annual through a partner (§4.6) | `attribution.test.ts` — invite-trial eligibility (2 cases incl. conversion) | AUTOMATED-PASS (2) |
| Refusal-order determinism + immutable decisions | `attribution.test.ts` — order + frozen cases | AUTOMATED-PASS (2) |
| Stripe Subscription Schedule execution of the 15-month phase | Track F (`billing-stripe-surface`) — Edge Function sources | PENDING-INTEGRATION |
| Schedule behavior against real Sandbox prices | — | BLOCKED-EXTERNALLY (Sandbox price IDs from Nicolas) |

## §22.9 — Commission rates, classification, refunds/disputes (logic rows)

| Case | Module / test file + name | Status |
|---|---|---|
| All 12 locked rates (product × cadence × tier), exact cents (C1) | `commissionRules.ts` / `commissionRules.test.ts` — `it.each` "C1: rate table v1 — all 12 locked rates" | AUTOMATED-PASS (12) |
| Rate snapshot immutability, version pin, unknown version typed error | `commissionRules.test.ts` — snapshot/version cases | AUTOMATED-PASS (4) |
| Commission keyed by cadence, never monetary variant (C2) | `commissionRules.test.ts` — "launch/founding/standard price variants share the cadence rate" | AUTOMATED-PASS (1) |
| Each 12-month renewal = one annual commission (C4) | `commissionRules.test.ts` — "each later 12-month renewal classifies as one annual" | AUTOMATED-PASS (1) |
| Commissionable kinds: first monthly / monthly renewal / first annual-or-15m / annual renewal / conversion (C5) | `commissionRules.test.ts` — `it.each` kinds | AUTOMATED-PASS (5) |
| Typed refusals: failed/incomplete/void/unpaid, zero-value, free partner entitlement, free invite access, self-referral, duplicate, fraud (C6) | `commissionRules.test.ts` — refusal cases | AUTOMATED-PASS (10) |
| Refusal precedence deterministic | `commissionRules.test.ts` — "refusal precedence" | AUTOMATED-PASS (1) |
| Full refund → full reversal (R1) | `refundAdjustments.ts` / `refundAdjustments.test.ts` — "R1: full refund → full reversal" | AUTOMATED-PASS (1) |
| Proportional reversal round-half-up incl. exact-half, thirds, zero (R2) | `refundAdjustments.test.ts` — proportional cases + `types.test.ts` divideRoundHalfUp | AUTOMATED-PASS (12) |
| Cumulative cap: reversals never exceed original commission; many partials (R3) | `refundAdjustments.test.ts` — cap + accumulation cases | AUTOMATED-PASS (3) |
| Append-only: entry never mutated, frozen adjustments (R4) | `refundAdjustments.test.ts` — "R4: append-only" | AUTOMATED-PASS (1) |
| Dispute lost = full reversal (of remainder) (R5) | `refundAdjustments.test.ts` — dispute-lost cases | AUTOMATED-PASS (4) |
| Dispute won reinstates ONCE, idempotent by source event id (R6) | `refundAdjustments.test.ts` — reinstatement cases | AUTOMATED-PASS (6) |
| Duplicate source-event guard on refunds/disputes | `refundAdjustments.test.ts` — duplicate cases | AUTOMATED-PASS (2) |
| Refund webhook → ledger write path | Track F webhook handlers + Track D schema | PENDING-INTEGRATION |

## §22.10 — Tier snapshots (Gold 100 / Elite override)

| Case | Module / test file + name | Status |
|---|---|---|
| 99 → standard, 100 → gold, 101 → gold boundaries (T1/T2) | `tierSnapshots.ts` / `tierSnapshots.test.ts` — boundary cases | AUTOMATED-PASS (4) |
| Threshold configurable constant (default 100) | `tierSnapshots.test.ts` — configurable threshold + default pin | AUTOMATED-PASS (2) |
| Eligibility: attributed, real other customer, paid entitlement, valid status, fraud, cancel-at-period-end until access ends, past-due grace (T3) | `tierSnapshots.test.ts` — `isEligibleReferredSubscription` cases | AUTOMATED-PASS (17) |
| Combined Home+Pro count, duplicate exclusion, mixed lists (T3) | `tierSnapshots.test.ts` — `countEligibleReferredSubscriptions` cases | AUTOMATED-PASS (3) |
| Elite override precedence + start-inclusive/end-exclusive window + Madrid snapshot instant (T4) | `tierSnapshots.test.ts` — override cases | AUTOMATED-PASS (8) |
| Snapshot pure/idempotent/immutable, calculationVersion pinned (T5) | `tierSnapshots.test.ts` — purity cases | AUTOMATED-PASS (2) |
| Month binding: entries use THAT month's snapshot, no fallback (T6) | `tierSnapshots.test.ts` — `selectSnapshotForMonth` cases | AUTOMATED-PASS (2) |
| Input validation (counts, thresholds) | `tierSnapshots.test.ts` — RangeError cases | AUTOMATED-PASS (1) |
| Monthly snapshot job persisting rows | Track D schema + orchestrated cron Edge Function | PENDING-INTEGRATION |

## §22.11 — Hold calendar (Europe/Madrid) + payout netting

| Case | Module / test file + name | Status |
|---|---|---|
| Earned in M → eligible 1st of M+3 (Jan→Apr 1, Feb→May 1, Dec→Mar 1 next year) (H1) | `holdCalendar.ts` / `holdCalendar.test.ts` — eligibility cases | AUTOMATED-PASS (3) |
| Calendar arithmetic, never 60 days (H2) | `holdCalendar.test.ts` — same-month single instant + non-fixed duration | AUTOMATED-PASS (2) |
| Madrid month membership from UTC (2026-03-31T22:30Z → April → Jul 1) (H3) | `holdCalendar.test.ts` — locked example + contrast + boundaries | AUTOMATED-PASS (8) |
| Madrid midnight as UTC instant, DST both directions, leap year, year boundary (H4) | `holdCalendar.test.ts` — madridMidnightUtcMs + offset + wall-clock cases | AUTOMATED-PASS (14) |
| `monthKeyMadrid` exposed for snapshots/batches | `holdCalendar.test.ts` — monthKey cases | AUTOMATED-PASS (8) |
| Month-key parsing/addMonths validation | `holdCalendar.test.ts` — parse/add cases | AUTOMATED-PASS (10) |
| Threshold boundaries 2499 / 2500 / 2501 (default 2500 cents) (P2) | `payoutNetting.ts` / `payoutNetting.test.ts` — boundary cases | AUTOMATED-PASS (4) |
| Gross + adjustments netting (P1); positive carry-forward accumulation (P2) | `payoutNetting.test.ts` — netting cases | AUTOMATED-PASS (3) |
| Negative net carries forward and blocks until net > 0 AND ≥ threshold (P3) | `payoutNetting.test.ts` — negative-carry cases | AUTOMATED-PASS (2) |
| Net zero → no transfer (P4); empty batch; reinstatements | `payoutNetting.test.ts` | AUTOMATED-PASS (3) |
| Immutable line, deterministic, integer-cents validation (P5) | `payoutNetting.test.ts` | AUTOMATED-PASS (4) |
| Deterministic idempotency key (batchMonth+partnerId+currency+mode) (P6) | `payoutNetting.test.ts` — key builder cases | AUTOMATED-PASS (7) |
| Lifecycle state machine: happy path + edge states; exactly 39 legal / 130 illegal transitions; typed errors (P7) | `payoutNetting.test.ts` — state machine cases | AUTOMATED-PASS (27) |
| Batch job with advisory lock writing `partner_payout_items` | Track D schema + orchestrated Edge Function | PENDING-INTEGRATION |
| Real Stripe Transfers with idempotency keys | — | BLOCKED-EXTERNALLY (Connect activation + keys) |

## §22.12 — Partner codes + attribution

| Case | Module / test file + name | Status |
|---|---|---|
| Normalization: trim/uppercase/accents (é→E)/spaces, deterministic (PC1) | `partnerCodes.ts` / `partnerCodes.test.ts` — normalization cases | AUTOMATED-PASS (4) |
| Display length 5–16 boundaries (PC2) | `partnerCodes.test.ts` — length cases | AUTOMATED-PASS (1) |
| Banned words: protected system words + offensive list + custom list (PC3) | `partnerCodes.test.ts` — banned cases | AUTOMATED-PASS (4) |
| Case-insensitive validation (PC4) | `partnerCodes.test.ts` — case cases | AUTOMATED-PASS (2) |
| Suggestion generator: readable base, numeric suffix ONLY on collision, truncation, source fallback (PC6) | `partnerCodes.test.ts` — suggestion cases | AUTOMATED-PASS (8) |
| Charset refusals + immutability | `partnerCodes.test.ts` | AUTOMATED-PASS (4) |
| 30-day window incl. exact-boundary and post-payment click (A1) | `attribution.ts` / `attribution.test.ts` — window cases | AUTOMATED-PASS (5) |
| Explicit valid code overrides unconverted cookie; invalid/late code does NOT (both directions) (A2) | `attribution.test.ts` — override cases | AUTOMATED-PASS (5) |
| Paid lock never stolen by later code/cookie (A3/A5) | `attribution.test.ts` — lock cases | AUTOMATED-PASS (3) |
| Unattributed monthly → annual conversion with code attributes (A4) | `attribution.test.ts` | AUTOMATED-PASS (1) |
| One partner per payment (A6); self-referral typed rejection + evidence-discard fallbacks (A7) | `attribution.test.ts` — self-referral cases | AUTOMATED-PASS (5) |
| No evidence / immutability / determinism | `attribution.test.ts` | AUTOMATED-PASS (2) |
| Signed cookie plumbing + `referral_attributions` persistence | Track D schema + Track F surface | PENDING-INTEGRATION |

## §22.15 — Invite codes (logic rows)

| Case | Module / test file + name | Status |
|---|---|---|
| Format PIH-XXXX-XXXX, injectable RNG (pure), unambiguous alphabet (no 0/O/1/I/L) (I1) | `inviteCodes.ts` / `inviteCodes.test.ts` — generation cases | AUTOMATED-PASS (7) |
| Case-insensitive normalization; separators; typed refusals; distinct from partner codes (I1) | `inviteCodes.test.ts` — normalization cases | AUTOMATED-PASS (12) |
| State machine available→reserved→sent→redeemed / expired / revoked; exactly 11 legal / 25 illegal; typed errors (I2) | `inviteCodes.test.ts` — state machine cases | AUTOMATED-PASS (18) |
| Redemption guard: auth, verified email, exact normalized email match, non-terminal code, one-trial-per-lifetime (+admin override), not partner, no active paid entitlement; code left unconsumed (I4) | `inviteCodes.test.ts` — guard cases | AUTOMATED-PASS (14) |
| Grant spec {home, 30d default configurable, no autorenew, no Stripe objects, no commission} (I5) | `inviteCodes.test.ts` — grant cases | AUTOMATED-PASS (2) |
| Slot keeps exactly one live code; replacement on redeem/revoke/expiry; anomaly reporting; collision avoidance; 5-slot default pool repair (I3/I6) | `inviteCodes.test.ts` — pool cases | AUTOMATED-PASS (12) |
| Admin UI + persistence of slots/codes | Phase H remainder (post Track D integration) | PENDING-INTEGRATION |
| Invite email delivery | — | BLOCKED-EXTERNALLY (email provider decision) |

---

## Resolved spec ambiguities (Track E, stated explicitly)

1. **Duplicate-source-event guard on refunds/disputes**: the spec requires idempotency by
   source event id for dispute reinstatements (R6); Track E applies the same guard to
   refund and dispute reversals so replayed Stripe events can never double-append.
2. **Past-due grace** (tier eligibility T3): grace = the already-paid access window — a
   `past_due` subscription counts while `now < paidAccessEndsAt`, mirroring the app's
   existing access semantics (`src/access/subscription.ts`: past_due → paid until period
   end). No separate grace constant invented.
3. **Commission lifecycle edge set** (P7): the spec names the edge states
   (reversed/partially_reversed/offset/failed/manual_review) but not every edge. The
   exact legal set (39 transitions, documented in `payoutNetting.ts`) is: reversal states
   reachable from earned/held/eligible/batched; partially_reversed may resume
   (eligible/batched) or degrade (reversed/offset); failed (transfer/bank layer) retries
   to eligible or escalates to manual_review; manual_review resolves to
   earned/held/eligible/reversed/offset/failed; paid/reversed/offset terminal.
4. **Banned-word matching** (PC3): containment on the normalized code (not exact match) —
   conservative for a public namespace; false positives are acceptable because the
   suggestion generator produces alternatives.
5. **Self-referring evidence** (A7): discarded, remaining evidence is considered; if only
   self evidence existed the decision is a typed `self_referral` refusal.
6. **Attribution window boundary** (A1): window is `[click, click + 30d)` — a payment at
   exactly +30 days is expired.
7. **Elite override window** (T4): start-inclusive, end-exclusive, evaluated at the Madrid
   month-start snapshot instant.
8. **Invite redemption states** (I4): redeemable from `reserved` or `sent` (both hold a
   reservation email); `available` has no reservation and refuses as `code_not_redeemable`.
9. **Batch modes** (P6): idempotency-key `mode` is typed `'live' | 'dry_run'`.

---

## Placeholder sections — other tracks (to be filled by the owning track / orchestrator)

### §22.x — Checkout & portal sessions (Track F) — PLACEHOLDER

| Case | Module / test | Status |
|---|---|---|
| _to be filled by Track F (checkout session Edge Function, eligibility, price catalog validation)_ | — | — |

### §22.x — Webhook durability & event matrix (Track F) — PLACEHOLDER

| Case | Module / test | Status |
|---|---|---|
| _to be filled by Track F (signature verification, duplicate/out-of-order tolerance, `stripe_webhook_events` state machine)_ | — | — |

### §22.x — Stripe Connect onboarding & transfers (Track F + external) — PLACEHOLDER

| Case | Module / test | Status |
|---|---|---|
| _to be filled by Track F / orchestrator (hosted onboarding, account status, transfer execution)_ | — | — |

### §22.x — Schema, RLS & entitlement resolver (Track D) — PLACEHOLDER

| Case | Module / test | Status |
|---|---|---|
| _to be filled by Track D (migrations 0014+, RLS guard tests, entitlement resolver)_ | — | — |

### §22.x — Browser / UI acceptance flows (orchestrator, Phase E/I) — PLACEHOLDER

| Case | Flow | Status |
|---|---|---|
| _to be filled at integration (partner dashboard, admin panels, signed-in checkout flows at localhost:5173)_ | — | — |
