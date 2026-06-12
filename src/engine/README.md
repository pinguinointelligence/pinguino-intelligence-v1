# src/engine — deterministic calculation core

Pure TypeScript, **zero dependencies, no React, no IO**. Same input → same output, always.

Mathematical source of truth: [PINGUINO_RECIPE_ENGINE_SPEC_V1.md](../../docs/PINGUINO_RECIPE_ENGINE_SPEC_V1.md)
(LOCKED — overrides the masterplan on any engine/math difference).

**Status: Step 4H pipeline assembled** — `calculateRecipe(input): RecipeResult`
(spec §12/§18) now chains all five tested stages: composition (§6) → POD (§7) →
PAC/NPAC (§8, canonical per_total_mass) → ice fraction (§9 anchor model) → status
classification (§9/§12.7), returning a complete result stamped with
ENGINE_VERSION 0.2.0 + CONFIG_VERSION 0.3.0, classified provenance-flagged
indicators, deterministic warnings (alcohol/capacity/mass-mismatch/low-confidence)
and `scores: null` (scoring not yet implemented). Zero-mass recipes yield null
metrics, never NaN. Still to come: `scoring → nutrition/cost → corrections`
(spec §18) — the shared export allowlist (`__fixtures__/allowedEngineFunctions.ts`)
enforces that none exist early.

Rules: all coefficients live in `config/` (never inline); every result is stamped with
`ENGINE_VERSION` + `CONFIG_VERSION`; the corrections module stays IO-free and portable for
the planned `solve-corrections` Edge Function migration (Masterplan §10); MyGelato
fixtures (spec §16) are the only authority for calibration changes.
