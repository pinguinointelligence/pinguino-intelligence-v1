# T-TEST-02 · Financial matrix: test inventory

Prepared 2026-09-17 on branch `claude/wwu-phase2-qa-coverage-drift` (`origin/staging` `6e83b8d1` + this phase). Read-only: no DB, no code change.

- **Scope:** the 13 dimensions of checklist row T-TEST-02, for the commission lane (money) and the refer-a-friend lane (days).
- **Evidence:** the 20 test files cited pass (694 tests). Paths no test reaches were probed with an in-memory script over `dispatch.ts` using the same fake-DB semantics as `stripeWebhookDispatch.test.ts`; probe results are marked **(probe)** and are **not** repo coverage.
- **Spot-checked by reading `dispatch.ts`:** the commission writer (`applyCommissionablePayment`) books any paid, positive invoice without reading subscription status or earlier refunds, and `applyOneRefund` is a no-op when no entry exists yet (gap B under §2, and §2.8(b)).

**Proof kinds**
- `DOM`: a pure-domain TS oracle in `src/billing/**`.
- `RT`: a pure runtime module the webhook actually executes (`handlers.ts`, `effects.ts`).
- `SQL`: a migration or source string contract (regex / `toContain`, no DB).
- `FAKE`: `applyEventEffects` (`dispatch.ts`) run over an in-memory fake DB.

## 0. Facts that change how the coverage reads

- **Runtime.** It lives in `supabase/functions/stripe-webhook/`. `index.ts` receives the event, `dispatch.ts` holds the writers, and `effects.ts` / `handlers.ts` hold the pure logic.
- **Intake dedupe.** `index.ts:93-116` upserts with `ignoreDuplicates` on `(account_scope, livemode, event_id)`. The Deno shell itself is tested by source regex only.
- **Unwired oracles.** These tests prove the spec, not the runtime:
  - `decideEventApplication` and the webhook state table (`handlers.ts:430-468`). `index.ts` imports only `decideFailureFollowup`.
  - `classifyCommissionableEvent` (C4/C5/C6). `dispatch.ts` uses its own `decideCommissionEligibility` (paid and > 0 only), and nothing lockstep-tests the two against each other.
  - `conversionStateMachine.ts` and `scheduleOrchestration.ts`. Only their own tests import them, and no conversion runtime exists.
- **Wired mirrors with a lockstep test** (`stripeWebhookEffects.test.ts`): `refundAdjustments` ↔ `effects.decideReversal`, the hold calendar, `divideRoundHalfUp`, and the entitlement mirror.
- **No-op events.** 24 of the 41 matrix events are `skipped_no_contract` no-ops (`effects.ts` `NO_CONTRACT_REASONS`). They include `invoice.payment_failed`, `charge.dispute.created/updated/closed/funds_reinstated`, and every `transfer.*` / `payout.*` event.
- **No retry worker exists** (`dispatch.ts:289`). An event that throws `RetryableEffectError` stays parked in `received`.
- **What the writer books.** One entry per PAID, positive invoice whose subscription has an active or lockable attribution. It never tells a first payment from a renewal, and it never checks subscription status.

## 1. Summary

| # | Dimension | Commission lane | Reward lane (days) | Main proof file |
|---|---|---|---|---|
| 1 | Duplicate delivery | COVERED | PARTIAL | `src/services/stripeWebhookDispatch.test.ts` |
| 2 | Out-of-order | PARTIAL | GAP | `src/services/stripeWebhookEventOrder.test.ts` |
| 3 | Failed payment | COVERED | COVERED | `stripeWebhookDispatch.test.ts` · `src/features/referral/referralWebhookWiring.test.ts` |
| 4 | Success, exactly once | COVERED | PARTIAL | `stripeWebhookDispatch.test.ts` |
| 5 | Full refund | COVERED | GAP | `stripeWebhookDispatch.test.ts` |
| 6 | Partial refund | COVERED | GAP | `stripeWebhookDispatch.test.ts` + `src/services/stripeWebhookEffects.test.ts` |
| 7 | Dispute (open / lost / won) | PARTIAL | PARTIAL | `stripeWebhookDispatch.test.ts` + `src/billing/domain/refundAdjustments.test.ts` |
| 8 | Renewals | PARTIAL | GAP | `src/services/renewalCommissionStops.test.ts` |
| 9 | Annual | COVERED | COVERED | `stripeWebhookDispatch.test.ts` |
| 10 | Monthly | PARTIAL | COVERED | `src/billing/domain/commissionRules.test.ts` + `src/billing/migrations/billingPlatform.migration.test.ts` |
| 11 | Monthly → annual | PARTIAL | GAP (no rule) | `src/billing/catalog/conversionStateMachine.test.ts` (DOM only) |
| 12 | Idempotency | COVERED | COVERED | `billingPlatform.migration.test.ts` + `stripeWebhookDispatch.test.ts` |
| 13 | Concurrency | PARTIAL | GAP | `src/billing/domain/payoutExecution.migration.test.ts` (payout lane only) |

