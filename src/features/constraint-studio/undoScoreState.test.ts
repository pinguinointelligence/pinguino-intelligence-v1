import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateRecipe, type EngineIngredient, type RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import {
  overSweetStarter,
  starterMilkBase,
  starterLine,
  withGrams,
} from '@/features/recipe-constraints/constraintFixtures';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { monitorScoreView } from '@/features/pro-workbench/monitorSummaryView';
import { scorePresentationSource } from '@/features/pro-workbench/scorePresentationSource';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import {
  productBehaviorModuleGate,
  productBehaviorRequiredLineIds,
  type ProductBehaviorSnapshot,
} from '@/features/product-intelligence';
import { useRecipeStore } from '@/stores/recipeStore';
import { practicalRecipeAuditMatchesInput } from '@/features/practical-recipe/practicalRecipe';
import { workingStateFingerprint } from './applyPipeline';
import {
  applyPreviewWithServerAuthority,
  createOptimizePreviewWithServerAuthority,
  selectCanonicalDraft,
  useConstraintStudioStore,
} from './constraintStudioStore';

// Whole-recipe optimiser proofs: each case runs the real Engine across many
// candidate formulations, so single tests legitimately take tens of seconds
// where the repository default allows five. The timeout is raised for THIS FILE
// only — the default stays in place everywhere else, and no assertion, fixture
// or Engine behaviour is relaxed to fit inside it.
vi.setConfig({ testTimeout: 30_000 });

const authority = vi.hoisted(() => ({
  version: null as string | null,
  blockedLineId: null as string | null,
  resolveInputs: [] as Array<{ module?: string; toppingLineIds: string[] }>,
}));

vi.mock('@/services/productIntelligence', () => ({
  resolveRecipeProposalBehaviorSnapshots: async (input: {
    recipe: RecipeInput;
    toppings?: ReadonlyArray<{
      id: string;
      planned_grams: number;
      actual_grams: number | null;
    }>;
    snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
    module?: string;
  }) => {
    const toppings = input.toppings ?? [];
    authority.resolveInputs.push({
      module: input.module,
      toppingLineIds: toppings.map((item) => item.id),
    });
    const requiredLineIds = new Set([
      ...input.recipe.items
        .filter((item) => (item.actual_grams ?? item.planned_grams) > 0)
        .map((item) => item.id),
      ...toppings
        .filter((item) => (item.actual_grams ?? item.planned_grams) > 0)
        .map((item) => item.id),
    ]);
    const unresolvedLineIds = authority.blockedLineId
      ? [...requiredLineIds].filter((lineId) => lineId === authority.blockedLineId)
      : [];
    return {
      snapshots: Object.fromEntries(
        Object.entries(input.snapshots)
          .filter((entry): entry is [string, ProductBehaviorSnapshot] => entry[1] !== undefined)
          .map(([lineId, snapshot]) => {
            const cloned = structuredClone(snapshot);
            const refresh = requiredLineIds.has(lineId) && lineId !== authority.blockedLineId;
            return [
              lineId,
              {
                ...cloned,
                ...(refresh ? { resolutionState: 'RESOLVED' as const } : {}),
                ...(authority.version
                  ? {
                      productVersionId: `${snapshot.productVersionId}:${authority.version}`,
                      factsFingerprint: `${snapshot.factsFingerprint}:${authority.version}`,
                    }
                  : {}),
              },
            ];
          }),
      ),
      unresolvedLineIds,
    };
  },
  validateRecipeBehaviorOnServer: async (input: { module: string }) => ({
    ready: true,
    module: input.module,
    staleLineIds: [],
    lines: [],
  }),
}));

const DEXTROSE = starterLine('dextrose');

