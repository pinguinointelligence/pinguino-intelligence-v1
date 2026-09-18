# GELLATTI RL-05 / RL-20 Mapper Rescue closeout

Date: 2026-09-13

Canonical shared Supabase project: `tunabqqrwabacxjcxxkz`

Application production and `origin/main`: untouched

## Decision

- **Rescued and runtime-usable: 2 of the original 87 `approval_not_ready` identities.** Both are CREAM.
- **Still `approval_not_ready`: 85.** The earlier server-blocked MILK identity also remains blocked, so the total open/non-usable identity count is 86.
- **RL-05: NOT DONE.** Runtime coverage remains incomplete for five physical roles.
- **RL-20: NOT DONE.** The explicit-approval gate itself remains correct, but the required cross-role runtime acceptance cannot pass without an SMP, DEXTROSE and TARA product.
- **RL-36: NOT STARTED.** The Owner gate still requires RL-05 and RL-20 to be DONE first.

## Products rescued

| Role | Market | Exact identity | Result |
|---|---|---|---|
| CREAM | NO | `TINE Kremfløte 37% 3 dl`, GTIN `7038010041914` | `PR-ING-007296`; request `ce4eb611-06a6-4255-ae50-f977ae59cf8f` linked as `DUPLICATE`; active primary route `5d9aa9ea-d421-4be4-b280-f359c5bd43e1`; resolver returns `COUNTRY_PRIMARY_DEFAULT`. |
| CREAM | CH | `Valflora Vollrahm UHT 35% 250 ml`, GTIN `7613269880585` | `PR-ING-007297`; request `7e1c463c-a1cc-4c73-85a6-33158c9d38e5` linked as `DUPLICATE`; active primary route `bd641279-65e4-4ee6-af0c-58a1445021d8`; resolver returns `COUNTRY_PRIMARY_DEFAULT`. |

The existing Scanner/Mapper Rescue authority supplied water/total-solids and passed the strict `ready = true`, Product Accuracy `> 85`, exact-SKU publication and engine-usability gates. TINE uses water `57` and total solids `43`; Valflora uses water `59.5` and total solids `40.5`. The source's per-100-ml basis for Valflora is handled only by the existing frozen `GELLATTI_1ML_1G_NORMALIZATION` rule; no new conversion rule was introduced.

The first TINE route attempt exposed an orchestration omission: Scanner Finalize had created the exact product, but the rescue runner had not called the existing sanctioned `gellatti_admin_catalog_action_v1 / ADD_MARKET` operation before inserting the country assignment. The database correctly rejected the assignment with `country_product_slot_assignment_mismatch`. The runner was corrected to add the route market first and to resume only an exact product already linked by the same `DUPLICATE` request. The retry completed without another product or version.

## SMP candidate deliberately not applied

`V23:SMP:GTIN-06426309006538` remains fail-closed even though the automated preview reports score 90 and `BASE_READY`. The exact retailer page confirms GTIN `6426309006538` and the selected Pronat product, but it does not state water `1.1%`. The rescue trace attributed that value to the page without a visible product declaration, so applying it would violate the Owner's no-fabrication rule.

Two other SMP previews remain below the strict publication threshold:

- `V23:SMP:GTIN-03831040010028` — score 84.8.
- `V23:SMP:GTIN-04008230010901` — score 84.8.

## Post-rescue readiness rerun

The preview-only pipeline was rerun across all remaining 86 open identities:

| Outcome | Count |
|---|---:|
| `STILL_BLOCKED_AFTER_RESCUE` | 74 |
| `BLOCKED_NO_VALID_GTIN_AFTER_EVIDENCE_RESCUE` | 9 |
| Automated ready preview rejected by manual source verification | 1 |
| `PREVIEW_ERROR` | 2 |
| Unexpected errors | 0 |

The two validation errors remain fail-closed:

- MILK `V23:MILK:GTIN-06001299016158`, ZA — `invalid_user_confirmed_product_fields`; source/workbook nutrition contradiction (`sugars 5.3 > carbohydrate 5`). This is also the earlier product whose canonical verification status is `blocked`.
- CREAM `V23:CREAM:GTIN-06001299012082`, ZA — `invalid_user_confirmed_product_fields`; the same nutrition contradiction.

The complete identity-by-identity result, including every request ID, route market, score, readiness state and reason code, is in `docs/country-products/gelato-base-v23/rl05-handoff/mapper-rescue-exact-remaining-blockers-2026-09-13.json`.

## Runtime coverage after rescue

| Role | Logical/runtime coverage | Missing markets |
|---|---:|---|
| MILK | 66 / 75 | BE, DZ, GB, JP, MA, TN, TW, VN, ZA |
| CREAM | 53 / 75 | AR, BR, CA, CN, CO, CY, DK, DO, ES, GR, HR, JP, NZ, PK, PL, PT, SI, TR, TW, US, UY, ZA |
| SMP | 0 / 75 | all 75 markets |
| SUCROSE | 75 / 75 logical global PI | none; no redundant physical PR routes by design |
| DEXTROSE | 0 / 75 | all 75 markets |
| TARA | 0 / 75 | all 75 markets |

