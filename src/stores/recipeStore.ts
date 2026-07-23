/**
 * Recipe working state — the goal fields + ingredient lines the user edits.
 *
 * This store holds INPUT only. It never stores computed numbers: the engine
 * result is derived on demand via buildRecipeInput + calculateRecipe
 * (useStudioResult). Persisted to localStorage so a demo survives reload.
 *
 * Curated demo scenarios load atomically via loadPreset (Step 5C); the store
 * seeds the default Milk Base preset.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_PRESET, type DemoPreset, type PresetId } from '@/data/demoPresets';
import {
  gelatoInternalCategory,
  internalCategoryFor,
  visibleTypeOf,
  type VisibleProductType,
} from '@/features/studio/productType';
import type { EngineIngredient, LockType, ProductCategory, ProductMode, RecipeGoals, RecipeInput, RecipeItem } from '@/engine';

type FlavorIntensity = NonNullable<RecipeGoals['flavor_intensity']>;
type CostPriority = NonNullable<RecipeGoals['cost_priority']>;

export interface RecipeState {
  mode: ProductMode;
  category: ProductCategory;
  /**
   * The CUSTOMER-FACING product type (owner P0): exactly Gelato/Sorbet/Vegan/Protein. `category`
   * is the INTERNAL Engine calculation policy, DERIVED from the visible type + real ingredients
   * (chocolate/nut/fruit/alcohol route internally; never a visible type). 'protein' is honest-
   * unsupported: it never silently re-profiles the recipe.
   */
  visibleProductType: VisibleProductType;
  target_temperature_c: number;
  target_batch_grams: number;
  machine_capacity_grams: number | null;
  flavor_intensity: FlavorIntensity;
  cost_priority: CostPriority;
  items: RecipeItem[];
  /** Canonical ingredient ids the user explicitly removed — the formulation
   * toolbox never reintroduces them (cleared by adding the ingredient back). */
  excludedIngredientIds: string[];
  /** Last loaded demo preset (drives the selector highlight); null after a manual reset to none. */
  activePresetId: PresetId | null;
  /**
   * The CANONICAL saved-recipe aggregate link (= `saved_recipes.id` = pro-core `recipeId`).
   * Drives the ONE save flow: null → "Zapisz recepturę" (create); set → "Zapisz nową wersję".
   * Persisted so version continuity survives reload/login; the adapter always re-reads the
   * DB's authoritative `latest_version_number`, so a stale link can never fabricate a number.
   */
  savedRecipeId: string | null;
  /** Name of the linked aggregate (prefills the Save dialog + shows in the button state). */
  savedRecipeName: string | null;
  /** The linked aggregate's latest persisted version number (display only; DB is authoritative). */
  currentVersionNumber: number | null;
  /** ISO date of the current version (drives the `DD.MM.YYYY · vN` label; persisted). */
  currentVersionDate: string | null;
  /**
   * Pro machine/serving selection context (S4). Drives the workbar context line + which visible
   * serving mode routes the recipe. It NEVER changes Engine math — the temperature it carries is
   * always an existing supported cell set on `target_temperature_c`. Reset to null on account
   * switch via resetToDemo (cross-account isolation).
   */
  machineKind: 'professional' | 'home' | null;
  /** The selected ServingModeId (fresh/temp_minus_11/12/13 for professional; the machine's mode for home). */
  servingModeId: string | null;
  /** The selected Home machine's catalog id (null for the professional machine). */
  machineId: string | null;
  /** Display label ("Maszyna profesjonalna" or the Home machine name). */
  machineLabel: string | null;
  /** Unsaved-changes flag: true after any edit, false after a load or a successful save. */
  dirty: boolean;

  setMode: (mode: ProductMode) => void;
  setCategory: (category: ProductCategory) => void;
  /** Pick the visible product type; the internal category derives from it + the ingredients. */
  setVisibleProductType: (visible: VisibleProductType) => void;
  /** Pick a serving mode (Świeże/−11/−12/−13) — ONE state drives mode + Engine temperature. */
  setServingMode: (servingModeId: string, temperatureC: number) => void;
  setTargetTemperature: (temperature_c: number) => void;
  setBatchGrams: (grams: number) => void;
  setMachineCapacity: (grams: number | null) => void;
  setFlavorIntensity: (value: FlavorIntensity) => void;
  setCostPriority: (value: CostPriority) => void;

  /**
   * Owner P0 (Apply data integrity) — the ONLY sanctioned write for a verified
   * complete next RecipeInput. Validates EVERY line (stable id present, grams
   * finite, not NaN, not negative), independently recomputes the total and
   * requires it to equal `input.target_batch_grams` within the batch tolerance
   * (planned recipes), writes items + batch in ONE atomic setState, then reads
   * back and VERIFIES the write — any mismatch rolls back to the exact prior
   * draft. Never coerces a missing amount to zero.
   */
  applyVerifiedRecipeInput: (input: RecipeInput) =>
    | { ok: true }
    | { ok: false; code: 'invalid_line'; lineName: string }
    | { ok: false; code: 'batch_mismatch'; sum: number; target: number }
    | { ok: false; code: 'write_verification_failed' };
  addIngredient: (ingredient: EngineIngredient, grams?: number) => void;
  removeItem: (lineId: string) => void;
  /** Owner P0 repair: fold plannable duplicate-ingredient lines into one (explicit action). */
  mergeDuplicateIngredientLines: () => void;
  setPlannedGrams: (lineId: string, grams: number) => void;
  setActualGrams: (lineId: string, grams: number | null) => void;
  setLockType: (lineId: string, lockType: LockType) => void;
  /** Marks one line as the main ingredient; clears any previous main line. */
  setMainIngredient: (lineId: string) => void;
  /** Atomically replace goal + ingredients with a curated demo scenario. */
  loadPreset: (preset: DemoPreset) => void;
  /** Atomically load a saved recipe's RecipeInput (the stored source of truth) and LINK it to
   * its aggregate so the next save appends a new version (not a copy). Clears the dirty flag. */
  loadRecipeInput: (
    input: RecipeInput,
    link?: {
      savedId?: string | null;
      savedName?: string | null;
      versionNumber?: number | null;
      versionDate?: string | null;
    },
  ) => void;
  /** Link the draft to its persisted aggregate after a create/version/restore. Clears dirty. */
  markSaved: (id: string, name: string, versionNumber: number, versionDate?: string | null) => void;
  /** Select a Pro machine/serving mode (S4): sets the routing temperature + context + optional batch. */
  setMachineSelection: (sel: {
    kind: 'professional' | 'home';
    servingModeId: string;
    machineId: string | null;
    label: string;
    temperatureC: number;
    batchGrams?: number | null;
  }) => void;
  resetToDemo: () => void;
}

