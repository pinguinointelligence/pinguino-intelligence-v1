/**
 * Curated demo scenarios for the investor-ready `/demo` flow (Step 5C).
 *
 * LOCAL DEMO DATA ONLY — no database, no external-reference fixtures, no engine
 * changes. Each preset is a full recipe (goal + ingredient lines) built from the
 * demo/reference catalog with STABLE explicit line ids (deterministic React keys
 * and correction targets across reloads). Milk Base is the default cold-open.
 */
import { findDemoIngredient } from '@/data/demoIngredients';
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

export type PresetId =
  | 'milk-base'
  | 'raspberry-premium'
  | 'actual-batch-rescue'
  | 'jim-beam'
  | 'pistachio-high-fat';

export interface DemoPreset {
  id: PresetId;
  mode: ProductMode;
  category: ProductCategory;
  target_temperature_c: number;
  target_batch_grams: number;
  machine_capacity_grams: number | null;
  flavor_intensity: FlavorIntensity;
  cost_priority: CostPriority;
  items: RecipeItem[];
}

export const DEFAULT_PRESET_ID: PresetId = 'milk-base';

interface LineSpec {
  ingredientId: string;
  planned: number;
  actual?: number | null;
  lock?: LockType;
}

const ingredientOrThrow = (id: string): EngineIngredient => {
  const ingredient = findDemoIngredient(id);
  if (!ingredient) throw new Error(`demo preset references unknown ingredient: ${id}`);
  return ingredient;
};

/** Stable line id from the preset id + ingredient id (deterministic). */
const buildItems = (presetId: PresetId, specs: LineSpec[]): RecipeItem[] =>
  specs.map((spec) => ({
    id: `${presetId}:${spec.ingredientId}`,
    ingredient: ingredientOrThrow(spec.ingredientId),
    planned_grams: spec.planned,
    actual_grams: spec.actual ?? null,
    lock_type: spec.lock ?? 'unlocked',
  }));

export const DEMO_PRESETS: readonly DemoPreset[] = [
  {
    id: 'milk-base',
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: -11,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    items: buildItems('milk-base', [
      { ingredientId: 'milk_3_5', planned: 670 },
      { ingredientId: 'cream_30', planned: 130 },
      { ingredientId: 'smp', planned: 35 },
      { ingredientId: 'sucrose', planned: 130 },
      { ingredientId: 'dextrose', planned: 30 },
      { ingredientId: 'tara_gum', planned: 5 },
    ]),
  },
  {
    id: 'raspberry-premium',
    mode: 'premium',
    category: 'fruit_gelato',
    target_temperature_c: -11,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    flavor_intensity: 'maximum',
    cost_priority: 'premium',
    items: buildItems('raspberry-premium', [
      { ingredientId: 'raspberry', planned: 350, lock: 'main' },
      { ingredientId: 'milk_3_5', planned: 380 },
      { ingredientId: 'cream_30', planned: 80 },
      { ingredientId: 'smp', planned: 40 },
      { ingredientId: 'sucrose', planned: 110 },
      { ingredientId: 'dextrose', planned: 35 },
      { ingredientId: 'tara_gum', planned: 5 },
    ]),
  },
  {
    id: 'actual-batch-rescue',
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: -11,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    // Everything is physically in the machine; sucrose was over-poured.
    items: buildItems('actual-batch-rescue', [
      { ingredientId: 'milk_3_5', planned: 670, actual: 670, lock: 'already_added' },
      { ingredientId: 'cream_30', planned: 130, actual: 130, lock: 'already_added' },
      { ingredientId: 'smp', planned: 35, actual: 35, lock: 'already_added' },
      { ingredientId: 'sucrose', planned: 130, actual: 250, lock: 'already_added' },
      { ingredientId: 'dextrose', planned: 30, actual: 30, lock: 'already_added' },
      { ingredientId: 'tara_gum', planned: 5, actual: 5, lock: 'already_added' },
    ]),
  },
  {
    id: 'jim-beam',
    mode: 'signature',
    category: 'alcohol_gelato',
    target_temperature_c: -11,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    flavor_intensity: 'strong',
    cost_priority: 'premium',
    items: buildItems('jim-beam', [
      { ingredientId: 'milk_3_5', planned: 600 },
      { ingredientId: 'cream_30', planned: 130 },
      { ingredientId: 'smp', planned: 35 },
      { ingredientId: 'sucrose', planned: 130 },
      { ingredientId: 'dextrose', planned: 30 },
      { ingredientId: 'tara_gum', planned: 5 },
      { ingredientId: 'whiskey_40', planned: 70 },
    ]),
  },
  {
    id: 'pistachio-high-fat',
    mode: 'premium',
    category: 'nut_gelato',
    target_temperature_c: -11,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    flavor_intensity: 'strong',
    cost_priority: 'premium',
    items: buildItems('pistachio-high-fat', [
      { ingredientId: 'pistachio_paste', planned: 150, lock: 'main' },
      { ingredientId: 'milk_3_5', planned: 520 },
      { ingredientId: 'cream_30', planned: 120 },
      { ingredientId: 'smp', planned: 40 },
      { ingredientId: 'sucrose', planned: 130 },
      { ingredientId: 'dextrose', planned: 35 },
      { ingredientId: 'tara_gum', planned: 5 },
    ]),
  },
];

export const DEFAULT_PRESET: DemoPreset = DEMO_PRESETS.find(
  (preset) => preset.id === DEFAULT_PRESET_ID,
)!;

export const findPreset = (id: PresetId): DemoPreset | undefined =>
  DEMO_PRESETS.find((preset) => preset.id === id);
