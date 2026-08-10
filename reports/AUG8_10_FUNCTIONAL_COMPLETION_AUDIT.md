# PINGÜINO Intelligence — Aug 8–10 functional completion audit

Prepared: 2026-08-10  
Scope: internally achievable missing promises from the Aug 8–10 cycle  
Target: staging only — `https://staging.pinguinoai.com`  
Production branch, production Vercel, production Supabase and customer data: **not touched**

## Executive verdict

All functionality that can be completed from the accepted repository science and data is implemented locally, covered by regression tests and awaiting the mandatory independent review and served-staging verification. No Base Engine chemistry constants, native target bands or the canonical Mapper dataset were changed.

The one unavailable approved input is the Owner workbook `mapper_basement_2088_process_enriched_2026-08-08*.xlsx`, sheet `07_Process_Metadata_2026-08-08`. An exhaustive search of the repository, all worktrees, Codex attachments, Desktop, Downloads, Documents and OneDrive returned no copy. Its 2,088 canonical-ID decisions cannot legally or scientifically be reconstructed from the five aggregate counts. The separate schema, deterministic adapter, fail-closed classifier and UI are complete; until the exact workbook is supplied and imported, runtime process decisions correctly remain `UNKNOWN`.

## A. Complete request matrix

The before-state authority and evidence are recorded in `reports/AUG8_10_REQUIREMENTS_MATRIX.md`. This is the final-state matrix.

