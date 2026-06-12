# src/engine — deterministic calculation core

Pure TypeScript, **zero dependencies, no React, no IO**. Same input → same output, always.

Mathematical source of truth: [PINGUINO_RECIPE_ENGINE_SPEC_V1.md](../../docs/PINGUINO_RECIPE_ENGINE_SPEC_V1.md)
(LOCKED — overrides the masterplan on any engine/math difference).

**Status: ENGINE FEATURE-COMPLETE (pending calibration)** — all spec §18 stages
are implemented and tested: composition (§6) → POD (§7) → PAC/NPAC (§8) → ice
fraction (§9) → statuses (§9/§12.7) → nutrition/cost (§12.10) → scoring (§12.8)
→ `calculateRecipe` (§12) → **correction solver (§13–§15)**: exact gram
suggestions ("Add 34.7 g sucrose and 178.0 g milk 3.5 %") with mass-change-aware
math, Golden Middle verification by re-running calculateRecipe, planning vs
actual-batch contexts (physically added is never reduced), mode-dependent
main-ingredient protection, machine-capacity limits, tradeoff/impossible
diagnosis, and STRICT demo redaction at source (no grams, names or numbers in
redacted objects). ENGINE_VERSION 0.4.0 + CONFIG_VERSION 0.4.0. The corrections
module is IO-free and portable for the Phase 5 `solve-corrections` Edge Function
move (masterplan §10). A QA layer pins the behavior before UI wiring: 8 golden
demo recipes with snapshot regression + solver QA (`__fixtures__/goldenRecipes.ts`,
QA-only — never calibration truth) and the external reference activation protocol + runner
(`__fixtures__/externalCalibrationFixtures.ts`) that answers the §8 normalization
questions the day real data arrives. Remaining for the engine: real external reference
calibration data (spec §16 — all 11 fixtures still `pending`); the spec §20
checklist is otherwise complete.

Rules: all coefficients live in `config/` (never inline); every result is stamped with
`ENGINE_VERSION` + `CONFIG_VERSION`; the corrections module stays IO-free and portable for
the planned `solve-corrections` Edge Function migration (Masterplan §10); external reference
fixtures (spec §16) are the only authority for calibration changes.
