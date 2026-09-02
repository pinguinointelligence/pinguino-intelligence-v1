import type { EngineIngredient, RecipeInput } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { assessMapperVeganEligibility } from '@/data/ingredients/veganEligibility';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';
import { mapperEngineMissingFields } from '@/features/product-intelligence/mapperRuntimeUsability';
import type { SubstituteAuthorization, SubstituteCandidate } from './ingredientTableUx';

const REQUIRED_COMPOSITION_FIELDS = [
  'water_percent',
  'total_solids_percent',
  'fat_percent',
  'protein_percent',
  'carbohydrate_percent',
  'total_sugars_percent',
  'salt_percent',
  'pod_value',
  'pac_value',
] as const satisfies readonly (keyof IngredientRow)[];

const VERIFIED_MAPPER_AUTHORITY = Symbol('verified-mapper-substitution-authority');
const VERIFIED_MAPPER_AUTHORIZATIONS = new WeakSet<object>();

const completeComposition = (row: IngredientRow): boolean =>
  mapperEngineMissingFields(row).length === 0 &&
  Math.abs(
    (row.water_percent ?? 0) + (row.total_solids_percent ?? 0) + (row.alcohol_percent ?? 0) - 100,
  ) <= 0.5;

const normalizedAllergens = (value: string | null): string =>
  (value ?? '')
    .split(/[,;|]/)
    .map((token) => token.trim().toLocaleLowerCase('pl'))
    .filter(Boolean)
    .sort()
    .join('|');

export function substitutionIngredientFingerprint(ingredient: EngineIngredient): string {
  const composition = ingredient.composition;
  return JSON.stringify([
    canonicalIngredientId(ingredient),
    ingredient.id,
    ingredient.name,
    ingredient.category,
    composition.water_percent,
    composition.solids_percent,
    composition.fat_percent,
    composition.protein_percent,
    composition.carbohydrate_percent,
    composition.sugar_percent,
    composition.sucrose_percent,
    composition.glucose_percent,
    composition.dextrose_percent,
    composition.fructose_percent,
    composition.lactose_percent,
    composition.polyol_percent,
    composition.fiber_percent,
    composition.salt_percent,
    composition.alcohol_percent,
    composition.kcal_per_100g,
    ingredient.pod_value,
    ingredient.pac_value,
    ingredient.de_value,
    ingredient.identity_provenance,
    ingredient.source_type,
    ingredient.is_verified,
    ingredient.flags?.vegan_eligibility ?? null,
  ]);
}

const mapperRowFingerprint = (row: IngredientRow): string =>
  JSON.stringify([
    row.ingredient_id,
    row.verification_status,
    row.approved_for_engines,
    row.is_active,
    row.allergens,
    ...REQUIRED_COMPOSITION_FIELDS.map((field) => row[field]),
    row.pod_value,
    row.pac_value,
    row.de_value,
  ]);

function authorizationFor(
  row: IngredientRow,
  ingredient: EngineIngredient,
): SubstituteAuthorization {
  const authorization = {
    canonicalId: row.ingredient_id,
    ingredientFingerprint: substitutionIngredientFingerprint(ingredient),
    mapperRowFingerprint: mapperRowFingerprint(row),
    allergensFingerprint: normalizedAllergens(row.allergens),
    veganEligibility: assessMapperVeganEligibility(row).status,
    [VERIFIED_MAPPER_AUTHORITY]: true,
  } as SubstituteAuthorization & { [VERIFIED_MAPPER_AUTHORITY]: true };
  VERIFIED_MAPPER_AUTHORIZATIONS.add(authorization);
  return Object.freeze(authorization);
}

export function hasVerifiedMapperSubstitutionAuthorization(
  value: SubstituteAuthorization | null | undefined,
): boolean {
  return (
    value != null &&
    VERIFIED_MAPPER_AUTHORIZATIONS.has(value) &&
    (value as SubstituteAuthorization & { [VERIFIED_MAPPER_AUTHORITY]?: boolean })[
      VERIFIED_MAPPER_AUTHORITY
    ] === true
  );
}

const technicallyUsableMapperReference = (row: IngredientRow): boolean =>
  row.is_active && row.approved_for_engines && completeComposition(row);

/**
 * Build the normal RECIPE substitute list from the current technical Mapper
 * reference catalogue. Provenance remains visible metadata and never becomes
 * a numerical eligibility gate. Candidates are deliberately
 * same-functional-role only; cross-family substitution needs separate science.
 */
export function verifiedRecipeSubstituteCandidates(
  input: RecipeInput,
  lineId: string,
  rows: readonly IngredientRow[],
  limit = 12,
): SubstituteCandidate[] {
  const original = input.items.find((item) => item.id === lineId);
  if (!original) return [];
  const originalCanonicalId = canonicalIngredientId(original.ingredient);
  const existingCanonicalIds = new Set(
    input.items
      .filter((item) => item.id !== lineId)
      .map((item) => canonicalIngredientId(item.ingredient)),
  );
  const originalRole = resolveFunctionalRole(original.ingredient);
  // Stabilizer identity/dose is template-controlled. Mapper verification and a
  // matching functional role do not provide an activity conversion contract,
  // so the generic substitution catalogue must not offer gums/blends here.
  if (originalRole === 'stabilizer') return [];
  const originalRow = rows.find((row) => row.ingredient_id === originalCanonicalId);
  const originalAllergens = normalizedAllergens(originalRow?.allergens ?? null);
  const isMain = original.lock_type === 'main';

  return rows
    .filter(technicallyUsableMapperReference)
    .map((row) => ({ row, ingredient: ingredientRowToEngineIngredient(row) }))
    .filter(({ row, ingredient }) => {
      if (row.ingredient_id === originalCanonicalId) return false;
      if (existingCanonicalIds.has(row.ingredient_id)) return false;
      if (resolveFunctionalRole(ingredient) !== originalRole) return false;
      if (input.category === 'vegan_gelato') {
        if (assessMapperVeganEligibility(row).status !== 'VEGAN_VERIFIED') return false;
      }
      // Known allergen declarations may not silently change. An absent original
      // declaration is not permission to introduce one.
      if (normalizedAllergens(row.allergens) !== originalAllergens) return false;
      return true;
    })
    .sort((left, right) =>
      left.ingredient.name.localeCompare(right.ingredient.name, 'pl', { sensitivity: 'base' }),
    )
    .slice(0, limit)
    .map(({ row, ingredient }) => ({
      id: canonicalIngredientId(ingredient),
      name: ingredient.name,
      ingredient,
      authorization: authorizationFor(row, ingredient),
      fit: 'direct',
      expectedImpact:
        'Ta sama rola technologiczna; Gellatti przeliczy całą recepturę przed zastosowaniem.',
      compatibility:
        input.category === 'vegan_gelato'
          ? 'Potwierdzona zgodność Vegan i kompletne dane do obliczeń.'
          : 'Kompletne dane do obliczeń; znane alergeny bez zmiany.',
      requiresMainConfirmation: isMain,
    }));
}

export function isVerifiedRuntimeSubstitute(ingredient: EngineIngredient): boolean {
  return (
    ingredient.identity_provenance === 'mapper' &&
    typeof ingredient.canonical_ingredient_id === 'string' &&
    ingredient.canonical_ingredient_id.length > 0 &&
    typeof ingredient.pod_value === 'number' &&
    Number.isFinite(ingredient.pod_value) &&
    typeof ingredient.pac_value === 'number' &&
    Number.isFinite(ingredient.pac_value)
  );
}
