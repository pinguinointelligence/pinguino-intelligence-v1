import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type RecipeDirectionTarget,
  type RecipeInput,
} from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import {
  buildRecipeBehaviorAuthority,
  recipeInputFromFrozenBehavior,
  type ProductBehaviorSnapshot,
} from '@/features/product-intelligence';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { monitorScoreView } from '@/features/pro-workbench/monitorSummaryView';
import { buildCurrentRecipeResultAuthority } from '@/features/pro-workbench/currentRecipeResultAuthority';
import { calculateFinalProduct } from '@/features/recipe-composition/finalProduct';
import { useCustomerPriceStore } from '@/stores/customerPriceStore';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  buildOptimizePreview,
  workingStateFingerprint,
  type BuildPreviewResult,
  type ConstraintPreview,
} from './applyPipeline';
import type { OptimizePreviewComputation } from './optimizePreviewComputation';
import {
  applyPreviewWithServerAuthority,
  selectCanonicalDraft,
  useConstraintStudioStore,
  type ApplyPreviewRuntime,
} from './constraintStudioStore';

vi.setConfig({ testTimeout: 60_000 });

// This suite owns the Preview → Apply lifecycle only. ProductBehavior is kept
// neutral so the assertions exercise the real Engine, Direction authorization,
// candidate-rebuild equality, hard Apply door, and guarded recipe mutation.
const currentResultResolution = vi.hoisted(() => ({
  blocked: false,
  release: null as null | (() => void),
}));

vi.mock('@/services/productIntelligence', () => ({
  resolveRecipeProposalBehaviorSnapshots: async (input: {
    recipe: RecipeInput;
    toppings?: readonly [];
    snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
    module?: string;
  }) => {
    await (async () => {
      if (input.module === 'SUMMARY' && currentResultResolution.blocked) {
        await new Promise<void>((resolve) => {
          currentResultResolution.release = resolve;
        });
      }
    })();
    if (input.module === 'SUMMARY') {
      const { productBehaviorTestSnapshots } =
        await import('@/features/product-intelligence/productBehaviorTestFixture');
      return {
        snapshots: productBehaviorTestSnapshots(input.recipe, input.toppings),
        unresolvedLineIds: [],
      };
    }
    return {
      snapshots: Object.fromEntries(
        Object.entries(input.snapshots).filter((entry) => entry[1] !== undefined),
      ),
      unresolvedLineIds: [],
    };
  },
  validateRecipeBehaviorOnServer: async (input: { module: string }) => ({
    ready: true,
    module: input.module,
    staleLineIds: [],
    lines: [],
  }),
}));

const AT = '2026-08-26T12:00:00.000Z';
type SuccessfulBuild = Extract<BuildPreviewResult, { ok: true }>;

const directedMilkWithHeldMain = (
  sweetness: RecipeDirectionTarget,
  softness: RecipeDirectionTarget,
): RecipeInput => {
  const base = starterMilkBase();
  return {
    ...base,
    target_temperature_c: -11,
    items: base.items.map((item) =>
      item.ingredient.id === 'milk_3_5' ? { ...item, lock_type: 'main' as const } : item,
    ),
    goals: {
      ...base.goals,
      formulation_strategy: 'optimal',
      direction_targets_active: true,
      direction_targets: { sweetness, softness, creaminess: 0, flavor: 0 },
    },
  };
};

const buildCase = (
  sweetness: RecipeDirectionTarget,
  softness: RecipeDirectionTarget,
): SuccessfulBuild => {
  useRecipeStore.getState().loadRecipeInput(directedMilkWithHeldMain(sweetness, softness));
  useConstraintStudioStore.getState().resetForTests();
  const draft = selectCanonicalDraft();
  const built = buildOptimizePreview(draft.input, draft.constraints, AT, {
    requirePracticalPreview: true,
  });
  expect(built.ok, built.ok ? undefined : JSON.stringify(built)).toBe(true);
  return built as SuccessfulBuild;
};

const buildOutcome = (
  sweetness: RecipeDirectionTarget,
  softness: RecipeDirectionTarget,
): BuildPreviewResult => {
  useRecipeStore.getState().loadRecipeInput(directedMilkWithHeldMain(sweetness, softness));
  useConstraintStudioStore.getState().resetForTests();
  const draft = selectCanonicalDraft();
  return buildOptimizePreview(draft.input, draft.constraints, AT, {
    requirePracticalPreview: true,
  });
};

let score10: SuccessfulBuild;
let score9NoSolution: BuildPreviewResult;
let score8NoSolution: BuildPreviewResult;

beforeAll(() => {
  // Three real canonical candidates are built once. Apply receives the same
  // result through the Worker seam, just as the served UI does.
  score10 = buildCase(-2, 0);
  score9NoSolution = buildOutcome(1, -2);
  score8NoSolution = buildOutcome(-2, -2);
  expect(score10.preview.directionAssessment).toMatchObject({ score: 10, reached: true });
  expect(score9NoSolution).toMatchObject({
    ok: false,
    code: 'no_proposal',
    directionTargetUnreached: true,
  });
  expect(score8NoSolution).toMatchObject({
    ok: false,
    code: 'no_proposal',
    directionTargetUnreached: true,
  });
}, 60_000);

