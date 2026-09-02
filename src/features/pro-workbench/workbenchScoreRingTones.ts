import type { TenPointScore } from '@/features/recipe-score';

export interface WorkbenchScoreRingTone {
  token: string;
  color: string;
}

/**
 * Owner-approved visual progression for the compact Recipe score ring.
 * Scores below the supplied 5–10 reference retain the lowest approved orange
 * instead of inventing a new customer-facing danger colour.
 */
export const WORKBENCH_SCORE_RING_TONES: Readonly<
  Record<TenPointScore, WorkbenchScoreRingTone>
> = Object.freeze({
  10: { token: 'fresh-green', color: '#51ad3e' },
  9: { token: 'green', color: '#70ba43' },
  8: { token: 'lime', color: '#9dc43e' },
  7: { token: 'yellow', color: '#ddcb32' },
  6: { token: 'yellow-orange', color: '#f0ad26' },
  5: { token: 'orange', color: '#f58a07' },
  4: { token: 'orange', color: '#f58a07' },
  3: { token: 'orange', color: '#f58a07' },
  2: { token: 'orange', color: '#f58a07' },
  1: { token: 'orange', color: '#f58a07' },
});

export const SCORE_RING_NO_DATA_TONE: WorkbenchScoreRingTone = Object.freeze({
  token: 'no-data',
  color: '#dcd8cf',
});

/**
 * Ring geometry — the owner-accepted 36 px box with a 2 px stroke. The radius and
 * circumference are derived so the progress arc can be expressed as an exact
 * fraction of the circle.
 */
const RING_SIZE = 36;
const RING_STROKE = 2;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;

export const SCORE_RING_GEOMETRY = Object.freeze({
  size: RING_SIZE,
  stroke: RING_STROKE,
  radius: RING_RADIUS,
  circumference: 2 * Math.PI * RING_RADIUS,
});
