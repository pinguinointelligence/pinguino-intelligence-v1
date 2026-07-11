# Resume Account Access on Staging — Paste-Ready Prompt

Use this once a **paid non-production Supabase staging** exists. It lifts the ACCOUNT
ACCESS LAUNCH GATE. Do not run any of it against production (`riwipywgqobrulyzrzad`) or
MOOTOORS (`tjntmljkrxbpwjmkautu`).

## Absolute safety rules (unchanged)
- Never run migrations / SQL / deploy against `riwipywgqobrulyzrzad` or MOOTOORS.
- No secrets in chat / logs / commits. Never paste a secret into chat.
- No privileged (service_role) credential in client code.
- Do not modify Billing financial logic, Stripe, or migrations 0014–0021.

## Ordered steps

1. **Enable paid staging.** Provision the authorized non-prod Supabase project (or branch).
   Record ref + URL + anon key (never commit them).
2. **Prove staging ≠ production ≠ MOOTOORS.** Confirm the staging project ref is not
   `riwipywgqobrulyzrzad` and not `tjntmljkrxbpwjmkautu` before any write.
3. **Apply account-access migrations** on staging only: base `0001`–`0013`, then `0025`
   (this slice). Billing `0014`–`0021` and OCR `0022`–`0024` follow their own gates.
   Verify with `list_migrations`; verify the 7 account-access tables + RLS exist.
4. **Configure Supabase Auth providers**: enable email/password, magic link; enable Google.
5. **Configure Google OAuth**: client id/secret in the Supabase dashboard (not the repo).
6. **Configure redirect URLs**: the staging app URL + `/auth/callback`; validate the
   allow-list (no open redirect).
7. **Install secrets** in the Supabase Edge secret manager (never the repo): any keys the
   privileged transition Edge Functions need.
8. **Deploy Edge Functions** for the privileged transitions that the RLS forbids clients:
   admin suspend/restore, admin session revoke, provider linking, `account_states` writes,
   `admin_users` grants, invite redemption. (Build the Supabase adapter to mirror the
   in-memory adapter surface, then deploy.)
9. **Create test users + roles**: a Home user, a Pro user, an approved partner (with a
   `partners` row + `approved_partner` entitlement), an admin (`admin_users`), a suspended
   account.
10. **Authenticated E2E** (signed-in, real staging): signup → email verification → login
    (password, Google, magic link) → new-device conflict → takeover → old-session
    revocation → partner sees Home/Pro/Partner → admin suspend blocks + kills sessions →
    restore. Capture real evidence.
11. **Verify RLS**: a user cannot read/write another user's profile/devices/sessions/events;
    a client cannot write `admin_users` / `account_states` / `account_provider_links`;
    `account_security_events` cannot be updated/deleted.
12. **Verify session invalidation**: a revoked/replaced session's token no longer authorizes;
    the one-active-session unique index rejects a second active row.
13. **Verify production untouched**: no migration/SQL/deploy ran against
    `riwipywgqobrulyzrzad` or MOOTOORS.
14. **Return a PASS/FAIL matrix** for steps 10–13.
