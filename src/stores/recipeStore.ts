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
  /** Id of the saved recipe currently loaded (drives Save vs Save As); null = unsaved/new. */
  savedRecipeId: string | null;
  /** Name of the loaded saved recipe (prefills the Save dialog on overwrite). */
  savedRecipeName: string | null;

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
  /** Atomically load a saved recipe's RecipeInput (the stored source of truth);
   * `savedId`/`savedName` track it so a later Save overwrites instead of copying. */
  loadRecipeInput: (input: RecipeInput, savedId?: string | null, savedName?: string | null) => void;
  /** Mark the current recipe as persisted (after a save) so the next Save overwrites. */
  markSaved: (id: string, name: string) => void;
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
});

/**
 * Persisted slice — recipe content + the preset highlight, but NOT the
 * saved-recipe link (`savedRecipeId`/`savedRecipeName`). Keeping the link out of
 * localStorage means a reloaded session starts "unlinked": Save creates a new
 * recipe instead of trying to overwrite a row that may be gone (stale-id save
 * error). The link is set in-session by `loadRecipeInput` / `markSaved`.
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
  };
}

export const useRecipeStore = create<RecipeState>()(
  persist(
    (set) => ({
      ...fromPreset(DEFAULT_PRESET),

      setMode: (mode) => set({ mode }),
      setCategory: (category) => set({ category }),
      setTargetTemperature: (target_temperature_c) => set({ target_temperature_c }),
      setBatchGrams: (target_batch_grams) => set({ target_batch_grams }),
      setMachineCapacity: (machine_capacity_grams) => set({ machine_capacity_grams }),
      setFlavorIntensity: (flavor_intensity) => set({ flavor_intensity }),
      setCostPriority: (cost_priority) => set({ cost_priority }),

      addIngredient: (ingredient, grams = 100) =>
        set((state) => ({ items: [...state.items, makeLine(ingredient, grams)] })),

      removeItem: (lineId) =>
        set((state) => ({ items: state.items.filter((item) => item.id !== lineId) })),

      setPlannedGrams: (lineId, grams) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === lineId ? { ...item, planned_grams: Math.max(0, grams) } : item,
          ),
        })),

      setActualGrams: (lineId, grams) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === lineId
              ? { ...item, actual_grams: grams === null ? null : Math.max(0, grams) }
              : item,
          ),
        })),

      setLockType: (lineId, lockType) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === lineId ? { ...item, lock_type: lockType } : item,
          ),
        })),

      setMainIngredient: (lineId) =>
        set((state) => ({
          items: state.items.map((item) => {
            if (item.id === lineId) return { ...item, lock_type: 'main' };
            // demote any previous main line back to unlocked
            return item.lock_type === 'main' ? { ...item, lock_type: 'unlocked' } : item;
          }),
        })),

      loadPreset: (preset) => set(fromPreset(preset)),
      loadRecipeInput: (input, savedId = null, savedName = null) =>
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
          savedRecipeId: savedId,
          savedRecipeName: savedName,
        }),
      markSaved: (id, name) => set({ savedRecipeId: id, savedRecipeName: name }),
      resetToDemo: () => set(fromPreset(DEFAULT_PRESET)),
    }),
    { name: 'pinguino-recipe', partialize: recipePersistPartialize },
  ),
);
