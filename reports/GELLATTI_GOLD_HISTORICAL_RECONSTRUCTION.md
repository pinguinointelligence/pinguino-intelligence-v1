# GELLATTI — GOLD HISTORICAL RECONSTRUCTION: FEASIBILITY AND DESIGN

**Owner acceptance blockers B, C and D.** Written after auditing the actual data model, not from
assumption.
**Date:** 2026-08-31 · **Staging DB inspected live:** `tunabqqrwabacxjcxxkz`

---

## 0. The ruling being answered

> A February tier snapshot must represent the February snapshot boundary.
> NEVER: missing historical snapshot → current count → historical snapshot.

Accepted without reservation. The previous catch-up design did exactly that and was wrong. It has
been replaced, not patched.

---

## 1. EXACT HISTORICAL SOURCES AVAILABLE

Audited object by object.

| Source | What it actually holds | Usable as history? |
| --- | --- | --- |
| `stripe_webhook_events` | `payload jsonb` — the **verified raw Stripe event**, retained (0021: "payload is audit/debug evidence"); `event_type`; `received_at`. Payload carries the subscription object's `status`, `current_period_end`, `cancel_at_period_end`, `canceled_at`, `ended_at` at that instant, plus Stripe's own `created` timestamp | ✅ **YES — this is the spine** |
| `commission_entries` | Immutable, `earned_at`, one row per qualifying payment, never edited | ✅ yes — proves a payment happened at an instant |
| `commission_adjustments` | Append-only reversals | ✅ yes |
| `referral_attributions` | subscription → partner link, `created_at`, `status`, `window_expires_at` | ✅ yes for the link; ⚠️ `status` is current-only |
| `customer_subscriptions` | **A CACHE.** `status`, `current_period_start/end`, `cancel_at_period_end` are overwritten in place on every webhook | ❌ **current state only** — except `ended_at`, `cancelled_at`, `created_at`, which are durable facts |
| `entitlements` | Has `starts_at`/`ends_at`/`status` — looks like a history, **is not** | ❌ **see §1.1** |
| `partner_tier_snapshots` | Immutable, one per partner-month | ✅ but that is the thing we are trying to write |

### 1.1 Why `entitlements` cannot be used, despite looking perfect

It has `starts_at`, `ends_at` and a status — the shape of an interval history. But reading the
webhook's convergence logic (`dispatch.ts`) shows the row is **mutated in place**:

- when a subscription stops being paid, the row's `status` is flipped `active` → `expired`
  **without setting `ends_at`**;
- `ends_at` is only ever written for `past_due` (to `current_period_end`), and is then **updated in
  place** as the period rolls, discarding the previous value.

So an expired entitlement records *that* it ended and not *when*. Using it would produce a
confidently wrong answer, which is worse than no answer. Ruled out.

