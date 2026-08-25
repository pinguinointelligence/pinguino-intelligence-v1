import { describe, expect, it, vi } from 'vitest';
import type { EngineIngredient, RecipeInput } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { productBehaviorTestSnapshots } from './productBehaviorTestFixture';
import {
  buildRefreshedRecipeBehaviorWorkingCopy,
  productBehaviorIssuesSupportWorkingCopyRefresh,
} from './refreshRecipeBehaviorWorkingCopy';

type RefreshDependencies = NonNullable<
  Parameters<typeof buildRefreshedRecipeBehaviorWorkingCopy>[1]
>;
type ResolveInput = Parameters<NonNullable<RefreshDependencies['resolveSnapshots']>>[0];
type ValidateInput = Parameters<NonNullable<RefreshDependencies['validate']>>[0];

const ingredient = (id: string, water: number): EngineIngredient => ({
  id,
  canonical_ingredient_id: id,
  identity_provenance: 'mapper',
  name: id,
  category: 'other',
  composition: {
    water_percent: water,
    solids_percent: 100 - water,
    fat_percent: 0,
    protein_percent: 0,
    carbohydrate_percent: 100 - water,
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
  },
  pod_value: 0,
  pac_value: 0,
  de_value: null,
  cost_per_kg: null,
  confidence_score: 100,
  source_type: 'verified_db',
  is_verified: true,
});

const historicalRecipe = (): RecipeInput => ({
  items: [
    {
      id: 'main-a',
      ingredient: ingredient('PI-ING-000101', 78),
      planned_grams: 240,
      actual_grams: null,
      lock_type: 'main',
      main_ratio_weight: 2,
      production_step: 1,
      notes: 'Main A',
    },
    {
      id: 'main-b',
      ingredient: ingredient('PI-ING-000102', 74),
      planned_grams: 120,
      actual_grams: null,
      lock_type: 'main',
      main_ratio_weight: 1,
      production_step: 2,
      notes: 'Main B',
    },
    {
      id: 'locked-standard',
      ingredient: ingredient('PI-ING-000514', 0),
      planned_grams: 640,
      actual_grams: null,
      lock_type: 'grams',
      grams_constraint: { grams: 640 },
      production_step: 3,
      notes: 'Locked standard',
    },
  ],
  mode: 'classic',
  category: 'sorbet',
  target_temperature_c: -12,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: { formulation_strategy: 'eco' },
});

const currentSnapshots = (recipe: RecipeInput) => {
  const snapshots = productBehaviorTestSnapshots(recipe);
  return Object.fromEntries(
    Object.entries(snapshots).map(([lineId, snapshot], index) => [
      lineId,
      {
        ...snapshot,
        factsFingerprint: `current-facts-${index}`,
        behaviorBindingVersion: 'current-binding-v2',
        taxonomyVersion: 'current-taxonomy-v2',
        resolutionContext: {
          accountId: 'qa-user',
          productProfile: recipe.category,
          temperatureC: recipe.target_temperature_c,
          mode: 'eco' as const,
          processScope: 'BASE_FORMULATION' as const,
          requestedRole: snapshot.lineId.startsWith('main-') ? ('MAIN' as const) : ('STANDARD' as const),
          module: 'ECO' as const,
        },
      },
    ]),
  );
};

