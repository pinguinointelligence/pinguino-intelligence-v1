import type { EngineIngredient, ProductCategory, RecipeInput } from '@/engine';
import { canonicalToolboxComposition } from '@/data/ingredients/canonicalToolboxCompositions';
import { GELLATTI_STABILIZER_AUTHORITY } from '@/data/ingredients/gellattiStabilizerAuthority';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { substitutionIngredientFingerprint } from '@/features/ingredient-builder/recipeSubstitution';

export const STARTER_PACK_RESCUE_PALETTE_VERSION = 'owner-starter-pack-rescue-v1' as const;

export const STARTER_PACK_RESCUE_MAPPER_IDS = [
  'PI-ING-000494',
  'PI-ING-000496',
  'PI-ING-000456',
  'PI-ING-001645',
  'PI-ING-000270',
  'PI-ING-000260',
  'PI-ING-002114',
] as const;

export type StarterPackRescueMapperId = (typeof STARTER_PACK_RESCUE_MAPPER_IDS)[number];

export interface StarterPackRescueEligibility {
  eligible: boolean;
  reason:
    | 'eligible'
    | 'already_present'
    | 'profile_incompatible'
    | 'blocked_science'
    | 'authority_unavailable';
}

interface StarterPackPaletteEntry {
  mapperId: StarterPackRescueMapperId;
  toolboxId: string;
  namePl: string;
  withNamePl: string;
  category: EngineIngredient['category'];
  subcategory: string;
  vegan: boolean;
  allergens: readonly string[];
}

const PALETTE: readonly StarterPackPaletteEntry[] = [
  {
    mapperId: 'PI-ING-000494',
    toolboxId: 'dextrose',
    namePl: 'Dekstroza',
    withNamePl: 'dekstrozą',
    category: 'sugar',
    subcategory: 'dextrose',
    vegan: true,
    allergens: [],
  },
  {
    mapperId: 'PI-ING-000496',
    toolboxId: 'fructose',
    namePl: 'Fruktoza',
    withNamePl: 'fruktozą',
    category: 'sugar',
    subcategory: 'fructose',
    vegan: true,
    allergens: [],
  },
  {
    mapperId: 'PI-ING-000456',
    toolboxId: 'inulin',
    namePl: 'Inulina',
    withNamePl: 'inuliną',
    category: 'other',
    subcategory: 'specialty_component',
    vegan: true,
    allergens: [],
  },
  {
    mapperId: 'PI-ING-001645',
    toolboxId: 'dried_egg_yolk',
    namePl: 'Suszone żółtko jaja',
    withNamePl: 'suszonym żółtkiem jaja',
    category: 'egg',
    subcategory: 'dried_egg_yolk',
    vegan: false,
    allergens: ['egg'],
  },
  {
    mapperId: 'PI-ING-000270',
    toolboxId: 'smp',
    namePl: 'Odtłuszczone mleko w proszku 0,8%',
    withNamePl: 'odtłuszczonym mlekiem w proszku 0,8%',
    category: 'dairy',
    subcategory: 'skimmed_milk_powder',
    vegan: false,
    allergens: ['milk'],
  },
  {
    mapperId: 'PI-ING-000260',
    toolboxId: 'cream_powder_42',
    namePl: 'Śmietanka w proszku 42%',
    withNamePl: 'śmietanką w proszku 42%',
    category: 'dairy',
    subcategory: 'cream',
    vegan: false,
    allergens: ['milk'],
  },
  {
    mapperId: 'PI-ING-002114',
    toolboxId: 'gellatti_stabilizer',
    namePl: 'Gellatti Stabilizer',
    withNamePl: 'Gellatti Stabilizer',
    category: 'stabilizer',
    subcategory: 'stabilizer_blend',
    vegan: true,
    allergens: [],
  },
] as const;

const BY_MAPPER_ID = new Map(PALETTE.map((entry) => [entry.mapperId, entry] as const));

export const starterPackRescuePalette = (): readonly StarterPackPaletteEntry[] => PALETTE;

export const starterPackRescueWithNamePl = (mapperId: StarterPackRescueMapperId): string =>
  BY_MAPPER_ID.get(mapperId)?.withNamePl ?? mapperId;

export function starterPackRescueEligibility(
  mapperId: StarterPackRescueMapperId,
  profile: ProductCategory,
  input?: RecipeInput,
): StarterPackRescueEligibility {
  const entry = BY_MAPPER_ID.get(mapperId);
  if (!entry || canonicalToolboxComposition(entry.toolboxId) === null) {
    return { eligible: false, reason: 'authority_unavailable' };
  }
  if (input?.items.some((item) => canonicalIngredientId(item.ingredient) === mapperId)) {
    return { eligible: false, reason: 'already_present' };
  }
  if (profile === 'protein_gelato') {
    return { eligible: false, reason: 'blocked_science' };
  }
  if (
    (profile === 'sorbet' || profile === 'vegan_gelato') &&
    (mapperId === 'PI-ING-001645' || mapperId === 'PI-ING-000270' || mapperId === 'PI-ING-000260')
  ) {
    return { eligible: false, reason: 'profile_incompatible' };
  }
  return { eligible: true, reason: 'eligible' };
}

