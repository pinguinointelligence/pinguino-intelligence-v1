import type { TenPointScore } from '@/features/recipe-score';
import {
  SCORE_RING_GEOMETRY,
  SCORE_RING_NO_DATA_TONE,
  WORKBENCH_SCORE_RING_TONES,
} from './workbenchScoreRingTones';

/**
 * The one owner-approved Score ring: 36 × 36 px, 2 px stroke, the approved tone
 * per score, the bare numeral — never a visible "/10".
 *
 * The circumference itself communicates progress: the coloured arc covers
 * score/10 of the circle and the remainder shows the neutral track, so a 5 reads
 * as visibly half orange and half grey. There is no full coloured border with a
 * separate hidden progress indicator — the visible ring IS the progress.
 *
 * Presentational only: it renders the score it is handed and computes nothing.
 */

const { size: SIZE, stroke: STROKE, radius: RADIUS, circumference: CIRCUMFERENCE } =
  SCORE_RING_GEOMETRY;

export function ScoreRing({
  score,
  testId = 'workbench-score-ring',
}: {
  score: TenPointScore | null;
  testId?: string;
}) {
  const tone = score === null ? SCORE_RING_NO_DATA_TONE : WORKBENCH_SCORE_RING_TONES[score];
  const progress = score === null ? 0 : score / 10;
  const dash = CIRCUMFERENCE * progress;

  return (
    <span
      className="relative grid size-9 shrink-0 place-items-center"
      data-testid={testId}
      data-score={score ?? 'no-data'}
      data-score-tone={tone.token}
      data-score-progress={progress.toFixed(2)}
    >
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 size-9 -rotate-90"
        data-testid={`${testId}-svg`}
      >
        {/* Neutral track — always the full circle, so the unreached part is visible. */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={SCORE_RING_NO_DATA_TONE.color}
          strokeWidth={STROKE}
          data-testid={`${testId}-track`}
        />
        {/* Scored arc — exactly score/10 of the circumference. */}
        {score === null ? null : (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={tone.color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
            data-testid={`${testId}-arc`}
            data-arc-length={dash.toFixed(2)}
            data-arc-circumference={CIRCUMFERENCE.toFixed(2)}
          />
        )}
      </svg>
      <span className="relative font-mono text-xs font-semibold tabular-nums text-ink">
        {score ?? '—'}
      </span>
    </span>
  );
}
