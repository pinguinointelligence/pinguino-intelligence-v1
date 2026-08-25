import { SectionLabel } from '@/components/shared/SectionLabel';
import { ScoreRing } from '@/features/pro-workbench/ScoreRing';
import type { ProductionWorkspaceView } from './useProductionWorkspace';

/**
 * The single visible Production-state authority shared by both work areas.
 * It reads the existing session view only; it does not derive or mutate any
 * Production, Rescue, Engine or persistence state.
 */
export function ProductionWorkspaceHeader({ production }: { production: ProductionWorkspaceView }) {
  const { session, progress, score } = production;
  if (!session || !progress) return null;

  const completed = session.status === 'completed';
  const progressPercent =
    progress.totalCount > 0 ? (progress.confirmedCount / progress.totalCount) * 100 : 0;

  return (
    <header
      className="shrink-0 border-y border-ink/10 bg-white px-[var(--pro-mobile-gutter)] py-2.5 text-ink xl:mb-0 xl:rounded-[12px] xl:border xl:px-4"
      data-testid="production-workspace-header"
      data-production-state={completed ? 'completed' : 'active'}
    >
      <div className="flex min-w-0 items-center justify-between gap-4">
        <div className="min-w-0">
          <SectionLabel>Produkcja</SectionLabel>
          {completed ? (
            <p
              className="mt-1 text-sm font-semibold text-[#2f6f3c]"
              data-testid="production-workspace-complete"
            >
              ✓ Partia gotowa
            </p>
          ) : (
            <ol
              className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-stone-600 sm:gap-x-3 sm:text-xs"
              aria-label="Kolejność ważenia składnika"
              data-testid="production-workspace-instructions"
            >
              <li>
                <strong className="font-mono text-ink">1</strong> Odważ
              </li>
              <li aria-hidden className="text-stone-300">
                →
              </li>
              <li>
                <strong className="font-mono text-ink">2</strong> Wpisz faktyczną ilość
              </li>
              <li aria-hidden className="text-stone-300">
                →
              </li>
              <li>
                <strong className="font-mono text-ink">3</strong> Potwierdź
              </li>
            </ol>
          )}
        </div>

        {completed ? null : (
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <div className="w-28 sm:w-40" data-testid="production-workspace-progress">
              <strong className="block font-mono text-xs font-semibold tabular-nums text-ink sm:text-sm">
                {progress.confirmedCount} / {progress.totalCount} składników
              </strong>
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/8"
                role="progressbar"
                aria-label="Postęp ważenia składników"
                aria-valuemin={0}
                aria-valuemax={progress.totalCount}
                aria-valuenow={progress.confirmedCount}
              >
                <span
                  className="block h-full rounded-full bg-status-ideal transition-[width]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            <span className="flex items-center gap-2 text-left">
              <ScoreRing score={score.score} testId="production-score-ring" />
              <span className="hidden sm:block">
                <span className="block text-[11px] font-semibold text-ink">Przewidywany wynik</span>
                <span className="mt-0.5 block max-w-32 text-[10px] leading-snug text-stone-600">
                  {score.label}
                </span>
              </span>
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
