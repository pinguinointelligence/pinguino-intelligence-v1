import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import {
  buildRecipeVersion,
  compareVersions,
  nextVersionNumber,
  restoreVersion,
} from '@/features/pro-core/recipeVersioning';
import { buildRecipeDirectionPlan } from '@/features/recipe-direction/recipeDirectionTargets';
import { assessProteinFormulation } from './proteinAuthority';
import { INTERNET_PROTEIN_RECIPES } from './__fixtures__/internetProteinRecipes';
import { internetRecipeInput } from './internetRecipeMatrix.report.test';

/**
 * §23 — SAVE / REOPEN / IMMUTABLE VERSIONS on real internet recipes.
 *
 * Five recipes each walk Save v1 → reopen → modify → Save v2 → restore v1
 * (which creates v3). What must survive that round trip, byte-for-byte:
 * the Protein profile, the serving temperature, the formulation strategy, the
 * Sweetness Direction state, gram values, and product identity per line.
 *
 * The specific risk this guards is RUNTIME COMPOSITION DRIFT: a reopened
 * version must reproduce the SAME engine metrics it was saved with. That is the
 * persistence-side form of the toolbox↔Mapper identity defect — a saved recipe
 * whose ingredients silently re-resolve to different compositions would be the
 * same bug wearing a different hat.
 */

const OWNER = 'protein-closeout-qa';
const V1_AT = '2026-08-23T12:00:00.000Z';
const V2_AT = '2026-08-23T12:05:00.000Z';
const V3_AT = '2026-08-23T12:10:00.000Z';
const TRACE = { engineVersion: 'e1', configVersion: 'c1', mapperDatasetVersion: 'm1' } as const;

const CASES = [
  'vanilla-creami',
  'pistachio-tastytravelers',
  'whey-heavy-gelatobalancing',
  'skyr-icelandicprovisions',
  'high-fat-eatingbirdfood',
] as const;

const version = (
  recipeId: string,
  input: RecipeInput,
  versionNumber: number,
  createdAt: string,
  id: string,
) =>
  buildRecipeVersion(
    {
      recipeId,
      ownerUserId: OWNER,
      versionNumber,
      recipeInput: input,
      trace: TRACE,
      source: 'manual',
      createdBy: OWNER,
      createdAt,
      productProfile: input.category,
      temperatureC: input.target_temperature_c,
    },
    id,
  );

/** Every engine number a reopened version must still reproduce. */
const fingerprint = (input: RecipeInput) => {
  const result = calculateRecipe(input);
  const value = (key: string) =>
    result.indicators.find((entry) => entry.key === key)?.value ?? null;
  const protein = assessProteinFormulation(input, result);
  return {
    pod: value('pod'),
    npac: value('npac'),
    solids: value('total_solids'),
    water: value('water'),
    proteinPercent: protein.actualPercent,
    qualified: protein.qualification.qualified,
    lines: input.items.map((item) => [
      item.ingredient.canonical_ingredient_id,
      item.planned_grams,
    ]),
  };
};

describe('§23 — Protein Save / reopen / immutable versions', () => {
  it.each(CASES)('%s survives v1 → modify → v2 → restore v1 → v3', (id) => {
    const recipe = INTERNET_PROTEIN_RECIPES.find((r) => r.id === id)!;
    const draft = internetRecipeInput(recipe, -12, 'optimal', 1);
    const before = fingerprint(draft);

    const v1 = version(id, draft, 1, V1_AT, `${id}-v1`);

    // REOPEN v1 — the snapshot must reproduce the same engine numbers.
    expect(fingerprint(v1.recipeInput)).toEqual(before);
    expect(v1.recipeInput.category).toBe('protein_gelato');
    expect(v1.recipeInput.target_temperature_c).toBe(-12);
    expect(v1.recipeInput.goals?.direction_targets?.sweetness).toBe(1);
    expect(v1.recipeInput.goals?.formulation_strategy).toBe('optimal');
    expect(assessProteinFormulation(v1.recipeInput).applicable).toBe(true);

    // MODIFY and save v2: a different serving temperature and Sweetness.
    const modified: RecipeInput = {
      ...internetRecipeInput(recipe, -11, 'eco', -2),
      items: draft.items.map((item, index) =>
        index === 0 ? { ...item, planned_grams: item.planned_grams + 10 } : item,
      ),
    };
    const v2 = version(id, modified, nextVersionNumber([v1]), V2_AT, `${id}-v2`);
    expect(v2.versionNumber).toBe(2);
    expect(v2.recipeInput.target_temperature_c).toBe(-11);
    expect(v2.recipeInput.goals?.direction_targets?.sweetness).toBe(-2);
    expect(v2.recipeInput.goals?.formulation_strategy).toBe('eco');

    // v1 is IMMUTABLE — saving v2 may not have touched it.
    expect(fingerprint(v1.recipeInput)).toEqual(before);
    expect(compareVersions(v1, v2).identical).toBe(false);

    // RESTORE v1 → creates v3 carrying v1's exact input.
    const v3 = restoreVersion([v1, v2], 1, OWNER, V3_AT, `${id}-v3`);
    expect(v3.versionNumber).toBe(3);
    expect(v3.source).toBe('restored');
    expect(v3.restoredFromVersion).toBe(1);

    // No runtime composition drift across the whole round trip.
    expect(fingerprint(v3.recipeInput)).toEqual(before);
    expect(v3.recipeInput.target_temperature_c).toBe(-12);
    expect(v3.recipeInput.goals?.direction_targets?.sweetness).toBe(1);
    // Product identity per line is preserved, not re-resolved.
    expect(v3.recipeInput.items.map((item) => item.ingredient.canonical_ingredient_id)).toEqual(
      draft.items.map((item) => item.ingredient.canonical_ingredient_id),
    );
    // And the restored recipe still plans Direction the same way.
    expect(
      buildRecipeDirectionPlan(v3.recipeInput).axes.find((axis) => axis.axis === 'sweetness')!
        .targetBand,
    ).toEqual(
      buildRecipeDirectionPlan(draft).axes.find((axis) => axis.axis === 'sweetness')!.targetBand,
    );
  }, 120_000);
});
