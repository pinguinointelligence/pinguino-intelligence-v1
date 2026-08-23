/**
 * RESCUE ↔ DIRECTION DECOUPLING (owner authority 2026-08-23).
 *
 * Direction Targets and the Recipe Rescue Advisor are SEPARATE features:
 *
 *   Direction  — a preference (sweetness / hardness). It may legitimately stay
 *                unavailable while its calibration is scientifically unproven.
 *                Vegan has no approved POD lockedReference / NPAC cleanCenter,
 *                so its axes are blocked today.
 *   Rescue     — an OPERATIONAL recovery: the recipe is out of its approved
 *                bands and the user needs a legal way back.
 *
 * Before this change the advisor returned early unless
 * `direction_targets_active === true`, which made Rescue unreachable for every
 * profile without a Direction calibration. `Direction unavailable` must never
 * mean `Rescue unavailable`.
 *
 * Nothing here unlocks Direction, and nothing borrows a dairy anchor.
 */
import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type EngineIngredient,
  type IngredientCategory,
  type RecipeInput,
} from '@/engine';
import { findVerifiedVeganFormulationCandidate } from '@/data/ingredients/verifiedVeganToolbox';
import { VEGAN_VERIFIED_CANONICAL_IDS } from '@/data/ingredients/verifiedVeganToolbox';
import { classifyViolationBands } from '@/features/formulation/violationBands';
import {
  isMaterialOperationalImprovement,
  isMaterialRescueImprovement,
  measureRescueOutcome,
  rescueCandidateFamily,
  resolveRescueTrigger,
  simulateRescueCandidates,
  type RescueOutcomeMeasure,
} from './rescueIngredientAdvisor';

const ZERO = {
  water_percent: 0,
  solids_percent: 0,
  fat_percent: 0,
  protein_percent: 0,
  carbohydrate_percent: 0,
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
};

const verified = (
  id: string,
  name: string,
  category: IngredientCategory,
  composition: Partial<typeof ZERO>,
  pod = 0,
  pac = 0,
): EngineIngredient => ({
  id,
  canonical_ingredient_id: id,
  private_product_id: null,
  identity_provenance: 'mapper',
  name,
  category,
  composition: { ...ZERO, ...composition },
  pod_value: pod,
  pac_value: pac,
  npac_value: null,
  de_value: null,
  cost_per_kg: null,
  confidence_score: 95,
  source_type: 'verified_db',
  is_verified: true,
  flags: {
    vegan_eligibility: 'VEGAN_VERIFIED',
    vegan_eligibility_reasons: ['verified_mapper_vegan_true'],
  },
});

const WATER = verified('water', 'Water', 'water', { water_percent: 100 });
const SUCROSE = verified(
  'sucrose',
  'Sucrose',
  'sugar',
  {
    solids_percent: 100,
    carbohydrate_percent: 100,
    sugar_percent: 100,
    sucrose_percent: 100,
    kcal_per_100g: 400,
  },
  100,
  100,
);
const INULIN = verified('inulin', 'Inulin', 'stabilizer', {
  water_percent: 5,
  solids_percent: 95,
  carbohydrate_percent: 90,
  fiber_percent: 90,
  kcal_per_100g: 190,
});
const TARA = verified('tara_gum', 'Tara gum', 'stabilizer', {
  water_percent: 12,
  solids_percent: 88,
  carbohydrate_percent: 80,
  fiber_percent: 80,
  kcal_per_100g: 200,
});
const COCONUT_OIL = findVerifiedVeganFormulationCandidate('PI-ING-000163')!;

const line = (id: string, ingredient: EngineIngredient, grams: number) => ({
  id,
  ingredient,
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'unlocked' as const,
});

/** Vegan −13 that is deliberately UNDER-SUGARED: NPAC falls below the approved
 * 50–64 band, i.e. a real operational problem with NO Direction target set. */
const underSugaredVegan = (): RecipeInput => ({
  mode: 'classic',
  category: 'vegan_gelato',
  target_temperature_c: -13,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: { formulation_strategy: 'optimal' },
  items: [
    line('l-water', WATER, 800),
    line('l-sucrose', SUCROSE, 100),
    line('l-fat', COCONUT_OIL, 50),
    line('l-inulin', INULIN, 48),
    line('l-tara', TARA, 2),
  ],
});

const NO_CONSTRAINTS = { byLineId: {} };
const AT = '2026-08-23T00:00:00.000Z';

describe('the recipe IS operationally broken and Direction IS unavailable', () => {
  const input = underSugaredVegan();

  it('has a real hard-band violation', () => {
    const violations = detectViolations(calculateRecipe(input));
    expect(violations.length).toBeGreaterThan(0);
    expect(classifyViolationBands(input).hardMetrics.length).toBeGreaterThan(0);
  });

  it('has NO active Direction target — the pre-condition that used to kill Rescue', () => {
    expect(input.goals?.direction_targets_active).toBeUndefined();
  });
});