beforeEach(() => {
  currentResultResolution.blocked = false;
  currentResultResolution.release = null;
  useRecipeStore.getState().resetToDemo();
  useRecipeProfileStore.getState().resetForTests();
  useConstraintStudioStore.getState().resetForTests();
  useCustomerPriceStore.setState({ overridesByCanonicalId: {} });
});

const vector = (input: RecipeInput): Array<[string, number]> =>
  input.items.map((item) => [item.id, item.planned_grams]);

const workingVector = (): Array<[string, number]> => vector(selectCanonicalDraft().input);

const loadCase = (built: SuccessfulBuild): void => {
  useRecipeStore
    .getState()
    .loadRecipeInput(
      directedMilkWithHeldMain(
        built.preview.proposedInput.goals?.direction_targets?.sweetness ?? 0,
        built.preview.proposedInput.goals?.direction_targets?.softness ?? 0,
      ),
    );
  useConstraintStudioStore.getState().resetForTests();
  useRecipeProfileStore.getState().markRecalculationRequired();
};

const withCurrentRevision = (preview: ConstraintPreview): ConstraintPreview => ({
  ...structuredClone(preview),
  baseDraftRevision: useRecipeStore.getState().draftRevision,
});

const stagePreview = (built: SuccessfulBuild, acceptNearest: boolean): ConstraintPreview => {
  loadCase(built);
  const preview = withCurrentRevision(built.preview);
  expect(preview.baseFingerprint).toBe(
    workingStateFingerprint(selectCanonicalDraft().input, selectCanonicalDraft().constraints),
  );
  useConstraintStudioStore.setState({
    preview: acceptNearest ? null : preview,
    directionBestCandidate: acceptNearest ? preview : null,
    directionConsent: null,
    blocked: null,
    recalculationTerminal: acceptNearest
      ? { state: 'BEST_ACHIEVABLE' }
      : { state: 'PREVIEW_READY' },
  });
  if (acceptNearest) useConstraintStudioStore.getState().acceptBestDirectionCandidate();
  expect(useConstraintStudioStore.getState().preview).toBe(preview);
  useConstraintStudioStore.setState({ recalculationTerminal: { state: 'PREVIEW_READY' } });
  return preview;
};

const immediateRuntime = (built: SuccessfulBuild): ApplyPreviewRuntime => ({
  runOptimizePreview: async (): Promise<OptimizePreviewComputation> => ({
    result: structuredClone(built),
    rescueAdvice: null,
  }),
});

const deferredRuntime = (
  built: SuccessfulBuild,
): {
  runtime: ApplyPreviewRuntime;
  release: () => void;
} => {
  let release!: () => void;
  const pending = new Promise<OptimizePreviewComputation>((resolve) => {
    release = () => resolve({ result: structuredClone(built), rescueAdvice: null });
  });
  return {
    runtime: { runOptimizePreview: () => pending },
    release,
  };
};

const expectSuccessfulApply = (displayed: ConstraintPreview, expectedScore: number): void => {
  const state = useConstraintStudioStore.getState();
  expect(state.applyPending).toBe(false);
  expect(state.blocked, state.blocked?.messagePl).toBeNull();
  expect(state.preview).toBeNull();
  expect(state.history).toHaveLength(1);
  expect(workingVector()).toEqual(vector(displayed.proposedInput));
  expect(state.history[0]?.before.presentation?.preview.directionAssessment?.score).toBe(
    expectedScore,
  );
  expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
  const currentInput = selectCanonicalDraft().input;
  const recipeState = useRecipeStore.getState();
  const currentAuthority = buildCurrentRecipeResultAuthority({
    recipe: currentInput,
    toppings: recipeState.toppings,
    snapshots: recipeState.productBehaviorSnapshots,
    draftRevision: recipeState.draftRevision,
    awaitingRecalculation: useRecipeProfileStore.getState().awaitingRecalculation,
    loading: state.applyPending,
  });
  expect(currentAuthority.ready).toBe(true);
  expect(useRecipeProfileStore.getState().calculatedRecipeAuthority).toMatchObject({
    draftIdentity: useRecipeProfileStore.getState().activeDraftIdentity,
    recipeFingerprint: currentAuthority.recipeFingerprint,
    behaviorFingerprint: currentAuthority.behaviorFingerprint,
  });
  const behaviorAuthority = buildRecipeBehaviorAuthority({
    items: currentInput.items,
    toppings: recipeState.toppings,
    snapshots: recipeState.productBehaviorSnapshots,
  });
  const frozenInput = recipeInputFromFrozenBehavior(currentInput, behaviorAuthority, 'technical');
  const currentResult = calculateRecipe(frozenInput);
  expect(monitorScoreView(currentResult, frozenInput).match.score).toBe(expectedScore);
  const finalProduct = calculateFinalProduct(
    recipeInputFromFrozenBehavior(currentInput, behaviorAuthority, 'nutrition'),
    recipeState.toppings,
  );
  expect(finalProduct.finalLabelNutritionPer100g?.kcal).toBeTypeOf('number');
  expect(finalProduct.finalCosts?.cost_per_kg).toBeTypeOf('number');
  // Apply changes the working recipe only. It never creates a saved recipe.
  expect(useRecipeStore.getState().savedRecipeId).toBeNull();
};

