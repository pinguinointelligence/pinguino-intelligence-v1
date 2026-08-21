import { describe, expect, it } from 'vitest';
import { ICE_ANCHOR_ROWS, hasSeededIceAnchorAtTemperature, type RecipeInput } from '@/engine';
import {
  OWNER_MAPPER_INGREDIENTS,
  ownerSameInputRecipe,
} from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import {
  alcoholAndSugarHeavyJimBeam,
  starterLine,
  starterMilkBase,
  withGrams,
} from './constraintFixtures';
import {
  SORBET_FIXTURE_LINE,
  neutralSorbetStarter,
  overStabilizedSorbet,
  sorbetAuthoritySnapshots,
  sorbetMultiMainBase,
  sorbetTopping,
  unsupportedSorbet,
  type SorbetServingTemperature,
} from './__fixtures__/sorbetAuthorityFixture';
import { buildOptimizePreview, plannedSum } from '@/features/constraint-studio/applyPipeline';
import { evaluateFreezingStabilityStatus } from './freezingStabilityStatus';

const current = (recipe: RecipeInput) =>
  evaluateFreezingStabilityStatus({
    recipe,
    snapshots: productBehaviorTestSnapshots(recipe),
    calculationState: 'CURRENT',
  });

const currentSorbet = (recipe: RecipeInput) =>
  evaluateFreezingStabilityStatus({
    recipe,
    snapshots: sorbetAuthoritySnapshots(recipe),
    calculationState: 'CURRENT',
  });

const starterInput = (
  visibleProductType: 'vegan' | 'protein',
  servingModeId: 'temp_minus_11' | 'temp_minus_12' | 'temp_minus_13',
): RecipeInput => {
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType,
    servingModeId,
    formulationStrategy: 'optimal',
    targetBatchGrams: 1_000,
  });
  return {
    items: starter.items,
    mode: 'classic',
    category: starter.category,
    target_temperature_c: starter.targetTemperatureC,
    target_batch_grams: starter.targetBatchGrams,
    machine_capacity_grams: null,
    goals: { formulation_strategy: starter.formulationStrategy },
  };
};

const verifiedGelatoAt = (temperature: -12 | -13): RecipeInput => {
  const grams =
    temperature === -12
      ? {
          milk_3_5: 600,
          cream_30: 135,
          smp: 43,
          sucrose: 86,
          dextrose: 80,
          inulin: 54,
          tara_gum: 2,
        }
      : {
          milk_3_5: 600,
          cream_30: 125,
          smp: 45,
          sucrose: 72,
          dextrose: 112,
          inulin: 44,
          tara_gum: 2,
        };
  return {
    ...ownerSameInputRecipe(),
    target_temperature_c: temperature,
    items: (Object.keys(grams) as Array<keyof typeof grams>).map((key) => ({
      id: `verified-${temperature}:${key}`,
      ingredient: OWNER_MAPPER_INGREDIENTS[key],
      planned_grams: grams[key],
      actual_grams: null,
      lock_type: 'unlocked',
    })),
  };
};