describe('resolveRescueTrigger — Direction unavailable never disables Rescue', () => {
  const broken: RescueOutcomeMeasure = {
    score: null,
    reachedAxisCount: 0,
    supportedAxisCount: 0,
    severityPoints: 0,
    hardMetricCount: 2,
    engineSeverityPoints: 4,
  };
  const healthy: RescueOutcomeMeasure = { ...broken, hardMetricCount: 0, engineSeverityPoints: 0 };

  it('falls back to OPERATIONAL when Direction is inactive or unsupported', () => {
    expect(resolveRescueTrigger(false, 0, false, broken)).toBe('operational');
    expect(resolveRescueTrigger(true, 0, false, broken)).toBe('operational');
  });

  it('still prefers DIRECTION when Direction is active, supported and unreached', () => {
    expect(resolveRescueTrigger(true, 2, false, broken)).toBe('direction');
  });

  it('returns null only when there is genuinely nothing to rescue', () => {
    expect(resolveRescueTrigger(false, 0, false, healthy)).toBeNull();
    expect(resolveRescueTrigger(true, 2, true, healthy)).toBeNull();
  });

  it('a reached Direction target does NOT hide a remaining hard violation', () => {
    expect(resolveRescueTrigger(true, 2, true, broken)).toBe('operational');
  });
});

describe('the advisor actually runs for Vegan without Direction', () => {
  const input = underSugaredVegan();
  const report = simulateRescueCandidates({
    input,
    set: NO_CONSTRAINTS,
    createdAt: AT,
    options: {},
    bestCurrent: null,
  });

  it('reports the operational trigger instead of returning early', () => {
    expect(report.trigger).toBe('operational');
    expect(report.current).not.toBeNull();
    expect(report.current!.hardMetricCount).toBeGreaterThan(0);
  });

  it('simulates real candidates', () => {
    expect(report.simulations.length).toBeGreaterThan(0);
  });

  it('offers ONLY VEGAN_VERIFIED identities — eligibility is untouched', () => {
    for (const candidate of rescueCandidateFamily(input, null)) {
      expect(
        VEGAN_VERIFIED_CANONICAL_IDS.has(candidate.canonicalIngredientId),
        candidate.canonicalIngredientId,
      ).toBe(true);
    }
    for (const simulation of report.simulations) {
      expect(
        VEGAN_VERIFIED_CANONICAL_IDS.has(simulation.canonicalIngredientId),
        simulation.canonicalIngredientId,
      ).toBe(true);
    }
  });

  it('never mutates the draft', () => {
    const before = JSON.stringify(input);
    simulateRescueCandidates({
      input,
      set: NO_CONSTRAINTS,
      createdAt: AT,
      options: {},
      bestCurrent: null,
    });
    expect(JSON.stringify(input)).toBe(before);
  });

  it('carries the trigger on any advice it does give', () => {
    if (report.advice) expect(report.advice.trigger).toBe('operational');
  });
});

describe('a healthy Vegan recipe is still left alone', () => {
  it('returns no trigger and no advice when nothing is out of band', () => {
    const healthy: RecipeInput = {
      ...underSugaredVegan(),
      items: [
        line('l-water', WATER, 457),
        line('l-oat', findVerifiedVeganFormulationCandidate('PI-ING-001565')!, 225),
        line('l-fat', COCONUT_OIL, 47),
        line('l-sucrose', SUCROSE, 167),
        line(
          'l-dextrose',
          verified(
            'dextrose',
            'Dextrose (monohydrate)',
            'sugar',
            {
              water_percent: 8,
              solids_percent: 92,
              carbohydrate_percent: 92,
              sugar_percent: 92,
              dextrose_percent: 92,
              kcal_per_100g: 368,
            },
            70,
            175,
          ),
          54,
        ),
        line('l-inulin', INULIN, 48),
        line('l-tara', TARA, 2),
      ],
      target_temperature_c: -11,
    };
    const measure = measureRescueOutcome(healthy);
    if (measure.hardMetricCount === 0) {
      const report = simulateRescueCandidates({
        input: healthy,
        set: NO_CONSTRAINTS,
        createdAt: AT,
        options: {},
        bestCurrent: null,
      });
      expect(report.trigger).toBeNull();
      expect(report.advice).toBeNull();
    }
  });
});

describe('the two evidence rules stay independent', () => {
  const base: RescueOutcomeMeasure = {
    score: 8,
    reachedAxisCount: 0,
    supportedAxisCount: 2,
    severityPoints: 1.0,
    hardMetricCount: 2,
    engineSeverityPoints: 1.0,
  };

  it('the OPERATIONAL rule reads only the operational fields', () => {
    // removing a hard violation is material, whatever Direction says
    expect(
      isMaterialOperationalImprovement(base, { ...base, hardMetricCount: 1, severityPoints: 99 }),
    ).toBe(true);
    // adding one never is
    expect(isMaterialOperationalImprovement(base, { ...base, hardMetricCount: 3 })).toBe(false);
    // equal hard count → needs the same margin the Direction rule demands
    expect(isMaterialOperationalImprovement(base, { ...base, engineSeverityPoints: 0.9 })).toBe(
      false,
    );
    expect(isMaterialOperationalImprovement(base, { ...base, engineSeverityPoints: 0.4 })).toBe(
      true,
    );
  });

  it('the DIRECTION rule ignores the operational fields entirely', () => {
    expect(
      isMaterialRescueImprovement(base, {
        ...base,
        hardMetricCount: 0,
        engineSeverityPoints: 0,
      }),
    ).toBe(false);
    expect(isMaterialRescueImprovement(base, { ...base, severityPoints: 0.4 })).toBe(true);
  });
});
