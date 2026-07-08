# Temperature-aware Target Bands — plan, audit & migration

_Created 2026-07-08 (Spine Slice 12). Companion to [PINGUINO_SPINE.md](../PINGUINO_SPINE.md).
This documents the **gap** between the engine's live `TARGET_BANDS` (what the correction solver
targets today) and the locked **Temperature Regulator** bands (what it should target per product ×
serving temperature), plus a safe migration path. **Nothing here is live**: Slice 12 ships a
non-live SHADOW comparison only (`src/features/optimization/temperatureAwareTargetBands.ts`)._

Neutral-wording rule: never name external benchmark tools in code/docs — say **calibration data** /
**reference dataset**.

---

## 1. Current live limitation

- The engine's `src/engine/config/targets.ts` `TARGET_BANDS` seeds **exactly one** band:
  `milk_gelato @ −11 °C`.
- `selectTargetBand(category, temperature)` (statuses.ts) falls back for everything else:
  category → `milk_gelato` (`category_fallback: true`), temperature → nearest seeded (only −11,
  `temperature_fallback: true`). No fake bands are invented.
- The correction solver (`src/engine/corrections/solver.ts` → `detectViolations`) targets
  `result.indicators[].band`, i.e. the selected `TARGET_BANDS` band. So **the solver always aims at
  the milk_gelato −11 band**, regardless of the recipe's real profile/temperature.
- The **Temperature Regulator** (`src/spine/temperatureRegulator.ts`) has distinct locked bands per
  profile × temperature. The regulator *evaluation* is correct; only the solver *target* lags.

## 2. Shadow source (this slice — not live)

`temperatureAwareTargetBands.ts` exposes the regulator bands as
`temperature_regulator_shadow` and compares them, read-only, against `selectTargetBand`. It never
mutates `TARGET_BANDS`, never touches `calculateRecipe`, and is not wired into the solver. Status per
profile×temperature: `aligned` (engine used the real band, no fallback), `divergent`,
`missing_engine_band`, `missing_shadow_band`, `unsupported_profile`, `unsupported_temperature`.

## 3. Audit — regulator (shadow) NPAC band vs current engine target

Engine target is `milk_gelato @ −11` (NPAC `[33,42]`, center 37.5) for **every** cell via fallback,
except `standard_gelato @ −11` which selects it directly. `Δcenter` = |engine center − regulator center|.

| Profile | Temp | Regulator NPAC (clean center) | Engine band used | Fallback | Δcenter |
|---|---|---|---|---|---|
| standard_gelato | −11 | [33,43] (39–41) | milk_gelato −11 [33,42] | none | ~0.5 (near-aligned) |
| standard_gelato | −12 | [42,50] (45–46.2) | milk_gelato −11 [33,42] | temperature | ~8.5 |
| standard_gelato | −13 | [48,55] (51.5–53.2) | milk_gelato −11 [33,42] | temperature | ~14.0 |
| chocolate_gelato | −11 | [34,45] (40–42) | milk_gelato −11 [33,42] | category | ~2.0 |
| chocolate_gelato | −12 | [43,52] (47–49.5) | milk_gelato −11 [33,42] | category+temperature | ~10.0 |
| chocolate_gelato | −13 | [49,57] (49.8–54.1) | milk_gelato −11 [33,42] | category+temperature | ~15.5 |
| sorbet | −11 | [35,40] (37–38) | milk_gelato −11 [33,42] | category | ~0.0–2.0 |
| sorbet | −12 | [42,49] (44–45) | milk_gelato −11 [33,42] | category+temperature | ~8.0 |
| sorbet | −13 | [48,55] (51–52.5) | milk_gelato −11 [33,42] | category+temperature | ~14.0 |
| vegan_gelato | −11 | [35,52] (40–47) | milk_gelato −11 [33,42] | category | ~6.0 |
| vegan_gelato | −12 | [44,59] (48–54) | milk_gelato −11 [33,42] | category+temperature | ~14.0 |
| vegan_gelato | −13 | [50,64] (53.5–60) | milk_gelato −11 [33,42] | category+temperature | ~19.5 |