| Requested capability                | Done                                                        | Not done / why                                                                  | Proof                                                                                                                                          | Staging path                             | Screenshot            |
| ----------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------- |
| Canonical current draft             | Yes                                                         | —                                                                               | Direction, goals, exclusions and constraints use the existing draft/revision/fingerprint path                                                  | `/pro/recipe`                            | See served QA section |
| Preview → verified Apply → Undo     | Yes                                                         | —                                                                               | stale, forged, constraint, duplicate, Main, native safety and batch gates remain trustlessly re-derived                                        | `/pro/recipe`                            | See served QA section |
| Sweetness −1/0/+1                   | Operational only in the verified cells listed below         | Some profiles/temperatures remain blocked before Preview                        | POD shadow zones remain inside native safe ranges; no cell is labelled working from band existence alone                                      | `/pro/recipe`                            | See served QA section |
| Firmness/softness −1/0/+1           | Operational for Standard Gelato at −11/−12/−13°C            | Other profiles remain blocked pending profile-specific calibration              | accepted Standard Gelato NPAC firm/clean/soft matrix; native NPAC/ice gates stay superior                                                       | `/pro/recipe`, `/pro/monitor`            | See served QA section |
| Creaminess Direction                | No fabricated movement                                      | New sensory science required                                                    | explicit per-axis `WYMAGA KALIBRACJI`; fat is not relabelled as creaminess                                                                     | `/pro/recipe`                            | See served QA section |
| Flavour intensity Direction         | No fabricated movement                                      | ingredient/family potency data required                                         | explicit per-axis blocker; Main mass heuristic is not presented as calibrated intensity                                                        | `/pro/recipe`                            | See served QA section |
| Direction persistence and staleness | Yes                                                         | —                                                                               | save/reopen/version payload + revision + canonical working fingerprint tests                                                                   | `/pro/recipe`, `/pro/versions`           | See served QA section |
| One customer-visible fit score      | Yes                                                         | —                                                                               | one feature-layer assessment combines native safety, supported Direction residuals and Protein target; technical safety is retained separately | Profile / Monitor / Production / top bar | See served QA section |
| Process companion schema            | Yes                                                         | Dataset rows not imported because exact approved workbook is absent             | migration `0039_mapper_process_metadata.sql`, read-only RLS, version/hash manifest                                                             | contextual Process Guide                 | See served QA section |
| Process workbook import             | No                                                          | **EXTERNAL:** approved workbook absent; recreating 2,088 decisions is forbidden | exhaustive filesystem search returned no match                                                                                                 | staging backend                          | N/A                   |
| Recipe process classifier           | Yes                                                         | Runtime remains UNKNOWN until companion rows exist                              | cold/function/safety/both/unknown tests; all ingredient IDs aggregated; UNKNOWN fail-closed                                                    | contextual Process Guide                 | See served QA section |
| Explicit process-path confirmation  | Yes                                                         | decisive classifications require imported evidence                              | cold/heat confirmation, safety cannot be overridden, UNKNOWN only acknowledged                                                                 | contextual Process Guide                 | See served QA section |
| Heat-sensitive late-add guidance    | Yes when metadata exists                                    | source rows unavailable                                                         | metadata-backed rendering test; no invented time/temperature                                                                                   | contextual Process Guide                 | See served QA section |
| Contextual “Dlaczego?”              | Yes for process, Direction, locks and substitution outcomes | —                                                                               | human explanations derive from deterministic decision/action data; normal view exposes no equations                                            | Preview / Process Guide                  | See served QA section |
| Recipe substitution                 | Yes                                                         | Production substitution remains intentionally deferred                          | full server-paged verified catalogue fetch → safety-ranked top 12 same-role/Vegan/allergen-compatible candidates → Preview → Apply; explicit no-candidate | ingredient row                           | See served QA section |
| Main substitution                   | Yes with explicit consent                                   | —                                                                               | session-only consent bound to base fingerprint and from/to canonical IDs                                                                       | ingredient row                           | See served QA section |
| Exact gram lock                     | Yes                                                         | —                                                                               | hard equality before Preview and again at Apply                                                                                                | ingredient row                           | See served QA section |
| Percent lock                        | Yes                                                         | —                                                                               | exact share of final target batch; grams track batch; mutually exclusive with gram/range locks                                                 | ingredient row                           | See served QA section |
| Range                               | Yes                                                         | —                                                                               | min/max verified at proposal and Apply                                                                                                         | ingredient row                           | See served QA section |
| Required                            | Yes                                                         | —                                                                               | Engine-native `required`; forged removal/identity/gram/lock mutation blocked                                                                   | ingredient row                           | See served QA section |
| Unavailable                         | Yes                                                         | —                                                                               | row remains as an explicit replacement tombstone, canonical exclusion is stored, automatic reintroduction is blocked                            | ingredient row                           | See served QA section |
| Main/Multi-Main                     | Yes                                                         | —                                                                               | positive identity, stable IDs and exact 1:1, 2:1, 1:1:1 contracts retained                                                                     | `/pro/recipe`                            | See served QA section |
| Protein 21→22 honesty               | Yes                                                         | —                                                                               | exact 20/21, monotonic best-safe frontier for 22, Apply withheld below target                                                                  | Protein profile                          | See evidence below    |
| Whisky reformulation                | Yes                                                         | —                                                                               | real Mapper whisky, exact lock, normal rebalance, Preview/Apply and first blocked boundary                                                     | Gelato profile                           | See evidence below    |
| ECO numeric flavour protection      | Yes                                                         | —                                                                               | expensive Pistachio proof; uncalibrated floor freezes Main rather than inventing a minimum                                                     | `/pro/recipe`                            | See evidence below    |
| Vegan/Soy 2088                      | Preserved                                                   | —                                                                               | full regression suite; only Engine-approved canonical candidates; soya sauce exclusions unchanged                                              | Vegan profile                            | See automated tests   |
| Mapper 2088                         | Preserved exactly                                           | —                                                                               | 2,088 rows, 62 columns, expected SHA-256, no diff                                                                                              | all ingredient flows                     | N/A                   |
| Menu/navigation                     | Yes                                                         | —                                                                               | obsolete Production readiness removed; working percent/substitution/Direction not pink; one canonical menu                                     | hamburger                                | See served QA section |
| Lost & Legendary gating             | Preserved                                                   | —                                                                               | public hides unpublished; owner review remains pink; AUTHENTIC/ADAPTABLE distinction unchanged                                                 | `/recipes`                               | See automated tests   |
| Production/Batch Rescue             | Preserved exactly                                           | —                                                                               | required 130→180 physical-amount regression remains green                                                                                      | `/pro/production`                        | See served QA section |
| Master Label safety                 | Preserved and strengthened                                  | legal/regulatory/allergen/shelf-life blockers are legitimate                    | frozen actual source; system print also requires a VERIFIED regulatory market profile                                                          | `/production?tab=labels`                 | See served QA section |
| New Home redesign                   | Intentionally not started                                   | Out of scope by Owner instruction                                               | no Home redesign files introduced                                                                                                              | `/`                                      | N/A                   |

## B. Fixes made in this completion cycle

