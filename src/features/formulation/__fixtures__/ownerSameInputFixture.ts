import type {
  EngineIngredient,
  IngredientComponentProfile,
  RecipeInput,
  RecipeItem,
} from '@/engine';

const ZERO: IngredientComponentProfile = {
  water_percent: 0,
  solids_percent: 0,
  fat_percent: 0,
  protein_percent: 0,
  carbohydrate_percent: 0,
  sugar_percent: 0,
  sucrose_percent: 0,
  glucose_percent: 0,
  dextrose_percent: 0,
  fructose_percent: 0,
  lactose_percent: 0,
  polyol_percent: 0,
  fiber_percent: 0,
  salt_percent: 0,
  alcohol_percent: 0,
  kcal_per_100g: 0,
};

const mapper = (
  id: string,
  name: string,
  category: EngineIngredient['category'],
  composition: Partial<IngredientComponentProfile>,
  pod: number,
  pac: number,
  cost: number,
): EngineIngredient => ({
  id,
  canonical_ingredient_id: id,
  private_product_id: null,
  identity_provenance: 'mapper',
  name,
  category,
  composition: { ...ZERO, ...composition },
  pod_value: pod,
  pac_value: pac,
  de_value: null,
  cost_per_kg: cost,
  confidence_score: 98,
  source_type: 'verified_db',
  is_verified: true,
  ...(category === 'dairy' ? { flags: { is_dairy: true, is_animal_origin: true } } : {}),
  ...(category === 'stabilizer' ? { flags: { is_stabilizer: true } } : {}),
});

/** Exact approved Mapper rows used by the owner G17 comparison fixture. */
export const OWNER_MAPPER_INGREDIENTS = {
  milk_3_5: mapper(
    'PI-ING-000236',
    'MILK 3.5% · Milk · Chilled',
    'dairy',
    {
      water_percent: 88.7,
      solids_percent: 11.3,
      fat_percent: 3.5,
      protein_percent: 3,
      carbohydrate_percent: 4.7,
      sugar_percent: 4.7,
      lactose_percent: 4.7,
      salt_percent: 0.1,
      kcal_per_100g: 60,
    },
    0.752,
    5.285,
    1.2,
  ),
  cream_30: mapper(
    'PI-ING-000180',
    'CREAM 30% · Mlekovita Cream · Chilled',
    'dairy',
    {
      water_percent: 64.42,
      solids_percent: 35.58,
      fat_percent: 30,
      protein_percent: 2.3,
      carbohydrate_percent: 3.2,
      sugar_percent: 3.2,
      lactose_percent: 3.2,
      salt_percent: 0.08,
      kcal_per_100g: 292,
    },
    0.512,
    3.668,
    3.2,
  ),
  smp: mapper(
    'PI-ING-000270',
    'SKIMMED MILK · Milk',
    'dairy',
    {
      water_percent: 10.32,
      solids_percent: 89.68,
      fat_percent: 0.8,
      protein_percent: 35.7,
      carbohydrate_percent: 51.98,
      sugar_percent: 51,
      lactose_percent: 51,
      salt_percent: 1.2,
      kcal_per_100g: 362,
    },
    8.16,
    58.02,
    6.5,
  ),
  sucrose: mapper(
    'PI-ING-000514',
    'SUCROSE SUGAR · Sweetener · Dry',
    'sugar',
    {
      solids_percent: 100,
      carbohydrate_percent: 100,
      sugar_percent: 100,
      sucrose_percent: 100,
      kcal_per_100g: 400,
    },
    100,
    100,
    1.2,
  ),
  dextrose: mapper(
    'PI-ING-000494',
    'DEXTROSE · Sweetener · Dry',
    'sugar',
    {
      water_percent: 8,
      solids_percent: 92,
      carbohydrate_percent: 92,
      sugar_percent: 92,
      dextrose_percent: 92,
      kcal_per_100g: 368,
    },
    70.84,
    174.8,
    2.8,
  ),
  inulin: mapper(
    'PI-ING-000456',
    'INULIN · Specialty',
    'stabilizer',
    {
      water_percent: 3,
      solids_percent: 97,
      carbohydrate_percent: 8,
      sugar_percent: 8,
      fiber_percent: 89,
      kcal_per_100g: 210,
    },
    8,
    8,
    8,
  ),
  tara_gum: mapper(
    'PI-ING-000492',
    'TARA GUM · Stabilizer',
    'stabilizer',
    {
      water_percent: 9.5,
      solids_percent: 90.5,
      fat_percent: 0.5,
      protein_percent: 2,
      carbohydrate_percent: 1.5,
      fiber_percent: 86.5,
      kcal_per_100g: 180,
    },
    0,
    0,
    20,
  ),
} as const;

export const OWNER_PLANNED_GRAMS = {
  milk_3_5: 600,
  cream_30: 135,
  smp: 43,
  sucrose: 86,
  dextrose: 80,
  inulin: 54.1,
  tara_gum: 1.9,
} as const;

export const OWNER_STALE_ACTUAL_GRAMS = {
  milk_3_5: 600,
  cream_30: 130,
  smp: 35,
  sucrose: 130,
  dextrose: 44,
  inulin: 54,
  tara_gum: 2,
} as const;

export function ownerSameInputItems(withStaleActuals = false): RecipeItem[] {
  return (Object.keys(OWNER_PLANNED_GRAMS) as Array<keyof typeof OWNER_PLANNED_GRAMS>).map(
    (key) => ({
      id: `owner:${key}`,
      ingredient: OWNER_MAPPER_INGREDIENTS[key],
      planned_grams: OWNER_PLANNED_GRAMS[key],
      actual_grams: withStaleActuals ? OWNER_STALE_ACTUAL_GRAMS[key] : null,
      lock_type: 'unlocked',
    }),
  );
}

export function ownerSameInputRecipe(withStaleActuals = false): RecipeInput {
  return {
    items: ownerSameInputItems(withStaleActuals),
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: -12,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: { flavor_intensity: 'balanced', cost_priority: 'balanced' },
  };
}