let lineSeq = 0;
const nextLineId = (): string => `line-${Date.now().toString(36)}-${(lineSeq++).toString(36)}`;

const makeLine = (
  ingredient: EngineIngredient,
  planned_grams: number,
  lock_type: LockType = 'unlocked',
): RecipeItem => ({
  id: nextLineId(),
  ingredient,
  planned_grams,
  actual_grams: null,
  lock_type,
});

/** Snapshot of a preset as fresh store state (items cloned so edits never touch preset data). */
const fromPreset = (preset: DemoPreset) => ({
  mode: preset.mode,
  category: preset.category,
  visibleProductType: visibleTypeOf(preset.category),
  target_temperature_c: preset.target_temperature_c,
  target_batch_grams: preset.target_batch_grams,
  machine_capacity_grams: preset.machine_capacity_grams,
  flavor_intensity: preset.flavor_intensity,
  cost_priority: preset.cost_priority,
  items: preset.items.map((item) => ({ ...item })),
  activePresetId: preset.id,
  savedRecipeId: null,
  savedRecipeName: null,
  currentVersionNumber: null,
  currentVersionDate: null,
  machineKind: null,
  servingModeId: null,
  machineId: null,
  machineLabel: null,
  dirty: false,
});

/**
 * Persisted slice — recipe content + the preset highlight + the CANONICAL aggregate link
 * (`savedRecipeId`/`savedRecipeName`/`currentVersionNumber`/`dirty`). Persisting the link is
 * what makes version numbering survive reload/login (the S2-repair requirement): the next save
 * appends v(n+1) to the SAME aggregate instead of starting a new one at v1. A stale link is safe
 * because the adapter re-reads the DB's authoritative `latest_version_number` and fails honestly
 * (offering "save as new") if the aggregate is gone.
 */
export function recipePersistPartialize(state: RecipeState) {
  return {
    mode: state.mode,
    category: state.category,
    visibleProductType: state.visibleProductType,
    target_temperature_c: state.target_temperature_c,
    target_batch_grams: state.target_batch_grams,
    machine_capacity_grams: state.machine_capacity_grams,
    flavor_intensity: state.flavor_intensity,
    cost_priority: state.cost_priority,
    items: state.items,
    activePresetId: state.activePresetId,
    savedRecipeId: state.savedRecipeId,
    savedRecipeName: state.savedRecipeName,
    currentVersionNumber: state.currentVersionNumber,
    currentVersionDate: state.currentVersionDate,
    machineKind: state.machineKind,
    servingModeId: state.servingModeId,
    machineId: state.machineId,
    machineLabel: state.machineLabel,
    dirty: state.dirty,
  };
}

