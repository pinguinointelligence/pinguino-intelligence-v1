import type { TenPointScore } from '@/features/recipe-score';
import { ScoreRing } from './ScoreRing';

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
      <ScoreRing score={score} />
      <span className="hidden min-w-0 sm:block">
        <strong className="block text-xs font-semibold text-ink">{heading}</strong>
        <span className="block truncate text-[10px] text-stone-600">{label}</span>
      </span>
    </button>
  );
}
