# Billing / Partner Platform — Data Architecture (Track D)

Scope: the §14 domain model as shipped in migrations `0014`–`0021` plus the pure
entitlement resolver (`src/billing/entitlements/`). Aligned with the locked
decisions in `IMPLEMENTATION_STATUS.md` §2. Migrations are FILE-FIRST: committed
and guard-tested (`src/billing/migrations/billingPlatform.migration.test.ts`);
the OWNER applies them.

## 1. Principles (from the locked decisions)

- **Postgres is the authority; Edge Functions do Stripe I/O.** Every financial
  mutation is service-role only: no new table has ANY client insert/update/
  delete grant or policy. Clients get selective read-own SELECT policies.
- **Money is integer cents, EUR, no floats** — enforced by column types and
  `currency = 'eur'` CHECKs (guard-tested: no numeric/float/money types).
- **History is never mutated**: `commission_entries` is immutable,
  `commission_adjustments` and `audit_log` are append-only (no updated_at, no
  touch trigger), reversals are appended rows, payouts reference ledger rows.
- **Time**: everything stored `timestamptz` (UTC). Commission/payout months are
  Europe/Madrid calendar months stored as the month's first day (`date` +
  `extract(day from month) = 1` CHECK).
- **Stripe ids are never invented**: catalog `stripe_product_id`/
  `stripe_price_id` are NULL until Nicolas configures Sandbox/Live objects;
  ledger rows carry Stripe ids as durable text so they stand alone.

## 2. Table map and ownership (who writes)

| Migration | Table | Purpose | Written by |
|---|---|---|---|
| 0014 | `billing_price_catalog` | The 11 locked offers; price → product authority | admin tooling (service role) |
| 0015 | `customer_subscriptions` | Catalog-aware Stripe subscription cache (extends, never replaces, the 0003 `subscriptions` cache) | webhook v2 / benefit orchestrator |
| 0015 | `entitlements` | Explicit access grants — the resolver's input | webhook, partner approval, invite redemption, admin |
| 0015 | `subscription_conversion_intents` | Idempotent 15m→12m / monthly→yearly conversion state machine | conversion Edge Function |
| 0016 | `partner_applications` | Application lifecycle | application/review Edge Functions |
| 0016 | `partners` | Immutable partner identity + Connect state | approval flow, Connect webhook |
| 0016 | `partner_codes` | Referral codes/slugs with rotation history | partner admin flow |
| 0017 | `referral_clicks` | Click evidence (no PII; never authority) | click-capture Edge Function |
| 0017 | `referral_attributions` | Attribution AUTHORITY, locked on first commissionable payment | attribution logic in webhook |
| 0017 | `partner_benefit_uses` | Single-use 15-month benefit ledger | benefit orchestrator |
| 0018 | `partner_tier_snapshots` | Tier in force per Madrid month | monthly snapshot job |
| 0018 | `commission_rules` | Versioned rate table (v1 = the 12 locked rates) | admin (new versions only) |
| 0018 | `commission_entries` | IMMUTABLE earned-commission ledger | webhook commission recorder |
| 0018 | `commission_adjustments` | APPEND-ONLY reversals/corrections | refund/dispute webhook, admin |
| 0019 | `payout_batches` | One idempotent run per month × currency × livemode | monthly payout job |
| 0019 | `partner_payouts` | Per-partner netting + Stripe transfer state | payout job |
| 0019 | `partner_payout_items` | Which ledger rows a payout settled | payout job |
| 0020 | `invite_code_slots` | The stable owner invite slots | invite admin Edge Function |
| 0020 | `invite_codes` | Hashed invite codes, versioned per slot | invite mint/rotate/redeem |
| 0021 | `stripe_webhook_events` | Durable, exactly-once webhook intake | webhook entry point |
| 0021 | `audit_log` | Append-only trail for privileged mutations | every service-role flow |

`billing_customers` + `subscriptions` (0003) remain untouched and keep serving
the current `planFromSubscription` read path until track F evolves it.

## 3. State machines

- **partner_applications.status**: `draft → submitted → under_review →
  approved | rejected`; post-approval mirror `approved → suspended →
  terminated`. One non-terminal application per user (partial unique).
- **referral_attributions.status**: `pending → active` (locked on first
  commissionable payment) `| superseded | expired`; `active → revoked`
  (fraud/admin). One ACTIVE owner per subscription (partial unique).
- **subscription_conversion_intents.status**: `pending → processing →
  completed`; `pending|processing → failed | cancelled | expired`. One
  in-flight intent per subscription (partial unique) + unique idempotency key.
- **commission_entries.status**: `held → eligible` (after
  `AFFILIATE_HOLD_FULL_CALENDAR_MONTHS` full Madrid months, precomputed into
  `eligible_at`) `→ paid`; `reversed` via an appended adjustment. Financial
  fields never change after insert; only `status` advances.
- **partner_payouts.status**: `pending → processing → paid | failed`;
  `skipped_below_threshold | skipped_negative_balance | skipped_not_payable`
  record months where no transfer ran (carry_forward_cents may be negative).
- **invite_codes.status**: `available → reserved → sent → redeemed`;
  `available|reserved|sent → expired | revoked`. Terminal states stay forever;
  rotation mints a new `(slot_id, version)` row linked by
  `replacement_code_id`. One open code per slot (partial unique).
