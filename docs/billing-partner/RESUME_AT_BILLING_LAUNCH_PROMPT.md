# RESUME AT BILLING LAUNCH — paste-ready prompt

Paste the block below to Claude to resume the Pinguino Billing & Partner module from its safe pause
checkpoint and carry it through to Live activation. It starts from the exact paused state.

---

```
RESUME PINGUINO BILLING & PARTNER — FROM SAFE PAUSE CHECKPOINT TO LIVE

Read first (source of truth): docs/billing-partner/BILLING_PAUSE_CHECKPOINT.md,
IMPLEMENTATION_STATUS.md, NICOLAS_STRIPE_HANDOFF.md, ENVIRONMENT_VARIABLES.md,
WEBHOOK_MATRIX.md, TEST_MATRIX.md, ROLLBACK_PLAN.md, ARCHITECTURE.md.

STATE AT RESUME
- Repo main; foundation tag billing-partner-foundation-v1 (migrations 0014-0021 file-first +
  guard-tested; pure domain logic; Stripe surface + Edge Function sources; entitlement resolver).
- Stripe Sandbox catalog DONE + validated (ok=true 11/11). Account acct_1Ts0jzADcB1viept, Test Mode.
  Product/Price IDs are in BILLING_PAUSE_CHECKPOINT.md. Stripe API version pinned 2025-06-30.basil.
- Supabase paid staging was DEFERRED (launch gate). MOOTOORS (tjntmljkrxbpwjmkautu) is ACTIVE — never
  pause it. Pinguino production (riwipywgqobrulyzrzad) must stay untouched.

ABSOLUTE SAFETY RULES
- Prove Stripe livemode:false (GET /v1/balance) before any Stripe write; never touch Live.
- Never run migrations/SQL/deploy against riwipywgqobrulyzrzad or MOOTOORS.
- No secrets in chat/logs/commits. Never ask for a secret to be pasted into chat.
- Do not accept legal/KYC/terms on behalf of PINGUINO GLOBAL S.L.
- Ask for human confirmation before any paid or Live action; stop for genuine human-only blockers.

EXECUTE IN ORDER (continue autonomously through safe steps)
1) NON-PROD SUPABASE. Enable the paid staging DB: either upgrade org osiyordlnqccwhenuqep to Pro and
   create branch billing-partner-sandbox on riwipywgqobrulyzrzad, OR use a dedicated non-prod project.
   PROVE the target project ref != riwipywgqobrulyzrzad before any write.
2) MIGRATIONS. Apply the full chain (0001-0021, or 0014-0021 onto a clean base) to the staging target.
   Verify all 21 new tables, RLS (no client write grants on financial tables), uniqueness constraints,
   the 11 price-catalog seeds, the 12 commission-rate seeds, the 5 invite-code slots. Run security +
   performance advisors. Regenerate TypeScript types. Run: npx tsc -b --force; npm run lint;
   npx vitest run; npm run build.
3) HUMAN STRIPE DASHBOARD SETTINGS (Test Mode) — payment methods (Card/Link/SEPA), billing recovery
   (Smart Retries + dunning + cancel-on-exhaustion; founding continuity rule), Customer Portal
   (update pm/billing/tax id/invoices/cancel-at-period-end; plan switching OFF; promo codes OFF;
   record STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID), branding, Connect (Express, hosted onboarding,
   separate charges & transfers, supported countries; KYC/terms are human). The Stripe MCP cannot set
   these — provide exact paths and confirm completion.
4) RUNTIME SECRETS. Install into the staging Supabase secret manager (never printed): a RESTRICTED
   Stripe Sandbox secret key (minimum scopes), STRIPE_WEBHOOK_SECRET, STRIPE_API_VERSION=2025-06-30.basil,
   and all non-secret STRIPE_PRODUCT_*/STRIPE_PRICE_* from the checkpoint doc, plus the business-rule
   envs from ENVIRONMENT_VARIABLES.md (BUSINESS_TIMEZONE=Europe/Madrid, AFFILIATE_* defaults,
   INVITE_HOME_TRIAL_DAYS=30, etc.).
5) DEPLOY EDGE FUNCTIONS to staging (NOT production): stripe-webhook, create-checkout-session,
   create-portal-session, create-connect-onboarding-link. Finish the per-intent webhook ledger writers
   and reconciliation worker. Wire Connect return/refresh URLs from the deployed URLs.
6) WEBHOOK. Create the Stripe Sandbox webhook endpoint at the deployed URL with EXACTLY the events in
   WEBHOOK_MATRIX.md; capture the signing secret at creation straight into the staging secret manager.
   Verify signature (raw body), durable event storage, idempotency, duplicate + out-of-order delivery,
   safe retries.
7) SANDBOX E2E ACCEPTANCE. Run TEST_MATRIX.md end to end with test clocks/simulations: all 11 prices,
   card success/decline/SCA, SEPA processing/success/failure, 15-month benefit + transition to 12-month,
   monthly->yearly conversion + proration + failure rollback, commissions (all tiers), Gold at 100,
   Elite, two-full-calendar-month hold dates (Europe/Madrid), refunds/disputes/negative carry-forward,
   Connect onboarding + transfers + payout failure, invite-code redemption + replacement, webhook
   idempotency, reconciliation. Log dates/results/object IDs.
8) LIVE. Only after full Sandbox PASS: recreate Products/Prices/Portal/Connect/webhook in Live (new
   IDs + secrets), run the config validator against Live, do a controlled production test per the
   rollout plan, then activate Live billing. Also resolve the still-open Home-vs-Pro accepted_corrections
   entitlement/RLS gap before Home is sold publicly.

REPORT after each phase: what was done, evidence (IDs, test results), the exact next human action,
and remaining risk.
```

---

Notes for whoever resumes:
- Product/Price/tax IDs and the exact env-var → id mapping are in `BILLING_PAUSE_CHECKPOINT.md`.
- The Stripe MCP connector is scoped to core commerce objects; portal/payment-method/webhook/Connect
  configuration is Dashboard-only — plan for those as human steps.
- Keep Sandbox and Live strictly separated (different IDs, keys, webhook secrets).