| Bug / missing promise                                    | Root cause                                                                                | Main files                                                                                                                    | Regression evidence                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Direction controls changed labels but not formulation    | local/profile-only state did not enter canonical `RecipeInput` or solver target injection | `recipeDirectionTargets.ts`, `recipeDirectionAssessment.ts`, recipe store/profile/store/build-input/constraint pipeline files | 15-cell truth matrix: verified cells execute; unsupported cells fail closed before solving |
| Native-safe preference miss still displayed 10/10        | technical safety score was the only presentation score                                    | `recipeDirectionAssessment.ts`, `useStudioResult.ts`, Profile/Monitor consumers                                               | shared-score tests: supported miss <10; native unsafe blocked; exact target 10     |
| Percent lock was presentation-only                       | no percent constraint contract or trustless Apply verification                            | `constraintTypes.ts`, `constraintSet.ts`, constraint store/pipeline, row controls                                             | percent batch resize, mutual exclusion, Apply forgery and persistence tests        |
| Recipe replacement opened an empty pink picker           | row UI had no catalogue, candidate or Preview connection                                  | `recipeSubstitution.ts`, `IngredientBuilder.tsx`, `IngredientRow.tsx`, pipeline/store                                         | ordinary/Vegan/Protein/Main/Multi-Main/no-candidate and Apply/Undo tests           |
| Required/unavailable controls were not formulation truth | UI metadata did not establish Engine lock/exclusion                                       | ingredient builder/row, recipe store, Apply door                                                                              | forged required mutation blocked; unavailable canonical exclusion retained         |
| Process evidence could not reach runtime                 | classifier existed, but no canonical companion adapter/service/schema                     | `processMetadata.ts`, `services/processMetadata.ts`, `ContextualEducationView.tsx`, migration 0039                            | all five states, incomplete cold evidence, provisional evidence and late-add tests |
| Protein 22 could return a worse “best” result            | frontier search did not pin the already-achievable lower bound                            | `proteinTarget.ts`, Protein regression suite                                                                                  | exact values for 20/21/22 across −11/−12/−13                                       |
| Whisky QA was static, not a user reformulation           | no real exact-lock → solver → Preview/Apply frontier fixture                              | `whiskyReformulationBoundary.test.ts`                                                                                         | 20–100 g sweep, first infeasible 39 g                                              |
| ECO proof was qualitative                                | no expensive Main numerical adversarial fixture                                           | `flavourFloor.test.ts`                                                                                                        | €12.85 baseline; hypothetical €8.90 reduction rejected                             |
| Obsolete pink labels                                     | implementation status lagged integrated production/locks/substitution                     | `appNav.ts`, profile/production/ingredient copy/components                                                                    | design/navigation/readiness component tests                                        |

The final integrated commit is recorded in section Q after commit/deploy.

## C. Direction matrix

`WORKING` means the selected target is persisted, fingerprints the draft, changes only intent before Preview, enters the normal deterministic solver through an immutable shadow target, and still must pass the original native Engine hard gates.

