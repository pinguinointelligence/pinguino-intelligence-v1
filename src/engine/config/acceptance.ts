/**
 * Accepted absolute result tolerance used by every active external Engine
 * reference for POD, NPAC and ice-fraction comparisons.
 *
 * This is not a new readiness percentage. It centralizes the existing ±0.5
 * Engine-point contract so runtime materiality checks and calibration fixtures
 * cannot silently disagree about what constitutes a meaningful result change.
 */
export const ENGINE_RESULT_ACCEPTANCE_TOLERANCE = 0.5;
