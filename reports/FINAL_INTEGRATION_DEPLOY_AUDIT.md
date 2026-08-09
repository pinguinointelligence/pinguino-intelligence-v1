# PINGÜINO Intelligence — final integration, deployment and Owner audit

Date: 2026-08-09  
Integration branch: `codex/final-integration-deploy-2026-08`  
Baseline: `origin/staging@7d33ec7c2d56936f1b6cc2e22e2526d60ab9e10b`  
Target: existing staging only — `https://staging.pinguinoai.com` / Vercel project `pinguino-staging` (`prj_6h8PDTCUrdDdXNzfEfjJNsVL5BcE`) / Supabase project `tunabqqrwabacxjcxxkz`  
Production: **not changed**  

## Executive result

The reviewed development cycle is integrated over the newest legitimate staging baseline. Mapper Basement 2088 is the only current local Mapper source, its transactional seed is live on the existing staging database, all required staging migrations are applied, cross-account price RLS was exercised with two ephemeral users, and the integrated repository is green.

The application remains deliberately honest about capabilities that are not production-complete. In particular, process metadata is not a runtime source, Production does not yet have a server-authoritative append-only physical ledger, Master Label print remains blocked without canonical verified allergen data, market renderers remain PARTIAL/RESEARCH, unsupported Direction axes remain pink, and customer prices are EUR-only. These omissions are not disguised.

## 1. Final integration manifest

| Task | Source branch | Latest reviewed/source SHA | Integrated state | Conflicts / resolution |
| --- | --- | --- | --- | --- |
| Current staging, current-draft, canonical identity, Preview/Apply/Undo, Monitor seam | `codex/final-pro-workbench` / `origin/staging` | `7d33ec7c2d56936f1b6cc2e22e2526d60ab9e10b` | Baseline | Preserved as the functional authority. |
| Multi-Main identity | `codex/multi-main-recipe-identity` | `5ae99e6935a85a4c8f5534b8604d6626e5b1f8a1` | Integrated through product chain | Main remains a set keyed by stable line ID + canonical ingredient ID; no singleton fallback restored. |
| Vegan Gelato | `codex/vegan-gelato-final` | `37492b81cdfa6f14f7307a8691de359f2ad06812` | Integrated through product chain | Used the post-review correction, not initial `de6253b`. Mapper-dependent eligibility was recomputed for 2088. |
| Protein Gelato | `codex/protein-gelato-final` | `47198dc594cd3df949fd7350f3097473cb56d96b` | Integrated through product chain | Protein target remains a product type/profile feature; actual protein, not requested target, is displayed. |
| OPTIMAL / ECO / customer pricing | `codex/optimal-eco-customer-pricing-final` | `30daf295465bff1b53f9531a0851b44f26af3ad5` | Integrated through product chain | ECO ranking now receives current private prices transiently; RecipeInput/save payload retains Mapper price. |
| Production / Batch Rescue / Master Label | `codex/production-master-label-final` | `4ec3f495f5da30e368a26b9eee8f184e5ae9c34d` | Temporary merge `3a303af`; final integration | Merged automatically onto staging/product chain. Later account-boundary, production-owner, and migration hardening retained. |
| Contextual learning and process guide | `codex/contextual-learning-process-guide` | `abc45e628bce17855e34b5472ed0373445012c55` | Temporary merge `5e8bdb8`; final integration | Overlaps in Ingredient Builder, Monitor/Profile, workspace, save and store files were reconciled by preserving staging/product behavior and newest accepted presentation. No redesign was introduced. |
| Pro monitor | `codex/pro-monitor-ux` | `93df6eb4bda7083b34f9d0203c443d4f79424f6f` | Contained in UX chain | Existing monitor modules and technical-score seam retained. |
| Profile preflight / Direction presentation | `codex/pro-profile-preflight` | `4a83fca7aa68dcaad5fd39925f0291144579d588` | Contained in UX chain | Unsupported sensory axes remain visibly non-production; no fake solver/science added. |
| Ingredient table UX | `codex/ingredient-table-ux` | `92e2d84bdae5a8e509a276bbf7b4bfb00fe86d7f` | Contained in UX chain | Canonical duplicate repair and current pricing state added without restoring removed duplicate UI. |
| Lost & Legendary / Inspiration | `codex/lost-legendary-inspiration` | `34e2be80e46a0bdb867d3446fe74926abbcddb29` plus focused product-review adjustments | Temporary merge `d6803df`; final integration | Mapper CSV/history overlap resolved in favour of Owner's 2088 current CSV and history-only old files. Customer families remain concrete; Protein is a product filter. Owner-review states stay pink. |

