/** Position of a value within [min, max] as a clamped 0–100 percentage. */
export const barPosition = (min: number, max: number, value: number): number => {
  if (max <= min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
};
