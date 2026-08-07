import type {
  EngineIngredient,
  IngredientIdentityProvenance,
  RecipeInput,
  RecipeItem,
} from '@/engine';

/**
 * The closed, exact identity bridge for the approved formulation toolbox.
 * No display names, translations, fuzzy search or row order are accepted as
 * identity. The composition remains owned by the original Mapper/Engine row.
 */
export interface CoreIngredientIdentity {
  role: string;
  toolboxId: string;
  mapperId: string;
  namePl: string;
}

export const CORE_INGREDIENT_IDENTITIES: readonly CoreIngredientIdentity[] = [
  {
    role: 'sweetener_sucrose',
    toolboxId: 'sucrose',
    mapperId: 'PI-ING-000514',
    namePl: 'Sacharoza (cukier)',
  },
  {
    role: 'sugar_freezing_control',
    toolboxId: 'dextrose',
    mapperId: 'PI-ING-000494',
    namePl: 'Dekstroza',
  },
  { role: 'stabilizer', toolboxId: 'tara_gum', mapperId: 'PI-ING-000492', namePl: 'Guma tara' },
  { role: 'dairy_fat', toolboxId: 'cream_30', mapperId: 'PI-ING-000180', namePl: 'Śmietanka 30%' },
  {
    role: 'primary_liquid',
    toolboxId: 'milk_3_5',
    mapperId: 'PI-ING-000236',
    namePl: 'Mleko 3,5%',
  },
  {
    role: 'milk_solids',
    toolboxId: 'smp',
    mapperId: 'PI-ING-000270',
    namePl: 'Odtłuszczone mleko w proszku',
  },
  { role: 'fiber_body', toolboxId: 'inulin', mapperId: 'PI-ING-000456', namePl: 'Inulina' },
  { role: 'water', toolboxId: 'water', mapperId: 'PI-ING-001409', namePl: 'Woda' },
] as const;

const BY_TOOLBOX_ID = new Map(CORE_INGREDIENT_IDENTITIES.map((entry) => [entry.toolboxId, entry]));
const BY_MAPPER_ID = new Map(CORE_INGREDIENT_IDENTITIES.map((entry) => [entry.mapperId, entry]));

export function coreIdentityByToolboxId(toolboxId: string): CoreIngredientIdentity | null {
  return BY_TOOLBOX_ID.get(toolboxId) ?? null;
}

export function coreIdentityByMapperId(mapperId: string): CoreIngredientIdentity | null {
  return BY_MAPPER_ID.get(mapperId) ?? null;
}

export function canonicalIngredientIdFromSourceId(sourceId: string): string {
  return BY_TOOLBOX_ID.get(sourceId)?.mapperId ?? sourceId;
}

/** Exact stable key. Legacy toolbox ids resolve through the closed registry. */
export function canonicalIngredientId(ingredient: EngineIngredient): string {
  const explicit = ingredient.canonical_ingredient_id?.trim();
  if (explicit) return explicit;
  return canonicalIngredientIdFromSourceId(ingredient.id);
}

export function ingredientProvenance(ingredient: EngineIngredient): IngredientIdentityProvenance {
  if (ingredient.identity_provenance) return ingredient.identity_provenance;
  if (ingredient.private_product_id) return 'private_product';
  if (ingredient.id.startsWith('PI-ING-')) return 'mapper';
  if (BY_TOOLBOX_ID.has(ingredient.id)) return 'reference';
  return 'reference';
}

/** Add identity metadata without changing the ingredient's scientific row. */
export function normalizeIngredientIdentity(
  ingredient: EngineIngredient,
  provenance?: IngredientIdentityProvenance,
): EngineIngredient {
  const canonicalId = canonicalIngredientId(ingredient);
  const resolvedProvenance = provenance ?? ingredientProvenance(ingredient);
  if (
    ingredient.canonical_ingredient_id === canonicalId &&
    ingredient.identity_provenance === resolvedProvenance
  ) {
    return ingredient;
  }
  return {
    ...ingredient,
    canonical_ingredient_id: canonicalId,
    identity_provenance: resolvedProvenance,
  };
}

export function normalizeRecipeItemIdentity(item: RecipeItem): RecipeItem {
  const ingredient = normalizeIngredientIdentity(item.ingredient);
  return ingredient === item.ingredient ? item : { ...item, ingredient };
}

export function normalizeRecipeInputIdentities(input: RecipeInput): RecipeInput {
  const items = input.items.map(normalizeRecipeItemIdentity);
  return { ...input, items };
}

/** All canonical identities occurring more than once, independent of locks. */
export function canonicalDuplicateIds(items: readonly RecipeItem[]): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const id = canonicalIngredientId(item.ingredient);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
}
