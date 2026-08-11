export function acceleratedStepMultiplier(repeatCount: number): number {
  if (repeatCount < 5) return 1;
  if (repeatCount < 12) return 5;
  return 10;
}

export function heldValueAfterTicks(
  startValue: number,
  direction: -1 | 1,
  step: number,
  tickCount: number,
): number {
  let value = startValue;
  for (let tick = 0; tick < Math.max(0, tickCount); tick += 1) {
    value += direction * step * acceleratedStepMultiplier(tick);
  }
  return value;
}

export function scrubbedValue(
  startValue: number,
  deltaX: number,
  step: number,
  detentWidthPx = 12,
): number {
  const detent = Math.trunc(deltaX / detentWidthPx);
  return startValue + detent * step;
}

export function boundedNumberValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function committedNumberValue({
  value,
  min,
  max,
  decimals,
  preservePrecision,
}: {
  value: number;
  min: number;
  max: number;
  decimals: number;
  preservePrecision: boolean;
}): number {
  const bounded = boundedNumberValue(value, min, max);
  return preservePrecision ? bounded : Number(bounded.toFixed(decimals));
}

const decimalPlaces = (value: number): number => {
  for (let places = 0; places < 3; places += 1) {
    if (Math.abs(value - Number(value.toFixed(places))) <= 1e-9) return places;
  }
  return 3;
};

export const productionControlDecimals = (value: number, step: number): number =>
  Math.max(decimalPlaces(value), decimalPlaces(step));
