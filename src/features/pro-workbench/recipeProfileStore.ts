import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ProductMode, RecipeDirectionTarget, RecipeDirectionTargets } from '@/engine';
import type { VisibleProductType } from '@/features/studio/productType';
import type { ProductDoseMeta } from '@/features/ingredient-builder/productDoseSuggestion';
import type { RecipeBatchSource } from '@/stores/recipeStore';
import type { MachineTechnology } from '@/features/machine-catalog';
import {
  normalizeFormulationStrategy,
  type FormulationStrategy,
} from '@/features/formulation-strategy/strategy';

export type AdjustableAxisId = 'sweetness' | 'softness' | 'creaminess' | 'flavor';
export type DirectionTarget = RecipeDirectionTarget;
export type DirectionTargets = Readonly<RecipeDirectionTargets>;
export type DirectionIntent = RecipeDirectionTarget;
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

export interface PersistedIngredientUxMeta {
  role: 'standard' | 'addition';
  required: boolean;
  /** Optional for backward compatibility with every recipe saved before
   * picker-dose ownership existed. */
  dose?: ProductDoseMeta;
}

export interface ProfileSettingsSnapshot {
  visibleProductType: VisibleProductType;
  mode: ProductMode;
  formulationStrategy?: FormulationStrategy;
  targetBatchGrams: number;
  /** Explicit owner of the current recipe batch; optional only for legacy saves. */
  batchSource?: RecipeBatchSource;
  machineKind: 'professional' | 'home';
  machineId: string | null;
  machineLabel: string;
  machineTechnology?: MachineTechnology | null;
  servingModeId: string;
  targetTemperatureC: number;
  machineCapacityGrams: number | null;
  directionTargets: DirectionTargets;
  directionIntents?: DirectionIntents;
  ingredientUxByLineId?: Readonly<Record<string, PersistedIngredientUxMeta>>;
}

/** Material preflight signature. Draft identity, ingredient grams and direction
 * targets are deliberately separate/absent so a saved recipe can prove the
 * same settings after an exact reopen even when its transient context sequence
 * has advanced. */
export function profileSettingsSignature(settings: ProfileSettingsSnapshot): string {
  return JSON.stringify([
    settings.visibleProductType,
    settings.mode,
    normalizeFormulationStrategy(settings.formulationStrategy ?? settings.mode),
    settings.targetBatchGrams,
    settings.batchSource ??
      (settings.machineKind === 'home' ? 'MACHINE_DEFAULT' : 'PROFESSIONAL_USER_BATCH'),
    settings.machineKind,
    settings.machineId,
    settings.machineTechnology ?? null,
    settings.servingModeId,
    settings.targetTemperatureC,
    settings.machineCapacityGrams,
  ]);
}

export interface SavedRecipeProfileIdentity {
  savedRecipeId: string | null;
  currentVersionId: string | null;
  currentVersionNumber: number | null;
}

/** Immutable saved-recipe/version identity used by Profile confirmation and
 * calculated-result authority. An unsaved draft receives its own generated
 * identity in `openDraft`; a context sequence is never the identity by itself. */
export function savedRecipeProfileDraftIdentity(recipe: SavedRecipeProfileIdentity): string | null {
  if (recipe.savedRecipeId === null) return null;
  const versionIdentity =
    recipe.currentVersionId ??
    (recipe.currentVersionNumber === null ? 'unversioned' : `v${recipe.currentVersionNumber}`);
  return JSON.stringify(['saved-recipe', recipe.savedRecipeId, versionIdentity]);
}

export interface CalculatedRecipeAuthority {
  draftIdentity: string;
  recipeFingerprint: string;
  behaviorFingerprint: string;
}

