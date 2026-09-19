# Account → Plan i rozliczenia — subscription lifecycle

How a customer manages their own subscription from **Konto / Ustawienia → Plan i rozliczenia**:
auto-renew, cancel at period end, resume, upgrade with proration, downgrade at period end,
renew after expiry, and a failed payment. One billing authority, one writer, no second
subscription system.

Nothing here is a new billing stack: it extends the existing
[`ARCHITECTURE.md`](./ARCHITECTURE.md) model (`billing_price_catalog` → `customer_subscriptions`
→ `entitlements`) and the existing `stripe-webhook` (v2) writer.

## Authority chain (unchanged)

| Question | Authority |
|---|---|
| What does the customer pay, and when? | Stripe (the Subscription / Schedule objects) |
| Which offer is a Stripe price? | `public.billing_price_catalog` (`stripe_price_id` → `offer_key`) |
| What does the panel display? | `public.customer_subscriptions` (server-written mirror of Stripe) |
| Does the customer have paid access? | `public.entitlements` + `gellatti_has_paid_access_v1` |
| Who writes those rows? | `supabase/functions/stripe-webhook` **only** (service role) |

The browser never writes billing state (no client grant exists) and never computes a date or an
amount: the panel renders the timestamps the authority stored and the amounts Stripe previewed.

## Lifecycle

### Auto-renew (default)

A Checkout subscription renews on its own cadence. Nothing in the app switches that off, so a
new paid subscription is auto-renew ON by construction. The panel shows the next renewal from
`customer_subscriptions.current_period_end`.

### Cancel = `cancel_at_period_end`

`manage-subscription` action `cancel` sets `cancel_at_period_end: true`. Access is **not**
removed, no refund is issued, and the plan does not drop to free. The plan stays `active` until
`current_period_end` and is simply not renewed. The entitlement mirror bounds the grant by that
same date (`decideEntitlementMirror(..., cancelAtPeriodEnd)`), so access ends exactly when the
paid period does even if `customer.subscription.deleted` is delayed.

### Resume

Action `resume` clears the flag on the **same** subscription while the period is still running:
no new subscription, no charge now, the original renewal date holds. A period that has already
ended refuses with `period_already_ended` — that customer renews through Checkout instead.

### Upgrade (HOME → PRO at the same cadence): immediate + prorated

`decidePlanChange` classifies the move. Going up applies immediately through
`subscriptions.update` with `proration_behavior: 'always_invoice'` and an explicit
`proration_date`, so Stripe credits the unused part of the old plan and charges the new plan's
remainder — the customer pays only the **difference**. A same-cadence upgrade keeps the period
end; a cadence change also sets `billing_cycle_anchor: 'now'` (the new cycle starts today).

The preview (`preview_change`) calls `invoices.createPreview` with the *same* parameters the
confirm will use and returns Stripe's own `amount_due`, tax, credit and next period end. The UI
is forbidden from computing `pricePro - priceHome`: a preview without a Stripe amount is
rejected client-side (`subscriptionManagement.ts`). A confirm must echo the preview's
`prorationTimestamp` and is refused when stale (`preview_expired`, 30 minutes).

### Monthly → yearly: owned by the conversion authority, not by this function

`MONTHLY_CREDIT_POLICY = 'full_current_period'` (owner decision 2026-09-18,
`src/billing/catalog/conversionStateMachine.ts`) credits the **whole** paid month against the
annual price whatever day the customer converts, and anchors the annual term at the current
monthly period start so the paid month becomes month 1 of 12. Stripe's default time-based
proration does not produce that, so `manage-subscription` refuses the change
(`cadence_conversion_not_available`) rather than charging under a policy the owner replaced —
and the panel does not offer the button (`actions.convertToYearly` is false). This applies to a
pure cadence change and to a combined tier + cadence change alike. It becomes available when
that authority gets a server implementation with a Stripe-verified call shape.

Yearly → monthly is unaffected: no money moves today, so it is scheduled at period end like any
other downgrade.

### Downgrade (PRO → HOME, or yearly → monthly): next period

A paid plan is never taken away mid-period. The confirm attaches a **Subscription Schedule**:
phase 1 keeps the current price until `current_period_end`, phase 2 starts the new offer then,
`end_behavior: 'release'`, `proration_behavior: 'none'`. The webhook mirrors that pending phase
onto `customer_subscriptions.scheduled_offer_key` / `scheduled_change_at` (migration
`20260919120000`), which is what lets the panel say "PRO pozostaje aktywny do <date>, potem
HOME" from the authority. `cancel_scheduled_change` releases the schedule.