export function starterPackRescueIngredient(
  mapperId: StarterPackRescueMapperId,
): EngineIngredient | null {
  const entry = BY_MAPPER_ID.get(mapperId);
  if (!entry) return null;
  const authority = canonicalToolboxComposition(entry.toolboxId);
  if (!authority || authority.mapperId !== mapperId || !authority.verified) return null;
  return {
    id: mapperId,
    canonical_ingredient_id: mapperId,
    private_product_id: null,
    identity_provenance: 'mapper',
    source_subcategory: entry.subcategory,
    carbonation_status: 'UNKNOWN',
    name: authority.displayName,
    category: entry.category,
    composition: structuredClone(authority.composition),
    pod_value: authority.pod_value,
    pac_value: authority.pac_value,
    de_value: authority.de_value,
    cost_per_kg: authority.cost_per_kg,
    cost_currency: authority.cost_currency,
    confidence_score: authority.confidence_score,
    source_type: 'verified_db',
    is_verified: true,
    flags: {
      ...(entry.category === 'dairy' ? { is_dairy: true } : {}),
      ...(entry.category === 'stabilizer' ? { is_stabilizer: true } : {}),
      ...(!entry.vegan ? { is_animal_origin: true } : {}),
      vegan_eligibility: entry.vegan ? 'VEGAN_VERIFIED' : 'VEGAN_FALSE',
      vegan_eligibility_reasons: entry.vegan
        ? ['owner_closed_palette_mapper_verified']
        : entry.allergens.map((allergen) => `contains_${allergen}`),
    },
  };
}

export const starterPackRescueLineId = (mapperId: StarterPackRescueMapperId): string =>
  `starter-pack-rescue:${mapperId}`;

export function starterPackRescueSeedGrams(
  mapperId: StarterPackRescueMapperId,
  input: RecipeInput,
): number {
  if (mapperId === 'PI-ING-000456') return input.target_batch_grams * 0.04;
  if (mapperId === 'PI-ING-000494' || mapperId === 'PI-ING-000496') {
    return input.target_batch_grams * 0.02;
  }
  if (
    mapperId === 'PI-ING-001645' ||
    mapperId === 'PI-ING-000270' ||
    mapperId === 'PI-ING-000260'
  ) {
    return input.target_batch_grams * 0.01;
  }
  const profile =
    input.category === 'sorbet'
      ? 'SORBET'
      : input.items.some((item) => item.ingredient.category === 'chocolate_cocoa')
        ? 'CHOCOLATE'
        : input.items.some((item) => item.ingredient.category === 'egg')
          ? 'EGG'
          : 'STANDARD';
  return (GELLATTI_STABILIZER_AUTHORITY.dosageGPerKg[profile] * input.target_batch_grams) / 1_000;
}

/** Bounded V1 probe grid. These are search points, never dosage claims: every
 * point still has to pass exact ProductBehavior, process, technical, profile,
 * Main, lock and batch gates. Inulin uses its published 2/4/8% owner policy;
 * the stabilizer uses only its exact product-owned profile dose. Products with
 * no dosage window use a deliberately capped 1/2/4/8% technical grid. */
export function starterPackRescueProbeGrams(
  mapperId: StarterPackRescueMapperId,
  input: RecipeInput,
): readonly number[] {
  if (mapperId === 'PI-ING-002114') return [starterPackRescueSeedGrams(mapperId, input)];
  const percentages = mapperId === 'PI-ING-000456' ? ([2, 4, 8] as const) : ([1, 2, 4, 8] as const);
  return percentages.map((percent) => (input.target_batch_grams * percent) / 100);
}

export function withStarterPackRescueCandidate(
  input: RecipeInput,
  mapperId: StarterPackRescueMapperId,
  seedGrams = starterPackRescueSeedGrams(mapperId, input),
): RecipeInput | null {
  const ingredient = starterPackRescueIngredient(mapperId);
  if (!ingredient) return null;
  return {
    ...structuredClone(input),
    items: [
      ...structuredClone(input.items),
      {
        id: starterPackRescueLineId(mapperId),
        ingredient,
        planned_grams: seedGrams,
        actual_grams: null,
        lock_type: 'unlocked',
      },
    ],
  };
}

export function isExactStarterPackRescueIngredient(
  mapperId: string,
  ingredient: EngineIngredient,
): boolean {
  if (!STARTER_PACK_RESCUE_MAPPER_IDS.includes(mapperId as StarterPackRescueMapperId)) {
    return false;
  }
  const trusted = starterPackRescueIngredient(mapperId as StarterPackRescueMapperId);
  return (
    trusted !== null &&
    canonicalIngredientId(ingredient) === mapperId &&
    substitutionIngredientFingerprint(ingredient) === substitutionIngredientFingerprint(trusted)
  );
}