export interface RecipeProfileState {
  directionTargets: DirectionTargets;
  directionIntents: DirectionIntents;
  awaitingRecalculation: boolean;
  openedContextSeq: number | null;
  activeDraftIdentity: string | null;
  confirmedSignature: string | null;
  confirmedDraftIdentity: string | null;
  confirmedContextSeq: number | null;
  calculatedRecipeAuthority: CalculatedRecipeAuthority | null;
  defaultsByOwner: Record<string, ProfileSettingsSnapshot>;
  /**
   * The PREFLIGHT refusal the recipe card is currently showing, or null.
   *
   * The save gate lives in `useCanonicalRecipeSave`, which only the workbar
   * calls. Settings needs the same fact — when the card refuses to save, that
   * is the module the owner has to act in — and recomputing the gate here
   * would be a second copy free to drift from the first. So the workbar
   * publishes what it renders and Settings reads it: one authority, one
   * message, no duplication. Scoped to the preflight refusal on purpose — a
   * sign-in prompt or a network error is not something Settings can resolve,
   * so those must never pull that module open. Deliberately transient: it is derived from the
   * draft and is absent from the persist allow-list below, so a reload
   * recomputes it rather than restoring a stale refusal.
   */
  preflightBlockMessage: string | null;
  setPreflightBlockMessage: (message: string | null) => void;
  openDraft: (
    contextSeq: number,
    targets?: DirectionTargets,
    intents?: DirectionIntents,
    exactSavedRecipeIdentity?: string | null,
  ) => void;
  rebindDraftIdentity: (identity: string) => void;
  moveAxisTarget: (axis: AdjustableAxisId, delta: -1 | 1) => void;
  moveAxisIntent: (axis: AdjustableAxisId, delta: number) => void;
  setDirectionTargets: (targets: DirectionTargets) => void;
  markRecalculationRequired: () => void;
  acknowledgeRecalculation: () => void;
  confirmSettings: (signature: string, draftIdentity: string, contextSeq: number) => void;
  isConfirmed: (signature: string, draftIdentity: string, contextSeq: number) => boolean;
  recordCalculatedRecipe: (authority: CalculatedRecipeAuthority) => void;
  /** The account's saved machine preference, resolved per product type. It is
   * a LOWER-priority source than a stored per-product default and is never
   * persisted here — it is derived from `MachinePreferenceStore` on sign-in. */
  machineAccountDefault: {
    ownerUserId: string;
    resolve: (visibleProductType: VisibleProductType) => ProfileSettingsSnapshot | null;
  } | null;
  setMachineAccountDefault: (
    ownerUserId: string | null,
    resolve: ((visibleProductType: VisibleProductType) => ProfileSettingsSnapshot | null) | null,
  ) => void;
  saveDefaults: (ownerKey: string, settings: ProfileSettingsSnapshot) => void;
  replaceDefaultsForOwner: (
    ownerUserId: string,
    rows: readonly { productContextKey: VisibleProductType; settings: ProfileSettingsSnapshot }[],
  ) => void;
  defaultsFor: (ownerKey: string) => ProfileSettingsSnapshot | null;
  resetForTests: () => void;
}

/**
 * The account's saved machine, applied to a PRODUCT-scoped key
 * (`<ownerUserId>:<product>`). Never the bare legacy owner key: `startNewRecipe`
 * reads that one to recover an older account-wide default and compares its
 * `visibleProductType`, and a machine preference has no product to compare.
 */
export function machineAccountFallback(
  machineAccountDefault: {
    ownerUserId: string;
    resolve: (visibleProductType: VisibleProductType) => ProfileSettingsSnapshot | null;
  } | null,
  ownerKey: string,
): ProfileSettingsSnapshot | null {
  if (machineAccountDefault === null) return null;
  const separator = ownerKey.indexOf(':');
  if (separator < 0) return null;
  if (ownerKey.slice(0, separator) !== machineAccountDefault.ownerUserId) return null;
  const product = ownerKey.slice(separator + 1);
  if (product.length === 0) return null;
  return machineAccountDefault.resolve(product as VisibleProductType);
}

/**
 * The saved machine WINS over a stored per-product default — for the machine
 * and the batch it implies, and for nothing else.
 *
 * Letting the stored default win outright was the reopened bug: an account
 * carrying an old `user_recipe_defaults` row (`machineKind: 'professional'`,
 * 1000 g, written months earlier by Account Recipe Defaults) could save any
 * Home machine and every new recipe still opened Professional 1000 g. The row
 * is a snapshot of what a recipe looked like once; the machine preference is
 * the customer saying which machine they own.
 *
 * Everything that is genuinely not a machine fact — Direction, mode, the
 * product itself — still comes from the stored default, because a machine
 * preference has no opinion about any of it.
 */
export function mergeMachineAccountDefault(
  stored: ProfileSettingsSnapshot,
  machine: ProfileSettingsSnapshot | null,
): ProfileSettingsSnapshot {
  if (machine === null) return stored;
  return {
    ...stored,
    machineKind: machine.machineKind,
    machineId: machine.machineId,
    machineLabel: machine.machineLabel,
    machineTechnology: machine.machineTechnology,
    machineCapacityGrams: machine.machineCapacityGrams,
    targetBatchGrams: machine.targetBatchGrams,
    batchSource: machine.batchSource,
    // The machine decides how it can serve; a stored temperature cannot
    // override a machine that supports only one visible mode.
    servingModeId: machine.servingModeId,
    targetTemperatureC: machine.targetTemperatureC,
  };
}