describe('ProductBehavior historical snapshot refresh', () => {
  it('creates a current-authority working copy without changing historical grams or intent', async () => {
    const oldRecipe = historicalRecipe();
    const oldSnapshots = productBehaviorTestSnapshots(oldRecipe);
    for (const snapshot of Object.values(oldSnapshots)) snapshot.factsFingerprint = 'historical';
    const immutableHistoricalRecipe = structuredClone(oldRecipe);
    const immutableHistoricalSnapshots = structuredClone(oldSnapshots);
    const current = currentSnapshots(oldRecipe);

    const resolveSnapshots = vi.fn(async (input: ResolveInput) => {
      expect(Object.values(input.snapshots)).toHaveLength(3);
      expect(Object.values(input.snapshots).every(
        (snapshot) => snapshot?.resolutionState === 'REVALIDATION_REQUIRED',
      )).toBe(true);
      return { snapshots: structuredClone(current), unresolvedLineIds: [] };
    });
    const validate = vi.fn(async (input: ValidateInput) => ({
      ready: Object.values(input.snapshots).every(
        (snapshot) => snapshot?.factsFingerprint.startsWith('current-facts-'),
      ),
      module: input.module,
      staleLineIds: [],
      lines: input.recipe.items.map((item) => ({ lineId: item.id, state: 'ready' as const, reasons: [] })),
    }));

    // This is the exact old-version failure being repaired: its frozen facts
    // are historical and cannot pass the current terminal authority gate.
    expect(Object.values(oldSnapshots).every(
      (snapshot) => snapshot.factsFingerprint.startsWith('current-facts-'),
    )).toBe(false);

    const result = await buildRefreshedRecipeBehaviorWorkingCopy(
      {
        recipe: oldRecipe,
        toppings: [],
        snapshots: oldSnapshots,
        accountId: 'qa-user',
        technicalOnlyMainLineIds: [],
      },
      { resolveSnapshots, validate },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validate).toHaveBeenCalledOnce();
    expect(result.recipe.items.map((item) => ({
      id: item.id,
      grams: item.planned_grams,
      actual: item.actual_grams,
      lock: item.lock_type,
      ratio: item.main_ratio_weight,
      gramsConstraint: item.grams_constraint,
      productionStep: item.production_step,
      notes: item.notes,
    }))).toEqual(oldRecipe.items.map((item) => ({
      id: item.id,
      grams: item.planned_grams,
      actual: item.actual_grams,
      lock: item.lock_type,
      ratio: item.main_ratio_weight,
      gramsConstraint: item.grams_constraint,
      productionStep: item.production_step,
      notes: item.notes,
    })));
    expect(result.recipe.items.every((item) => canonicalIngredientId(item.ingredient).startsWith('PI-ING-'))).toBe(true);
    expect(Object.values(result.snapshots).every(
      (snapshot) => snapshot.factsFingerprint.startsWith('current-facts-'),
    )).toBe(true);
    expect(oldRecipe).toEqual(immutableHistoricalRecipe);
    expect(oldSnapshots).toEqual(immutableHistoricalSnapshots);
  });

  it('fails closed and returns no working copy when any current authority is unresolved', async () => {
    const recipe = historicalRecipe();
    const snapshots = productBehaviorTestSnapshots(recipe);
    const validate = vi.fn();
    const result = await buildRefreshedRecipeBehaviorWorkingCopy(
      { recipe, toppings: [], snapshots, accountId: 'qa-user' },
      {
        resolveSnapshots: async () => ({ snapshots, unresolvedLineIds: ['main-b'] }),
        validate,
      },
    );

    expect(result).toEqual({
      ok: false,
      code: 'current_authority_unresolved',
      lineIds: ['main-b'],
      issues: [{ lineId: 'main-b', lineName: 'PI-ING-000102', reasons: ['behavior_snapshot_missing_or_unresolved'] }],
    });
    expect(validate).not.toHaveBeenCalled();
  });

  it('is deterministic when refreshed authority is resolved again', async () => {
    const recipe = historicalRecipe();
    const current = currentSnapshots(recipe);
    const resolveSnapshots = vi.fn(async () => ({ snapshots: structuredClone(current), unresolvedLineIds: [] }));
    const validate = vi.fn(async (input: ValidateInput) => ({
      ready: true,
      module: input.module,
      staleLineIds: [],
      lines: input.recipe.items.map((item) => ({ lineId: item.id, state: 'ready' as const, reasons: [] })),
    }));
    const first = await buildRefreshedRecipeBehaviorWorkingCopy(
      { recipe, toppings: [], snapshots: current, accountId: 'qa-user' },
      { resolveSnapshots, validate },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await buildRefreshedRecipeBehaviorWorkingCopy(
      { recipe: first.recipe, toppings: [], snapshots: first.snapshots, accountId: 'qa-user' },
      { resolveSnapshots, validate },
    );
    expect(second).toEqual(first);
  });

  it('offers refresh only for stale/snapshot lifecycle reasons, not missing product science', () => {
    expect(productBehaviorIssuesSupportWorkingCopyRefresh([
      { lineId: 'a', lineName: 'A', reasons: ['facts_fingerprint_stale:details'] },
      { lineId: 'b', lineName: 'B', reasons: ['behavior_binding_version_stale'] },
    ])).toBe(true);
    expect(productBehaviorIssuesSupportWorkingCopyRefresh([
      { lineId: 'a', lineName: 'A', reasons: ['missing_technical_fields'] },
    ])).toBe(false);
  });
});
