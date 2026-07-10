# Stripe subscription webhook writer (2B.3) — source ready, NOT deployed

_Created 2026-07-10. Companion to
[ACCEPTED_CORRECTION_PERSISTENCE_PLAN.md](ACCEPTED_CORRECTION_PERSISTENCE_PLAN.md) §9 and the
Phase 2B.1 billing migration `0003_billing_subscriptions.sql`._

**Status: the function source exists at
`supabase/functions/stripe-subscription-webhook/index.ts` (+ pure `mapping.ts`) and is
NOT deployed** — the live project still has zero Edge Functions, and deploying is an explicit
owner approval (checklist below). **Until it is deployed, subscription freshness remains a
manual owner action**: the tier policy (migration `0013`) reads the server-written
`public.subscriptions` cache, and today only the owner updates that cache at service level.
Nothing in this slice changed live behavior.

## 1. Why this function exists

Migration `0013` made accepted-correction INSERT tier-enforced at the DB: the RLS policy trusts
`public.subscriptions` because clients have zero write grants there (0003). The one honesty
caveat left was freshness — Stripe is the source of truth, but nothing mirrors Stripe state into
the cache automatically. This webhook is that writer: **the ONLY writer of
`public.subscriptions` and `public.billing_customers`**, running server-side with the service
role, authenticated by Stripe SIGNATURES (not JWTs).

## 2. Schema audit (Phase-1 result: no migration needed)

`public.subscriptions` (0003) already carries everything the writer needs — `user_id`,
`stripe_customer_id`, `stripe_subscription_id` (**unique** → idempotent upsert anchor),
`stripe_price_id`, `subscription_status`, `current_period_end`, `cancel_at_period_end`, and
`updated_at` via the touch trigger. `public.billing_customers` (0003) is the user ↔ Stripe
customer mapping (currently **0 rows** — the owner's subscription row was seeded directly, which
is why the mapping table is empty). No admin-override fields exist or are needed. **No
`subscriptions_webhook_fields` proposal is required.**

## 3. Event contract

| Stripe event | Route | Action |
|---|---|---|
| `checkout.session.completed` | customer_mapping | upsert `billing_customers` from `client_reference_id` (the 2B.2 checkout creator MUST set it to the auth user id); session without user/customer ref → acknowledged no-op |
| `customer.subscription.created` / `updated` / `deleted` | subscription_upsert | build the CLOSED row and upsert on `stripe_subscription_id`; `deleted` forces status `canceled` |
| `invoice.payment_succeeded` / `payment_failed` | acknowledge_noop | observed only — Stripe always follows payment transitions with `customer.subscription.updated`, our single source of truth per subscription object |
| anything else | acknowledge_unsupported | 200, logged as type only — never a crash, never a write |

**Decision order for subscription events (pinned by unit tests):**
1. empty `STRIPE_PRO_PRICE_IDS` allowlist → `ignore_no_allowlist_configured` (200; the writer
   refuses to grant tier on unconfigured mapping);
2. price not in the allowlist (or missing) → `ignore_unlisted_price` (200; a random Stripe
   product can never become PI Pro — necessary because `planFromSubscription` derives Pro from
   STATUS, not price);
3. customer with no `billing_customers` mapping → `retry_unmapped_customer` (**409**, so Stripe
   redelivers with backoff until the `checkout.session.completed` race resolves);
4. otherwise upsert.

**Status mapping** mirrors `planFromSubscription` exactly (lockstep-tested against
`src/access/subscription.ts`): `active` | `trialing` → Pro; `past_due` → Pro until
`current_period_end`; `canceled` / everything else / unknown-future statuses → free (unknown
statuses are stored verbatim and fail-safe to free downstream).

**API-version robustness (adversarial-review fix):** Stripe's 2025 "Basil" versions moved
`current_period_end` from the Subscription object to the SubscriptionItem; the handler reads BOTH
locations so `past_due` grace can never silently null out regardless of the endpoint's pinned API
version (the payload shape follows the ENDPOINT's version, not the SDK's).

