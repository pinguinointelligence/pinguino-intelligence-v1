# Webhook Event Matrix — stripe-webhook (v2)

The DELIBERATE event list for the billing-platform webhook endpoint. Nicolas selects EXACTLY
these events when creating the event destination (handoff §9) — no wildcard subscriptions.

Code mirror: `supabase/functions/stripe-webhook/handlers.ts` (`WEBHOOK_EVENT_INTENTS`) — a
lockstep test (`src/services/stripeWebhook.test.ts`) pins this document 1:1 against the code:
every supported event appears here, and every event row here is supported.

Idempotency key shapes (see `buildIdempotencyKey`):

- `evt:{event.id}` — once per Stripe event
- `obj:{object.id}` — once per Stripe object (e.g. one commission entry per invoice)
- `objv:{object.id}:{event.created}` — latest-wins per object version

Every event additionally lands insert-first in `stripe_webhook_events` (unique
`stripe_event_id`, state machine `received → processing → processed | failed → retryable`);
the table below lists the effects BEYOND that durable receipt. 2xx is returned only after the
durable insert. Handlers marked "refetch" re-fetch the current object from Stripe before
applying effects (out-of-order tolerance, `decideEventApplication`).

## Checkout

| Event | Handler intent | Idempotency key | Local effects | Test reference | Notes |
|---|---|---|---|---|---|
| `checkout.session.completed` | checkout_completion | `obj:{session.id}` | billing_customers; checkout correlation (metadata → user/offer/attribution) | stripeWebhook.test.ts "routing table" | client_reference_id = internal user id; metadata is the closed correlation payload |
| `checkout.session.async_payment_succeeded` | checkout_async_payment_succeeded | `obj:{session.id}` | checkout correlation status | stripeWebhook.test.ts "routing table" | SEPA path; money truth still arrives via `invoice.paid` |
| `checkout.session.async_payment_failed` | checkout_async_payment_failed | `obj:{session.id}` | checkout correlation status | stripeWebhook.test.ts "routing table" | no ledger effect; subscription events carry entitlement truth |

## Subscriptions

| Event | Handler intent | Idempotency key | Local effects | Test reference | Notes |
|---|---|---|---|---|---|
| `customer.subscription.created` | subscription_state_sync | `objv:{subscription.id}:{event.created}` | subscriptions (cache upsert) | stripeWebhook.test.ts "routing table" | refetch; latest-wins per object version |
| `customer.subscription.updated` | subscription_state_sync | `objv:{subscription.id}:{event.created}` | subscriptions (cache upsert) | stripeWebhook.test.ts "routing table" | refetch; single source of subscription-status truth |
| `customer.subscription.deleted` | subscription_state_sync | `objv:{subscription.id}:{event.created}` | subscriptions (cache upsert, status canceled) | stripeWebhook.test.ts "routing table" | refetch |

## Subscription schedules (15-month benefit)

| Event | Handler intent | Idempotency key | Local effects | Test reference | Notes |
|---|---|---|---|---|---|
| `subscription_schedule.created` | schedule_state_sync | `objv:{schedule.id}:{event.created}` | partner_benefit_uses (schedule linkage) | stripeWebhook.test.ts "routing table" | echo of our own idempotent creation |
| `subscription_schedule.updated` | schedule_state_sync | `objv:{schedule.id}:{event.created}` | partner_benefit_uses (schedule linkage) | stripeWebhook.test.ts "routing table" | refetch |
| `subscription_schedule.released` | schedule_state_sync | `objv:{schedule.id}:{event.created}` | partner_benefit_uses (schedule linkage) | stripeWebhook.test.ts "routing table" | normal end: phase 2 continues as plain subscription |
| `subscription_schedule.canceled` | schedule_state_sync | `objv:{schedule.id}:{event.created}` | partner_benefit_uses (schedule linkage) | stripeWebhook.test.ts "routing table" | phase-1 cancellation semantics (benefit stays consumed) |
| `subscription_schedule.completed` | schedule_state_sync | `objv:{schedule.id}:{event.created}` | partner_benefit_uses (schedule linkage) | stripeWebhook.test.ts "routing table" | refetch |