## 2. Commission lane: evidence

Test titles are quoted verbatim.

### 1 · Duplicate delivery: COVERED

| Kind | File | Titles |
|---|---|---|
| SQL | `billingPlatform.migration.test.ts` | "events: unique event key (account_scope, livemode, event_id) — exactly-once intake (§14.14)" |
| SQL (source regex) | `stripeWebhook.test.ts` | "inserts into stripe_webhook_events FIRST, keyed on the 0021 composite unique key" |
| FAKE | `stripeWebhookDispatch.test.ts` | "upserts the user ↔ customer mapping; redelivery is a byte-identical no-op" · "writes the cache row and grants the paid_subscription entitlement; redelivery is a no-op" · "invoice.payment_succeeded for the same invoice can never double-book" · "the same refund via refund.created is deduplicated by source event key" · "invoice.voided appends a FULL reversal once (object-scoped key)" |
| FAKE | `stripeWebhookEventOrder.test.ts` | "replaying every event twice changes nothing" |
| DOM (unwired) | `stripeWebhook.test.ts` | "an already-processed event id is a duplicate — skip" · "the same event id having last written the object is a duplicate — skip" |
| DOM | `refundAdjustments.test.ts` | "replaying the same refund source event id refuses (duplicate guard)" · "replaying the same dispute event refuses" |

- **How the FAKE replays work.** They use a new event id on the same object. For the writers this is equivalent to a same-id replay: every intent is `object` or `object_version`, and no writer keys on the event id. The literal same-id path exists only in `index.ts`, which is regex-tested.
- **Gap.** No writer-level test replays `charge.dispute.funds_withdrawn`. (probe) The second delivery gives `skipped_duplicate_reversal` and leaves 1 adjustment.
- **Closing test.** Replay the event inside "charge.dispute.funds_withdrawn appends a dispute_reversal of the remaining commission". No DB change.

### 2 · Out-of-order: PARTIAL

| Kind | File | Titles |
|---|---|---|
| FAKE | `stripeWebhookEventOrder.test.ts` | `` `${offer.key}: ORDER A and ORDER B converge on the same state` `` (×4 offers) · "ORDER B alone grants PRO annual — the exact staging failure" · "FAILS CLOSED when the mapping names a different user than the metadata" · "a malformed pi_user_id is refused, never guessed" |
| FAKE | `stripeWebhookDispatch.test.ts` | "an unmapped customer is retryable (the checkout race self-heals)" · "never lets a stale expiry event unpay a paid order" (shop) |
| RT | `stripeWebhook.test.ts` | "subscription lifecycle events re-fetch and use latest-wins versioning" |
| DOM (unwired) | `stripeWebhook.test.ts` | "an OLDER event than the stored object version is stale — never overwrites newer state" · "same created second, different event → order ambiguous → refetch current" · "duplicate beats stale beats refetch (decision precedence)" |

**Gap A: `invoice.paid` arriving before `customer.subscription.created`.**
- ORDER A is checkout → subscription → invoice. ORDER B is subscription → invoice → checkout. The invoice never comes first.
- As a result, no test runs the cache-heal branch at `dispatch.ts:492-506`.
- (probe) Invoice first: it books 1 entry (900) and creates the cache row, the customer mapping, and 1 grant. The later `subscription.created` then changes nothing, byte for byte.
- **Closing test:** add ORDER C `['invoice','subscription','checkout']` with a seeded commission world. No DB change. Expected to pass.

