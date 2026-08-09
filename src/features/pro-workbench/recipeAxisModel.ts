import type { GoldenRangeReading } from '@/features/recipe-score';

export type AxisRelation = 'gold' | 'acceptable' | 'outside';

export function targetStepToPosition(step: -2 | -1 | 0 | 1 | 2): number {
  return (step + 2) * 25;
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