const behaviorSnapshot = (
  lineId: string,
  mapperIngredientId: string,
  category: RecipeInput['category'],
  isMain = false,
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
  familyId: 'family:test-main-compatible',
  subfamilyId: null,
  formId: 'test-form',
  verificationState: 'verified',
  technicalAuthority: 'mapper_exact',
  mapperIngredientId,
  mainClassification: isMain ? 'MAIN_ALLOWED' : 'NOT_MAIN',
  mainPolicyId: isMain ? 'policy:test-main-compatible' : null,
  mainPolicyVersion: isMain ? '1' : null,
  ecoFloorPercent: isMain ? 0 : null,
  optimalCeilingPercent: isMain ? 100 : null,
  hardLimitPercent: isMain ? 100 : null,
  multiMainHardLimitPercent: isMain ? 100 : null,
  mainEquivalentFactor: isMain ? 1 : null,
  mainBasis: isMain ? 'PERCENT_OF_BASE' : null,
  requiresLiquidDairyCarrier: false,
  liquidDairyCarrierFloorPercent: null,
  approvedLiquidDairyCarrier: true,
  approvedMixedFamilyIds: [],
  moduleEligibility: {
    BASE_RECIPE: 'eligible',
    MAIN: 'eligible',
    OPTIMAL: 'eligible',
    ECO: 'eligible',
    MONITOR: 'eligible',
    NUTRITION: 'eligible',
    COST: 'eligible',
    SUMMARY: 'eligible',
    SAVE: 'eligible',
    PRODUCTION: 'eligible',
  },
  processScope: 'BASE_FORMULATION',
  resolverVersion: 'test-v1',
  sharedFacts: {
    schemaVersion: 1,
    technicalComposition: {
      water: 0,
      totalSolids: 0,
      fat: 0,
      protein: 0,
      carbohydrate: 0,
      sugars: 0,
      salt: 0,
    },
    nutritionPer100g: {
      basis: 'per_100g',
      energyKcal: 0,
      fat: 0,
      saturatedFat: 0,
      carbohydrate: 0,
      sugars: 0,
      protein: 0,
      salt: 0,
      fibre: 0,
    },
    allergens: null,
    processEvidence: [],
    profileEligibility: [category],
    veganEligibility: 'unknown',
    proteinBehavior: 'unknown',
    referencePrice: null,
  },
  warnings: [],
  blockReasons: [],
});

const toppingBehaviorSnapshot = (
  lineId: string,
  mapperIngredientId: string,
  category: RecipeInput['category'],
): ProductBehaviorSnapshot => ({
  ...behaviorSnapshot(lineId, mapperIngredientId, category),
  processScope: 'POST_PROCESS_ADDON',
  moduleEligibility: {
    ...behaviorSnapshot(lineId, mapperIngredientId, category).moduleEligibility,
    TOPPING: 'eligible',
  },
});

function loadRecipe(input: RecipeInput) {
  useRecipeStore.getState().loadRecipeInput(input);
  for (const item of useRecipeStore.getState().items) {
    const mapperId = item.ingredient.canonical_ingredient_id ?? item.ingredient.id;
    useRecipeStore
      .getState()
      .setProductBehaviorSnapshot(
        item.id,
        behaviorSnapshot(item.id, mapperId, input.category, item.lock_type === 'main'),
      );
  }
}

function loadApplyScenario() {
  loadRecipe(withGrams(overSweetStarter(160), DEXTROSE, 40));
  useConstraintStudioStore.getState().toggleLock(DEXTROSE);
}

const STRAWBERRY: EngineIngredient = {
  ...findDemoIngredient('raspberry')!,
  id: 'PI-ING-001553',
  canonical_ingredient_id: 'PI-ING-001553',
  name: 'Strawberry',
};
const BANANA: EngineIngredient = {
  ...findDemoIngredient('banana')!,
  id: 'PI-ING-000345',
  canonical_ingredient_id: 'PI-ING-000345',
  name: 'Banana',
};
const KIWI: EngineIngredient = {
  ...findDemoIngredient('raspberry')!,
  id: 'PI-ING-000366',
  canonical_ingredient_id: 'PI-ING-000366',
  name: 'Kiwi',
};
const BASIL: EngineIngredient = {
  ...findDemoIngredient('raspberry')!,
  id: 'PI-ING-001654',
  canonical_ingredient_id: 'PI-ING-001654',
  name: 'Basil',
};

