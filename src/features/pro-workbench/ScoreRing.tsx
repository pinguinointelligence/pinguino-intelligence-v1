import type { CSSProperties } from 'react';
import type { TenPointScore } from '@/features/recipe-score';
import { SCORE_RING_NO_DATA_TONE, WORKBENCH_SCORE_RING_TONES } from './workbenchScoreRingTones';

/**
 * The one owner-approved Score ring: 36 × 36 px, 2 px stroke, the approved tone
 * per score, and the bare numeral — never a visible "/10". Every surface that
 * draws a score ring renders THIS component, so the accepted visual contract
 * cannot drift between the recipe dock and the Monitor.
 *
 * Presentational only: it renders the score it is handed and computes nothing.
 */
export function ScoreRing({
  score,
  testId = 'workbench-score-ring',
}: {
  score: TenPointScore | null;
  testId?: string;
}) {
  const tone = score === null ? SCORE_RING_NO_DATA_TONE : WORKBENCH_SCORE_RING_TONES[score];
  const ringStyle = { borderColor: tone.color } satisfies CSSProperties;
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-full border-2 bg-white font-mono text-xs font-semibold tabular-nums text-ink"
      data-testid={testId}
      data-score={score ?? 'no-data'}
      data-score-tone={tone.token}
      style={ringStyle}
    >
      {score ?? '—'}
    </span>
  );
}
