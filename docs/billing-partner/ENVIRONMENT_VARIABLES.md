# Billing / Partner Platform — Environment Variable Catalog (§20)

Rules:
- **No values in this file, ever.** Secrets (secret key, webhook secrets,
  peppers) live ONLY in the deployment secret manager (Supabase Edge Function
  secrets). Object ids (product/price/portal ids) are not secrets but are
  environment-specific — they also live in the secret manager, never the repo.
- **Environments**: `server` = Edge Functions secret manager (never shipped to
  the browser); `client` = Vite build-time (`VITE_`-prefixed, public by
  definition). Sandbox and Live each get their OWN full set.
- The startup/diagnostic configuration validator (track F) checks presence and
  shape of everything marked *validated*.

## 1. Stripe core

| Name | Purpose | Env | Configured by |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe API secret key (Sandbox first, Live later) | server | Nicolas |
| `STRIPE_PUBLISHABLE_KEY` | Publishable key for client-side Stripe.js (exposed as `VITE_STRIPE_PUBLISHABLE_KEY` at build time) | client | Nicolas |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the platform webhook endpoint (raw-body signature verification) | server | Nicolas (§9 of the handoff) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Signing secret of the Connect (application) webhook endpoint | server | Nicolas |
| `STRIPE_API_VERSION` | Pinned Stripe API version; must equal the repo constant (`src/billing/catalog/stripeApiVersion.ts`, track F) — *validated* | server | Nicolas + Claude (pinned at first sandbox integration) |
| `STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID` | Saved Customer Portal configuration used for portal sessions | server | Nicolas |

## 2. Product / price ids (the 13 object ids — *validated* against the catalog)

Two products + the 11 prices matching `billing_price_catalog.lookup_key`
verbatim (migration 0014). The validator fetches each price and compares
amount/currency/interval/interval_count/lookup key against the seeded rows.

| Name | Catalog lookup key | Configured by |
|---|---|---|
| `STRIPE_PRODUCT_HOME_ID` | — (product "Pinguino Intelligence Home") | Nicolas |
| `STRIPE_PRODUCT_PRO_ID` | — (product "Pinguino Intelligence Pro") | Nicolas |
| `STRIPE_PRICE_HOME_MONTHLY_STANDARD_ID` | `pi_home_monthly_standard_eur` | Nicolas |
| `STRIPE_PRICE_HOME_YEARLY_STANDARD_ID` | `pi_home_yearly_standard_eur` | Nicolas |
| `STRIPE_PRICE_HOME_YEARLY_LAUNCH_ID` | `pi_home_yearly_launch_eur` | Nicolas |
| `STRIPE_PRICE_HOME_15M_STANDARD_PARTNER_ID` | `pi_home_15m_standard_partner_eur` | Nicolas |
| `STRIPE_PRICE_HOME_15M_LAUNCH_PARTNER_ID` | `pi_home_15m_launch_partner_eur` | Nicolas |
| `STRIPE_PRICE_PRO_MONTHLY_STANDARD_ID` | `pi_pro_monthly_standard_eur` | Nicolas |
| `STRIPE_PRICE_PRO_MONTHLY_FOUNDING_ID` | `pi_pro_monthly_founding_eur` | Nicolas |
| `STRIPE_PRICE_PRO_YEARLY_STANDARD_ID` | `pi_pro_yearly_standard_eur` | Nicolas |
| `STRIPE_PRICE_PRO_YEARLY_FOUNDING_ID` | `pi_pro_yearly_founding_eur` | Nicolas |
| `STRIPE_PRICE_PRO_15M_STANDARD_PARTNER_ID` | `pi_pro_15m_standard_partner_eur` | Nicolas |
| `STRIPE_PRICE_PRO_15M_FOUNDING_PARTNER_ID` | `pi_pro_15m_founding_partner_eur` | Nicolas |

All server-side. Environment-specific: Sandbox ids first; Live ids are NEW ids
entered only after full Sandbox acceptance (handoff §11).

## 3. Stripe Connect

| Name | Purpose | Env | Configured by |
|---|---|---|---|
| `STRIPE_CONNECT_RETURN_URL` | Hosted-onboarding return URL (exact app URL provided by Claude) | server | Claude provides URL, Nicolas sets |
| `STRIPE_CONNECT_REFRESH_URL` | Hosted-onboarding refresh URL | server | Claude provides URL, Nicolas sets |

## 4. Business rules (defaults are the locked master-spec values)

| Name | Purpose | Default | Env | Configured by |
|---|---|---|---|---|
| `BUSINESS_TIMEZONE` | Calendar authority for month boundaries, holds, snapshots, payouts | `Europe/Madrid` | server | owner (locked) |
| `AFFILIATE_REFERRAL_WINDOW_DAYS` | Attribution window from click/code to first commissionable payment | `30` | server | owner |
| `AFFILIATE_GOLD_ACTIVE_SUBSCRIPTIONS` | Active-subscription threshold promoting a partner to Gold | `100` | server | owner |
| `AFFILIATE_PAYOUT_MINIMUM_CENTS` | Monthly payout threshold; below it the balance carries forward | `2500` (EUR 25) | server | owner |
| `AFFILIATE_HOLD_FULL_CALENDAR_MONTHS` | Full Madrid calendar months a commission is held before eligible | `2` | server | owner |
| `INVITE_HOME_TRIAL_DAYS` | Length of the Home trial an invite redemption grants | `30` | server | owner |
| `INVITE_CODE_SLOT_COUNT` | Number of stable invite slots the admin UI manages | `5` | server | owner |

## 5. Feature flags (rollback levers — see ROLLBACK_PLAN.md)

| Name | Purpose | Env | Configured by |
|---|---|---|---|
| `BILLING_CHECKOUT_ENABLED` | Master switch for creating new checkout sessions | server | owner |
| `PARTNER_PROGRAM_ENABLED` | Applications, codes, attribution capture | server | owner |
| `PARTNER_PAYOUTS_ENABLED` | The monthly payout job (transfers) | server | owner |
| `INVITE_CODES_ENABLED` | Invite mint/rotate/redeem | server | owner |

## 6. Platform / app plumbing

| Name | Purpose | Env | Configured by |
|---|---|---|---|
| `SUPABASE_URL` | Project URL for Edge Function clients | server | exists (Supabase-provided) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — the ONLY writer of billing tables; never leaves the secret manager | server | exists (Supabase-provided) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Existing client config (unchanged by this slice) | client | exists |
| `APP_BASE_URL` | Canonical app origin for checkout success/cancel URLs, portal return, Connect URLs | server | owner |
| `INVITE_CODE_PEPPER` | Server-side pepper for `invite_codes.code_hash` (hash = keyed digest of plaintext) | server | owner (generated secret) |
| `ATTRIBUTION_COOKIE_SIGNING_SECRET` | Signs the referral cookie/link evidence (evidence only — the DB is the authority) | server | owner (generated secret) |

## 7. Not yet decidable (tracked, no variable invented)

- Email provider credentials — provider not chosen (IMPLEMENTATION_STATUS §7).
- Tax behavior is DATA (`billing_price_catalog.tax_behavior`), not an env var;
  it stays NULL until the accountant decision (handoff §1).
