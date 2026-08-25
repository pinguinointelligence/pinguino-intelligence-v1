import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { INTERNET_PROTEIN_RECIPES } from '@/features/protein-gelato/__fixtures__/internetProteinRecipes';
import { recipeFitForInput } from '@/features/protein-gelato/proteinAuthority';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import {
  sorbetMapperIngredient,
  sorbetMultiMainBase,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import {
  byId as veganRecipeById,
  toVeganInput,
} from '@/features/vegan-structure/__campaign__/veganCampaignInput';
import {
  applyVerifiedRescueInput,
  confirmProductionLine,
  correctRecordedPhysicalGrams,
  createProductionSession,
  productionTopUpGrams,
  reopenProductionRecord,
  setDraftActualGrams,
  topUpProductionLine,
  type ProductionSession,
} from './productionSession';
import {
  assessProductionHardSafety,
  assessProductionRescue,
  productionContinuationPath,
  type ProductionRescueOption,
} from './productionRescue';
import { productionRescueAuthorizationInvalidation } from './useProductionWorkspace';

const AT = '2026-08-25T09:01:00.000Z';

const ownerObservedInput = (): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1_000,
  machine_capacity_grams: null,
  goals: { formulation_strategy: 'eco' },
  items: [
    ['milk', 'PI-ING-000236', 476],
    ['cream', 'PI-ING-000180', 198],
    ['smp', 'PI-ING-000270', 45],
    ['sucrose', 'PI-ING-000514', 91],
    ['dextrose', 'PI-ING-000494', 59],
    ['tara', 'PI-ING-000492', 3],
    ['strawberry', 'PI-ING-001553', 128],
  ].map(([id, mapperId, grams]) => ({
    id: String(id),
    ingredient: sorbetMapperIngredient(String(mapperId)),
    planned_grams: Number(grams),
    actual_grams: null,
    lock_type: 'unlocked' as const,
  })),
});

const realFruitGelatoInput = (): RecipeInput => ({
  mode: 'classic',
  category: 'fruit_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1_000,
  machine_capacity_grams: null,
  goals: { formulation_strategy: 'optimal' },
  items: [
    ['fruit', 'PI-ING-001553', 350, 'main'],
    ['milk', 'PI-ING-000236', 380, 'unlocked'],
    ['cream', 'PI-ING-000180', 80, 'unlocked'],
    ['smp', 'PI-ING-000270', 40, 'unlocked'],
    ['sucrose', 'PI-ING-000514', 110, 'unlocked'],
    ['dextrose', 'PI-ING-000494', 35, 'unlocked'],
    ['tara', 'PI-ING-000492', 5, 'unlocked'],
  ].map(([id, mapperId, grams, lock]) => ({
    id: String(id),
    ingredient: sorbetMapperIngredient(String(mapperId)),
    planned_grams: Number(grams),
    actual_grams: null,
    lock_type: lock as 'main' | 'unlocked',
  })),
});

const realProteinInput = (): RecipeInput => {
  const recipe = INTERNET_PROTEIN_RECIPES[0]!;
  return {
    mode: 'classic',
    category: 'protein_gelato',
    target_temperature_c: -12,
    target_batch_grams: 1_000,
    machine_capacity_grams: null,
    goals: { formulation_strategy: 'optimal' },
    items: recipe.lines.map((line, index) => ({
      id: `protein-${index}-${line.mapperId}`,
      ingredient: sorbetMapperIngredient(line.mapperId),
      planned_grams: line.grams,
      actual_grams: null,
      lock_type: 'unlocked',
    })),
  };
};

const directedOwnerInput = (sweetness: -2 | -1 | 0 | 1 | 2, softness: -2 | -1 | 0 | 1 | 2) => {
  const input = ownerObservedInput();
  return {
    ...input,
    goals: {
      ...input.goals,
      direction_targets_active: true,
      direction_targets: { sweetness, softness, creaminess: 0 as const, flavor: 0 as const },
    },
  };
};

const sessionFor = (id: string, input: RecipeInput): ProductionSession =>
  createProductionSession({
    sessionId: id === 'served' ? '1119813f-8652-45f1-ab81-5be3ebba49ef' : `run-${id}`,
    ownerUserId: 'owner',
    source: {
      recipeId: `recipe-${id}`,
      recipeVersionId: `version-${id}`,
      recipeVersionNumber: 1,
      recipeName: id === 'served' ? 'test produkcja 250826' : id,
    },
    plannedInput: input,
    plannedComposition: {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: input.items.map((item) => item.id),
      toppings: [],
      behaviorSnapshots: productBehaviorTestSnapshots(input),
      migrationAmbiguities: [],
    },
    startedAt: '2026-08-25T09:00:00.000Z',
  });