| Product profile  | Temp. | Sweetness −1 / 0 / +1       | Softness firm / clean / soft | Creaminess                                     | Flavour intensity                                          |
| ---------------- | ----: | --------------------------- | ---------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| Standard Gelato  | −11°C | WORKING / WORKING / WORKING | WORKING / WORKING / WORKING  | BLOCKED — no sensory calibration               | BLOCKED — no potency registry                              |
| Standard Gelato  | −12°C | WORKING / WORKING / WORKING | WORKING / WORKING / WORKING  | BLOCKED — no sensory calibration               | BLOCKED — no potency registry                              |
| Standard Gelato  | −13°C | WORKING / WORKING / WORKING | WORKING / WORKING / WORKING  | BLOCKED — no sensory calibration               | BLOCKED — no potency registry                              |
| Sorbet           | −11°C | WORKING / WORKING / WORKING | BLOCKED — no verified profile calibration | BLOCKED — fat is not a sorbet creaminess model | BLOCKED — no fruit potency registry                        |
| Sorbet           | −12°C | BLOCKED — safe Preview path not verified | BLOCKED — no verified profile calibration | BLOCKED — fat is not a sorbet creaminess model | BLOCKED — no fruit potency registry                        |
| Sorbet           | −13°C | BLOCKED — safe Preview path not verified | BLOCKED — no verified profile calibration | BLOCKED — fat is not a sorbet creaminess model | BLOCKED — no fruit potency registry                        |
| Vegan Gelato     | −11°C | BLOCKED — safe Preview path not verified | BLOCKED — no verified profile calibration | BLOCKED — no validated plant creaminess model  | BLOCKED — no potency registry                              |
| Vegan Gelato     | −12°C | BLOCKED — safe Preview path not verified | BLOCKED — no verified profile calibration | BLOCKED — no validated plant creaminess model  | BLOCKED — no potency registry                              |
| Vegan Gelato     | −13°C | BLOCKED — safe Preview path not verified | BLOCKED — no verified profile calibration | BLOCKED — no validated plant creaminess model  | BLOCKED — no potency registry                              |
| Chocolate Gelato | −11°C | WORKING / WORKING / WORKING | BLOCKED — no verified profile calibration | BLOCKED — fat proxy is insufficient            | BLOCKED — no cocoa potency registry                        |
| Chocolate Gelato | −12°C | WORKING / WORKING / WORKING | BLOCKED — no verified profile calibration | BLOCKED — fat proxy is insufficient            | BLOCKED — no cocoa potency registry                        |
| Chocolate Gelato | −13°C | BLOCKED — safe Preview path not verified | BLOCKED — no verified profile calibration | BLOCKED — fat proxy is insufficient            | BLOCKED — no cocoa potency registry                        |
| Protein Gelato   | −11°C | BLOCKED — no approved POD regulator cell | BLOCKED — no verified profile calibration | BLOCKED — no protein sensory creaminess model  | BLOCKED — Protein is a product target, not flavour potency |
| Protein Gelato   | −12°C | BLOCKED — no approved POD regulator cell | BLOCKED — no verified profile calibration | BLOCKED — no protein sensory creaminess model  | BLOCKED — Protein is a product target, not flavour potency |
| Protein Gelato   | −13°C | BLOCKED — no approved POD regulator cell | BLOCKED — no verified profile calibration | BLOCKED — no protein sensory creaminess model  | BLOCKED — Protein is a product target, not flavour potency |

Working Sweetness zones are lower/middle/upper sub-zones of the accepted POD range. Working Softness uses the accepted Standard Gelato category/temperature NPAC firm side, clean center and soft side. A native band or display range alone is never treated as proof of operational Preview/Apply. The original Engine bands remain the Apply safety authority.

## D. Process classifier matrix

| Companion fixture                                               | Recipe aggregation | User decision                                           | Override rule                               | Result |
| --------------------------------------------------------------- | ------------------ | ------------------------------------------------------- | ------------------------------------------- | ------ |
| every exact ingredient verified `COLD_PROCESS_OK`               | cold               | “Ta receptura może być przygotowana na zimno.”          | explicit cold/heat path confirmation        | PASS   |
| at least one `HEAT_REQUIRED_FOR_FUNCTION`, no safety heat       | heat/function      | technological heat explanation + triggering ingredients | user confirms heated path                   | PASS   |
| at least one `HEAT_REQUIRED_FOR_SAFETY`, no extra function heat | heat/safety        | safety heat explanation                                 | cold cannot override                        | PASS   |
| safety + function, or one `BOTH`                                | heat/both          | both reasons remain visible                             | cold cannot override                        | PASS   |
| any unresolved ingredient without a stronger heat decision      | unknown            | insufficient-data explanation                           | never defaults to cold; acknowledgment only | PASS   |

The tests use exact canonical-ID companion rows because the approved Owner workbook is absent. A verified heat-sensitive Whisky fixture surfaces only its supplied “add after cooling” guidance and proves that no temperature or duration is invented. On staging, before the approved rows are imported, the expected honest runtime result is `UNKNOWN`.

## E. Recipe substitution matrix

| Case                               | Eligibility                                                          | Before Apply                                 | Apply gate                                      | Result                |
| ---------------------------------- | -------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- | --------------------- |
| normal ingredient                  | verified Mapper-backed, same functional role, no canonical duplicate | recipe unchanged; candidate reason + Preview | full native/profile/constraints validation      | WORKING               |
| Vegan                              | `VEGAN_VERIFIED` required                                            | unchanged                                    | forged non-vegan candidate rejected             | WORKING               |
| Protein                            | role preserved; protein contributor never becomes flavour Main       | unchanged                                    | Protein target and hard gates rechecked         | WORKING               |
| Main                               | explicit checkbox/consent required                                   | unchanged                                    | session-only fingerprint + exact from/to IDs    | WORKING               |
| Multi-Main                         | identity set and ratios preserved                                    | unchanged                                    | Main contract re-derived at Apply               | WORKING               |
| no safe candidate                  | no silent fallback                                                   | explicit “Brak bezpiecznego zamiennika”      | no Preview/Apply                                | WORKING               |
| Production after physical addition | not offered                                                          | —                                            | deliberately blocked by existing physical model | LEGITIMATELY DEFERRED |

