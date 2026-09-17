# Work With Us / Partner — checklist row → automated test map

Prepared 2026-09-17 against `origin/staging` `6e83b8d1`.

**Scope:** every Lane A row whose text changed between `27a7cf87` (before this workstream's merge sequence) and `6e83b8d1` — 50 rows. Lane B's only READY row, K16, is listed at the end.

**Method:**
- a test the row cites, resolved to its path
- a test file that names the row ID
- where neither exists, tests located by the module or migration the row names, each checked by reading

**Evidence:** all 40 test files in this map pass on `6e83b8d1` — 559 tests, `vitest run`, 2026-09-17.

**Coverage legend:**
- **full**: the row's behaviour is pinned.
- **partial**: only the built part is pinned, or only part of the row.
- **none**: no automated test.
- **n/a**: not behaviour.

**Summary:** full 30 · partial 14 · none 5 · n/a 1.

| Row | Work | Auto | Coverage | Test file(s) | Note |
|---|---|---|---|---|---|
| A-IA-07 | 🟢 | ✅ | partial | `src/features/work-with-us/leadEnquiry.test.tsx` | the client sends `sourceRoute`; nothing pins migration `20260906200629` (`franchise_inquiries.source_route` + RPC allowlist) |
| C-APP-04 | 🟢 | ✅ | full | `src/features/partner-application/openApplicationUniq.migration.test.ts` |  |
| C-APP-07 | 🟢 | ✅ | full | `src/features/partner-application/ApplicationStatusCard.test.tsx`<br>`src/features/partner-application/applicationReachable.test.ts`<br>`src/features/partner-application/applicationSurface.test.ts` |  |
| C-APP-08 | 🟡 | ✅ | partial | `src/notifications/domain/applicationLifecycleEmail.test.ts` | the tests cover the built part; the rest of the row is open (see its Next column) |
| C-APP-09 | 🟢 | ✅ | full | `src/features/partner-application/approvalGrants.migration.test.ts` |  |
| C-APP-10 | 🟢 | ✅ | full | `src/features/partner-application/approvalGrants.migration.test.ts` |  |
| C-APP-13 | 🟢 | ⬜ | none | — | a naming decision (KEEP "Partner"); no guard asserts it |
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
| DB-DRIFT-01 | ⚪ | ⬜ | n/a | — | a migration-history audit, not behaviour; plan: `reports/DB_DRIFT_01_AB_RECONCILIATION_PLAN.md` |
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
| P-LEAD-06 | 🟢 | ✅ | none | — | migration `20260910032351` (admin e-mail to info@gellatti.com) was verified live, but no test pins it |
| R-DES-02 | 🟡 | ✅ | partial | `src/copy/customerCopyGuard.test.ts`<br>`src/pages/community/partnerPageCopy.render.test.tsx` | the tests cover the built part; the rest of the row is open (see its Next column) |
| S-SEC-03 | 🟢 | ✅ | full | `src/features/affiliate/workspacePayload.contract.test.ts` |  |
| T-TEST-03 | 🟢 | ✅ | full | `src/billing/domain/attribution.test.ts`<br>`src/billing/domain/attributionOwnership.migration.test.ts`<br>`src/billing/domain/partnerCodeHistory.migration.test.ts`<br>`src/billing/domain/partnerCodeSlots.test.ts`<br>`src/billing/domain/partnerCodes.test.ts`<br>`src/features/affiliate/codeAvailability.test.ts`<br>`src/features/affiliate/partnerLinkOwnership.contract.test.ts` |  |

## Lane B

| Row | Coverage | Test file(s) | Note |
|---|---|---|---|
| K16 | partial | `src/features/referral/referralWebhookWiring.test.ts` | the reversal itself is pinned (webhook → `referral_reward_reversed`). **The struck-through rendering of a reversed reward (`RewardRow` in `ReferralPanel.tsx`) has no test**, although K16's note says it is unit-tested. Not served-proven either: no reversed reward exists on staging |

## Rows with no automated coverage, and what closing each needs

| Row | Why there is no test | To close |
|---|---|---|
| P-LEAD-06 | migration `20260910032351` was verified live by hand | a migration contract test pinning the admin e-mail enqueue to info@gellatti.com (**no DB change**, implementable now) |
| A-IA-07 | only the client side is pinned | a migration contract test for `franchise_inquiries.source_route` and its RPC allowlist (**no DB change**, implementable now) |
| K16 (Lane B) | the reversed-row rendering was never tested | a render test: a reversed reward reads *Cofnięte* with its days struck through (**no DB change**, implementable now) |
| C-APP-13 | a naming decision | a copy guard: the signed-in area is titled "Partner", never "Affiliate" (**no DB change**, implementable now) |
| EMAIL-01 | the row is still to do | build it first |
| G-WEL-04 | not built | the DB field for the resolved rate profile (owner approval) |
| I-ADM-06 | not built | an admin read RPC (owner approval) |
| DB-DRIFT-01 | an audit, not behaviour | — |
