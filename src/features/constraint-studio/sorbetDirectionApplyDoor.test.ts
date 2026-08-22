import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeDirectionTarget, RecipeInput, RecipeItem } from '@/engine';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import {
  SORBET_MAIN_IDS,
  sorbetAuthoritySnapshots,
  sorbetMapperIngredient,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { evaluateFreezingStabilityStatus } from '@/features/recipe-constraints/freezingStabilityStatus';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { workingStateFingerprint } from './applyPipeline';
import { useConstraintStudioStore } from './constraintStudioStore';

/**
 * Served staging regression (Sorbet closeout QA, 2026-08-22): a Sorbet exact
 * five-step Direction Preview (closed-form projection; Main, Inulin and
 * stabilizer byte-exact) accepted as "Przelicz najlepiej możliwie" could never
 * be applied — the door demanded a Main maximisation proof, and the Main
 * frontier treats an unreached exact Direction target as a hard gate, so the
 * honest nearest-achievable Preview was refused with `main_identity_violated`.
 * The door now accepts the byte-exact held Main group when the same exact
 * candidate reproduces deterministically from the trusted draft, and keeps the
 * full proof contract for every other optimize Preview.
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

/** Served inulin dose policy (2–8 %, optional zero) frozen in the product snapshot. */
const INULIN_DOSE = {
  policyId: 'gellatti-generic-inulin',
  maxPercent: 8,
  minPercent: 2,
  provenance: 'owner-approved Gellatti formulation policy',
  policyVersion: 1,
  sourceVersion: 'owner-gellatti-inulin-v1',
  preferredPercent: 4,
  presenceSemantics: 'optional_zero_or_range',
};

type Direction = { sweetness?: RecipeDirectionTarget; softness?: RecipeDirectionTarget };

/** Served Sorbet: canonical −12 °C scaffold + strawberries 600 g single Main, exact Direction active. */
const servedSorbet = (direction: Direction): RecipeInput => {
  const scaffold = buildCanonicalNewRecipeStarter({
    visibleProductType: 'sorbet',
    servingModeId: 'temp_minus_12',
    formulationStrategy: 'eco',
    targetBatchGrams: 1_000,
  });
  return {
    mode: 'classic',
    category: 'sorbet',
    target_temperature_c: -12,
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
        planned_grams: 600,
        actual_grams: null,
        lock_type: 'main',
        user_intent_anchor_grams: 600,
      } as RecipeItem,
    ],
    goals: {
      formulation_strategy: 'eco',
      direction_targets_active: true,
      direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0, ...direction },
    },
  };
};

/** Server-shaped authority: structural lines NOT_MAIN / STANDARD_ONLY with no profile list,
 * the Main bound to the exact 60 % Sorbet policy, inulin dose frozen. */
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
            subfamilyId: 'berry',
            sharedFacts: { ...facts, profileEligibility: ['milk_gelato', 'sorbet'] },
          }
        : {
            ...base,
            mainClassification: item.id.includes('inulin') ? 'STANDARD_ONLY' : 'NOT_MAIN',
            sharedFacts: {
              ...facts,
              profileEligibility: [],
              recommendedDose: item.id.includes('inulin')
                ? (INULIN_DOSE as unknown as typeof facts.recommendedDose)
                : facts.recommendedDose,
            },
          };
  }
  return snapshots;
};

const load = (input: RecipeInput) => {
  useConstraintStudioStore.getState().resetForTests();
  useRecipeProfileStore.getState().resetForTests();
  useCustomerPriceStore.setState({ overridesByCanonicalId: OWNER_PRICES });
  useRecipeStore.getState().loadRecipeInput(input);
  const snapshots = servedSnapshots(input);
  for (const item of useRecipeStore.getState().items) {
    useRecipeStore.getState().setProductBehaviorSnapshot(item.id, snapshots[item.id]!);
  }
  useRecipeProfileStore.getState().markRecalculationRequired();
};

const grams = () =>
  useRecipeStore.getState().items.map((item) => [item.id, item.planned_grams] as const);

