import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useRecipeStore } from '@/stores/recipeStore';
import { changedIngredientLineIds, type IngredientSignatureMap } from './ingredientChangeHighlight';

/**
 * Bump when `ingredientChangeSignature` changes shape — see the persist config.
 */
const SIGNATURE_FORMAT_VERSION = 2;

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
    {
      name: 'pinguino-ingredient-change-baseline',
      /**
       * The baseline is a comparison of SIGNATURE STRINGS, so the persisted
       * value is only meaningful against the exact signature format that wrote
       * it. Served staging QA proved the hazard: changing the gram precision
       * inside `ingredientChangeSignature` made every stored line differ, and
       * all 8 rows of a real recipe lit up on the first load after the deploy.
       *
       * BUMP THIS VERSION whenever `ingredientChangeSignature` changes shape.
       * An incompatible baseline is DISCARDED rather than misread: the hook
       * then treats the session as a cold start and marks nothing until the
       * draft is next clean, which is the honest answer — the application
       * genuinely does not know what the accepted state was.
       */
      version: SIGNATURE_FORMAT_VERSION,
      migrate: () => ({ baselineByLineId: {} }),
    },
  ),
);

/**
 * The line ids to mark as changed.
 *
 * THE RULE: a line is marked when it differs from the last ACCEPTED state of
 * the draft, and „accepted" is exactly what `recipeStore.dirty === false`
 * means — a load, a reopened version, or a successful save.
 *
 * So the baseline tracks the signatures continuously WHILE the draft is clean.
 * That is not a detail: the row's own values arrive asynchronously (the owner's
 * „MOJA CENA" overrides are fetched after first paint, and the UX meta store
 * rehydrates from storage), so a baseline frozen at first render would mark
 * every own-priced line as changed the moment its price landed — which is
 * precisely what served staging QA showed (5 of 8 lines on a real recipe).
 *
 * The consequence is deliberate and honest: a value that never dirties the
 * draft — an account-level price, the required/unavailable UX flags — is
 * absorbed into the accepted state instead of being marked, because the
 * application persists it immediately and there would be no pending state for
 * the marker to clear on. Everything the recipe vector owns (grams and
 * therefore %, the exclusive lock, the Main crown, a substituted product) does
 * dirty the draft and is marked until it is saved or applied.
 */
export function useChangedIngredientLines(signatures: IngredientSignatureMap): ReadonlySet<string> {
  const dirty = useRecipeStore((state) => state.dirty);
  const baseline = useIngredientChangeStore((state) => state.baselineByLineId);
  const captureBaseline = useIngredientChangeStore((state) => state.captureBaseline);
  const signatureKey = JSON.stringify(signatures);

  useEffect(() => {
    const parsed = JSON.parse(signatureKey) as IngredientSignatureMap;
    const known = Object.keys(useIngredientChangeStore.getState().baselineByLineId).length > 0;
    if (!dirty || !known) captureBaseline(parsed);
  }, [captureBaseline, dirty, signatureKey]);

  return useMemo(
    () => changedIngredientLineIds(JSON.parse(signatureKey) as IngredientSignatureMap, baseline),
    [baseline, signatureKey],
  );
}
