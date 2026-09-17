# DB-DRIFT-01 — reconciliation plan for classes A and B (analysis only; nothing renamed, no DB action)

Prepared 2026-09-17 against `origin/staging` `6e83b8d1` (230 migration files) and `supabase_migrations.schema_migrations` (263 recorded; read-only).

- **Classes on current staging:** aligned 159 · A 11 · B 31 · C 16 · D 13.
- **Delta since the 2026-09-11 classification** (`logs/drift-classification.md`, baseline `846f2886`):
  - No older file was modified, renamed or deleted.
  - One new **A**: `scanner_durable_version_persistence` (repo `20260913194637`, recorded `20260913205042`; byte-identical to the recorded statement).
  - Four new **D** files: `20260910180000` and `20260910200000`, both NOT APPLIED by design, and the scanner 1.4 pair `20260915170000` / `20260915173000`, not yet applied.
  - Twelve new **E** records: the off-mirror set, the slot/country approvals, and classifier typing.
  - C, D and E are untouched here; they wait for your decision.

## Why a rename can break a fresh replay

`supabase db reset` replays files in filename order, while production ran them in recorded-version order. Renaming a file to its recorded version therefore makes its position match production **relative to every aligned file**. It can still invert its order relative to another **misaligned** file it shares objects with:
- one creates something the other uses, or
- both define the same function or view, so the wrong definition ends up last, or
- one writes a column the other adds.

## Method

- **Objects:** for every migration, what it defines (functions, tables, views, types, sequences, indexes, policies, triggers, and columns added, renamed or dropped) and what it uses (names defined elsewhere, and table + column pairs).
- **Checks:** every A/B move is tested against every file it shares objects with, twice — moved **alone**, and **after all A/B moves**. Required order is production's recorded order; for a D file, which has no recorded order, it's the dependency direction.
- **Grouping:** files that must move together form one group. A group whose final order conflicts with a class C file is **BLOCKED** until you decide what that file should record.
- **Pins:** each group lists the tests, sources and rollbacks that reference its files. It also lists regex filename pins that would silently stop matching:
  - `migrationGrantSurface.test.ts`'s `WORKSTREAM` range affects every file it matches.
  - AS3 in `partnerApplicationStatus.test.ts` affects only G34, whose files hold the latest definitions it checks.
- **Limits:**
  - Dynamic SQL (`execute format(…)`) and CHECK-constraint values are not followed.
  - Data-row conflicts are checked by hand. One case applies: G16 rewrites three `shop_products.description` values that no jumped-over file writes, so the end state is identical.
- **Proof still needed per PR:** a replay on a disposable database (a local Postgres, or a Supabase branch). A branch is a project resource, so it needs your approval; the shared DB is never used.

## Summary

- **36 groups:**
  - movable: 32
  - blocked by a class C file: 3
  - already owned elsewhere: 1 — `mapper_lineage_current_binding` is renamed by open PR #198 (Mapper lane)
- **This workstream's files** (partner, referral, e-mail jobs, business leads): 8 groups. 7 are movable, and G33 (partner-code banned words + slot limit) is blocked by the class C `partner_code_slots_and_alias_ownership`.

## Recommended order

1. **This workstream, one PR per group, in this order:**
   - G21 `partner_code_index_dedupe`
   - G26 `email_jobs_area_shop`
   - G18 `email_jobs`
   - G19 `business_leads`
   - G35 the refer-a-friend pair
   - G34 the partner-application pair
   - G36 rate profiles + grant surface + tier-snapshot writer + on-time guard

   The groups share no objects with each other, so any order is safe. This one goes from fewest references to most.

   Each PR must:
   - rename every group member together
   - update every listed test, source line, pin and rollback reference in the same commit
   - pass full CI
   - pass the replay proof
   - perform **no DB action** (the DB already recorded these versions)

2. **Other lanes' movable groups:** only by that lane, or with your go-ahead. They are Scanner, Mapper/Search, PRO / Processing, HOME / Community and Shop, all on the do-not-touch list for this workstream.
3. **Blocked groups** (G14, G15, G33): after you decide what each blocking C file should record.
4. **G29:** through PR #198.

## This workstream's groups