**Gap B: refund, void or dispute processed before `invoice.paid`.**
- The reversal finds no entry and does nothing ("a refund with no commission entry is an honest no-op").
- The booking that follows then stands with no reversal.
- (probe) Note `skipped_no_commission_entry_for_refund`, then an entry of 900 `held` with 0 adjustments.
- **A convergence test would fail today.** Fixing it needs a `dispatch.ts` change (for example: keep the reversal pending while the invoice is paid but not yet booked, or read the refunded amount at booking time). No DB change.

### 3 · Failed payment: COVERED

| Kind | File | Titles |
|---|---|---|
| FAKE | `stripeWebhookDispatch.test.ts` | "an unpaid invoice never books commission" (full world seeded → `skipped_not_commissionable:invoice_not_paid`) · "every no-contract intent records its note and performs ZERO writes" (includes `invoice.payment_failed`) |
| RT | `renewalCommissionStops.test.ts` | "a failed renewal books nothing" · "an invoice that is not paid, or paid at zero, is refused by the writer" |
| RT | `stripeWebhookEffects.test.ts` | "C6 mirror: only paid, positive invoices are commissionable" |
| RT | `stripeWebhook.test.ts` | "failed payments never carry a ledger entry effect" |
| DOM (unwired) | `commissionRules.test.ts` | '%s invoice → invoice_not_paid' · "zero-value invoice → zero_value_invoice" |
| FAKE (entitlement) | `stripeWebhookEventOrder.test.ts` | "a subscription that never activated grants nothing" |

**Weak test, not counted.** "an unpaid invoice books no commission, in either order" (EventOrder) proves nothing about commission. Its fake seeds no attribution, partner or rules, so a **paid** invoice would also book 0.

### 4 · Success, exactly once: COVERED

| Kind | File | Titles |
|---|---|---|
| FAKE | `stripeWebhookDispatch.test.ts` | "books ONE held entry at the snapshot tier and locks the pending attribution" · "invoice.payment_succeeded for the same invoice can never double-book" · "refuses self-referrals (C6) — no entry, attribution NOT locked" · "no attribution → no commission (honest note, still processed)" · "T6: a missing month tier snapshot is retryable — never another month, never a guess" |
| RT | `stripeWebhookEffects.test.ts` | "commission entry row carries EXACTLY the 0018 insert columns, held + eligible_at from the hold calendar" · "duplicate deliveries produce byte-identical rows (deterministic mappers)" |
| RT | `stripeWebhook.test.ts` | "invoice.paid and invoice.payment_succeeded share the SAME object-scoped intent" |
| SQL | `billingPlatform.migration.test.ts` | "entries: duplicate commission key impossible — unique invoice id where not null (§14.14)" |

"Exactly once" is proven only for events delivered one after another. The concurrent case is dimension 13.

### 5 · Full refund: COVERED

| Kind | File | Titles |
|---|---|---|
| FAKE | `stripeWebhookDispatch.test.ts` | "a follow-up full refund is CAPPED at the remaining commission and flips the entry to reversed" (1000 + 3900 = the whole 4900 charge) · "invoice.voided appends a FULL reversal once (object-scoped key)" |
| RT (lockstep) | `stripeWebhookEffects.test.ts` | "proportionalReversalCents mirrors the R2 arithmetic" (4900 of 4900 → 900) |
| DOM (mirrored) | `refundAdjustments.test.ts` | "R1: full refund → full reversal" · "R4: append-only — the entry object is never mutated and the adjustment is frozen" |

**Small gaps** (tests only, no DB change):
- **Refund of an entry that is already `paid`.** The writer appends the reversal but does not flip the status. The netting that should follow is tested only in SQL and DOM: "a later negative adjustment lands in the next batch as a negative net" and "P3: negative net carries forward and blocks payout".
- **`invoice.marked_uncollectible`** is tested only as a replay no-op, never as the first reversal.

### 6 · Partial refund: COVERED