The overlap was reviewed before resolution. No conflict was solved by replacing newer staging functional logic with an older feature implementation. The temporary merge commits are integration checkpoints; final staging history contains the integrated content and the audit evidence.

## 2. Mapper 2088 proof

| Check | Exact result |
| --- | --- |
| Only active local current source | `docs/ingredients/validation/mapper_basement.csv` |
| Data rows | **2088** |
| Columns | **62** |
| CSV SHA-256 | **B13F5DB4AFFD9C3BE5CCBE59B40920053197A3697A3FA1BD4A859406E8BAED38** |
| Duplicate `ingredient_id` | **0** |
| Blank `ingredient_id` | **0** |
| Ingredient-level `npac_value` | Absent |
| Local dataset version | CSV does not carry the field; approved seed stamps **`v1.0`** |
| Seed SHA-256 | **3C59E5A23A30B9D209E584D5CC8F2085C40A1888808D3182B2F3092ECB7BA4DF** |
| Runtime historical Mapper references | **0**; `docs/ingredients/validation/history/` is rollback/test evidence only |
| Full Mapper embedded in build/client | **No**; bundle census contains only the small selected client fixtures, not 2088 rows |

Database proof after the transactional staging import:

| Query | Result |
| --- | ---: |
| `public.mapper_basement` total | 2088 |
| active | 2088 |
| inactive | 0 |
| `dataset_version = v1.0` | 2088 |
| approved base | 2075 |
| approved for engines | 2074 |
| anonymous demo read model | 2075 |
| anonymous raw Mapper rows | 0 |

The database update was an upsert + soft-deactivation transaction. Previous active live count was 2083; current total/active count is 2088, yielding a net +5 current rows and 0 deactivations. The first import attempt rejected uppercase dietary enum literals and rolled back atomically. The seed generator was corrected to emit validated lowercase `true|false|unknown`; the second import committed successfully.

Soy proof:

- `PI-ING-002109` through `PI-ING-002112`: approved base, approved for engines, `vegan=true`.
- `PI-ING-002113`: base-approved, not engine-approved, therefore excluded from automatic formulation.
- Soya Sauce `PI-ING-001422`: remains excluded; name similarity cannot grant eligibility.

Vegan 2088 recount:

| Status | Count |
| --- | ---: |
| VERIFIED | 1005 |
| FALSE | 791 |
| UNKNOWN | 281 |
| CONFLICT | 11 |

Verified Vegan formulation candidates: **11**, including **4 soy** candidates. Eligibility is checked before Preview and again at trustless Apply.

Protein 2088 recount: **10** verified formulation candidates — **6 dairy** and **4 plant**. WPC/MPC, Skyr/high-protein food, pea and rice routes were re-evaluated; no `approved_for_engines=false` ingredient is activated.

## 3. Database and RLS

Staging backend: Supabase `tunabqqrwabacxjcxxkz`. Production backend was not accessed or modified.

Applied remote staging migrations:

1. `20260809194001` — Mapper Basement 2088 seed.
2. `20260809194002` — rich authenticated Mapper search.
3. `20260809194003` — narrow anonymous demo Mapper search.
4. `20260809194004` — customer ingredient prices.
5. `20260809194005` — owner relationship RLS / production freeze hardening.

`supabase migration list --linked` shows all five locally/remote. `supabase db push --linked --dry-run` reports no pending migrations. A post-success Docker catalog-cache warning did not roll back or invalidate the remote migration; live REST/table verification confirmed the state.

Customer pricing isolation was exercised on staging with ephemeral users A and B:

- A could read A's override.
- B saw **0** rows belonging to A.
- B's cross-owner insert was blocked.
- reset physically deleted the override and the Mapper reference price became authoritative again.
- ephemeral rows/users were removed after the test.

Account-boundary hardening clears private recipe, price, production and label state on A→anonymous and A→B, including storage-unavailable boot. The runtime owner marker prevents a prior account's persisted state from rendering during a fresh boot. A known anonymous→login transition preserves the current anonymous draft as intended.

Production parent/child ownership checks were added. Planned-item insertion is accepted only while a run is `draft`, not after plan freeze. Event/status transitions are checked. This does **not** turn the current client event list into an authoritative append-only server ledger; see blockers.

## 4. Automated tests

Final integrated gate:

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, 0 errors; 2 pre-existing Fast Refresh warnings (`src/app/router.tsx:46`, `src/features/pro-core/RecipeVersionsSection.tsx:24`) |
| `npm test` | **433 files / 5689 tests passed / 0 failed** |
| `npm run build` | PASS, 1067 modules; large-chunk advisory only |
| `npm run recipes:validate` | PASS, 2500 recipes / 80 committed images / 2420 intentionally missing images |
| `npm audit` | PASS, 0 vulnerabilities |
| `git diff --check` | PASS |

