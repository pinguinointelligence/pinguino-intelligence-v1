import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeInput, RecipeItem } from '@/engine';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import {
  SORBET_MAIN_IDS,
  sorbetAuthoritySnapshots,
  sorbetMapperIngredient,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { evaluateFreezingStabilityStatus } from '@/features/recipe-constraints/freezingStabilityStatus';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { useConstraintStudioStore } from './constraintStudioStore';

/**
 * Served staging regression (Sorbet closeout QA, 2026-08-22): a complete,
 * technically clean, FULLY PRICED ECO draft takes the verified cost-sweep route.
 * The swept preview left the Main group untouched but carried no Main proof,
 * and the Apply door then rebuilt the frontier WITHOUT the owner's price index,
 * so the honest preview could never be reproduced and every Apply was refused
 * ("nie udało się ponownie potwierdzić dowodu … / nie odtwarza dokładnie …").
 */
const price = (id: string, pricePerKg: number) => ({
  overrideId: `override:${id}`,
  ownerUserId: 'owner-test',
  canonicalIngredientId: id,
  pricePerKg,
  currency: 'EUR',
  createdBy: 'owner-test',
  createdAt: '2026-08-22T00:00:00.000Z',
  updatedAt: '2026-08-22T00:00:00.000Z',
});

/** The owner's "Moja cena" overrides observed on staging (water / inulin / tara / strawberries). */
const OWNER_PRICES = {
  'PI-ING-001409': price('PI-ING-001409', 1),
  'PI-ING-000456': price('PI-ING-000456', 9),
  'PI-ING-000492': price('PI-ING-000492', 13),
  'PI-ING-001553': price('PI-ING-001553', 10),
};

/** Served Sorbet: canonical −11 °C scaffold + strawberry 400 g / lime 200 g Multi-Main (weights 2:1). */
const servedSorbet = (strategy: 'eco' | 'optimal'): RecipeInput => {
  const scaffold = buildCanonicalNewRecipeStarter({
    visibleProductType: 'sorbet',
    servingModeId: 'temp_minus_11',
    formulationStrategy: strategy,
    targetBatchGrams: 1_000,
  });
  return {
    mode: 'classic',
    category: 'sorbet',
    target_temperature_c: -11,
    target_batch_grams: 1_000,
    machine_capacity_grams: null,
    items: [
      ...scaffold.items.map((item) => ({
        ...item,
        ingredient: sorbetMapperIngredient(
          item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
        ),
      })),
      {
        id: 'line-strawberry',
        ingredient: { ...sorbetMapperIngredient(SORBET_MAIN_IDS.strawberry), cost_per_kg: null },
        planned_grams: 400,
        actual_grams: null,
        lock_type: 'main',
        main_ratio_weight: 2,
        user_intent_anchor_grams: 400,
      } as RecipeItem,
      {
        id: 'line-lime',
        ingredient: { ...sorbetMapperIngredient(SORBET_MAIN_IDS.lime), cost_per_kg: 3.5 },
        planned_grams: 200,
        actual_grams: null,
        lock_type: 'main',
        user_target_grams: 200,
        user_intent_anchor_grams: 200,
      } as RecipeItem,
    ],
    goals: {
      formulation_strategy: strategy,
      direction_targets_active: false,
      direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    },
  };
};

/** Server-shaped authority: structural lines NOT_MAIN / STANDARD_ONLY with no profile list,
 * Mains bound to the exact 60 % Sorbet policy. */
const servedSnapshots = (input: RecipeInput): Record<string, ProductBehaviorSnapshot> => {
  const snapshots = sorbetAuthoritySnapshots(input);
  for (const item of input.items) {
    const base = snapshots[item.id]!;
    const facts = base.sharedFacts;
    if (!facts) throw new Error(`fixture snapshot ${item.id} has no sharedFacts`);
    snapshots[item.id] =
      item.lock_type === 'main'
        ? {
            ...base,
            subfamilyId: item.id === 'line-lime' ? 'citrus' : 'berry',
            sharedFacts: { ...facts, profileEligibility: ['milk_gelato', 'sorbet'] },
          }
        : {
            ...base,
            mainClassification: item.id.includes('inulin') ? 'STANDARD_ONLY' : 'NOT_MAIN',
            sharedFacts: { ...facts, profileEligibility: [] },
          };
  }
  return snapshots;
};

const load = (
  input: RecipeInput,
  snapshots: Record<string, ProductBehaviorSnapshot>,
  overrides: Record<string, ReturnType<typeof price>>,
) => {
  useConstraintStudioStore.getState().resetForTests();
  useRecipeProfileStore.getState().resetForTests();
  useCustomerPriceStore.setState({ overridesByCanonicalId: overrides });
  useRecipeStore.getState().loadRecipeInput(input);
  for (const item of useRecipeStore.getState().items) {
    useRecipeStore.getState().setProductBehaviorSnapshot(item.id, snapshots[item.id]!);
  }
  useRecipeProfileStore.getState().markRecalculationRequired();
};

const mainGrams = () =>
  useRecipeStore
    .getState()
    .items.filter((item) => item.lock_type === 'main')
    .map((item) => [item.id, item.planned_grams] as const);

describe('Apply door — ECO cost-swept preview with owner prices (served Sorbet regression)', () => {
  beforeEach(() => {
    useCustomerPriceStore.setState({ overridesByCanonicalId: {} });
  });

  it('carries the Main frontier proof on the swept preview and applies it (Dobra afterwards)', () => {
    const input = servedSorbet('eco');
    load(input, servedSnapshots(input), OWNER_PRICES);

    useConstraintStudioStore.getState().createOptimizePreview();
    const staged = useConstraintStudioStore.getState().preview;
    expect(staged, JSON.stringify(useConstraintStudioStore.getState().previewIssue)).not.toBeNull();
    // The fully priced clean ECO draft takes the verified cost sweep (no solver rounds)…
    expect(staged?.autoBalance).toEqual({ batchRescaled: false, solverRounds: 0 });
    // …the Mains stay exactly at the owner 60 % identity…
    expect(
      staged!.proposedInput.items
        .filter((item) => item.lock_type === 'main')
        .map((item) => item.planned_grams),
    ).toEqual([400, 200]);
    // …and the Main frontier proof rides with the swept proposal.
    expect(staged?.mainObjective).toMatchObject({
      status: 'maximized',
      provenMaximum: true,
      executableMainGrams: 600,
      startingMainGrams: 600,
    });

    useConstraintStudioStore.getState().applyPreview();
    const after = useConstraintStudioStore.getState();
    expect(after.blocked, after.blocked?.messagePl).toBeNull();
    expect(after.history).toHaveLength(1);
    expect(mainGrams()).toEqual([
      ['line-strawberry', 400],
      ['line-lime', 200],
    ]);
    expect(useRecipeStore.getState().items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(
      1_000,
    );
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);

    const applied: RecipeInput = { ...input, items: useRecipeStore.getState().items };
    const freezing = evaluateFreezingStabilityStatus({
      recipe: applied,
      snapshots: servedSnapshots(applied),
      calculationState: 'CURRENT',
    });
    expect(freezing.status, freezing.reasons.join(', ')).toBe('GOOD');
  });

  it.each(['eco', 'optimal'] as const)(
    'keeps the unpriced %s path unchanged (proof present, Apply succeeds)',
    (strategy) => {
      const input = servedSorbet(strategy);
      load(input, servedSnapshots(input), {});
      useConstraintStudioStore.getState().createOptimizePreview();
      expect(useConstraintStudioStore.getState().preview?.mainObjective?.status).toBe('maximized');
      useConstraintStudioStore.getState().applyPreview();
      expect(useConstraintStudioStore.getState().blocked).toBeNull();
      expect(useConstraintStudioStore.getState().history).toHaveLength(1);
      expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
    },
  );

  it('never refuses an honest Gelato ECO preview just because the owner set a price', () => {
    const base = starterMilkBase();
    const input: RecipeInput = { ...base, goals: { ...base.goals, formulation_strategy: 'eco' } };
    const milk = input.items[0]!;
    const milkId = milk.ingredient.canonical_ingredient_id ?? milk.ingredient.id;
    load(input, productBehaviorTestSnapshots(input), { [milkId]: price(milkId, 0.9) });
    useConstraintStudioStore.getState().createOptimizePreview();
    const state = useConstraintStudioStore.getState();
    if (state.preview) {
      useConstraintStudioStore.getState().applyPreview();
      expect(useConstraintStudioStore.getState().blocked).toBeNull();
    } else {
      // A truthful no-change terminal is acceptable; a blocked Apply is not.
      expect(state.recalculationTerminal?.state).toBe('NO_CHANGE_NEEDED');
    }
  });
});