| Kind | File | Titles |
|---|---|---|
| FAKE | `stripeWebhookDispatch.test.ts` | "appends the round-half-up proportional reversal (900 × 1000 / 4900 → 184)" · "the same refund via refund.created is deduplicated by source event key" · "a follow-up full refund is CAPPED at the remaining commission and flips the entry to reversed" |
| RT (lockstep) | `stripeWebhookEffects.test.ts` | "replays a partial-refund chain identically to the domain module (incl. the cap)" · "matches the domain divideRoundHalfUp across a value grid" |
| DOM | `refundAdjustments.test.ts` | "R2: partial refund → proportional reversal" · "R3: multiple partial refunds accumulate to exactly the full commission" · "R3: cap — a refund can never push cumulative reversals past the original commission" · "R3: rounding across many small refunds still respects the cap" |

**Small gaps:**
- `refund.updated`, `charge.refund.updated`, and the pending→succeeded path (`skipped_refund_not_succeeded`) have no writer-level tests. Adding them needs no DB change.
- A refund that later fails is never re-credited. There is no handling for it, and adding a re-credit needs a new adjustment kind, which is a DB change.

### 7 · Dispute: PARTIAL

| Kind | File | Titles |
|---|---|---|
| FAKE | `stripeWebhookDispatch.test.ts` | "charge.dispute.funds_withdrawn appends a dispute_reversal of the remaining commission" · "funds_reinstated is an HONEST no-op — 0018 cannot store a reinstatement kind" · "every no-contract intent records its note and performs ZERO writes" (includes `charge.dispute.created`) |
| RT (lockstep) | `stripeWebhookEffects.test.ts` | "full reversal (refundedGrossCents null) mirrors applyDisputeLost — remaining only" |
| DOM | `refundAdjustments.test.ts` | "dispute lost → full reversal of the whole commission" · "dispute lost after a partial refund reverses only the remainder" · "dispute lost after full reversal refuses" · "replaying the same dispute event refuses" · "restores exactly the disputed amount" · "replaying the same reinstatement event id refuses (idempotent)" · "a SECOND reinstatement for the same dispute under a new event id also refuses (restore ONCE)" · "after reinstatement the commission is refundable again (ledger nets correctly)" |

**How the runtime handles disputes**
- It reverses the commission on `funds_withdrawn`. Stripe sends that event when the disputed amount is debited, which is normally when the dispute opens, not when it is lost.
- `closed` is a no-op.
- A **won** dispute (`funds_reinstated`) is also a no-op, so the commission stays reversed. R6 (reinstatement) exists in DOM only.
- **Closing "won" needs a DB change:** the 0018 `kind` CHECK allows only refund_reversal | dispute_reversal | manual, and a writer would have to be added.
- **Test-only gap:** a `funds_withdrawn` replay (see dimension 1).

### 8 · Renewals: PARTIAL

| Kind | File | Titles |
|---|---|---|
| RT + source scan | `renewalCommissionStops.test.ts` (H-DASH-11) | "only a paid invoice can book commission: exactly invoice.paid and invoice.payment_succeeded" · "the end of a subscription books nothing" · "a failed renewal books nothing" · "an invoice that is not paid, or paid at zero, is refused by the writer" · "the commission writer is reached from one place only — the paid-invoice intent" |
| DOM (unwired) | `commissionRules.test.ts` | "C4: each later 12-month renewal classifies as one annual commission" · '%s → commission at %s cadence' (includes monthly_renewal, annual_renewal) |
| DOM | `attribution.test.ts` | "valid code at conversion attributes the conversion (and future renewals use the lock)" · "NO repeat on renewals" (15-month benefit, not commission) |

**What H-DASH-11 asserts:** routing, eligibility, and that the writer has one call site. It does **not** drive the writer.

**What is not asserted:**
- **(a) Positive control.** No test shows that a paid renewal (a second invoice, attribution already `active`) books one more entry. No writer-level test exercises the active-lock lookup.
  - (probe) `in_1` and `in_2` both book.
  - **Closing test:** a FAKE test. No DB change. It passes today.
