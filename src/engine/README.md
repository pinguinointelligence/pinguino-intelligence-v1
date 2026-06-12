# src/engine — deterministic calculation core

Pure TypeScript, **zero dependencies, no React, no IO**. Same input → same output, always.

Mathematical source of truth: [PINGUINO_RECIPE_ENGINE_SPEC_V1.md](../../docs/PINGUINO_RECIPE_ENGINE_SPEC_V1.md)
(LOCKED — overrides the masterplan on any engine/math difference).

**Status: Step 4E PAC/NPAC landed** — on top of composition (spec §6) and POD
(spec §7), `pac.ts` now implements spec §8: PAC (sugar spectrum) and NPAC (net
depression incl. alcohol 7.4 and calibration-sensitive salt) with stored-value-first
(`pac_value`/`npac_value` per 100 g, net for NPAC), syrup DE anchor interpolation on
solids grams, and the normalization rule — `per_total_mass` canonical default,
`per_water_mass` strictly an explicit candidate for MyGelato calibration. Still to
come: `iceFraction → statuses → scoring → nutrition/cost → corrections` (spec §18) —
the export-allowlist test enforces that none exist early.

Rules: all coefficients live in `config/` (never inline); every result is stamped with
`ENGINE_VERSION` + `CONFIG_VERSION`; the corrections module stays IO-free and portable for
the planned `solve-corrections` Edge Function migration (Masterplan §10); MyGelato
fixtures (spec §16) are the only authority for calibration changes.