describe('Apply door — Sorbet exact Direction keeps the Main group byte-exact (served regression)', () => {
  beforeEach(() => {
    useCustomerPriceStore.setState({ overridesByCanonicalId: {} });
  });

  it('applies the accepted nearest-achievable softness −1 Preview (Main 600 g held, Dobra afterwards)', () => {
    const input = servedSorbet({ softness: -1 });
    load(input);

    useConstraintStudioStore.getState().createOptimizePreview();
    const staged = useConstraintStudioStore.getState();
    // The exact projection cannot reach the target; the surface asks for consent first.
    expect(staged.preview).toBeNull();
    const candidate = staged.directionBestCandidate;
    expect(candidate, JSON.stringify(staged.previewIssue)).not.toBeNull();
    expect(candidate?.mainHeldByExactDirection).toBe(true);
    expect(candidate?.directionAssessment?.active).toBe(true);
    expect(candidate?.directionAssessment?.reached).toBe(false);
    // Main byte-exact, only the canonical adjustable roles moved.
    expect(
      candidate!.proposedInput.items.find((item) => item.id === 'line-strawberry'),
    ).toMatchObject({
      planned_grams: 600,
      lock_type: 'main',
    });
    expect(candidate!.proposedInput.items.map((item) => [item.id, item.planned_grams])).toEqual([
      ['new-recipe-1-water', 156],
      ['new-recipe-2-sucrose', 80],
      ['new-recipe-3-dextrose', 105],
      ['new-recipe-4-inulin', 55],
      ['new-recipe-5-tara_gum', 4],
      ['line-strawberry', 600],
    ]);

    useConstraintStudioStore.getState().acceptBestDirectionCandidate();
    expect(useConstraintStudioStore.getState().preview).not.toBeNull();
    useConstraintStudioStore.getState().applyPreview();
    const after = useConstraintStudioStore.getState();
    expect(after.blocked, after.blocked?.messagePl).toBeNull();
    expect(after.history).toHaveLength(1);
    expect(grams()).toEqual([
      ['new-recipe-1-water', 156],
      ['new-recipe-2-sucrose', 80],
      ['new-recipe-3-dextrose', 105],
      ['new-recipe-4-inulin', 55],
      ['new-recipe-5-tara_gum', 4],
      ['line-strawberry', 600],
    ]);
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);

    const applied: RecipeInput = { ...input, items: useRecipeStore.getState().items };
    const freezing = evaluateFreezingStabilityStatus({
      recipe: applied,
      snapshots: servedSnapshots(applied),
      calculationState: 'CURRENT',
    });
    expect(freezing.status, freezing.reasons.join(', ')).toBe('GOOD');
  });

  it('refuses a forged held-Main flag whose Main grams moved or whose vector the exact path does not reproduce', () => {
    const input = servedSorbet({ softness: -1 });
    load(input);
    useConstraintStudioStore.getState().createOptimizePreview();
    useConstraintStudioStore.getState().acceptBestDirectionCandidate();
    const honest = useConstraintStudioStore.getState().preview!;
    const consent = useConstraintStudioStore.getState().directionConsent!;
    expect(honest.mainHeldByExactDirection).toBe(true);
    expect(consent).not.toBeNull();
    // Keep the surface-level Direction consent consistent with each forged
    // vector so the refusal below is the door's own Main-identity verdict.
    const forgedConsent = (preview: typeof honest) => ({
      ...consent,
      candidateFingerprint: workingStateFingerprint(preview.proposedInput, preview.nextConstraints),
    });

    // (a) Main grams moved under the held flag → byte-identity check refuses.
    const movedMain = structuredClone(honest);
    movedMain.proposedInput.items = movedMain.proposedInput.items.map((item) =>
      item.id === 'line-strawberry'
        ? { ...item, planned_grams: 590 }
        : item.id === 'new-recipe-1-water'
          ? { ...item, planned_grams: item.planned_grams + 10 }
          : item,
    );
    useConstraintStudioStore.setState({
      preview: movedMain,
      directionConsent: forgedConsent(movedMain),
    });
    useConstraintStudioStore.getState().applyPreview();
    // The exact 60 % Sorbet Main envelope refuses the moved Main before the
    // identity door; either gate is a refusal and nothing is applied.
    expect(['product_behavior_invalid', 'main_identity_violated']).toContain(
      useConstraintStudioStore.getState().blocked?.code,
    );
    expect(useConstraintStudioStore.getState().history).toHaveLength(0);
    expect(grams()).toEqual(input.items.map((item) => [item.id, item.planned_grams]));

    // (b) Main held but the adjustable vector is not the exact reproduction → refused.
    const forgedVector = structuredClone(honest);
    forgedVector.proposedInput.items = forgedVector.proposedInput.items.map((item) =>
      item.id === 'new-recipe-1-water'
        ? { ...item, planned_grams: item.planned_grams + 5 }
        : item.id === 'new-recipe-2-sucrose'
          ? { ...item, planned_grams: item.planned_grams - 5 }
          : item,
    );
    useConstraintStudioStore.setState({
      preview: forgedVector,
      directionConsent: forgedConsent(forgedVector),
      blocked: null,
    });
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked?.code).toBe('main_identity_violated');
    expect(useConstraintStudioStore.getState().history).toHaveLength(0);
  });

  it('keeps the full Main proof contract on the non-Direction ECO path (no flag, proof present)', () => {
    const input: RecipeInput = {
      ...servedSorbet({}),
      goals: {
        formulation_strategy: 'eco',
        direction_targets_active: false,
        direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
      },
    };
    load(input);
    useConstraintStudioStore.getState().createOptimizePreview();
    const staged = useConstraintStudioStore.getState();
    expect(staged.preview, JSON.stringify(staged.previewIssue)).not.toBeNull();
    expect(staged.preview?.mainHeldByExactDirection).toBeUndefined();
    expect(staged.preview?.mainObjective?.status).toBe('maximized');
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    expect(useConstraintStudioStore.getState().history).toHaveLength(1);
  });
});