- **(b) The writer never reads subscription status or entitlement.**
  - (probe) An `invoice.paid` on a subscription whose cache row is `canceled` still books.
  - So the H-DASH-11 rule (renewals stop once the entitlement ends) depends entirely on Stripe not issuing a paid invoice after the end.
  - This is a question about the rule, not a missing test.

### 9 · Annual: COVERED

| Kind | File | Titles |
|---|---|---|
| FAKE | `stripeWebhookDispatch.test.ts` | "books ONE held entry at the snapshot tier and locks the pending attribution" (`home_yearly_standard` → cadence annual, 900) |
| FAKE (entitlement) | `stripeWebhookEventOrder.test.ts` | "home_yearly_standard: ORDER A and ORDER B converge on the same state" · "pro_yearly_standard: ORDER A and ORDER B converge on the same state" · "ORDER B alone grants PRO annual — the exact staging failure" |
| SQL | `billingPlatform.migration.test.ts` | "enforces the commission-cadence rule in SQL: monthly→monthly, yearly + 15m→annual" · "seeds the 12 locked v1 commission rates verbatim" |
| catalog | `src/billing/catalog/priceCatalog.test.ts` | "pins the cadence of every offer" |
| DOM | `commissionRules.test.ts` | "C3: the 15-month initial payment classifies as ONE annual commission" · '%s %s %s → %d cents' |
| DOM (unwired) | `src/billing/catalog/scheduleOrchestration.test.ts` | '%s → first phase %s, one iteration, renews into the SAME annual offer' |

Small gap: no 15-month offer and no PRO annual offer is ever run through the writer. They use the same code path.

### 10 · Monthly: PARTIAL (low risk)

**Existing proof:**
- DOM (unwired), `commissionRules.test.ts`: the C1 rates '%s %s %s → %d cents' (199/249/299/499/599/699) and '%s → commission at %s cadence' (first_monthly_payment, monthly_renewal).
- SQL, `billingPlatform.migration.test.ts`: "seeds the 12 locked v1 commission rates verbatim" and the cadence CHECK.
- `priceCatalog.test.ts`: "pins the cadence of every offer".
- EventOrder: "home_monthly_standard: ORDER A and ORDER B converge on the same state" and "pro_monthly_standard: ORDER A and ORDER B converge on the same state". These cover entitlement only.

**Gap:** no test books a monthly commission through the writer.
- (probe) A monthly offer books 199 with cadence monthly.
- **Closing test:** run the booking test with `it.each` over the four offers. No DB change.

### 11 · Monthly → annual: PARTIAL

| Kind | File | Titles |
|---|---|---|
| DOM (unwired, no runtime) | `conversionStateMachine.test.ts` | `` `${state} + ${eventName} → ${expected}` `` (56 generated) · "a confirm against a DIFFERENT proration timestamp is refused and the state stays previewed" · "the same idempotency key replays idempotently at every post-confirm stage" · "async payment keeps the monthly entitlement intact through the whole processing window" · "failure / expiry / abandon leave monthly intact and the benefit unconsumed" |
| DOM (unwired) | `commissionRules.test.ts` | "conversion payment commissions ONCE: repeat refused" |
| DOM | `attribution.test.ts` | "A5: already-attributed monthly KEEPS its partner through conversion (code at conversion ignored)" · "valid code at conversion attributes the conversion (and future renewals use the lock)" · "qualifying conversion to annual → benefit" |
| SQL | `billingPlatform.migration.test.ts` | "conversion intents: unique ACTIVE intent per subscription + unique idempotency key (§14.5)" |

**Gap:** nothing at webhook level.
- **Closing test (FAKE):** a monthly subscription and its first invoice, then `customer.subscription.updated` carrying the annual price, then the proration `invoice.paid`.
- (probe) Entries come out as [monthly 199, annual 900]. The cache row flips to `home_yearly_standard`, and there is still 1 active grant.
- No DB change.
- The runtime has no equivalent of the C5 rule that a conversion earns commission only once: it simply books one entry per invoice.

### 12 · Idempotency: COVERED