describe('freezing stability domain status', () => {
  it.each([
    [-11, starterMilkBase()],
    [-12, verifiedGelatoAt(-12)],
    [-13, verifiedGelatoAt(-13)],
  ] as const)(
    'certifies valid current Gelato at %i°C from direct authority',
    (_temperature, recipe) => {
      const assessment = current(recipe);
      expect(assessment.status, assessment.reasons.join(', ')).toBe('GOOD');
      expect(assessment.constraintAuthority.valid).toBe(true);
    },
  );

  it('removes GOOD immediately when the exact BASE is stale and restores a fresh derivation', () => {
    const base = starterMilkBase();
    const changed = {
      ...base,
      items: base.items.map((item) =>
        item.id === starterLine('milk_3_5')
          ? { ...item, planned_grams: item.planned_grams - 1 }
          : item.id === starterLine('cream_30')
            ? { ...item, planned_grams: item.planned_grams + 1 }
            : item,
      ),
    };
    const snapshots = productBehaviorTestSnapshots(changed);

    expect(current(base).status).toBe('GOOD');
    expect(
      evaluateFreezingStabilityStatus({
        recipe: changed,
        snapshots,
        calculationState: 'STALE',
      }).status,
    ).toBe('STALE');
    expect(
      evaluateFreezingStabilityStatus({
        recipe: changed,
        snapshots,
        calculationState: 'CURRENT',
      }).status,
    ).toBe('GOOD');
  });

  it('reports ATTENTION for a real canonical Engine/freezing violation', () => {
    const violated = withGrams(starterMilkBase(), starterLine('sucrose'), 300);
    const assessment = current(violated);
    expect(assessment.constraintAuthority.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: 'engine' })]),
    );
    expect(assessment.status).toBe('ATTENTION');
  });

  it('fails closed to UNAVAILABLE for missing or stale ProductBehavior', () => {
    const recipe = starterMilkBase();
    const missing = productBehaviorTestSnapshots(recipe);
    delete missing[recipe.items[0]!.id];
    expect(
      evaluateFreezingStabilityStatus({
        recipe,
        snapshots: missing,
        calculationState: 'CURRENT',
      }).status,
    ).toBe('UNAVAILABLE');

    const stale = productBehaviorTestSnapshots(recipe);
    const lineId = recipe.items[0]!.id;
    stale[lineId] = { ...stale[lineId]!, resolutionState: 'REVALIDATION_REQUIRED' };
    expect(
      evaluateFreezingStabilityStatus({
        recipe,
        snapshots: stale,
        calculationState: 'CURRENT',
      }).status,
    ).toBe('UNAVAILABLE');
  });

  it('consumes the existing Gelato stabilizer owner authority', () => {
    const recipe = starterMilkBase();
    const excessive = {
      ...recipe,
      items: recipe.items.map((item) =>
        item.id === starterLine('tara_gum')
          ? { ...item, planned_grams: 6 }
          : item.id === starterLine('milk_3_5')
            ? { ...item, planned_grams: item.planned_grams - 1 }
            : item,
      ),
    };
    const assessment = current(excessive);
    expect(assessment.constraintAuthority.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'owner_policy', code: 'aggregate_above_maximum' }),
      ]),
    );
    expect(assessment.status).toBe('ATTENTION');
  });

  it('reports ATTENTION for the existing alcohol/freezing safety edge case', () => {
    const assessment = current(alcoholAndSugarHeavyJimBeam());
    expect(assessment.result.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'alcohol_above_safe_range' })]),
    );
    expect(assessment.status).toBe('ATTENTION');
  });

  it.each([
    ['vegan', 'temp_minus_11'],
    ['vegan', 'temp_minus_12'],
    ['vegan', 'temp_minus_13'],
  ] as const)('does not certify unresolved %s authority at %s', (profile, temperature) => {
    expect(current(starterInput(profile, temperature)).status).toBe('UNAVAILABLE');
  });

  it('uses the existing direct Protein authority without inventing profile physics', () => {
    const recipe = starterInput('protein', 'temp_minus_11');
    const assessment = current(recipe);
    expect(assessment.status, assessment.reasons.join(', ')).toBe('GOOD');
  });

  it('derives Preview/Apply/Undo and reopened-version states from the exact supplied BASE', () => {
    const original = starterMilkBase();
    const preview = {
      ...original,
      items: original.items.map((item) =>
        item.id === starterLine('milk_3_5')
          ? { ...item, planned_grams: item.planned_grams - 1 }
          : item.id === starterLine('cream_30')
            ? { ...item, planned_grams: item.planned_grams + 1 }
            : item,
      ),
    };

    expect(current(original).status).toBe('GOOD');
    expect(current(preview).status).toBe('GOOD');
    expect(current(structuredClone(preview)).status).toBe('GOOD');
    expect(current(structuredClone(original)).status).toBe('GOOD');
  });
});

