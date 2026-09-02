# AGENT 2 — ENGINE AUTHENTICITY LEDGER (metric audit + 20 offline tests)

- **Date:** 2026-07-24 (nightly P0)
- **Base:** `nightly/integration` @ `6f8e680` (= staging), executed in worktree branch `worktree-agent-a2d044d5d9972c514`
- **Engine:** ENGINE 0.4.0 / CONFIG 0.7.0 (science freeze verified by the suite)
- **Method:** every test runs DIRECTLY against the real production pipeline — `buildOptimizePreview` (`src/features/constraint-studio/applyPipeline.ts`, the only preview door) + `calculateRecipe` (`src/engine`) — in a plain node environment. No browser, no UI, no mocked engine value. Same demo-catalog compositions the app uses (`src/data/demoIngredients.ts`; strawberry = the repo's documented raspberry surrogate `PI-ING-001553`).
- **New files (all under the sanctioned dirs):**
  - `src/qa/engine-authenticity/authenticityCases.ts` — pure T1–T20 runner + verdict classifier + proportional-scaling detector + tara provenance
  - `src/qa/engine-authenticity/engineAuthenticity.test.ts` — 20-case drift-detector suite (pins every verdict, score, iteration count and 4-decimal metric)
  - `src/qa/engine-authenticity/scoreSurfaceAuthenticity.test.ts` — TASK A source-level pins (score surfaces derive from the engine)
  - `src/qa/engine-authenticity/engineAuthenticity.artifacts.test.ts` — regenerates the machine-readable artifacts
  - `docs/engine-validation/ENGINE_AUTHENTICITY_TESTS.json` + `.csv` — full machine-readable results (owner requirement d)
- **Gates:** `tsc -b` clean · `eslint` clean · authenticity suite 42/42 green · full repo suite no new failures.

---

## TASK A — runtime score/metric audit (is anything fake or static?)

Sweep of all NON-TEST runtime code for: constant score literals feeding displays, static result objects, fake "balanced" labels, demo Monitor payloads reachable outside Demo, placeholder calculations. Method: targeted greps (`score: <int>`, `/10`, `overall:`, `display:'<digit>'`, `Zbalansowan*`, `mock|placeholder|demo`, `Math.random`, hardcoded `pod_points|npac_points|ice_fraction`) + reading every score surface end-to-end.

| # | Location | What it is | Verdict |
|---|---|---|---|
| 1 | `src/features/recipe-score/recipeMatchScore.ts:97-122` | The ONLY public 1–10 score adapter: `clamp(round(overall/10),1,10)` of the engine's `scores.overall`; null → honest „Brak danych" | **REAL / derived** (pure, monotone; pinned by suite) |
| 2 | `src/features/pi-panel/OverallScoreCard.tsx:33` | Studio score card — `recipeMatchScore(result.scores)` on the live engine result; shows honest partial-coverage note for fallback bands | **REAL / derived** |
| 3 | `src/features/pi-monitor/piMonitorHomeView.ts:223` | Monitor Home view — `recipeMatchScore(result?.scores ?? null)`; traits/stability from the engine's own classified indicators; no numbers by type construction | **REAL / derived** |
| 4 | `src/features/user-monitor/recipeIndicatorStatuses.ts:104,140` | „Pewność danych"/„Gotowość"/status line — all derived from `result.scores`, `result.warnings`, `is_verified`, band provenance | **REAL / derived** |
| 5 | `src/features/pro-core/ProRecalcPanel.tsx:92` | PRO recalc — `recipeMatchScore(calculateRecipe(input).scores)` recomputed live | **REAL / derived** |
| 6 | `src/features/customer-shell/PiMonitorSection.tsx:207-214` | Customer Monitor — `calculateRecipe(recipeInput)` in `useMemo`, then `buildMonitorHomeView` | **REAL / derived** |
| 7 | `src/pages/landing/landingMonitorDemo.ts:30-40` | Landing „demo" Monitor — built at render by the REAL customer pipeline (`createCustomerFlow → buildCustomerResult → calculateRecipe → buildMonitorHomeView`); the 9/10 mentioned in comments is the engine's own output for the chosen input, labelled example | **REAL / derived** (demo input, live output; verified equal to an independent recompute by the suite) |
| 8 | `src/pages/landing/landingCopy.ts:7,36` | Landing copy states the sample is the §6.2 example; "score/verdict/rows come from the real engine, never from static copy" | **REAL** (copy only, no numbers) |
| 9 | `src/engine/config/scoring.ts` (`STATUS_SCORES` 100…30, `COST_SCORE_ANCHORS` 79-82) | Engine scoring CONFIG constants (status bases, cost anchors, mode weights) | **REAL** (calibration config consumed by the computation — not display constants) |
| 10 | `src/spine/evaluateTemperatureRegulator.ts:336` (`score: 0`) | The BLOCKED evaluation state — an honest zero for an un-evaluatable input, never a fake positive | **REAL / honest zero** |
| 11 | `src/features/pi-monitor/piMonitorFixtures.ts` + `src/features/optimization/optimizationPreviewFixtures.ts` + `branchRecalculationFixtures.ts` | Deterministic sample INPUT recipes (grams in, not scores out) for dev preview pages; every consumer runs them through the real pipeline | **REAL inputs, dev-only** — consumed only by `/dev/*` routes |
| 12 | `src/features/ocr-intake/ui/demoSession.ts:250` (`score: 87`) | OCR demo-session match-confidence sample inside the OCR intake dev harness | **STATIC but dev-only** — reachable only via `/dev/ocr-intake`/`/dev/ocr-batch` |
| 13 | `src/app/router.tsx:106-133` | ALL `/dev/*` routes registered only under `import.meta.env.DEV` (dead-code-eliminated in production) — no demo payload reachable outside Demo/dev | **GATED** (pinned by the suite) |
| 14 | `'balanced'` labels (`src/copy/en.ts:793,824`) | Input OPTION labels (flavor intensity „Zbalansowana", CLASSIC mode description) — never a result label; the §15.1 result labels come only from `MATCH_SCORE_LABELS` via the adapter | **REAL** (no fake „balanced" result label exists) |
| 15 | `Math.random` (3× `src/features/pro-core/*Repo.ts`) | In-memory repo ID generation only — never a score/metric path | **REAL** (no randomness in any calculation) |
| 16 | Hardcoded `pod_points:`/`npac_points:`/`ice_fraction_percent:` literals in runtime | — | **NONE FOUND** in non-test runtime code |

**TASK A conclusion: no fake, constant or static score/metric feeds any runtime display.** Every visible score is `engine.scores.overall` → `recipeMatchScore` (monotone presentation), every trait/status derives from the engine's classified indicators, demo/dev fixtures are inputs (not outputs) and gated behind `import.meta.env.DEV`. These findings are now pinned by `src/qa/engine-authenticity/scoreSurfaceAuthenticity.test.ts`.

---

## TASK B — the owner's 20 offline tests (real pipeline, full results)

### Verdict summary (one line per test)

| Test | Case | Verdict | Score | Key evidence |
|---|---|---|---|---|
| T1 | Strawberry EXACT 100 g | **AUTHENTIC-BEST-ACHIEVABLE** | 9/10 (85.44) | lock byte-exact, 1000 g, 1 soft violation (fat 12.02), solver 2× |
| T2 | Strawberry EXACT 200 g | **AUTHENTIC-BEST-ACHIEVABLE** | 9/10 (86.68) | all bands in range — but PROVISIONAL (fallback) bands, so never a validated native 10/10 |
| T3 | Strawberry EXACT 300 g | **AUTHENTIC-BEST-ACHIEVABLE** | 8/10 (83.21) | 1 soft violation (fat 4.14 < 5), verified fixed point |
| T4 | Strawberry EXACT 400 g | **AUTHENTIC-BEST-ACHIEVABLE** | 8/10 (76.36) | 4 soft violations, no improving move — honest stop |
| T5 | Strawberry EXACT 500 g | **AUTHENTIC-BEST-ACHIEVABLE** | 7/10 (73.78) | 5 soft violations; solver 3× (really added inulin 91.2 g for body) |
| T6 | Strawberry EXACT 600 g | **AUTHENTIC-BEST-ACHIEVABLE** | 7/10 (68.42) | 5 soft violations, solver 3× |
| T7 | Strawberry EXACT 700 g | **AUTHENTIC-BEST-ACHIEVABLE** | 7/10 (69.09) | 7 soft violations, solver 2× |
| T8 | Strawberry EXACT 800 g | **AUTHENTIC-BEST-ACHIEVABLE** | 6/10 (64.36) | 7 soft violations, solver 2× |
| T9 | Strawberry EXACT 900 g (owner suspect) | **AUTHENTIC-BEST-ACHIEVABLE** | 5/10 (53.87) | 10 soft violations; iteration CAP (12×) reported honestly — **NOT a fake 10/10; the suspected false positive does NOT reproduce at this commit** |
| T10 | Straw 0 g + Milk 0 g (full formulation) | **AUTHENTIC-BEST-ACHIEVABLE** | 8/10 (82.14) | genuine template formulation, 1 soft violation (fat 12.02) |
| T11 | Milk EXACT 500 g | **AUTHENTIC-BEST-ACHIEVABLE** | 8/10 (81.78) | milk byte-exact 500; rest per-line optimized (dextrose factor 2.19 vs 0.72 — NOT scaled) |
| T12 | Milk MAX 500 g (range 0–500) | **AUTHENTIC-BEST-ACHIEVABLE** | 8/10 (81.78) | engine chose 500 (the bound binds); identical optimum to T11 — consistent, not copied |
| T13 | Strawberry RANGE 250–400 g | **AUTHENTIC-BEST-ACHIEVABLE** | 8/10 (82.14) | picked 350 g = the template's fruit proportion, strictly inside the range |
| T14 | Inulin unavailable (sorbet, locked 0) | **AUTHENTIC-BEST-ACHIEVABLE** | 7/10 (70.83) | PROPORTIONAL SCALING DETECTED (factor 1.0587) — legitimate: draft = S01 proportions with inulin locked out; solver verified `missing_candidate`; residual ice 50.67 < 51 (hard) reported |
| T15 | SMP EXACT 0 (milk-solids role zeroed) | **AUTHENTIC-BEST-ACHIEVABLE** | 7/10 (72.61) | SMP stays 0; protein_in_solids 6.36 + aerating_protein 2.19 gaps surfaced, solver 4× |
| T16 | Sucrose unavailable (excluded) | **HONEST-IMPOSSIBLE** | — | refusal naming `sweetener_sucrose` with the exact Polish message — dextrose is NOT silently substituted |
| T17 | Gelato −12 unconstrained (native) | **AUTHENTIC-OPTIMAL** | 9/10 (88.17) | G17 template seeds straight into ALL native −12 bands; 0 violations |
| T18 | Gelato −13 unconstrained (native) | **AUTHENTIC-BEST-ACHIEVABLE** | 9/10 (86.15) | proven fixed point; residual lactose_sandiness_risk 9.13 > 9 (hard, sev 0.06) honestly reported — G18 template + demo compositions do not fully satisfy the −13 cell |
| T19 | Sorbet from Strawberry 0 g | **AUTHENTIC-BEST-ACHIEVABLE** | 7/10 (71.01) | S01 formulation, NO dairy anywhere; residual ice 50.82 < 51 (hard, sev 0.05) reported |
| T20 | Repeatability / anti-fixture | **AUTHENTIC-BEST-ACHIEVABLE** | 8/10 (82.14) | 10/10 fresh direct runs byte-identical (unrelated calcs interleaved); store save/reload reproduces the same grams; store path = direct path line-for-line |

**Zero SUSPECTED-FAKE verdicts.** Every score is computed, every refusal is proven (solver-invocation counts + per-round violation/severity trajectories), every residual deviation is named with its band and provenance.

### T1–T9 cross-test table (owner requirement a)

| Strawberry g | Feasible? | Score | Ice % | POD | NPAC | Solids % | Fat % | Main limiting metric |
|---|---|---|---|---|---|---|---|---|
| 100 | yes (preview) | 9/10 (85.4404) | 50.3748 | 14.1499 | 36.9081 | 36.5747 | 12.0161 | fat (soft, sev 0.01) |
| 200 | yes (preview) | 9/10 (86.6823) | 50.8133 | 14.7724 | 36.4926 | 34.3563 | 8.9043 | — (all in band) |
| 300 | yes (preview) | 8/10 (83.2104) | 47.9134 | 16.8284 | 39.24 | 32.3947 | 4.1436 | fat (soft, sev 0.2447) |
| 400 | yes (preview) | 8/10 (76.3612) | 53.3835 | 15.2134 | 34.0578 | 29.8013 | 3.5904 | fat (soft, sev 0.4028) |
| 500 | yes (preview) | 7/10 (73.7782) | 50.1434 | 13.6733 | 37.1273 | 34.4485 | 2.2572 | lactose (soft, sev 1.6654) |
| 600 | yes (preview) | 7/10 (68.4243) | 52.9442 | 12.4016 | 34.4739 | 33.0572 | 1.5732 | lactose (soft, sev 2.4564) |
| 700 | yes (preview) | 7/10 (69.09) | 48.6221 | 14.4442 | 38.5686 | 26.4989 | 1.4296 | lactose (soft, sev 2.6488) |
| 800 | yes (preview) | 6/10 (64.3631) | 53.8608 | 12.7948 | 33.6056 | 23.8159 | 0.8867 | lactose (soft, sev 3.2835) |
| 900 | yes (preview) | 5/10 (53.8735) | 55.6643 | 11.8586 | 31.897 | 21.7809 | 0.2721 | lactose (soft, sev 3.9976) |

The technological change is real and monotone where physics demands it: as fruit displaces dairy, fat falls 12.02 → 0.27 %, solids fall 36.6 → 21.8 %, the score degrades 9 → 5, and the limiting metric shifts from fat to the collapsing dairy metrics (lactose/protein). Values are pairwise distinct across all nine cells (pinned) — no constant, no lookup table.

### Proportional-scaling detector (owner requirement b)

`factor_i = output_i / baseline_i` per unlocked ingredient with a positive baseline; DETECTED when ≥ 3 lines and ≥ 80 % of eligible lines share one factor (±0.1 %) that differs from 1.

- **T11/T12** (the sharpest probe): strawberry/cream/SMP/sucrose share 0.7219 but **dextrose moved by 2.1941** and tara by 0.8969 → NOT proportional; a real per-line freezing-control decision (dextrose was nearly doubled to hold NPAC with 500 g milk locked). Pinned by the suite.
- **T14**: DETECTED (factor 1.0587 on 4/5 lines) and **named in the verdict** — legitimate here: the draft IS the approved S01 template's proportions with inulin locked out, so the constrained optimum equals the projection (per-100 g composition invariant); the solver then verified `missing_candidate`. Anywhere else, detection on an unconstrained draft ⇒ SUSPECTED-FAKE automatically.
- All other feasible tests: not detected or not applicable (full formulations start from 0 g baselines).

### TARA / stabilizer provenance (owner requirement c)

The engine's `TargetMetric` set contains **NO stabilizer metric** (computed from `TARGET_BANDS`, pinned by the suite) — a stabilizer dose is therefore NEVER engine-optimized. Every gelato/sorbet output above carries: grams, % of mix, source (`template_seed_auto_added` — template-controlled `adjustable=false`, scaled with the batch | `user_line_template_dose` — inherited unchanged | `user_line_solver_or_lock`), `optimizedByEngine: false`, and the required sentence: **„Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine."** (Per-test values in the blocks below; e.g. T10: tara 5 g = 0.5 % of mix, template-controlled.)

### 10/10 contract (owner requirement e)

- **Native unconstrained:** T17 = the only AUTHENTIC-OPTIMAL (all native −12 bands in range, 0 violations). T18 is the proven-fixed-point alternative: solver really attempted (1×, `missing_candidate`), residual named — never silently promoted.
- **Constrained:** T1–T15 report the best achievable state with residuals listed, or the exact refusal (T16).
- **Provisional:** every fruit_gelato result is flagged `[PROVISIONAL bands]` (milk_gelato category-fallback, calibration-pending) and is BARRED from AUTHENTIC-OPTIMAL by the classifier — 0 violations on fallback bands (T2) stays AUTHENTIC-BEST-ACHIEVABLE. Pinned by the suite.

### T20 determinism / anti-fixture

10 fresh direct runs of the same unconstrained Gelato — each on newly built inputs, with unrelated engine calculations (a dairy fixture + a −12 formulation) interleaved — produced **byte-identical** signatures (items, grams, POD/PAC/NPAC/ice, overall). The live store path (`createOptimizePreview` on the real `recipeStore`/`constraintStudioStore`) reproduces the same grams before AND after a save/reload through `loadRecipeInput`, and matches the pure direct path line-for-line. No fixture memory, no cross-run contamination.

### Notable engine findings (facts, no science changed)

1. **T9 disproof:** the owner's suspected 900 g false positive does NOT reproduce at commit `6f8e680` — the pipeline returns an honest 5/10 with 10 named soft violations and an honestly-reported iteration cap, never a fake "balanced" 10/10.
2. **T18 (−13):** the approved G18 template with the canonical demo compositions leaves `lactose_sandiness_risk` = 9.1256 marginally above its native band max 9 (sev 0.06). Real, reproducible, reported by the pipeline itself — a calibration observation for the owner, not repaired here (science freeze).
3. **T14/T19 (sorbet):** with the documented raspberry-surrogate fruit, S01-based results sit ~0.2–0.35 pp below the sorbet `ice_fraction` band min 51. Again reported honestly by the engine as hard residuals.
4. **T11/T12 equality:** MAX 500 chose exactly 500 — the bound binds at the optimum; the identical result to EXACT 500 is consistency, not caching (both recomputed independently; T20 proves no memory).

---

## Per-test full records (owner template)

### T1 — Strawberry EXACT lock 100 g — Fruit Gelato −11 °C / 1000 g

| Field | Value |
|---|---|
| Input | fruit_gelato @ -11 °C, target 1000 g — STRAWBERRIES · Fresh Fruit 100 g [grams] · Milk 3.5 % 0 g |
| Constraints | STRAWBERRIES · Fresh Fruit: EXACT 100 g |
| Selected profile | fruit_gelato @ -11 °C (mode classic) |
| Template | fruit_gelato_ref_v1 (reference_derived) |
| Target-band source | category_fallback → milk_gelato bands (calibration-pending) |
| Initial seed | template fruit_gelato_ref_v1 (reference_derived) mapped onto the user's selected identities |
| Solver mode | constrained_reformulation |
| Iterations | 2 |
| Stop reason | fixed_point_no_proposal |
| Final grams | STRAWBERRIES · Fresh Fruit 100 · Milk 3.5 % 363.4847 · Cream 30 % 356.1089 · Skimmed milk powder 38.2615 · Sucrose 105.2193 · Dextrose (monohydrate) 33.4789 · Tara gum 3.4467 |
| Batch total | 1000 g |
| POD | 14.1499 |
| PAC | 22.1195 |
| NPAC | 36.9081 |
| Ice fraction | 50.3748 % |
| Water | 63.4253 % |
| Total solids | 36.5747 % |
| Fat | 12.0161 % |
| Protein | 3.4777 % |
| Lactose | 4.9095 % |
| Stabilizer (tara) | 3.4467 g (0.3447 % mix), source: template_seed_auto_added (dawka kontrolowana przez szablon, adjustable=false); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 9/10 (85.4404/100) — Świetnie dopasowana [PROVISIONAL bands] |
| Violations | fat=12.0161 ∉ [5–12] (soft, sev 0.01) |
| Hard-safe | YES (no native-band violation) |
| Proportional-scaling detector | n/a (no unlocked baseline > 0 g) |
| Best-achievable proof | solver invoked 2×; trajectory r0:v4/s5.3 → r1:v1/s0; stop=fixed_point_no_proposal (provisional_band_conflict) |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → fruit_gelato_ref_v1 (reference_derived); src/engine/config/targets.ts → TARGET_BANDS cell for milk_gelato fallback serving fruit_gelato |
| **Verdict** | **AUTHENTIC-BEST-ACHIEVABLE** — Residual out-of-band metrics [fat] sit ONLY on provisional/fallback bands — best verified result for these ingredients/constraints. |

### T2 — Strawberry EXACT lock 200 g — Fruit Gelato −11 °C / 1000 g

| Field | Value |
|---|---|
| Input | fruit_gelato @ -11 °C, target 1000 g — STRAWBERRIES · Fresh Fruit 200 g [grams] · Milk 3.5 % 0 g |
| Constraints | STRAWBERRIES · Fresh Fruit: EXACT 200 g |
| Selected profile | fruit_gelato @ -11 °C (mode classic) |
| Template | fruit_gelato_ref_v1 (reference_derived) |
| Target-band source | category_fallback → milk_gelato bands (calibration-pending) |
| Initial seed | template fruit_gelato_ref_v1 (reference_derived) mapped onto the user's selected identities |
| Solver mode | constrained_reformulation |
| Iterations | 1 |
| Stop reason | all_bands_in_range |
| Final grams | STRAWBERRIES · Fresh Fruit 200 · Milk 3.5 % 366.5996 · Cream 30 % 251.0108 · Skimmed milk powder 38.5894 · Sucrose 106.1209 · Dextrose (monohydrate) 33.7657 · Tara gum 3.9136 |
| Batch total | 1000 g |
| POD | 14.7724 |
| PAC | 22.781 |
| NPAC | 36.4926 |
| Ice fraction | 50.8133 % |
| Water | 65.6437 % |
| Total solids | 34.3563 % |
| Fat | 8.9043 % |
| Protein | 3.3777 % |
| Lactose | 4.5947 % |
| Stabilizer (tara) | 3.9136 g (0.3914 % mix), source: template_seed_auto_added (dawka kontrolowana przez szablon, adjustable=false); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 9/10 (86.6823/100) — Świetnie dopasowana [PROVISIONAL bands] |
| Violations | none |
| Hard-safe | YES (no native-band violation) |
| Proportional-scaling detector | n/a (no unlocked baseline > 0 g) |
| Best-achievable proof | solver invoked 1×; trajectory r0:v4/s1.9 → r1:v0/s0; stop=all_bands_in_range |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → fruit_gelato_ref_v1 (reference_derived); src/engine/config/targets.ts → TARGET_BANDS cell for milk_gelato fallback serving fruit_gelato |
| **Verdict** | **AUTHENTIC-BEST-ACHIEVABLE** — 0 violations, but the profile is scored on PROVISIONAL (fallback/estimated) bands — honest partial validation, never presented as a validated native 10/10. |

### T3 — Strawberry EXACT lock 300 g — Fruit Gelato −11 °C / 1000 g

| Field | Value |
|---|---|
| Input | fruit_gelato @ -11 °C, target 1000 g — STRAWBERRIES · Fresh Fruit 300 g [grams] · Milk 3.5 % 0 g |
| Constraints | STRAWBERRIES · Fresh Fruit: EXACT 300 g |
| Selected profile | fruit_gelato @ -11 °C (mode classic) |
| Template | fruit_gelato_ref_v1 (reference_derived) |
| Target-band source | category_fallback → milk_gelato bands (calibration-pending) |
| Initial seed | template fruit_gelato_ref_v1 (reference_derived) mapped onto the user's selected identities |
| Solver mode | constrained_reformulation |
| Iterations | 1 |
| Stop reason | no_improving_move |
| Final grams | STRAWBERRIES · Fresh Fruit 300 · Milk 3.5 % 409.4574 · Cream 30 % 86.2016 · Skimmed milk powder 43.1008 · Sucrose 118.5271 · Dextrose (monohydrate) 37.7132 · Tara gum 5 |
| Batch total | 1000 g |
| POD | 16.8284 |
| PAC | 25.4441 |
| NPAC | 39.24 |
| Ice fraction | 47.9134 % |
| Water | 67.6053 % |
| Total solids | 32.3947 % |
| Fat | 4.1436 % |
| Protein | 3.418 % |
| Lactose | 4.4911 % |
| Stabilizer (tara) | 5 g (0.5 % mix), source: template_seed_auto_added (dawka kontrolowana przez szablon, adjustable=false); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 8/10 (83.2104/100) — Bardzo dobrze dopasowana [PROVISIONAL bands] |
| Violations | fat=4.1436 ∉ [5–12] (soft, sev 0.2447) |
| Hard-safe | YES (no native-band violation) |
| Proportional-scaling detector | n/a (no unlocked baseline > 0 g) |
| Best-achievable proof | solver invoked 1×; trajectory r0:v1/s0.2; stop=no_improving_move (provisional_band_conflict) |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → fruit_gelato_ref_v1 (reference_derived); src/engine/config/targets.ts → TARGET_BANDS cell for milk_gelato fallback serving fruit_gelato |
| **Verdict** | **AUTHENTIC-BEST-ACHIEVABLE** — Residual out-of-band metrics [fat] sit ONLY on provisional/fallback bands — best verified result for these ingredients/constraints. |

### T4 — Strawberry EXACT lock 400 g — Fruit Gelato −11 °C / 1000 g

| Field | Value |
|---|---|
| Input | fruit_gelato @ -11 °C, target 1000 g — STRAWBERRIES · Fresh Fruit 400 g [grams] · Milk 3.5 % 0 g |
| Constraints | STRAWBERRIES · Fresh Fruit: EXACT 400 g |
| Selected profile | fruit_gelato @ -11 °C (mode classic) |
| Template | fruit_gelato_ref_v1 (reference_derived) |
| Target-band source | category_fallback → milk_gelato bands (calibration-pending) |
| Initial seed | template fruit_gelato_ref_v1 (reference_derived) mapped onto the user's selected identities |
| Solver mode | constrained_reformulation |
| Iterations | 1 |
| Stop reason | no_improving_move |
| Final grams | STRAWBERRIES · Fresh Fruit 400 · Milk 3.5 % 350.5426 · Cream 30 % 73.7984 · Skimmed milk powder 36.8992 · Sucrose 101.4729 · Dextrose (monohydrate) 32.2868 · Tara gum 5 |
| Batch total | 1000 g |
| POD | 15.2134 |
| PAC | 22.9799 |
| NPAC | 34.0578 |
| Ice fraction | 53.3835 % |
| Water | 70.1987 % |
| Total solids | 29.8013 % |
| Fat | 3.5904 % |
| Protein | 3.098 % |
| Lactose | 3.8449 % |
| Stabilizer (tara) | 5 g (0.5 % mix), source: template_seed_auto_added (dawka kontrolowana przez szablon, adjustable=false); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 8/10 (76.3612/100) — Bardzo dobrze dopasowana [PROVISIONAL bands] |
| Violations | total_solids=29.8013 ∉ [31–45] (soft, sev 0.1712); water=70.1987 ∉ [57–70] (soft, sev 0.0306); fat=3.5904 ∉ [5–12] (soft, sev 0.4028); lactose=3.8449 ∉ [4–6] (soft, sev 0.1551) |
| Hard-safe | YES (no native-band violation) |
| Proportional-scaling detector | n/a (no unlocked baseline > 0 g) |
| Best-achievable proof | solver invoked 1×; trajectory r0:v4/s0.8; stop=no_improving_move (provisional_band_conflict) |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → fruit_gelato_ref_v1 (reference_derived); src/engine/config/targets.ts → TARGET_BANDS cell for milk_gelato fallback serving fruit_gelato |
| **Verdict** | **AUTHENTIC-BEST-ACHIEVABLE** — Residual out-of-band metrics [total_solids, water, fat, lactose] sit ONLY on provisional/fallback bands — best verified result for these ingredients/constraints. |

### T5 — Strawberry EXACT lock 500 g — Fruit Gelato −11 °C / 1000 g

| Field | Value |
|---|---|
| Input | fruit_gelato @ -11 °C, target 1000 g — STRAWBERRIES · Fresh Fruit 500 g [grams] · Milk 3.5 % 0 g |
| Constraints | STRAWBERRIES · Fresh Fruit: EXACT 500 g |
| Selected profile | fruit_gelato @ -11 °C (mode classic) |
| Template | fruit_gelato_ref_v1 (reference_derived) |
| Target-band source | category_fallback → milk_gelato bands (calibration-pending) |
| Initial seed | template fruit_gelato_ref_v1 (reference_derived) mapped onto the user's selected identities |
| Solver mode | constrained_reformulation |
| Iterations | 3 |
| Stop reason | fixed_point_no_proposal |
| Final grams | STRAWBERRIES · Fresh Fruit 500 · Milk 3.5 % 212.8516 · Cream 30 % 44.8109 · Skimmed milk powder 22.4054 · Sucrose 61.6149 · Dextrose (monohydrate) 63.4884 · Tara gum 3.6494 · Inulin 91.1794 |
| Batch total | 1000 g |
| POD | 13.6733 |
| PAC | 23.7739 |
| NPAC | 37.1273 |
| Ice fraction | 50.1434 % |
| Water | 65.5515 % |
| Total solids | 34.4485 % |
| Fat | 2.2572 % |
| Protein | 2.1897 % |
| Lactose | 2.3346 % |
| Stabilizer (tara) | 3.6494 g (0.3649 % mix), source: template_seed_auto_added (dawka kontrolowana przez szablon, adjustable=false); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 7/10 (73.7782/100) — Dobrze dopasowana [PROVISIONAL bands] |
| Violations | fat=2.2572 ∉ [5–12] (soft, sev 0.7836); protein_in_solids=6.3564 ∉ [9–13] (soft, sev 1.3218); aerating_protein=2.1897 ∉ [3–6] (soft, sev 0.5402); lactose=2.3346 ∉ [4–6] (soft, sev 1.6654); lactose_sandiness_risk=3.5615 ∉ [5–9] (soft, sev 0.7192) |
| Hard-safe | YES (no native-band violation) |
| Proportional-scaling detector | n/a (no unlocked baseline > 0 g) |
| Best-achievable proof | solver invoked 3×; trajectory r0:v8/s4.5 → r1:v7/s3 → r2:v5/s5; stop=fixed_point_no_proposal (provisional_band_conflict) |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → fruit_gelato_ref_v1 (reference_derived); src/engine/config/targets.ts → TARGET_BANDS cell for milk_gelato fallback serving fruit_gelato |
| **Verdict** | **AUTHENTIC-BEST-ACHIEVABLE** — Residual out-of-band metrics [fat, protein_in_solids, aerating_protein, lactose, lactose_sandiness_risk] sit ONLY on provisional/fallback bands — best verified result for these ingredients/constraints. |

### T6 — Strawberry EXACT lock 600 g — Fruit Gelato −11 °C / 1000 g

| Field | Value |
|---|---|
| Input | fruit_gelato @ -11 °C, target 1000 g — STRAWBERRIES · Fresh Fruit 600 g [grams] · Milk 3.5 % 0 g |
| Constraints | STRAWBERRIES · Fresh Fruit: EXACT 600 g |
| Selected profile | fruit_gelato @ -11 °C (mode classic) |
| Template | fruit_gelato_ref_v1 (reference_derived) |
| Target-band source | category_fallback → milk_gelato bands (calibration-pending) |
| Initial seed | template fruit_gelato_ref_v1 (reference_derived) mapped onto the user's selected identities |
| Solver mode | constrained_reformulation |
| Iterations | 3 |
| Stop reason | fixed_point_no_proposal |
| Final grams | STRAWBERRIES · Fresh Fruit 600 · Milk 3.5 % 140.7288 · Cream 30 % 29.6271 · Skimmed milk powder 14.8136 · Sucrose 40.7373 · Dextrose (monohydrate) 69.061 · Tara gum 3.0237 · Inulin 102.0086 |
| Batch total | 1000 g |
| POD | 12.4016 |
| PAC | 22.7052 |
| NPAC | 34.4739 |
| Ice fraction | 52.9442 % |
| Water | 66.9428 % |
| Total solids | 33.0572 % |
| Fat | 1.5732 % |
| Protein | 1.771 % |
| Lactose | 1.5436 % |
| Stabilizer (tara) | 3.0237 g (0.3024 % mix), source: template_seed_auto_added (dawka kontrolowana przez szablon, adjustable=false); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 7/10 (68.4243/100) — Dobrze dopasowana [PROVISIONAL bands] |
| Violations | fat=1.5732 ∉ [5–12] (soft, sev 0.9791); protein_in_solids=5.3574 ∉ [9–13] (soft, sev 1.8213); aerating_protein=1.771 ∉ [3–6] (soft, sev 0.8193); lactose=1.5436 ∉ [4–6] (soft, sev 2.4564); lactose_sandiness_risk=2.3058 ∉ [5–9] (soft, sev 1.3471) |
| Hard-safe | YES (no native-band violation) |
| Proportional-scaling detector | n/a (no unlocked baseline > 0 g) |
| Best-achievable proof | solver invoked 3×; trajectory r0:v9/s8.7 → r1:v7/s5.8 → r2:v5/s7.4; stop=fixed_point_no_proposal (provisional_band_conflict) |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → fruit_gelato_ref_v1 (reference_derived); src/engine/config/targets.ts → TARGET_BANDS cell for milk_gelato fallback serving fruit_gelato |
| **Verdict** | **AUTHENTIC-BEST-ACHIEVABLE** — Residual out-of-band metrics [fat, protein_in_solids, aerating_protein, lactose, lactose_sandiness_risk] sit ONLY on provisional/fallback bands — best verified result for these ingredients/constraints. |

### T7 — Strawberry EXACT lock 700 g — Fruit Gelato −11 °C / 1000 g

| Field | Value |
|---|---|
| Input | fruit_gelato @ -11 °C, target 1000 g — STRAWBERRIES · Fresh Fruit 700 g [grams] · Milk 3.5 % 0 g |
| Constraints | STRAWBERRIES · Fresh Fruit: EXACT 700 g |
| Selected profile | fruit_gelato @ -11 °C (mode classic) |
| Template | fruit_gelato_ref_v1 (reference_derived) |
| Target-band source | category_fallback → milk_gelato bands (calibration-pending) |
| Initial seed | template fruit_gelato_ref_v1 (reference_derived) mapped onto the user's selected identities |
| Solver mode | constrained_reformulation |
| Iterations | 2 |
| Stop reason | no_improving_move |
| Final grams | STRAWBERRIES · Fresh Fruit 700 · Milk 3.5 % 123.192 · Cream 30 % 25.9351 · Skimmed milk powder 12.9676 · Sucrose 35.6608 · Dextrose (monohydrate) 98.7004 · Tara gum 3.5441 |
| Batch total | 1000 g |
| POD | 14.4442 |
| PAC | 28.0221 |
| NPAC | 38.5686 |
| Ice fraction | 48.6221 % |
| Water | 73.5011 % |
| Total solids | 26.4989 % |
| Fat | 1.4296 % |
| Protein | 1.76 % |
| Lactose | 1.3512 % |
| Stabilizer (tara) | 3.5441 g (0.3544 % mix), source: template_seed_auto_added (dawka kontrolowana przez szablon, adjustable=false); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 7/10 (69.09/100) — Dobrze dopasowana [PROVISIONAL bands] |
| Violations | total_solids=26.4989 ∉ [31–45] (soft, sev 0.643); water=73.5011 ∉ [57–70] (soft, sev 0.5386); fat=1.4296 ∉ [5–12] (soft, sev 1.0201); protein_in_solids=6.642 ∉ [9–13] (soft, sev 1.179); aerating_protein=1.76 ∉ [3–6] (soft, sev 0.8266); lactose=1.3512 ∉ [4–6] (soft, sev 2.6488); lactose_sandiness_risk=1.8384 ∉ [5–9] (soft, sev 1.5808) |
| Hard-safe | YES (no native-band violation) |
| Proportional-scaling detector | n/a (no unlocked baseline > 0 g) |
| Best-achievable proof | solver invoked 2×; trajectory r0:v9/s13.5 → r1:v7/s8.4; stop=no_improving_move (provisional_band_conflict) |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → fruit_gelato_ref_v1 (reference_derived); src/engine/config/targets.ts → TARGET_BANDS cell for milk_gelato fallback serving fruit_gelato |
| **Verdict** | **AUTHENTIC-BEST-ACHIEVABLE** — Residual out-of-band metrics [total_solids, water, fat, protein_in_solids, aerating_protein, lactose, lactose_sandiness_risk] sit ONLY on provisional/fallback bands — best verified result for these ingredients/constraints. |

### T8 — Strawberry EXACT lock 800 g — Fruit Gelato −11 °C / 1000 g

| Field | Value |
|---|---|
| Input | fruit_gelato @ -11 °C, target 1000 g — STRAWBERRIES · Fresh Fruit 800 g [grams] · Milk 3.5 % 0 g |
| Constraints | STRAWBERRIES · Fresh Fruit: EXACT 800 g |
| Selected profile | fruit_gelato @ -11 °C (mode classic) |
| Template | fruit_gelato_ref_v1 (reference_derived) |
| Target-band source | category_fallback → milk_gelato bands (calibration-pending) |
| Initial seed | template fruit_gelato_ref_v1 (reference_derived) mapped onto the user's selected identities |
| Solver mode | constrained_reformulation |
| Iterations | 2 |
| Stop reason | fixed_point_no_proposal |
| Final grams | STRAWBERRIES · Fresh Fruit 800 · Milk 3.5 % 65.3217 · Cream 30 % 13.7519 · Skimmed milk powder 6.876 · Sucrose 18.9089 · Dextrose (monohydrate) 92.2985 · Tara gum 2.8429 |
| Batch total | 1000 g |
| POD | 12.7948 |
| PAC | 25.4291 |
| NPAC | 33.6056 |
| Ice fraction | 53.8608 % |
| Water | 76.1841 % |
| Total solids | 23.8159 % |
| Fat | 0.8867 % |
| Protein | 1.4479 % |
| Lactose | 0.7165 % |
| Stabilizer (tara) | 2.8429 g (0.2843 % mix), source: template_seed_auto_added (dawka kontrolowana przez szablon, adjustable=false); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 6/10 (64.3631/100) — Blisko optimum [PROVISIONAL bands] |
| Violations | total_solids=23.8159 ∉ [31–45] (soft, sev 1.0263); water=76.1841 ∉ [57–70] (soft, sev 0.9514); fat=0.8867 ∉ [5–12] (soft, sev 1.1752); protein_in_solids=6.0793 ∉ [9–13] (soft, sev 1.4603); aerating_protein=1.4479 ∉ [3–6] (soft, sev 1.0348); lactose=0.7165 ∉ [4–6] (soft, sev 3.2835); lactose_sandiness_risk=0.9405 ∉ [5–9] (soft, sev 2.0298) |
| Hard-safe | YES (no native-band violation) |
| Proportional-scaling detector | n/a (no unlocked baseline > 0 g) |
| Best-achievable proof | solver invoked 2×; trajectory r0:v9/s18.1 → r1:v7/s11; stop=fixed_point_no_proposal (provisional_band_conflict) |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → fruit_gelato_ref_v1 (reference_derived); src/engine/config/targets.ts → TARGET_BANDS cell for milk_gelato fallback serving fruit_gelato |
| **Verdict** | **AUTHENTIC-BEST-ACHIEVABLE** — Residual out-of-band metrics [total_solids, water, fat, protein_in_solids, aerating_protein, lactose, lactose_sandiness_risk] sit ONLY on provisional/fallback bands — best verified result for these ingredients/constraints. |

### T9 — Strawberry EXACT lock 900 g — Fruit Gelato −11 °C / 1000 g

| Field | Value |
|---|---|
| Input | fruit_gelato @ -11 °C, target 1000 g — STRAWBERRIES · Fresh Fruit 900 g [grams] · Milk 3.5 % 0 g |
| Constraints | STRAWBERRIES · Fresh Fruit: EXACT 900 g |
| Selected profile | fruit_gelato @ -11 °C (mode classic) |
| Template | fruit_gelato_ref_v1 (reference_derived) |
| Target-band source | category_fallback → milk_gelato bands (calibration-pending) |
| Initial seed | template fruit_gelato_ref_v1 (reference_derived) mapped onto the user's selected identities |
| Solver mode | constrained_reformulation |
| Iterations | 12 |
| Stop reason | iteration_cap |
| Final grams | STRAWBERRIES · Fresh Fruit 900 · Milk 3.5 % 0.2149 · Cream 30 % 0.0452 · Skimmed milk powder 0.0226 · Sucrose 0.0622 · Dextrose (monohydrate) 99.6359 · Tara gum 0.0192 |
| Batch total | 1000 g |
| POD | 11.8586 |
| PAC | 24.9489 |
| NPAC | 31.897 |
| Ice fraction | 55.6643 % |
| Water | 78.2191 % |
| Total solids | 21.7809 % |
| Fat | 0.2721 % |
| Protein | 1.0816 % |
| Lactose | 0.0024 % |
| Stabilizer (tara) | 0.0192 g (0.0019 % mix), source: template_seed_auto_added (dawka kontrolowana przez szablon, adjustable=false); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 5/10 (53.8735/100) — Wymaga korekty [PROVISIONAL bands] |
| Violations | ice_fraction=55.6643 ∉ [45–54.5] (soft, sev 0.2451); npac=31.897 ∉ [33–42] (soft, sev 0.2451); pod=11.8586 ∉ [12–17] (soft, sev 0.0566); total_solids=21.7809 ∉ [31–45] (soft, sev 1.317); water=78.2191 ∉ [57–70] (soft, sev 1.2645); fat=0.2721 ∉ [5–12] (soft, sev 1.3508); protein_in_solids=4.9658 ∉ [9–13] (soft, sev 2.0171); aerating_protein=1.0816 ∉ [3–6] (soft, sev 1.2789); lactose=0.0024 ∉ [4–6] (soft, sev 3.9976); lactose_sandiness_risk=0.003 ∉ [5–9] (soft, sev 2.4985) |
| Hard-safe | YES (no native-band violation) |
| Proportional-scaling detector | n/a (no unlocked baseline > 0 g) |
| Best-achievable proof | solver invoked 12×; trajectory r0:v10/s22.6 → r1:v10/s17.5 → r2:v10/s16 → r3:v10/s15.3 → r4:v10/s14.9 → r5:v10/s14.7 → r6:v10/s14.5 → r7:v10/s14.4 → r8:v10/s14.4 → r9:v10/s14.3 → r10:v10/s14.3 → r11:v10/s14.3 → r12:v10/s14.3; stop=iteration_cap; CAP HIT (reported honestly) |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → fruit_gelato_ref_v1 (reference_derived); src/engine/config/targets.ts → TARGET_BANDS cell for milk_gelato fallback serving fruit_gelato |
| **Verdict** | **AUTHENTIC-BEST-ACHIEVABLE** — Residual out-of-band metrics [ice_fraction, npac, pod, total_solids, water, fat, protein_in_solids, aerating_protein, lactose, lactose_sandiness_risk] sit ONLY on provisional/fallback bands — best verified result for these ingredients/constraints. |

### T10 — Strawberry 0 g + Milk 0 g unlocked — full formulation, actual optimum

| Field | Value |
|---|---|
| Input | fruit_gelato @ -11 °C, target 1000 g — Milk 3.5 % 0 g · STRAWBERRIES · Fresh Fruit 0 g |
| Constraints | none (unconstrained) |
| Selected profile | fruit_gelato @ -11 °C (mode classic) |
| Template | fruit_gelato_ref_v1 (reference_derived) |
| Target-band source | category_fallback → milk_gelato bands (calibration-pending) |
| Initial seed | template fruit_gelato_ref_v1 (reference_derived) mapped onto the user's selected identities |
| Solver mode | full_formulation |
| Iterations | 1 |
| Stop reason | fixed_point_no_proposal |
| Final grams | STRAWBERRIES · Fresh Fruit 350 · Milk 3.5 % 380 · Cream 30 % 80 · Skimmed milk powder 40 · Sucrose 110 · Dextrose (monohydrate) 35 · Tara gum 5 |
| Batch total | 1000 g |
| POD | 16.0209 |
| PAC | 24.212 |
| NPAC | 36.6001 |
| Ice fraction | 50.6999 % |
| Water | 68.902 % |
| Total solids | 31.098 % |
| Fat | 3.867 % |
| Protein | 3.258 % |
| Lactose | 4.168 % |
| Stabilizer (tara) | 5 g (0.5 % mix), source: template_seed_auto_added (dawka kontrolowana przez szablon, adjustable=false); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 8/10 (82.1399/100) — Bardzo dobrze dopasowana [PROVISIONAL bands] |
| Violations | fat=3.867 ∉ [5–12] (soft, sev 0.3237) |
| Hard-safe | YES (no native-band violation) |
| Proportional-scaling detector | n/a (no unlocked baseline > 0 g) |
| Best-achievable proof | solver invoked 1×; trajectory r0:v1/s0.3; stop=fixed_point_no_proposal (provisional_band_conflict) |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → fruit_gelato_ref_v1 (reference_derived); src/engine/config/targets.ts → TARGET_BANDS cell for milk_gelato fallback serving fruit_gelato |
| **Verdict** | **AUTHENTIC-BEST-ACHIEVABLE** — Residual out-of-band metrics [fat] sit ONLY on provisional/fallback bands — best verified result for these ingredients/constraints. |

### T11 — Milk EXACT 500 g (owner fixture, 1120 g draft) — rest optimized, not scaled

| Field | Value |
|---|---|
| Input | fruit_gelato @ -11 °C, target 1000 g — STRAWBERRIES · Fresh Fruit 350 g · Milk 3.5 % 500 g [grams] · Cream 30 % 80 g · Skimmed milk powder 40 g · Sucrose 110 g · Dextrose 35 g · Tara gum 5 g · Water 0 g |
| Constraints | Milk 3.5 %: EXACT 500 g |
| Selected profile | fruit_gelato @ -11 °C (mode classic) |
| Template | fruit_gelato_ref_v1 (reference_derived) |
| Target-band source | category_fallback → milk_gelato bands (calibration-pending) |
| Initial seed | template fruit_gelato_ref_v1 (reference_derived) mapped onto the user's selected identities |
| Solver mode | constrained_reformulation |
| Iterations | 2 |
| Stop reason | no_improving_move |
| Final grams | STRAWBERRIES · Fresh Fruit 252.6773 · Milk 3.5 % 500 · Cream 30 % 57.7548 · Skimmed milk powder 28.8774 · Sucrose 79.4129 · Dextrose 76.7929 · Tara gum 4.4847 · Water 0 |
| Batch total | 1000 g |
| POD | 15.2472 |
| PAC | 27.5693 |
| NPAC | 40.8515 |
| Ice fraction | 46.2124 % |
| Water | 69.9111 % |
| Total solids | 30.0889 % |
| Fat | 3.5815 % |
| Protein | 3.0968 % |
| Lactose | 4.0922 % |
| Stabilizer (tara) | 4.4847 g (0.4485 % mix), source: user_line_solver_or_lock (zmieniona względem draftu); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 8/10 (81.777/100) — Bardzo dobrze dopasowana [PROVISIONAL bands] |
| Violations | total_solids=30.0889 ∉ [31–45] (soft, sev 0.1302); fat=3.5815 ∉ [5–12] (soft, sev 0.4053) |
| Hard-safe | YES (no native-band violation) |
| Proportional-scaling detector | not detected (STRAWBERRIES:0.7219, Cream:0.7219, Skimmed:0.7219, Sucrose:0.7219, Dextrose:2.1941, Tara:0.8969) |
| Best-achievable proof | solver invoked 2×; trajectory r0:v5/s2.7 → r1:v2/s0.5; stop=no_improving_move (provisional_band_conflict) |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → fruit_gelato_ref_v1 (reference_derived); src/engine/config/targets.ts → TARGET_BANDS cell for milk_gelato fallback serving fruit_gelato |
| **Verdict** | **AUTHENTIC-BEST-ACHIEVABLE** — Residual out-of-band metrics [total_solids, fat] sit ONLY on provisional/fallback bands — best verified result for these ingredients/constraints. |

### T12 — Milk MAX 500 g (range 0–500) — solver may use less

| Field | Value |
|---|---|
| Input | fruit_gelato @ -11 °C, target 1000 g — STRAWBERRIES · Fresh Fruit 350 g · Milk 3.5 % 500 g [grams] · Cream 30 % 80 g · Skimmed milk powder 40 g · Sucrose 110 g · Dextrose 35 g · Tara gum 5 g · Water 0 g |
| Constraints | Milk 3.5 %: RANGE 0–500 g |
| Selected profile | fruit_gelato @ -11 °C (mode classic) |
| Template | fruit_gelato_ref_v1 (reference_derived) |
| Target-band source | category_fallback → milk_gelato bands (calibration-pending) |
| Initial seed | template fruit_gelato_ref_v1 (reference_derived) mapped onto the user's selected identities |
| Solver mode | constrained_reformulation |
| Iterations | 2 |
| Stop reason | no_improving_move |
| Final grams | STRAWBERRIES · Fresh Fruit 252.6773 · Milk 3.5 % 500 · Cream 30 % 57.7548 · Skimmed milk powder 28.8774 · Sucrose 79.4129 · Dextrose 76.7929 · Tara gum 4.4847 · Water 0 |
| Batch total | 1000 g |
| POD | 15.2472 |
| PAC | 27.5693 |
| NPAC | 40.8515 |
| Ice fraction | 46.2124 % |
| Water | 69.9111 % |
| Total solids | 30.0889 % |
| Fat | 3.5815 % |
| Protein | 3.0968 % |
| Lactose | 4.0922 % |
| Stabilizer (tara) | 4.4847 g (0.4485 % mix), source: user_line_solver_or_lock (zmieniona względem draftu); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 8/10 (81.777/100) — Bardzo dobrze dopasowana [PROVISIONAL bands] |
| Violations | total_solids=30.0889 ∉ [31–45] (soft, sev 0.1302); fat=3.5815 ∉ [5–12] (soft, sev 0.4053) |
| Hard-safe | YES (no native-band violation) |
| Proportional-scaling detector | not detected (STRAWBERRIES:0.7219, Cream:0.7219, Skimmed:0.7219, Sucrose:0.7219, Dextrose:2.1941, Tara:0.8969) |
| Best-achievable proof | solver invoked 2×; trajectory r0:v5/s2.7 → r1:v2/s0.5; stop=no_improving_move (provisional_band_conflict) |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → fruit_gelato_ref_v1 (reference_derived); src/engine/config/targets.ts → TARGET_BANDS cell for milk_gelato fallback serving fruit_gelato |
| **Verdict** | **AUTHENTIC-BEST-ACHIEVABLE** — Residual out-of-band metrics [total_solids, fat] sit ONLY on provisional/fallback bands — best verified result for these ingredients/constraints. |

### T13 — Strawberry RANGE 250–400 g — engine picks the optimum inside the range

| Field | Value |
|---|---|
| Input | fruit_gelato @ -11 °C, target 1000 g — STRAWBERRIES · Fresh Fruit 0 g · Milk 3.5 % 0 g |
| Constraints | STRAWBERRIES · Fresh Fruit: RANGE 250–400 g |
| Selected profile | fruit_gelato @ -11 °C (mode classic) |
| Template | fruit_gelato_ref_v1 (reference_derived) |
| Target-band source | category_fallback → milk_gelato bands (calibration-pending) |
| Initial seed | template fruit_gelato_ref_v1 (reference_derived) mapped onto the user's selected identities |
| Solver mode | constrained_reformulation |
| Iterations | 1 |
| Stop reason | fixed_point_no_proposal |
| Final grams | STRAWBERRIES · Fresh Fruit 350 · Milk 3.5 % 380 · Cream 30 % 80 · Skimmed milk powder 40 · Sucrose 110 · Dextrose (monohydrate) 35 · Tara gum 5 |
| Batch total | 1000 g |
| POD | 16.0209 |
| PAC | 24.212 |
| NPAC | 36.6001 |
| Ice fraction | 50.6999 % |
| Water | 68.902 % |
| Total solids | 31.098 % |
| Fat | 3.867 % |
| Protein | 3.258 % |
| Lactose | 4.168 % |
| Stabilizer (tara) | 5 g (0.5 % mix), source: template_seed_auto_added (dawka kontrolowana przez szablon, adjustable=false); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 8/10 (82.1399/100) — Bardzo dobrze dopasowana [PROVISIONAL bands] |
| Violations | fat=3.867 ∉ [5–12] (soft, sev 0.3237) |
| Hard-safe | YES (no native-band violation) |
| Proportional-scaling detector | n/a (no unlocked baseline > 0 g) |
| Best-achievable proof | solver invoked 1×; trajectory r0:v1/s0.3; stop=fixed_point_no_proposal (provisional_band_conflict) |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → fruit_gelato_ref_v1 (reference_derived); src/engine/config/targets.ts → TARGET_BANDS cell for milk_gelato fallback serving fruit_gelato |
| **Verdict** | **AUTHENTIC-BEST-ACHIEVABLE** — Residual out-of-band metrics [fat] sit ONLY on provisional/fallback bands — best verified result for these ingredients/constraints. |

### T14 — Inulin unavailable (locked 0) — the owner sorbet fixture, 944.6 g draft

| Field | Value |
|---|---|
| Input | sorbet @ -11 °C, target 1000 g — STRAWBERRIES · Fresh Fruit 600 g · Water 181 g · Sucrose 103.8 g · Dextrose 59 g · Inulin 0 g [grams] · Tara gum 0.8 g |
| Constraints | Inulin: EXACT 0 g |
| Selected profile | sorbet @ -11 °C (mode classic) |
| Template | S01 (approved) |
| Target-band source | native seeded bands |
| Initial seed | template S01 (approved) mapped onto the user's selected identities |
| Solver mode | constrained_reformulation |
| Iterations | 1 |
| Stop reason | fixed_point_no_proposal |
| Final grams | STRAWBERRIES · Fresh Fruit 635.2193 · Water 191.6245 · Sucrose 109.8929 · Dextrose 62.4632 · Inulin 0 · Tara gum 0.8 |
| Batch total | 1000 g |
| POD | 18.8193 |
| PAC | 27.2183 |
| NPAC | 36.6327 |
| Ice fraction | 50.6655 % |
| Water | 74.3006 % |
| Total solids | 25.6994 % |
| Fat | 0.1906 % |
| Protein | 0.7623 % |
| Lactose | 0 % |
| Stabilizer (tara) | 0.8 g (0.08 % mix), source: user_line_template_dose (odziedziczona, niezmieniona); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 7/10 (70.8265/100) — Dobrze dopasowana [native bands] |
| Violations | ice_fraction=50.6655 ∉ [51–59] (hard, sev 0.0836) |
| Hard-safe | NO — hard residual(s) honestly reported |
| Proportional-scaling detector | DETECTED — shared factor 1.0587 on 4/5 lines |
| Best-achievable proof | solver invoked 1×; trajectory r0:v1/s0.1; stop=fixed_point_no_proposal (missing_candidate) |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → S01 (approved); src/engine/config/targets.ts → TARGET_BANDS cell for sorbet @ -11 °C |
| **Verdict** | **AUTHENTIC-BEST-ACHIEVABLE** — PROPORTIONAL SCALING DETECTED (factor 1.0587 on 4/5 unlocked lines) — legitimate HERE because explicit constraints bind and the solver verified no admissible improving move (the constrained optimum may equal the proportional projection; per-100 g composition is invariant under it). | Constrained optimum: hard-band residuals [ice_fraction] remain because explicit user constraints bind — surfaced honestly, never hidden. |

### T15 — SMP EXACT 0 g on the complete Fruit Gelato — reformulate or prove impossible

| Field | Value |
|---|---|
| Input | fruit_gelato @ -11 °C, target 1000 g — STRAWBERRIES · Fresh Fruit 350 g · Milk 3.5 % 380 g · Cream 30 % 80 g · Skimmed milk powder 0 g [grams] · Sucrose 110 g · Dextrose 35 g · Tara gum 5 g |
| Constraints | Skimmed milk powder: EXACT 0 g |
| Selected profile | fruit_gelato @ -11 °C (mode classic) |
| Template | fruit_gelato_ref_v1 (reference_derived) |
| Target-band source | category_fallback → milk_gelato bands (calibration-pending) |
| Initial seed | template fruit_gelato_ref_v1 (reference_derived) mapped onto the user's selected identities |
| Solver mode | constrained_reformulation |
| Iterations | 4 |
| Stop reason | fixed_point_no_proposal |
| Final grams | STRAWBERRIES · Fresh Fruit 318.6355 · Milk 3.5 % 345.9471 · Cream 30 % 72.831 · Skimmed milk powder 0 · Sucrose 63.22 · Dextrose 60.6913 · Tara gum 4.3689 · Inulin 134.3061 |
| Batch total | 1000 g |
| POD | 12.5526 |
| PAC | 21.4955 |
| NPAC | 34.6228 |
| Ice fraction | 52.787 % |
| Water | 63.5 % |
| Total solids | 36.5 % |
| Fat | 3.4913 % |
| Protein | 1.6915 % |
| Lactose | 1.9009 % |
| Stabilizer (tara) | 4.3689 g (0.4369 % mix), source: user_line_solver_or_lock (zmieniona względem draftu); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 7/10 (72.6138/100) — Dobrze dopasowana [PROVISIONAL bands] |
| Violations | fat=3.4913 ∉ [5–12] (soft, sev 0.431); protein_in_solids=4.6342 ∉ [9–13] (soft, sev 2.1829); aerating_protein=1.6915 ∉ [3–6] (soft, sev 0.8723); lactose=1.9009 ∉ [4–6] (soft, sev 2.0991); lactose_sandiness_risk=2.9935 ∉ [5–9] (soft, sev 1.0032) |
| Hard-safe | YES (no native-band violation) |
| Proportional-scaling detector | not detected (STRAWBERRIES:0.9104, Milk:0.9104, Cream:0.9104, Sucrose:0.5747, Dextrose:1.734, Tara:0.8738) |
| Best-achievable proof | solver invoked 4×; trajectory r0:v9/s5.5 → r1:v7/s5.9 → r2:v7/s5.6 → r3:v5/s6.6; stop=fixed_point_no_proposal (provisional_band_conflict) |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → fruit_gelato_ref_v1 (reference_derived); src/engine/config/targets.ts → TARGET_BANDS cell for milk_gelato fallback serving fruit_gelato |
| **Verdict** | **AUTHENTIC-BEST-ACHIEVABLE** — Residual out-of-band metrics [fat, protein_in_solids, aerating_protein, lactose, lactose_sandiness_risk] sit ONLY on provisional/fallback bands — best verified result for these ingredients/constraints. |

### T16 — Sucrose unavailable (excluded) — no silent substitution allowed

| Field | Value |
|---|---|
| Input | fruit_gelato @ -11 °C, target 1000 g — Milk 3.5 % 0 g · STRAWBERRIES · Fresh Fruit 0 g · EXCLUDED: sucrose |
| Constraints | none (unconstrained) |
| Selected profile | fruit_gelato @ -11 °C (mode classic) |
| Template | fruit_gelato_ref_v1 (reference_derived) |
| Target-band source | category_fallback → milk_gelato bands (calibration-pending) |
| Initial seed | template fruit_gelato_ref_v1 (reference_derived) mapped onto the user's selected identities |
| Solver mode | full_formulation |
| Iterations | — |
| Stop reason | missing_required_role |
| Final grams | n/a (no proposal — draft untouched) |
| Batch total | 0 g |
| POD | — |
| PAC | — |
| NPAC | — |
| Ice fraction | — % |
| Water | 0 % |
| Total solids | 0 % |
| Fat | 0 % |
| Protein | 0 % |
| Lactose | 0 % |
| Stabilizer (tara) | absent |
| Score | Brak danych (honest null) |
| Violations | none |
| Hard-safe | YES (no native-band violation) |
| Proportional-scaling detector | n/a (no unlocked baseline > 0 g) |
| Best-achievable proof | no solver iteration recorded for this outcome |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → fruit_gelato_ref_v1 (reference_derived); src/engine/config/targets.ts → TARGET_BANDS cell for milk_gelato fallback serving fruit_gelato |
| **Verdict** | **HONEST-IMPOSSIBLE** — Hard technological role 'sweetener_sucrose' cannot be filled (excluded/locked out) — refused with the exact Polish explanation, no silent substitution. |

### T17 — Gelato −12 °C unconstrained (native milk_gelato profile)

| Field | Value |
|---|---|
| Input | milk_gelato @ -12 °C, target 1000 g — Milk 3.5 % 0 g |
| Constraints | none (unconstrained) |
| Selected profile | milk_gelato @ -12 °C (mode classic) |
| Template | milk_base_g17_minus12_v1 (approved) |
| Target-band source | native seeded bands |
| Initial seed | template milk_base_g17_minus12_v1 (approved) mapped onto the user's selected identities |
| Solver mode | full_formulation |
| Iterations | 0 |
| Stop reason | all_bands_in_range |
| Final grams | Milk 3.5 % 600 · Cream 30 % 135 · Skimmed milk powder 43 · Sucrose 86 · Dextrose (monohydrate) 80 · Inulin 54.1 · Tara gum 1.9 |
| Batch total | 1000 g |
| POD | 14.9362 |
| PAC | 28.1455 |
| NPAC | 47.4851 |
| Ice fraction | 50.3291 % |
| Water | 62.1428 % |
| Total solids | 37.8572 % |
| Fat | 6.1844 % |
| Protein | 3.7955 % |
| Lactose | 5.5615 % |
| Stabilizer (tara) | 1.9 g (0.19 % mix), source: template_seed_auto_added (dawka kontrolowana przez szablon, adjustable=false); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 9/10 (88.1667/100) — Świetnie dopasowana [native bands] |
| Violations | none |
| Hard-safe | YES (no native-band violation) |
| Proportional-scaling detector | n/a (no unlocked baseline > 0 g) |
| Best-achievable proof | solver invoked 0×; trajectory r0:v0/s0; stop=all_bands_in_range |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → milk_base_g17_minus12_v1 (approved); src/engine/config/targets.ts → TARGET_BANDS cell for milk_gelato @ -12 °C |
| **Verdict** | **AUTHENTIC-OPTIMAL** — 0 violations on NATIVE approved bands — verified optimum. |

### T18 — Gelato −13 °C unconstrained (native milk_gelato profile)

| Field | Value |
|---|---|
| Input | milk_gelato @ -13 °C, target 1000 g — Milk 3.5 % 0 g |
| Constraints | none (unconstrained) |
| Selected profile | milk_gelato @ -13 °C (mode classic) |
| Template | milk_base_g18_minus13_v1 (approved) |
| Target-band source | native seeded bands |
| Initial seed | template milk_base_g18_minus13_v1 (approved) mapped onto the user's selected identities |
| Solver mode | full_formulation |
| Iterations | 1 |
| Stop reason | fixed_point_no_proposal |
| Final grams | Milk 3.5 % 600.0001 · Cream 30 % 125 · Skimmed milk powder 45 · Sucrose 72 · Dextrose (monohydrate) 112 · Inulin 44.1 · Tara gum 1.8998 |
| Batch total | 1000 g |
| POD | 15.7262 |
| PAC | 32.4101 |
| NPAC | 54.7373 |
| Ice fraction | 49.644 % |
| Water | 61.7218 % |
| Total solids | 38.2782 % |
| Fat | 5.886 % |
| Protein | 3.8425 % |
| Lactose | 5.6325 % |
| Stabilizer (tara) | 1.8998 g (0.19 % mix), source: template_seed_auto_added (dawka kontrolowana przez szablon, adjustable=false); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 9/10 (86.1457/100) — Świetnie dopasowana [native bands] |
| Violations | lactose_sandiness_risk=9.1256 ∉ [5–9] (hard, sev 0.0628) |
| Hard-safe | NO — hard residual(s) honestly reported |
| Proportional-scaling detector | n/a (no unlocked baseline > 0 g) |
| Best-achievable proof | solver invoked 1×; trajectory r0:v1/s0.1; stop=fixed_point_no_proposal (missing_candidate) |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → milk_base_g18_minus13_v1 (approved); src/engine/config/targets.ts → TARGET_BANDS cell for milk_gelato @ -13 °C |
| **Verdict** | **AUTHENTIC-BEST-ACHIEVABLE** — Native-band PROVEN FIXED POINT: solver really attempted moves (1×, stop=fixed_point_no_proposal) and residual hard metrics [lactose_sandiness_risk] are reported, not hidden. |

### T19 — Sorbet from Strawberry 0 g unlocked — no dairy anywhere

| Field | Value |
|---|---|
| Input | sorbet @ -11 °C, target 1000 g — STRAWBERRIES · Fresh Fruit 0 g |
| Constraints | none (unconstrained) |
| Selected profile | sorbet @ -11 °C (mode classic) |
| Template | S01 (approved) |
| Target-band source | native seeded bands |
| Initial seed | template S01 (approved) mapped onto the user's selected identities |
| Solver mode | full_formulation |
| Iterations | 1 |
| Stop reason | fixed_point_no_proposal |
| Final grams | STRAWBERRIES · Fresh Fruit 600 · Water 181 · Sucrose 103.8 · Dextrose (monohydrate) 59 · Inulin 55.4 · Tara gum 0.8 |
| Batch total | 1000 g |
| POD | 17.7759 |
| PAC | 25.7092 |
| NPAC | 36.4884 |
| Ice fraction | 50.8178 % |
| Water | 70.4586 % |
| Total solids | 29.5414 % |
| Fat | 0.18 % |
| Protein | 0.72 % |
| Lactose | 0 % |
| Stabilizer (tara) | 0.8 g (0.08 % mix), source: template_seed_auto_added (dawka kontrolowana przez szablon, adjustable=false); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 7/10 (71.0051/100) — Dobrze dopasowana [native bands] |
| Violations | ice_fraction=50.8178 ∉ [51–59] (hard, sev 0.0455) |
| Hard-safe | NO — hard residual(s) honestly reported |
| Proportional-scaling detector | n/a (no unlocked baseline > 0 g) |
| Best-achievable proof | solver invoked 1×; trajectory r0:v1/s0; stop=fixed_point_no_proposal (missing_candidate) |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → S01 (approved); src/engine/config/targets.ts → TARGET_BANDS cell for sorbet @ -11 °C |
| **Verdict** | **AUTHENTIC-BEST-ACHIEVABLE** — Native-band PROVEN FIXED POINT: solver really attempted moves (1×, stop=fixed_point_no_proposal) and residual hard metrics [ice_fraction] are reported, not hidden. |

### T20 — Repeatability / anti-fixture: the T10 unconstrained Gelato 10× fresh, interleaved with unrelated calcs, plus store save/reload (test layer)

| Field | Value |
|---|---|
| Input | fruit_gelato @ -11 °C, target 1000 g — Milk 3.5 % 0 g · STRAWBERRIES · Fresh Fruit 0 g |
| Constraints | none (unconstrained) |
| Selected profile | fruit_gelato @ -11 °C (mode classic) |
| Template | fruit_gelato_ref_v1 (reference_derived) |
| Target-band source | category_fallback → milk_gelato bands (calibration-pending) |
| Initial seed | template fruit_gelato_ref_v1 (reference_derived) mapped onto the user's selected identities |
| Solver mode | full_formulation |
| Iterations | 1 |
| Stop reason | fixed_point_no_proposal |
| Final grams | STRAWBERRIES · Fresh Fruit 350 · Milk 3.5 % 380 · Cream 30 % 80 · Skimmed milk powder 40 · Sucrose 110 · Dextrose (monohydrate) 35 · Tara gum 5 |
| Batch total | 1000 g |
| POD | 16.0209 |
| PAC | 24.212 |
| NPAC | 36.6001 |
| Ice fraction | 50.6999 % |
| Water | 68.902 % |
| Total solids | 31.098 % |
| Fat | 3.867 % |
| Protein | 3.258 % |
| Lactose | 4.168 % |
| Stabilizer (tara) | 5 g (0.5 % mix), source: template_seed_auto_added (dawka kontrolowana przez szablon, adjustable=false); engine stabilizer metric: NO; „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana przez Engine.” |
| Score | 8/10 (82.1399/100) — Bardzo dobrze dopasowana [PROVISIONAL bands] |
| Violations | fat=3.867 ∉ [5–12] (soft, sev 0.3237) |
| Hard-safe | YES (no native-band violation) |
| Proportional-scaling detector | n/a (no unlocked baseline > 0 g) |
| Best-achievable proof | solver invoked 1×; trajectory r0:v1/s0.3; stop=fixed_point_no_proposal (provisional_band_conflict) |
| Runtime reference data | src/data/demoIngredients.ts (canonical literature compositions; strawberry = documented raspberry surrogate PI-ING-001553); src/features/formulation/templateRegistry.ts → fruit_gelato_ref_v1 (reference_derived); src/engine/config/targets.ts → TARGET_BANDS cell for milk_gelato fallback serving fruit_gelato |
| **Verdict** | **AUTHENTIC-BEST-ACHIEVABLE** — Residual out-of-band metrics [fat] sit ONLY on provisional/fallback bands — best verified result for these ingredients/constraints. — T20: 10/10 fresh direct runs byte-identical (unrelated calcs interleaved). |


---

AGENT 2 — CODE_COMPLETE
