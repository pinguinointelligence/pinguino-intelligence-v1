# NICOLAS — Stripe Sandbox Handoff (v1.0)

Work top to bottom. Do everything in **Sandbox/Test Mode** first. Paste object IDs into the
fields below (or send them in the `STRIPE SETUP UPDATE` format from your instruction). Secrets
(secret key, webhook signing secret) go ONLY into the deployment secret manager — never into
this file, the chat, or the repo.

## 0. Account & business profile
- [ ] Business details verified (PINGÜINO GLOBAL S.L., NIF/VAT, address, representative, bank)
- [ ] Branding + statement descriptor set
- [ ] `charges enabled` / `payouts enabled` confirmed — note any pending requirements: ______

## 1. Tax decision (with accountant, BEFORE Live prices)
- [ ] Prices are GROSS / NET: ________  → Stripe tax behavior: `inclusive` / `exclusive`: ________
- [ ] Tax code for SaaS/digital subscription: ________
- [ ] Automatic Tax ON/OFF: ________  (all mutually-replaceable prices must share tax behavior)

## 2. Products (Sandbox)
- [ ] Product "Pinguino Intelligence Home" → `STRIPE_PRODUCT_HOME_ID` = ________
- [ ] Product "Pinguino Intelligence Pro"  → `STRIPE_PRODUCT_PRO_ID` = ________

## 3. The 11 Prices (exact lookup keys — the app validates them verbatim)

| # | Lookup key | Amount | Interval | Price ID (paste) |
|---|---|---:|---|---|
| 1 | `pi_home_monthly_standard_eur` | EUR 9.99 | 1 month | ________ |
| 2 | `pi_home_yearly_standard_eur` | EUR 49.00 | 1 year | ________ |
| 3 | `pi_home_yearly_launch_eur` | EUR 39.00 | 1 year | ________ |
| 4 | `pi_home_15m_standard_partner_eur` | EUR 49.00 | month × 15 | ________ |
| 5 | `pi_home_15m_launch_partner_eur` | EUR 39.00 | month × 15 | ________ |
| 6 | `pi_pro_monthly_standard_eur` | EUR 24.99 | 1 month | ________ |
| 7 | `pi_pro_monthly_founding_eur` | EUR 19.99 | 1 month | ________ |
| 8 | `pi_pro_yearly_standard_eur` | EUR 199.00 | 1 year | ________ |
| 9 | `pi_pro_yearly_founding_eur` | EUR 149.00 | 1 year | ________ |
| 10 | `pi_pro_15m_standard_partner_eur` | EUR 199.00 | month × 15 | ________ |
| 11 | `pi_pro_15m_founding_partner_eur` | EUR 149.00 | month × 15 | ________ |

All EUR, recurring, same tax behavior, active, Sandbox. 15-month prices = interval `month`,
`interval_count` 15.

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