describe('NEAREST / BEST-POSSIBLE Preview → Apply lifecycle', () => {
  it('A. applies a normal 10/10 Preview through the same terminal lifecycle', async () => {
    const displayed = stagePreview(score10, false);
    const before = workingVector();
    const deferred = deferredRuntime(score10);

    const applying = applyPreviewWithServerAuthority(deferred.runtime);
    await vi.waitFor(() => expect(useConstraintStudioStore.getState().applyPending).toBe(true));
    expect(workingVector()).toEqual(before);

    deferred.release();
    await applying;
    expectSuccessfulApply(displayed, 10);
  });

  it('keeps the applied revision LOADING until its unified current result resolves', async () => {
    const displayed = stagePreview(score10, false);
    const before = workingVector();
    currentResultResolution.blocked = true;

    const applying = applyPreviewWithServerAuthority(immediateRuntime(score10));
    await vi.waitFor(() => expect(workingVector()).toEqual(vector(displayed.proposedInput)));

    expect(workingVector()).not.toEqual(before);
    expect(useConstraintStudioStore.getState()).toMatchObject({
      applyPending: true,
      preview: null,
    });
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);

    currentResultResolution.release?.();
    await applying;
    expectSuccessfulApply(displayed, 10);
  });

  it('B. does not stage the old unchanged unreached 9/10 BEST-POSSIBLE candidate', () => {
    expect(score9NoSolution).toMatchObject({
      ok: false,
      code: 'no_proposal',
      directionTargetUnreached: true,
    });
  });

  it('C. returns a truthful no-solution instead of staging the unchanged unreached 8/10 draft', () => {
    expect(score8NoSolution).toMatchObject({
      ok: false,
      code: 'no_proposal',
      directionTargetUnreached: true,
    });
  });

  it('D. keeps a real hard Engine violation blocked after NEAREST acceptance', async () => {
    const honest = stagePreview(score10, false);
    const before = workingVector();
    const forged = structuredClone(honest);
    const milk = forged.proposedInput.items.find((item) => item.ingredient.id === 'milk_3_5')!;
    const sucrose = forged.proposedInput.items.find((item) => item.ingredient.id === 'sucrose')!;
    milk.planned_grams -= 250;
    sucrose.planned_grams += 250;
    expect(detectViolations(calculateRecipe(forged.proposedInput)).length).toBeGreaterThan(0);

    const consent = useConstraintStudioStore.getState().directionConsent!;
    useConstraintStudioStore.setState({
      preview: forged,
      directionConsent: {
        ...consent,
        candidateFingerprint: workingStateFingerprint(forged.proposedInput, forged.nextConstraints),
      },
    });
    const forgedBuild: SuccessfulBuild = { ok: true, preview: forged };

    await applyPreviewWithServerAuthority(immediateRuntime(forgedBuild));

    expect(useConstraintStudioStore.getState().blocked).not.toBeNull();
    expect(useConstraintStudioStore.getState().history).toHaveLength(0);
    expect(workingVector()).toEqual(before);
  });

  it('E. Back/cancel during Apply never mutates the working recipe', async () => {
    stagePreview(score10, false);
    const before = workingVector();
    const deferred = deferredRuntime(score10);
    const applying = applyPreviewWithServerAuthority(deferred.runtime);
    await vi.waitFor(() => expect(useConstraintStudioStore.getState().applyPending).toBe(true));

    useConstraintStudioStore.getState().cancelPreview();
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().applyPending).toBe(false);
    deferred.release();
    await applying;

    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    expect(useConstraintStudioStore.getState().history).toHaveLength(0);
    expect(workingVector()).toEqual(before);
  });

  it('F. repeated BEST-POSSIBLE Preview → Apply is deterministic and reaches terminal success', async () => {
    const results: Array<Array<[string, number]>> = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const displayed = stagePreview(score10, false);
      const outcome = await Promise.race([
        applyPreviewWithServerAuthority(immediateRuntime(score10)).then(() => 'settled' as const),
        new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), 1_000)),
      ]);
      expect(outcome).toBe('settled');
      expectSuccessfulApply(displayed, 10);
      results.push(workingVector());
    }
    expect(results[1]).toEqual(results[0]);
  });

  it('publishes a terminal failure if canonical Worker revalidation rejects', async () => {
    stagePreview(score10, false);
    const before = workingVector();
    await applyPreviewWithServerAuthority({
      runOptimizePreview: async () => {
        throw new Error('worker failed');
      },
    });

    expect(useConstraintStudioStore.getState()).toMatchObject({
      applyPending: false,
      blocked: { code: 'apply_validation_failed' },
    });
    expect(useConstraintStudioStore.getState().preview).not.toBeNull();
    expect(useConstraintStudioStore.getState().history).toHaveLength(0);
    expect(workingVector()).toEqual(before);
  });
});