## F. Lock and gate matrix

| State                    | Preview                                    | Apply                                             | Undo                                         | Batch                              | Save/reopen/version         |
| ------------------------ | ------------------------------------------ | ------------------------------------------------- | -------------------------------------------- | ---------------------------------- | --------------------------- |
| exact grams              | byte-exact                                 | re-derived hard equality                          | exact restore                                | grams fixed                        | preserved                   |
| percent                  | final-share constraint                     | recomputed within 1e−9 percentage-point tolerance | exact restore                                | grams track target batch           | preserved                   |
| range                    | candidate inside min/max                   | re-derived min/max                                | exact restore                                | valid only inside range            | preserved                   |
| Main                     | positive stable identity/ratio             | Main set re-derived                               | exact restore                                | group contract retained            | preserved                   |
| required                 | line/identity/grams retained               | forged removal/mutation rejected                  | exact restore                                | retained                           | preserved as Engine lock    |
| unavailable              | canonical exclusion prevents automatic use | reintroduction rejected                           | previous draft restored                      | excluded                           | exclusion persisted         |
| already added / physical | never reduced in actual context            | physical floor rechecked                          | only unconfirmed instructions are reversible | physical truth stays authoritative | frozen actual on completion |

Gram and percent locks are mutually exclusive. Every state is checked before Preview and again at Apply; client-supplied proof is never trusted.

## G. Protein frontier

Strawberry/berry Main stays unchanged and the normal native-safe formulation path is used.

| Temp. | Request | Best found actual | Native safe              | Apply                       |
| ----: | ------: | ----------------: | ------------------------ | --------------------------- |
| −11°C |     20% |        20.000000% | Yes                      | allowed                     |
| −11°C |     21% |        21.000000% | Yes                      | allowed                     |
| −11°C |     22% |    21.2071022727% | best-safe candidate only | blocked: target not reached |
| −12°C |     20% |        20.000000% | Yes                      | allowed                     |
| −12°C |     21% |        21.000000% | Yes                      | allowed                     |
| −12°C |     22% |    21.1493367899% | best-safe candidate only | blocked: target not reached |
| −13°C |     20% |        20.000000% | Yes                      | allowed                     |
| −13°C |     21% |        21.000000% | Yes                      | allowed                     |
| −13°C |     22% |    21.1477921773% | best-safe candidate only | blocked: target not reached |

This proves monotonicity: asking for 22% never returns the former ~17–18% result below an already achievable 21%. A sub-target candidate never pretends to be applicable.

## H. Whisky reformulation boundary

Fixture: verified Mapper Whisky `PI-ING-000038`, standard Gelato at −11°C, 1,000 g batch, exact Whisky gram lock, adjustable base/sugars, normal Preview/Apply.

| Requested/final Whisky g |               POD |              NPAC |             Ice % |  Alcohol % | Result                                        |
| -----------------------: | ----------------: | ----------------: | ----------------: | ---------: | --------------------------------------------- |
|                       20 |     13.1498393431 |     39.1755720645 |     47.9813405986 |     0.6320 | applied, zero native violations               |
|                       21 |     13.0331582062 |     39.2994999799 |     47.8505277990 |     0.6636 | applied                                       |
|                       22 |     12.9181598198 |     39.4266848516 |     47.7162771011 |     0.6952 | applied                                       |
|                       25 |     12.5829084570 |     39.8271218739 |     47.2935935776 |     0.7900 | applied                                       |
|                       30 |     12.0546621388 |     40.5537558478 |     46.5265910496 |     0.9480 | applied                                       |
|                       35 |     13.5799754901 |     41.4730196030 |     45.5562570857 |     1.1060 | applied                                       |
|                       36 |     12.5157159383 |     39.9316853376 |     47.1832210326 |     1.1376 | applied                                       |
|                       37 |     12.4248396431 |     40.0690860466 |     47.0381869508 |     1.1692 | applied                                       |
|                       38 |     12.2727177913 |     40.1297426577 |     46.9741605280 |     1.2008 | applied                                       |
|                   **39** | **11.0343271977** | **41.9959303383** | **45.0042957540** | **1.2324** | **first infeasible: POD low; Apply blocked**  |
|                       40 |     11.6595070914 |     41.9847670703 |     45.0160792035 |     1.2640 | blocked: POD low                              |
|                       60 |      8.2400127884 |     41.9921931916 |     45.0082405200 |     1.8960 | blocked: POD/solids low                       |
|                       80 |      5.4749395856 |     41.9835148339 |     45.0174010086 |     2.5280 | blocked: alcohol/POD/solids/water/fat/protein |
|                      100 |      3.3822834493 |     41.9966497809 |     45.0035363424 |     3.1600 | blocked: alcohol/POD/solids/water/protein     |