Other metrics per cell (POD / ice fraction / fat / total solids / water / lactose / lactose sanding /
aerating protein / protein share) are enumerated in `temperatureRegulator.ts` and surfaced by
`shadowTargetBands(profile, temp).metricBands`. **Gate levels** come from the Product Profile Registry:
dairy gates (lactose, lactose_sanding, aerating_protein, protein_share) are **disabled** for
sorbet/vegan; **chocolate protein-share is advisory (hard-minimum 7), never a hard gate**. No band here
is invented — all values are transcribed from the locked regulator settings.

**Only `standard_gelato @ −11` is (near-)aligned; the other 11 cells are divergent** (the solver is on
the −11/category fallback).

## 3b. Solver-injected target — PREVIEW prototype (Slice 13, not live)

`src/features/optimization/solverTargetInjection.ts` prototypes migration path (2) below **in preview
only**, proving it end-to-end without touching the engine. It exploits the fact that the correction
solver reads its target bands ONLY from a `RecipeResult`'s `indicators[].band` (via the engine's own
exported, pure `detectViolations`):

- `buildInjectedSolverTarget(profile, temp)` — the regulator bands split into the HARD-gate bands that
  get injected and the ADVISORY-gate bands that are deliberately left on the engine band (so an advisory
  gate — e.g. chocolate protein-share — is never turned hard). Unsupported profile/temperature →
  `active: false` (blocked, never remapped).
- `injectRegulatorBands(result, target)` — an IMMUTABLE COPY of the result whose HARD-gate indicator
  bands are replaced by the regulator bands (values, keys and engine fallback flags preserved). The
  original result and the global config are never mutated.
- `analyzeSolverTargetInjection({recipe, profile, temp})` — runs the real `calculateRecipe`, then
  `detectViolations` on the engine-seeded result vs the band-injected copy, and reports: the two
  violation sets, a per-metric engine-vs-regulator comparison (value, bands, target centers), which
  metrics newly violate / resolve under the regulator band, and whether the correction changes. A
  band-center move below a small tolerance (e.g. −11: engine npac center 37.5 vs regulator 38 = 0.5)
  is reported as **same** so near-aligned cells are not overstated; genuine divergences (−12/−13, Δ ≥ 8)
  and any violation-SET change flag as **changed**.

**Scope (Slice 13):** re-targets the solver's VIOLATION DETECTION only. Slice 14 (§3c) removes that
limitation for the preview by adding a solver target override so the REAL gram solve consumes the
injected band. Live `TARGET_BANDS`, `calculateRecipe` and the solver DEFAULT are UNCHANGED; visibility
only, in `/dev/optimization-preview` + the Studio DEV panel.

## 3c. Solver target override — REAL gram solve in preview (Slice 14, path 2 implemented)

The engine correction solver reads its target centers from a `RecipeResult`'s `indicators[].band`, both
in `detectViolations` and in the internal `modelFor` solve. Slice 14 adds an ADDITIVE optional
`targetBandOverride?: Partial<Record<TargetMetric, TargetRange>>` to `CorrectionRequest` /
`proposeAutoFix`. When present, `proposeCorrections` applies it (via an internal, immutable
`applyTargetBandOverride`) to the `before` result AND to each verification `after`, so the exact-gram
solve detects, targets and verifies against the injected bands. When absent, the solver is byte-identical
to before (all engine tests pass unchanged; the helper is not re-exported from the barrel, so the export
allowlist is untouched). The APPLIED corrected recipe is still the real, un-overridden `calculateRecipe`,
and the rerun verdict comes from the Temperature Regulator evaluation — so no `optimized` is fabricated.