### Expiry and renewal

When the subscription really ends, the account still works — only paid entitlement stops. The
panel reports `expired` with the date and offers a **new Checkout** (`renew`). The new period
starts at the real transaction date; no date is ever back-dated onto the old period. That is
also why `create-checkout-session` treats only *live* subscriptions as a conflict.

### Payment failure

`past_due` / `unpaid` / `incomplete` render as `payment_problem`, never as "wygasł" and never as
a fabricated cancellation. Grace follows the existing rule (paid while inside
`current_period_end`). The CTA deep-links to the Stripe Customer Portal payment-method flow
(`create-portal-session` with `flow: 'payment_method_update'`) — Stripe stores cards, Pinguino
never does.

## Components

| Piece | Path |
|---|---|
| Migration (pending-change mirror) | `supabase/migrations/20260919120000_customer_subscriptions_scheduled_change.sql` (+ matching file in `supabase/rollbacks/`) |
| Actions (Edge Function) | `supabase/functions/manage-subscription/{index,logic}.ts` |
| Subscription/schedule sync + entitlement mirror | `supabase/functions/stripe-webhook/{dispatch,effects}.ts` |
| Portal payment-method flow | `supabase/functions/create-portal-session/{index,logic}.ts` |
| Panel state (pure) | `src/billing/account/planPanelState.ts` |
| Client actions | `src/services/subscriptionManagement.ts` |
| Reads + data hook | `src/services/billing.ts`, `src/features/account/useBillingPlan.ts` |

### `manage-subscription` actions

| Action | Body | Stripe effect |
|---|---|---|
| `cancel` | — | `cancel_at_period_end = true` (releases a pending schedule first) |
| `resume` | — | `cancel_at_period_end = false` |
| `preview_change` | `targetOfferKey` | `invoices.createPreview` (immediate) or the period-end plan (scheduled) |
| `confirm_change` | `targetOfferKey`, `prorationTimestamp` (immediate only) | `subscriptions.update` with proration, or a Subscription Schedule |
| `cancel_scheduled_change` | — | `subscriptionSchedules.release` |

Identity rules: the caller is the JWT user, the Stripe customer comes from `billing_customers`,
the subscription from that user's `customer_subscriptions` rows, and the price from the catalog
(env `STRIPE_PRICE_*` as fallback). The body carries an action and an **offer key** — never a
price id, a customer id, a subscription id or an amount.

## Idempotency and consistency

* Every Stripe mutation carries a deterministic idempotency key
  (`manage:cancel:<sub>:<periodEnd>`, `manage:change:<sub>:<offer>:<prorationTs>`, …), so a
  retried request cannot apply the change twice.
* After a mutation the function re-runs the **webhook's own** subscription sync
  (`syncSubscriptionNow`) so the cache is correct on the next refresh, on any device. The
  webhook delivery that follows produces a byte-identical row — a no-op.
* Webhook deliveries stay idempotent as before: insert-first on
  `(account_scope, livemode, event_id)`, refetch-current for subscription and schedule events,
  upsert on `stripe_subscription_id`, converge-to-desired entitlements.
* State lives only in these tables. Refresh, logout/login and another device show the same
  status and the same dates; nothing is cached in `localStorage`.

## Known divergence (follow-up, not introduced here)

`gellatti_has_paid_access_v1` keeps a `customer_subscriptions` fallback that grants access on
`status in ('active','trialing')` without looking at `cancel_at_period_end`. Between the moment
a cancelled plan's period ends and the moment `customer.subscription.deleted` lands, that
fallback still answers yes, while the entitlement row (now bounded by `current_period_end`) and
the account panel both say the plan ended. The window is the webhook's delivery lag, it
self-heals, and it is the behaviour that already existed — this change only makes the primary
entitlement path stricter, never looser. Tightening the SQL fallback touches a SECURITY DEFINER
function used by ~10 call sites on a database staging shares with production, so it is left as a
separate, deliberately-deployed change.

## Webhook events used

Beyond the existing matrix ([`WEBHOOK_MATRIX.md`](./WEBHOOK_MATRIX.md)):
`customer.subscription.created|updated|deleted` carry cancel/resume/tier/cadence truth, and the
five `subscription_schedule.*` events re-run the same subscription sync so a pending change
appears and disappears with the schedule. `invoice.payment_failed` needs no separate writer:
Stripe always follows it with `customer.subscription.updated`, which is the status authority.