Final local build assets: `dist/assets/index-BBunAyZi.js`, `dist/assets/index-BOCM4VCP.css`, and `dist/assets/esm-CJnO6XFT.js`.

Focused gates included Mapper source/seed (**3 files / 24 tests** in independent rerun), final security/app fixes (**6 files / 60 tests**), product/integration suites (**153**, **107**, and **69** test focused waves), plus the full repository suite. The OCR tests emit a non-fatal optional Italian special-words resource diagnostic; the suites exit green and no OCR assertion is hidden.

## 5. Independent review

The independent reviewer inspected the integrated code after the full green gate and initially found four real blockers:

1. Apply could validate a proposed recipe under a forged easier category/temperature/mode/machine/goals context.
2. ECO Preview ranked raw recipe-store prices instead of current owner overrides.
3. account boot/reset could expose a previous account's persisted private state before the first auth transition.
4. planned production rows could be appended after the plan was frozen.

Fixes and regressions:

- `VerifiedApply.commit` now pins mode, category, temperature, machine and goals to current context before Engine verification.
- ECO receives private prices only as transient ranking input; saved RecipeInput retains reference pricing.
- boot-safe runtime owner boundary clears A→anonymous/B even when browser storage is unavailable.
- a production session is reused only for the same owner.
- migration hardening closes frozen-plan insertion and cross-parent owner references.
- canonical duplicate repair keys by canonical ID.
- stale Mapper and process documentation was corrected.

Final reviewer verdict for the integrated product chain: **DEPLOY — no unresolved P0/P1/P2 integration blocker**. The independently rerun seed review also returned **DEPLOY** after confirming 8352 lowercase dietary literals and 0 uppercase values.

The first served build then exposed one staging-only review-mode configuration gap: Vercel did not define `VITE_DESIGN_REVIEW`, so the Owner could not inspect unpublished candidates online. The smallest repair used the exact canonical staging hostname as an additional Owner-review gate. The independent reviewer rejected the first variant because a build-time flag could still enable review mode on a production hostname. The final variant checks and denies `pinguinoai.com` and `www.pinguinoai.com` before every flag/development/staging allow-path. Its focused gate passed **3 files / 30 tests**, and the final independent verdict was **DEPLOY**. Demo and Home remain denied; normal production customer mode remains denied.

## 6. Deployment

Existing configuration only; no `.vercel/project.json`, second project, or new Vercel configuration was created.

| Field | Result |
| --- | --- |
| Environment | staging |
| URL | `https://staging.pinguinoai.com` |
| Vercel project | `pinguino-staging` / `prj_6h8PDTCUrdDdXNzfEfjJNsVL5BcE` |
| Backend | Supabase `tunabqqrwabacxjcxxkz` |
| Deployed Git SHA | `5b931ff139253e9c6acead18f4d88b2791fd5f13` |
| Vercel deployment ID | `dpl_D2kjVRaR2yYYaWooxVFeVnGpSNBB` |
| Vercel deployment URL | `pinguino-staging-kn5ndt7ny-pinguinointelligence-7784s-projects.vercel.app` |
| Served JS/CSS bundle | `assets/index-DtgU5a7p.js` / `assets/index-BOCM4VCP.css` |
| Served bundle SHA-256 | JS `9B7BAD14124B686B2FEF18548FAF9CF3D482B9D6570059DD3DC2677E93FAC8BA`; CSS `2F9AFEA9E41120600D25FFCFE4D09D8944A71865723E8FE81C261B99D92087DD` |
| Served asset timestamp | `Sun, 09 Aug 2026 18:37:47 GMT` |
| Final served response proof | `HTTP/1.1 200 OK`; `X-Vercel-Cache: HIT`; `X-Vercel-Id: cdg1::d5jtg-1786301086776-bf19e1d1e3aa` |

GitHub/Vercel deployment status is successful and points to deployment `D2kjVRaR2yYYaWooxVFeVnGpSNBB`. The served JavaScript contains the staging ref, the exact staging/production hostname gates and only **39** selected Mapper fixture IDs. It does not contain the production ref or the full 2088-row Mapper. Bundle identity was verified by content as well as by filename.

## 7. Beginner QA

