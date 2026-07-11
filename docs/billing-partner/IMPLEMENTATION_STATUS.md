# Billing / Partner Platform — Implementation Status

Master spec: the v1.0 FINAL "Billing, Subscriptions, Partner Platform, Invite Codes, Stripe
Connect and Automated Payouts" prompt (single source of truth). This document tracks the audit,
locked architecture decisions, phase progress, evidence, and every external (Nicolas) dependency.

Base commit: `0a01827` (main). Business timezone: `Europe/Madrid`.

---

## 1. Phase A audit findings (2026-07-11)

### Stack
- **Client-only SPA**: Vite 6 + React 19 + TypeScript, vitest (node env, no jsdom), ESLint,
  Tailwind. No Node/Next server exists → **the server surface is Supabase**: Postgres
  (migrations + RLS + constraints) and **Edge Functions (Deno)**. Background work =
  `pg_cron`-invoked Edge Functions (nothing scheduled yet).
- **Auth**: Supabase Auth. Verified email = `auth.users.email_confirmed_at`. Google/email/
  magic-link are defined in the locked Account Access pack (`docs/account-access/`); the app
  currently uses Supabase session auth with a dev-only plan override.
- **DB**: Supabase Postgres, migrations `0001`–`0013` (file-first convention: migrations are
  committed + guard-tested in vitest; the OWNER applies them — 0011/0013 precedent).
- **Localization**: copy modules (`src/copy/en.ts`, feature-local copy files; PL-first UI).
- **Email provider**: none — an adapter must be introduced (documented, not configured).
- **Observability**: none beyond structured console + tests; Supabase logs available.

### Existing billing code (reused, not replaced)
- `supabase/migrations/0003_billing_subscriptions.sql`: `billing_customers` (user↔Stripe
  customer, unique both ways) + `subscriptions` cache (status, price id, period end,
  cancel_at_period_end) — read-own RLS, **no client write path**. KEEP as the v1 cache;
  new tables extend around it.
- `supabase/functions/stripe-subscription-webhook/` (source only, **never deployed**): pure
  `mapping.ts` (event routing, status mapping, price allowlist, closed upsert payload) +
  `index.ts` (signature verification, service-role writes). This is the seam the full webhook
  architecture extends.
- `src/access/subscription.ts::planFromSubscription`: active|trialing→paid; past_due→paid
  until period end; else free. **Price-id-agnostic — the documented Home-vs-Pro gap.** This
  slice introduces the server-owned price catalog that maps price → product (HOME/PRO), the
  prerequisite for closing the gap.
- `src/access/plans.ts` capabilities (demo/free/pro incl. `canViewExactGrams`,
  `canApplyStarterToStudio`) — the entitlement resolver must feed this, not replace it.
- `accepted_corrections` RLS 0013: tier-gated on any active subscription (Pro-only semantics
  pending the product split — tracked, not changed silently).

### Constraints inherited from repo governance
- Migrations are FILE-FIRST (committed + guard-tested); owner applies to live. No live DB
  writes in this slice without explicit owner approval.
- No Edge Function deployment by Claude; sources + tests only. No secrets in repo or chat.
- Never invent Stripe IDs; env placeholders + lookup-key validation until Nicolas provides
  Sandbox IDs.

## 2. Locked architecture decisions

1. **Server surface**: Postgres (authority) + Edge Functions (Stripe I/O). All financial
   mutations service-role only; RLS exposes partner-own aggregates and customer-own state.
2. **Money**: integer cents everywhere; EUR; no floats. Deterministic rounding documented per
   calculation (proportional refund reversal: round-half-up on cents of the proportional
   product).
3. **Ledger**: immutable `commission_entries` + append-only `commission_adjustments`;
   payouts reference entries via `partner_payout_items`. History is never mutated.
4. **Time**: store UTC; compute month boundaries in `Europe/Madrid` via a pure, tested
   calendar module (two-FULL-calendar-month hold; monthly snapshot/payout on the 1st).