- **stripe_webhook_events.state**: `received → processing → processed`;
  `→ skipped` (irrelevant type); `→ failed → processing` (retry, `attempts`++)
  `→ dead_letter` (max attempts).

## 4. Uniqueness spine (§14.14 — what the DB makes impossible)

| Rule | Constraint |
|---|---|
| Duplicate commission for one payment | `commission_entries (stripe_invoice_id)` unique where not null |
| Duplicate clawback for one refund event | `commission_adjustments (source_event_key)` unique where not null |
| Double 15-month benefit on a subscription | `partner_benefit_uses.stripe_subscription_id` HARD unique (+ `subscription_id` unique) |
| Two active attribution owners for one subscription | partial unique on `(subscription_id)` and `(stripe_subscription_id)` where status = 'active' |
| A payout month running twice | `payout_batches (month, currency, livemode)` unique |
| Paying a ledger row twice | `partner_payout_items (commission_entry_id)` / `(commission_adjustment_id)` globally unique where not null; payout `idempotency_key` unique |
| Duplicate webhook processing record | `stripe_webhook_events (account_scope, livemode, event_id)` unique |
| Two live owners of one code/slug | `partner_codes (code)` / `(slug)` unique where status = 'active' |
| Two open codes in one slot | `invite_codes (slot_id)` unique where status non-terminal |
| Duplicate active grant from one source | `entitlements (user_id, scope, source_type, source_id)` unique where status = 'active' |
| Two in-flight conversions of one subscription | partial unique + `idempotency_key` unique |
| Ambiguous rate lookup | `commission_rules (version, product, cadence, tier)` unique; tier snapshots unique per `(partner_id, month)` |

## 5. RLS summary

Every new table has RLS enabled. There are ZERO client write policies/grants.

| Read access | Tables |
|---|---|
| Customer reads own rows (`auth.uid() = user_id`) | `customer_subscriptions`, `entitlements`, `subscription_conversion_intents`, `referral_attributions` (user_id is the subscription owner), `partner_applications` |
| Authenticated reads public rows only | `billing_price_catalog` (`public_enabled = true`; 15m partner offers stay server-side) |
| Partner reads own rows (join through own `partners` row, `p.user_id = auth.uid()`) | `partners`, `partner_codes`, `partner_tier_snapshots`, `commission_entries`, `commission_adjustments`, `partner_payouts`, `partner_payout_items` |
| NOT client-readable (RLS on, no policy, no grant) | `referral_clicks`, `partner_benefit_uses`, `commission_rules`, `payout_batches`, `invite_code_slots`, `invite_codes`, `stripe_webhook_events`, `audit_log` |

Notes:
- `invite_codes` intentionally has NO select policy: validation happens
  server-side against `code_hash`; client-readable rows would allow invite
  enumeration. The customer-facing outcome is the granted entitlement row.
- `anon` gets nothing anywhere (demo sessions never see billing state).
- Policy subqueries run under the caller's own RLS — no security-definer
  helpers were introduced.

## 6. Deletion / financial-history stance

- Cache/state rows owned by a user (`customer_subscriptions`, `entitlements`,
  `subscription_conversion_intents`, `partner_applications`) cascade on user
  deletion, matching the 0003 precedent.
- Financial anchors do NOT cascade: `partners.user_id`,
  `referral_attributions.user_id`, `partner_benefit_uses.user_id` reference
  `auth.users` without cascade — deleting such a user fails loudly by design;
  offboarding/erasure is a documented manual process (ROLLBACK_PLAN.md §
  "never delete financial history").
- Ledger rows soft-link the subscription cache (`on delete set null`) and keep
  durable Stripe ids as text, so financial history survives cache removal.

## 7. Entitlement resolution (pure layer)

`src/billing/entitlements/entitlementResolver.ts` — pure, time-injectable:

- Input: the caller's `entitlements` rows verbatim; output: `hasHome`,
  `hasPro`, `hasPartnerMode`, per-scope `sources` (why), `expiresAt`, and an
  `explanation` trail.
- A row grants only if `status = 'active'` AND `starts_at <= now` AND
  (`ends_at` null OR `> now`). Revoked/expired/future rows never grant (they
  appear in the trail). Unknown statuses/scopes are inert (forward-compatible).
- Overlaps resolve to the longest-living active grant (open-ended beats any
  date); revoking one source never hides another.
- The resolver reports scopes VERBATIM — whether Pro implies Home-derived
  capabilities is decided in the capability layer (`src/access/plans.ts`),
  which consumes the resolver's output (decision 8). This slice does not
  change `src/access/**`.

## 8. Alignment with the other tracks

- Track E (pure domain logic) computes what these tables store: Madrid month
  boundaries, hold dates (`eligible_at`), netting/threshold/carry-forward,
  tier evaluation, code state machines.
- Track F (Stripe surface) writes these tables from Edge Functions: webhook v2
  (via `stripe_webhook_events`), checkout/portal/Connect sessions, and the
  typed TS mirror of `billing_price_catalog`.
- Integration order stays D → E → F (IMPLEMENTATION_STATUS §4).