No tested point above the first infeasible boundary became applicable. Whisky is never deleted and its exact lock is respected.

## I. ECO numerical flavour proof

| State                          |  Pistachio Main |     Cheap base |       Cost |
| ------------------------------ | --------------: | -------------: | ---------: |
| Owner baseline                 | 150 g at €80/kg | 850 g at €1/kg |     €12.85 |
| Hypothetical cheaper candidate |           100 g |          900 g |      €8.90 |
| Accepted ECO                   |       **150 g** |          850 g | **€12.85** |

The €3.95 saving is rejected with `unknown_floor_reduced`: no calibrated Pistachio potency floor exists, so ECO freezes the flavour-defining Main at the Owner baseline instead of inventing a minimum. Existing sweeps cover cheap, expensive, reversed, missing price, invalid/mismatched currency and reset override. OPTIMAL remains price-independent.

## J. Vegan / Soy

- Mapper 2088 remains the only canonical ingredient reference source.
- Vegan candidate selection requires explicit `VEGAN_VERIFIED`; unknown or animal-origin candidates fail closed.
- Soy candidates remain available only when Engine-approved.
- Soya sauce remains excluded.
- Neutral, fruit, Banana, Strawberry, Pistachio/nut, cocoa, Soy, plant-protein, private ingredient, Multi-Main and forged non-vegan Apply are covered by the unchanged Vegan and identity regression suites.

## K. Multi-Main

| Fixture | Preserved contract                                |
| ------- | ------------------------------------------------- |
| 1:1     | both Main lines remain positive, stable and equal |
| 2:1     | stable canonical IDs and exact 2:1 ratio          |
| 1:1:1   | three positive Main lines; no singleton fallback  |

The contracts are rechecked across Direction, substitution, exact/percent/range constraints, unavailable state, OPTIMAL/ECO, batch resize, Preview/Apply/forgery/Undo and save/version flows. Automatic substitution cannot silently alter flavour identity.

## L. Production regression

The accepted physical-reality fixture remains unchanged:

- Sucrose planned `130 g`, physical actual `180 g`.
- Cream top-up `+227.75342952471976 g`.
- Final Cream `357.75342952471976 g`.
- Final batch `1277.7534295247196 g`.
- Technical score `10/10`.
- `6` lines, `6` canonical IDs, `0` duplicates.
- Physical material already in the vessel remains authoritative.
- Master Label continues to consume the frozen actual snapshot; allergen, shelf-life, regulatory and print blockers were not loosened.

## M. Menu and pink-badge audit

Removed/updated because the function is now real:

- global Direction `W PRZYGOTOWANIU` → only the exact verified Sweetness/Softness cells show operational state; the header is derived from the active profile;
- `Znajdź zamiennik · W PRZYGOTOWANIU` → real recipe substitution;
- percent-lock unfinished marker → real charcoal active lock;
- Production navigation readiness warning → functional Production route;
- OPTIMAL/ECO implementation warning → truthful normal strategy note.

Still pink, with exact legitimate reason:

- Creaminess — no accepted deterministic sensory calibration;
- flavour intensity — no canonical ingredient/family potency registry;
- Production mid-run substitution/process/toppings — explicitly deferred physical-workflow capability;
- standalone Label publishing/print — legal market profiles, canonical allergen completeness and shelf-life evidence are incomplete;
- Lost & Legendary owner-review candidates — publication gate intentionally requires research/test verification;
- addition process role — only partially connected and therefore does not pretend to execute;
- Sorbet/Vegan profile-specific scientific readiness markers that predate this scope remain truthful where their underlying validation is incomplete.

The frozen machine names remain exactly: `−11°C`, `−12°C`, `−13°C`, `Świeże`, `Ninja Gelato`, `Ninja Swirl`. `Ninja 2` was not introduced.

## N. Served mobile QA

