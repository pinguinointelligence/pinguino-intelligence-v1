# src/engine — deterministic calculation core

Pure TypeScript, **zero dependencies, no React, no IO**. Same input → same output, always.

Mathematical source of truth: [PINGUINO_RECIPE_ENGINE_SPEC_V1.md](../../docs/PINGUINO_RECIPE_ENGINE_SPEC_V1.md)
(LOCKED — overrides the masterplan on any engine/math difference).

**Status: Step 4I nutrition/cost/scoring landed** — `calculateRecipe(input)`
now returns the complete pre-correction RecipeResult: all five metric stages
(composition §6 → POD §7 → PAC/NPAC §8 → ice fraction §9 → statuses §9/§12.7)
plus per-100 g nutrition (stored-kcal-first with masterplan §12.10 Atwater
fallback), honest costs (kg + 60/70/80 g servings; unknown ingredient cost ⇒
incomplete state + `cost_incomplete` warning, never a silent 0) and
mode-weighted scores (ECO cost-heavy ↔ SIGNATURE flavor-heavy, stability-gated:
overall ≤ technical + headroom). Stamped ENGINE_VERSION 0.3.0 + CONFIG_VERSION
0.4.0; all scoring constants live in `config/scoring.ts`, calibration-pending.
Still to come: `corrections` (solver + redact, spec §18) — the shared export
allowlist (`__fixtures__/allowedEngineFunctions.ts`) enforces it doesn't exist
early.

Rules: all coefficients live in `config/` (never inline); every result is stamped with
`ENGINE_VERSION` + `CONFIG_VERSION`; the corrections module stays IO-free and portable for
the planned `solve-corrections` Edge Function migration (Masterplan §10); MyGelato
fixtures (spec §16) are the only authority for calibration changes.
