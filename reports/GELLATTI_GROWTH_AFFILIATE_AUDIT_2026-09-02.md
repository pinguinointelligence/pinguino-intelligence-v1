# GELLATTI GROWTH — AFFILIATE + REFER-A-FRIEND · REUSE AUDIT

**Base:** `origin/staging` @ `843ca841d1d33b7a4488d5b3b181660a8c60df7d` (fetched 2026-09-02)
**Branch:** `claude/gellatti-affiliate` · **Worktree:** `~/Developer/pinguino-affiliate`
**Staging DB:** `tunabqqrwabacxjcxxkz` (read live, not from migration files)

> **Headline: the affiliate backend is ~85 % already built, applied and canonical.**
> The public rates in the OWNER prompt match the live `commission_rules` table **exactly**.
> Nothing financial needs to be overwritten. What is genuinely missing is: the public
> **Affiliate** page + calculator, the payout **execution layer on the DB** (written,
> deliberately unapplied), and the **entire refer-a-friend / PRO Bonus Bank** lane.

---

## 1. AUTHORITY MAP

| AUTHORITY | EXISTING FILE / MIGRATION / TABLE / FUNCTION | CURRENT STATUS | VERDICT |
| --- | --- | --- | --- |
| Partner/affiliate applications | `0016_partner_program.sql` → `partner_applications`; `20260829190000_partner_application_lane.sql` → `gellatti_submit_partner_application_v1`, `gellatti_my_partner_application_v1`; UI `src/features/partner-application/PartnerApplicationPanel.tsx`; service `src/services/partner.ts` | Applied live. 2 application rows on staging | **REUSE AS-IS** |
| Application statuses | `partner_applications.status` CHECK (8 states incl. `more_information_needed`, added `20260831154203`); `src/features/partner-application/partnerApplicationStatus.ts` pairs each contract value with customer copy + guard test | Applied live | **REUSE AS-IS** |
| More-information flow | `20260831201000_partner_application_more_information.sql` (applied `20260831154203`) + `20260831201100` actor fix (applied `20260831155647`); `gellatti_admin_partner_application_action_v1` contains `more_information` | Applied live, verified by `pg_get_functiondef` | **REUSE AS-IS** |
| Partner codes | `0016` → `partner_codes`; `20260831200000` alias ownership + global uniqueness; `20260831200100` banned words; `20260831200200` slot dedupe; `gellatti_partner_manage_code_v1`, `gellatti_partner_code_claim_refusal_v1`, `gellatti_partner_code_guard_v1` (0–3 ceiling); domain `src/billing/domain/partnerCodes.ts`, `partnerCodeSlots.ts` | Applied live. 6 code rows | **REUSE AS-IS** |
| Referral / affiliate links | `partner_content_links` + `partner_public_profiles` (`20260826122000`); `gellatti_partner_create_content_link_v1`; route `/:partnerSlug/:partnerCode/l/:linkSlug` → `PartnerPublicRoute`; edge fn `partner-link-resolve` | Applied live | **REUSE AS-IS** |
| Customer attribution | `0017_referral_attribution.sql` → `referral_clicks`, `referral_attributions` (active-owner + active-stripe unique indexes); domain `src/billing/domain/attribution.ts` (A1–A8: 30-day window, code overrides cookie, locked on first paid, self-referral rejected); `PartnerReferralBridge` mounted in `src/app/App.tsx`; `saveReferralEvidence`/`claimReferralEvidence` | Applied live. 6 attribution rows | **REUSE AS-IS** |
| Rate profiles (versioned) | `20260831200500_partner_rate_profiles.sql` (applied `20260831150753`) → `partner_rate_profiles`, `gellatti_partner_elite_rate_v1`, overlap trigger, `commission_entries.rate_profile_version_id`; domain `src/billing/domain/partnerRateProfiles.ts` | Applied live. 0 profiles seeded | **REUSE AS-IS** |
| Standard rates | `commission_rules` v1 seed + `RATE_TABLE_V1` in `src/billing/domain/commissionRules.ts` | **LIVE VALUES VERIFIED**: home/monthly 199 · home/annual 900 · pro/monthly 499 · pro/annual 2900 | **REUSE AS-IS — matches OWNER exactly** |
| Gold rates | same | **LIVE VALUES VERIFIED**: 249 · 1400 · 599 · 3900 | **REUSE AS-IS — matches OWNER exactly** |
| Gold 100-active threshold | `gellatti_gold_threshold_v1()` returns `100` (live); `DEFAULT_GOLD_THRESHOLD = 100` in `tierSnapshots.ts`; `gellatti_partner_active_referred_count_v1` / `..._asof_v1` | Applied live | **REUSE AS-IS** |
| Elite custom rates | `partner_rate_profiles` (per-partner, versioned, no overlap); `ELITE_DEFAULT_SUGGESTION_RATES` are suggestions only; DB `commission_rules` still holds elite rows 299/1900/699/4900 as the pre-override default | Applied live | **ADAPT** — public surface must expose **no** Elite number |
| Recurring renewal commission | `commissionRules.ts` C3–C5 (`monthly_renewal`, `annual_renewal`, 15-month = ONE annual, conversion once); runtime `supabase/functions/stripe-webhook/dispatch.ts` + `effects.ts`; `commission_entries_invoice_uniq` = one commission per invoice | Applied live; webhook deployed | **REUSE AS-IS** |
| Commission ledger | `0018_commission_ledger.sql` → `commission_entries` (immutable), `commission_adjustments` (append-only), `commission_rules`, `partner_tier_snapshots` | Applied live. 0 entries yet | **REUSE AS-IS** |
| Payout maturity | `src/billing/domain/holdCalendar.ts` H1–H4 — two FULL calendar months, Europe/Madrid, M → 1st of M+3, DST-correct | Pure domain, tested | **REUSE AS-IS** |
| Minimum payout | `DEFAULT_PAYOUT_THRESHOLD_CENTS = 2500` (`payoutNetting.ts` P2); `gellatti_build_payout_batch_v1(p_threshold_cents default 2500)` | Domain applied; **SQL function NOT on staging** | **ADAPT — migration must be applied** |
| Payout execution | `20260831202500_payout_execution.sql` → `payout_release_state` + 9 `gellatti_*` fns incl. the live-money kill switch | **WRITTEN, NOT APPLIED** (`payout_release_state` = `null`, 0 payout fns live) | **MISSING on DB — apply (test-mode only)** |
| Scheduling (cron) | `20260831203000_partner_scheduling.sql` → `partner_job_runs` + 4 fns | **WRITTEN, NOT APPLIED** (`partner_job_runs` = `null`) | **MISSING on DB — apply** |
| Tier snapshot writer | `20260831202000` (applied `20260831190352`) + `20260831204000` on-time guard (applied `20260831194031`) | Applied live. 0 snapshots yet | **REUSE AS-IS** |
| Affiliate dashboard | `gellatti_partner_workspace_v1` (live, returns partner/profile/codes/clicks/signups/paidCustomers/commission buckets/payouts); `src/pages/community/PartnerPage.tsx` (747 lines, 8 sections) at `/partner` | Applied live | **ADAPT** — add tier progress, personal rate, Gold progress |
| Admin partner controls | `AdminPartnersSection.tsx` (476), `AdminPartnerApplicationsPanel.tsx` (253); RPCs `gellatti_admin_partner_applications_v1`, `..._application_action_v1`, `..._partner_status_v1`, `..._partner_code_action_v1`, `..._partner_link_action_v1`, `..._partner_note_v1`, `..._set_commission_rule_v1`, `..._partner_tier_snapshots_v1`, `..._tier_snapshot_gaps_v1` | Applied live | **REUSE AS-IS** (extend for Elite rate write) |
| Stripe settlement hooks | `supabase/functions/stripe-webhook/{index,dispatch,handlers,effects}.ts`; `stripe-subscription-webhook`; `billing_price_catalog` (11 rows live); Stripe **TEST** mode live on staging | Deployed | **REUSE AS-IS** |
| RLS / security | Every financial table: RLS on, SELECT-own only, **no** insert/update/delete grant to `authenticated`; all writes service-role. `src/billing/domain/financialFunctionPermissions.test.ts`, `migrationGrantSurface.test.ts` | Applied live | **REUSE AS-IS** |
| Tests | 30 files under `src/billing/**`, `partnerApplicationStatus.test.ts`, `partnerShareAttribution.test.ts`, 4 `*.migration.test.ts` | Green on staging | **REUSE AS-IS** |
| **Public Affiliate page** | — | **Does not exist.** `/partner` is the authenticated dashboard; `/work-with-us` is the business-leads lane | **MISSING — BUILD** |
| **Affiliate calculator** | — | **Does not exist** | **MISSING — BUILD** |
| **Refer-a-friend / PRO Bonus Bank** | — | **Zero code.** No table, no function, no UI, no reward, no entitlement overlay | **MISSING — BUILD** |
| **Hamburger `Affiliate` item** | `src/features/shell/appNav.ts` (canonical drawer model) | `workWithUs` + `franchise` in `ecosystem`; no affiliate entry | **ADAPT** |