| Scenario | Result | Evidence/meaning |
| --- | --- | --- |
| Add/edit unexpected or too-small value | PASS | validation stays user-facing; no raw exception is primary copy |
| Unavailable or wrong ingredient | PASS | explicit unavailable/block path; no silent replacement |
| Accidental lock / exact / range | PASS | constraints stay visible; impossible combinations fail closed |
| Batch change | PASS | canonical draft, percentages and current batch remain synchronized |
| Cancel Preview / Apply / Undo | PASS | one Preview→verified Apply route; Undo restores exact prior formulation |
| Save / reopen / version restore | PASS | canonical IDs, Main roles and target/profile state round-trip |
| Browser online click-through | PASS | served staging: edit grams → live percentages/batch → Recalculate → Preview → Apply → Undo → Save → reload |

## 8. Professional QA

Automated matrix covers Gelato, Sorbet, Vegan and Protein at −11/−12/−13 where applicable, neutral/fruit/nut/cocoa, high-water, unavailable, locks, batch, Preview, Apply, Undo and persistence. Home stays machine-oriented; the professional temperatures are not promoted into the current Home flow. Pro retains the six frozen machine/serving choices and exact grams.

High-water abuse remains fail-closed: a mathematically native-safe result that requires approximately Inulin 211 g with Tara below the approved 2 g envelope is diagnostic-only and cannot be applied as a normal 10/10 result.

## 9. Main / Banana extremes

| Case | Exact input/proof | Result |
| --- | --- | --- |
| Banana Main normal | 100 g in the canonical fixture | positive Main remains 100 g; role remains Main |
| Banana + Strawberry 1:1 | 100:100 and production/formulation variants | measured ratio `1.000000000000`; no line disappears |
| Banana + Strawberry 2:1 | 200:100 and Protein fixture 120:60 | measured ratio `2.000000000000`; no line disappears |
| Banana + Strawberry + Pistachio | three positive Main lines | 1:1:1 contract preserved |
| Exact/range conflict | Banana locked 500 g or incompatible shared range | explicit `main_ratio_conflict`; no anonymous milk-base “solution” |
| Actual Banana | actual 100 g, planned 100 g | verified candidate preserves both; confirmed physical material never reduced |
| Unavailable Banana | Main marked unavailable | formulation stops explicitly |
| Protein Banana −13 | Banana 100 g, actual protein 20.0000%, POD 13.4615, PAC 28.1322, NPAC 51.3782, ice 49.7414%, score 10 | PASS |

The exact sensory minimum/maximum Banana flavour boundary is not claimed because no approved ingredient-specific potency calibration exists. At that boundary the product truth is a visible calibration/data blocker, not an invented number.

## 10. Whisky / alcohol limit

Mapper ingredient: `PI-ING-000038`, alcohol 31.6%, PAC 233.84, POD 0. The Main line is retained throughout.

| Whisky g | Alcohol contribution % | PAC | NPAC | Ice % | Violations | Technical score |
| ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 0 | 0.0000 | 23.6830 | 37.5215 | 49.7274 | none | 10 |
| 20 | 0.6320 | 28.2638 | 44.6091 | 42.2459 | `ice_low`, `npac_high` | 8 |
| 40 | 1.2640 | 32.8446 | 51.7790 | 34.6778 | `ice_low`, `npac_high` | 7 |
| 60 | 1.8960 | 37.4254 | 59.0323 | 27.0214 | `ice_low`, `npac_high` | 6 |
| 70 | 2.2120 | 39.7158 | 62.6908 | 23.1597 | `ice_low`, `npac_high` | 6 |
| 79 | 2.4964 | 41.7772 | 66.0017 | 19.6648 | `ice_low`, `npac_high` | 6 |
| 80 | 2.5280 | 42.0062 | 66.3707 | 19.2754 | `alcohol_high`, `ice_low`, `npac_high`; warning | 6 |
| 100 | 3.1600 | 46.5870 | 73.7956 | 11.4380 | hard technical failure | 6 |
| 150 | 4.7400 | 58.0390 | 92.7467 | 0.0000 | hard technical failure | 6 |

First technical failure is **20 g** (`ice_low`, `npac_high`). The explicit alcohol warning threshold first fails at **80 g**. No unsafe case returns 10/10 or bypasses verified Apply.

## 11. Vegan matrix

| Case | Result |
| --- | --- |
| Dairy recipe → Vegan | dairy milk/cream/SMP rejected before Preview and again at Apply |
| Strawberry / Banana / nut / cocoa | verified Vegan toolbox paths tested at supported temperatures |
| Multi-Main 1:1 / 2:1 | positive Main identity and ratio preserved |
| Soy Mapper 2088 | four engine-approved verified soy candidates available; soya sauce excluded; non-engine-approved 002113 excluded |
| Vegan + plant protein | verified plant protein route tested |
| Unavailable Vegan Main | explicit stop |
| Private/user ingredient | never inherits Vegan eligibility without verified evidence |
| Forged non-Vegan Apply | fail-closed |
| −11/−12 | internal calibration only; not described as externally production-validated |

