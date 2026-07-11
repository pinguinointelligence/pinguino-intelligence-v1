# Billing & Partner — SAFE PAUSE CHECKPOINT (2026-07-11)

The Pinguino Billing & Partner module is intentionally paused at a safe checkpoint. The paid
non-production Supabase staging environment is a **formal BILLING LAUNCH GATE** — deferred until
the module is ready to launch. Everything below that could be completed safely **without a deployed
Supabase backend** is done; everything that needs staging or a human Dashboard/legal action is
explicitly listed.

## Locked decisions in force
1. **Supabase paid staging is DEFERRED** until billing launch (no Pro upgrade, no new project now).
2. **MOOTOORS (`tjntmljkrxbpwjmkautu`) is ACTIVE — must NOT be paused.** (Read-only audit 2026-07-11
   found a live app: custom schemas `core`/`pricing`/`pii`/`ops`/`config`, 2 real users, real
   uploaded documents, and live PostgREST RPC traffic during the audit.)
3. **Pinguino production (`riwipywgqobrulyzrzad`) must remain UNTOUCHED** — no migrations/SQL/deploy.
4. **Stripe stays in Sandbox/Test Mode** (`acct_1Ts0jzADcB1viept`, livemode:false) until launch.

## Completed work (safe, done now)
- **Stripe Sandbox catalog** — 2 Products + 11 Prices created idempotently via MCP, EUR,
  `tax_behavior: inclusive`, `usage_type: licensed`, active, livemode:false; the four 15-month
  technical prices carry `metadata.publishable=false`. **Real `validateBillingConfig`: ok=true,
  11/11 PASS**, crossChecks all true. (Commit `357bade`.)