const confirmAtNextRevision = (
  session: ProductionSession,
  lineId: string,
  grams?: number,
): ProductionSession => {
  const entered = grams === undefined ? session : setDraftActualGrams(session, lineId, grams);
  const confirmed = confirmProductionLine(entered, lineId, AT);
  return {
    ...confirmed,
    durableActualRevision: session.durableActualRevision + 1,
    lastDeviationDecision: null,
  };
};

const line = (session: ProductionSession, lineId: string) =>
  session.lines.find((candidate) => candidate.lineId === lineId)!;

const assertLivePath = (session: ProductionSession) => {
  const assessment = assessProductionRescue(session);
  const path = productionContinuationPath(assessment);
  expect([
    'no_correction_required',
    'authorized_correction',
    'safe_unchanged_acceptance',
    'recovery_required',
  ]).toContain(path);
  if (path === 'authorized_correction') {
    expect(assessment.options.some((option) => option.id !== 'leave_as_is')).toBe(true);
  } else if (path === 'safe_unchanged_acceptance') {
    expect(assessment.hardSafety.safe).toBe(true);
    expect(assessment.options.some((option) => option.id === 'leave_as_is')).toBe(true);
  } else if (path === 'recovery_required') {
    expect(assessment.state).toBe('impossible');
    expect(assessment.reason).not.toBeNull();
  }
  return { assessment, path };
};

const enlargeFor = (session: ProductionSession): ProductionRescueOption => {
  const enlarge = assessProductionRescue(session).options.find(
    (option) => option.id === 'enlarge_batch',
  );
  expect(enlarge).toBeDefined();
  return enlarge!;
};

