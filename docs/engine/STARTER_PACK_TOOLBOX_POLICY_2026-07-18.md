# Starter Pack functional-ingredient toolbox — policy (audit result)

**Date:** 2026-07-18 · Read-only audit against `src/engine/corrections/candidates.ts` + verified `mapper_basement` (2083 rows). Separate from the −12/−13 ice-anchor question. **No engine change was applied** — this records the recommendation for owner sign-off.

## Current candidate pool (`DEFAULT_CORRECTION_CANDIDATES`)

| Ingredient | In pool? | Selected by (violations) | Notes |
|---|---|---|---|
| **inulin** | YES | total_solids_low, water_high, lactose_high, lactose_sandiness_risk_high | approved add-from-zero candidate; never seeded into the base |
| **dextrose** | YES | pod_low, npac_low, ice_fraction_high | |
| **SMP** | YES | many dairy gates | dairy-gated (never sorbet/vegan) |
| **stabilizer / tara_gum** | YES (defined) | **NONE** | in no selection rule → solver can never auto-select it today |
| **fructose** | **NO** | — | absent from the pool; exists only as a composition % elsewhere |
| **salt** | **NO** | — | absent from the pool |

The `CorrectionCandidate` type has **no per-candidate min/max dosage field** — the only limits are global (`MIN_ACTION_GRAMS = 0.05`, `MAX_ADDITION_FACTOR = 2× batch`).

## Approved scientific data available (no invention needed)

- **Fructose** — `mapper_basement` **PI-ING-000496** (`FRUCTOSE · Sweetener · Dry`), `approved_for_engines = true`, verified, confidence 98: fructose 99.8 %, **POD 169.66 / PAC 189.638**, cost 3.5, vegan + dairy-free. `recommended_dosage_percent_min/max` = **null**.
- **Salt** — `mapper_basement` **PI-ING-000458** (`SALT · Specialty`), `approved_for_engines = true`, verified, confidence 98: salt 90 %, **POD 0 / PAC 585**, cost 8. `recommended_dosage_percent_min/max` = **null**.

A candidate needs only a composition profile (POD/PAC/NPAC derive from the coefficient tables, exactly as inulin/dextrose already do), so both are buildable from existing approved records — **the only missing datum is a dosage bound.**

## Recommendation

1. **Fructose → add to the standard toolbox.** Physically it is "dextrose-strength softening (PAC/NPAC 1.9) + higher-than-sucrose sweetness (POD 1.73)". Natural insertions: `pod_low`, `npac_low`, `ice_fraction_high` (mirroring dextrose). Data supports a broad candidate (vegan/dairy-free); **whether it is broad or profile-restricted is a product decision**, and its effect is on proposal ordering/ties, not capability.
2. **Salt → keep flavour-driven, NOT a general solver candidate.** It contributes zero POD and zero PAC and only moves NPAC via a large, calibration-sensitive coefficient (11.7), so tiny masses swing freezing hard with a real flavour risk and no upside over sugars. With no per-candidate dose cap, do not add it to `DEFAULT_CORRECTION_CANDIDATES`; use it only in flavour recipes (caramel/nut).
3. **Enabler for both:** add an optional per-candidate `dosage_min/max` to `CorrectionCandidate` (needed before salt could ever be safe, and desirable for fructose). The dosage values themselves are **not in the approved data** and would be an owner input.
4. **Zero-gram display:** no "show only when quantity ≥ threshold" filter exists; a candidate that solves to ~0 already emits no action (`MIN_ACTION_GRAMS`), but a sub-0.5 g base line rounds to `0` and renders — attach a display threshold at `customerResult.ts` / `recipeView.ts` (presentation-only). Owner rule honoured: optional candidates live in the solver, become visible rows only at a positive verified quantity.
5. **`tara_gum`** is defined but unreachable (in no selection rule) — flag: either wire it or document that stabilizer levers are intentionally not auto-solved.

## Decisions the owner still owns

- Fructose: standard-broad vs profile-restricted; add now vs later.
- Salt: confirm flavour-only (recommended) vs solver candidate with a dose cap + sign-off on the salt NPAC coefficient 11.7.
- Per-candidate dosage bounds (values) for fructose/salt — not in approved data.
- Starter Pack membership + Home-recipe coverage — no `starter_pack` flag exists in code or `mapper_basement`; must come from the owner.
