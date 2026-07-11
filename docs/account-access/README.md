# Account Access — canonical entry

Account Access is the central **identity / permission / plan / session / customer-data**
layer. It authenticates users (Supabase Auth), resolves what each user may access, enforces
the one-active-session policy, manages devices, and records an append-only security history.
It **consumes** Billing entitlement results and **never** rewrites Billing history.

## Read these first
- [`ACCOUNT_ACCESS_PAUSE_CHECKPOINT.md`](./ACCOUNT_ACCESS_PAUSE_CHECKPOINT.md) — what is
  implemented (file-first) vs launch-gated, with the exact commit + test totals.
- [`RESUME_ACCOUNT_ACCESS_ON_STAGING_PROMPT.md`](./RESUME_ACCOUNT_ACCESS_ON_STAGING_PROMPT.md)
  — the paste-ready staging-resume sequence.
- [`PARTNER_ACCESS_INTEGRATION.md`](./PARTNER_ACCESS_INTEGRATION.md) — how approved-partner
  free access connects to the account (the Account ↔ Billing/Partner seam).

## Source of truth map
| Concern | Canonical source |
|---|---|
| Authentication (email/password, Google, magic link) | Supabase Auth via `src/services/auth.ts` |
| Authorization identity | internal `auth.uid()` — **never email** |
| Entitlements (paid subscription / approved partner / admin grant / invite) | **Billing** — `public.entitlements` (migration 0015) + `src/billing/entitlements/entitlementResolver.ts` |
| Partner identity / application / approval / tiers / commissions / payouts | **Billing/Partner** — `docs/billing-partner/`, migrations 0016–0021 (LOCKED — read-only here) |
| Effective access + allowed modes | `src/access/accountAccess/effectiveAccess.ts` + `modeResolver.ts` |
| Sessions / devices / security events | `src/access/accountAccess/{sessionPolicy,deviceRegistry,securityEvents}.ts` + migration `0025` |
| Account/session/device/profile persistence | `supabase/migrations/0025_account_access.sql` + `src/services/accountAccess/*` |

## The 48-file draft pack
The authored draft pack under `docs/account-access/**/*.md` (00_INDEX … 09_IMPLEMENTATION_PROMPTS)
is the **source design material**. Per the preserve-and-connect decision it is kept as-is
(not auto-committed en masse); this canonical layer + the code implement it. When a draft
and this canonical layer disagree, **this canonical layer + the code win** and the draft is
treated as historical intent. Known reconciliations are recorded in the pause checkpoint.

## Non-negotiables (implemented + tested)
- Authorization by internal user id, never email; a verified email links an invite/app once.
- Admin ≠ partner (separate). A blocking account state denies all access.
- Approved-partner free Home/Pro/Partner is an **application entitlement**, not a €0 Stripe
  subscription; a non-approved partner loses partner-granted access.
- One active interactive session per user (DB-enforced); conflicts prompt takeover/cancel.
- Client route visibility is not authorization — every protected action is RLS/server-checked.
- Security history is append-only; no password/token/secret is ever stored.
- Billing financial state stays Billing-owned; Account Access reads, never rewrites it.
