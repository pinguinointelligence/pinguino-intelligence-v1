import { calculateRecipe, type RecipeInput, type RecipeResult } from '@/engine';
import { useMemo } from 'react';
import { useRecipeStore } from '@/stores/recipeStore';
import { useRecipeProfileStore } from './recipeProfileStore';
import {
  buildRecipeBehaviorAuthority,
  recipeBehaviorLegacyInspection,
  recipeBehaviorModuleGate,
} from '@/features/product-intelligence';
import { monitorScoreView } from './monitorSummaryView';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { scorePresentationSource } from './scorePresentationSource';

export function WorkbenchIntelligenceHeader({
  result,
  input,
  onOpenLearning,
  onRecalculate,
  variant = 'panel',
}: {
  result: RecipeResult;
  input: RecipeInput;
  onOpenLearning?: () => void;
  onRecalculate?: () => void;
  variant?: 'panel' | 'global' | 'dock';
}) {
  const match = monitorScoreView(result, input).match;
  const snapshots = useRecipeStore((state) => state.productBehaviorSnapshots);
  const savedRecipeId = useRecipeStore((state) => state.savedRecipeId);
  const preview = useConstraintStudioStore((state) => state.preview);
  const directionBestCandidate = useConstraintStudioStore((state) => state.directionBestCandidate);
  const recalculationTerminal = useConstraintStudioStore((state) => state.recalculationTerminal);
  const appliedHistoryCount = useConstraintStudioStore((state) => state.history.length);
  const awaitingRecalculation = useRecipeProfileStore((state) => state.awaitingRecalculation);
  const authority = useMemo(
    // Score currentness belongs to the technical Base. Post-production
    // toppings change final mass/cost only and cannot stale this authority.
    () => buildRecipeBehaviorAuthority({ items: input.items, snapshots }),
    [input.items, snapshots],
  );
  const monitorGate = useMemo(() => recipeBehaviorModuleGate(authority, 'MONITOR'), [authority]);
  const legacyInspection = recipeBehaviorLegacyInspection(authority, savedRecipeId);
  const hasRecipe = result.total_batch_g > 0;
  const previewInput =
    recalculationTerminal?.state === 'PREVIEW_READY'
      ? (preview?.proposedInput ?? directionBestCandidate?.proposedInput ?? null)
      : null;
  const previewMatch = useMemo(
    () =>
      previewInput ? monitorScoreView(calculateRecipe(previewInput), previewInput).match : null,
    [previewInput],
  );
  const current = hasRecipe && !awaitingRecalculation && monitorGate.ready && !legacyInspection;
  const displayedMatch = previewMatch ?? (current ? match : null);
  const scoreSource = scorePresentationSource({
    previewReady: previewMatch !== null,
    currentReady: current,
    hasAppliedHistory: appliedHistoryCount > 0,
  });
  const working = recalculationTerminal?.state === 'WORKING';
  const pending = !displayedMatch || awaitingRecalculation;

  if (variant === 'dock') {
    return (
      <div
        className="flex min-w-0 items-center gap-2"
        data-testid="workbench-intelligence-header"
        data-score-source={scoreSource ?? 'AWAITING_CALCULATION'}
        aria-label={`Dopasowanie techniczne receptury: ${displayedMatch ? displayedMatch.display : 'oczekuje na przeliczenie'}`}
      >
        {pending || working ? (
          <button
            type="button"
            onClick={onRecalculate}
            disabled={!onRecalculate || working}
            aria-busy={working}
            data-testid="pro-workbar-recalc"
            className="pro-focus-ring flex h-11 shrink-0 items-center gap-2 rounded-xl bg-[#f58a07] px-4 text-left text-white shadow-pro-e1 disabled:cursor-wait disabled:opacity-70"
          >
            <span aria-hidden className={working ? 'animate-spin text-xl' : 'text-xl'}>
              ↻
            </span>
            <span>
              <strong className="block text-xs font-semibold">
                {working ? 'Przeliczanie…' : 'Przelicz'}
              </strong>
              <span className="block text-[10px] text-white/85">
                {working ? 'PI przygotowuje wynik' : 'Zaktualizuj wynik receptury'}
              </span>
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenLearning}
            disabled={!onOpenLearning}
            className="pro-focus-ring flex h-11 shrink-0 items-center gap-2 rounded-xl border border-ink/10 bg-white px-3 text-left shadow-pro-e0 disabled:cursor-default"
          >
            <span
              className="grid size-9 shrink-0 place-items-center rounded-full border-[3px] border-[#63bd32] font-mono text-xs font-semibold tabular-nums text-ink"
              data-testid="workbench-score-ring"
            >
              {displayedMatch?.score ?? '—'}
            </span>
            <span className="hidden min-w-0 sm:block">
              <strong className="block text-xs font-semibold text-ink">
                {previewMatch ? 'Podgląd gotowy' : 'Wynik aktualny'}
              </strong>
              <span className="block text-[10px] text-stone-600">
                {displayedMatch
                  ? `${displayedMatch.display} · ${displayedMatch.label}`
                  : 'Brak danych'}
              </span>
            </span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={
        variant === 'global'
          ? 'min-w-0 bg-white text-ink'
          : 'border-b border-ink/8 bg-white px-3 py-2 text-ink'
      }
      data-testid="workbench-intelligence-header"
      data-score-source={scoreSource ?? 'AWAITING_CALCULATION'}
      aria-label={`Dopasowanie techniczne receptury: ${displayedMatch ? displayedMatch.display : 'oczekuje na przeliczenie'}`}
    >
      <button
        type="button"
        onClick={pending || working ? onRecalculate : onOpenLearning}
        disabled={working || (pending ? !onRecalculate : !onOpenLearning)}
        aria-busy={working}
        className={`pro-focus-ring flex items-center justify-end gap-3 rounded-[12px] text-right disabled:cursor-default ${variant === 'global' ? 'min-h-12 sm:min-w-[210px]' : 'min-h-14 w-full'}`}
      >
        <span className={variant === 'global' ? 'hidden min-w-0 sm:block' : 'min-w-0'}>
          <span className="flex items-center justify-end gap-2">
            <span
              aria-hidden
              className={`size-2 shrink-0 rounded-full ${current || previewMatch ? 'bg-[#18a83a]' : 'bg-[#f58a07]'}`}
            />
            <strong className="block truncate text-xs font-semibold text-ink">
              {previewMatch
                ? 'Podgląd gotowy'
                : current
                  ? 'Obliczenia zakończone'
                  : working
                    ? 'Przeliczanie…'
                  : legacyInspection
                    ? 'Podgląd historyczny'
                    : hasRecipe
                      ? 'Oczekuje na przeliczenie'
                      : 'Brak danych'}
            </strong>
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-stone-600">
            {displayedMatch
              ? `${displayedMatch.display} · ${previewMatch ? previewMatch.label : displayedMatch.label}`
              : 'Wynik pojawi się po przeliczeniu'}
          </span>
        </span>
        <span
          className="grid size-12 shrink-0 place-items-center rounded-[12px] bg-[#101113] font-mono text-lg font-semibold text-white shadow-pro-e1"
          data-testid="workbench-ai-mark"
        >
          AI
        </span>
      </button>
    </div>
  );
}