const clampTarget = (value: number): DirectionTarget =>
  Math.max(-2, Math.min(2, Math.round(value))) as DirectionTarget;
const clampIntent = (value: number): DirectionIntent =>
  Math.max(-2, Math.min(2, value)) as DirectionIntent;
const intentsFromTargets = (targets: DirectionTargets): DirectionIntents => ({
  sweetness: targets.sweetness,
  softness: targets.softness,
  creaminess: targets.creaminess,
  flavor: targets.flavor,
});

let generatedDraftIdentityCounter = 0;
const createUnsavedDraftIdentity = (): string => {
  const randomIdentity = globalThis.crypto?.randomUUID?.();
  if (randomIdentity) return JSON.stringify(['unsaved-draft', randomIdentity]);
  generatedDraftIdentityCounter += 1;
  return JSON.stringify(['unsaved-draft', Date.now(), generatedDraftIdentityCounter]);
};

const confirmationContextMatches = (
  draftIdentity: string,
  confirmedContextSeq: number | null,
  currentContextSeq: number,
): boolean =>
  draftIdentity.startsWith('["saved-recipe",') || confirmedContextSeq === currentContextSeq;

export const useRecipeProfileStore = create<RecipeProfileState>()(
  persist(
    (set, get) => ({
      directionTargets: DEFAULT_DIRECTION_TARGETS,
      directionIntents: DEFAULT_DIRECTION_INTENTS,
      machineAccountDefault: null,
      awaitingRecalculation: false,
      openedContextSeq: null,
      activeDraftIdentity: null,
      confirmedSignature: null,
      confirmedDraftIdentity: null,
      confirmedContextSeq: null,
      calculatedRecipeAuthority: null,
      defaultsByOwner: {},
      preflightBlockMessage: null,
      setPreflightBlockMessage: (message) =>
        set((state) => (state.preflightBlockMessage === message ? state : { preflightBlockMessage: message })),

      openDraft: (
        openedContextSeq,
        targets = DEFAULT_DIRECTION_TARGETS,
        intents = intentsFromTargets(targets),
        exactSavedRecipeIdentity = null,
      ) =>
        set((state) => {
          // Before five-step targets became canonical, saved/default metadata
          // could contain sign-only targets plus an exact five-detent mirror.
          // Prefer that exact mirror once, then keep both fields identical.
          const canonical = { ...intents };
          const activeDraftIdentity =
            exactSavedRecipeIdentity ??
            (state.openedContextSeq === openedContextSeq ? state.activeDraftIdentity : null) ??
            createUnsavedDraftIdentity();
          return {
            directionTargets: canonical,
            directionIntents: canonical,
            awaitingRecalculation: false,
            openedContextSeq,
            activeDraftIdentity,
          };
        }),

      rebindDraftIdentity: (activeDraftIdentity) =>
        set((state) => {
          const previousIdentity = state.activeDraftIdentity;
          if (previousIdentity === activeDraftIdentity) return state;
          return {
            activeDraftIdentity,
            confirmedDraftIdentity:
              state.confirmedDraftIdentity === previousIdentity
                ? activeDraftIdentity
                : state.confirmedDraftIdentity,
            calculatedRecipeAuthority:
              state.calculatedRecipeAuthority?.draftIdentity === previousIdentity
                ? { ...state.calculatedRecipeAuthority, draftIdentity: activeDraftIdentity }
                : state.calculatedRecipeAuthority,
          };
        }),

      moveAxisTarget: (axis, delta) =>
        set((state) => ({
          directionTargets: {
            ...state.directionTargets,
            [axis]: clampTarget(state.directionTargets[axis] + delta),
          },
          directionIntents: {
            ...state.directionIntents,
            [axis]: clampTarget(state.directionTargets[axis] + delta),
          },
          awaitingRecalculation: true,
        })),

      moveAxisIntent: (axis, delta) =>
        set((state) => ({
          directionTargets: {
            ...state.directionTargets,
            [axis]: clampTarget(state.directionIntents[axis] + delta),
          },
          directionIntents: {
            ...state.directionIntents,
            [axis]: clampIntent(state.directionIntents[axis] + delta),
          },
          awaitingRecalculation: true,
        })),

      setDirectionTargets: (directionTargets) =>
        set({
          directionTargets: { ...directionTargets },
          directionIntents: { ...directionTargets },
        }),

      markRecalculationRequired: () => set({ awaitingRecalculation: true }),

      acknowledgeRecalculation: () => set({ awaitingRecalculation: false }),

      confirmSettings: (confirmedSignature, confirmedDraftIdentity, confirmedContextSeq) =>
        set({ confirmedSignature, confirmedDraftIdentity, confirmedContextSeq }),

      isConfirmed: (signature, draftIdentity, contextSeq) => {
        const state = get();
        return (
          state.activeDraftIdentity === draftIdentity &&
          state.confirmedDraftIdentity === draftIdentity &&
          state.confirmedSignature === signature &&
          confirmationContextMatches(draftIdentity, state.confirmedContextSeq, contextSeq)
        );
      },

      recordCalculatedRecipe: (calculatedRecipeAuthority) =>
        set((state) =>
          state.activeDraftIdentity === calculatedRecipeAuthority.draftIdentity
            ? { calculatedRecipeAuthority }
            : state,
        ),

      saveDefaults: (ownerKey, settings) =>
        set((state) => ({
          defaultsByOwner: {
            ...state.defaultsByOwner,
            [ownerKey]: (() => {
              const canonical = settings.directionIntents ?? settings.directionTargets;
              return {
                ...settings,
                formulationStrategy: normalizeFormulationStrategy(settings.formulationStrategy),
                directionTargets: { ...canonical },
                directionIntents: { ...canonical },
              };
            })(),
          },
        })),

      replaceDefaultsForOwner: (ownerUserId, rows) =>
        set((state) => {
          const prefix = `${ownerUserId}:`;
          const defaultsByOwner = Object.fromEntries(
            Object.entries(state.defaultsByOwner).filter(([key]) => !key.startsWith(prefix)),
          );
          for (const row of rows) {
            const canonical = row.settings.directionIntents ?? row.settings.directionTargets;
            defaultsByOwner[`${prefix}${row.productContextKey}`] = {
              ...row.settings,
              formulationStrategy: normalizeFormulationStrategy(
                row.settings.formulationStrategy ?? row.settings.mode,
              ),
              directionTargets: { ...canonical },
              directionIntents: { ...canonical },
            };
          }
          return { defaultsByOwner };
        }),

      setMachineAccountDefault: (ownerUserId, resolve) =>
        set({
          machineAccountDefault:
            ownerUserId !== null && resolve !== null ? { ownerUserId, resolve } : null,
        }),

      defaultsFor: (ownerKey) => {
        const machine = machineAccountFallback(get().machineAccountDefault, ownerKey);
        const stored = get().defaultsByOwner[ownerKey];
        /* No stored default: the saved machine IS the default. With one: the
           saved machine still owns the machine and the batch, and the stored
           default keeps everything else. See `mergeMachineAccountDefault`. */
        if (!stored) return machine;
        const canonical = stored?.directionIntents ?? stored?.directionTargets;
        return mergeMachineAccountDefault(
          {
            ...stored,
            formulationStrategy: normalizeFormulationStrategy(
              stored.formulationStrategy ?? stored.mode,
            ),
            directionTargets: { ...canonical! },
            directionIntents: { ...canonical! },
          },
          machine,
        );
      },

      resetForTests: () =>
        set({
          directionTargets: DEFAULT_DIRECTION_TARGETS,
          directionIntents: DEFAULT_DIRECTION_INTENTS,
          awaitingRecalculation: false,
          openedContextSeq: null,
          activeDraftIdentity: null,
          confirmedSignature: null,
          confirmedDraftIdentity: null,
          confirmedContextSeq: null,
          calculatedRecipeAuthority: null,
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
 * `directionIntents` is a backward-compatible presentation mirror; the exact
 * canonical five-step target also lives in RecipeInput and drives Score/PI.
 */
export function recipeProfilePersistPartialize(state: RecipeProfileState) {
  return {
    defaultsByOwner: state.defaultsByOwner,
    directionIntents: state.directionIntents,
    awaitingRecalculation: state.awaitingRecalculation,
    openedContextSeq: state.openedContextSeq,
    activeDraftIdentity: state.activeDraftIdentity,
    confirmedSignature: state.confirmedSignature,
    confirmedDraftIdentity: state.confirmedDraftIdentity,
    confirmedContextSeq: state.confirmedContextSeq,
    calculatedRecipeAuthority: state.calculatedRecipeAuthority,
  };
}