| Kind | File | Titles |
|---|---|---|
| SQL | `billingPlatform.migration.test.ts` | "events: unique event key (account_scope, livemode, event_id) — exactly-once intake (§14.14)" · "entries: duplicate commission key impossible — unique invoice id where not null (§14.14)" · "adjustments: append-only (no touch trigger, no updated_at) + unique source event (§14.14)" · "attributions: unique ACTIVE owner per subscription — partial unique (§14.14)" · "entitlements: scope/source vocabularies + duplicate-active-grant prevention (§14.14)" · "payouts: unique idempotency key + one row per partner per batch + unique transfer id" · "batches: unique month + currency + livemode — a month can never run twice (§14.14)" |
| SQL | `payoutExecution.migration.test.ts` | "repeated scheduler execution is a no-op at every level" · "each commission_entry_id can appear in at most ONE payout item, ever" |
| SQL | `src/billing/domain/tierSnapshotWriter.migration.test.ts` | "inserts with ON CONFLICT DO NOTHING — the first snapshot for a month wins" |
| RT | `stripeWebhook.test.ts` | "builds the three locked shapes" · "is deterministic — same input, same key" |
| DOM | `src/billing/domain/payoutNetting.test.ts` | "builds the deterministic key batchMonth+partnerId+currency+mode" |
| FAKE | `stripeWebhookDispatch.test.ts` | The fake enforces the 0003/0015/0018 unique keys (`UNIQUE_KEYS`); see the replay tests under dimension 1. |

**Weakness** (fixing it needs no DB change):
- Five assertions match `on public.<table> (<cols>) where …` without the word `unique`: entries, adjustments, attributions, entitlements, and conversion intents.
- They would still pass if the uniqueness were dropped. The SQL is unique today (for example 0018 lines 119 and 157).
- **Fix:** match `create unique index if not exists <name>` instead.

### 13 · Concurrency: PARTIAL

| Kind | File | Titles |
|---|---|---|
| SQL | `payoutExecution.migration.test.ts` | "is blocked by the batch unique key and an advisory lock" · "two workers claim disjoint lines" · "settling requires the line to still be in flight, so a double-settle is refused" |
| SQL (source regex) | `stripeWebhook.test.ts` | "state updates are guarded (state-conditional) so a worker can never regress a row" |
| DOM (unwired) | `conversionStateMachine.test.ts` | "the earliest non-terminal intent wins; later actives are the losers to abandon" · "ties on createdAt break deterministically by id" · "all-terminal (or empty) → no winner, a fresh draft may start" |
| FAKE (sequential) | `stripeWebhookEventOrder.test.ts` | The GROW-010 header describes a concurrent race, but the tests replay it one event at a time. |

**Gap: no test runs two writers at once on the money path.**
- `insertIgnoringDuplicate`'s 23505 branch (`dispatch.ts:154-159`) never runs in any test. That branch is the DB backstop for `commission_entries` and `commission_adjustments`.
- Every existing duplicate test is stopped earlier, by the app-level pre-read.
- (probe) `Promise.all(invoice.paid, invoice.payment_succeeded)` gives 1 entry, with notes [null, "skipped_duplicate_invoice_entry"].
- **Closing test:** that `Promise.all` test, plus the same for `charge.refunded` ∥ `refund.created`. No DB change.

**What stays unproven without a DB:**
- The real Postgres locking (skip locked, advisory lock) is checked only as strings. Proving it needs a DB test harness, not a schema change.
- (code reading) The R3 cap is enforced by read-then-insert, with no DB sum constraint. Two different refunds processed at the same moment each compute against the same prior sum. The cap can only be exceeded at a .5 rounding edge.

## 3. Refer-a-friend reward lane (days, not money)

**How it is wired**
- `applyReferralReward` runs after the commission lane on every paid invoice.
- `reverseReferralRewardForInvoice` runs on void or uncollectible, on every succeeded refund, and on `funds_withdrawn`.
- All the qualification rules live in SQL: `gellatti_record_referral_reward_v1`, in `20260902100100_refer_a_friend_functions.sql` lines 157-235.
- That SQL is pinned by string tests only (`src/features/referral/referralRewardRules.migration.test.ts`).

