import { create } from 'zustand';
import type { CustomerIngredientPriceOverride } from '@/features/pro-core/costContracts';
import { resolveCustomerPricesRepository } from '@/features/pro-core/customerPricesRepo';
import { useRecipeStore } from '@/stores/recipeStore';

function invalidateEcoPreviewAfterPriceChange(): void {
  if (useRecipeStore.getState().formulation_strategy !== 'eco') return;
  useRecipeStore.setState((state) => ({
    dirty: true,
    draftRevision: state.draftRevision + 1,
  }));
}

type PriceLoadStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

interface CustomerPriceState {
  activeOwnerUserId: string | null;
  overridesByCanonicalId: Record<string, CustomerIngredientPriceOverride>;
  status: PriceLoadStatus;
  error: string | null;
  revision: number;
  loadForOwner: (ownerUserId: string) => Promise<void>;
  saveOverride: (input: {
    ownerUserId: string;
    canonicalIngredientId: string;
    pricePerKg: number;
    currency: string;
  }) => Promise<CustomerIngredientPriceOverride>;
  resetOverride: (ownerUserId: string, canonicalIngredientId: string) => Promise<void>;
  clear: () => void;
}

export const useCustomerPriceStore = create<CustomerPriceState>((set, get) => ({
  activeOwnerUserId: null,
  overridesByCanonicalId: {},
  status: 'idle',
  error: null,
  revision: 0,

  loadForOwner: async (ownerUserId) => {
    if (get().activeOwnerUserId === ownerUserId && get().status === 'ready') return;
    set({
      activeOwnerUserId: ownerUserId,
      overridesByCanonicalId: {},
      status: 'loading',
      error: null,
    });
    const selected = resolveCustomerPricesRepository();
    if (!selected.repository) {
      set({ status: 'unavailable' });
      return;
    }
    try {
      const rows = await selected.repository.listOverrides(ownerUserId);
      if (get().activeOwnerUserId !== ownerUserId) return;
      set({
        overridesByCanonicalId: Object.fromEntries(
          rows.map((row) => [row.canonicalIngredientId, row]),
        ),
        status: 'ready',
        revision: get().revision + 1,
      });
    } catch (error) {
      if (get().activeOwnerUserId !== ownerUserId) return;
      set({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  },

  saveOverride: async (input) => {
    const selected = resolveCustomerPricesRepository();
    if (!selected.repository) throw new Error('Customer price repository is unavailable.');
    const row = await selected.repository.upsertOverride({
      ...input,
      createdBy: input.ownerUserId,
    });
    let appliedToActiveOwner = false;
    set((state) => {
      if (state.activeOwnerUserId !== input.ownerUserId) return state;
      appliedToActiveOwner = true;
      return {
        overridesByCanonicalId: {
          ...state.overridesByCanonicalId,
          [row.canonicalIngredientId]: row,
        },
        status: 'ready',
        error: null,
        revision: state.revision + 1,
      };
    });
    if (appliedToActiveOwner) invalidateEcoPreviewAfterPriceChange();
    return row;
  },

  resetOverride: async (ownerUserId, canonicalIngredientId) => {
    const selected = resolveCustomerPricesRepository();
    if (!selected.repository) throw new Error('Customer price repository is unavailable.');
    await selected.repository.deleteOverride(ownerUserId, canonicalIngredientId);
    let appliedToActiveOwner = false;
    set((state) => {
      if (state.activeOwnerUserId !== ownerUserId) return state;
      appliedToActiveOwner = true;
      const next = { ...state.overridesByCanonicalId };
      delete next[canonicalIngredientId];
      return {
        overridesByCanonicalId: next,
        status: 'ready',
        error: null,
        revision: state.revision + 1,
      };
    });
    if (appliedToActiveOwner) invalidateEcoPreviewAfterPriceChange();
  },

  clear: () =>
    set((state) => ({
      activeOwnerUserId: null,
      overridesByCanonicalId: {},
      status: 'idle',
      error: null,
      revision: state.revision + 1,
    })),
}));