5. **Catalog**: server-owned `billing_price_catalog` (DB) mirrored by a typed TS catalog with
   the 11 locked lookup keys; startup/diagnostic validator compares env-provided Stripe IDs +
   fetched Price shape against expectations; UI only ever receives server-resolved offer keys.
6. **15-month benefit**: Stripe Subscription Schedules (phase 1 = one 15-month iteration at
   the technical price, phase 2 = the mapped 12-month price). Orchestrated idempotently;
   `partner_benefit_uses` unique row prevents reuse.
7. **Attribution**: internal DB is the source of truth (`referral_attributions`, locked on
   first commissionable payment); signed cookie/link state is evidence, never authority;
   30-day window; explicit code can override an unconverted cookie.
8. **Entitlements**: explicit `entitlements` rows (paid_subscription / approved_partner /
   admin_grant / invite_home_trial) resolved server-side; capability layer consumes the
   resolver's output. Partner/invite grants never create Stripe objects.
9. **Webhooks**: durable `stripe_webhook_events` table (unique event key, state machine,
   retry), raw-body signature verification, duplicate/out-of-order tolerant handlers that
   re-fetch current objects; exact event list in `WEBHOOK_MATRIX.md`.
10. **Payouts**: Stripe Connect (hosted onboarding, Express-style), separate charges &
    transfers; monthly idempotent batch (advisory lock, threshold EUR 25 default, negative
    carry-forward), transfers with deterministic idempotency keys.
11. **Stripe API version**: pinned via `STRIPE_API_VERSION` env + a repo constant
    (`src/billing/catalog/stripeApiVersion.ts`); chosen at first sandbox integration once
    Nicolas's account is ready — placeholder documented until then.

## 3. Phase plan and status

| Phase | Scope | Status |
|---|---|---|
| A | Audit, architecture, docs, Nicolas handoff | **DONE** |
| B | Schema migrations (file-first) + entitlement resolver + catalog & env validator + webhook durability design | **DONE (file-first)** — 0014–0021 committed + guard-tested; owner application pending |
| C | Checkout/portal Edge Function sources + pricing eligibility logic | **DONE (source-level)** — deploy + wiring pending Sandbox |
| D | 15-month benefit + conversion state machine (pure) | **DONE (pure logic)** — schedule orchestration invariants + conversion machine tested; Stripe execution pending Sandbox |
| E | Partner platform UI/admin | NOT STARTED (next slice; foundations ready) |
| F | Commission engine + tiers + hold | **DONE (pure logic)** — v1 rates/tiers/hold/netting fully tested; wiring to webhook dispatch pending |
| G | Connect onboarding + payout batch | Logic DONE; onboarding-link source DONE; batch worker + transfers pending Sandbox |
| H | Invite codes | Logic DONE (codes/slots/redemption guard); admin UI + email delivery NOT STARTED |
| I | Hardening, sandbox E2E, acceptance | BLOCKED EXTERNALLY (needs Sandbox IDs/keys from Nicolas) |

## 4. Parallel implementation tracks (worktrees)

- **Track D — schema & entitlements** (`slice/billing-schema-entitlements`): migrations
  0014+ for the full §14 domain model with RLS/constraints + guard tests; pure entitlement
  resolver (`src/billing/entitlements/`); `ARCHITECTURE.md`, `ENVIRONMENT_VARIABLES.md`,
  `ROLLBACK_PLAN.md`.
- **Track E — financial domain logic** (`slice/billing-domain-logic`): pure `src/billing/domain/`
  modules — commission rules (versioned, all 12 tier×product×cadence rates), tier snapshots
  (100-active Gold, Elite override), Europe/Madrid hold dates, payout netting/threshold/
  carry-forward, proportional refund reversal, partner-code + invite-code logic and state
  machines, attribution rules; `TEST_MATRIX.md`.
