# NICOLAS — Stripe Sandbox Handoff (v1.0)

Work top to bottom. Do everything in **Sandbox/Test Mode** first. Paste object IDs into the
fields below (or send them in the `STRIPE SETUP UPDATE` format from your instruction). Secrets
(secret key, webhook signing secret) go ONLY into the deployment secret manager — never into
this file, the chat, or the repo.

> ## STATUS (2026-07-11 — SAFE PAUSE CHECKPOINT)
> Per-section status. See `BILLING_PAUSE_CHECKPOINT.md` for the full picture.
> | § | Item | Status |
> |---|---|---|
> | 0 | Account & business profile | HUMAN DASHBOARD ACTION (legal/KYC — owner only) |
> | 1 | Tax decision (Live) | HUMAN / accountant — DEFERRED for Live (Sandbox uses `inclusive`) |
> | 2 | Products | ✅ DONE (Claude via MCP) |
> | 3 | 11 Prices | ✅ DONE + validated (ok=true, 11/11) |
> | 4 | Payment methods | HUMAN DASHBOARD ACTION (MCP cannot set) |
> | 5 | Billing / recovery + API version | API version ✅ pinned in code; recovery = HUMAN DASHBOARD ACTION |
> | 6 | Customer Portal | HUMAN DASHBOARD ACTION (MCP cannot set) |
> | 7 | Stripe Connect | HUMAN DASHBOARD ACTION + legal/KYC; return/refresh URLs DEFERRED — LAUNCH GATE |
> | 8 | Env vars (secret manager) | DEFERRED — LAUNCH GATE (needs staging) |
> | 9 | Webhook endpoint | DEFERRED — LAUNCH GATE (needs deployed URL) |
> | 10 | Sandbox test matrix | DEFERRED — LAUNCH GATE (needs staging backend) |
> | 11 | Live replication | DEFERRED — after Sandbox PASS |
>
> The Stripe **MCP connector is scoped to core commerce objects** (products/prices/customers/
> subscriptions/payments/refunds/balance); §4–7, §9 are **Dashboard-only** and cannot be done by
> Claude through the connector.

## 0. Account & business profile
- [ ] Business details verified (PINGÜINO GLOBAL S.L., NIF/VAT, address, representative, bank)
- [ ] Branding + statement descriptor set
- [ ] `charges enabled` / `payouts enabled` confirmed — note any pending requirements: ______

## 1. Tax decision (with accountant, BEFORE Live prices)
- [ ] Prices are GROSS / NET: ________  → Stripe tax behavior: `inclusive` / `exclusive`: ________
- [ ] Tax code for SaaS/digital subscription: ________
- [ ] Automatic Tax ON/OFF: ________  (all mutually-replaceable prices must share tax behavior)

## 2. Products (Sandbox) — ✅ PROVISIONED by Claude via MCP (2026-07-11)
Account `acct_1Ts0jzADcB1viept` (livemode:false, proven twice). These IDs are non-secret.
- [x] Product "Pinguino Intelligence Home" → `STRIPE_PRODUCT_HOME_ID` = `prod_UrkypjhWTSAAmx` (tax_code `txcd_10103000` SaaS personal use, metadata internal_product_code=PI_HOME)
- [x] Product "Pinguino Intelligence Pro"  → `STRIPE_PRODUCT_PRO_ID` = `prod_Urky1DtpTTDI41` (tax_code `txcd_10103001` SaaS business use, metadata internal_product_code=PI_PRO)

## 3. The 11 Prices — ✅ PROVISIONED + validated (real configValidator: ok=true, 11/11 PASS)

All EUR · recurring · `tax_behavior: inclusive` · `usage_type: licensed` · active · livemode:false.
15-month prices = interval `month`, `interval_count` 15, metadata publishable=false (never on the
public pricing screen — app-gated). Env var → Sandbox price id:

| # | Env var (→ id) | Lookup key | Amount | Interval | Sandbox Price ID |
|---|---|---|---:|---|---|
| 1 | `STRIPE_PRICE_HOME_MONTHLY_STANDARD` | `pi_home_monthly_standard_eur` | EUR 9.99 | 1 month | `price_1Ts1TXADcB1viept0tQmOm3k` |
| 2 | `STRIPE_PRICE_HOME_YEARLY_STANDARD` | `pi_home_yearly_standard_eur` | EUR 49.00 | 1 year | `price_1Ts1TaADcB1vieptBz3lbxnT` |
| 3 | `STRIPE_PRICE_HOME_YEARLY_LAUNCH` | `pi_home_yearly_launch_eur` | EUR 39.00 | 1 year | `price_1Ts1TdADcB1vieptxQpPw162` |
| 4 | `STRIPE_PRICE_HOME_15M_STANDARD_PARTNER` | `pi_home_15m_standard_partner_eur` | EUR 49.00 | month × 15 | `price_1Ts1TrADcB1vieptsSirQ4o4` |
| 5 | `STRIPE_PRICE_HOME_15M_LAUNCH_PARTNER` | `pi_home_15m_launch_partner_eur` | EUR 39.00 | month × 15 | `price_1Ts1U2ADcB1vieptlvNJJQLT` |
| 6 | `STRIPE_PRICE_PRO_MONTHLY_STANDARD` | `pi_pro_monthly_standard_eur` | EUR 24.99 | 1 month | `price_1Ts1UJADcB1viept8HKEOsnX` |
| 7 | `STRIPE_PRICE_PRO_MONTHLY_FOUNDING` | `pi_pro_monthly_founding_eur` | EUR 19.99 | 1 month | `price_1Ts1UPADcB1vieptHpQkDYlZ` |
| 8 | `STRIPE_PRICE_PRO_YEARLY_STANDARD` | `pi_pro_yearly_standard_eur` | EUR 199.00 | 1 year | `price_1Ts1UMADcB1vieptd4VnYTeL` |
| 9 | `STRIPE_PRICE_PRO_YEARLY_FOUNDING` | `pi_pro_yearly_founding_eur` | EUR 149.00 | 1 year | `price_1Ts1UdADcB1viept524yAh97` |
| 10 | `STRIPE_PRICE_PRO_15M_STANDARD_PARTNER` | `pi_pro_15m_standard_partner_eur` | EUR 199.00 | month × 15 | `price_1Ts1UgADcB1vieptlupXRbTb` |
| 11 | `STRIPE_PRICE_PRO_15M_FOUNDING_PARTNER` | `pi_pro_15m_founding_partner_eur` | EUR 149.00 | month × 15 | `price_1Ts1UjADcB1vieptqwntAnSO` |

These IDs load into the non-prod Supabase Edge Function config in Phase 3 (they are NOT hardcoded
in app business logic; the app resolves prices by env var → catalog). Live Mode uses different IDs.

## 4. Payment methods (EUR recurring)
- [ ] Cards  - [ ] Apple Pay  - [ ] Google Pay  - [ ] Link  - [ ] SEPA Direct Debit
- [ ] Automatic payment methods restricted to recurring-compatible

## 5. Billing / recovery
- [ ] Auto-renewal + Smart Retries / recovery emails configured
- [ ] Note the account's pinned **API version** for the integration: ________ → `STRIPE_API_VERSION`

## 6. Customer Portal
- [ ] Payment-method update, billing details, invoices, cancel-at-period-end enabled
- [ ] `STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID` = ________ (if a saved configuration is used)
- Monthly→Yearly partner conversion stays INSIDE the Pinguino app (not the portal).

## 7. Stripe Connect
- [ ] Connect activated; hosted onboarding; Express-style dashboard
- [ ] Partner countries list configured: ________
- [ ] Return URL / Refresh URL set (Claude will provide exact app URLs): ________
- [ ] Capabilities: transfers + bank payouts only

## 8. Environment variables (secret manager, Sandbox values)
Everything from `docs/billing-partner/ENVIRONMENT_VARIABLES.md` (created by track D). Confirm
set (✓), never paste values: publishable key ☐ · secret key ☐ · webhook secret ☐ ·
API version ☐ · all 13 product/price IDs ☐ · portal config ☐ · Connect URLs ☐ ·
`BUSINESS_TIMEZONE=Europe/Madrid` ☐

## 9. Webhook (AFTER Claude provides the endpoint + WEBHOOK_MATRIX.md)
- [ ] Sandbox event destination created at the exact endpoint URL
- [ ] Events selected exactly per `docs/billing-partner/WEBHOOK_MATRIX.md`
- [ ] Signing secret stored as `STRIPE_WEBHOOK_SECRET` (secret manager only)
- [ ] Test delivery: signature valid, HTTP 2xx, event row recorded in app

## 10. Sandbox test matrix
- [ ] Run `docs/billing-partner/TEST_MATRIX.md` end to end with Claude; log date/result/object
      IDs/screenshots per row.

## 11. Live replication (only after full Sandbox acceptance)
- [ ] Recreate products/prices/portal/Connect/webhook in Live (new IDs + secrets)
- [ ] Run the configuration validator against Live
- [ ] Controlled production test per release plan

### Report format after each step
```
STRIPE SETUP UPDATE
Environment: Sandbox / Live
Completed step: ...
Product/Price lookup key: ...
Object ID: ...
Tax behavior: ...
Status: active / hidden / pending
Webhook endpoint/status: ...
Connect status: ...
Configuration validator result: ...
Error or question: ...
```