*(This is worth fixing on its own merits — setting `ends_at` on expiry would make entitlements a
genuine interval history. Recorded as a follow-up, not done here, because it changes a live
financial write path and is out of this workstream's scope.)*

---

## 2. ARE THEY COMPLETE?

**Conditionally, and the condition is checkable — which is the important part.**

Live staging state at the time of writing:

| Fact | Value |
| --- | --- |
| webhook events stored | **6** |
| of which retain a payload | **6 (100 %)** |
| earliest event | **2026-07-20** |
| event types captured | `customer.subscription.created`, `customer.subscription.updated`, `checkout.session.completed`, `invoice.payment_succeeded` ×2, `invoice.paid` |
| subscriptions | 1 |
| referral attributions | 6 |
| **commission entries** | **0** |
| **tier snapshots** | **0** |

Two things follow.

**First: no purge exists.** No retention job, no payload nulling, nothing that deletes from
`stripe_webhook_events` anywhere in the migration history. Payloads survive.

**Second, and more usefully: there is no financial history to get wrong yet.** Zero commissions have
ever been earned and zero snapshots written. The reconstruction problem is, today, entirely
prospective — which is exactly when it should be solved.

### The completeness gaps that remain, stated plainly

1. **Before 2026-07-20 there is no event history at all.** Any boundary earlier than the first
   stored event cannot be reconstructed, full stop.
2. **Webhook delivery is not guaranteed gapless.** Stripe retries, but an endpoint down beyond the
   retry window loses events permanently. A subscription with no event before the boundary is a hole.
3. **`received_at` is not the event time.** It is when we received it, which is wrong under late or
   out-of-order delivery. The payload's own `created` field is the ordering authority, and the
   implementation uses that.
4. **The stored payload may differ from what was written to the cache.** The architecture re-fetches
   live objects for `requiresRefetch` intents, so the cache reflects the refetch while the stored
   payload reflects the event. For *historical* purposes the event payload is the better source — it
   is Stripe's own record of that instant — but the discrepancy is named rather than hidden.

---

## 3. CAN THE COUNT BE RECONSTRUCTED DETERMINISTICALLY?

**Yes, when the log covers the boundary. No, when it does not. And the difference is decidable
before anything is written.**

### The algorithm

For partner `P` at boundary `T`:

1. For each subscription `S` attributed to `P` where the attribution is active and predates `T`:
   take the **last** `customer.subscription.*` event whose `payload->>'created'` is at or before
   `T`, and read `status` and `current_period_end` from it. That is `S`'s state as Stripe recorded
   it at `T`.
2. Apply the **same T3 eligibility rule** the live counter uses — `active`/`trialing` count;
   `past_due` counts only while its already-paid period had not ended *at T*; the partner's own
   account never counts; distinct subscriptions only.
3. Count.

### The completeness gate, checked first

Reconstruction is attempted **only if both hold**:

- `T` is at or after the earliest event in the log — otherwise `boundary_predates_event_history`
  (or `no_event_history` if the log is empty);
- every attributed subscription that already existed at `T` has at least one subscription event at
  or before `T` — otherwise `subscription_without_event_history`.

If either fails, **nothing is written**. See §5.

---

## 4. EXACT BOUNDARY SEMANTICS

| Question | Answer |
| --- | --- |
| What instant is a month's snapshot measured at? | **Madrid midnight on the 1st**, expressed as a UTC instant: `(month::timestamp at time zone 'Europe/Madrid')` |
| Is that the same instant an on-time run would use? | **Yes** — and that equality is the entire safety argument. A late run and an on-time run read the same facts and write the same row. |
| Which month does an event at 2026-01-31T23:30Z belong to? | **February.** 23:30 UTC on 31 January is 00:30 Madrid on 1 February. Consistent with `holdCalendar` H3. |
| Is `current_period_end > T` evaluated at the boundary or now? | **At the boundary.** A `past_due` subscription counts only if its paid window had not ended at `T`. |
| Does the run time influence the tier? | **No.** `p_now` is written to `computed_at` only. It never feeds the decision. |
| Does Elite obey the same rule? | **Yes** — the override in force *at the boundary*, resolved through the versioned rate profile, never the one in force today. |

---

## 5. WHEN RECONSTRUCTION IS NOT POSSIBLE

**No snapshot is written. No tier is guessed. No neighbour is borrowed.**

A typed row is recorded instead:

```
partner_tier_snapshot_gaps
  partner_id, month,
  state  = 'historical_snapshot_reconciliation_required',
  reason = 'no_event_history'
         | 'boundary_predates_event_history'
         | 'subscription_without_event_history',
  detected_at, resolved_at, resolved_by_user_id, resolution_note
```

The consequence is deliberate: `dispatch.ts` already defers a commission when its month has no
snapshot (`tier_snapshot_missing`, retryable). So the affected commissions **stay deferred** rather
than being paid at a guessed rate. The partner's rate is never silently degraded — it is *withheld*
until a human resolves the month.

Admin sees, through `gellatti_admin_tier_snapshot_gaps_v1`:

- the missing **month**;
- the affected **partner**;
- **why** it cannot be reconstructed automatically;
- the **count of affected commission entries** in that month;
- the **total amount** those entries represent;
- and therefore what the required action is worth.

---

## 6. THE CORRECTED CATCH-UP CONTRACT (owner point D)

```
miss the February run
  → the job runs in March
  → detects February is missing            (gellatti_missing_tier_snapshot_months_v1)
  → checks February is reconstructable     (gellatti_tier_reconstruction_blocker_v1)
  → reconstructs the count AT the February boundary
                                           (gellatti_partner_referred_count_asof_v1)
  → writes February exactly once           (on conflict do nothing)
  → writes March independently, from March's own boundary
  → a repeated invocation finds no missing month and writes nothing
```

Proven in both directions:

| Scenario | February | March | Property proven |
| --- | --- | --- | --- |
| **Gold → Standard** | 105 actives → **gold** | 87 → standard | the late February write is still Gold; March's fall cannot underpay February |
| **Standard → Gold** | 87 → **standard** | 105 → gold | March's rise cannot overpay February |

A test records what the rejected design would have produced in each case, so the mistake cannot
quietly return.

---

## 7. What is NOT claimed

- Gold is **not** done, and is not proposed for owner QA. It cannot be until the migrations are
  applied and the sequence runs against the real database.
- Reconstruction is proven **statically and at the domain level**. The live proof — real rows, real
  event payloads, real boundaries — is the staging package, still pending.
- The `entitlements.ends_at` weakness in §1.1 is recorded, not fixed.

---

## 8. Change log

| Date | What |
| --- | --- |
| 2026-08-31 | Created for owner blockers B/C/D. Data model audited against the live staging database. `entitlements` ruled out as a history source with the reason. `stripe_webhook_events` payloads identified as the usable spine, ordered by the payload's own `created`. Catch-up rewritten to reconstruct at the boundary or refuse; typed gap state added with Admin visibility including affected commission count and value |
