import { ProteinMetric } from '@/features/protein-gelato/ProteinMetric';
import { ScoreRing } from './ScoreRing';
import type { MonitorLiveScoreView, MonitorScoreComparisonView } from './monitorLiveScore';

/**
 * Protein Engine v2: the ACTUAL protein content of that exact candidate, shown
 * beside — never inside — the ring. Read-only text: no button, no slider, no
 * target. Rendered only in Protein mode.
 */
function ProteinOutput({ view, testId }: { view: MonitorLiveScoreView; testId: string }) {
  return (
    <ProteinMetric
      proteinPercent={view.proteinPercent}
      energySharePercent={view.proteinEnergySharePercent}
      testId={testId}
    />
  );
}

/**
 * The Monitor's score header: how Gellatti scores the recipe AS CURRENTLY
 * WRITTEN, and — when a real Preview candidate exists — what it would become.
 *
 * Compact by design: one row, the accepted 36 px ring, no second card, and no
 * visible "/10". The proposal is additive; when there is none the header is
 * exactly the current-score line it always was.
 */
export function MonitorScoreHeader({
  comparison,
  stale = false,
}: {
  comparison: MonitorScoreComparisonView;
  /** The recipe changed since the last recalculation — evaluative, not verified. */
  stale?: boolean;
}) {
  const { current, proposed, showComparison } = comparison;

  return (
    <div
      className="mb-3 rounded-[14px] border border-ink/9 bg-white px-3 py-2"
      data-testid="monitor-score-header"
      data-current-score={current.score ?? current.state}
      data-proposed-score={showComparison ? (proposed?.score ?? null) : null}
      data-current-protein={current.proteinPercent ?? null}
      data-proposed-protein={showComparison ? (proposed?.proteinPercent ?? null) : null}
      data-stale={stale ? 'true' : 'false'}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2" data-testid="monitor-score-current">
          <ProteinOutput view={current} testId="monitor-score-protein-current" />
          <ScoreRing score={current.score} testId="monitor-score-ring-current" />
          <span className="min-w-0" aria-label={current.ariaText}>
            <strong className="block text-xs font-semibold text-ink">Wynik aktualny</strong>
            <span className="mt-0.5 block text-[10px] leading-snug text-stone-600">
              {current.label}
            </span>
          </span>
        </div>

        {showComparison && proposed ? (
          <>
            <span
              aria-hidden
              className="shrink-0 text-sm text-stone-400"
              data-testid="monitor-score-arrow"
            >
              →
            </span>
            <div
              className="flex min-w-0 flex-1 items-center gap-2"
              data-testid="monitor-score-proposed"
            >
              <ProteinOutput view={proposed} testId="monitor-score-protein-proposed" />
              <ScoreRing score={proposed.score} testId="monitor-score-ring-proposed" />
              <span className="min-w-0" aria-label={proposed.ariaText}>
                <strong className="block text-xs font-semibold text-ink">
                  Po korekcie Gellatti
                </strong>
                <span className="mt-0.5 block text-[10px] leading-snug text-stone-600">
                  {proposed.label}
                </span>
              </span>
            </div>
          </>
        ) : null}
      </div>

      {stale ? (
        // The live score describes the current formula. It is deliberately NOT a
        // claim that the recipe has been recalculated or verified.
        <p className="mt-2 text-[10px] leading-snug text-stone-500" data-testid="monitor-score-stale-note">
          Ocena bieżącej receptury. Oczekuje na przeliczenie.
        </p>
      ) : null}
    </div>
  );
}
