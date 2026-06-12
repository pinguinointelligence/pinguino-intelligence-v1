/**
 * Engine versioning (spec §17).
 *
 * - ENGINE_VERSION bumps on any formula/pipeline change.
 * - CONFIG_VERSION bumps on any coefficient/target/weight change.
 *
 * Every engine result is stamped with both so saved recipes stay reproducible.
 * The first CONFIG_VERSION bump is expected when MyGelato calibration fixtures
 * (spec §16) are entered, verified and activated.
 */
export const ENGINE_VERSION = '0.1.0' as const;
export const CONFIG_VERSION = '0.1.0' as const;