## Invoices (the money truth)

| Event | Handler intent | Idempotency key | Local effects | Test reference | Notes |
|---|---|---|---|---|---|
| `invoice.finalized` | invoice_finalized | `objv:{invoice.id}:{event.created}` | invoice mirror | stripeWebhook.test.ts "routing table" | pre-payment fact; applied directly |
| `invoice.paid` | commissionable_payment | `obj:{invoice.id}` | commission_entries; referral_attributions (lock on first commissionable payment); invoice mirror | stripeWebhook.test.ts "commissionable payments" | refetch; ONE entry per invoice |
| `invoice.payment_succeeded` | commissionable_payment | `obj:{invoice.id}` | commission_entries; referral_attributions; invoice mirror | stripeWebhook.test.ts "commissionable payments" | same object scope as `invoice.paid` — the pair can never double-book one invoice |
| `invoice.payment_failed` | payment_failure_notice | `objv:{invoice.id}:{event.created}` | invoice mirror (dunning state) | stripeWebhook.test.ts "routing table" | no entry for failed payments; subscription.updated carries status truth |
| `invoice.payment_action_required` | payment_failure_notice | `objv:{invoice.id}:{event.created}` | invoice mirror (dunning state) | stripeWebhook.test.ts "routing table" | SCA/action-required path |
| `invoice.voided` | invoice_voided | `obj:{invoice.id}` | commission_adjustments (full reversal if an entry exists); invoice mirror | stripeWebhook.test.ts "routing table" | append-only reversal — history never mutated |
| `invoice.marked_uncollectible` | invoice_uncollectible | `obj:{invoice.id}` | commission_adjustments (full reversal if an entry exists); invoice mirror | stripeWebhook.test.ts "routing table" | append-only reversal |

## Payment intents (async/SEPA progress)

| Event | Handler intent | Idempotency key | Local effects | Test reference | Notes |
|---|---|---|---|---|---|
| `payment_intent.processing` | payment_intent_progress | `objv:{payment_intent.id}:{event.created}` | conversion intent correlation (async path) | stripeWebhook.test.ts "routing table" | keeps monthly entitlement intact (conversion machine) |
| `payment_intent.succeeded` | payment_intent_progress | `objv:{payment_intent.id}:{event.created}` | conversion intent correlation | stripeWebhook.test.ts "routing table" | ledger trigger stays `invoice.paid` |
| `payment_intent.payment_failed` | payment_intent_progress | `objv:{payment_intent.id}:{event.created}` | conversion intent correlation | stripeWebhook.test.ts "routing table" | conversion machine → failed; monthly intact |
| `payment_intent.canceled` | payment_intent_progress | `objv:{payment_intent.id}:{event.created}` | conversion intent correlation | stripeWebhook.test.ts "routing table" | |

## Refunds

| Event | Handler intent | Idempotency key | Local effects | Test reference | Notes |
|---|---|---|---|---|---|
| `charge.refunded` | refund_reversal | `obj:{charge.id}` | commission_adjustments (proportional reversal, round-half-up) | stripeWebhook.test.ts "routing table" | refetch charge for current refund totals |
| `refund.created` | refund_reversal | `obj:{refund.id}` | commission_adjustments | stripeWebhook.test.ts "routing table" | PINNED-API CAVEAT: only emitted on newer API versions; older pins deliver refund changes via charge.refund.updated |
| `refund.updated` | refund_reversal | `obj:{refund.id}` | commission_adjustments (reconcile amount/status change) | stripeWebhook.test.ts "routing table" | |
| `charge.refund.updated` | refund_reversal | `obj:{refund.id}` | commission_adjustments | stripeWebhook.test.ts "routing table" | legacy event name for `refund.updated` on older pinned API versions — routed identically |

## Disputes

