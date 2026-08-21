import type { CSSProperties } from 'react';
import type { TenPointScore } from '@/features/recipe-score';
import {
  SCORE_RING_NO_DATA_TONE,
  WORKBENCH_SCORE_RING_TONES,
} from './workbenchScoreRingTones';

export function WorkbenchScoreDisplay({
  score,
  label,
  preview,
  onOpenLearning,
}: {
  score: TenPointScore | null;
  label: string;
  preview: boolean;
  onOpenLearning?: () => void;
}) {
  const heading = preview ? 'Podgląd gotowy' : 'Wynik aktualny';
  const tone = score === null ? SCORE_RING_NO_DATA_TONE : WORKBENCH_SCORE_RING_TONES[score];
  const ringStyle = { borderColor: tone.color } satisfies CSSProperties;
  const accessibleResult =
    score === null ? label : `${score} na 10 — ${label}`;

  return (
    <button
      type="button"
      onClick={onOpenLearning}
      disabled={!onOpenLearning}
      aria-label={`Dopasowanie techniczne receptury — ${heading}: ${accessibleResult}`}
      className="pro-focus-ring flex h-11 max-w-full shrink-0 items-center gap-2 rounded-xl border border-ink/10 bg-white px-3 text-left shadow-pro-e0 disabled:cursor-default"
    >
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full border-2 bg-white font-mono text-xs font-semibold tabular-nums text-ink"
        data-testid="workbench-score-ring"
        data-score={score ?? 'no-data'}
        data-score-tone={tone.token}
        style={ringStyle}
      >
        {score ?? '—'}
      </span>
      <span className="hidden min-w-0 sm:block">
        <strong className="block text-xs font-semibold text-ink">{heading}</strong>
        <span className="block truncate text-[10px] text-stone-600">{label}</span>
      </span>
    </button>
  );
}
