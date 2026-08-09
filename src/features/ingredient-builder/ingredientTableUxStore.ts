import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_INGREDIENT_ROW_META,
  type IngredientCustomerRole,
  type IngredientRowMeta,
} from './ingredientTableUx';

interface UnresolvedRequiredIngredient {
  lineId: string;
  name: string;
}

interface IngredientTableUxState {
  metaByLineId: Record<string, IngredientRowMeta>;
  unresolvedRequiredByLineId: Record<string, UnresolvedRequiredIngredient>;
  setRole: (lineId: string, role: IngredientCustomerRole) => void;
  toggleRequired: (lineId: string) => void;
  setUnavailable: (lineId: string, unavailable: boolean) => void;
  clearLine: (lineId: string) => void;
  markRequiredRemoved: (lineId: string, name: string) => void;
  reset: () => void;
}

const metaFor = (
  state: Pick<IngredientTableUxState, 'metaByLineId'>,
  lineId: string,
): IngredientRowMeta => state.metaByLineId[lineId] ?? DEFAULT_INGREDIENT_ROW_META;

export const useIngredientTableUxStore = create<IngredientTableUxState>()(
  persist(
    (set) => ({
      metaByLineId: {},
      unresolvedRequiredByLineId: {},
      setRole: (lineId, role) =>
        set((state) => ({
          metaByLineId: {
            ...state.metaByLineId,
            [lineId]: { ...metaFor(state, lineId), role },
          },
        })),
      toggleRequired: (lineId) =>
        set((state) => ({
          metaByLineId: {
            ...state.metaByLineId,
            [lineId]: {
              ...metaFor(state, lineId),
              required: !metaFor(state, lineId).required,
            },
          },
        })),
      setUnavailable: (lineId, unavailable) =>
        set((state) => ({
          metaByLineId: {
            ...state.metaByLineId,
            [lineId]: { ...metaFor(state, lineId), unavailable },
          },
        })),
      clearLine: (lineId) =>
        set((state) => {
          const metaByLineId = { ...state.metaByLineId };
          const unresolvedRequiredByLineId = { ...state.unresolvedRequiredByLineId };
          delete metaByLineId[lineId];
          delete unresolvedRequiredByLineId[lineId];
          return { metaByLineId, unresolvedRequiredByLineId };
        }),
      markRequiredRemoved: (lineId, name) =>
        set((state) => {
          const metaByLineId = { ...state.metaByLineId };
          delete metaByLineId[lineId];
          return {
            metaByLineId,
            unresolvedRequiredByLineId: {
              ...state.unresolvedRequiredByLineId,
              [lineId]: { lineId, name },
            },
          };
        }),
      reset: () => set({ metaByLineId: {}, unresolvedRequiredByLineId: {} }),
    }),
    {
      name: 'pinguino-ingredient-table-ux-v1',
      partialize: (state) => ({
        metaByLineId: state.metaByLineId,
        unresolvedRequiredByLineId: state.unresolvedRequiredByLineId,
      }),
    },
  ),
);

export const ingredientRowMeta = (
  metaByLineId: Record<string, IngredientRowMeta>,
  lineId: string,
): IngredientRowMeta => metaByLineId[lineId] ?? DEFAULT_INGREDIENT_ROW_META;

export const unresolvedRequiredIngredients = (
  state: Pick<IngredientTableUxState, 'unresolvedRequiredByLineId'>,
): UnresolvedRequiredIngredient[] => Object.values(state.unresolvedRequiredByLineId);
