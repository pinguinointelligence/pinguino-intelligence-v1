# Work With Us / Partner — DB approval packages

Prepared 2026-09-17 against `origin/staging` `6e83b8d1`. **Six separate packages: approve, decline or defer each one on its own.**

**Nothing here has been applied.** Every statement about the live database comes from read-only `SELECT`s on 2026-09-17:
- 263 migrations recorded, latest `20260915150000`, and none of the six versions below is among them.
- The table ACLs, policies and function privileges quoted are also from those reads.

**For every package, the rule is the same:**
- no `supabase db push` and no bulk apply
- apply one file only after an explicit approval of that exact file
- after applying: read the objects back, run the served check listed in the package, and record the result on its checklist row
- `apply_migration` records its own version, so rename the repo file to the recorded version afterwards, byte-identical, in a small PR (as #260 did); otherwise DB-DRIFT-01 grows

| # | Migration | Where | Unlocks | Rows rewritten | Status |
|---|---|---|---|---|---|
| 1 | `20260910120000_financial_tables_least_privilege` | staging | defence in depth on 7 financial tables (DB-ACL-02/03) | none | **WAITING OWNER DB APPROVAL** |
| 2 | `20260910180000_partner_application_lifecycle_email` | staging (+ fixes in PR #381) | applicant e-mails (C-APP-08) | none | **NOT READY:** merge #381 first; 2 owner decisions open |
| 3 | `20260910200000_partner_workspace_link_performance` | staging | per-link sign-ups, customers, active subscriptions (D-LINK-03, H-DASH-06) | none | **WAITING OWNER DB APPROVAL** |
| 4 | `20260910210000_partner_code_claim_refusal_owner_check` | PR #281 | the availability RPC answers only about the caller's own partner (D-CODE-03) | none | **WAITING OWNER DB APPROVAL** |
| 5 | `20260910220000_partner_application_notification_links` | PR #280 | stored application notifications open `/partner` (C-APP-09) | none | **WAITING OWNER DB APPROVAL** |
| 6 | `20260917120000_referral_tables_revoke_direct_read` | PR #380 | a referrer can't read the referred person's ids (J-REF-17) | none | **WAITING OWNER DB APPROVAL** |

Not included, by instruction: D-01 (`20260903120000`, branch `claude/partner-benefit-d01`).

---

## Package 1 — `20260910120000_financial_tables_least_privilege`

**WAITING OWNER DB APPROVAL.**

- **File:** `supabase/migrations/20260910120000_financial_tables_least_privilege.sql`, on staging.
- **Rows:** DB-ACL-02 (`commission_entries`) and DB-ACL-03 (`commission_rules`). DB-ACL-06 (`partner_tier_snapshots`) is also covered, though that row doesn't name the version.
- **What it unlocks:** nothing visible. The financial ledger stops relying on RLS as its only barrier.
- **Objects:**
  - `revoke all on table` `commission_entries`, `commission_rules`, `commission_adjustments`, `partner_payouts`, `referral_attributions`, `partner_benefit_uses`, `partner_tier_snapshots` `from anon, authenticated`
  - `grant select on table` `commission_entries`, `commission_adjustments`, `partner_payouts`, `referral_attributions`, `partner_tier_snapshots` `to authenticated`: exactly the five tables with an own-row SELECT policy
  - No function, policy, trigger, index, column or default-privilege change.
- **Live state today:** `anon` and `authenticated` hold `arwdDxtm` on all seven (PostgreSQL 17.6). RLS is on everywhere; the only policies are the five SELECT own-row ones.
- **Rows/data:** none.
- **Rollback (new 2026-09-17):** `supabase/rollbacks/20260910120000_financial_tables_least_privilege.rollback.sql`. It runs `grant all … to anon, authenticated` on the seven tables inside `begin/commit`, which restores exactly `arwdDxtm`.
- **Regression tests (new 2026-09-17):** `src/billing/domain/financialTablesLeastPrivilege.migration.test.ts`, 8 tests, 5 mutants fail it. It pins:
  - the two statements
  - SELECT returns exactly where a policy exists
  - no data, function or policy statement
  - the rollback
  - no browser read of the tables
  - the two edge functions that read them use the service-role client
  - no callable invoker-rights function reads them
  - the one cross-table policy reads a table that keeps its grant
- **Why nothing breaks** (live catalog, read-only):
  - No invoker-rights function that `anon` or `authenticated` can execute reads these tables.
  - No view or realtime publication reads them.
  - `create-checkout-session` and `stripe-webhook` use `SUPABASE_SERVICE_ROLE_KEY`.
- **Testable without applying?** The contract above, yes. After applying:
  1. Read back the ACL of the seven tables.
  2. Run a served smoke test of `/partner` (dashboard, earnings, payouts) and a sandbox checkout.
- **Dependencies / overlaps:** none; order-independent with the other packages. Package 3's functions are SECURITY DEFINER.
- **Risks:**
  - `partner_payout_items_select_own` looks up `partner_payouts`. For `authenticated` nothing changes. An anonymous request against `partner_payout_items` would get a permission error instead of zero rows, and no client makes one.
  - `partner_payout_items` itself keeps broad grants and is not in this package.

## Package 2 — `20260910180000_partner_application_lifecycle_email`

**NOT READY FOR APPROVAL.** Three defects were found and fixed in PR #381, which has no DB action and must merge first. Two owner decisions remain open.

- **File:** `supabase/migrations/20260910180000_partner_application_lifecycle_email.sql`, on staging. Rollback: `supabase/rollbacks/20260910180000_partner_application_lifecycle_email.rollback.sql`.
- **Row:** C-APP-08.
- **What it unlocks:** the applicant is e-mailed when their application becomes submitted, more information needed, approved or rejected. On approval without a Connect account, they also get a "payout setup" e-mail.
  - This only queues `email_jobs`. Delivery also needs the `email-dispatch` worker and `RESEND_API_KEY` (EMAIL-02/07), and neither is recorded as live.
- **Objects:**
  - created `gellatti_partner_application_email_v1() returns trigger` (SECURITY DEFINER)
  - created trigger `partner_application_lifecycle_email`: `AFTER INSERT OR UPDATE OF status ON partner_applications`
  - replaced `gellatti_submit_partner_application_v1(jsonb)`: identical to `20260910044111` except one allow-listed key, `origin`
- **Rows/data:** none rewritten. Each future mailable transition inserts `email_jobs` rows (idempotent per transition).
- **Rollback:** drops the trigger and its function, then restores the submit RPC byte-identical to `20260910044111`. Queued jobs stay.
- **Defects found 2026-09-17, fixed in PR #381:**
  1. Applicant subjects carried the internal bracket taxonomy, against `emailSubject.ts` ES7. They are now plain sentences with `[STAGING] ` off-production, as `buildCustomerSubject` renders them.
  2. The app never sent `origin`, so every e-mail, production included, would have been labelled staging and linked to staging. `submitPartnerApplication` now sends it; the live RPC ignores the key until this package applies.
  3. "Tryb Affiliate" / "Otwórz panel Affiliate" become "Tryb Partner" / "Otwórz panel Partner" (C-APP-13).
- **Open owner decisions (not changed):**
  - **Other writers of `approved`.** Admin activation (`gellatti_activate_partner_for_user_v1`) and invitation acceptance (`gellatti_accept_my_partner_invitation_v1`) also insert approved applications, so they would send "Zgłoszenie zatwierdzone". They write `application_data` without an origin, so those e-mails would be labelled staging. They insert the `partners` row after the application, so the trigger always adds the payout-setup e-mail.
  - **The payout-setup e-mail itself** asks the partner to act. The dashboard says Gellatti prepares the payout account and there is nothing to do (G-WEL-05/07). Keep it, reword it, or drop it?
- **Regression tests:**
  - `src/notifications/domain/applicationLifecycleEmail.test.ts`: 13, plus 5 in PR #381
  - `src/services/partnerApplicationOrigin.test.ts`: 5, PR #381
  - `src/features/partner-application/openApplicationUniq.migration.test.ts`: 4
  - AS3 and `auditActorTypes`: since 2026-09-17 they read this file's `$function$` definition; before, they silently checked `20260831201100`.
- **Testable without applying?** Static tests only. Applying changes production's data flow: any status change on the shared DB, staging QA included, queues a real e-mail (C-APP-08, "no isolated mail sink").
- **Dependencies / overlaps:**
  - Needs `email_jobs` and `gellatti_enqueue_email_v1` (applied) and `20260910044111` (latest recorded when checked on 2026-09-11; re-verify before applying).
  - With package 5 applied too, each admin decision sends the in-app notice and an e-mail.
- **Minor:** the admin's decision reason is inserted into the HTML body unescaped. Admin-authored, so low risk.

## Package 3 — `20260910200000_partner_workspace_link_performance`

**WAITING OWNER DB APPROVAL.**

- **Files:** `supabase/migrations/20260910200000_partner_workspace_link_performance.sql` and its rollback, both on staging.
- **Rows:** D-LINK-03 and H-DASH-06.
- **What it unlocks:** on `/partner`, each campaign link shows **Rejestracje, Klienci, Aktywne subskrypcje** next to Kliknięcia, and codes get an active-subscriptions count. These are counts only, with no customer identity, and the UI is already on staging.
  - Corrected 2026-09-17: earlier notes said "unique visitors"; the SQL adds no such count.
- **Objects:**
  - created `gellatti_partner_active_referred_count_v2(uuid, timestamptz, uuid, uuid)`: SQL, STABLE, SECURITY DEFINER, revoked from `public`, `anon` and `authenticated`
  - replaced `gellatti_partner_workspace_v1()`: the `20260826122000` body plus four keys; signature and grants unchanged
- **Rows/data:** none; read-only functions.
- **Rollback:** restores the workspace RPC byte-identical to `20260826122000` (live md5 `7e674248…`), then drops v2, in one transaction.
- **Regression tests:**
  - `src/features/affiliate/linkPerformance.migration.test.ts`: 14
  - `src/features/affiliate/workspacePayload.contract.test.ts`: 7
  - `src/features/affiliate/codeLinkDisplay.test.ts`: 9
- **Testable without applying?** The static tests, and `/partner` today (clicks only). After applying: real counts, latency, and that v2 is not callable by a client.
- **Dependencies / overlaps:** none. Package 1 doesn't affect it (definer functions).
- **Risk:** extra subqueries per link. `referral_attributions(click_id)` and `referral_clicks.context->>'contentLinkId'` have no index. Data volume is small today (4 live partners).

## Package 4 — `20260910210000_partner_code_claim_refusal_owner_check`

**WAITING OWNER DB APPROVAL.**

- **Files:** migration and rollback on branch `claude/dcode03-rpc-owner-check`, PR #281 (open, green on 2026-09-11, now BEHIND staging).
- **Row:** **D-CODE-03** (the owner decision of 2026-09-10 to tighten the caller check).
  - The file, its test and the PR title call it "D-CODE-08", but no such row exists. The PR body also says it carries the row text; the diff has only three files.
- **What it unlocks:** no visible change for a real partner. It closes a leak: a signed-in account can no longer ask the RPC about another partner's codes or slot count; such a call now raises `42501`.
- **Objects:** replaced `gellatti_partner_code_claim_refusal_v1(uuid, text)`. It is the `20260831200200` body plus one first-statement guard (`p.id = p_partner_id and p.user_id = auth.uid()`). Signature, return values and grants are unchanged.
- **Rows/data:** none.
- **Rollback:** restores `20260831200200` byte-identical, in one transaction.
- **Regression tests:**
  - `src/billing/domain/partnerCodeOwnerCheck.migration.test.ts`: 12, PR #281
  - `src/features/affiliate/codeAvailability.test.ts`: 12, staging
- **Testable without applying?** Static only. After applying:
  1. A second signed-in account passing another partner's id gets `42501`.
  2. The owner's own check still answers.
  3. Service-role calls behave as before.
- **Dependencies / overlaps:** none. The only caller is the Codes form, which passes the caller's own partner id and hides errors.

## Package 5 — `20260910220000_partner_application_notification_links`

**WAITING OWNER DB APPROVAL.**

- **Files:** migration and rollback on branch `claude/capp09-notification-links`, PR #280 (open, green on 2026-09-11, now BEHIND staging). The PR also carries a client fix that already maps old links on read.
- **Row:** C-APP-09.
- **What it unlocks:** future "more information" and "rejected" in-app notifications are stored with `/partner` instead of the retired `/work-with-us`, which redirects to `/franchise`.
- **Objects:** replaced `gellatti_admin_partner_application_action_v1(uuid, text, text)`. It is the `20260831201000` body with one literal changed; grants are unchanged.
- **Rows/data:** none rewritten. The 2 existing rows with the old link keep it, and PR #280's client mapping opens `/partner` for them.
- **Rollback:** restores `20260831201000` byte-identical, in one transaction.
- **Regression tests:**
  - `src/features/notifications/applicationNotificationLinks.migration.test.ts`: 6
  - `src/features/notifications/notificationLink.test.ts`: 3
  - AS3
- **Testable without applying?** Static, plus the served notification centre once #280 merges. Proving the stored link needs a real admin action on the shared DB, which notifies a real applicant.
- **Dependencies / overlaps:** with package 2, each admin decision creates both channels.
- **PR note:** #280 widens the AS3 filename pin. Since 2026-09-17 AS3 checks "not older than the fix" by content, so that hunk becomes unnecessary and will conflict when #280 is updated. Take staging's version.

## Package 6 — `20260917120000_referral_tables_revoke_direct_read`

**WAITING OWNER DB APPROVAL.** This is a new package, found on 2026-09-17.

- **Files:** migration and rollback on branch `claude/jref17-referral-table-grants`, PR #380 (open by design).
- **Row:** J-REF-17. Lane B carries the finding under L10.
- **What it unlocks:** a referrer can no longer read the referred person's identifiers.
  - Today, a signed-in referrer calling the REST API gets, on their own reward rows: `referred_user_id`, `attribution_id`, `stripe_subscription_id`, `stripe_invoice_id` and `reversal_reason`.
  - On their attributions, they get `referred_user_id`.
  - The referral panel never used this path; it reads through SECURITY DEFINER RPCs that return nothing about the other person.
- **Objects:** `revoke select on public.referral_rewards from authenticated` and `revoke select on public.user_referral_attributions from authenticated`. Nothing else; the own-row policies stay.
- **Rows/data:** none. Both tables hold **0 rows** today, so the exposure is latent.
- **Rollback:** `grant select … to authenticated` on both tables, exactly the grants live today.
- **Regression tests:**
  - `src/features/referral/referralTableGrants.migration.test.ts`: 7, PR #380, each mutation-checked. It counts default EXECUTE privileges as callable.
  - `src/features/referral/referralDashboardPrivacy.migration.test.ts`: 7, pins the RPC surface.
- **Why nothing breaks** (live catalog):
  - The readers `authenticated` can execute are `gellatti_my_referral_dashboard_v1` and `gellatti_claim_referral_code_v1`, both SECURITY DEFINER.
  - The invoker-rights `gellatti_pro_bonus_balance_v1` is not executable by clients.
  - No view, cross-table policy or realtime publication reads the tables.
- **Testable without applying?** The contract, yes. After applying:
  1. A signed-in `GET /rest/v1/referral_rewards` returns `42501`.
  2. `/account?section=referral` still renders.
- **Dependencies / overlaps:** none.
