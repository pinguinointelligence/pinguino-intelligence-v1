import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { sorbetMapperIngredient } from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { resolveRecipeProposalBehaviorSnapshots } from '@/services/productIntelligence';
import { useRecipeStore } from '@/stores/recipeStore';
import { workingStateFingerprint } from './applyPipeline';
import { useConstraintStudioStore } from './constraintStudioStore';

const NONE = { byLineId: {} } as const;
const TOMATO_LINE_ID = 'served-cherry-tomatoes';

const SERVED_LINES = [
  ['served-milk', 'PI-ING-000236', 487],
  ['served-cream', 'PI-ING-000180', 109],
  ['served-smp', 'PI-ING-000270', 62],
  ['served-sucrose', 'PI-ING-000514', 83],
  ['served-dextrose', 'PI-ING-000494', 71],
  ['served-tara', 'PI-ING-000492', 3],
  [TOMATO_LINE_ID, 'PI-ING-000350', 185],
] as const;

const servedTomatoRecipe = (): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1_000,
  machine_capacity_grams: null,
  items: SERVED_LINES.map(([id, mapperId, grams]) => ({
    id,
    ingredient: sorbetMapperIngredient(mapperId),
    planned_grams: grams,
    actual_grams: null,
    lock_type: 'unlocked',
  })),
  goals: { formulation_strategy: 'optimal' },
});

const servedSnapshots = (input: RecipeInput): Record<string, ProductBehaviorSnapshot> => {
  const snapshots = productBehaviorTestSnapshots(input);
  for (const item of input.items) {
    snapshots[item.id] = {
      ...snapshots[item.id]!,
      resolutionContext: {
        accountId: null,
        productProfile: input.category,
        temperatureC: input.target_temperature_c,
        mode: 'optimal',
        processScope: 'BASE_FORMULATION',
        requestedRole: item.lock_type === 'main' ? 'MAIN' : 'STANDARD',
        module: 'OPTIMAL',
      },
    };
  }
  const tomato = snapshots[TOMATO_LINE_ID]!;
  snapshots[TOMATO_LINE_ID] = {
    ...tomato,
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    mainPolicyId: 'main-fruit-fresh-dairy',
    mainPolicyVersion: '1',
    ecoFloorPercent: 20,
    optimalCeilingPercent: 35,
    hardLimitPercent: 45,
    multiMainHardLimitPercent: 45,
    mainEquivalentFactor: 1,
    mainBasis: 'FRUIT_EQUIVALENT',
    requiresLiquidDairyCarrier: true,
    liquidDairyCarrierFloorPercent: 30,
  };
  return snapshots;
};

const loadServedTomatoRecipe = () => {
  const input = servedTomatoRecipe();
  useRecipeStore.getState().loadRecipeInput(input);
  useRecipeStore.setState({ productBehaviorSnapshots: servedSnapshots(input) });
};

const grams = (lineId: string): number => {
  const item = useRecipeStore.getState().items.find((candidate) => candidate.id === lineId);
  if (!item) throw new Error(`Missing line ${lineId}`);
  return item.planned_grams;
};

const stageAlreadyOptimalCertification = () => {
  useRecipeProfileStore.getState().acknowledgeRecalculation();
  useConstraintStudioStore.setState({
    preview: null,
    previewIssue: { ok: false, code: 'already_clean' },
    recalculationTerminal: { state: 'NO_CHANGE_NEEDED' },
  });
};

beforeEach(() => {
  useRecipeStore.getState().resetToDemo();
  useConstraintStudioStore.getState().resetForTests();
  useRecipeProfileStore.getState().resetForTests();
  loadServedTomatoRecipe();
});