- **Stripe API version pinned** — `EXPECTED_STRIPE_API_VERSION = '2025-06-30.basil'` (stripe@18
  `LatestApiVersion`; not the connector's preview spec). `src/billing/catalog/stripeApiVersion.ts`.
- **Repo billing foundation** (tag `billing-partner-foundation-v1` @ `979cff8`): migrations
  0014–0021 (file-first, 82 guard tests), pure domain logic (324 tests), Stripe surface + webhook
  matrix + Edge Function sources (194 tests), entitlement resolver. All committed; nothing deployed.

## Stripe Sandbox IDs (non-secret)
Account `acct_1Ts0jzADcB1viept` · Test Mode.
- Product Home `prod_UrkypjhWTSAAmx` (tax_code `txcd_10103000`)
- Product Pro   `prod_Urky1DtpTTDI41` (tax_code `txcd_10103001`)

| Env var | Lookup key | Amount | Sandbox Price ID |
|---|---|---:|---|
| STRIPE_PRICE_HOME_MONTHLY_STANDARD | pi_home_monthly_standard_eur | 9.99 | `price_1Ts1TXADcB1viept0tQmOm3k` |
| STRIPE_PRICE_HOME_YEARLY_STANDARD | pi_home_yearly_standard_eur | 49.00 | `price_1Ts1TaADcB1vieptBz3lbxnT` |
| STRIPE_PRICE_HOME_YEARLY_LAUNCH | pi_home_yearly_launch_eur | 39.00 | `price_1Ts1TdADcB1vieptxQpPw162` |
| STRIPE_PRICE_HOME_15M_STANDARD_PARTNER | pi_home_15m_standard_partner_eur | 49.00 | `price_1Ts1TrADcB1vieptsSirQ4o4` |
| STRIPE_PRICE_HOME_15M_LAUNCH_PARTNER | pi_home_15m_launch_partner_eur | 39.00 | `price_1Ts1U2ADcB1vieptlvNJJQLT` |
| STRIPE_PRICE_PRO_MONTHLY_STANDARD | pi_pro_monthly_standard_eur | 24.99 | `price_1Ts1UJADcB1viept8HKEOsnX` |
| STRIPE_PRICE_PRO_MONTHLY_FOUNDING | pi_pro_monthly_founding_eur | 19.99 | `price_1Ts1UPADcB1vieptHpQkDYlZ` |
| STRIPE_PRICE_PRO_YEARLY_STANDARD | pi_pro_yearly_standard_eur | 199.00 | `price_1Ts1UMADcB1vieptd4VnYTeL` |
| STRIPE_PRICE_PRO_YEARLY_FOUNDING | pi_pro_yearly_founding_eur | 149.00 | `price_1Ts1UdADcB1viept524yAh97` |
| STRIPE_PRICE_PRO_15M_STANDARD_PARTNER | pi_pro_15m_standard_partner_eur | 199.00 | `price_1Ts1UgADcB1vieptlupXRbTb` |
| STRIPE_PRICE_PRO_15M_FOUNDING_PARTNER | pi_pro_15m_founding_partner_eur | 149.00 | `price_1Ts1UjADcB1vieptqwntAnSO` |

## Outstanding HUMAN Stripe Dashboard settings (not reachable via the MCP connector)
The connected Stripe MCP exposes only core commerce objects (products, prices, customers,
subscriptions, payment_intents, charges, invoices, refunds, balance). It **cannot** configure the
Customer Portal, payment-method settings, billing recovery, branding, webhooks, or Connect — these
are Dashboard-only. Do each in **Test Mode**:

1. **Payment methods** — Settings → Payment methods (Test): enable **Card, Link, SEPA Direct Debit**.
   Apple Pay / Google Pay surface automatically through the Card method in Checkout (Apple Pay also
   needs domain registration at Settings → Payment methods → Apple Pay → add the staging domain —
   defer until the staging URL exists). Restrict automatic methods to recurring-compatible.
2. **Billing recovery** — Settings → Billing → Automatic collection / Revenue recovery: enable
   **Smart Retries**, failed-payment emails, expiring-card emails; set the post-retry action to
   **cancel the subscription** at retry exhaustion. Locked continuity rule to verify: a founding/
   launch subscription that recovers after a *temporary* failure KEEPS its historical price; only a
   *final* cancellation (then a new purchase) loses founding/launch eligibility.
3. **Customer Portal** — Settings → Billing → Customer portal (Test): enable update payment method,
   update billing details, tax IDs, view/download invoices, **cancel at period end**; **disable**
   ordinary plan switching; **disable** promotion-code entry. Record `STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID`.
   (Monthly→Yearly partner conversion stays inside the Pinguino app, not the portal.)
4. **Branding / public details** — Settings → Business / Branding: business name PINGÜINO GLOBAL S.L.,
   logo, colours, statement descriptor, support email, terms & privacy URLs. Do NOT invent legal URLs,
   phone, tax, or bank data — owner-supplied only.
5. **Connect** — Connect → Settings: platform profile (affiliate/marketplace), **Express** connected
   accounts, **Stripe-hosted onboarding**, **separate charges & transfers**, platform-owned customer
   charges, transfers+payouts capabilities only, conservative supported-country list. KYC, bank
   details, and terms acceptance for PINGÜINO GLOBAL S.L. are human/legal — never automated.
   Return/refresh URLs are **DEFERRED** until staging deployment provides them.

## Deferred — BILLING LAUNCH GATE (needs paid staging)
- Paid non-production Supabase environment (branch on Pro, or a dedicated project).
- Apply migrations 0014–0021; verify 21 tables / RLS / uniqueness / 11 offer + 12 commission + 5
  invite-slot seeds; advisors; generate types.
- Install runtime secrets into staging (restricted Stripe Sandbox key + webhook signing secret) via
  the Supabase secret manager — never printed, never in chat, never committed.
- Deploy Edge Functions (webhook, checkout, portal, connect-onboarding), wire per-intent ledger writers.
- Create the Stripe Sandbox **webhook endpoint** (exact events from WEBHOOK_MATRIX.md); capture the
  signing secret at creation into staging secrets.
- Full Sandbox E2E acceptance (TEST_MATRIX.md; test clocks for 15-month + hold dates).
- Recreate & validate Live configuration; activate Live billing only after Sandbox PASS.

## Exact resume sequence (at launch)
See `RESUME_AT_BILLING_LAUNCH_PROMPT.md` — a paste-ready prompt. Summary:
1. Enable paid non-production Supabase (Pro branch or dedicated project). Prove ref ≠ `riwipywgqobrulyzrzad`.
2. Apply migrations 0014–0021; verify tables/RLS/constraints/seeds; advisors; gen types; gates.
3. Complete the 5 human Dashboard settings above (Test Mode).
4. Install staging runtime secrets (restricted key + webhook secret) via the secret manager.
5. Deploy Edge Functions; create the Sandbox webhook endpoint; capture the signing secret to staging.
6. Run full Sandbox E2E acceptance.
7. Recreate/validate Live; launch only after PASS.

## Safety rules (unchanged)
Stripe Sandbox only; no Live objects; no secrets in chat/logs/commits; production Supabase and
MOOTOORS untouched; no Edge Function deploy to production; no legal/KYC acceptance on behalf of the
company; stop for genuine human-only blockers.

## Checkpoint state
- Foundation tag: `billing-partner-foundation-v1` (@ `979cff8`); catalog commit `357bade`.
- This checkpoint commit: see the final report / `git log`.
- Gates at checkpoint: `tsc -b` PASS · lint PASS · **vitest 2838+ passed** · build PASS.