- **Track F — Stripe surface** (`slice/billing-stripe-surface`): typed price catalog + config
  validator (`src/billing/catalog/`), catalog-aware product mapping evolution of
  `src/access/subscription.ts` (backward compatible), webhook event matrix + extended pure
  routing, Edge Function sources (webhook v2, checkout session, portal session, Connect
  onboarding link) with fixture tests; conversion state machine; `WEBHOOK_MATRIX.md`.

Integration order: D → E → F (orchestrator), full gates, honest acceptance matrix.

## 5. Nicolas actions required (see NICOLAS_STRIPE_HANDOFF.md)

Everything in the handoff checklist; nothing implemented here requires a secret to compile or
test. First unblockers: Sandbox Product/Price IDs for the 11 lookup keys + chosen tax behavior
+ pinned API version + webhook signing secret (into the secret manager, never the repo).

## 6. Evidence log

- 2026-07-11 — Phase A committed (`07a78ca`).
- 2026-07-11 — Track D merged: migrations 0014–0021 (21 tables, RLS, 11-offer + 12-rate seeds),
  82 guard tests + 17 resolver tests. Track E merged: 9 pure domain modules, 324 tests (all 12
  rates, Madrid hold calendar incl. DST/leap, 39-edge lifecycle, tier boundaries 99/100/101,
  thresholds 2499/2500/2501). Track F merged: 11-offer catalog + validator (secrecy pinned),
  catalog-aware `productFromSubscription` (zero existing pins changed), 40-event webhook matrix
  (doc-lockstep-tested), 4 Edge Function sources, conversion state machine (56-pair sweep),
  194 tests. Orchestrator sync: webhook/Connect sources reconciled to the 0021/0016 column
  vocabulary (`event_id` composite key + `livemode`; partners `status`-only eligibility,
  `stripe_connect_account_id`).
- Combined gates at integration: `tsc -b --force` clean · lint clean · full vitest suite green
  (see final report for exact count) · production build clean. SQL statically guard-tested;
  never executed against Postgres in this slice (owner applies).

## 6a. Stripe Sandbox provisioning (2026-07-11, via Stripe MCP)

Account `acct_1Ts0jzADcB1viept`, **Test Mode proven** (`GET /v1/balance` livemode:false, twice).
- Products: Home `prod_UrkypjhWTSAAmx` (txcd_10103000), Pro `prod_Urky1DtpTTDI41` (txcd_10103001).
- 11 Prices created idempotently (empty-sandbox baseline, exact lookup keys, EUR, inclusive,
  licensed, 15m=month×15 non-publishable). Full id table in NICOLAS_STRIPE_HANDOFF.md §2–3.
- **Real `validateBillingConfig` → ok:true, 11/11 PASS**, crossChecks all true (tax uniform,
  livemode uniform, product consistency). No Live objects created.

## 6b. Phase 2 blocker (Supabase non-prod target)

No non-production Supabase database could be provisioned via MCP:
- Local Docker/Supabase CLI: **unavailable** (no local apply path).
- Branch on `riwipywgqobrulyzrzad`: **blocked — branching requires the Supabase Pro plan** (org is Free).
- New free project: **blocked — org at the 2-active-free-project limit** (production + "MOOTOORS").
- Production (`riwipywgqobrulyzrzad`): migrations forbidden by safety rules; never touched.

→ **Human/billing action required** (one of): (a) pause the unrelated "MOOTOORS" project to free a
free-project slot, then Claude creates `pinguino-billing-sandbox` at $0; or (b) upgrade the Supabase
org to Pro (~$25/mo) to enable the authorized `billing-partner-sandbox` branch. Migrations 0014–0021
remain committed + guard-tested (82 tests), awaiting the first real apply.

## 7. Blocked / external

- Sandbox keys, Connect activation, tax decision (Live), email provider choice,
  deployment platform for Edge Functions + pg_cron enablement, Live replication — all external.
- Supabase non-prod capacity (see §6b) — the current gate for Phase 2 onward.