The final served staging bundle was exercised in the in-app browser. The compact
recipe editor, modal cockpit, Production stepper/rescue and Label history remain
usable at `390×844`; earlier `360×800` and `430×932` sweeps had no horizontal
overflow. Console errors: `0`.

| Viewport | scrollWidth = clientWidth | Primary controls | Modal/Preview | Screenshot |
| -------- | ------------------------- | ---------------- | ------------- | ---------- |
| 360×800  | yes                       | visible          | usable        | `02-guest-landing-mobile.png`, `08-global-menu-mobile.png` |
| 390×844  | yes                       | visible          | usable        | `26-pro-mobile-final.png`, `27-production-mobile-final.png`, `28-labels-mobile-final.png` |
| 430×932  | yes                       | visible          | usable        | earlier served sweep retained in browser QA log |

## O. Automated tests

Completed local gates before independent review:

- `npm run typecheck` — PASS.
- `npm run lint` — PASS, 0 errors; two unchanged `react-refresh/only-export-components` warnings in `src/app/router.tsx` and `src/features/pro-core/RecipeVersionsSection.tsx`.
- `npm test` — PASS, **441 files / 5,798 tests** after the served-QA remediation.
- `npm run build` — PASS, 1,075 transformed modules; existing chunk-size warning only.
- `npm run recipes:validate` — PASS, source workbook hash matched; 2,500/2,500 imported ranks; 80/80 mapped images; zero duplicate hashes.
- `npm audit` — PASS, **0 vulnerabilities**.
- `git diff --check` — PASS.
- broad completion-focused run — PASS, **26 files / 251 tests** (latest trust-boundary and domain sweep; earlier broader completion runs also passed).
- direction/score focused run — PASS, **5 files / 76 tests**.
- required/Main/Multi-Main focused run — PASS, **4 files / 67 tests**.
- Protein + real Whisky evidence run — PASS, **2 files / 23 tests**.

The exact final commands and post-review rerun are recorded in the completion ledger below.

## P. Independent review

The mandatory independent pass against integration checkpoint `4e31006` returned
`BLOCK` with two legitimate trust/safety findings: Verified Apply could accept a
forged mutation of an already-added physical line, and Master Label system print
did not require a `VERIFIED` regulatory profile. It also identified presentation
accuracy issues in legacy redirects, the Direction header and this report.

The remediation now:

- rejects mutations of physical `actual_grams`, `planned_grams`, native lock,
  canonical identity or composition before Engine evaluation;
- rejects non-null actual mass on newly proposed lines;
- requires a `VERIFIED` market profile before system print;
- preserves recipe/session/query/hash state in legacy redirects;
- derives the Direction header from the exact operational axes; and
- describes the server-paged substitution fetch and top-12 safety-ranked UI
  accurately.

The second pass against `73e243b` found one remaining promotion bypass: an
ordinary unlocked line could still acquire a forged `already_added`, `required`
or `main` lock. It also found that `/studio` preserved search parameters but not
the URL hash. The final correction makes every existing line's lock immutable
at Apply, requires solver-added lines to start unlocked and without actual mass,
adds all three promotion regressions, and preserves query + hash for every
legacy entry including `/studio`, `/classic`, `/demo` and `/customer-v1`.

The final independent pass against `8652fa3` returned `DEPLOY`: **7 files / 92
tests PASS**, clean tree, and independent runtime probes confirmed all former
P0/P1/P2 closures. Staging was pushed and served QA then found one additional
presentation-state seam: after a valid Direction Apply, the bottom bar omitted
`Cofnij` because its locally reconstructed input did not include Direction and
other canonical goal fields. The Apply and store Undo were correct; only the UI
availability fingerprint was incomplete.

The action bar now reconstructs every `RecipeInputState` material field used by
the canonical draft, including Direction, formulation strategy, Protein target,
machine-capacity provenance and exclusions. A new Direction Apply → Undo
availability regression is green. Final focused gates are **3 files / 49 tests
PASS** and the full gate is **441 files / 5,798 tests PASS**. Exact-commit review
of `ec693282` returned `DEPLOY`: canonical inputs matched, Apply exposed Undo,
Undo restored the formulation byte-for-byte while retaining Direction, and a
later gram edit correctly invalidated Undo.

## Q. Deployment

