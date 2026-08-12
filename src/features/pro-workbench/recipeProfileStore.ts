import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ProductMode, RecipeDirectionTarget, RecipeDirectionTargets } from '@/engine';
import type { VisibleProductType } from '@/features/studio/productType';
import {
  normalizeFormulationStrategy,
  type FormulationStrategy,
} from '@/features/formulation-strategy/strategy';

export type AdjustableAxisId = 'sweetness' | 'softness' | 'creaminess' | 'flavor';
export type DirectionTarget = RecipeDirectionTarget;
export type DirectionTargets = Readonly<RecipeDirectionTargets>;
export type DirectionIntent = -2 | -1 | 0 | 1 | 2;
export type DirectionIntents = Readonly<Record<AdjustableAxisId, DirectionIntent>>;

export const DEFAULT_DIRECTION_TARGETS: DirectionTargets = Object.freeze({
  sweetness: 0,
  softness: 0,
  creaminess: 0,
  flavor: 0,
});
export const DEFAULT_DIRECTION_INTENTS: DirectionIntents = Object.freeze({
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
  directionIntents?: DirectionIntents;
  ingredientUxByLineId?: Readonly<
    Record<string, { role: 'standard' | 'addition'; required: boolean }>
  >;
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

export interface RecipeProfileState {
  directionTargets: DirectionTargets;
  directionIntents: DirectionIntents;
  awaitingRecalculation: boolean;
  openedContextSeq: number | null;
  confirmedSignature: string | null;
  confirmedContextSeq: number | null;
  defaultsByOwner: Record<string, ProfileSettingsSnapshot>;
  openDraft: (contextSeq: number, targets?: DirectionTargets, intents?: DirectionIntents) => void;
  moveAxisTarget: (axis: AdjustableAxisId, delta: -1 | 1) => void;
  moveAxisIntent: (axis: AdjustableAxisId, delta: number) => void;
  setDirectionTargets: (targets: DirectionTargets) => void;
  acknowledgeRecalculation: () => void;
  confirmSettings: (signature: string, contextSeq: number) => void;
  isConfirmed: (signature: string, contextSeq: number) => boolean;
  saveDefaults: (ownerKey: string, settings: ProfileSettingsSnapshot) => void;
  replaceDefaultsForOwner: (
    ownerUserId: string,
    rows: readonly { productContextKey: VisibleProductType; settings: ProfileSettingsSnapshot }[],
  ) => void;
  defaultsFor: (ownerKey: string) => ProfileSettingsSnapshot | null;
  resetForTests: () => void;
}

const clampTarget = (value: number): DirectionTarget =>
  Math.max(-1, Math.min(1, value)) as DirectionTarget;
const clampIntent = (value: number): DirectionIntent =>
  Math.max(-2, Math.min(2, value)) as DirectionIntent;
const intentsFromTargets = (targets: DirectionTargets): DirectionIntents => ({
  sweetness: targets.sweetness,
  softness: targets.softness,
  creaminess: targets.creaminess,
  flavor: targets.flavor,
});

export const useRecipeProfileStore = create<RecipeProfileState>()(
  persist(
    (set, get) => ({
      directionTargets: DEFAULT_DIRECTION_TARGETS,
      directionIntents: DEFAULT_DIRECTION_INTENTS,
      awaitingRecalculation: false,
      openedContextSeq: null,
      confirmedSignature: null,
      confirmedContextSeq: null,
      defaultsByOwner: {},

      openDraft: (
        openedContextSeq,
        targets = DEFAULT_DIRECTION_TARGETS,
        intents = intentsFromTargets(targets),
      ) =>
        set({
          directionTargets: { ...targets },
          directionIntents: { ...intents },
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

      moveAxisIntent: (axis, delta) =>
        set((state) => ({
          directionIntents: {
            ...state.directionIntents,
            [axis]: clampIntent(state.directionIntents[axis] + delta),
          },
          awaitingRecalculation: true,
        })),

      setDirectionTargets: (directionTargets) => set({ directionTargets: { ...directionTargets } }),

      acknowledgeRecalculation: () => set({ awaitingRecalculation: false }),

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
              directionIntents: settings.directionIntents
                ? { ...settings.directionIntents }
                : undefined,
            },
          },
        })),

      replaceDefaultsForOwner: (ownerUserId, rows) =>
        set((state) => {
          const prefix = `${ownerUserId}:`;
          const defaultsByOwner = Object.fromEntries(
            Object.entries(state.defaultsByOwner).filter(([key]) => !key.startsWith(prefix)),
          );
          for (const row of rows) {
            defaultsByOwner[`${prefix}${row.productContextKey}`] = {
              ...row.settings,
              formulationStrategy: normalizeFormulationStrategy(
                row.settings.formulationStrategy ?? row.settings.mode,
              ),
              directionTargets: { ...row.settings.directionTargets },
              directionIntents: row.settings.directionIntents
                ? { ...row.settings.directionIntents }
                : undefined,
            };
          }
          return { defaultsByOwner };
        }),

      defaultsFor: (ownerKey) => {
        const stored = get().defaultsByOwner[ownerKey];
        return stored
          ? {
              ...stored,
              formulationStrategy: normalizeFormulationStrategy(
                stored.formulationStrategy ?? stored.mode,
              ),
              directionIntents: stored.directionIntents
                ? { ...stored.directionIntents }
                : undefined,
            }
          : null;
      },

      resetForTests: () =>
        set({
          directionTargets: DEFAULT_DIRECTION_TARGETS,
          directionIntents: DEFAULT_DIRECTION_INTENTS,
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
      partialize: recipeProfilePersistPartialize,
    },
  ),
);

/**
 * Keep the five-detent owner intent bound to the same persisted draft context.
 * Engine still owns the canonical three-state target; these fields only retain
 * the richer presentation intent across an ambient browser refresh.
 */
export function recipeProfilePersistPartialize(state: RecipeProfileState) {
  return {
    defaultsByOwner: state.defaultsByOwner,
    directionIntents: state.directionIntents,
    awaitingRecalculation: state.awaitingRecalculation,
    openedContextSeq: state.openedContextSeq,
  };
}
