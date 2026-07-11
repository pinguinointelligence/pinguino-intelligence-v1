# Account Access — File-First Safe-Pause Checkpoint

This is the **file-first safe pause** for the Account / Login / Access / Sessions / Devices
/ Partner-entitlement layer. It records what is implemented (committed + gate-green) and
what is deferred behind the **ACCOUNT ACCESS LAUNCH GATE** (paid staging + provider config
+ live E2E). Nothing here claims a live-backend pass.

> **Preserve-and-connect, not a rebuild.** This layer CONNECTS the existing Supabase Auth,
> the locked Billing/Partner architecture (`docs/billing-partner/`, migrations 0014–0021),
> and the authored 48-file account-access draft pack — it does not replace any of them.
> The 48 draft files under `docs/account-access/**/*.md` remain the source drafts (kept
> untracked on disk by decision); this canonical layer is what the code implements.

## Exact current commit
`main` @ **44a133b** (origin/main = b9c2b72 before this slice; the account-access commits
are `5413cad → c325594 → 44a133b`).

## Canonical architecture (what the code implements)

- **Identity** — the authenticated internal user id (`auth.uid()`) is the ONLY authorization
  identity; email links an invite/application to an account **once**, then internal ids
  resolve permissions. Admin status and partner status are **separate**.
- **Entitlement model** — one deterministic resolver (`src/access/accountAccess/effectiveAccess.ts`)
  CONSUMES Billing's entitlement result (via the read-only bridge
  `src/services/accountAccess/billingEntitlementBridge.ts`) and layers account-state /
  partner-status / admin. Approved partner ⇒ free Home + Pro + Partner **as an application
  entitlement, never a €0 Stripe subscription**. A non-approved partner **loses**
  partner-granted access even on a stale entitlement row.
- **Mode switcher** — server-authorized allowed-mode list (`modeResolver.ts`); a stale
  client-persisted mode is rejected, never trusted.
- **Single active session** — `sessionPolicy.ts` (conflict + takeover state machine) +
  a DB partial unique index (`app_sessions` where `state='active'`) so a second active
  session is impossible at the data layer. A second-device login CONFLICTS (never silent
  concurrency); the user takes over or cancels.
- **Device registry** — privacy-conscious (random app id, coarse metadata; no invasive
  fingerprinting) — `deviceRegistry.ts`.
- **Security history** — append-only `account_security_events`; builders sanitise metadata
  so a token/secret can never be stored (`securityEvents.ts`).
- **Admin controls** — suspend/restore/revoke-session with a required reason + audit; a
  privileged server path in production (no client self-promotion / self-restore).

## Migrations & RLS
`supabase/migrations/0025_account_access.sql` (additive; **file-first, NOT applied to prod**):
`account_profiles` (1:1 extension of 0001 `profiles`), `account_states` (append-only),
`admin_users` (admin auth — separate from partner), `account_provider_links`,
`registered_devices`, `app_sessions` (one-active partial unique), `account_security_events`
(append-only). Owner-scoped RLS by `auth.uid()`, never email; privileged transitions
service-role only; no anon grants. It does **not** duplicate 0001 `profiles`, 0015
`entitlements`, or 0016 `partners`. Guard test: `accountAccess.migration.test.ts`.

## Service adapters
- **In-memory adapter** (`inMemoryAccountAccess.ts`) — the deterministic reference impl
  (bootstrap / mode / conflict+takeover / device+session mgmt / admin / audit). Drives the
  browser acceptance.
- **Billing bridge** (`billingEntitlementBridge.ts`) — read-only, maps Billing → access.
- **Production Supabase adapter** — the production boundary against 0025. **PARTIAL /
  launch-gated:** the schema (0025), the pure decision core, the in-memory adapter and the
  bridge are done; the concrete Supabase wiring (real reads/writes + Edge Functions for
  privileged transitions) is the next step and only executes against a real staging DB.

## Test totals (at 44a133b)
`tsc -b` 0 · `lint` 0 · `vitest` **3401/3401** (224 files) · `build` OK. Account-access:
migration guard 10, access/mode 15, session/device/security 12, adapter e2e 11, boundary
guard 3.

## Browser evidence (local / file-first, NOT live)
`/dev/account-access` (DEV-only): Approved partner → Home·Pro·Partner; Home → Home; Pro →
Home·Pro; Suspended → no modes; Admin → admin mode; second-device login → conflict →
takeover leaves exactly ONE active session with a full audit trail.

## Human policy decisions to confirm (launch)
- Password-recovery / verification email ownership (Supabase Auth vs a provider adapter).
- Data-deletion / retention policy (Phase 14) — conservative non-destructive default until
  legally confirmed.
- Franchise account type (documented in the draft pack; no code yet — extension point).

## Launch-gated (ACCOUNT ACCESS LAUNCH GATE — BLOCKED EXTERNAL)
Enable paid staging; apply 0025; configure Supabase Auth providers (Google OAuth, magic
link) + redirect URLs; install secrets; deploy Edge Functions for privileged transitions;
run authenticated live E2E; verify RLS + session invalidation; confirm production
(`riwipywgqobrulyzrzad`) + MOOTOORS (`tjntmljkrxbpwjmkautu`) untouched.

See `RESUME_ACCOUNT_ACCESS_ON_STAGING_PROMPT.md`.

## Preserved unchanged
All of `docs/billing-partner/`, migrations 0014–0021, the OCR safe-pause (0022–0024 + its
services), `src/billing/**`, the existing Supabase Auth code, and `mapper_basement`.
