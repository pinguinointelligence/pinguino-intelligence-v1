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
import type { EngineIngredient, LockType, ProductCategory, ProductMode, RecipeGoals, RecipeInput, RecipeItem } from '@/engine';

type FlavorIntensity = NonNullable<RecipeGoals['flavor_intensity']>;
type CostPriority = NonNullable<RecipeGoals['cost_priority']>;

export interface RecipeState {
  mode: ProductMode;
  category: ProductCategory;
  target_temperature_c: number;
  target_batch_grams: number;
  machine_capacity_grams: number | null;
  flavor_intensity: FlavorIntensity;
  cost_priority: CostPriority;
  items: RecipeItem[];
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
  /** Unsaved-changes flag: true after any edit, false after a load or a successful save. */
  dirty: boolean;

  setMode: (mode: ProductMode) => void;
  setCategory: (category: ProductCategory) => void;
  setTargetTemperature: (temperature_c: number) => void;
  setBatchGrams: (grams: number) => void;
  setMachineCapacity: (grams: number | null) => void;
  setFlavorIntensity: (value: FlavorIntensity) => void;
  setCostPriority: (value: CostPriority) => void;

  addIngredient: (ingredient: EngineIngredient, grams?: number) => void;
  removeItem: (lineId: string) => void;
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
    link?: { savedId?: string | null; savedName?: string | null; versionNumber?: number | null },
  ) => void;
  /** Link the draft to its persisted aggregate after a create/version/restore. Clears dirty. */
  markSaved: (id: string, name: string, versionNumber: number) => void;
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
    dirty: state.dirty,
  };
}

export const useRecipeStore = create<RecipeState>()(
  persist(
    (set) => ({
      ...fromPreset(DEFAULT_PRESET),

      setMode: (mode) => set({ mode, dirty: true }),
      setCategory: (category) => set({ category, dirty: true }),
      setTargetTemperature: (target_temperature_c) => set({ target_temperature_c, dirty: true }),
      setBatchGrams: (target_batch_grams) => set({ target_batch_grams, dirty: true }),
      setMachineCapacity: (machine_capacity_grams) => set({ machine_capacity_grams, dirty: true }),
      setFlavorIntensity: (flavor_intensity) => set({ flavor_intensity, dirty: true }),
      setCostPriority: (cost_priority) => set({ cost_priority, dirty: true }),

      addIngredient: (ingredient, grams = 100) =>
        set((state) => ({ items: [...state.items, makeLine(ingredient, grams)], dirty: true })),

      removeItem: (lineId) =>
        set((state) => ({ items: state.items.filter((item) => item.id !== lineId), dirty: true })),

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

      loadPreset: (preset) => set(fromPreset(preset)),
      loadRecipeInput: (input, link = {}) =>
        set({
          mode: input.mode,
          category: input.category,
          target_temperature_c: input.target_temperature_c,
          target_batch_grams: input.target_batch_grams,
          machine_capacity_grams: input.machine_capacity_grams,
          flavor_intensity: input.goals?.flavor_intensity ?? 'balanced',
          cost_priority: input.goals?.cost_priority ?? 'balanced',
          items: input.items.map((item) => ({ ...item })),
          activePresetId: null,
          savedRecipeId: link.savedId ?? null,
          savedRecipeName: link.savedName ?? null,
          currentVersionNumber: link.versionNumber ?? null,
          dirty: false,
        }),
      markSaved: (id, name, versionNumber) =>
        set({ savedRecipeId: id, savedRecipeName: name, currentVersionNumber: versionNumber, dirty: false }),
      resetToDemo: () => set(fromPreset(DEFAULT_PRESET)),
    }),
    { name: 'pinguino-recipe', partialize: recipePersistPartialize },
  ),
);
