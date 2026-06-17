/** Position of a value within [min, max] as a clamped 0–100 percentage. */
export const barPosition = (min: number, max: number, value: number): number => {
  if (max <= min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
};

/**
 * Display-only fraction of a target band shown as the "ideal core" window
 * (Phase 6C Slice 2C). Tunable; 0.5 = the central half of the band.
 */
export const IDEAL_CORE_FRACTION = 0.5;

/**
 * The narrower, centered "ideal core" sub-range of a target band — DISPLAY ONLY.
 * Derived purely from the passed band; it never recomputes engine targets and has
 * no effect on classification, status, or scoring (those stay engine-owned).
 * Returns the central `fraction` of [targetMin, targetMax].
 */
export const idealCoreRange = (
  targetMin: number,
  targetMax: number,
  fraction: number = IDEAL_CORE_FRACTION,
): { coreMin: number; coreMax: number } => {
  const center = (targetMin + targetMax) / 2;
  const half = ((targetMax - targetMin) * fraction) / 2;
  return { coreMin: center - half, coreMax: center + half };
};
