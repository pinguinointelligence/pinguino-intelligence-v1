/**
 * GELLATTI HOME — the anonymous draft (§76–§80).
 *
 * ONE draft, on the device, surviving refresh and return, adopted into the account at
 * login (§77). It holds the INTENT and the flow's own answers — never the formulation:
 * once a recipe exists it lives in `recipeStore` like every other recipe, and this
 * store only remembers how the user got there so a purchase or a refresh can resume
 * exactly where they stopped (§76).
 *
 * §80: because there is exactly one slot, starting a new idea REPLACES it — so the
 * replacement is gated behind an explicit confirmation in the UI, and `startNew` is
 * deliberately a single obvious call rather than something a stray effect can trigger.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { IntentProfile, IntentRole } from './homeIntentParsing';
import type { HomeStage } from './homeStageFlow';

/**
 * One thing the user asked for, after identity resolution has (or has not) run.
 * `productId` is the resolved Gellatti/Mapper identity — `null` while unresolved or
 * ambiguous. §22: a chip without a `productId` is never used for recipe matching.
 */
export interface IntentChip {
  readonly id: string;
  /** What the user said — always displayed verbatim. */
  readonly label: string;
  readonly concept: string | null;
  readonly role: IntentRole | null;
  /** How this chip entered the intent (§19: three inputs, one flow). */
  readonly source: 'text' | 'voice' | 'scan';
  /** Resolved Mapper/catalogue identity, once resolution has run. */
  readonly productId: string | null;
  /** Canonical display name of the resolved product, when resolved. */
  readonly productName: string | null;
  /** True when resolution found several real products and the user must choose (§23). */
  readonly ambiguous: boolean;
  /**
   * The real catalogue products offered for a §23 choice. Kept ON the chip so the
   * question survives a refresh — an unanswered identity question that vanished would
   * leave the recipe quietly missing the ingredient the user asked for.
   */
  readonly candidates?: readonly { readonly id: string; readonly name: string }[];
}

export interface HomeDraftState {
  chips: readonly IntentChip[];
  profile: IntentProfile | null;
  /** True once `Create my recipe` closed intent collection (§18). */
  intentSubmitted: boolean;
  /** The stages the flow has actually put on screen (§84). */
  presentedStages: readonly HomeStage[];
  /** The furthest stage the user reached, so a return resumes there (§76, §79). */
  lastStage: HomeStage;
  /** Set once the first recipe has been generated into `recipeStore` (§51). */
  recipeReady: boolean;
  /** `Let's make it` was pressed (§66). */
  preparationStarted: boolean;
  /** The publication this draft was derived from, for lineage (§37). */
  derivedFromPublicationId: string | null;
  /** The official Gellatti recipe this draft was derived from (§38). */
  derivedFromOfficialRecipeId: string | null;
  /** A short human label of the source, for the attribution byline. */
  derivedFromLabel: string | null;
  /** Adopted into an account already? Prevents a second adoption on every render. */
  adoptedForUserId: string | null;

  addChip: (chip: IntentChip) => void;
  removeChip: (id: string) => void;
  resolveChip: (id: string, patch: Partial<IntentChip>) => void;
  setProfile: (profile: IntentProfile | null) => void;
  submitIntent: () => void;
  presentStage: (stage: HomeStage) => void;
  setLastStage: (stage: HomeStage) => void;
  markRecipeReady: (ready: boolean) => void;
  startPreparation: () => void;
  setDerivation: (input: {
    publicationId?: string | null;
    officialRecipeId?: string | null;
    label?: string | null;
  }) => void;
  markAdopted: (userId: string) => void;
  /** §80: replace the single draft. The confirmation lives in the UI, not here. */
  startNew: () => void;
  hasDraft: () => boolean;
}

export const HOME_DRAFT_STORAGE_KEY = 'gellatti.home.draft.v1';

const EMPTY = {
  chips: [] as readonly IntentChip[],
  profile: null as IntentProfile | null,
  intentSubmitted: false,
  presentedStages: ['intent'] as readonly HomeStage[],
  lastStage: 'intent' as HomeStage,
  recipeReady: false,
  preparationStarted: false,
  derivedFromPublicationId: null as string | null,
  derivedFromOfficialRecipeId: null as string | null,
  derivedFromLabel: null as string | null,
  adoptedForUserId: null as string | null,
};

export const useHomeDraftStore = create<HomeDraftState>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      addChip: (chip) =>
        set((state) =>
          // Same resolved product twice is one chip — the user meant it once.
          state.chips.some(
            (existing) =>
              existing.id === chip.id ||
              (chip.productId !== null && existing.productId === chip.productId) ||
              (chip.concept !== null && existing.concept === chip.concept),
          )
            ? state
            : { chips: [...state.chips, chip] },
        ),

      removeChip: (id) => set((state) => ({ chips: state.chips.filter((chip) => chip.id !== id) })),

      resolveChip: (id, patch) =>
        set((state) => ({
          chips: state.chips.map((chip) => (chip.id === id ? { ...chip, ...patch } : chip)),
        })),

      setProfile: (profile) => set({ profile }),
      submitIntent: () => set({ intentSubmitted: true }),

      presentStage: (stage) =>
        set((state) =>
          state.presentedStages.includes(stage)
            ? state
            : { presentedStages: [...state.presentedStages, stage] },
        ),

      setLastStage: (lastStage) => set({ lastStage }),
      markRecipeReady: (recipeReady) => set({ recipeReady }),
      startPreparation: () => set({ preparationStarted: true }),

      setDerivation: (input) =>
        set({
          derivedFromPublicationId:
            input.publicationId !== undefined
              ? input.publicationId
              : get().derivedFromPublicationId,
          derivedFromOfficialRecipeId:
            input.officialRecipeId !== undefined
              ? input.officialRecipeId
              : get().derivedFromOfficialRecipeId,
          derivedFromLabel: input.label !== undefined ? input.label : get().derivedFromLabel,
        }),

      markAdopted: (adoptedForUserId) => set({ adoptedForUserId }),
      startNew: () => set({ ...EMPTY }),
      hasDraft: () => {
        const state = get();
        return state.chips.length > 0 || state.recipeReady;
      },
    }),
    { name: HOME_DRAFT_STORAGE_KEY },
  ),
);
