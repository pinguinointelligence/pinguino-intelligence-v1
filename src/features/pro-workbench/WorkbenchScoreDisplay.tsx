import type { TenPointScore } from '@/features/recipe-score';
import { proteinContentLabelPl } from '@/features/protein-gelato/proteinReadout';
import { ScoreRing } from './ScoreRing';

/**
 * Protein Engine v2 (owner decision): in Protein mode the ring is accompanied
 * by the ACTUAL protein content of the current recipe.
 *
 * The two are different things and are never conflated — the ring is
 * formulation quality, „Białko x,y%” is measured content, and a higher protein
 * number does not imply a higher ring. The read-out is text: never a button,
 * slider, input or target. Outside Protein mode nothing is rendered and the
 * markup is byte-identical to the accepted Score ring treatment.
 */
export function WorkbenchScoreDisplay({
  score,
  label,
  preview,
  proteinPercent = null,
  onOpenLearning,
}: {
  score: TenPointScore | null;
  label: string;
  preview: boolean;
  proteinPercent?: number | null;
  onOpenLearning?: () => void;
}) {
  const heading = preview ? 'Podgląd gotowy' : 'Wynik aktualny';
  const proteinLabel =
    proteinPercent !== null && Number.isFinite(proteinPercent)
      ? proteinContentLabelPl(proteinPercent)
      : null;
  const accessibleResult = score === null ? label : `${score} na 10 — ${label}`;

  return (
    <button
      type="button"
      onClick={onOpenLearning}
      disabled={!onOpenLearning}
      aria-label={`Dopasowanie techniczne receptury — ${heading}: ${accessibleResult}${
        proteinLabel === null ? '' : `. ${proteinLabel} — zawartość białka w recepturze`
      }`}
      className="pro-focus-ring flex h-11 max-w-full shrink-0 items-center gap-2 rounded-[10px] px-1.5 text-left disabled:cursor-default"
      data-score-variant="compact-inline"
    >
      <ScoreRing score={score} />
      <span className="hidden min-w-0 sm:block">
        <strong className="block text-xs font-semibold text-ink">{heading}</strong>
        <span className="block truncate text-[10px] text-stone-600">{label}</span>
      </span>
      {proteinLabel === null ? null : (
        <span
          className="shrink-0 border-l border-ink/10 pl-2 font-mono text-[11px] font-semibold tabular-nums text-ink"
          data-testid="workbench-score-protein"
          data-protein-percent={proteinPercent}
        >
          {proteinLabel}
        </span>
      )}
    </button>
  );
}