## 12. Protein matrix

Strawberry bounded sweep:

| Temperature | 10% | 15% | 20% | 21% | 22% | 25% | 30% |
| --- | --- | --- | --- | --- | --- | --- | --- |
| −11 | exact 10 | exact 10 | exact 10 | exact/native-safe | safe miss 17.7358% | safe miss 17.7358% | safe miss 17.7358% |
| −12 | exact 10 | exact 10 | exact 10 | exact/native-safe | safe miss 18.3725% | safe miss 18.3725% | safe miss 18.3725% |
| −13 | exact 10 | exact 10 | exact 10 | exact/native-safe | safe miss 17.2661% | safe miss 17.2661% | safe miss 17.2661% |

The tested integer frontier is 21%; 22% is the first miss. Target changes alone do not mutate grams. Fingerprints include target, stale Preview is invalidated, actual nutrition uses `totalProteinGrams / finalBatchMassGrams × 100`, and a safe miss never receives 10/10. Default 20% matrix: 15/17 exact; Chocolate 14.0771% and Pistachio 15.7419% are honest safe misses.

## 13. OPTIMAL / ECO

| Abuse case | Result |
| --- | --- |
| Price-only change under OPTIMAL | no POD/PAC/NPAC/ice/water/solids/fat/protein/technical-score change |
| Extremely cheap/expensive/reversed price | ECO ranks only known, currency-compatible prices; missing never means €0 |
| Private override | transiently affects ECO candidate ranking, never persists inside saved RecipeInput |
| Reset override | physical row removed; Mapper reference price wins again |
| Currency mismatch | explicit unavailable/mismatch; no false converted saving |
| Expensive pistachio/fruit/nut | Main set, relative ratios, constraints and Flavour Floor prevent destructive saving |
| Unknown flavour floor | no invented numerical floor; explicit blocker |
| Claim wording | candidate-set saving only; no false “globally cheapest” claim |

The exact stopping gram for every flavour cannot be universal: policies are canonical-ingredient/family evidence. Where evidence is absent, ECO stops with an explicit calibration/data blocker instead of fabricating a potency floor.

## 14. Multi-Main

1:1, 2:1 and 1:1:1 are covered across formulation, correction, Preview, Apply, forged Apply, Undo, save/reopen, version restore, Production, Production rescue, OPTIMAL and ECO. Main identity uses stable line ID + canonical ingredient ID. Explicit re-add restores the intended Main role. Main + unavailable stops. Exact/range conflict returns `main_ratio_conflict`.

## 15. Production

| Case | Result |
| --- | --- |
| Normal six-line run | one explicit ✓ per ingredient plus `Zakończ produkcję` |
| Exact planned amount | confirmed actual becomes factual history |
| Positive / negative deviation | live forecast reflects actual confirmed + remaining plan |
| Accepted over-add proof | Sucrose planned 130 g → actual 180 g; actual remains 180 g |
| Rescue | Cream top-up +227.8 g, final batch ≈1277.8 g, technical score 10; top-up folds into canonical Cream line, no duplicate |
| Under-add / unavailable next / locked / Multi-Main | verified add-only rescue or explicit inability; confirmed amount never reduced |
| Finish | coherent completion gate freezes actual snapshot in the client workflow |
| Account switch | production session reused only for the same owner |

The current persistence is not yet an authoritative, immutable, server append-only physical ledger. Direct client/server writes still cannot prove every physical event; this is a production blocker for regulated history, not hidden as complete.

## 16. Master Label

Master Label is sourced from the frozen completed **actual** batch, not the planned recipe. Market, label language and UI language are independent. EU/USA/Canada/UK/Australia-NZ remain `PARTIAL`; unvalidated markets remain `RESEARCH` / test-only.

Preflight blocks print for missing verified allergens, missing validated/user-entered shelf-life basis, unsupported market and other required data. Verified allergens are not yet fully rehydrated by canonical ingredient ID, so production print is intentionally blocked. No legal certification is claimed; multiple copies/system-print adapter are preparation surfaces, not a verified PDF/printer pipeline.

## 17. Mobile QA

The served build was exercised at desktop 1440×900, requested phone 390×844, narrower 360×800 and larger 430×932. The browser reports 375 CSS document pixels at the 390-wide viewport because of its scrollbar; document `scrollWidth` stays equal to `clientWidth`, so there is no horizontal overflow.