- Active approved markets: 75 / 75.
- Physical usable primary routes for the five commercial roles: 119; unusable active routes: 0.
- Total logical coverage: 194 / 450 (`119` physical commercial resolutions + `75` global SUCROSE decisions).

### Open evidence-rescue identities by role

| Role | Original `approval_not_ready` still open | Earlier blocked | Markets represented by these identities |
|---|---:|---:|---:|
| MILK | 6 | 1 | 9 |
| CREAM | 21 | 0 | 21 |
| SMP | 43 | 0 | 50 |
| DEXTROSE | 14 | 0 | 69 |
| TARA | 1 | 0 | 74 |

### Missing markets without an open rescue request

These are existing reviewed v23 plan holds, not rescued requests:

- CREAM: PK — `WORKBOOK_STATUS:KANDYDAT_WARUNKOWY`.
- SMP: AT, CH, LT, SK, ZA — `WORKBOOK_STATUS:WYMAGA_GTIN`.
- SMP: BD, BE, CR, DZ, EG, FR, GH, JP, KE, LK, MA, MX, NG, OM, PA, PK, TH, TN, US, UY — reviewed cross-market brand and/or nutrition conflicts.
- DEXTROSE: BE, FR, NL, OM, PL, QA — `WORKBOOK_STATUS:WYMAGA_GTIN`.
- TARA: US — `PACKAGE_NOT_STATED` and `CARBOHYDRATE_CONVENTION:US_TOTAL_CARBOHYDRATE_NDC`.

## Safety controls

- Exact active product count for each rescued GTIN: 1; no duplicate PR identity was created.
- New canonical PI since the rescue began: 0.
- `mapper_basement`: 2541 rows, 2541 active, latest update `2026-09-11T10:10:47.526251+00:00`; no rescue-time Mapper write.
- Current read-only Mapper row hash: `45b7d7ca974bd3dee63cda70777a563a`.
- FINAL-2541 migration file and Mapper dataset were not modified.
- RL-20 private gate and resolver projection contain explicit `approved_for_base` / `approved_for_engines` authority and no obsolete `verification_status` prefix predicate.
- All 119 active v23 physical routes pass `private.country_product_slot_assignment_is_usable_v1`.
- The blocked ZA MILK product still fails the exact picker-profile check.
- TINE and Valflora both resolve only through their explicit country primary route; no silent fallback was introduced.

## Acceptance decision

The ten-market, six-role RL-05/RL-20 acceptance matrix was not rerun because the evidence gate for running it was not met: SMP, DEXTROSE and TARA remain at 0 / 75, and representative markets including DE, US, CA, AU, NZ, JP, AE, ZA and BR cannot resolve all required roles. The two rescued CREAM routes received exact live resolver postconditions instead.

No further in-scope rescue candidate has exact evidence sufficient for an authorized write. Completing RL-05/RL-20 requires new exact product authority for the remaining cases or a separately authorized decision on the reviewed plan holds; it does not justify changing Mapper, FINAL-2541 or creating a new canonical PI.

## Durable execution evidence

- Initial 88-identity preview: `docs/country-products/gelato-base-v23/rl05-handoff/mapper-rescue-preview-2026-09-13.json`.
- TINE apply/resume: `docs/country-products/gelato-base-v23/rl05-handoff/mapper-rescue-apply-tine-2026-09-13.json`.
- Valflora apply: `docs/country-products/gelato-base-v23/rl05-handoff/mapper-rescue-apply-valflora-2026-09-13.json`.
- Valflora idempotent rerun: `docs/country-products/gelato-base-v23/rl05-handoff/mapper-rescue-apply-valflora-idempotent-2026-09-13.json`.
- Post-apply 86-identity readiness rerun: `docs/country-products/gelato-base-v23/rl05-handoff/mapper-rescue-post-apply-preview-2026-09-13.json`.
- Pronat assessment-specific fail-closed rerun: `docs/country-products/gelato-base-v23/rl05-handoff/mapper-rescue-pronat-fail-closed-2026-09-13.json`.
- Exact remaining blocker ledger: `docs/country-products/gelato-base-v23/rl05-handoff/mapper-rescue-exact-remaining-blockers-2026-09-13.json`.

## Focused verification executed

- `node --check scripts/countryProducts/rescueGelatoBaseV23.mjs` — PASS.
- `node --test scripts/countryProducts/lib/mapperRescueRun.test.mjs` — 5 / 5 PASS.
- `node ./node_modules/vitest/vitest.mjs run src/data/country-products/gelatoBaseApplyReconciliation.test.ts src/features/global-catalog/productCanonicalSlotReview.migration.test.ts src/features/global-catalog/countryProductResolution.migration.test.ts src/features/product-intelligence/productBehaviorClassification.migration.test.ts` — 4 files / 43 tests PASS.
- Live SQL postconditions for NO and CH — exact route, market, usability and resolver source PASS.
- Live RL-20/Mapper/dedup/blocked-product controls — PASS.
- Full local `npm test` — not run, per Owner's focused-test instruction.
