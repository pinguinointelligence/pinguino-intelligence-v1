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