- Public Home at 390×844 keeps canonical branding and the clearly non-production Monitor example.
- Inspiration/Owner Review at 390×844 remains usable with no horizontal overflow.
- Pro Profile at 390×844 keeps the ingredient/editor flow and cockpit accessible.
- Pro menu at 360×800 is vertically scrollable and has no visible interactive clipping or horizontal overflow. One covered background/backdrop text node is geometrically clipped while the menu is open; it is not a visible menu control and is recorded rather than hidden.
- Master Label and completed Production at 430×932 have no horizontal overflow or clipped visible controls.

Screenshots are linked in §23.

## 18. Menu

Static/regression coverage and served mobile QA confirm one canonical role/capability menu, active states, no stale `Ninja 2` name, correct professional/customer visibility, vertical scrolling on the narrower phone, and no visible horizontal clipping. The Owner Review badge remains visually distinct and is not presented as customer-ready functionality.

## 19. Demo / Home / Pro capability truth

- Demo hides exact ingredient grams and cannot save. No raw Mapper/research/unpublished candidate is exposed.
- Home remains machine-oriented and permits a maximum of one saved recipe. It does not promote −11/−12/−13/Świeże professional choices.
- Pro exposes exact grams, professional controls and unlimited saves; costing is Pro/business functionality.
- Canonical choices remain: −11°C, −12°C, −13°C, Świeże, Ninja Gelato, Ninja Swirl. `Ninja 2` is absent.
- The planned new Home monitor/redesign/sales preview was not started.

## 20. Lost & Legendary

Customer mode hides all unpublished candidates and does not leak them through the country selector. First-view suggestions prefer up to six concrete human flavour families (Strawberry, Chocolate, Pistachio, Mango, Vanilla, Coffee, Banana, etc.), not raw largest internal technical clusters. Protein is a product type/filter, never a flavour family. `Inne`/`Aromatyczne` are not promoted where concrete families exist.

Owner review can inspect researched/non-public candidates with strong pink `WYMAGA TESTU`, `NIEZWERYFIKOWANE PRODUKCYJNIE`, `RESEARCH` states. `AUTHENTIC` and `ADAPTABLE` are distinct; `Oryginał` and `Adaptacja PINGÜINO` remain separate. The real seven-stage customer publication gate is unchanged.

## 21. Security follow-up

| Question | Current truth |
| --- | --- |
| Full Mapper shipped in browser bundle | No |
| Full Mapper embedded statically | No; selected fixture IDs only |
| Authenticated client can enumerate approved rich read model | Yes, via paginated authenticated view; this remains scraping/IP exposure |
| Anonymous Demo can access raw Mapper | No; RLS returns 0 raw rows and the demo view is narrow |
| Solver formulas in public client | Yes |
| Server-side proprietary solver/classifier | Not implemented |
| Rate limiting / anti-scraping | No complete server-side protection |
| Capability/auth boundaries | client capability gates plus Supabase auth/RLS; sensitive data must rely on RLS, not UI hiding |

Future direction remains server-side Mapper + proprietary rules + classifier + solver + scoring. This integration intentionally did not expand into that architecture migration.

## 22. Remaining blockers

| Issue | Type | Impact | Production-blocking? | Exact next action |
| --- | --- | --- | --- | --- |
| Process COLD/HEAT/UNKNOWN metadata has no canonical runtime/database integration | DATA/CODE | education/process cannot claim canonical per-ingredient runtime truth | Yes for automated process guidance | approve a versioned canonical ID-aligned dataset/table and ingestion contract |
| Server-authoritative append-only Production ledger absent | CODE | physical history can be client-asserted; event time/order not authoritative | Yes for regulated/audited production | design idempotent per-line confirmation/completion RPC + immutable events + parent-owner RLS |
| Production substitutions, automated steps and toppings incomplete | CODE/PRODUCT | pink/test surfaces only | Yes for those capabilities | approve substitution/stage/topping contracts, then implement through add-only physical model |
| Canonical verified allergens not rehydrated into final actual batch | DATA/CODE/REGULATORY | label print preflight remains blocked | Yes for print | add canonical label/allergen repository with evidence provenance and actual-batch resolver |
| Facility/operator profile incomplete | DATA/REGULATORY | required business/address fields not authoritative | Yes for label print | add account-scoped facility schema and reviewed required fields per market |
| No validated shelf-life model | SCIENCE/REGULATORY | automatic durability date would be invented | Yes for automatic print | provide validated rules or require explicit validated manual basis/date |
| Market profiles only PARTIAL; other markets RESEARCH | REGULATORY | no legal-compliance claim is possible | Yes for commercial label output | legal/product review and version each concrete market/package/language renderer |
| Direction sweetness/creaminess/intensity and some softness cells lack approved calibration | SCIENCE/DATA | cannot honestly formulate every −1/0/+1 sensory request | Yes for those directions, no for baseline recipe | owner approves calibration evidence; keep controls pink until then |
| Ingredient-specific flavour potency/floor missing for some Main families | DATA/SCIENCE | exact flavour min/max and some ECO savings limits cannot be quantified | Yes for automatic optimisation in unknown families | create evidence-backed canonical/family registry; fail closed meanwhile |
| Customer price currency is EUR-only; no account currency/FX model | DATA/CODE | mismatched currencies remain unavailable rather than converted | Yes for multi-currency costing | add account currency, price currency provenance and approved FX policy |
| Full proprietary server-side architecture/rate limiting absent | SECURITY/CODE | authenticated rich Mapper/solver logic remains scrapeable | Strategic/IP blocker | move Mapper/rules/classifier/solver/scoring server-side and add rate limits/audit |
| No direct printer/PDF artifact pipeline | CODE/EXTERNAL | browser print adapter only | Yes for controlled print workflow | approve printer/PDF/storage contract after regulatory data gate |

