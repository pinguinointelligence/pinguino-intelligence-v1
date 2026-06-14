/**
 * Engine versioning (spec §17).
 *
 * - ENGINE_VERSION bumps on any formula/pipeline change.
 * - CONFIG_VERSION bumps on any coefficient/target change.
 *
 * Every engine result is stamped with both so saved recipes stay reproducible.
 *
 * Engine history:
 * - 0.1.0 — stage functions (composition, pod, pac, iceFraction, statuses).
 * - 0.2.0 — calculateRecipe pipeline assembly (the spec §12/§18 entry point).
 * - 0.3.0 — pipeline extended with nutrition, cost and scoring stages.
 * - 0.4.0 — correction solver added (corrections/: exact gram suggestions,
 *   Golden Middle verification, planning/actual-batch contexts, demo
 *   redaction at source).
 *
 * Config history:
 * - 0.1.0 — foundation tables (coefficients, targets, modes, priorities, density).
 * - 0.2.0 — ice-fraction anchor domain added (config/iceAnchors.ts: seeded
 *   milk_gelato @ −11 °C row + calibration-pending temperature slope).
 * - 0.3.0 — status classification threshold added (config/targets.ts:
 *   IDEAL_ZONE_FRACTION, calibration-pending).
 * - 0.4.0 — scoring domain added (config/scoring.ts: indicator weights, status
 *   scores, flavor slopes, cost anchors, stability headroom — all
 *   calibration-pending).
 * - 0.5.0 — FIRST calibration bump: NPAC_NORMALIZATION switched from
 *   per_total_mass to per_water_mass, externally confirmed by two active
 *   reference fixtures (milk base −11C, raspberry premium −11C). The NPAC
 *   formula is unchanged; the canonical basis (config value) changed.
 *   ENGINE_VERSION stays 0.4.0 — no pipeline logic changed, the canonical
 *   call now supplies the already-computed water_g the per_water branch needs.
 */
export const ENGINE_VERSION = '0.4.0' as const;
export const CONFIG_VERSION = '0.5.0' as const;