| Group | Status | Members (class · name · from→to · lane) | Shared objects | Blocked by | Update in the same PR |
|---|---|---|---|---|---|
| G18 | movable | A `email_jobs` 20260831201500→20260831175103 (WWU/Growth (email)) | — | — | `src/billing/domain/financialFunctionPermissions.test.ts`<br>`src/billing/domain/migrationGrantSurface.test.ts /^202608312(0\|1\|2\|3)\d{4}_/`<br>`src/notifications/domain/emailJob.migration.test.ts` |
| G19 | movable | B `business_leads` 20260831203500→20260901041222 (WWU/Growth (leads)) | — | — | `src/billing/domain/migrationGrantSurface.test.ts /^202608312(0\|1\|2\|3)\d{4}_/`<br>`src/features/admin/businessLeads.migration.test.ts` |
| G21 | movable | A `partner_code_index_dedupe` 20260902140000→20260902183321 (WWU/Growth) | — | — | `src/billing/domain/partnerCodeSlots.migration.test.ts` |
| G26 | movable | B `email_jobs_area_shop` 20260903100000→20260903003511 (WWU/Growth (email)) | — | — | — |
| G33 | BLOCKED | B `partner_code_banned_words` 20260831200100→20260831141738 (WWU/Growth)<br>B `partner_code_slot_limit_dedupe` 20260831200200→20260831143710 (WWU/Growth) | gellatti_partner_code_claim_refusal_v1 | C `20260831200000_partner_code_slots_and_alias_ownership` — gellatti_partner_code_claim_refusal_v1<br>C `20260831200000_partner_code_slots_and_alias_ownership` — enforce_partner_code_slot_limit, gellatti_partner_code_claim_refusal_v1 | `src/billing/domain/migrationGrantSurface.test.ts /^202608312(0\|1\|2\|3)\d{4}_/`<br>`src/billing/domain/partnerCodeSlots.migration.test.ts` |
| G34 | movable | A `partner_application_more_information` 20260831201000→20260831154203 (WWU/Growth)<br>A `partner_application_audit_actor_fix` 20260831201100→20260831155647 (WWU/Growth) | gellatti_submit_partner_application_v1 | — | `src/billing/domain/auditActorTypes.test.ts`<br>`src/billing/domain/financialFunctionPermissions.test.ts`<br>`src/billing/domain/migrationGrantSurface.test.ts /^202608312(0\|1\|2\|3)\d{4}_/`<br>`src/billing/domain/partnerCodeSlots.migration.test.ts`<br>`src/features/partner-application/partnerApplicationStatus.test.ts`<br>`src/features/partner-application/partnerApplicationStatus.test.ts /^202608312\d{5}_/`<br>`src/features/partner-application/partnerApplicationStatus.ts`<br>`src/services/partner.ts` |
| G35 | movable | B `refer_a_friend_pro_bonus` 20260902100000→20260902075705 (WWU/Growth)<br>B `refer_a_friend_functions` 20260902100100→20260902075812 (WWU/Growth) | pro_bonus_consumptions, referral_rewards, user_referral_attributions, user_referral_codes | — | `src/features/referral/referralRewardRules.migration.test.ts`<br>`src/features/referral/referralRewardRules.ts` |
| G36 | movable | B `partner_rate_profiles` 20260831200500→20260831150753 (WWU/Growth)<br>A `partner_rate_profiles_grant_surface` 20260831200600→20260831153241 (WWU/Growth)<br>B `partner_tier_snapshot_writer` 20260831202000→20260831190352 (WWU/Growth)<br>B `partner_tier_snapshot_on_time_guard` 20260831204000→20260831194031 (WWU/Growth) | gellatti_gold_threshold_v1, gellatti_partner_active_referred_count_v1, gellatti_partner_elite_active_v1, gellatti_write_partner_tier_snapshots_v1, partner_rate_profiles | — | `src/billing/domain/financialFunctionPermissions.test.ts`<br>`src/billing/domain/migrationGrantSurface.test.ts`<br>`src/billing/domain/migrationGrantSurface.test.ts /^202608312(0\|1\|2\|3)\d{4}_/`<br>`src/billing/domain/partnerRateProfiles.migration.test.ts`<br>`src/billing/domain/payoutExecution.migration.test.ts`<br>`src/billing/domain/tierSnapshotWriter.migration.test.ts` |

## All groups