**Idempotency / ordering:** the closed row builder is deterministic and the upsert is keyed on
the unique `stripe_subscription_id` — a redelivered event rewrites the identical row. Each Stripe
event carries the FULL subscription state at event time, so out-of-order delivery can at worst
briefly regress to a slightly older state and self-heals on the next event (accepted v1
trade-off, stated here rather than hidden; a `stripe_event_created_at` high-water-mark column is
the future fix if it ever matters at scale).

## 4. Required environment (names only — values are NEVER committed)

| Env var | Purpose |
|---|---|
| `STRIPE_WEBHOOK_SIGNING_SECRET` | verify the `stripe-signature` header over the RAW body — the request authentication |
| `STRIPE_SECRET_KEY` | constructs the Stripe SDK client for signature verification; v1 makes NO Stripe API calls |
| `STRIPE_PRO_PRICE_IDS` | comma-separated allowlist of the PI Pro price id(s); tests use `price_fake_*` only |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | auto-injected by the edge runtime; the service role is required because clients (correctly) have zero write grants on the billing tables |

## 5. Security invariants (test-pinned)

- signature verified BEFORE any DB access; unsigned/invalid → 400, nothing written;
- tier can never be client-supplied: inputs are the verified event, the env allowlist and the
  server-side mapping table;
- writes touch exactly `subscriptions` + `billing_customers` (closed field lists, no spread of
  Stripe objects); never `accepted_corrections`, Mapper, products, PAC/POD, statuses, recipes or
  stock; no `.update(`/`.delete(`;
- logs carry event type + object ids only — no payloads, no amounts, no emails, no secrets;
- source contains env NAMES only; scans forbid `whsec_`/`sk_live`/`sk_test`/real-looking
  `price_` literals.

## 6. How it feeds the accepted-correction tier chain

`Stripe (truth) → this webhook (only writer) → public.subscriptions (client-unwritable cache) →
0013 INSERT policy (DB enforcement) + planFromSubscription (app gating)`. Once deployed, a
canceled/expired subscription propagates to the cache automatically and both the UI gate and the
DB policy flip to free with no owner action.

## 7. Deployment checklist (owner approval required — NOT executed)

1. Configure a Stripe webhook endpoint (test mode first) pointing at
   `https://<project-ref>.supabase.co/functions/v1/stripe-subscription-webhook`, subscribed to
   exactly the six §3 events; note its signing secret.
2. Set function secrets: `STRIPE_WEBHOOK_SIGNING_SECRET`, `STRIPE_SECRET_KEY`,
   `STRIPE_PRO_PRICE_IDS` (via `supabase secrets set` / dashboard — never the repo).
3. Deploy **with JWT verification disabled** (`supabase functions deploy
   stripe-subscription-webhook --no-verify-jwt`) — Stripe cannot send a Supabase JWT; the Stripe
   signature IS the authentication.
4. Local/test verification (`stripe` CLI): `stripe listen --forward-to <function-url>` +
   `stripe trigger customer.subscription.created` etc.; verify a `billing_customers` +
   `subscriptions` row appears for a TEST-mode checkout, then flip statuses
   (`stripe trigger customer.subscription.deleted`) and confirm `planFromSubscription` derives
   free and an accepted-correction insert is DB-denied.
5. Re-verify the no-touch baseline (mapper_basement 542, products 69, PAC/POD 0/69,
   pi_calculated 1) and that `accepted_corrections` grants/policies are unchanged.
6. Only then attach the production Stripe endpoint.

**Rollback:** delete the function (`supabase functions delete stripe-subscription-webhook`) and
disable the Stripe endpoint — the cache simply stops receiving updates and reverts to the
current manual-freshness state; no schema or data changes to undo.

## 8. What this slice deliberately did NOT do

- No deploy (live project re-verified at zero Edge Functions), no secrets touched, no Stripe
  dashboard/live-settings changes, no real subscription rows written.
- No schema migration (none needed, §2).
- No client changes: the app keeps reading `subscriptions` via the read-only billing service.