## 23. Post-deploy online QA evidence

Every row below was captured from the actually served build, not a local fixture.

| Served scenario | Result | Exact evidence |
| --- | --- | --- |
| Public Home desktop | PASS | canonical logo, black/white presentation, no horizontal overflow, Monitor marked `TESTOWE / NIEPRODUKCYJNE`; [screenshot 01](qa/final-integration-served/01-home-desktop-1440x900.png) |
| Customer Recipes | PASS | unpublished Lost & Legendary candidates hidden; no `RESEARCH`, Owner Review or candidate-name leakage; [screenshot 02](qa/final-integration-served/02-recipes-desktop-1440x900.png) |
| Inspiration first view | PASS | concrete first six: Chocolate 460, Strawberry 140, Vanilla 121, Caramel 153, Pistachio 204, Coconut 140; Protein only in product-type filter; [screenshot 03](qa/final-integration-served/03-inspiration-families-desktop-1440x900.png) |
| Customer Lost & Legendary | PASS | customer sees testing/publication explanation, not unpublished cards; [screenshot 04](qa/final-integration-served/04-lost-customer-desktop-1440x900.png) |
| Pro Profile desktop | PASS | canonical logo, black/white system, editor and cockpit together in a 1440×900 viewport, pink unfinished controls visible, document height exactly one viewport in normal flow; [screenshot 05](qa/final-integration-served/05-pro-profile-desktop-1440x900.png) |
| Monitor desktop | PASS | complete historical modules retained, technical score 10 visible, golden-middle semantics preserved, proprietary exact target ranges not exposed; [screenshot 06](qa/final-integration-served/06-pro-monitor-desktop-1440x900.png) |
| Recipe canonical draft | PASS | Milk 670→660 immediately changed percentages and current batch to 990 without refresh; immediate Recalculate produced a 990→1000 proportional Preview; [screenshot 07](qa/final-integration-served/07-pro-preview-desktop-1440x900.png) |
| Apply / Undo / Save | PASS | Apply produced exact 1000 g without canonical duplicate; Undo restored Milk 660 and batch 990 exactly; Milk reset to 670, recipe saved as `QA FINAL c6a0ab1`, reload restored name and value with all changes saved |
| Production initial | PASS | six physical lines, one explicit confirmation per line, finish initially disabled; [screenshot 08](qa/final-integration-served/08-production-desktop-1440x900.png) |
| Production completed | PASS with declared architecture blocker | all six lines confirmed and exact 1000 g completed actual shown; this is client-workflow proof, not an authoritative append-only server ledger; [screenshot 09](qa/final-integration-served/09-production-completed-desktop-1440x900.png) |
| Master Label from actual | PASS with print blocked honestly | actual completed 1000 g is the source; market/language separated; allergen, shelf-life, operator and print blockers visible; `Inny rynek` = RESEARCH, EU = PARTIAL, print disabled; [screenshot 10](qa/final-integration-served/10-master-label-blocked-desktop-1440x900.png) |
| Owner Review desktop | PASS | staging Pro shows `TRYB OWNER REVIEW`, strong pink `TESTOWE / NIEPRODUKCYJNE`, `DO PRZEGLĄDU (15)`, RESEARCH cards, and explicit original/adaptation semantics (`Oryginalna wersja`, `Jawna adaptacja`, `Oryginał`, `Adaptacja PINGÜINO`); [screenshot 11](qa/final-integration-served/11-lost-owner-review-desktop-1440x900.png) |
| Owner Recipes mobile 390×844 | PASS | no horizontal overflow; [screenshot 12](qa/final-integration-served/12-recipes-owner-mobile-390x844.png) |
| Pro Profile mobile 390×844 | PASS | no horizontal overflow; cockpit/Owner Review state visible; [screenshot 13](qa/final-integration-served/13-pro-profile-mobile-390x844.png) |
| Pro menu mobile 360×800 | PASS with recorded covered-node caveat | visible menu usable and scrollable, no horizontal overflow or visible control clipping; [screenshot 14](qa/final-integration-served/14-pro-menu-mobile-360x800.png) |
| Master Label mobile 430×932 | PASS | no horizontal overflow; `TESTOWE / NIEPRODUKCYJNE` and allergen warning remain prominent; [screenshot 15](qa/final-integration-served/15-label-mobile-430x932.png) |
| Production mobile 430×932 | PASS | no horizontal overflow; completed physical actuals remain visible; [screenshot 16](qa/final-integration-served/16-production-mobile-430x932.png) |
| Public Home mobile 390×844 | PASS | live DOM measurement: no horizontal overflow (`scrollWidth = clientWidth = 375`), canonical branding and test-only Monitor copy visible |
| Normal production customer publication gate | PASS | read-only QA at `https://www.pinguinoai.com/recipes`: no Owner Review, RESEARCH, unverified-production badge, review count, or Lost candidate names; production was not deployed or modified |
| Browser console | PASS | zero warning/error entries in the final inspected tab |