---

## 2. RATE AUTHORITY vs OWNER — NO CONFLICT

Read live from `public.commission_rules` on `tunabqqrwabacxjcxxkz`:

| | OWNER prompt | Live DB (cents) | Verdict |
| --- | --- | --- | --- |
| Standard HOME monthly | 1.99 € | `199` | ✅ |
| Standard PRO monthly | 4.99 € | `499` | ✅ |
| Standard HOME annual | 9 € | `900` | ✅ |
| Standard PRO annual | 29 € | `2900` | ✅ |
| Gold HOME monthly | 2.49 € | `249` | ✅ |
| Gold PRO monthly | 5.99 € | `599` | ✅ |
| Gold HOME annual | 14 € | `1400` | ✅ |
| Gold PRO annual | 39 € | `3900` | ✅ |
| Gold threshold | 100 active paying | `gellatti_gold_threshold_v1() = 100` | ✅ |
| Minimum payout | 25 € | `2500` cents | ✅ |
| Maturity | two full calendar months | `HOLD_ELIGIBILITY_MONTH_OFFSET = 3` (M → 1st of M+3) | ✅ |

**No financial authority is overwritten by this workstream.** Elite rows stay in the DB as the
pre-override default; the public surface exposes no Elite number.

---

## 3. TERMINOLOGY RULE APPLIED

- Public/customer-facing: **Affiliate** (menu item, `/affiliate`, page identity, copy).
- Internal DB/functions/migrations keep `partner_*` — **not renamed**. `partners`,
  `partner_codes`, `commission_entries`, `gellatti_partner_*` all stay.
- `Partner` stays reserved for future true B2B/industry relationships.

## 4. OUT OF SCOPE (untouched)

`/work-with-us`, `/machines`, `/mobile`, `/trailer`, `/franchise`, `business_leads`,
`/admin/leads`, HOME, PRO, Shop, the Engine/Solver/Mapper.