const mainLine = (
  id: string,
  ingredient: EngineIngredient,
  grams: number,
  role: 'main' | 'unlocked' = 'main',
) => ({
  id,
  ingredient,
  planned_grams: grams,
  actual_grams: null,
  lock_type: role,
  ...(role === 'unlocked' ? { user_intent_anchor_grams: grams } : {}),
});

function roleFixture(kind: 'demoted-standard' | 'locked-multi-main'): RecipeInput {
  const additions =
    kind === 'demoted-standard'
      ? [
          mainLine('strawberry', STRAWBERRY, 120),
          mainLine('banana', BANANA, 180, 'unlocked'),
          mainLine('kiwi', KIWI, 240),
        ]
      : [mainLine('strawberry', STRAWBERRY, 100), mainLine('banana', BANANA, 10)];
  const additionGrams = additions.reduce((sum, item) => sum + item.planned_grams, 0);
  return {
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: -11,
    target_batch_grams: DEFAULT_PRESET.target_batch_grams,
    machine_capacity_grams: DEFAULT_PRESET.machine_capacity_grams,
    goals: { formulation_strategy: 'optimal' },
    items: [
      ...structuredClone(DEFAULT_PRESET.items).map((item) =>
        item.ingredient.id === 'milk_3_5'
          ? { ...item, planned_grams: item.planned_grams - additionGrams }
          : item,
      ),
      ...additions,
    ],
  };
}

async function expectUndoFinished() {
  await vi.waitFor(() => {
    expect(useConstraintStudioStore.getState().recalculationTerminal?.state).not.toBe('WORKING');
  });
}

beforeEach(() => {
  authority.version = null;
  authority.blockedLineId = null;
  authority.resolveInputs = [];
  useRecipeStore.getState().resetToDemo();
  useRecipeProfileStore.getState().resetForTests();
  useConstraintStudioStore.getState().resetForTests();
});

