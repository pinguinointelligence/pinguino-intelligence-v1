import type { RecipeInput } from '@/engine';
import { educationCopy } from '@/copy/education.pl';

export type IngredientExampleId = keyof typeof educationCopy.ingredient.examples;
export type MicroIngredientId = keyof typeof educationCopy.micro.items;

export interface VerifiedPlantOrigin {
  identity: string;
  eNumber: 'E410' | 'E412' | 'E417';
  sourcePlant: string;
  evidenceSource: string;
}

const PLANT_ORIGIN_BY_EXACT_ID: Readonly<Record<string, VerifiedPlantOrigin>> = {
  'PI-ING-000475': {
    identity: 'Guma karobowa',
    eNumber: 'E410',
    sourcePlant: 'nasiona drzewa karobowego',
    evidenceSource: 'https://doi.org/10.2903/j.efsa.2017.4646',
  },
  locust_bean_gum: {
    identity: 'Guma karobowa',
    eNumber: 'E410',
    sourcePlant: 'nasiona drzewa karobowego',
    evidenceSource: 'https://doi.org/10.2903/j.efsa.2017.4646',
  },
  'PI-ING-000472': {
    identity: 'Guma guar',
    eNumber: 'E412',
    sourcePlant: 'nasiona guar',
    evidenceSource: 'https://doi.org/10.2903/j.efsa.2017.4669',
  },
  guar_gum: {
    identity: 'Guma guar',
    eNumber: 'E412',
    sourcePlant: 'nasiona guar',
    evidenceSource: 'https://doi.org/10.2903/j.efsa.2017.4669',
  },
  'PI-ING-000492': {
    identity: 'Guma tara',
    eNumber: 'E417',
    sourcePlant: 'nasiona tara',
    evidenceSource: 'https://doi.org/10.2903/j.efsa.2017.4863',
  },
  tara_gum: {
    identity: 'Guma tara',
    eNumber: 'E417',
    sourcePlant: 'nasiona tara',
    evidenceSource: 'https://doi.org/10.2903/j.efsa.2017.4863',
  },
};

/** Exact identity only. Names and category membership deliberately do not match. */
export function verifiedPlantOrigin(ingredientId: string): VerifiedPlantOrigin | null {
  return PLANT_ORIGIN_BY_EXACT_ID[ingredientId] ?? null;
}

export function verifiedPlantOriginsForRecipe(input: RecipeInput): VerifiedPlantOrigin[] {
  const found = new Map<string, VerifiedPlantOrigin>();
  for (const item of input.items) {
    const canonical = item.ingredient.canonical_ingredient_id;
    const origin =
      (canonical ? verifiedPlantOrigin(canonical) : null) ??
      verifiedPlantOrigin(item.ingredient.id);
    if (origin !== null) found.set(`${origin.eNumber}:${origin.identity}`, origin);
  }
  return [...found.values()];
}

export function ingredientExample(id: IngredientExampleId) {
  return educationCopy.ingredient.examples[id];
}

export function microIngredient(id: MicroIngredientId) {
  return educationCopy.micro.items[id];
}
