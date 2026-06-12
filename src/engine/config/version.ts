/**
 * Engine versioning (spec §17).
 *
 * - ENGINE_VERSION bumps on any formula/pipeline change.
 * - CONFIG_VERSION bumps on any coefficient/target change.
 *
 * Every engine result is stamped with both so saved recipes stay reproducible.
 *
 * Config history:
 * - 0.1.0 — foundation tables (coefficients, targets, modes, priorities, density).
 * - 0.2.0 — ice-fraction anchor domain added (config/iceAnchors.ts: seeded
 *   milk_gelato @ −11 °C row + calibration-pending temperature slope).
 * - 0.3.0 — status classification threshold added (config/targets.ts:
 *   IDEAL_ZONE_FRACTION, calibration-pending).
 *
 * The first calibration bump is expected when MyGelato calibration fixtures
 * (spec §16) are entered, verified and activated.
 */
export const ENGINE_VERSION = '0.1.0' as const;
export const CONFIG_VERSION = '0.3.0' as const;
