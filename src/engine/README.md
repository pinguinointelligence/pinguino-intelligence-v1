# src/engine — deterministic calculation core

Pure TypeScript, **zero dependencies, no React, no IO**. Same input → same output, always.

Mathematical source of truth: [PINGUINO_RECIPE_ENGINE_SPEC_V1.md](../../docs/PINGUINO_RECIPE_ENGINE_SPEC_V1.md)
(LOCKED — overrides the masterplan on any engine/math difference).

**Status: Step 4B foundation landed** — types (`types.ts`), config (`config/`: version,
coefficients, targets, modes, priorities, density) and fixture schemas (`__fixtures__/`).
The public API exports **no functions yet** (enforced by the export-purity test).
Calculation modules arrive next: `composition → pod → pac → iceFraction → statuses →
scoring → nutrition/cost → corrections` (spec §18).

Rules: all coefficients live in `config/` (never inline); every result is stamped with
`ENGINE_VERSION` + `CONFIG_VERSION`; the corrections module stays IO-free and portable for
the planned `solve-corrections` Edge Function migration (Masterplan §10); MyGelato
fixtures (spec §16) are the only authority for calibration changes.
