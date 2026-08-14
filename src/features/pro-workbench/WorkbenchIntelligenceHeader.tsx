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
  const awaitingRecalculation = useRecipeProfileStore((state) => state.awaitingRecalculation);
  const authority = useMemo(
    () => buildRecipeBehaviorAuthority({ items: input.items, toppings, snapshots }),
    [input.items, snapshots, toppings],
  );
  const monitorGate = useMemo(() => recipeBehaviorModuleGate(authority, 'MONITOR'), [authority]);
  const legacyInspection = recipeBehaviorLegacyInspection(authority, savedRecipeId);
  const hasRecipe = result.total_batch_g > 0;
  const previewInput = recalculationTerminal?.state === 'PREVIEW_READY'
    ? preview?.proposedInput ?? directionBestCandidate?.proposedInput ?? null
    : null;
  const previewMatch = useMemo(
    () => previewInput ? monitorScoreView(calculateRecipe(previewInput), previewInput).match : null,
    [previewInput],
  );
  const current = hasRecipe && !awaitingRecalculation && monitorGate.ready && !legacyInspection;
  const displayedMatch = previewMatch ?? (current ? match : null);

  return (
    <header
      className="border-b border-white/10 bg-[#17191d]/95 px-4 py-4 text-white shadow-pro-e2 backdrop-blur-xl 2xl:h-[86px] 2xl:px-[64px] 2xl:py-[18px]"
      data-testid="workbench-intelligence-header"
      aria-label={`Dopasowanie techniczne receptury: ${displayedMatch ? displayedMatch.display : 'oczekuje na przeliczenie'}`}
    >
      <button
        type="button"
        onClick={onOpenLearning}
        disabled={!onOpenLearning}
        className="pro-focus-ring flex min-h-14 w-full items-center gap-4 rounded-[18px] text-left disabled:cursor-default 2xl:h-[50px] 2xl:min-h-0"
      >
        <span className="grid size-14 shrink-0 place-items-center rounded-[18px] border border-[#d7b768]/45 bg-white/[0.055] font-mono text-xl font-semibold tabular-nums text-[#f6efe0] shadow-pro-e0 2xl:size-[50px] 2xl:rounded-[16px] 2xl:text-base">
          {displayedMatch ? displayedMatch.display : '—/10'}
        </span>
        <span className="min-w-0 flex-1 2xl:flex 2xl:items-start 2xl:gap-2">
          <span
            aria-hidden
            className="mt-[9px] hidden size-1.5 shrink-0 rounded-full bg-[#d7b768] 2xl:block"
          />
          <span className="min-w-0">
            <span className="block text-[12px] font-medium text-[#d7b768] 2xl:hidden">
              Dopasowanie techniczne receptury
            </span>
            <strong className="mt-0.5 block text-base font-semibold text-white 2xl:mt-1 2xl:text-xs">
              {previewMatch
                ? `Podgląd · ${previewMatch.label}`
                : current
                  ? match.label
                  : legacyInspection
                  ? 'Podgląd historyczny'
                  : hasRecipe
                    ? 'Oczekuje na przeliczenie'
                    : 'Brak danych'}
            </strong>
            <span className="mt-1 block text-xs leading-relaxed text-white/62 2xl:hidden">
              Bieżąca receptura · wynik nie zmienia miejsca między zakładkami
            </span>
            <span className="mt-1 hidden text-[9px] leading-none text-white/40 2xl:block">
              Dlaczego ?
            </span>
          </span>
        </span>
        {onOpenLearning ? (
          <span className="text-xl text-white/45" aria-hidden>
            ›
          </span>
        ) : null}
      </button>
    </header>
  );
}
