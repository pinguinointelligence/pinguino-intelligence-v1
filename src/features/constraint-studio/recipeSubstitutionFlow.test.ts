import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCsv } from '@/lib/csv';
import type { EngineIngredient } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import {
  substitutionIngredientFingerprint,
  verifiedRecipeSubstituteCandidates,
} from '@/features/ingredient-builder/recipeSubstitution';
import type {
  SubstituteAuthorization,
  SubstituteCandidate,
} from '@/features/ingredient-builder/ingredientTableUx';
import { useRecipeStore } from '@/stores/recipeStore';
import { selectCanonicalDraft, useConstraintStudioStore } from './constraintStudioStore';
import { buildSubstitutionPreview } from './applyPipeline';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';

const strawberry: EngineIngredient = {
  ...findDemoIngredient('raspberry')!,
  id: 'PI-ING-001553',
  canonical_ingredient_id: 'PI-ING-001553',
  name: 'STRAWBERRIES · Fresh Fruit',
  category: 'fruit',
};

const mapperGrid = parseCsv(
  readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const mapperHeader = mapperGrid[0]!;
const MAPPER_TRI_STATE_COLUMNS = new Set([
  'vegan',
  'dairy_free',
  'gluten_free',
  'contains_alcohol',
]);
const mapperCell = (value: string, column: string): string | number | boolean | null => {
  if (value === '') return null;
  if (MAPPER_TRI_STATE_COLUMNS.has(column)) return value.toLowerCase();
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
};
const MAPPER_ROWS = mapperGrid
  .slice(1)
  .map(
    (row) => ({
      ...Object.fromEntries(
        mapperHeader.map((name, index) => [name, mapperCell(row[index] ?? '', name)]),
      ),
      // The frozen validation export predates the Supabase lifecycle column.
      // Production queries already filter `is_active = true`.
      is_active: true,
    }) as unknown as IngredientRow,
  );

const candidateFor = (lineId: string): SubstituteCandidate => {
  const candidate = verifiedRecipeSubstituteCandidates(
    selectCanonicalDraft().input,
    lineId,
    MAPPER_ROWS,
    50,
  )[0];
  expect(candidate?.ingredient).toBeDefined();
  expect(candidate?.authorization).toBeDefined();
  return candidate!;
};

const behaviorSnapshot = (
  lineId: string,
  mapperIngredientId: string,
  mainEligible = false,
): ProductBehaviorSnapshot => ({
  schemaVersion: 1,
  resolutionState: 'RESOLVED',
  lineId,
  productId: `mapper:${mapperIngredientId}`,
  productVersionId: `mapper:${mapperIngredientId}:version:1`,
  source: 'mapper',
  factsFingerprint: `facts:${mapperIngredientId}`,
  behaviorBindingId: `binding:${mapperIngredientId}`,
  behaviorBindingVersion: '1',
  taxonomyVersion: 'test-v1',
  familyId: mainEligible ? 'fruit' : null,
  subfamilyId: null,
  formId: mainEligible ? 'fresh' : null,
  verificationState: 'verified',
  technicalAuthority: 'mapper_exact',
  mapperIngredientId,
  mainClassification: mainEligible ? 'MAIN_PROFILE_SPECIFIC' : 'STANDARD_ONLY',
  mainPolicyId: mainEligible ? 'test-fruit-main' : null,
  mainPolicyVersion: mainEligible ? '1' : null,
  ecoFloorPercent: mainEligible ? 10 : null,
  optimalCeilingPercent: mainEligible ? 100 : null,
  hardLimitPercent: mainEligible ? 100 : null,
  mainEquivalentFactor: mainEligible ? 1 : null,
  mainBasis: mainEligible ? 'FRUIT_EQUIVALENT' : null,
  requiresLiquidDairyCarrier: false,
  liquidDairyCarrierFloorPercent: null,
  approvedLiquidDairyCarrier: !mainEligible,
  approvedMixedFamilyIds: [],
  moduleEligibility: {
    BASE_RECIPE: 'eligible',
    SUBSTITUTION: 'eligible',
    MAIN: mainEligible ? 'eligible' : 'blocked',
    OPTIMAL: 'eligible',
    ECO: 'eligible',
    SAVE: 'eligible',
    PRODUCTION: 'eligible',
  },
  processScope: 'BASE_FORMULATION',
  resolverVersion: 'test-v1',
  sharedFacts: {
    schemaVersion: 1,
    technicalComposition: null,
    nutritionPer100g: null,
    allergens: null,
    processEvidence: [],
    profileEligibility: ['milk_gelato'],
    veganEligibility: 'unknown',
    proteinBehavior: 'unknown',
    referencePrice: null,
  },
  warnings: [],
  blockReasons: [],
});

const select = (lineId: string, candidate: SubstituteCandidate, confirmMain = false) => {
  const draft = selectCanonicalDraft();
  const replacement = behaviorSnapshot(
    lineId,
    candidate.ingredient!.canonical_ingredient_id ?? candidate.ingredient!.id,
    useRecipeStore.getState().items.find((item) => item.id === lineId)?.lock_type === 'main',
  );
  const initialSnapshots = {
    ...useRecipeStore.getState().productBehaviorSnapshots,
    [lineId]: replacement,
  };
  const raw = buildSubstitutionPreview(
    draft.input,
    draft.constraints,
    lineId,
    candidate.ingredient!,
    candidate.authorization!,
    '2026-08-13T10:00:00.000Z',
    { productBehaviorSnapshots: initialSnapshots },
  );
  const proposalSnapshots = raw.ok
    ? Object.fromEntries(raw.preview.proposedInput.items.map((item) => [
        item.id,
        initialSnapshots[item.id] ?? behaviorSnapshot(
          item.id,
          canonicalIngredientId(item.ingredient),
          item.lock_type === 'main',
        ),
      ]))
    : initialSnapshots;
  useConstraintStudioStore.getState().createSubstitutionPreview(
    lineId,
    candidate.ingredient!,
    candidate.authorization!,
    replacement,
    confirmMain,
    proposalSnapshots,
  );
};

beforeEach(() => {
  useRecipeStore.setState({
    mode: 'classic',
    category: 'milk_gelato',
    visibleProductType: 'gelato',
    target_temperature_c: -11,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    direction_targets_active: false,
    items: [],
    productBehaviorSnapshots: {},
    excludedIngredientIds: [],
    unavailableMainIngredientIds: [],
  });
  useConstraintStudioStore.getState().resetForTests();
  for (const item of DEFAULT_PRESET.items) {
    const grams = item.ingredient.id === 'milk_3_5'
      ? item.planned_grams - 350
      : item.planned_grams;
    if (grams > 0) useRecipeStore.getState().addIngredient(item.ingredient, grams);
  }
  useRecipeStore.getState().addIngredient(strawberry, 350);
  for (const item of useRecipeStore.getState().items) {
    useRecipeStore.getState().setProductBehaviorSnapshot(
      item.id,
      behaviorSnapshot(
        item.id,
        item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
        item.ingredient.name.includes('STRAWBERRIES'),
      ),
    );
  }
  expect(Object.keys(useRecipeStore.getState().productBehaviorSnapshots).sort()).toEqual(
    useRecipeStore.getState().items.map((item) => item.id).sort(),
  );
  expect(Object.fromEntries(Object.entries(useRecipeStore.getState().productBehaviorSnapshots)
    .map(([id, snapshot]) => [id, snapshot?.moduleEligibility.BASE_RECIPE]))).toEqual(
      Object.fromEntries(useRecipeStore.getState().items.map((item) => [item.id, 'eligible'])),
    );
});

describe('normal recipe substitution → Preview → Apply', () => {
  it('keeps the active recipe unchanged before Apply, applies once, and Undo restores identity', () => {
    const line = useRecipeStore.getState().items.find((item) => item.lock_type !== 'main')!;
    const originalId = line.ingredient.canonical_ingredient_id ?? line.ingredient.id;
    const originalBehaviorVersion =
      useRecipeStore.getState().productBehaviorSnapshots[line.id]?.productVersionId;
    const candidate = candidateFor(line.id);

    select(line.id, candidate);
    const preview = useConstraintStudioStore.getState().preview;
    expect(
      preview?.kind,
      JSON.stringify(useConstraintStudioStore.getState().previewIssue),
    ).toBe('substitution');
    expect(
      useRecipeStore.getState().items.find((item) => item.id === line.id)?.ingredient
        .canonical_ingredient_id,
    ).toBe(originalId);

    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    expect(
      useRecipeStore.getState().items.find((item) => item.id === line.id)?.ingredient
        .canonical_ingredient_id,
    ).toBe(candidate.id);
    expect(
      useRecipeStore.getState().productBehaviorSnapshots[line.id]?.mapperIngredientId,
    ).toBe(candidate.id);
    useConstraintStudioStore.getState().undoLastApply();
    expect(
      useRecipeStore.getState().items.find((item) => item.id === line.id)?.ingredient
        .canonical_ingredient_id,
    ).toBe(originalId);
    expect(
      useRecipeStore.getState().productBehaviorSnapshots[line.id]?.productVersionId,
    ).toBe(originalBehaviorVersion);
  });

  it('requires explicit Main identity consent and blocks a preview whose session consent is removed', () => {
    const line = useRecipeStore
      .getState()
      .items.find((item) => item.ingredient.name.includes('STRAWBERRIES'))!;
    useRecipeStore.getState().setMainIngredient(line.id);
    const candidate = candidateFor(line.id);

    select(line.id, candidate);
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().previewIssue?.code).toBe('substitution_invalid');

    select(line.id, candidate, true);
    expect(useConstraintStudioStore.getState().preview?.substitution?.changesMainIdentity).toBe(
      true,
    );
    useConstraintStudioStore.setState({ substitutionConsent: null });
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked?.code).toBe('main_identity_violated');
    expect(
      useRecipeStore.getState().items.find((item) => item.id === line.id)?.ingredient
        .canonical_ingredient_id,
    ).toBe(line.ingredient.canonical_ingredient_id);
  });

  it('rejects a duplicate canonical identity before Preview', () => {
    const [line, duplicate] = useRecipeStore.getState().items;
    expect(line).toBeDefined();
    expect(duplicate).toBeDefined();
    const candidate = candidateFor(line!.id);
    select(line!.id, { ...candidate, ingredient: duplicate!.ingredient });
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().previewIssue?.code).toBe('substitution_invalid');
  });

  it('blocks forged canonical identity or composition even with copied verified flags', () => {
    const line = useRecipeStore.getState().items.find((item) => item.lock_type !== 'main')!;
    const candidate = candidateFor(line.id);
    const changedComposition = structuredClone(candidate.ingredient!);
    changedComposition.composition.water_percent += 1;
    select(line.id, { ...candidate, ingredient: changedComposition });
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().previewIssue).toMatchObject({
      code: 'substitution_invalid',
      reasons: expect.arrayContaining(['candidate_authorization_mismatch']),
    });

    const fake = {
      ...structuredClone(candidate.ingredient!),
      id: 'PI-ING-NOT-IN-MAPPER',
      canonical_ingredient_id: 'PI-ING-NOT-IN-MAPPER',
    };
    const forgedAuthorization: SubstituteAuthorization = {
      ...candidate.authorization!,
      canonicalId: fake.canonical_ingredient_id,
      ingredientFingerprint: substitutionIngredientFingerprint(fake),
    };
    select(line.id, {
      ...candidate,
      id: fake.id,
      ingredient: fake,
      authorization: forgedAuthorization,
    });
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().previewIssue).toMatchObject({
      code: 'substitution_invalid',
      reasons: expect.arrayContaining(['candidate_authorization_mismatch']),
    });
  });

  it('rejects a forged replacement behavior snapshot at Apply', () => {
    const line = useRecipeStore.getState().items.find((item) => item.lock_type !== 'main')!;
    const candidate = candidateFor(line.id);
    select(line.id, candidate);
    const authorization = useConstraintStudioStore.getState().substitutionAuthorization;
    expect(authorization).not.toBeNull();
    useConstraintStudioStore.setState({
      substitutionAuthorization: authorization
        ? {
            ...authorization,
            productBehaviorSnapshot: {
              ...authorization.productBehaviorSnapshot,
              mapperIngredientId: line.ingredient.canonical_ingredient_id ?? line.ingredient.id,
            },
          }
        : null,
    });
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked?.code).toBe('main_identity_violated');
    expect(
      useRecipeStore.getState().items.find((item) => item.id === line.id)?.ingredient
        .canonical_ingredient_id,
    ).toBe(line.ingredient.canonical_ingredient_id);
  });
});
