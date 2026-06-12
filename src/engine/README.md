# src/engine — deterministic calculation core

Pure TypeScript, **zero dependencies, no React, no IO**. Same input → same output, always.

Mathematical source of truth: [PINGUINO_RECIPE_ENGINE_SPEC_V1.md](../../docs/PINGUINO_RECIPE_ENGINE_SPEC_V1.md)
(LOCKED — overrides the masterplan on any engine/math difference).

**Status: Step 4G statuses landed** — on top of composition (§6), POD (§7), PAC/NPAC
(§8) and ice fraction (§9 anchor model), `statuses.ts` now classifies all 11 metrics
against the category/temperature-aware target bands into the §12.7 vocabulary
(directional too_sweet/too_weak/too_soft/too_hard, one-sided risk metrics, warn
thresholds, safe needs_correction for missing data), preserving band provenance
(seeded/estimated + category/temperature fallback flags). Includes the
calibration-pending lactose-sandiness working definition (lactose-in-water %).
CONFIG_VERSION is 0.3.0 (IDEAL_ZONE_FRACTION added). Still to come: `scoring →
nutrition/cost → corrections` (spec §18) — the export-allowlist test enforces that
none exist early.

Rules: all coefficients live in `config/` (never inline); every result is stamped with
`ENGINE_VERSION` + `CONFIG_VERSION`; the corrections module stays IO-free and portable for
the planned `solve-corrections` Edge Function migration (Masterplan §10); MyGelato
fixtures (spec §16) are the only authority for calibration changes.