| Event | Handler intent | Idempotency key | Local effects | Test reference | Notes |
|---|---|---|---|---|---|
| `charge.dispute.created` | dispute_lifecycle | `objv:{dispute.id}:{event.created}` | dispute mirror | stripeWebhook.test.ts "routing table" | no money movement yet |
| `charge.dispute.updated` | dispute_lifecycle | `objv:{dispute.id}:{event.created}` | dispute mirror | stripeWebhook.test.ts "routing table" | refetch |
| `charge.dispute.closed` | dispute_lifecycle | `objv:{dispute.id}:{event.created}` | dispute mirror | stripeWebhook.test.ts "routing table" | funds events already booked the movements |
| `charge.dispute.funds_withdrawn` | dispute_lifecycle | `obj:{dispute.id}` | commission_adjustments (reversal); dispute mirror | stripeWebhook.test.ts "routing table" | money-movement fact |
| `charge.dispute.funds_reinstated` | dispute_lifecycle | `obj:{dispute.id}` | commission_adjustments (re-credit); dispute mirror | stripeWebhook.test.ts "routing table" | append-only re-credit |

## Connect — partner accounts

| Event | Handler intent | Idempotency key | Local effects | Test reference | Notes |
|---|---|---|---|---|---|
| `account.updated` | connect_account_status | `objv:{account.id}:{event.created}` | partner account status mirror (charges/payouts enabled, requirements) | stripeWebhook.test.ts "routing table" | refetch; drives partner onboarding status |

## Connect — transfers

| Event | Handler intent | Idempotency key | Local effects | Test reference | Notes |
|---|---|---|---|---|---|
| `transfer.created` | transfer_status | `obj:{transfer.id}` | partner_payout_items (transfer linkage) | stripeWebhook.test.ts "routing table" | echo of our own deterministic-key transfer |
| `transfer.updated` | transfer_status | `objv:{transfer.id}:{event.created}` | partner_payout_items (transfer linkage) | stripeWebhook.test.ts "routing table" | refetch |
| `transfer.reversed` | transfer_status | `obj:{transfer.id}` | commission_adjustments (negative carry-forward); partner_payout_items | stripeWebhook.test.ts "routing table" | reversal re-opens the partner balance |

## Connect — payouts

| Event | Handler intent | Idempotency key | Local effects | Test reference | Notes |
|---|---|---|---|---|---|
| `payout.created` | payout_status | `objv:{payout.id}:{event.created}` | partner_payouts (status mirror) | stripeWebhook.test.ts "routing table" | |
| `payout.updated` | payout_status | `objv:{payout.id}:{event.created}` | partner_payouts (status mirror) | stripeWebhook.test.ts "routing table" | refetch |
| `payout.paid` | payout_status | `objv:{payout.id}:{event.created}` | partner_payouts (status mirror) | stripeWebhook.test.ts "routing table" | closes the payout loop |
| `payout.failed` | payout_status | `objv:{payout.id}:{event.created}` | commission_adjustments (carry-forward); partner_payouts | stripeWebhook.test.ts "routing table" | failed payout re-opens the balance |
| `payout.canceled` | payout_status | `objv:{payout.id}:{event.created}` | commission_adjustments (carry-forward); partner_payouts | stripeWebhook.test.ts "routing table" | |

## Out-of-matrix events

Anything not listed above is acknowledged with 200 and NEVER written to `stripe_webhook_events`
(`routeWebhookEvent` → null). The v1 endpoint (`stripe-subscription-webhook`) keeps its own
narrower matrix and remains untouched.

Table-name notes: `stripe_webhook_events`, `commission_entries`, `commission_adjustments`,
`partner_payouts`, `partner_payout_items`, `partner_benefit_uses`, `referral_attributions`,
`billing_customers` and `subscriptions` are the locked names (IMPLEMENTATION_STATUS.md §2 +
migration 0003). "invoice mirror", "dispute mirror", "checkout correlation", "conversion
intent correlation" and "partner account status mirror" are track D schema surface whose final
table names land with the 0014+ migrations; this matrix describes the effects, the code keeps
the same descriptions in `WEBHOOK_EVENT_INTENTS`.