describe('Production sequential-deviation P0', () => {
  it('reproduces the served 45 g → 65 g dead-end and proves score 9 is distinct from hard safety', () => {
    let session = sessionFor('served', ownerObservedInput());
    session = confirmAtNextRevision(session, 'milk');
    session = confirmAtNextRevision(session, 'cream');
    session = confirmAtNextRevision(session, 'smp', 65);

    const { assessment, path } = assertLivePath(session);
    const score = recipeFitForInput(assessment.forecastInput, assessment.forecastResult);

    expect(session.durableActualRevision).toBe(3);
    expect(line(session, 'smp').physicalAddedGrams).toBe(65);
    expect(score.display).toBe('9/10');
    expect(assessment.options).toEqual([]);
    expect(path).toBe('recovery_required');
    expect(assessment.hardSafety).toMatchObject({
      safe: false,
      violationMetrics: ['lactose_sandiness_risk', 'lactose'],
    });
    expect(
      detectViolations(calculateRecipe(assessment.forecastInput)).map((violation) => [
        violation.metric,
        violation.direction,
      ]),
    ).toEqual([
      ['lactose_sandiness_risk', 'high'],
      ['lactose', 'high'],
    ]);
  });

  it('SCENARIO 1 — evaluates every truthful path after a small early +2 g fruit-Gelato overage', () => {
    let session = sessionFor('scenario-1-fruit', realFruitGelatoInput());
    session = confirmAtNextRevision(session, 'cream', 82);
    const { assessment } = assertLivePath(session);

    expect(assessment.hasConfirmedDeviation).toBe(true);
    expect(assessment.state).not.toBe('not_needed');
  });

  it('SCENARIO 2 — routes the served +20 g overage to an honest recovery instead of a dead-end', () => {
    let session = sessionFor('scenario-2-dairy', ownerObservedInput());
    session = confirmAtNextRevision(session, 'milk');
    session = confirmAtNextRevision(session, 'cream');
    session = confirmAtNextRevision(session, 'smp', 65);

    const { assessment, path } = assertLivePath(session);
    expect(path).toBe('recovery_required');
    expect(assessment.forecastScoreDisplay).toBe('9/10');
    expect(assessment.hardSafety.safe).toBe(false);
  });

  it('SCENARIO 3 — invalidates revision one and recalculates with two accumulated overages', () => {
    let session = sessionFor('scenario-3-dairy', ownerObservedInput());
    session = confirmAtNextRevision(session, 'cream', 200);
    const first = assertLivePath(session);
    const firstAuthorization = {
      expectedActualRevision: 1,
      expectedRescueRevision: 0,
      expiresAt: '2099-01-01T00:00:00.000Z',
    };
    session = confirmAtNextRevision(session, 'smp', 65);
    const second = assertLivePath(session);

    expect(first.assessment.hasConfirmedDeviation).toBe(true);
    expect(session.durableActualRevision).toBe(2);
    expect(productionRescueAuthorizationInvalidation(firstAuthorization, session)).toBe(
      'revision_mismatch',
    );
    expect(line(session, 'cream').physicalAddedGrams).toBe(200);
    expect(line(session, 'smp').physicalAddedGrams).toBe(65);
    expect(second.assessment.forecastInput.items.find((item) => item.id === 'cream')?.actual_grams)
      .toBe(200);
  });

  it('SCENARIO 4 — creates a third revision without losing any physical lower bound', () => {
    let session = sessionFor('scenario-4-dairy', ownerObservedInput());
    session = confirmAtNextRevision(session, 'cream', 200);
    session = confirmAtNextRevision(session, 'smp', 65);
    session = confirmAtNextRevision(session, 'sucrose', 96);

    assertLivePath(session);
    expect(session.durableActualRevision).toBe(3);
    expect(
      ['cream', 'smp', 'sucrose'].map((lineId) => line(session, lineId).physicalAddedGrams),
    ).toEqual([200, 65, 96]);
  });

  it('SCENARIO 5 — completes a 51 g underfill with the direct required +8 g top-up', () => {
    let session = sessionFor('scenario-5-dairy', ownerObservedInput());
    session = confirmAtNextRevision(session, 'dextrose', 51);
    expect(productionTopUpGrams(line(session, 'dextrose'))).toBe(8);

    session = topUpProductionLine(session, 'dextrose', 59, AT);
    session = { ...session, durableActualRevision: session.durableActualRevision + 1 };
    expect(line(session, 'dextrose')).toMatchObject({
      physicalAddedGrams: 59,
      confirmed: true,
    });
    expect(productionTopUpGrams(line(session, 'dextrose'))).toBe(0);
    expect(assessProductionRescue(session).state).toBe('not_needed');
  });

  it('SCENARIO 6 — reopens a confirmed Cream line for an authorized +152 g top-up', () => {
    let session = sessionFor('scenario-6-dairy', ownerObservedInput());
    session = confirmAtNextRevision(session, 'cream');
    session = confirmAtNextRevision(session, 'sucrose', 111);
    const enlarge = enlargeFor(session);
    expect(enlarge.finalMassG).toBe(1_172);

    session = applyVerifiedRescueInput(session, enlarge.candidateInput);
    expect(line(session, 'cream')).toMatchObject({
      physicalAddedGrams: 198,
      targetGrams: 350,
      confirmed: false,
    });
    expect(productionTopUpGrams(line(session, 'cream'))).toBe(152);

    session = confirmProductionLine(setDraftActualGrams(session, 'cream', 350), 'cream', AT);
    expect(line(session, 'cream').physicalAddedGrams).toBe(350);
    expect(productionTopUpGrams(line(session, 'cream'))).toBe(0);
  });

  it('SCENARIO 7 — exposes explicit unchanged acceptance for a hard-safe 9/10 revision', () => {
    let session = sessionFor('scenario-7-safe-9', directedOwnerInput(0, -2));
    session = confirmAtNextRevision(session, 'milk', 478);
    const { assessment } = assertLivePath(session);
    const unchanged = assessment.options.find((option) => option.id === 'leave_as_is');

    expect(assessment.hardSafety.safe).toBe(true);
    expect(unchanged?.scoreDisplay).toBe('9/10');
    expect(unchanged?.verifiedByEngine).toBe(true);
    expect(productionContinuationPath({ ...assessment, options: [unchanged!] })).toBe(
      'safe_unchanged_acceptance',
    );
  });

  it('SCENARIO 8 — keeps safe 8/10 acceptance revision-bound after an earlier deviation', () => {
    let session = sessionFor('scenario-8-safe-8', directedOwnerInput(-2, -2));
    session = confirmAtNextRevision(session, 'milk', 478);
    const first = assessProductionRescue(session);
    const firstUnchanged = first.options.find((option) => option.id === 'leave_as_is');
    expect(firstUnchanged?.scoreDisplay).toBe('8/10');
    session = {
      ...session,
      lastDeviationDecision: {
        strategy: 'leave_as_is',
        acceptedAt: AT,
        sourceActualRevision: 1,
        rescueRevision: 0,
        finalMassG: firstUnchanged!.finalMassG,
        scoreDisplay: '8/10',
      },
    };
    session = confirmAtNextRevision(session, 'cream', 200);
    const second = assessProductionRescue(session);

    expect(session.lastDeviationDecision).toBeNull();
    expect(session.durableActualRevision).toBe(2);
    expect(second.hardSafety.safe).toBe(true);
    expect(second.options.find((option) => option.id === 'leave_as_is')?.scoreDisplay).toBe('8/10');
  });

  it('SCENARIO 9 — blocks unsafe unchanged with exact lactose reasons and keeps recovery live', () => {
    let session = sessionFor('scenario-9-unsafe', ownerObservedInput());
    session = confirmAtNextRevision(session, 'milk');
    session = confirmAtNextRevision(session, 'cream');
    session = confirmAtNextRevision(session, 'smp', 65);
    const { assessment, path } = assertLivePath(session);

    expect(assessment.options.some((option) => option.id === 'leave_as_is')).toBe(false);
    expect(assessment.hardSafety.violationMetrics).toEqual([
      'lactose_sandiness_risk',
      'lactose',
    ]);
    expect(path).toBe('recovery_required');
  });

  it('SCENARIO 10 — rejects preserving 1000 g once confirmed physical mass is already above it', () => {
    let session = sessionFor('scenario-10-sorbet-multimain', sorbetMultiMainBase(-11));
    for (const productionLine of session.lines) {
      const grams =
        productionLine.lineId === 'main-strawberry'
          ? productionLine.plannedGrams + 50
          : productionLine.plannedGrams;
      session = confirmAtNextRevision(session, productionLine.lineId, grams);
    }
    const { assessment } = assertLivePath(session);
    const physicalTotal = session.lines.reduce(
      (sum, productionLine) => sum + productionLine.physicalAddedGrams,
      0,
    );

    expect(physicalTotal).toBeGreaterThan(1_000);
    expect(assessment.options.some((option) => option.id === 'keep_original_batch')).toBe(false);
  });

  it('SCENARIO 11 — invalidates the accepted top-up when that top-up is itself overfilled', () => {
    let session = sessionFor('scenario-11-dairy', ownerObservedInput());
    session = confirmAtNextRevision(session, 'cream');
    session = confirmAtNextRevision(session, 'sucrose', 111);
    const enlarge = enlargeFor(session);
    const oldAuthorization = {
      expectedActualRevision: session.durableActualRevision,
      expectedRescueRevision: session.durableRescueRevision,
      expiresAt: '2099-01-01T00:00:00.000Z',
    };
    session = applyVerifiedRescueInput(session, enlarge.candidateInput);
    session = {
      ...session,
      durableRescueRevision: 1,
      lastDeviationDecision: {
        strategy: 'enlarge_batch',
        acceptedAt: AT,
        sourceActualRevision: 2,
        rescueRevision: 1,
        finalMassG: enlarge.finalMassG,
        scoreDisplay: enlarge.scoreDisplay,
      },
    };
    session = confirmAtNextRevision(session, 'cream', 351);

    expect(productionRescueAuthorizationInvalidation(oldAuthorization, session)).toBe(
      'revision_mismatch',
    );
    expect(line(session, 'cream').physicalAddedGrams).toBe(351);
    expect(session.lastDeviationDecision).toBeNull();
    assertLivePath(session);
  });

  it('SCENARIO 12 — mistaken-entry correction creates a fresh revision and kills stale authority', () => {
    let session = sessionFor('scenario-12-dairy', ownerObservedInput());
    session = confirmAtNextRevision(session, 'cream', 200);
    const staleAuthorization = {
      expectedActualRevision: 1,
      expectedRescueRevision: 0,
      expiresAt: '2099-01-01T00:00:00.000Z',
    };
    session = reopenProductionRecord(session, 'cream');
    session = correctRecordedPhysicalGrams(session, 'cream', 199);
    session = confirmProductionLine(session, 'cream', AT);
    session = {
      ...session,
      durableActualRevision: 2,
      lastDeviationDecision: null,
    };

    expect(line(session, 'cream')).toMatchObject({
      physicalAddedGrams: 199,
      recordCorrectionCount: 1,
      confirmed: true,
    });
    expect(productionRescueAuthorizationInvalidation(staleAuthorization, session)).toBe(
      'revision_mismatch',
    );
    assertLivePath(session);
  });

  it('covers dairy, fruit, Sorbet Multi-Main, Vegan and Protein with canonical PI fixtures', () => {
    const families = [
      ['dairy', ownerObservedInput(), 'cream'],
      ['fruit', realFruitGelatoInput(), 'cream'],
      ['sorbet-multi-main', sorbetMultiMainBase(-11), 'main-lime'],
      ['vegan', toVeganInput(veganRecipeById('R01'), -11, 'optimal'), null],
      ['protein', realProteinInput(), null],
    ] as const;

    const results = families.map(([family, input, preferredLineId]) => {
      let session = sessionFor(`family-${family}`, input);
      const selected =
        session.lines.find((candidate) => candidate.lineId === preferredLineId) ??
        session.lines.find((candidate) => candidate.plannedGrams > 10)!;
      session = confirmAtNextRevision(session, selected.lineId, selected.plannedGrams + 2);
      const { path } = assertLivePath(session);
      return { family, path };
    });

    expect(results.map((result) => result.family)).toEqual([
      'dairy',
      'fruit',
      'sorbet-multi-main',
      'vegan',
      'protein',
    ]);
  });

  it('records five real authorized larger-batch vectors and proves every candidate hard-safe', () => {
    const cases = [
      {
        id: 'dairy-sucrose',
        input: ownerObservedInput(),
        changedLineId: 'sucrose',
        physical: 111,
        preconfirmedTopUpLineId: 'cream',
        target: 1_172,
        topUpLineId: 'cream',
        topUp: 152,
        finalTarget: 350,
      },
      {
        id: 'dairy-dextrose',
        input: ownerObservedInput(),
        changedLineId: 'dextrose',
        physical: 79,
        preconfirmedTopUpLineId: 'cream',
        target: 1_237,
        topUpLineId: 'cream',
        topUp: 217,
        finalTarget: 415,
      },
      {
        id: 'sorbet-strawberry',
        input: sorbetMultiMainBase(-11),
        changedLineId: 'main-strawberry',
        physical: 450,
        preconfirmedTopUpLineId: 'new-recipe-3-dextrose',
        target: 1_075,
        topUpLineId: 'new-recipe-3-dextrose',
        topUp: 25,
        finalTarget: 84,
      },
      {
        id: 'sorbet-lime',
        input: sorbetMultiMainBase(-11),
        changedLineId: 'main-lime',
        physical: 220,
        preconfirmedTopUpLineId: 'new-recipe-3-dextrose',
        target: 1_039,
        topUpLineId: 'new-recipe-3-dextrose',
        topUp: 19,
        finalTarget: 78,
      },
      {
        id: 'sorbet-water',
        input: sorbetMultiMainBase(-11),
        changedLineId: 'new-recipe-1-water',
        physical: 199,
        preconfirmedTopUpLineId: 'new-recipe-3-dextrose',
        target: 1_040,
        topUpLineId: 'new-recipe-3-dextrose',
        topUp: 20,
        finalTarget: 79,
      },
    ] as const;

    const evidence = cases.map((entry) => {
      let session = sessionFor(`enlarge-${entry.id}`, entry.input);
      session = confirmAtNextRevision(session, entry.preconfirmedTopUpLineId);
      session = confirmAtNextRevision(session, entry.changedLineId, entry.physical);
      const enlarge = enlargeFor(session);
      const topUp = enlarge.instructions.find(
        (instruction) => instruction.lineId === entry.topUpLineId,
      );
      const hardSafety = assessProductionHardSafety(
        enlarge.candidateInput,
        calculateRecipe(enlarge.candidateInput),
      );

      expect(enlarge.finalMassG).toBe(entry.target);
      expect(topUp).toMatchObject({
        kind: 'add',
        grams: entry.topUp,
        finalTargetGrams: entry.finalTarget,
      });
      expect(enlarge.scoreDisplay).toBe('10/10');
      expect(hardSafety.safe).toBe(true);

      expect(line(session, entry.topUpLineId).confirmed).toBe(true);
      expect(
        enlarge.candidateInput.items.find((item) => item.id === entry.topUpLineId)?.planned_grams,
      ).toBe(entry.finalTarget);
      return `${entry.physical}→${enlarge.finalMassG}:${topUp!.grams}:${enlarge.scoreDisplay}`;
    });

    expect(evidence).toHaveLength(5);
  });
});