| Group | Status | Members (class · name · from→to · lane) | Shared objects | Blocked by | Update in the same PR |
|---|---|---|---|---|---|
| G01 | movable | B `product_behavior_fingerprint_volatility` 20260823104000→20260823080708 (Mapper/Search (product)) | — | — | `src/features/product-scanner/productBehaviorFingerprint.migration.test.ts` |
| G02 | movable | B `recipe_save_atomicity_and_metadata` 20260823103000→20260823080753 (HOME/PRO recipes) | — | — | `src/features/pro-core/recipeSaveAtomicity.migration.test.ts`<br>`src/services/proCore/supabaseRecipes.ts`<br>`src/services/proCore/supabaseRecipesFake.ts` |
| G03 | movable | B `product_scan_retry_after_failed_save` 20260823110000→20260823083450 (Scanner) | — | — | `src/features/product-scanner/scanRetryQuota.migration.test.ts` |
| G04 | movable | B `community_sharing_v1_grant_and_policy_hardening` 20260823141500→20260823144529 (Community) | — | — | `src/features/community/migrations/communitySharing.migration.test.ts` |
| G05 | movable | B `community_make_by_run_and_remix_dedupe` 20260823152000→20260823161828 (Community) | — | — | — |
| G06 | movable | B `community_publication_based_on` 20260823154500→20260823164950 (Community) | — | — | — |
| G07 | movable | B `community_my_rating_reader` 20260823161000→20260823171426 (Community) | — | — | — |
| G08 | movable | A `process_dosage_informational_only` 20260823210000→20260823214822 (PRO / Processing) | — | — | — |
| G09 | movable | B `intimport_catalog_import_rate_class` 20260824100000→20260824085753 (Mapper/Search (import)) | — | — | `src/features/global-catalog/catalogImportRateClass.test.ts` |
| G10 | movable | A `production_heat_information_and_acknowledgement` 20260824150000→20260824110112 (PRO / Processing) | — | — | `src/features/product-intelligence/liveOverlayIdentity.migration.test.ts`<br>`src/features/production-workspace/productionHeatInformation.migration.test.ts` |
| G11 | movable | B `product_scan_live_evidence` 20260824140000→20260824110532 (Scanner) | — | — | `src/features/product-scanner/liveEvidenceQuota.migration.test.ts`<br>`src/features/product-scanner/paidCallContract.test.ts`<br>`src/features/product-scanner/scannerRuntimeStep17.test.ts` |
| G12 | movable | B `favorites_mapper_visibility` 20260829210000→20260829183750 (Mapper/Search) | — | — | `src/features/global-catalog/favoritesMapperVisibility.test.ts` |
| G13 | movable | B `home_creator_default_experience` 20260830100000→20260830150024 (HOME) | — | — | — |
| G14 | BLOCKED | B `community_root_creator_dna` 20260830110000→20260830151910 (Community) | — | C `20260830140000_home_community_match_oracle` — gellatti_publication_card_v1 | `src/features/community/migrations/likesFavorites.migration.test.ts` |
| G15 | BLOCKED | B `shop_allergens_and_fulfilment_reads` 20260831150000→20260831075320 (Shop) | — | C `20260831120000_shop_starter_pack_and_fulfilment` — column:shop_bundle_items.packed_grams, column:shop_orders.cancelled_at, column:shop_orders.refunded_at<br>C `20260831130000_shop_catalog_packed_grams` — gellatti_shop_catalog_v1 | — |
| G16 | movable | A `shop_allergen_statement_moved_out_of_prose` 20260831160000→20260831080735 (Shop) | — | — | — |
| G17 | movable | A `shop_orders_expected_checkout_total` 20260831170000→20260831162207 (Shop) | — | — | — |
| G18 | movable | A `email_jobs` 20260831201500→20260831175103 (WWU/Growth (email)) | — | — | `src/billing/domain/financialFunctionPermissions.test.ts`<br>`src/billing/domain/migrationGrantSurface.test.ts /^202608312(0\|1\|2\|3)\d{4}_/`<br>`src/notifications/domain/emailJob.migration.test.ts` |
| G19 | movable | B `business_leads` 20260831203500→20260901041222 (WWU/Growth (leads)) | — | — | `src/billing/domain/migrationGrantSurface.test.ts /^202608312(0\|1\|2\|3)\d{4}_/`<br>`src/features/admin/businessLeads.migration.test.ts` |
| G20 | movable | B `main_authority_baseline_not_browser_facing` 20260902130000→20260902140124 (PRO solver) | — | — | — |
| G21 | movable | A `partner_code_index_dedupe` 20260902140000→20260902183321 (WWU/Growth) | — | — | `src/billing/domain/partnerCodeSlots.migration.test.ts` |
| G22 | movable | B `shop_orders_local_pack_read` 20260902160000→20260902221158 (Shop) | — | — | — |
| G23 | movable | B `shop_revenue_summary_split` 20260902170000→20260902222139 (Shop) | — | — | — |
| G24 | movable | B `admin_shop_orders_operational_view` 20260902180000→20260902222439 (Shop) | — | — | — |
| G25 | movable | B `shop_order_type_lifecycle_separation` 20260902190000→20260902231402 (Shop) | — | — | `src/features/shop/localStarterPackContract.test.ts` |
| G26 | movable | B `email_jobs_area_shop` 20260903100000→20260903003511 (WWU/Growth (email)) | — | — | — |
| G27 | movable | A `production_rescue_supersession_audit` 20260904173339→20260904185226 (PRO / Processing) | — | — | `src/features/production-workspace/productionRescueSupersession.migration.test.ts` |
| G28 | movable | B `scan_import_v2_exact_gtin_resolver` 20260905090000→20260905063617 (Scanner) | — | — | `src/features/auth/authSecurity.test.ts`<br>`src/pages/dev/ScanImportV2LabPage.tsx` |
| G29 | OWNED ELSEWHERE | B `mapper_lineage_current_binding` 20260905150000→20260906003955 (Mapper/Search) | — | — | `docs/qa/GELLATTI_SOL_LEDGER.md`<br>`src/contracts/owner-locked/mapperLineageCurrentBinding.contract.test.ts` |
| G30 | movable | B `behavior_gate_sees_linked_customer_products` 20260907013000→20260906234326 (Mapper/Search (behavior)) | — | — | `docs/qa/GELLATTI_SOL_LEDGER.md` |
| G31 | movable | B `allow_informational_label_snapshots` 20260907003704→20260907090740 (PRO / Processing) | — | — | `src/features/master-label/productionLabelCloseout.migration.test.ts` |
| G32 | movable | A `scanner_durable_version_persistence` 20260913194637→20260913205042 (Scanner) | — | — | `src/features/product-scanner/durableVersionPersistence.migration.test.ts` |
| G33 | BLOCKED | B `partner_code_banned_words` 20260831200100→20260831141738 (WWU/Growth)<br>B `partner_code_slot_limit_dedupe` 20260831200200→20260831143710 (WWU/Growth) | gellatti_partner_code_claim_refusal_v1 | C `20260831200000_partner_code_slots_and_alias_ownership` — gellatti_partner_code_claim_refusal_v1<br>C `20260831200000_partner_code_slots_and_alias_ownership` — enforce_partner_code_slot_limit, gellatti_partner_code_claim_refusal_v1 | `src/billing/domain/migrationGrantSurface.test.ts /^202608312(0\|1\|2\|3)\d{4}_/`<br>`src/billing/domain/partnerCodeSlots.migration.test.ts` |
| G34 | movable | A `partner_application_more_information` 20260831201000→20260831154203 (WWU/Growth)<br>A `partner_application_audit_actor_fix` 20260831201100→20260831155647 (WWU/Growth) | gellatti_submit_partner_application_v1 | — | `src/billing/domain/auditActorTypes.test.ts`<br>`src/billing/domain/financialFunctionPermissions.test.ts`<br>`src/billing/domain/migrationGrantSurface.test.ts /^202608312(0\|1\|2\|3)\d{4}_/`<br>`src/billing/domain/partnerCodeSlots.migration.test.ts`<br>`src/features/partner-application/partnerApplicationStatus.test.ts`<br>`src/features/partner-application/partnerApplicationStatus.test.ts /^202608312\d{5}_/`<br>`src/features/partner-application/partnerApplicationStatus.ts`<br>`src/services/partner.ts` |
| G35 | movable | B `refer_a_friend_pro_bonus` 20260902100000→20260902075705 (WWU/Growth)<br>B `refer_a_friend_functions` 20260902100100→20260902075812 (WWU/Growth) | pro_bonus_consumptions, referral_rewards, user_referral_attributions, user_referral_codes | — | `src/features/referral/referralRewardRules.migration.test.ts`<br>`src/features/referral/referralRewardRules.ts` |
| G36 | movable | B `partner_rate_profiles` 20260831200500→20260831150753 (WWU/Growth)<br>A `partner_rate_profiles_grant_surface` 20260831200600→20260831153241 (WWU/Growth)<br>B `partner_tier_snapshot_writer` 20260831202000→20260831190352 (WWU/Growth)<br>B `partner_tier_snapshot_on_time_guard` 20260831204000→20260831194031 (WWU/Growth) | gellatti_gold_threshold_v1, gellatti_partner_active_referred_count_v1, gellatti_partner_elite_active_v1, gellatti_write_partner_tier_snapshots_v1, partner_rate_profiles | — | `src/billing/domain/financialFunctionPermissions.test.ts`<br>`src/billing/domain/migrationGrantSurface.test.ts`<br>`src/billing/domain/migrationGrantSurface.test.ts /^202608312(0\|1\|2\|3)\d{4}_/`<br>`src/billing/domain/partnerRateProfiles.migration.test.ts`<br>`src/billing/domain/payoutExecution.migration.test.ts`<br>`src/billing/domain/tierSnapshotWriter.migration.test.ts` |

## Not in scope here

- **C (16), D (13), E:** no change without your decision.
- **Nothing in this plan is applied or renamed.** Generic `supabase db push` stays blocked.
- The earlier local batch-A commit (`9dd70092`, not pushed) is superseded by this group plan. It renamed all ten A files at once, ignoring the groups.
