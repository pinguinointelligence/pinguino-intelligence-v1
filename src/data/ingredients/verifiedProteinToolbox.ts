import type { EngineIngredient, IngredientComponentProfile } from '@/engine';
import { findVerifiedVeganFormulationCandidate } from './verifiedVeganToolbox';

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

const dairy = (
  id: string,
  name: string,
  composition: Partial<IngredientComponentProfile>,
  pod: number,
  pac: number,
  costPerKg: number | null,
  confidence: number,
): EngineIngredient => ({
  id,
  canonical_ingredient_id: id,
  private_product_id: null,
  identity_provenance: 'mapper',
  name,
  category: 'dairy',
  composition: { ...ZERO, ...composition },
  pod_value: pod,
  pac_value: pac,
  npac_value: null,
  de_value: null,
  cost_per_kg: costPerKg,
  confidence_score: confidence,
  source_type: 'verified_db',
  is_verified: true,
  flags: {
    is_dairy: true,
    is_animal_origin: true,
    vegan_eligibility: 'VEGAN_FALSE',
    vegan_eligibility_reasons: ['verified_mapper_vegan_false'],
  },
});

const DAIRY_PROTEIN_CANDIDATES: readonly EngineIngredient[] = [
  dairy(
    'PI-ING-000237',
    'MILK PROTEIN CONCENTRATE WPC 75% · Milk',
    {
      water_percent: 14.1,
      solids_percent: 85.9,
      fat_percent: 0.6,
      protein_percent: 75,
      carbohydrate_percent: 10,
      sugar_percent: 10,
      lactose_percent: 10,
      salt_percent: 0.3,
      kcal_per_100g: 304,
    },
    1.6,
    11.755,
    12,
    98,
  ),
  dairy(
    'PI-ING-000264',
    'PROTEIN GEL WPC · Sempre Dairy · SEMPRE230',
    {
      water_percent: 3.7,
      solids_percent: 96.3,
      fat_percent: 7,
      protein_percent: 80,
      carbohydrate_percent: 9,
      sugar_percent: 3.3,
      lactose_percent: 3.3,
      salt_percent: 0.3,
      kcal_per_100g: 400,
    },
    0.528,
    5.055,
    12,
    98,
  ),
  dairy(
    'PI-ING-000294',
    'WPC 60% · Dairy',
    {
      water_percent: 4.7,
      solids_percent: 95.3,
      fat_percent: 7,
      protein_percent: 60,
      carbohydrate_percent: 28,
      sugar_percent: 28,
      lactose_percent: 28,
      salt_percent: 0.3,
      kcal_per_100g: 395,
    },
    15.4,
    29.755,
    12,
    98,
  ),
  dairy(
    'PI-ING-000295',
    'WPC 80% · Dairy',
    {
      water_percent: 3,
      solids_percent: 97,
      fat_percent: 1.7,
      protein_percent: 80,
      carbohydrate_percent: 15,
      sugar_percent: 15,
      lactose_percent: 15,
      salt_percent: 0.3,
      kcal_per_100g: 395,
    },
    2.4,
    16.755,
    12,
    98,
  ),
  dairy(
    'PI-ING-001395',
    'SKYR ICELANDIC YOGHURT · Piątnica Yogurt · Chilled',
    {
      water_percent: 83.8,
      solids_percent: 16.2,
      protein_percent: 12,
      carbohydrate_percent: 4.1,
      sugar_percent: 4.1,
      lactose_percent: 4.1,
      salt_percent: 0.1,
      kcal_per_100g: 64,
    },
    0.656,
    4.685,
    null,
    95,
  ),
  dairy(
    'PI-ING-001451',
    'SKYR FAT 0.2% · Dairy · Chilled',
    {
      water_percent: 82.7,
      solids_percent: 17.3,
      fat_percent: 0.2,
      protein_percent: 11,
      carbohydrate_percent: 6,
      sugar_percent: 4,
      salt_percent: 0.1,
      kcal_per_100g: 70,
    },
    4,
    4.585,
    null,
    85,
  ),
];

const PLANT_IDS = [
  'PI-ING-000451',
  'PI-ING-000452',
  'PI-ING-002110',
  'PI-ING-002111',
] as const;
const PLANT_CONFIDENCE: Readonly<Record<(typeof PLANT_IDS)[number], number>> = {
  'PI-ING-000451': 98,
  'PI-ING-000452': 98,
  'PI-ING-002110': 94,
  'PI-ING-002111': 94,
};
const PLANT_PROTEIN_CANDIDATES = PLANT_IDS.map((id) => findVerifiedVeganFormulationCandidate(id))
  .filter((ingredient): ingredient is EngineIngredient => ingredient !== null)
  .map((ingredient) => ({
    ...ingredient,
    confidence_score: PLANT_CONFIDENCE[ingredient.id as (typeof PLANT_IDS)[number]],
  }));

export const VERIFIED_PROTEIN_FORMULATION_CANDIDATES: readonly EngineIngredient[] = [
  ...DAIRY_PROTEIN_CANDIDATES,
  ...PLANT_PROTEIN_CANDIDATES,
];

export function findVerifiedProteinFormulationCandidate(id: string): EngineIngredient | null {
  return VERIFIED_PROTEIN_FORMULATION_CANDIDATES.find((ingredient) => ingredient.id === id) ?? null;
}

export function isProteinContributor(ingredient: EngineIngredient): boolean {
  return ingredient.composition.protein_percent > 0;
}
