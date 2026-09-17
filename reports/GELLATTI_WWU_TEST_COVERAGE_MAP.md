# Work With Us / Partner — checklist row → automated test map

Prepared 2026-09-17 on branch `claude/wwu-phase2-qa-coverage-drift`, which is `origin/staging` `6e83b8d1` plus this phase's tests and ledger.

**Scope:** every Lane A row whose text changed between `27a7cf87` (before this workstream's merge sequence) and this branch — 57 rows. Lane B's only READY row, K16, is listed at the end.

**Method:**
- a test the row cites, resolved to its path
- a test file that names the row ID (a mention that is not coverage is removed by hand)
- where neither exists, tests located by the module or migration the row names, each checked by reading

**Evidence:** all 45 test files in this map pass on the branch — 586 tests, `vitest run`, 2026-09-17 (the count is the files' own tests, run together). Every new test added this phase was also mutation-checked: each failed when the behaviour it pins was broken.

**Coverage legend:**
- **full**: the row's behaviour is pinned.
- **partial**: only the built part is pinned, or only part of the row.
- **none**: no automated test.
- **n/a**: not behaviour.

**Summary:** full 36 · partial 15 · none 3 · n/a 3.

| Row | Work | Auto | Coverage | Test file(s) | Note |
|---|---|---|---|---|---|
| A-IA-07 | 🟢 | ✅ | full | `src/features/franchise/franchiseInquiry.migration.test.ts`<br>`src/features/work-with-us/leadEnquiry.test.tsx` | client sends `sourceRoute`; SQL side pinned 2026-09-17 — nullable column, the latest RPC writes it, allowlist = `FRANCHISE_SOURCE_ROUTES`, unknown route stored as null |
| C-APP-04 | 🟢 | ✅ | full | `src/features/partner-application/openApplicationUniq.migration.test.ts` |  |
| C-APP-07 | 🟢 | ✅ | full | `src/features/partner-application/ApplicationStatusCard.test.tsx`<br>`src/features/partner-application/applicationReachable.test.ts`<br>`src/features/partner-application/applicationSurface.test.ts` |  |
| C-APP-08 | 🟡 | ✅ | partial | `src/notifications/domain/applicationLifecycleEmail.test.ts` | the tests cover the built part; the rest of the row is open (see its Next column) |
| C-APP-09 | 🟢 | ✅ | full | `src/features/partner-application/approvalGrants.migration.test.ts` |  |
| C-APP-10 | 🟢 | ✅ | full | `src/features/partner-application/approvalGrants.migration.test.ts` |  |
| C-APP-13 | 🟢 | ✅ | full | `src/copy/workWithUsOwnerRules.guard.test.ts` | guard 2026-09-17 — mode switcher and dashboard title say Partner; nothing inside /partner says Affiliate; the dead "Panel Affiliate" copy stays unrendered |
| D-ATTR-01 | 🟢 | ✅ | full | `src/billing/domain/attribution.test.ts`<br>`src/billing/domain/attributionOwnership.migration.test.ts` |  |
| D-CODE-01 | 🟢 | ✅ | full | `src/billing/domain/partnerCodeSlots.migration.test.ts`<br>`src/billing/domain/partnerCodes.test.ts` |  |
| D-CODE-02 | 🟢 | ✅ | full | `src/pages/community/partnerCodeSlots.render.test.tsx` |  |
| D-CODE-03 | 🟢 | ✅ | full | `src/features/affiliate/codeAvailability.test.ts` |  |
| D-CODE-04 | 🟢 | ✅ | full | `src/billing/domain/partnerCodeHistory.migration.test.ts` |  |
| D-CODE-05 | 🟢 | ✅ | full | `src/pages/community/partnerCodeSlots.render.test.tsx` |  |
| D-CODE-06 | 🟢 | ✅ | full | `src/billing/domain/partnerCodeHistory.migration.test.ts` |  |
| D-CODE-07 | 🟢 | ✅ | full | `src/features/admin/adminCodeDisable.test.ts` |  |
| D-LINK-02 | 🟢 | ✅ | full | `src/features/affiliate/partnerLinkOwnership.contract.test.ts` |  |
| D-LINK-03 | 🟡 | ✅ | partial | `src/features/affiliate/codeLinkDisplay.test.ts`<br>`src/features/affiliate/linkPerformance.migration.test.ts` | the tests cover the built part; the rest of the row is open (see its Next column) |
| DB-DRIFT-01 | 🟡 | ⬜ | n/a | — | a migration-history audit, not behaviour; plan: `reports/DB_DRIFT_01_AB_RECONCILIATION_PLAN.md` |
| E-HOLD-02 | 🟡 | ⬜ | partial | `src/features/affiliate/workspacePayload.contract.test.ts`<br>`src/pages/community/partnerEarnings.render.test.tsx` | earned · held · eligible date · eligible · paid · reversed covered; batched and transfer are not built (DB) |
| E-REV-04 | 🟢 | ✅ | full | `src/features/affiliate/partnerAccountDisplay.test.ts` |  |
| EMAIL-01 | ⚪ | ⬜ | none | — | still to do; listed only because its DB-ACL duplicate ID was renamed |
| EMAIL-02 | 🟢 | ✅ | full | `src/notifications/domain/emailDispatch.test.ts`<br>`src/notifications/domain/emailJob.migration.test.ts`<br>`src/notifications/domain/emailJob.test.ts` | text unchanged; listed only because its DB-ACL duplicate ID was renamed |
| EMAIL-03 | 🟢 | ✅ | full | `src/notifications/domain/emailSubject.test.ts` | text unchanged; listed only because its DB-ACL duplicate ID was renamed |
| EMAIL-DB-01 | 🟢 | ✅ | full | `src/notifications/domain/emailDispatch.test.ts`<br>`src/notifications/domain/emailJob.migration.test.ts` | renamed from the DB-ACL duplicate EMAIL-01 |
| EMAIL-DB-02 | 🟢 | ✅ | full | `src/notifications/domain/emailJob.migration.test.ts` | renamed from the DB-ACL duplicate EMAIL-02 |
| EMAIL-DB-03 | 🟢 | ✅ | full | `src/notifications/domain/emailJob.migration.test.ts` | renamed from the DB-ACL duplicate EMAIL-03 |
| F-PAY-03 | 🟡 | ⬜ | partial | `src/features/affiliate/partnerVisibleData.test.ts`<br>`src/pages/community/partnerEarnings.render.test.tsx` | payout statuses read as copy; the batch / transfer / bank distinction is not built (DB) |
| F-PAY-04 | 🟢 | ✅ | full | `src/features/affiliate/payoutCopyNoDatePromise.test.ts` |  |
| G-WEL-01 | 🟡 | ✅ | full | `src/features/affiliate/firstStepsModel.test.ts`<br>`src/pages/community/partnerFirstSteps.render.test.tsx` |  |
| G-WEL-02 | 🟢 | ✅ | full | `src/features/affiliate/firstStepsModel.test.ts`<br>`src/pages/community/partnerFirstSteps.render.test.tsx` |  |
| G-WEL-03 | 🟢 | ✅ | full | `src/features/affiliate/firstStepsModel.test.ts`<br>`src/pages/community/partnerFirstSteps.render.test.tsx` |  |
| G-WEL-04 | 🔴 | ⬜ | none | — | not built — needs the resolved rate profile from the DB |
| G-WEL-05 | 🟢 | ✅ | full | `src/features/affiliate/firstStepsModel.test.ts`<br>`src/pages/community/partnerFirstSteps.render.test.tsx` |  |
| G-WEL-06 | 🟢 | ✅ | full | `src/features/affiliate/firstStepsModel.test.ts`<br>`src/pages/community/partnerFirstSteps.render.test.tsx` |  |
| G-WEL-07 | 🟢 | ✅ | full | `src/features/affiliate/firstStepsModel.test.ts`<br>`src/pages/community/partnerFirstSteps.render.test.tsx` |  |
| H-DASH-02 | 🟡 | ✅ | partial | `src/features/affiliate/earningsSummary.test.ts`<br>`src/pages/community/partnerEarnings.render.test.tsx` | the tests cover the built part; the rest of the row is open (see its Next column) |
| H-DASH-03 | 🟢 | ✅ | full | `src/pages/community/partnerPageCopy.render.test.tsx` |  |
| H-DASH-06 | 🟡 | ✅ | partial | `src/features/affiliate/copyValueButton.test.tsx`<br>`src/pages/community/partnerCopyButtons.render.test.tsx` | the tests cover the built part; the rest of the row is open (see its Next column) |
| H-DASH-07 | 🟡 | ✅ | partial | `src/pages/community/partnerEarnings.render.test.tsx` | the tests cover the built part; the rest of the row is open (see its Next column) |
| H-DASH-08 | 🟡 | ✅ | partial | `src/pages/community/partnerEarnings.render.test.tsx` | the tests cover the built part; the rest of the row is open (see its Next column) |
| H-DASH-09 | 🟡 | ⬜ | partial | `src/features/affiliate/partnerAccountDisplay.test.ts`<br>`src/pages/community/partnerPageCopy.render.test.tsx` | status · tier · profile copy covered; notification preferences and the terms link are not built (owner decision) |
| H-DASH-10 | 🟡 | ⬜ | partial | `src/pages/community/partnerEarnings.render.test.tsx` | the reversal is covered; active · cancels at period end · ended · payment failed are not built (DB) |
| H-DASH-11 | 🟢 | ✅ | full | `src/services/renewalCommissionStops.test.ts` |  |
| I-ADM-02 | 🟡 | ✅ | partial | `src/features/admin/adminPartnerFilter.test.ts` | the tests cover the built part; the rest of the row is open (see its Next column) |
| I-ADM-05 | 🟡 | ✅ | partial | `src/features/admin/adminPartnerActionConfirm.test.ts`<br>`src/features/admin/adminPartnersSection.confirm.test.tsx` | the tests cover the built part; the rest of the row is open (see its Next column) |
| I-ADM-06 | ⚪ | ⬜ | none | — | not built — needs an admin read RPC (DB) |
| J-REF-17 | 🟡 | ✅ | partial | `src/features/referral/referralDashboardPrivacy.migration.test.ts` | the three user RPCs return nothing about the other person; the direct table read is still granted to `authenticated` — closing it is package 6 / PR #380 (owner DB approval) |
| L-PRICE-02 | 🟢 | ✅ | full | `src/copy/workWithUsOwnerRules.guard.test.ts` | no Incoterm in any public literal, no delivered-pricing phrase on the lanes, the only price is the trailer sentence, transport and taxes left to the quote |
| L-STORY-02 | 🟡 | ✅ | partial | `src/copy/workWithUsOwnerRules.guard.test.ts` | no manufacturer identity or manufacturing claim in any public literal; naming models on public pages is not built yet |
| N-TRAIL-05 | 🟢 | ✅ | full | `src/copy/workWithUsOwnerRules.guard.test.ts` | no FOB in any public literal; the trailer line is the exact owner sentence and the lane page renders it |
| O-FRAN-02 | 🟢 | ✅ | full | `src/copy/workWithUsOwnerRules.guard.test.ts` | no fee / ROI / payback / turnover / margin / CAPEX term, amount or percentage in franchise copy or the /franchise destination |
| P-LEAD-06 | 🟢 | ✅ | full | `src/features/franchise/franchiseInquiry.migration.test.ts`<br>`src/notifications/domain/emailSubject.test.ts`<br>`src/services/franchiseOrigin.test.ts` | SQL side pinned 2026-09-17 — recipient, subject taxonomy parity, idempotency, environment default, lead survives an enqueue failure, anon grant; the client origin by franchiseOrigin.test.ts |
| R-DES-02 | 🟡 | ✅ | partial | `src/copy/customerCopyGuard.test.ts`<br>`src/pages/community/partnerPageCopy.render.test.tsx` | the tests cover the built part; the rest of the row is open (see its Next column) |
| S-SEC-03 | 🟢 | ✅ | full | `src/features/affiliate/workspacePayload.contract.test.ts` |  |
| T-SQA-01 | ⚪ | ⬜ | n/a | — | served QA is not automated; the script is `reports/GELLATTI_WWU_SERVED_OWNER_QA_SCRIPT.md` |
| T-TEST-01 | 🟡 | ⬜ | n/a | — | a meta row: this map is its evidence |
| T-TEST-03 | 🟢 | ✅ | full | `src/billing/domain/attribution.test.ts`<br>`src/billing/domain/attributionOwnership.migration.test.ts`<br>`src/billing/domain/partnerCodeHistory.migration.test.ts`<br>`src/billing/domain/partnerCodeSlots.test.ts`<br>`src/billing/domain/partnerCodes.test.ts`<br>`src/features/affiliate/codeAvailability.test.ts`<br>`src/features/affiliate/partnerLinkOwnership.contract.test.ts` |  |

## Lane B

| Row | Coverage | Test file(s) | Note |
|---|---|---|---|
| K16 | full (automated) | `src/features/referral/referralWebhookWiring.test.ts`<br>`src/features/referral/referralRewardRow.render.test.tsx` | the reversal (webhook → `referral_reward_reversed`) and, since 2026-09-17, its rendering: the reversed row stays listed, reads *Cofnięte*, its days struck through and dimmed. **Not served-proven**: no reversed reward exists on staging |

## Gaps closed on 2026-09-17 (tests only, no DB change)

| Row | Was | Now |
|---|---|---|
| P-LEAD-06 | none — verified live by hand only | `franchiseInquiry.migration.test.ts` pins the applied RPC |
| A-IA-07 | partial — client side only | the same file pins `source_route` and the allowlist |
| C-APP-13 | none — a decision with no guard | `workWithUsOwnerRules.guard.test.ts` |
| K16 (Lane B) | partial — rendering untested | `referralRewardRow.render.test.tsx` |

## Still without full automated coverage

| Row | Why | To close |
|---|---|---|
| EMAIL-01 | the row is still to do | build it first |
| G-WEL-04 | not built | the DB field for the resolved rate profile (owner approval) |
| I-ADM-06 | not built | an admin read RPC (owner approval) |
| J-REF-17 | the RPCs are pinned, but a direct table read is still granted | package 6 / PR #380 (owner DB approval) |
| L-STORY-02 | public pages name no model yet | name models when the catalogue lands; the guard already holds |
| rows marked partial above | the rest of each row is not built | see each row's Next column |
