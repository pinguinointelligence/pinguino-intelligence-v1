import { create } from 'zustand';

/**
 * UNSAVED customer-price edits, per recipe line — UI state only.
 *
 * This is NOT a second price persistence system: the price itself is owned by
 * `customerPriceStore` and saved through its existing `saveOverride` /
 * `resetOverride`. This store answers one presentational question the row needs
 * and the editor alone knew: "has the owner typed a new MOJA CENA here that has
 * not been saved yet?"
 *
 * It exists because the §8 marker signature deliberately excludes price. Price
 * arrives asynchronously from the database, and a value that can change without
 * the user touching anything cannot be evidence that the user touched
 * something — that mistake produced false markers three times in served QA. So
 * the row composes two states instead of overloading one:
 *
 *     ingredientChanged = recipeVectorChanged || customerPriceDirty
 *
 * Only a real keystroke in the price editor sets this, so hydration can never
 * raise it, and a successful save or reset clears it. It is deliberately NOT
 * persisted: an unsaved typed price does not survive a reload, so neither
 * should its marker.
 */
interface CustomerPriceDirtyState {
  dirtyByLineId: Readonly<Record<string, true>>;
  setDirty: (lineId: string, dirty: boolean) => void;
  clear: () => void;
}

export const useCustomerPriceDirtyStore = create<CustomerPriceDirtyState>((set) => ({
  dirtyByLineId: {},
  setDirty: (lineId, dirty) =>
    set((state) => {
      const already = state.dirtyByLineId[lineId] === true;
      if (already === dirty) return state;
      const next = { ...state.dirtyByLineId };
      if (dirty) next[lineId] = true;
      else delete next[lineId];
      return { dirtyByLineId: next };
    }),
  clear: () => set({ dirtyByLineId: {} }),
}));
