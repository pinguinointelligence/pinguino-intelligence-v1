import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_INGREDIENT_ROW_META,
  type IngredientCustomerRole,
  type IngredientRowMeta,
} from './ingredientTableUx';
import type { ProductDoseMeta } from './productDoseSuggestion';

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
  setDoseMeta: (lineId: string, dose: ProductDoseMeta) => void;
  markDoseUserSet: (lineId: string) => void;
  clearLine: (lineId: string) => void;
  markRequiredRemoved: (lineId: string, name: string) => void;
  hydrateRecipeMeta: (
    metaByLineId: Readonly<
      Record<
        string,
        { role: IngredientCustomerRole; required: boolean; dose?: ProductDoseMeta }
      >
    >,
  ) => void;
  reset: () => void;
}

const metaFor = (
  state: Pick<IngredientTableUxState, 'metaByLineId'>,
  lineId: string,
): IngredientRowMeta => {
  const stored = state.metaByLineId[lineId];
  return stored
    ? {
        ...DEFAULT_INGREDIENT_ROW_META,
        ...stored,
        dose: { ...DEFAULT_INGREDIENT_ROW_META.dose, ...stored.dose },
      }
    : DEFAULT_INGREDIENT_ROW_META;
};

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
      setDoseMeta: (lineId, dose) =>
        set((state) => ({
          metaByLineId: {
            ...state.metaByLineId,
            [lineId]: { ...metaFor(state, lineId), dose: { ...dose } },
          },
        })),
      markDoseUserSet: (lineId) =>
        set((state) => {
          const current = metaFor(state, lineId);
          if (current.dose.provenance === 'NONE' || current.dose.provenance === 'USER_SET') {
            return state;
          }
          return {
            metaByLineId: {
              ...state.metaByLineId,
              [lineId]: {
                ...current,
                dose: { ...current.dose, provenance: 'USER_SET' },
              },
            },
          };
        }),
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
      hydrateRecipeMeta: (recipeMeta) =>
        set({
          metaByLineId: Object.fromEntries(
            Object.entries(recipeMeta).map(([lineId, meta]) => [
              lineId,
              {
                ...DEFAULT_INGREDIENT_ROW_META,
                role: meta.role,
                required: meta.required,
                dose: meta.dose
                  ? { ...meta.dose }
                  : { ...DEFAULT_INGREDIENT_ROW_META.dose },
              },
            ]),
          ),
          unresolvedRequiredByLineId: {},
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
): IngredientRowMeta => {
  const stored = metaByLineId[lineId];
  return stored
    ? {
        ...DEFAULT_INGREDIENT_ROW_META,
        ...stored,
        dose: { ...DEFAULT_INGREDIENT_ROW_META.dose, ...stored.dose },
      }
    : DEFAULT_INGREDIENT_ROW_META;
};

export const unresolvedRequiredIngredients = (
  state: Pick<IngredientTableUxState, 'unresolvedRequiredByLineId'>,
): UnresolvedRequiredIngredient[] => Object.values(state.unresolvedRequiredByLineId);