describe('Apply → Undo score-state restoration', () => {
  it('refreshes positive Base and topping authority after ECO, then opens Save and Production', async () => {
    loadRecipe(starterMilkBase());
    useRecipeStore.getState().addTopping(BASIL, 1);
    useRecipeStore.getState().addTopping(STRAWBERRY, 0);
    const [basil, strawberry] = useRecipeStore.getState().toppings;
    expect(basil?.ingredient.name).toBe('Basil');
    expect(strawberry?.ingredient.name).toBe('Strawberry');
    if (!basil || !strawberry) return;
    useRecipeStore
      .getState()
      .setProductBehaviorSnapshot(
        basil.id,
        toppingBehaviorSnapshot(basil.id, 'PI-ING-001654', 'milk_gelato'),
      );
    useRecipeStore
      .getState()
      .setProductBehaviorSnapshot(
        strawberry.id,
        toppingBehaviorSnapshot(strawberry.id, 'PI-ING-001553', 'milk_gelato'),
      );

    useRecipeStore.getState().setFormulationStrategy('eco');
    expect(useRecipeStore.getState().productBehaviorSnapshots[basil.id]?.resolutionState).toBe(
      'REVALIDATION_REQUIRED',
    );
    await createOptimizePreviewWithServerAuthority();
    if (useConstraintStudioStore.getState().preview) {
      await applyPreviewWithServerAuthority();
      expect(useConstraintStudioStore.getState().blocked).toBeNull();
    } else {
      expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
        state: 'NO_CHANGE_NEEDED',
      });
      expect(
        practicalRecipeAuditMatchesInput(
          selectCanonicalDraft().input,
          useRecipeStore.getState().practicalRecipeAudit,
        ),
      ).toBe(true);
    }

    const recipeState = useRecipeStore.getState();
    const requiredLineIds = productBehaviorRequiredLineIds({
      items: recipeState.items,
      toppings: recipeState.toppings,
    });
    expect(requiredLineIds).toContain(basil.id);
    expect(requiredLineIds).not.toContain(strawberry.id);
    expect(recipeState.productBehaviorSnapshots[basil.id]).toMatchObject({
      resolutionState: 'RESOLVED',
      processScope: 'POST_PROCESS_ADDON',
    });
    expect(recipeState.productBehaviorSnapshots[strawberry.id]?.resolutionState).toBe(
      'REVALIDATION_REQUIRED',
    );
    expect(
      productBehaviorModuleGate(recipeState.productBehaviorSnapshots, 'SAVE', requiredLineIds)
        .ready,
    ).toBe(true);
    expect(
      productBehaviorModuleGate(recipeState.productBehaviorSnapshots, 'PRODUCTION', requiredLineIds)
        .ready,
    ).toBe(true);
    expect(authority.resolveInputs.some((input) => input.toppingLineIds.includes(basil.id))).toBe(
      true,
    );
  });

  it('fails closed when a positive topping cannot refresh at the terminal PI seam', async () => {
    loadRecipe(starterMilkBase());
    useRecipeStore.getState().addTopping(BASIL, 1);
    const basil = useRecipeStore.getState().toppings[0];
    if (!basil) return;
    useRecipeStore
      .getState()
      .setProductBehaviorSnapshot(
        basil.id,
        toppingBehaviorSnapshot(basil.id, 'PI-ING-001654', 'milk_gelato'),
      );
    useRecipeStore.getState().setFormulationStrategy('eco');
    authority.blockedLineId = basil.id;

    await createOptimizePreviewWithServerAuthority();

    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().recalculationTerminal).toMatchObject({
      state: 'PRODUCT_DATA_REQUIRED',
      code: 'product_behavior_invalid',
    });
    expect(useRecipeStore.getState().productBehaviorSnapshots[basil.id]?.resolutionState).toBe(
      'REVALIDATION_REQUIRED',
    );
  });

  it('attests an unchanged whole-gram recipe only through the server-authorized PI seam', async () => {
    loadRecipe(starterMilkBase());
    const input = selectCanonicalDraft().input;
    const dirty = useRecipeStore.getState().dirty;
    expect(useRecipeStore.getState().practicalRecipeAudit).toBeNull();

    useConstraintStudioStore.getState().createOptimizePreview();
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'NO_CHANGE_NEEDED',
    });
    expect(useRecipeStore.getState().practicalRecipeAudit).toBeNull();

    await createOptimizePreviewWithServerAuthority();

    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'NO_CHANGE_NEEDED',
    });
    expect(
      practicalRecipeAuditMatchesInput(
        selectCanonicalDraft().input,
        useRecipeStore.getState().practicalRecipeAudit,
      ),
    ).toBe(true);
    expect(selectCanonicalDraft().input).toEqual(input);
    expect(useRecipeStore.getState().dirty).toBe(dirty);
  });

  it('restores the exact Preview, PREVIEW source, score, fingerprint and prior awaiting state', async () => {
    loadApplyScenario();
    useRecipeProfileStore.getState().moveAxisIntent('sweetness', 1);
    useRecipeProfileStore.getState().moveAxisIntent('softness', -1);
    const before = structuredClone(buildRecipeInput(useRecipeStore.getState()));
    const beforeDirections = structuredClone(useRecipeStore.getState().direction_targets);
    const beforeIntents = structuredClone(useRecipeProfileStore.getState().directionIntents);

    useConstraintStudioStore.getState().createOptimizePreview();
    const staged = structuredClone(useConstraintStudioStore.getState().preview);
    expect(
      staged,
      JSON.stringify({
        blocked: useConstraintStudioStore.getState().blocked,
        terminal: useConstraintStudioStore.getState().recalculationTerminal,
      }),
    ).not.toBeNull();
    if (!staged) return;
    const previewScore = monitorScoreView(
      calculateRecipe(staged.proposedInput),
      staged.proposedInput,
    ).match;

    useConstraintStudioStore.getState().applyPreview();
    expect(
      practicalRecipeAuditMatchesInput(
        selectCanonicalDraft().input,
        useRecipeStore.getState().practicalRecipeAudit,
      ),
    ).toBe(true);
    const appliedScore = monitorScoreView(
      calculateRecipe(buildRecipeInput(useRecipeStore.getState())),
      buildRecipeInput(useRecipeStore.getState()),
    ).match;
    const record = useConstraintStudioStore.getState().history.at(-1);
    expect(record?.before.presentation).toMatchObject({
      scoreSource: 'PREVIEW',
      awaitingRecalculation: true,
      terminal: { state: 'PREVIEW_READY' },
    });
    expect(appliedScore.score).toBe(previewScore.score);

    useConstraintStudioStore.getState().undoLastApply();
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({ state: 'WORKING' });
    await expectUndoFinished();

    const restoredDraft = selectCanonicalDraft();
    const restoredPreview = useConstraintStudioStore.getState().preview;
    expect(restoredDraft.input).toEqual(before);
    expect(useRecipeStore.getState().direction_targets).toEqual(beforeDirections);
    expect(useRecipeProfileStore.getState().directionIntents).toEqual(beforeIntents);
    expect(restoredPreview?.proposedInput).toEqual(staged.proposedInput);
    expect(restoredPreview?.baseDraftRevision).toBe(restoredDraft.revision);
    expect(restoredPreview?.baseFingerprint).toBe(
      workingStateFingerprint(restoredDraft.input, restoredDraft.constraints),
    );
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'PREVIEW_READY',
    });
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
    expect(useRecipeStore.getState().practicalRecipeAudit).toBeNull();
    const restoredScore = monitorScoreView(
      calculateRecipe(restoredPreview!.proposedInput),
      restoredPreview!.proposedInput,
    ).match;
    expect(restoredScore).toEqual(previewScore);
    expect(
      scorePresentationSource({
        previewReady: true,
        currentReady: false,
        hasAppliedHistory: false,
      }),
    ).toBe('PREVIEW');

    // The restored Preview is not merely cosmetic: its monotonic revision is
    // rebound to the restored draft, so the normal trustless Apply door can
    // validate and commit it again without manufacturing new authorization.
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().history).toHaveLength(1);
    expect(
      practicalRecipeAuditMatchesInput(
        selectCanonicalDraft().input,
        useRecipeStore.getState().practicalRecipeAudit,
      ),
    ).toBe(true);
  });

  it('does not invent a Preview score when the prior presentation was awaiting calculation', async () => {
    loadApplyScenario();
    useConstraintStudioStore.getState().createOptimizePreview();
    useConstraintStudioStore.setState({ recalculationTerminal: null });
    useRecipeProfileStore.getState().markRecalculationRequired();

    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().history[0]?.before.presentation).toBeUndefined();
    useConstraintStudioStore.getState().undoLastApply();
    await expectUndoFinished();

    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'NO_CHANGE_NEEDED',
    });
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
    expect(
      scorePresentationSource({
        previewReady: false,
        currentReady: true,
        hasAppliedHistory: false,
      }),
    ).toBe('CURRENT_RECIPE');
  });

  it('invalidates the old Preview when the product version changes and finishes with current score', async () => {
    loadApplyScenario();
    useConstraintStudioStore.getState().createOptimizePreview();
    useConstraintStudioStore.getState().applyPreview();
    authority.version = 'version:2';

    useConstraintStudioStore.getState().undoLastApply();
    await expectUndoFinished();

    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'NO_CHANGE_NEEDED',
    });
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(false);
    expect(
      Object.values(useRecipeStore.getState().productBehaviorSnapshots).every((snapshot) =>
        snapshot.productVersionId.endsWith(':version:2'),
      ),
    ).toBe(true);
  });

  it.each([
    [
      'lock',
      (preview: NonNullable<ReturnType<typeof useConstraintStudioStore.getState>['preview']>) => {
        preview.proposedInput.items[0]!.lock_type = 'grams';
      },
    ],
    [
      'Main role',
      (preview: NonNullable<ReturnType<typeof useConstraintStudioStore.getState>['preview']>) => {
        preview.proposedInput.items[0]!.lock_type = 'main';
      },
    ],
  ])(
    'rejects a restored Preview whose %s fingerprint no longer matches',
    async (_label, mutate) => {
      loadApplyScenario();
      useConstraintStudioStore.getState().createOptimizePreview();
      useConstraintStudioStore.getState().applyPreview();
      const record = useConstraintStudioStore.getState().history[0]!;
      mutate(record.before.presentation!.preview);

      useConstraintStudioStore.getState().undoLastApply();
      await expectUndoFinished();

      expect(useConstraintStudioStore.getState().preview).toBeNull();
      expect(useConstraintStudioStore.getState().recalculationTerminal?.state).toBe(
        'NO_CHANGE_NEEDED',
      );
    },
  );

  it('supports repeated Apply → Undo without accumulating stale presentation states', async () => {
    loadApplyScenario();
    useConstraintStudioStore.getState().createOptimizePreview();

    for (let cycle = 0; cycle < 2; cycle += 1) {
      useConstraintStudioStore.getState().applyPreview();
      expect(useConstraintStudioStore.getState().history).toHaveLength(1);
      expect(useConstraintStudioStore.getState().preview).toBeNull();
      useConstraintStudioStore.getState().undoLastApply();
      await expectUndoFinished();
      expect(useConstraintStudioStore.getState().history).toHaveLength(0);
      expect(useConstraintStudioStore.getState().preview).not.toBeNull();
      expect(useConstraintStudioStore.getState().recalculationTerminal?.state).toBe(
        'PREVIEW_READY',
      );
    }
  });

  it('restores Preview presentation for a positive demoted Standard fixture', async () => {
    const input = roleFixture('demoted-standard');
    loadRecipe(input);
    useConstraintStudioStore.getState().toggleLock(DEXTROSE);
    const before = structuredClone(selectCanonicalDraft().input);
    const demotedLine = before.items.find((item) => item.id === 'banana')!;

    useConstraintStudioStore.getState().createOptimizePreview();
    const staged = structuredClone(useConstraintStudioStore.getState().preview);
    expect(
      staged,
      JSON.stringify({
        blocked: useConstraintStudioStore.getState().blocked,
        terminal: useConstraintStudioStore.getState().recalculationTerminal,
      }),
    ).not.toBeNull();
    useConstraintStudioStore.getState().applyPreview();
    useConstraintStudioStore.getState().undoLastApply();
    await expectUndoFinished();

    expect(selectCanonicalDraft().input).toEqual(before);
    expect(selectCanonicalDraft().input.items.find((item) => item.id === 'banana')).toMatchObject({
      id: demotedLine.id,
      planned_grams: demotedLine.planned_grams,
      lock_type: 'unlocked',
      user_intent_anchor_grams: demotedLine.planned_grams,
    });
    expect(useConstraintStudioStore.getState().preview?.proposedInput).toEqual(
      staged?.proposedInput,
    );
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'PREVIEW_READY',
    });
  });

  it('restores Preview presentation for a locked Multi-Main fixture', async () => {
    const input = roleFixture('locked-multi-main');
    loadRecipe(input);
    const lockedMain = input.items.find((item) => item.id === 'strawberry')!;
    useConstraintStudioStore.getState().toggleLock(lockedMain.id);
    useConstraintStudioStore.getState().toggleLock(DEXTROSE);
    const before = structuredClone(selectCanonicalDraft());

    useConstraintStudioStore.getState().createOptimizePreview();
    const staged = structuredClone(useConstraintStudioStore.getState().preview);
    expect(staged).not.toBeNull();
    useConstraintStudioStore.getState().applyPreview();
    useConstraintStudioStore.getState().undoLastApply();
    await expectUndoFinished();

    const restored = selectCanonicalDraft();
    expect(restored.input).toEqual(before.input);
    expect(restored.constraints).toEqual(before.constraints);
    expect(restored.input.items.filter((item) => item.lock_type === 'main')).toHaveLength(2);
    expect(restored.constraints.byLineId[lockedMain.id]).toEqual({
      mode: 'locked',
      grams: lockedMain.planned_grams,
    });
    expect(useConstraintStudioStore.getState().preview?.proposedInput).toEqual(
      staged?.proposedInput,
    );
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'PREVIEW_READY',
    });
  });
});
