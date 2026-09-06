import type { TenPointScore } from '@/features/recipe-score';
import { ProteinMetric } from '@/features/protein-gelato/ProteinMetric';
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
  proteinEnergySharePercent = null,
  onOpenLearning,
}: {
  score: TenPointScore | null;
  label: string;
  preview: boolean;
  proteinPercent?: number | null;
  proteinEnergySharePercent?: number | null;
  onOpenLearning?: () => void;
}) {
  const heading = preview ? 'Podgląd gotowy' : 'Wynik aktualny';
  const accessibleResult = score === null ? label : `${score} na 10 — ${label}`;

  return (
    <span className="flex max-w-full shrink-0 items-center gap-2">
      <ProteinMetric
        proteinPercent={proteinPercent}
        energySharePercent={proteinEnergySharePercent}
        testId="workbench-score-protein"
      />
      <button
        type="button"
        onClick={onOpenLearning}
        disabled={!onOpenLearning}
        aria-label={`Dopasowanie techniczne receptury — ${heading}: ${accessibleResult}`}
        className="pro-focus-ring flex h-11 max-w-full shrink-0 items-center gap-2 rounded-[10px] px-1.5 text-left disabled:cursor-default"
        data-testid="workbench-score-action"
        data-score-variant="compact-inline"
      >
        <ScoreRing score={score} />
        <span className="hidden min-w-0 sm:block">
          <strong className="block text-xs font-semibold text-ink">{heading}</strong>
          <span className="block truncate text-[10px] text-stone-600">{label}</span>
        </span>
      </button>
    </span>
  );
}