| # | Status | Proof (kind · file · titles) | Gap → smallest closing test (DB change?) |
|---|---|---|---|
| 1 Duplicate | PARTIAL | SQL · migration test · "one reward per invoice is a unique index" | The SQL `duplicate_invoice` branch is not pinned, and nothing tests that dispatch stays silent on it. Test: FAKE rpc returns `duplicate_invoice` → note null. No DB change. |
| 2 Out-of-order | GAP | none | Refund, void or dispute before `invoice.paid`: the reversal gets `no_reward_for_invoice`, then the reward is recorded and never reversed (code reading; same shape as commission gap B). FAKE test, no DB change; the fix needs a code change. |
| 3 Failed | COVERED | FAKE · `referralWebhookWiring.test.ts` · "F7 — an unpaid invoice never reaches the reward recorder" · "F7 — a zero-value paid invoice never reaches the reward recorder" | `invoice.payment_failed` returns before any RPC (early no-contract return). No test checks that no RPC is made. |
| 4 Success | PARTIAL | FAKE · "records a reward on a paid invoice with NO partner attribution" · "stays quiet when the customer simply has no user referral" · "SPEAKS UP when the partner lane won the conversion — the one place they meet" · "never writes a commission or payout table from the reward lane"; SQL · "reads the partner lane for exactly one purpose — refusing a double reward" · "never writes any table of the commission or payout ledger" | "Exactly once" is SQL behavior, so proving it needs a DB (no schema change). |
| 5 Full refund | GAP | none (the only related tests are "F7 — a voided invoice reverses the reward" and the dispute test in row 7) | Test: FAKE `charge.refunded` for the full amount → `gellatti_reverse_referral_reward_v1` called with `p_reason` charge.refunded. No DB change. |
| 6 Partial refund | GAP | none | (probe) Any succeeded refund reverses the **whole** reward (1000 of 2900 → reversed). J-REF-09 says "fully refunded", so the owner must choose the rule first. The test needs no DB change. |
| 7 Dispute | PARTIAL | FAKE · "F7 — a lost dispute reverses the reward" (fires at `funds_withdrawn`) | A won dispute (`funds_reinstated`) is a no-op, so the reward stays reversed. Untested, and the rule is not specified. |
| 8 Renewals | GAP | SQL · "F3 — one live reward per referred person is a unique index" | The `first_purchase_already_rewarded` branch is not pinned. The index is `where status = 'earned'`, so once a reward is reversed (for example by a partial refund), a later renewal invoice can earn again. The SQL comment calls that a "genuine later qualification"; J-REF-02 says renewals earn nothing. Owner rule needed; forbidding it means a SQL migration (DB change). |
| 9/10 Annual / monthly | COVERED | SQL+DOM · "F1/F2 — the SQL bonus-day table matches the module exactly" · "the reward amounts the DB accepts are exactly the ones the module knows"; FAKE · "reads cadence from the SAME catalogue column the commission lane uses" | Note: the checklist row J-REF-04 says annual = +3 months, but the code and the DB CHECK give **30 days**. |
| 11 Monthly → annual | GAP (no rule) | none | After a rewarded monthly purchase, the conversion invoice returns `first_purchase_already_rewarded`. Untested. |
| 12 Idempotency | COVERED | SQL · "one reward per invoice is a unique index" · "F3 — one live reward per referred person is a unique index" (both assert `create unique index`); DOM · "is idempotent while a bonus is already running" | none |
| 13 Concurrency | GAP | none | The record function checks, then inserts, with no ON CONFLICT and no exception handler. A concurrent paid + payment_succeeded pair raises 23505 inside the RPC → `referral_reward_rpc_failed:23505` (retryable) → the row stays parked in `received`, because no worker exists. Exactly-once still holds thanks to the index. A FAKE test of the rpc-error path needs no DB change; ending the parking needs a migration. |

## 4. `WEBHOOK_MATRIX.md` sections → tests

**What the doc's test references actually prove:**
- The "Test reference" column cites `stripeWebhook.test.ts "routing table"` in 38 of 41 rows. The other rows cite "commissionable payments" (2) and `stripeWebhookDispatch.test.ts` (1).
- The "routing table" block pins routing and the intent's shape only, not any effect.
- The lockstep test ("every event row carries its handler intent kind in the doc") pins event names and intent kinds. It does not check the **Local effects** column.