describe('Sorbet freezing stability — composition-freezing authority (no milk anchors)', () => {
  const TEMPERATURES: readonly SorbetServingTemperature[] = [-11, -12, -13];

  it.each(TEMPERATURES)(
    'certifies a valid supported Sorbet at %i°C from the composition solver (Dobra)',
    (temperature) => {
      const recipe = sorbetMultiMainBase(temperature);
      const assessment = currentSorbet(recipe);
      expect(assessment.status, assessment.reasons.join(', ')).toBe('GOOD');
      expect(assessment.reasons).toEqual(['canonical_constraint_passed']);
      expect(assessment.constraintAuthority.valid).toBe(true);
      expect(Number.isFinite(assessment.result.ice_fraction_percent)).toBe(true);
      expect(assessment.result.warnings).not.toContainEqual(
        expect.objectContaining({ code: 'composition_invalid' }),
      );
    },
  );

  it.each(TEMPERATURES)(
    'derives the 1:1 Multi-Main Sorbet at %i°C from the same authority (never UNAVAILABLE, never green on a violation)',
    (temperature) => {
      const recipe = sorbetMultiMainBase(temperature, [1, 1]);
      expect(
        recipe.items.find((item) => item.id === SORBET_FIXTURE_LINE.strawberry)?.planned_grams,
      ).toBe(300);
      expect(recipe.items.find((item) => item.id === SORBET_FIXTURE_LINE.lime)?.planned_grams).toBe(
        300,
      );
      const assessment = currentSorbet(recipe);
      // The composition authority is present for every 1:1 cell…
      expect(Number.isFinite(assessment.result.ice_fraction_percent)).toBe(true);
      expect(assessment.status).not.toBe('UNAVAILABLE');
      expect(assessment.reasons).not.toContain('sorbet_freezing_authority_unavailable');
      expect(assessment.reasons).not.toContain('direct_ice_authority_unavailable');
      // …and the qualitative status is exactly the unified constraint truth: the
      // un-rebalanced 1:1 swap sits marginally below the NPAC band at −11/−12
      // (a real Engine violation → ATTENTION) and in band at −13 (→ GOOD).
      const EXPECTED: Readonly<Record<SorbetServingTemperature, 'GOOD' | 'ATTENTION'>> = {
        [-11]: 'ATTENTION',
        [-12]: 'ATTENTION',
        [-13]: 'GOOD',
      };
      expect(assessment.status).toBe(EXPECTED[temperature]);
      expect(assessment.status).toBe(assessment.constraintAuthority.valid ? 'GOOD' : 'ATTENTION');
      if (assessment.status === 'ATTENTION') {
        expect(assessment.constraintAuthority.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ source: 'engine', code: 'native_band_violation' }),
          ]),
        );
      }
    },
  );

  it('never certifies Sorbet from milk_gelato anchor rows — the authority is the solver', () => {
    expect(ICE_ANCHOR_ROWS.some((row) => row.category === 'sorbet')).toBe(false);
    for (const temperature of TEMPERATURES) {
      expect(hasSeededIceAnchorAtTemperature('sorbet', temperature)).toBe(false);
      expect(currentSorbet(sorbetMultiMainBase(temperature)).status).toBe('GOOD');
    }
  });

  it('removes Sorbet GOOD while the exact BASE is stale and restores it after recalculation', () => {
    const base = sorbetMultiMainBase(-12);
    const water = base.items.find((item) => item.id.endsWith('water'))!;
    const sucrose = base.items.find((item) => item.id.endsWith('sucrose'))!;
    const edited = {
      ...base,
      items: base.items.map((item) =>
        item.id === water.id
          ? { ...item, planned_grams: item.planned_grams - 1 }
          : item.id === sucrose.id
            ? { ...item, planned_grams: item.planned_grams + 1 }
            : item,
      ),
    };
    const snapshots = sorbetAuthoritySnapshots(edited);
    expect(currentSorbet(base).status).toBe('GOOD');
    expect(
      evaluateFreezingStabilityStatus({ recipe: edited, snapshots, calculationState: 'STALE' })
        .status,
    ).toBe('STALE');
    expect(
      evaluateFreezingStabilityStatus({ recipe: edited, snapshots, calculationState: 'CURRENT' })
        .status,
    ).toBe('GOOD');
  });

  it.each(TEMPERATURES)(
    'fails closed to UNAVAILABLE (Brak danych) at %i°C when the Sorbet solver has no authority',
    (temperature) => {
      const recipe = unsupportedSorbet(sorbetMultiMainBase(temperature));
      const assessment = currentSorbet(recipe);
      expect(assessment.status).toBe('UNAVAILABLE');
      expect(assessment.reasons).toEqual(['sorbet_freezing_authority_unavailable']);
      expect(assessment.result.ice_fraction_percent).toBeNull();
      expect(assessment.result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'composition_invalid',
          context: { reason: 'sorbet_freezing_unsupported_freeze_active_solute' },
        }),
      );
    },
  );

  it('reports ATTENTION (Wymaga uwagi) for an authoritative Sorbet result with a real violation', () => {
    const recipe = overStabilizedSorbet(sorbetMultiMainBase(-11));
    const assessment = currentSorbet(recipe);
    expect(Number.isFinite(assessment.result.ice_fraction_percent)).toBe(true);
    expect(assessment.constraintAuthority.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'owner_policy', code: 'aggregate_above_maximum' }),
      ]),
    );
    expect(assessment.status).toBe('ATTENTION');
    expect(assessment.reasons).toEqual(['canonical_constraint_violation']);
  });

  it('keeps the Sorbet BASE freezing authority unchanged when toppings are present', () => {
    const recipe = sorbetMultiMainBase(-13);
    const without = currentSorbet(recipe);
    expect(without.status).toBe('GOOD');
    for (const grams of [0, 1, 20, 50]) {
      const assessment = evaluateFreezingStabilityStatus({
        recipe,
        snapshots: sorbetAuthoritySnapshots(recipe, [sorbetTopping('topping-mango', grams)]),
        calculationState: 'CURRENT',
      });
      expect(assessment.status).toBe('GOOD');
      expect(assessment.result.ice_fraction_percent).toBe(without.result.ice_fraction_percent);
    }
  });

  it('never turns a dairy BASE switched to the Sorbet product type green (lactose is outside the solver domain)', () => {
    const relabelled: RecipeInput = { ...starterMilkBase(), category: 'sorbet' };
    const assessment = evaluateFreezingStabilityStatus({
      recipe: relabelled,
      snapshots: productBehaviorTestSnapshots(relabelled),
      calculationState: 'CURRENT',
    });
    expect(assessment.result.ice_fraction_percent).toBeNull();
    expect(assessment.result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'composition_invalid',
        context: { reason: 'sorbet_freezing_unsupported_freeze_active_solute' },
      }),
    );
    expect(assessment.status).toBe('UNAVAILABLE');
    expect(assessment.reasons).toEqual(['sorbet_freezing_authority_unavailable']);
  });

  it('derives Sorbet Preview/Apply/Undo and reopened-version states from the exact supplied BASE', () => {
    const original = sorbetMultiMainBase(-12);
    const water = original.items.find((item) => item.id.endsWith('water'))!;
    const sucrose = original.items.find((item) => item.id.endsWith('sucrose'))!;
    const preview = {
      ...original,
      items: original.items.map((item) =>
        item.id === water.id
          ? { ...item, planned_grams: item.planned_grams - 1 }
          : item.id === sucrose.id
            ? { ...item, planned_grams: item.planned_grams + 1 }
            : item,
      ),
    };
    expect(currentSorbet(original).status).toBe('GOOD');
    expect(currentSorbet(preview).status).toBe('GOOD');
    expect(currentSorbet(structuredClone(preview)).status).toBe('GOOD');
    expect(currentSorbet(structuredClone(original)).status).toBe('GOOD');
  });

  it('keeps the real Sorbet Preview path (−12, optimal, Direction 0/0) on the composition authority', () => {
    const base = sorbetMultiMainBase(-12);
    const input: RecipeInput = {
      ...base,
      goals: {
        ...base.goals,
        formulation_strategy: 'optimal',
        direction_targets_active: true,
        direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
      },
    };
    const snapshots = sorbetAuthoritySnapshots(input);
    // The base itself is already authoritative and valid…
    const baseAssessment = evaluateFreezingStabilityStatus({
      recipe: input,
      snapshots,
      calculationState: 'CURRENT',
    });
    expect(baseAssessment.status, baseAssessment.reasons.join(', ')).toBe('GOOD');
    // …so the real Preview either stages a proposal that stays GOOD on the
    // same authority, or truthfully reports that there is nothing to propose
    // (never a fabricated or authority-less proposal).
    const built = buildOptimizePreview(input, { byLineId: {} }, 'sorbet-closeout-preview', {
      productBehaviorSnapshots: snapshots,
    });
    if (!built.ok) {
      expect(built.code).toBe('no_proposal');
      return;
    }
    const proposed = built.preview.proposedInput;
    expect(built.preview.diagnosticOnly).not.toBe(true);
    expect(plannedSum(proposed)).toBeCloseTo(1_000, 6);
    const assessment = evaluateFreezingStabilityStatus({
      recipe: proposed,
      snapshots: sorbetAuthoritySnapshots(proposed),
      calculationState: 'CURRENT',
    });
    expect(Number.isFinite(assessment.result.ice_fraction_percent)).toBe(true);
    expect(assessment.status, assessment.reasons.join(', ')).toBe('GOOD');
  }, 60_000);

  it('fails closed for missing ProductBehavior on a Sorbet exactly like Gelato', () => {
    const recipe = sorbetMultiMainBase(-11);
    const missing = sorbetAuthoritySnapshots(recipe);
    delete missing[SORBET_FIXTURE_LINE.strawberry];
    expect(
      evaluateFreezingStabilityStatus({ recipe, snapshots: missing, calculationState: 'CURRENT' })
        .status,
    ).toBe('UNAVAILABLE');
  });

  it.each(TEMPERATURES)(
    'does not certify the incomplete neutral Sorbet starter at %i°C (truthful ATTENTION, not hidden, not green)',
    (temperature) => {
      const recipe = neutralSorbetStarter(temperature);
      const assessment = current(recipe);
      expect(assessment.status).toBe('ATTENTION');
      expect(assessment.constraintAuthority.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: 'batch', code: 'batch_total_mismatch' }),
        ]),
      );
    },
  );
});
