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
}: {
  result: RecipeResult;
  input: RecipeInput;
  onOpenLearning?: () => void;
}) {
  const match = monitorScoreView(result, input).match;
  const toppings = useRecipeStore((state) => state.toppings);
  const snapshots = useRecipeStore((state) => state.productBehaviorSnapshots);
  const savedRecipeId = useRecipeStore((state) => state.savedRecipeId);
  const preview = useConstraintStudioStore((state) => state.preview);
  const directionBestCandidate = useConstraintStudioStore((state) => state.directionBestCandidate);
  const recalculationTerminal = useConstraintStudioStore((state) => state.recalculationTerminal);
  const appliedHistoryCount = useConstraintStudioStore((state) => state.history.length);
  const awaitingRecalculation = useRecipeProfileStore((state) => state.awaitingRecalculation);
  const authority = useMemo(
    () => buildRecipeBehaviorAuthority({ items: input.items, toppings, snapshots }),
    [input.items, snapshots, toppings],
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

  return (
    <header
      className="border-b border-ink/8 bg-white px-3 py-2 text-ink"
      data-testid="workbench-intelligence-header"
      data-score-source={scoreSource ?? 'AWAITING_CALCULATION'}
      aria-label={`Dopasowanie techniczne receptury: ${displayedMatch ? displayedMatch.display : 'oczekuje na przeliczenie'}`}
    >
      <button
        type="button"
        onClick={onOpenLearning}
        disabled={!onOpenLearning}
        className="pro-focus-ring flex min-h-14 w-full items-center justify-end gap-3 rounded-[12px] text-right disabled:cursor-default"
      >
        <span className="min-w-0">
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
        <span className="grid size-12 shrink-0 place-items-center rounded-[12px] bg-[#101113] font-mono text-lg font-semibold text-white shadow-pro-e1">
          AI
        </span>
      </button>
    </header>
  );
}