export const useRecipeStore = create<RecipeState>()(
  persist(
    (set) => ({
      ...fromPreset(DEFAULT_PRESET),
      excludedIngredientIds: [],

      setMode: (mode) => set({ mode, dirty: true }),
      // Direct internal-category writes (QA/diagnostic/tests) keep the visible projection coherent.
      setCategory: (category) => set({ category, visibleProductType: visibleTypeOf(category), dirty: true }),
      setVisibleProductType: (visible) =>
        set((state) => ({
          visibleProductType: visible,
          // The internal Engine policy DERIVES from the visible type + real ingredients;
          // 'protein' is honest-unsupported and keeps the previous category untouched.
          category: internalCategoryFor(visible, state.items, state.category),
          dirty: true,
        })),
      setServingMode: (servingModeId, temperatureC) =>
        set((state) => ({
          servingModeId,
          target_temperature_c: temperatureC,
          // A manual serving-mode choice keeps a professional machine route but clears a Home
          // route (a Home machine's mode is fixed by the machine — owner P0 route integrity).
          ...(state.machineKind === 'home'
            ? { machineKind: null, machineId: null, machineLabel: null }
            : {}),
          dirty: true,
        })),
      // A MANUAL temperature change overrides any machine/serving route (owner P0 temperature
      // contract): clearing the machine context keeps the visible selection, the Engine input
      // and every label in agreement — a route mismatch becomes unrepresentable.
      setTargetTemperature: (target_temperature_c) =>
        set({
          target_temperature_c,
          machineKind: null,
          servingModeId: null,
          machineId: null,
          machineLabel: null,
          dirty: true,
        }),
      setBatchGrams: (target_batch_grams) => set({ target_batch_grams, dirty: true }),
      setMachineCapacity: (machine_capacity_grams) => set({ machine_capacity_grams, dirty: true }),
      setFlavorIntensity: (flavor_intensity) => set({ flavor_intensity, dirty: true }),
      setCostPriority: (cost_priority) => set({ cost_priority, dirty: true }),

      applyVerifiedRecipeInput: (input) => {
        // Phase 5 — reject missing/invalid amounts (never coerce to zero).
        for (const item of input.items) {
          const grams = item.planned_grams;
          if (
            !item.ingredient?.id ||
            typeof grams !== 'number' ||
            Number.isNaN(grams) ||
            !Number.isFinite(grams) ||
            grams < 0
          ) {
            return { ok: false, code: 'invalid_line', lineName: item.ingredient?.name ?? item.id };
          }
        }
        // Phase 6 — the door of last resort recomputes the total ITSELF.
        const hasActuals = input.items.some((item) => item.actual_grams !== null);
        const sum = input.items.reduce((total, item) => total + item.planned_grams, 0);
        if (!hasActuals && Math.abs(sum - input.target_batch_grams) > 0.1) {
          return { ok: false, code: 'batch_mismatch', sum, target: input.target_batch_grams };
        }
        // Phase 7 — atomic write + read-back verification with rollback.
        const prior = useRecipeStore.getState();
        const priorItems = prior.items;
        const priorBatch = prior.target_batch_grams;
        const nextItems = input.items.map((item) => ({ ...item }));
        set({ items: nextItems, target_batch_grams: input.target_batch_grams, dirty: true });
        const written = useRecipeStore.getState();
        const writtenSum = written.items.reduce((total, item) => total + item.planned_grams, 0);
        const intact =
          written.items.length === nextItems.length &&
          written.items.every(
            (item, index) =>
              item.id === nextItems[index]!.id &&
              Object.is(item.planned_grams, nextItems[index]!.planned_grams),
          ) &&
          (hasActuals || Math.abs(writtenSum - input.target_batch_grams) <= 0.1);
        if (!intact) {
          set({ items: priorItems, target_batch_grams: priorBatch });
          return { ok: false, code: 'write_verification_failed' };
        }
        return { ok: true };
      },

      addIngredient: (ingredient, grams = 100) =>
        set((state) => {
          const items = [...state.items, makeLine(ingredient, grams)];
          return {
            items,
            // Visible GELATO re-routes its INTERNAL category from the real ingredients
            // (chocolate/nut/fruit/alcohol are classifications, never visible types).
            ...(state.visibleProductType === 'gelato' ? { category: gelatoInternalCategory(items) } : {}),
            // Explicitly adding an ingredient back clears its exclusion (Phase 3
            // input semantics: removed returns ONLY through an explicit add).
            excludedIngredientIds: state.excludedIngredientIds.filter((id) => id !== ingredient.id),
            dirty: true,
          };
        }),

      removeItem: (lineId) =>
        set((state) => {
          const removed = state.items.find((item) => item.id === lineId);
          const items = state.items.filter((item) => item.id !== lineId);
          return {
            items,
            ...(state.visibleProductType === 'gelato' ? { category: gelatoInternalCategory(items) } : {}),
            // Owner P0 (formulation): a REMOVED ingredient is excluded — PI must
            // never silently reintroduce it via the toolbox.
            excludedIngredientIds:
              removed && !state.excludedIngredientIds.includes(removed.ingredient.id)
                ? [...state.excludedIngredientIds, removed.ingredient.id]
                : state.excludedIngredientIds,
            dirty: true,
          };
        }),

      /**
       * Owner P0 (recalc duplication) — REPAIR for drafts saved before the
       * canonical-identity fix: fold every later PLANNABLE (unlocked, nothing
       * poured) line of an already-seen ingredient into the first such line
       * (grams summed). Locked/poured lines and genuinely different
       * ingredients are never touched. Explicit user action — never automatic.
       */
      mergeDuplicateIngredientLines: () =>
        set((state) => {
          const keepByIngredient = new Map<string, RecipeItem>();
          const items: RecipeItem[] = [];
          let merged = false;
          for (const item of state.items) {
            const plannable = item.lock_type === 'unlocked' && item.actual_grams === null;
            if (!plannable) {
              items.push(item);
              continue;
            }
            const keep = keepByIngredient.get(item.ingredient.id);
            if (keep) {
              keep.planned_grams += item.planned_grams;
              merged = true;
              continue;
            }
            const copy = { ...item };
            keepByIngredient.set(item.ingredient.id, copy);
            items.push(copy);
          }
          return merged ? { items, dirty: true } : {};
        }),

      setPlannedGrams: (lineId, grams) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === lineId ? { ...item, planned_grams: Math.max(0, grams) } : item,
          ),
          dirty: true,
        })),

      setActualGrams: (lineId, grams) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === lineId
              ? { ...item, actual_grams: grams === null ? null : Math.max(0, grams) }
              : item,
          ),
          dirty: true,
        })),

      setLockType: (lineId, lockType) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === lineId ? { ...item, lock_type: lockType } : item,
          ),
          dirty: true,
        })),

      setMainIngredient: (lineId) =>
        set((state) => ({
          items: state.items.map((item) => {
            if (item.id === lineId) return { ...item, lock_type: 'main' };
            // demote any previous main line back to unlocked
            return item.lock_type === 'main' ? { ...item, lock_type: 'unlocked' } : item;
          }),
          dirty: true,
        })),

      loadPreset: (preset) => set({ ...fromPreset(preset), excludedIngredientIds: [] }),
      loadRecipeInput: (input, link = {}) =>
        set({
          mode: input.mode,
          category: input.category,
          visibleProductType: visibleTypeOf(input.category),
          target_temperature_c: input.target_temperature_c,
          target_batch_grams: input.target_batch_grams,
          machine_capacity_grams: input.machine_capacity_grams,
          flavor_intensity: input.goals?.flavor_intensity ?? 'balanced',
          cost_priority: input.goals?.cost_priority ?? 'balanced',
          items: input.items.map((item) => ({ ...item })),
          excludedIngredientIds: [], // a loaded recipe starts a fresh exclusion context
          activePresetId: null,
          savedRecipeId: link.savedId ?? null,
          savedRecipeName: link.savedName ?? null,
          currentVersionNumber: link.versionNumber ?? null,
          currentVersionDate: link.versionDate ?? null,
          dirty: false,
        }),
      markSaved: (id, name, versionNumber, versionDate = null) =>
        set({
          savedRecipeId: id,
          savedRecipeName: name,
          currentVersionNumber: versionNumber,
          currentVersionDate: versionDate,
          dirty: false,
        }),
      setMachineSelection: (sel) =>
        set((state) => ({
          machineKind: sel.kind,
          servingModeId: sel.servingModeId,
          machineId: sel.machineId,
          machineLabel: sel.label,
          // Route to the existing supported cell — no Engine change, just the temperature input.
          target_temperature_c: sel.temperatureC,
          target_batch_grams: sel.batchGrams != null ? sel.batchGrams : state.target_batch_grams,
          dirty: true,
        })),
      resetToDemo: () => set(fromPreset(DEFAULT_PRESET)),
    }),
    { name: 'pinguino-recipe', partialize: recipePersistPartialize },
  ),
);
