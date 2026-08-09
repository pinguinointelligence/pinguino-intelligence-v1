import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ProductMode } from '@/engine';
import type { VisibleProductType } from '@/features/studio/productType';
import {
  normalizeFormulationStrategy,
  type FormulationStrategy,
} from '@/features/formulation-strategy/strategy';

export type AdjustableAxisId = 'sweetness' | 'softness' | 'creaminess' | 'flavor';
export type DirectionTarget = -2 | -1 | 0 | 1 | 2;
export type DirectionTargets = Readonly<Record<AdjustableAxisId, DirectionTarget>>;

export const DEFAULT_DIRECTION_TARGETS: DirectionTargets = Object.freeze({
  sweetness: 0,
  softness: 0,
  creaminess: 0,
  flavor: 0,
});

export const showsProfessionalServing = (machineKind: 'professional' | 'home' | null): boolean =>
  machineKind !== 'home';

export interface ProfileSettingsSnapshot {
  visibleProductType: VisibleProductType;
  mode: ProductMode;
  formulationStrategy?: FormulationStrategy;
  targetBatchGrams: number;
  machineKind: 'professional' | 'home';
  machineId: string | null;
  machineLabel: string;
  servingModeId: string;
  targetTemperatureC: number;
  machineCapacityGrams: number | null;
  directionTargets: DirectionTargets;
}

/** Material preflight signature. Ingredient grams and direction targets are deliberately absent. */
export function profileSettingsSignature(
  settings: ProfileSettingsSnapshot,
  draftContextSeq: number,
): string {
  return JSON.stringify([
    draftContextSeq,
    settings.visibleProductType,
    settings.mode,
    normalizeFormulationStrategy(settings.formulationStrategy ?? settings.mode),
    settings.targetBatchGrams,
    settings.machineKind,
    settings.machineId,
    settings.servingModeId,
    settings.targetTemperatureC,
    settings.machineCapacityGrams,
  ]);
}

interface RecipeProfileState {
  directionTargets: DirectionTargets;
  awaitingRecalculation: boolean;
  openedContextSeq: number | null;
  confirmedSignature: string | null;
  confirmedContextSeq: number | null;
  defaultsByOwner: Record<string, ProfileSettingsSnapshot>;
  openDraft: (contextSeq: number, targets?: DirectionTargets) => void;
  moveAxisTarget: (axis: AdjustableAxisId, delta: -1 | 1) => void;
  setDirectionTargets: (targets: DirectionTargets) => void;
  confirmSettings: (signature: string, contextSeq: number) => void;
  isConfirmed: (signature: string, contextSeq: number) => boolean;
  saveDefaults: (ownerKey: string, settings: ProfileSettingsSnapshot) => void;
  defaultsFor: (ownerKey: string) => ProfileSettingsSnapshot | null;
  resetForTests: () => void;
}

const clampTarget = (value: number): DirectionTarget =>
  Math.max(-2, Math.min(2, value)) as DirectionTarget;

export const useRecipeProfileStore = create<RecipeProfileState>()(
  persist(
    (set, get) => ({
      directionTargets: DEFAULT_DIRECTION_TARGETS,
      awaitingRecalculation: false,
      openedContextSeq: null,
      confirmedSignature: null,
      confirmedContextSeq: null,
      defaultsByOwner: {},

      openDraft: (openedContextSeq, targets = DEFAULT_DIRECTION_TARGETS) =>
        set({
          directionTargets: { ...targets },
          awaitingRecalculation: false,
          openedContextSeq,
          confirmedSignature: null,
          confirmedContextSeq: null,
        }),

      moveAxisTarget: (axis, delta) =>
        set((state) => ({
          directionTargets: {
            ...state.directionTargets,
            [axis]: clampTarget(state.directionTargets[axis] + delta),
          },
          awaitingRecalculation: true,
        })),

      setDirectionTargets: (directionTargets) => set({ directionTargets: { ...directionTargets } }),

      confirmSettings: (confirmedSignature, confirmedContextSeq) =>
        set({ confirmedSignature, confirmedContextSeq }),

      isConfirmed: (signature, contextSeq) => {
        const state = get();
        return state.confirmedSignature === signature && state.confirmedContextSeq === contextSeq;
      },

      saveDefaults: (ownerKey, settings) =>
        set((state) => ({
          defaultsByOwner: {
            ...state.defaultsByOwner,
            [ownerKey]: {
              ...settings,
              formulationStrategy: normalizeFormulationStrategy(settings.formulationStrategy),
              directionTargets: { ...settings.directionTargets },
            },
          },
        })),

      defaultsFor: (ownerKey) => {
        const stored = get().defaultsByOwner[ownerKey];
        return stored
          ? {
              ...stored,
              formulationStrategy: normalizeFormulationStrategy(
                stored.formulationStrategy ?? stored.mode,
              ),
            }
          : null;
      },

      resetForTests: () =>
        set({
          directionTargets: DEFAULT_DIRECTION_TARGETS,
          awaitingRecalculation: false,
          openedContextSeq: null,
          confirmedSignature: null,
          confirmedContextSeq: null,
          defaultsByOwner: {},
        }),
    }),
    {
      name: 'pinguino-profile-preferences-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ defaultsByOwner: state.defaultsByOwner }),
    },
  ),
);
