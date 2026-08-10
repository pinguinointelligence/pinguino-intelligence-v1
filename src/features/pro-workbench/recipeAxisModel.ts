import type { TargetRange } from '@/engine';
import type { GoldenRangeReading } from '@/features/recipe-score';

export type AxisRelation = 'gold' | 'acceptable' | 'outside';

export function targetStepToPosition(step: -1 | 0 | 1): number {
  return (step + 1) * 50;
}

export function axisRelation(actualPosition: number, targetPosition: number): AxisRelation {
  const distance = Math.abs(actualPosition - targetPosition);
  if (distance <= 8) return 'gold';
  if (distance <= 30) return 'acceptable';
  return 'outside';
}

export function actualPositionFromReading(reading: GoldenRangeReading | undefined): number {
  if (!reading || reading.side === null || reading.side === 'inside') return 50;
  if (reading.side === 'below') return reading.state === 'red' ? 0 : 25;
  return reading.state === 'red' ? 100 : 75;
}

const clampPosition = (value: number): number => Math.max(0, Math.min(100, value));

export function metricPositionInNativeBand(value: number, nativeBand: TargetRange): number {
  const width = nativeBand.max - nativeBand.min;
  if (!(width > 0) || !Number.isFinite(value)) return 50;
  return clampPosition(((value - nativeBand.min) / width) * 100);
}

export function targetBandPosition(targetBand: TargetRange, nativeBand: TargetRange): number {
  return metricPositionInNativeBand((targetBand.min + targetBand.max) / 2, nativeBand);
}

/** Native safety is superior; only an in-native value inside the selected
 * preference band can be gold. */
export function directionAxisRelation(
  value: number,
  nativeBand: TargetRange,
  targetBand: TargetRange,
): AxisRelation {
  if (value < nativeBand.min || value > nativeBand.max) return 'outside';
  if (value >= targetBand.min && value <= targetBand.max) return 'gold';
  return 'acceptable';
}