## 24. AGENTS.md completion ledger

1. **Requested scope:** integrate every accepted development-cycle branch; activate Mapper 2088; migrate staging DB/RLS; maximum regression; independent review; existing staging deploy; online QA; Owner audit.
2. **Completed work:** integration, Mapper generator/seed repair, canonical duplicate hardening, forged-Apply context pinning, transient ECO price projection, account boot privacy, owner-bound Production session, relationship RLS, frozen-plan guard, Whisky boundary regression, dependency audit cleanup.
3. **Files changed:** full authoritative list is `git diff --name-status 7d33ec7...<final SHA>`; principal areas are `src/data/ingredients`, `src/features/formulation`, `constraint-studio`, `protein-gelato`, `production-workspace`, `master-label`, Pro workbench, recipe discovery, stores/services, Mapper docs/seed and migrations 0037/0038.
4. **Tests added/changed:** Mapper 2088/source/seed, Vegan/Protein toolboxes, account boundary, forged Apply, ECO/private pricing, canonical duplicate repair, Production owner/rescue, RLS migration, Whisky boundary, Profile/Monitor/workbench/design truth.
5. **Exact commands:** `npm run typecheck`; `npm run lint`; `npm test`; `npm run build`; `npm run recipes:validate`; `npm audit`; `git diff --check`; focused Vitest waves documented in §4; Supabase migration list/dry-run/REST/RLS probes documented in §2–3.
6. **Results:** typecheck/build/diff/recipes/audit green; lint 0 errors/2 known warnings; 433 files/5689 tests green.
7. **Previously accepted flows retested:** Base Engine, all product types, canonical draft, locks/unavailable/batch, Preview/Apply/Undo, save/version, Multi-Main, Direction honesty, pricing/OPTIMAL/ECO, Production/rescue/actuals, Master Label gates, Lost & Legendary, menu, OCR/intake.
8. **Deployment environment:** existing Vercel staging + staging Supabase only; deployed SHA `5b931ff139253e9c6acead18f4d88b2791fd5f13`, deployment `dpl_D2kjVRaR2yYYaWooxVFeVnGpSNBB`, bundle `index-DtgU5a7p.js` + `index-BOCM4VCP.css`; exact served proof is in §6/§23. Production untouched.
9. **Remaining incomplete items:** complete list in §22.
10. **External actions:** regulatory validation, process/calibration data approval, server Production ledger, canonical allergen/facility/shelf-life data, multi-currency and server-side IP architecture.
11. **Git status:** functional integration and review-gate commits are pushed to `origin/staging`; production refs were not pushed or deployed. This audit and its served screenshots are committed locally as evidence after the proven deployment and intentionally are not pushed, because an evidence-only push would trigger a different Vercel SHA/bundle and invalidate the exact served-build identity recorded above. Final status is clean and one evidence commit ahead of `origin/staging`.

## 25. Final status

**PARTIAL — BLOCKERS EXPLICIT**

The integrated staging release can be deployed and tested by the Owner, but the application as a whole cannot truthfully be called production-complete while the explicit Production ledger, label/regulatory, process-data, science/calibration, currency and server-side security blockers above remain.
