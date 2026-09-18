# Monthly → Annual conversion — the missing backend contract

**Owner decision: 2026-09-18. Status: client-side authority DONE, Stripe execution NOT BUILT.**

This document exists because the conversion rule the owner specified deliberately
**diverges from Stripe's default proration**. The divergence is a business decision,
not an implementation detail, so it is written down before any Edge Function is
built — and no part of it is worked around in the UI.

---

## 1. The rule

> The **entire amount paid for the current monthly period** is credited against the
> annual price, no matter how much of that month has elapsed. The annual term then
> **starts at the current monthly period start**, so the already-paid month becomes
> month 1 of 12 — twelve new months are not appended after it.

At the locked standard prices:

| Plan | Monthly | Annual   | Credit  | Due on conversion |
| ---- | ------- | -------- | ------- | ----------------- |
| Home | 9,99 €  | 49,00 €  | 9,99 €  | **39,01 €**       |
| Pro  | 24,99 € | 199,00 € | 24,99 € | **174,01 €**      |

Converting on day 2, day 15 or day 28 of the monthly period costs exactly the same.

Only the **current** period is credited. Historical months are never accumulated.

**Why not Stripe's default.** `proration_behavior: 'create_prorations'` credits only
the _unused time_ remaining in the period. Under that default a customer who converts
late in the month gets almost nothing back, which contradicts the promise the
`/subscription` page makes („zacznij miesięcznie — nic nie tracisz"). Fixed credit is
the point of the offer, so the server must override the default rather than inherit it.

---

## 2. What already exists (do not rebuild)

| Concern                                                                | Module                                                                           | State                              |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------- |
| Prices, lookup keys, offer eligibility                                 | `src/billing/catalog/priceCatalog.ts`                                            | DONE, test-pinned                  |
| Displayed prices + annual economics                                    | `src/billing/catalog/offerDisplay.ts`                                            | DONE                               |
| Conversion state machine (`draft → … → completed`)                     | `src/billing/catalog/conversionStateMachine.ts`                                  | DONE, exhaustive transition matrix |
| **Credit authority** (`buildConversionQuote`, `MONTHLY_CREDIT_POLICY`) | same file                                                                        | **DONE (2026-09-18)**              |
| Entitlement resolution                                                 | `src/billing/entitlements/entitlementResolver.ts`                                | DONE                               |
| Checkout session (monthly & yearly, first purchase)                    | `supabase/functions/create-checkout-session` + `src/services/billingCheckout.ts` | DONE                               |
| Webhook → entitlement writes                                           | `supabase/functions/stripe-webhook/effects.ts`                                   | DONE                               |
| `subscription_conversion_intents` table                                | `ARCHITECTURE.md` §0015                                                          | SPECIFIED                          |

`buildConversionQuote()` is **pure and shared**: the server must call the same
function over the authoritative subscription row. The client preview is never trusted.

---

## 3. What is missing

### 3.1 Edge Function `create-conversion-preview`

Authenticates from the JWT. Never accepts an amount or a price id from the client.

**Request** `{ }` — the subscription is resolved from the caller's identity.

**Response 200**

```jsonc
{
  "offerKey": "home_yearly_standard", // resolved server-side from the active monthly offer
  "creditCents": 999, // = the full current monthly price
  "amountDueCents": 3901,
  "taxCents": 0,
  "annualPeriodStart": "2026-09-10", // = current monthly period start
  "newRenewalDate": "2027-09-10", // = annualPeriodStart + 12 months
  "effectiveMonthlyCents": 408,
  "prorationTimestamp": 1789000000,
}
```

Built by calling `buildConversionQuote()` with `monthlyAmountCents` and
`annualAmountCents` read from `PRICE_CATALOG`, and `currentPeriodStart` read from the
subscription row — **never from the request body**.

**Errors** `unauthorized`, `no_active_monthly_subscription`,
`already_annual`, `conversion_in_flight`, `billing_not_configured`.

### 3.2 Edge Function `confirm-conversion`

**Request** `{ prorationTimestamp, idempotencyKey }`.

Feeds `transition()` with `{ type: 'confirm', … }`. A `prorationTimestamp` that does
not match the stored preview is refused with `proration_timestamp_mismatch` and the
client must re-preview — the machine already enforces this.

### 3.3 The Stripe mechanics — NOT YET VERIFIED

Two invariants must hold simultaneously, and Stripe does not give either of them for
free on a plain `subscriptions.update`:

**(a) Credit = the full monthly price, not unused time.**
The intended mechanism is `proration_behavior: 'none'` on the price swap plus an
explicit customer balance credit of the monthly amount
(`customers.createBalanceTransaction({ amount: -monthlyAmountCents, currency: 'eur' })`)
applied **before** the annual invoice is finalized, so the invoice settles at
`annual − monthly`. The balance transaction must carry the conversion intent id in
`metadata` so the webhook can correlate it and so a retry cannot double-credit.

**(b) The annual term ends 12 months after the _current period start_.**
`subscriptions.update` accepts `billing_cycle_anchor: 'now' | 'unchanged'` only —
neither yields an anchor in the past. Reaching the required renewal date needs a
`subscription_schedules` amendment whose phase carries an explicit `end_date` of
`annualPeriodStart + 12 months`, in the same family as the existing 15-month
orchestration (`scheduleOrchestration.ts`).

**This combination has not been exercised against a Stripe Sandbox.**
`IMPLEMENTATION_STATUS.md` already records Stripe execution as pending Sandbox, and
this contract does not change that. The mechanism above is the design intent, not a
verified result — it must be proven in Sandbox before it ships, and if Stripe cannot
express (b) safely, the correct response is to bring the constraint back to the owner,
**not** to approximate it in the client.

### 3.4 Webhook correlation

`payment_intent.processing` / `.succeeded` / `.payment_failed` are already routed
(`WEBHOOK_MATRIX.md`). They must drive the conversion machine's
`payment_started` / `payment_succeeded` / `payment_failed` events. The SEPA
(asynchronous) window keeps the **monthly** entitlement fully intact —
`entitlementDuring()` already encodes that, and only `completed` flips to annual.

---

## 4. What the UI may and may not say

- A **plan card** on `/subscription` states the promise only:
  „Zacznij miesięcznie. Jeśli przejdziesz na plan roczny, opłacony bieżący miesiąc
  zaliczymy na jego cenę — nic nie tracisz."
- The **exact top-up** (39,01 € / 174,01 €) appears **only** in the conversion preview,
  from the server quote. It is never printed on a plan card for a visitor who has not
  started converting, and never computed in a component.

---

## 5. Not in scope here

Monthly→annual **reminders** (7 / 3 / 2 / 1 days and a few hours before renewal) are a
separate block. This repository has **no** notification or scheduling infrastructure
today — no `notifications` table, no cron, no transactional mail — so reminders are a
build from zero and are explicitly sequenced after a working conversion.
