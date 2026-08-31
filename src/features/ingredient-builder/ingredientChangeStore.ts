import { useMemo } from 'react';
import { create } from 'zustand';

/**
 * Session-only presentation evidence for the latest Recalculate result.
 *
 * It is deliberately not persisted: after a recipe is reopened there is no
 * Recalculate before/after pair in the new session, so showing an old marker
 * would be a false claim. The Engine, recipe dirty/version state, pricing and
 * save paths never read this store.
 */
interface IngredientChangeState {
  changedByLastRecalculation: readonly string[];
  captureRecalculation: (lineIds: Iterable<string>) => void;
  clearRecalculation: () => void;
  reset: () => void;
}

export const useIngredientChangeStore = create<IngredientChangeState>((set) => ({
  changedByLastRecalculation: [],
  captureRecalculation: (lineIds) => set({ changedByLastRecalculation: [...new Set(lineIds)] }),
  clearRecalculation: () => set({ changedByLastRecalculation: [] }),
  reset: () => set({ changedByLastRecalculation: [] }),
}));

/** The exact marker source consumed by both desktop and mobile recipe rows. */
export function useRecalculatedIngredientLines(): ReadonlySet<string> {
  const ids = useIngredientChangeStore((state) => state.changedByLastRecalculation);
  return useMemo(() => new Set(ids), [ids]);
}