| Item                    | Final evidence                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Staging URL             | `https://staging.pinguinoai.com`                                                                             |
| Integrated commit       | `ec693282bd4fe6cc68a0084deb3671a3d89cf689`                                                                  |
| Vercel deployment ID    | `AXF2mfxBVJrrzJrmjXEbJN1r1f1L`                                                                              |
| Served JS bundle        | `assets/index-BgC8XTBZ.js` · SHA-256 `5EEBB5E4EC0E575647C65EDFB905798FD4A4ACFE9A1648452319F9C8AFCD4DC1`        |
| Served commit/SHA proof | bundle contains full commit SHA plus final trust, Production and Label markers                               |
| Backend                 | staging `tunabqqrwabacxjcxxkz`; migration `20260810125404_mapper_process_metadata.sql` applied; dry-run clean |
| Mapper                  | 2,088 rows, 62 columns, SHA-256 `B13F5DB4AFFD9C3BE5CCBE59B40920053197A3697A3FA1BD4A859406E8BAED38`; no diff  |
| Process Metadata        | schema/version manifest prepared; approved workbook/hash unavailable, therefore no rows fabricated or seeded |

## R. Remaining blockers

Only the following require authority or evidence outside this implementation:

1. **EXTERNAL DATA** — provide the exact approved `mapper_basement_2088_process_enriched_2026-08-08*.xlsx`, sheet `07_Process_Metadata_2026-08-08`, so its hash, expected 636/56/7/0/1389 counts and 2,088 canonical IDs can be verified and transactionally imported into staging.
2. **NEW SCIENCE / OWNER CALIBRATION** — sensory Creaminess model; the existing fat percentage is not a valid substitute.
3. **NEW DATA / OWNER CALIBRATION** — ingredient/family-specific perceived flavour-intensity potency.
4. **LEGAL / REGULATORY / DATA** — fully verified market-specific Master Label renderers, canonical allergen data, shelf-life basis and controlled print artifact pipeline.
5. **FUTURE ARCHITECTURE** — Production substitutions after physical additions, full server-side proprietary-IP migration, global rate limiting and the separately planned Home redesign.

No unfinished internally achievable item is relabelled as an external blocker.

## Completion ledger

1. **Requested scope** — reconstruct and complete internally achievable Aug 8–10 promises, preserve accepted flows, independently review, deploy only staging and perform served QA.
2. **Completed work** — canonical working Direction cells and score with unsupported cells fail-closed; percent lock; recipe substitution; required/unavailable truth; process companion/classifier/confirmation; Protein frontier; Whisky boundary; ECO numeric proof; obsolete readiness cleanup; all earlier Production/Mapper/Vegan/Lost & Legendary behavior preserved.
3. **Files changed** — final `git diff --stat` is recorded before commit; changes are confined to product-layer types/orchestration/UI/tests, services, migration and reports. Base Engine formulas/config and Mapper CSV are unchanged.
4. **Tests added or changed** — Direction targets/assessment, substitution flow, process metadata/classifier, percent/required/unavailable constraints, Protein frontier, Whisky boundary, ECO numeric proof and UI/readiness regressions.
5. **Exact commands executed** — `npm run typecheck`; `npm run lint`; `npm test`; `npm run build`; `npm run recipes:validate`; `npm audit`; `git diff --check`; focused `vitest run` commands for the domains above; Mapper hash/shape/diff checks.
6. **Test results** — final post-served-QA result: 5,798/5,798 full tests pass, typecheck/build pass, lint has zero errors and two unchanged warnings, audit has zero vulnerabilities. Served results follow in the staging release report.
7. **Previously accepted flows retested** — canonical current draft; Preview/Apply/Undo; exact/range/Main/Multi-Main; Vegan/Protein; pricing/OPTIMAL/ECO; Production/Batch Rescue/Master Label; Lost & Legendary; menu; save/version/account boundaries.
8. **Deployment environment verified** — only `origin/staging` and `https://staging.pinguinoai.com` were changed. Integration started from fetched `origin/staging` `4bd4f50f3c371e579d8b071567764ece0fffe51b`; the served bundle contains `ec693282bd4fe6cc68a0084deb3671a3d89cf689`.
9. **Remaining incomplete items** — only the five external/new-science/legal/future-architecture items in section R.
10. **Exact blockers/external actions** — supply the exact approved process workbook; approve/produce sensory calibration datasets; complete regulatory/allergen/shelf-life work in its own validated phase.
11. **Git diff and commit status** — code is clean through `ec693282`; the final evidence commit adds only the release ledger and QA images. No production push, production deployment, secret, environment file or Mapper dataset mutation occurred.