`optimizationPreviewRunner` builds the regulator override map with `regulatorTargetOverride` (HARD-gate
bands only — advisory gates excluded; unsupported profile/temperature blocked) and runs the solve TWICE:
`engineSeededSolve` (live target) and `regulatorShadowSolve` (injected target), plus a `solveComparison`
(`correctionDiffers`, `regulatorShadowImproved`). Global `TARGET_BANDS` UNCHANGED, no CONFIG_VERSION bump.
Example (DEV fixtures): chocolate −13 engine-seeded adds ~Cream 570 g (aiming at the −11 fallback) while
the regulator-shadow solve adds ~Milk 71 g (aiming at the −13 band) and is rerun-verified as an
improvement — a materially different, temperature-appropriate correction.

## 4. What a future LIVE (default-solver) update would need (requires explicit approval)

Two candidate paths. Path (2) is now implemented for PREVIEW (§3c); making the DEFAULT solver
temperature-aware for ALL callers still needs one of:

1. **Extend the engine `TARGET_BANDS`** with seeded `milk_gelato @ −12/−13` (and, later,
   sorbet/vegan/chocolate categories × −11/−12/−13) from the regulator references. This changes what
   `calculateRecipe` classifies and what the solver targets → **CONFIG_VERSION must bump** (per the
   masterplan §10 / engine `config/version.ts`), golden-recipe fixtures must be re-baselined, and the
   `temperature_fallback`/`category_fallback` flags stop firing for the added cells.
2. **Wire the override into production callers** — the `targetBandOverride` seam exists (§3c); promoting
   it beyond the preview means production Studio / persistence pass the regulator override to
   `proposeAutoFix`. Smaller blast radius, no CONFIG_VERSION bump, but each caller must opt in (the global
   default stays engine-seeded until path 1).

Either way the shadow comparison here becomes the acceptance oracle: after the change,
`compareEngineVsShadowBands` should report `aligned` for the migrated cells, and the DEV preview's
`solverTargetSource` may legitimately become `temperature_regulator`.

## 5. Migration / rollback strategy (for the future live change)

- **Additive first:** add new bands as `status: 'seeded'` rows; do not edit the existing
  `milk_gelato @ −11` row (keeps the calibrated base stable).
- **Re-baseline goldens:** update the engine golden-recipe expectations in the same commit; treat any
  unexpected golden diff as a stop-and-review.
- **CONFIG_VERSION bump** with a changelog line naming the added cells.
- **Rollback:** the change is data-only (a config array) — reverting the `TARGET_BANDS` rows +
  CONFIG_VERSION restores prior behavior with no schema/DB impact. The shadow module and DEV preview
  are unaffected either way.
- **No DB / Mapper / recipe impact** at any point — target bands are pure engine config.

## 6. Status

- **Slice 12:** shadow comparison + audit only. Live engine `TARGET_BANDS` **unchanged**; solver
  behavior **unchanged**. Visibility in `/dev/optimization-preview` + the Studio DEV panel.
- **Slice 13 (this):** solver-injected regulator target in **preview only** (§3b) — re-targets the
  solver's violation detection at the regulator bands via a cloned, band-injected `RecipeResult` +
  `detectViolations`. Live `TARGET_BANDS`, `calculateRecipe` and the gram solver **unchanged**; advisory
  gates stay advisory; unsupported profile/temperature blocked. Visibility in `/dev/optimization-preview`
  + the Studio DEV panel (Demo redaction intact).
- **Slice 14 (this):** solver target override for a REAL gram solve in preview (§3c) — the engine solver
  gains an additive optional `targetBandOverride`; the preview runs engine-seeded vs regulator-shadow gram
  solves and compares them. Default solver behavior **byte-identical** (all engine tests pass unchanged;
  export allowlist untouched); global `TARGET_BANDS` **unchanged**, no CONFIG_VERSION bump; advisory gates
  stay advisory; unsupported profile/temperature blocked. Visibility in `/dev/optimization-preview` + the
  Studio DEV panel (Demo hides grams, Pro shows the gram comparison).
- **Next:** owner decision — (a) promote the regulator-shadow gram solve to production preview / Studio
  behind capabilities (the `targetBandOverride` seam is ready), or (b) bake −12/−13 into the engine
  `TARGET_BANDS` (path 1: CONFIG_VERSION bump + golden re-baseline) to make the DEFAULT solver
  temperature-aware for every caller.