| Section | Effect proof that actually exists | Doc vs runtime |
|---|---|---|
| Checkout (4) | Dispatch: "upserts the user ↔ customer mapping; redelivery is a byte-identical no-op"; the shop settlement block (16 tests); "no longer treats the delayed checkout events as contract-less". EventOrder: GROW-010 (11 tests). | Match |
| Subscriptions (3) | Dispatch: the subscription_state_sync block (4 tests). EventOrder (11 tests). | Match. Refetch is used; the `objv` key is never stored. |
| Schedules (5) | "every no-contract intent records its note and performs ZERO writes" (covers `released` only) | Doc: partner_benefit_uses linkage. Runtime: no-op. |
| Invoices (7) | `paid` / `payment_succeeded`: dispatch commissionable block (6), `referralWebhookWiring.test.ts` (7), `renewalCommissionStops.test.ts` (5). `voided`: "invoice.voided appends a FULL reversal once (object-scoped key)" and "F7 — a voided invoice reverses the reward". `marked_uncollectible`: replay only. `finalized` / `payment_failed`: no-contract test. `payment_action_required`: only "every supported event is either handled by a writer or an explicit no-contract no-op". | Doc: "invoice mirror" for finalized / failed / action_required. Runtime: no-op. |
| Payment intents (4) | No-contract test (covers `succeeded` only) | Doc: conversion correlation. Runtime: no-op. |
| Refunds (4) | `charge.refunded` and `refund.created`: dispatch refund block (4). `refund.updated` and `charge.refund.updated`: routing only. | Match (same code path) |
| Disputes (5) | `funds_withdrawn`: dispatch test and the reward-wiring test. `funds_reinstated`: the honest no-op test. `created`: no-contract test. `updated` / `closed`: the "handled by a writer or an explicit no-contract no-op" test only. | Doc: `funds_reinstated` = "re-credit". Runtime: no-op. |
| Connect account (1) | "mirrors details_submitted/payouts_enabled onto the partner row" | Match |
| Transfers (3) · Payouts (5) | No-contract test (`transfer.created`, `transfer.reversed`, `payout.paid`, `payout.failed`). Carry-forward is in the SQL payout batch (`payoutExecution.migration.test.ts`). | Doc: commission_adjustments carry-forward. Runtime: no-op. |

## 5. Next steps

**Top gaps that need only tests: no DB change, and each is expected to pass today (probe)**
1. **Concurrency on the money writer** (`stripeWebhookDispatch.test.ts`)
   - Test: `Promise.all(invoice.paid, invoice.payment_succeeded)` → 1 entry, and the losing call's note is `skipped_duplicate_invoice_entry`.
   - Add the same for `charge.refunded` ∥ `refund.created` → 1 adjustment.
   - This is the first test to run the 23505 backstop branch.
2. **`invoice.paid` arriving first** (`stripeWebhookEventOrder.test.ts`)
   - Test: ORDER C `['invoice','subscription','checkout']`, with the commission world seeded so the commission assertion actually means something.
   - Expected: the same state as orders A and B, and exactly one entry.
   - This runs the heal branch at `dispatch.ts:492-506`.
3. **Renewal and monthly → annual at writer level** (`stripeWebhookDispatch.test.ts`)
   - Test: a second paid invoice on an `active` attribution → a second entry. This is also the positive control H-DASH-11 lacks.
   - Test: `subscription.updated` switching to the annual price, then the proration `invoice.paid` → entries [monthly 199, annual 900].

**Runner-up tests** (no DB change): replay `funds_withdrawn`; `it.each` the booking test over all four offers; tighten the `unique` regexes; reward reversal on a full refund.

**Blocked on an owner rule:** whether a partial refund reverses the reward; whether a renewal after a reversal can earn again; whether annual = 30 days or 3 months.

**Needs a code change (not a DB change):** a refund, void or dispute processed before `invoice.paid` leaves the commission and the reward unreversed.

**Needs a DB change:** re-crediting a won dispute (0018 `kind` vocabulary); ending the parked reward RPC on a concurrent pair.
