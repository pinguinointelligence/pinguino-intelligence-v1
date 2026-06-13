/**
 * Recipe working state — the goal fields + ingredient lines the user edits.
 *
 * This store holds INPUT only. It never stores computed numbers: the engine
 * result is derived on demand via buildRecipeInput + calculateRecipe
 * (useStudioResult). Persisted to localStorage so a demo survives reload.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEMO_INGREDIENTS } from '@/data/demoIngredients';
import type {
  EngineIngredient,
  LockType,
  ProductCategory,
  ProductMode,
  RecipeGoals,
  RecipeItem,
} from '@/engine';

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

/** A live fior-di-latte-style starter so the Studio opens with real numbers. */
const seedItems = (): RecipeItem[] => {
  const byId = (id: string): EngineIngredient =>
    DEMO_INGREDIENTS.find((ingredient) => ingredient.id === id)!;
  return [
    makeLine(byId('milk_3_5'), 670),
    makeLine(byId('cream_30'), 130),
    makeLine(byId('smp'), 35),
    makeLine(byId('sucrose'), 130),
    makeLine(byId('dextrose'), 30),
    makeLine(byId('tara_gum'), 5),
  ];
};

const DEFAULTS = {
  mode: 'classic' as ProductMode,
  category: 'milk_gelato' as ProductCategory,
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  flavor_intensity: 'balanced' as FlavorIntensity,
  cost_priority: 'balanced' as CostPriority,
};

export const useRecipeStore = create<RecipeState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      items: seedItems(),

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

      resetToDemo: () => set({ ...DEFAULTS, items: seedItems() }),
    }),
    { name: 'pinguino-recipe' },
  ),
);