describe('Crown role is a calculation-relevant mutation', () => {
  it('uses the exact served CHERRY TOMATOES role-only transition on the next Recalculate', async () => {
    const standardInput = buildRecipeInput(useRecipeStore.getState());
    expect(detectViolations(calculateRecipe(standardInput))).toEqual([]);
    stageAlreadyOptimalCertification();

    const beforeRevision = useRecipeStore.getState().draftRevision;
    const beforeGrams = grams(TOMATO_LINE_ID);
    useRecipeStore.getState().setMainIngredient(TOMATO_LINE_ID);

    const crownInput = buildRecipeInput(useRecipeStore.getState());
    expect(useRecipeStore.getState().draftRevision).toBe(beforeRevision + 1);
    expect(grams(TOMATO_LINE_ID)).toBe(beforeGrams);
    expect(crownInput.items.find((item) => item.id === TOMATO_LINE_ID)?.lock_type).toBe('main');
    expect(workingStateFingerprint(crownInput, NONE)).not.toBe(
      workingStateFingerprint(standardInput, NONE),
    );
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
    expect(useConstraintStudioStore.getState().previewIssue).toBeNull();
    expect(useConstraintStudioStore.getState().recalculationTerminal).toBeNull();
    expect(
      useRecipeStore.getState().productBehaviorSnapshots[TOMATO_LINE_ID]?.resolutionState,
    ).toBe('REVALIDATION_REQUIRED');

    const resolveSelection = vi.fn(async () => null);
    const resolved = await resolveRecipeProposalBehaviorSnapshots({
      recipe: crownInput,
      snapshots: useRecipeStore.getState().productBehaviorSnapshots,
      accountId: null,
      module: 'OPTIMAL',
      resolveSelection,
    });
    expect(resolveSelection).toHaveBeenCalledTimes(1);
    expect(resolveSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ requestedRole: 'MAIN', module: 'OPTIMAL' }),
      }),
    );
    expect(resolved.unresolvedLineIds).toEqual([TOMATO_LINE_ID]);
  }, 120_000);

  it('Crown off immediately restores Standard proximity without a gram edit', async () => {
    useRecipeStore.getState().setMainIngredient(TOMATO_LINE_ID);
    stageAlreadyOptimalCertification();
    const crownRevision = useRecipeStore.getState().draftRevision;

    useRecipeStore.getState().setStandardIngredient(TOMATO_LINE_ID);

    expect(useRecipeStore.getState().draftRevision).toBe(crownRevision + 1);
    expect(grams(TOMATO_LINE_ID)).toBe(185);
    expect(
      useRecipeStore.getState().items.find((item) => item.id === TOMATO_LINE_ID)?.lock_type,
    ).toBe('unlocked');
    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
    expect(useConstraintStudioStore.getState().recalculationTerminal).toBeNull();
    expect(
      useRecipeStore.getState().productBehaviorSnapshots[TOMATO_LINE_ID]?.resolutionState,
    ).toBe('REVALIDATION_REQUIRED');

    const standardInput = buildRecipeInput(useRecipeStore.getState());
    const resolveSelection = vi.fn(async () => null);
    await resolveRecipeProposalBehaviorSnapshots({
      recipe: standardInput,
      snapshots: useRecipeStore.getState().productBehaviorSnapshots,
      accountId: null,
      module: 'OPTIMAL',
      resolveSelection,
    });
    expect(resolveSelection).toHaveBeenCalledTimes(1);
    expect(resolveSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ requestedRole: 'STANDARD', module: 'OPTIMAL' }),
      }),
    );

    useRecipeStore.setState({ productBehaviorSnapshots: servedSnapshots(standardInput) });

    useConstraintStudioStore
      .getState()
      .createOptimizePreview(useRecipeStore.getState().productBehaviorSnapshots);

    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'NO_CHANGE_NEEDED',
    });
    expect(grams(TOMATO_LINE_ID)).toBe(185);
  }, 120_000);

  it('invalidates stale Preview, score and NO-OP state on every repeated Crown toggle', () => {
    for (let index = 0; index < 4; index += 1) {
      useConstraintStudioStore.setState({
        preview: {
          kind: 'optimize',
          baseDraftRevision: useRecipeStore.getState().draftRevision,
        } as never,
        previewIssue: { ok: false, code: 'already_clean' },
        recalculationTerminal: { state: 'NO_CHANGE_NEEDED' },
      });
      useRecipeProfileStore.getState().acknowledgeRecalculation();
      const beforeGrams = grams(TOMATO_LINE_ID);
      const beforeRevision = useRecipeStore.getState().draftRevision;

      if (index % 2 === 0) useRecipeStore.getState().setMainIngredient(TOMATO_LINE_ID);
      else useRecipeStore.getState().setStandardIngredient(TOMATO_LINE_ID);

      expect(useRecipeStore.getState().draftRevision).toBe(beforeRevision + 1);
      expect(grams(TOMATO_LINE_ID)).toBe(beforeGrams);
      expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
      expect(useConstraintStudioStore.getState().preview).toBeNull();
      expect(useConstraintStudioStore.getState().previewIssue).toBeNull();
      expect(useConstraintStudioStore.getState().recalculationTerminal).toBeNull();
      expect(
        useRecipeStore.getState().productBehaviorSnapshots[TOMATO_LINE_ID]?.resolutionState,
      ).toBe('REVALIDATION_REQUIRED');
      useRecipeStore.setState({
        productBehaviorSnapshots: servedSnapshots(buildRecipeInput(useRecipeStore.getState())),
      });
    }
  });

  it('clears a terminal-only NO-OP certification and detached cached authorization', () => {
    useConstraintStudioStore.setState({
      preview: null,
      previewIssue: null,
      directionBestCandidate: null,
      directionConsent: null,
      feasibility: null,
      blocked: null,
      proposalProductBehaviorAuthorization: {
        baseFingerprint: 'standard-before-role-change',
      } as never,
      recalculationTerminal: { state: 'NO_CHANGE_NEEDED' },
    });
    useRecipeProfileStore.getState().acknowledgeRecalculation();

    useRecipeStore.getState().setMainIngredient(TOMATO_LINE_ID);

    expect(useRecipeProfileStore.getState().awaitingRecalculation).toBe(true);
    expect(useConstraintStudioStore.getState().proposalProductBehaviorAuthorization).toBeNull();
    expect(useConstraintStudioStore.getState().recalculationTerminal).toBeNull();
  });

  it.each([2, 3] as const)(
    'invalidates role authority and seeds %i Crowns equally without gram edits',
    (count) => {
      const targetIds = SERVED_LINES.slice(0, count).map(([lineId]) => lineId);
      const tomatoAuthority = useRecipeStore.getState().productBehaviorSnapshots[TOMATO_LINE_ID]!;
      useRecipeStore.setState((state) => ({
        productBehaviorSnapshots: {
          ...state.productBehaviorSnapshots,
          ...Object.fromEntries(
            targetIds.map((lineId) => [
              lineId,
              {
                ...tomatoAuthority,
                lineId,
                mapperIngredientId:
                  state.items.find((item) => item.id === lineId)?.ingredient
                    .canonical_ingredient_id ?? null,
                resolutionContext: {
                  ...tomatoAuthority.resolutionContext!,
                  requestedRole: 'STANDARD' as const,
                },
              },
            ]),
          ),
        },
      }));
      const beforeGrams = targetIds.map((lineId) => grams(lineId));
      const beforeFingerprint = workingStateFingerprint(
        buildRecipeInput(useRecipeStore.getState()),
        NONE,
      );

      for (const lineId of targetIds) useRecipeStore.getState().setMainIngredient(lineId);

      const after = buildRecipeInput(useRecipeStore.getState());
      expect(targetIds.map((lineId) => grams(lineId))).toEqual(beforeGrams);
      expect(
        after.items
          .filter((item) => targetIds.includes(item.id as (typeof targetIds)[number]))
          .map((item) => [item.lock_type, item.main_ratio_weight]),
      ).toEqual(Array.from({ length: count }, () => ['main', 1]));
      expect(workingStateFingerprint(after, NONE)).not.toBe(beforeFingerprint);
      for (const lineId of targetIds) {
        expect(useRecipeStore.getState().productBehaviorSnapshots[lineId]?.resolutionState).toBe(
          'REVALIDATION_REQUIRED',
        );
      }
    },
  );

  it('keeps the legitimate unchanged Standard NO-OP intact', () => {
    useConstraintStudioStore
      .getState()
      .createOptimizePreview(useRecipeStore.getState().productBehaviorSnapshots);
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'NO_CHANGE_NEEDED',
    });

    useConstraintStudioStore
      .getState()
      .createOptimizePreview(useRecipeStore.getState().productBehaviorSnapshots);
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual({
      state: 'NO_CHANGE_NEEDED',
    });
  }, 120_000);

  it('hydrates saved Crown authority and uses it on the first Recalculate', async () => {
    useRecipeStore.getState().setMainIngredient(TOMATO_LINE_ID);
    const saved = buildRecipeInput(useRecipeStore.getState());
    expect(saved.items.find((item) => item.id === TOMATO_LINE_ID)).toMatchObject({
      lock_type: 'main',
      main_ratio_weight: 1,
    });

    useRecipeStore.getState().loadRecipeInput(structuredClone(saved), {
      savedId: 'served-cherry-tomatoes',
      savedName: 'Served Cherry Tomatoes',
      versionNumber: 1,
    });
    useRecipeStore.setState({ productBehaviorSnapshots: servedSnapshots(saved) });
    const reopened = buildRecipeInput(useRecipeStore.getState());
    const resolveSelection = vi.fn(async () => null);
    const resolved = await resolveRecipeProposalBehaviorSnapshots({
      recipe: reopened,
      snapshots: useRecipeStore.getState().productBehaviorSnapshots,
      accountId: null,
      module: 'OPTIMAL',
      resolveSelection,
    });
    expect(resolveSelection).not.toHaveBeenCalled();
    expect(resolved.unresolvedLineIds).toEqual([]);
    expect(resolved.snapshots[TOMATO_LINE_ID]?.resolutionContext?.requestedRole).toBe('MAIN');
    expect(reopened.items.find((item) => item.id === TOMATO_LINE_ID)).toMatchObject({
      lock_type: 'main',
      main_ratio_weight: 1,
    });
  }, 120_000);
});
