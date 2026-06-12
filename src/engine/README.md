# src/engine — deterministic calculation core

Pure TypeScript, **zero dependencies, no React, no IO**. Same input → same output, always.

Mathematical source of truth: [PINGUINO_RECIPE_ENGINE_SPEC_V1.md](../../docs/PINGUINO_RECIPE_ENGINE_SPEC_V1.md)
(LOCKED — overrides the masterplan on any engine/math difference).

**Status: Step 4F ice fraction landed** — on top of composition (§6), POD (§7) and
PAC/NPAC (§8), `iceFraction.ts` now implements the spec §9 anchor-matrix model:
category-aware rows (single seeded `milk_gelato` @ −11 °C band: NPAC 33 → 54.5,
42 → 45), inverse-linear inside the band, slope-extrapolated and clamped to [0, 100]
outside it, calibration-pending temperature slope for non-anchored temperatures, and
a documented milk_gelato fallback for unseeded categories. CONFIG_VERSION is 0.2.0
(ice anchor domain added). Still to come: `statuses → scoring → nutrition/cost →
corrections` (spec §18) — the export-allowlist test enforces that none exist early.

Rules: all coefficients live in `config/` (never inline); every result is stamped with
`ENGINE_VERSION` + `CONFIG_VERSION`; the corrections module stays IO-free and portable for
the planned `solve-corrections` Edge Function migration (Masterplan §10); MyGelato
fixtures (spec §16) are the only authority for calibration changes.
