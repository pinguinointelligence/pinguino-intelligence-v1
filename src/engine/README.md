# src/engine — deterministic calculation core

Pure TypeScript, **zero dependencies, no React, no IO**. Same input → same output, always.

Mathematical source of truth: [PINGUINO_RECIPE_ENGINE_SPEC_V1.md](../../docs/PINGUINO_RECIPE_ENGINE_SPEC_V1.md)
(LOCKED — overrides the masterplan on any engine/math difference).

**Status: Step 4D POD landed** — on top of the 4B foundation and the 4C composition
stage (spec §6 mass arithmetic), `pod.ts` now implements spec §7: sugar-type
sweetness (never total sugar) with the stored-value-first rule (`pod_value` per
100 g, sucrose = 100). Still to come: `pac → iceFraction → statuses → scoring →
nutrition/cost → corrections` (spec §18) — the export-allowlist test enforces that
none exist early.

Rules: all coefficients live in `config/` (never inline); every result is stamped with
`ENGINE_VERSION` + `CONFIG_VERSION`; the corrections module stays IO-free and portable for
the planned `solve-corrections` Edge Function migration (Masterplan §10); MyGelato
fixtures (spec §16) are the only authority for calibration changes.
