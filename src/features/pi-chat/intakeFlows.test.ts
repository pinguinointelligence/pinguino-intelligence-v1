import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  proposeCorrections,
  type EngineIngredient,
  type IngredientCategory,
  type IngredientComponentProfile,
  type LockType,
  type ProductCategory,
  type ProductMode,
  type RecipeInput,
  type RecipeItem,
} from '@/engine';
import { findPreset } from '@/data/demoPresets';
import { findProductProfile } from '@/data/productProfiles';
import { advance, INITIAL_INTAKE, type IntakeEvent } from './conversation';
import { intakeToRecipe } from './intakeToRecipe';

const ZERO: IngredientComponentProfile = {
  water_percent: 0, solids_percent: 0, fat_percent: 0, protein_percent: 0,
  carbohydrate_percent: 0, sugar_percent: 0, sucrose_percent: 0, glucose_percent: 0,
  dextrose_percent: 0, fructose_percent: 0, lactose_percent: 0, polyol_percent: 0,
  fiber_percent: 0, salt_percent: 0, alcohol_percent: 0, kcal_per_100g: 0,
};

const ing = (
  id: string,
  category: IngredientCategory,
  composition: Partial<IngredientComponentProfile>,
): EngineIngredient => ({
  id,
  name: id,
  category,
  composition: { ...ZERO, ...composition },
  pod_value: null,
  pac_value: null,
  npac_value: null,
  de_value: null,
  cost_per_kg: 1,
  confidence_score: 85,
  source_type: 'manual',
  is_verified: false,
});

const line = (ingredient: EngineIngredient, grams: number, lock: LockType = 'unlocked'): RecipeItem => ({
  id: `l-${ingredient.id}`,
  ingredient,
  planned_grams: grams,
  actual_grams: null,
  lock_type: lock,
});

const STRAWBERRY = ing('strawberry', 'fruit', {
  water_percent: 90.95, solids_percent: 9.05, fat_percent: 0.3, protein_percent: 0.7,
  carbohydrate_percent: 7.7, sugar_percent: 4.9, glucose_percent: 2.2, fructose_percent: 2.4,
  fiber_percent: 2, kcal_per_100g: 32,
});
const SUCROSE = ing('sucrose', 'sugar', { solids_percent: 100, carbohydrate_percent: 100, sugar_percent: 100, sucrose_percent: 100, kcal_per_100g: 400 });
const DEXTROSE = ing('dextrose', 'sugar', { water_percent: 8, solids_percent: 92, carbohydrate_percent: 92, sugar_percent: 92, dextrose_percent: 92, kcal_per_100g: 368 });
const TARA = ing('tara', 'stabilizer', { water_percent: 12, solids_percent: 88, carbohydrate_percent: 80, fiber_percent: 80, kcal_per_100g: 200 });
const MILK = ing('milk', 'dairy', { water_percent: 87.5, solids_percent: 12.5, fat_percent: 3.5, protein_percent: 3.3, carbohydrate_percent: 4.8, sugar_percent: 4.8, lactose_percent: 4.8, salt_percent: 0.1, kcal_per_100g: 64 });
const CREAM = ing('cream', 'dairy', { water_percent: 58.9, solids_percent: 41.1, fat_percent: 35, protein_percent: 2.2, lactose_percent: 3.1, salt_percent: 0.1, kcal_per_100g: 337 });
const SMP = ing('smp', 'dairy', { water_percent: 3.5, solids_percent: 96.5, fat_percent: 0.8, protein_percent: 35, carbohydrate_percent: 52, sugar_percent: 52, lactose_percent: 52, salt_percent: 1, kcal_per_100g: 360 });
const WHISKEY = ing('whiskey', 'alcohol', { water_percent: 60, alcohol_percent: 40, kcal_per_100g: 280 });

const mkInput = (
  items: RecipeItem[],
  category: ProductCategory,
  mode: ProductMode,
): RecipeInput => ({
  items,
  mode,
  category,
  target_temperature_c: -11,
  target_batch_grams: items.reduce((sum, item) => sum + item.planned_grams, 0),
  machine_capacity_grams: null,
  goals: { flavor_intensity: 'balanced', cost_priority: 'balanced' },
});

describe('Strawberry Sorbet · Premium Taste First', () => {
  const sorbet = findProductProfile('sorbet'); // engineCategory 'sorbet', defaultMode 'premium', heroProtected

  it('protects the 60% hero fruit — the solver never reduces the main strawberry', () => {
    const input = mkInput(
      [
        line(STRAWBERRY, 600, 'main'), // 60% hero
        line(SUCROSE, 170),
        line(DEXTROSE, 60),
        line(TARA, 5),
      ],
      sorbet.engineCategory,
      sorbet.defaultMode,
    );
    const result = proposeCorrections({ input, context: 'planning', redact: false });
    if (result.redacted) throw new Error('expected pro result');
    for (const proposal of result.proposals) {
      for (const action of proposal.actions) {
        const reducesHero = action.type === 'reduce' && action.target_line_id === 'l-strawberry';
        expect(reducesHero, `proposal ${proposal.id} reduced the hero`).toBe(false);
      }
    }
  });
});

describe('Jim Beam / alcohol', () => {
  it('an alcohol fix never blindly adds high-PAC sugar (alcohol already raises antifreeze)', () => {
    const input = mkInput(
      [
        line(MILK, 600),
        line(CREAM, 130),
        line(SMP, 35),
        line(SUCROSE, 130),
        line(DEXTROSE, 30),
        line(TARA, 5),
        line(WHISKEY, 70), // ~2.8% alcohol — above the 2.5% warn range
      ],
      'alcohol_gelato',
      'signature',
    );
    const result = proposeCorrections({ input, context: 'planning', redact: false, focus: ['alcohol'] });
    if (result.redacted) throw new Error('expected pro result');
    for (const proposal of result.proposals) {
      for (const action of proposal.actions) {
        const addsSugar = action.type === 'add' && ['sucrose', 'dextrose'].includes(action.ingredient_id);
        expect(addsSugar, `proposal ${proposal.id} added high-PAC sugar`).toBe(false);
      }
    }
  });
});

describe('PI Pro handoff seeds a real recipe (exact grams)', () => {
  it('a gelato intake maps to a recipe whose engine result exposes finite grams', () => {
    const events: IntakeEvent[] = [
      { type: 'submitFlavor', text: 'vanilla' },
      { type: 'chooseProductType', id: 'gelato' },
      { type: 'chooseServingProfile', id: 'display-minus-11' },
      { type: 'setBatch', keep: true },
    ];
    const state = events.reduce((s, e) => advance(s, e), INITIAL_INTAKE);
    const seed = intakeToRecipe(state)!;
    const preset = findPreset(seed.presetId)!;
    const input = mkInput([...preset.items], seed.category, seed.mode);
    const result = calculateRecipe(input);
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect(Number.isFinite(item.effective_grams)).toBe(true);
      expect(item.effective_grams).toBeGreaterThan(0);
    }
  });
});
