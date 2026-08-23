import { useEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useRecipeStore } from '@/stores/recipeStore';
import { changedIngredientLineIds, type IngredientSignatureMap } from './ingredientChangeHighlight';

/**
 * Baseline of the last CLEAN ingredient state, so a changed line can be marked
 * subtly in the list (owner mobile UX §8). Presentation state only — it is
 * persisted so a reload does not silently erase „I changed something here",
 * and it is never read by the Engine, the solver or any save path.
 */
interface IngredientChangeState {
  baselineByLineId: IngredientSignatureMap;
  captureBaseline: (signatures: IngredientSignatureMap) => void;
  reset: () => void;
}

export const useIngredientChangeStore = create<IngredientChangeState>()(
  persist(
    (set) => ({
      baselineByLineId: {},
      captureBaseline: (baselineByLineId) => set({ baselineByLineId }),
      reset: () => set({ baselineByLineId: {} }),
    }),
    { name: 'pinguino-ingredient-change-baseline' },
  ),
);

/**
 * The line ids to mark as changed.
 *
 * The baseline is re-captured at the three moments the application itself
 * treats as „this is now the accepted state":
 *
 *  1. a cold start with nothing to compare against;
 *  2. the EDGE where the draft returns to clean (a successful save, an accepted
 *     load) — not merely „is clean", because some tracked values (own price,
 *     required, unavailable) legitimately never set the draft's dirty flag and
 *     would otherwise be swallowed by the baseline the instant they changed;
 *  3. a different recipe/version being opened (`draftContextSeq`).
 */
export function useChangedIngredientLines(signatures: IngredientSignatureMap): ReadonlySet<string> {
  const dirty = useRecipeStore((state) => state.dirty);
  const draftContextSeq = useRecipeStore((state) => state.draftContextSeq);
  const baseline = useIngredientChangeStore((state) => state.baselineByLineId);
  const captureBaseline = useIngredientChangeStore((state) => state.captureBaseline);
  const signatureKey = JSON.stringify(signatures);
  const previous = useRef<{ dirty: boolean; draftContextSeq: number } | null>(null);

  useEffect(() => {
    const parsed = JSON.parse(signatureKey) as IngredientSignatureMap;
    const before = previous.current;
    previous.current = { dirty, draftContextSeq };
    const coldStart =
      Object.keys(useIngredientChangeStore.getState().baselineByLineId).length === 0;
    const returnedToClean = before !== null && before.dirty && !dirty;
    const openedAnotherRecipe = before !== null && before.draftContextSeq !== draftContextSeq;
    if (coldStart || returnedToClean || openedAnotherRecipe) captureBaseline(parsed);
  }, [captureBaseline, dirty, draftContextSeq, signatureKey]);

  return useMemo(
    () => changedIngredientLineIds(JSON.parse(signatureKey) as IngredientSignatureMap, baseline),
    [baseline, signatureKey],
  );
}
