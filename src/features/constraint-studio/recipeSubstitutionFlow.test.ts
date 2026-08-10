import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCsv } from '@/lib/csv';
import type { EngineIngredient } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
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

const select = (lineId: string, candidate: SubstituteCandidate, confirmMain = false) =>
  useConstraintStudioStore
    .getState()
    .createSubstitutionPreview(
      lineId,
      candidate.ingredient!,
      candidate.authorization!,
      confirmMain,
    );

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
    excludedIngredientIds: [],
    unavailableMainIngredientIds: [],
  });
  useConstraintStudioStore.getState().resetForTests();
  useRecipeStore.getState().addIngredient(findDemoIngredient('milk_3_5')!, 0);
  useRecipeStore.getState().addIngredient(strawberry, 350);
  useConstraintStudioStore.getState().createOptimizePreview();
  useConstraintStudioStore.getState().applyPreview();
  expect(useConstraintStudioStore.getState().blocked).toBeNull();
});

describe('normal recipe substitution → Preview → Apply', () => {
  it('keeps the active recipe unchanged before Apply, applies once, and Undo restores identity', () => {
    const line = useRecipeStore.getState().items.find((item) => item.lock_type !== 'main')!;
    const originalId = line.ingredient.canonical_ingredient_id ?? line.ingredient.id;
    const candidate = candidateFor(line.id);

    select(line.id, candidate);
    const preview = useConstraintStudioStore.getState().preview;
    expect(preview?.kind).toBe('substitution');
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
    useConstraintStudioStore.getState().undoLastApply();
    expect(
      useRecipeStore.getState().items.find((item) => item.id === line.id)?.ingredient
        .canonical_ingredient_id,
    ).toBe(originalId);
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
});
