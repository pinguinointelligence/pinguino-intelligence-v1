# src/engine — deterministic calculation core

Pure TypeScript, **zero dependencies, no React, no IO**. Same input → same output, always.

Mathematical source of truth: [PINGUINO_RECIPE_ENGINE_SPEC_V1.md](../../docs/PINGUINO_RECIPE_ENGINE_SPEC_V1.md)
(LOCKED — overrides the masterplan on any engine/math difference).

**Status: Step 4C composition landed** — on top of the 4B foundation (types, config,
fixture schemas), `composition.ts` now implements the spec §6 mass arithmetic:
effective grams (`actual ?? planned`), total batch grams, the 13 component totals,
percentages, and the typed sugar breakdown (§4) with alcohol kept separate (§5).
Still to come: `pod → pac → iceFraction → statuses → scoring → nutrition/cost →
corrections` (spec §18) — the export-allowlist test enforces that none exist early.

Rules: all coefficients live in `config/` (never inline); every result is stamped with
`ENGINE_VERSION` + `CONFIG_VERSION`; the corrections module stays IO-free and portable for
the planned `solve-corrections` Edge Function migration (Masterplan §10); MyGelato
fixtures (spec §16) are the only authority for calibration changes.
