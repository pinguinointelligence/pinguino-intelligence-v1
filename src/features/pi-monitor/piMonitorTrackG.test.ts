/**
 * Track G — customer Monitor PI recalculation across the six serving modes.
 *
 * State after CONFIG 0.7.0 (2026-07-18): the approved ice anchors for milk_gelato
 * −12 (G15/G17) and −13 (G11/G18) are wired, and the customer flow builds the
 * temperature-appropriate approved base (G17 at −12, G18 at −13). So −11 and −12
 * recalculate cleanly end-to-end; −13's approved base (G18) is in-band on ice /
 * NPAC / POD / solids / water but marginally over the lactose-sandiness band under
 * the DEMO reference ingredient catalog (doc value 8.78 is in band), so the REAL
 * solver honestly returns optimizer_no_solution there — never a pre-run block.
 * Interactive tuning is offered wherever the ice model has a same-temperature
 * seeded anchor (all of −11/−12/−13), so refusals come only from a real solve.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeGoals, RecipeInput } from '@/engine';
import { buildStarterRecipeFromIntent } from '@/features/studioFlow/intentRecipeDraft';
import {
  previewOptimization,
  studioIntentFromRecipe,
} from '@/features/optimization/optimizationPreviewRunner';
import { SERVING_MODES, temperatureForMode } from '@/features/customer-flow/servingMode';
import {
  isMonitorTuningApproved,
  NEUTRAL_AXIS_INTENTS,
  piBaseIntentFromRecipe,
  realPiRecalculationRunner,
  recalculateWithPi,
  type IngredientResolutionSummary,
  type PiAxisIntents,
  type PiMonitorPersona,
  type PiRecalculationRunner,
  type PiRecalculationRunnerResult,
} from '@/features/pi-monitor';

const GOALS: RecipeGoals = { sweetness: 'normal', cost_priority: 'balanced', flavor_intensity: 'balanced' };
const RESOLVED: IngredientResolutionSummary = { allResolved: true, unresolvedCount: 0, unresolvedNames: [] };

/** Build the REAL standard-gelato starter recipe for a serving temperature. */
function realStandardGelato(temp: number): RecipeInput {
  const seed: RecipeInput = {
    items: [], mode: 'classic', category: 'milk_gelato',
    target_temperature_c: temp, target_batch_grams: 1000,
    machine_capacity_grams: null, goals: GOALS,
  };
  const draft = buildStarterRecipeFromIntent(studioIntentFromRecipe(seed), 1000, {
    complete: true, missingRequired: [],
  });
  if (!draft.recipeInput) throw new Error(`no starter recipe for ${temp}`);
  return draft.recipeInput;
}

const recalc = (
  recipe: RecipeInput,
  persona: PiMonitorPersona,
  opts: { runner?: PiRecalculationRunner; axisIntents?: PiAxisIntents } = {},
) =>
  recalculateWithPi({
    baseIntent: piBaseIntentFromRecipe(recipe),
    recipeDraft: recipe,
    axisIntents: opts.axisIntents ?? NEUTRAL_AXIS_INTENTS,
    resolution: RESOLVED,
    persona,
    tuningApproved: isMonitorTuningApproved(recipe.category, recipe.target_temperature_c),
    runner: opts.runner ?? realPiRecalculationRunner,
  });

/* ------------------------------------------------------------------ *
 * Six-mode routing + ice-anchor approval (all connected after 0.7.0)  *
 * ------------------------------------------------------------------ */

describe('Track G — every serving mode has a connected ice anchor (tuning approved)', () => {
  const EXPECTED_TEMP: Record<string, number> = {
    temp_minus_11: -11, temp_minus_12: -12, temp_minus_13: -13,
    fresh: -11, ninja_gelato: -13, ninja_swirl: -11,
  };
  for (const mode of SERVING_MODES) {
    const expectedTemp = EXPECTED_TEMP[mode.id];
    if (expectedTemp === undefined) throw new Error(`missing expectation for ${mode.id}`);
    it(`${mode.id} → ${expectedTemp}°C, milk_gelato tuning approved`, () => {
      expect(temperatureForMode(mode.id)).toBe(expectedTemp);
      expect(isMonitorTuningApproved('milk_gelato', expectedTemp)).toBe(true);
    });
  }

  it('a temperature with no seeded ice anchor is NOT approved (honest boundary)', () => {
    expect(isMonitorTuningApproved('milk_gelato', -14)).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * −11 and −12 recalculate cleanly end-to-end through the real engine  *
 * ------------------------------------------------------------------ */

describe('Track G — −11 and −12 recalculate cleanly (approved base + ice anchors)', () => {
  for (const temp of [-11, -12] as const) {
    it(`${temp}: base is in band → the owner's exact adjustment succeeds`, () => {
      const view = recalc(realStandardGelato(temp), 'home', {
        // Owner combination: softer + lighter creaminess + unchanged body.
        axisIntents: { ...NEUTRAL_AXIS_INTENTS, miekkosc_twardosc: 'decrease', kremowosc_tluszcz: 'decrease' },
      });
      expect(view.ran).toBe(true);
      expect(view.failureReason).toBeNull();
      expect(['juz_w_zakresie', 'poprawione', 'kompromis']).toContain(view.outcome);
    });
  }

  it('the customer runner and Studio previewOptimization agree for the identical −12 RecipeInput', () => {
    const recipe = realStandardGelato(-12);
    const studio = previewOptimization({ recipe, intent: studioIntentFromRecipe(recipe) });
    const viaRunner = realPiRecalculationRunner({ intent: studioIntentFromRecipe(recipe), recipeDraft: recipe });
    expect(viaRunner.decision).toBe(studio.finalDecision);
    expect(viaRunner.beforeMetrics.iceFraction).toBe(studio.beforeMetrics.iceFraction);
    expect(viaRunner.beforeMetrics.pod).toBe(studio.beforeMetrics.pod);
  });

  it('Ninja Swirl and Świeże inherit the −11 route; Ninja Gelato inherits −13', () => {
    expect(temperatureForMode('ninja_swirl')).toBe(-11);
    expect(temperatureForMode('fresh')).toBe(-11);
    expect(temperatureForMode('ninja_gelato')).toBe(-13);
    const direct13 = previewOptimization({ recipe: realStandardGelato(-13), intent: studioIntentFromRecipe(realStandardGelato(-13)) });
    const ninja13 = previewOptimization({ recipe: realStandardGelato(temperatureForMode('ninja_gelato')!), intent: studioIntentFromRecipe(realStandardGelato(temperatureForMode('ninja_gelato')!)) });
    expect(ninja13.finalDecision).toBe(direct13.finalDecision);
  });
});

/* ------------------------------------------------------------------ *
 * −13: honest real-solver outcome (never a pre-run block)             *
 * ------------------------------------------------------------------ */

describe('Track G — −13 refuses only after a real solve (no pre-run block)', () => {
  it('−13: the pipeline RUNS (tuning approved) and any refusal is a real solver verdict', () => {
    const recipe = realStandardGelato(-13);
    const view = recalc(recipe, 'home');
    // Tuning is approved (ice anchor connected) so the pipeline actually ran.
    expect(view.ran).toBe(true);
    // The residual (demo-catalog lactose sandiness) yields a VERIFIED optimizer
    // no-solution — never the pre-run 'correction_targets_not_approved' block.
    if (view.outcome === 'niemozliwe') {
      expect(view.failureReason).toBe('optimizer_no_solution');
      expect(view.outcomeDetail).toContain('Receptura nie została zmieniona.');
    }
    expect(view.failureReason).not.toBe('correction_targets_not_approved');
  });
});

/* ------------------------------------------------------------------ *
 * Structured failure classification (owner taxonomy)                  *
 * ------------------------------------------------------------------ */

describe('Track G — only a verified, target-aligned optimizer failure is infeasibility', () => {
  const base = (over: Partial<PiRecalculationRunnerResult>): PiRecalculationRunnerResult => ({
    category: 'milk_gelato', servingTemperatureC: -12,
    beforeMetrics: { pod: 15, iceFraction: 50, fat: 8, solids: 38 },
    afterMetrics: null, decision: 'impossible', rerunState: 'solver_no_correction',
    solverTargetAligned: true,
    rerunNewFailures: [], rerunWorsenedFailures: [], proposedAdjustments: [],
    correctedRecipeSnapshot: null, warnings: [], hardBlockers: [], ...over,
  });
  const run = (over: Partial<PiRecalculationRunnerResult>) =>
    recalculateWithPi({
      baseIntent: piBaseIntentFromRecipe(realStandardGelato(-12)),
      recipeDraft: {}, axisIntents: NEUTRAL_AXIS_INTENTS, resolution: RESOLVED,
      persona: 'home', runner: () => base(over),
    });

  it('verified + aligned → optimizer_no_solution (the only genuine infeasibility)', () => {
    const view = run({});
    expect(view.outcome).toBe('niemozliwe');
    expect(view.failureReason).toBe('optimizer_no_solution');
  });

  it('verified but NOT target-aligned → correction_targets_not_connected, honest block', () => {
    const view = run({ solverTargetAligned: false });
    expect(view.outcome).toBe('zablokowane');
    expect(view.failureReason).toBe('correction_targets_not_connected');
    expect(view.outcomeDetail).toContain('Receptura nie została zmieniona.');
  });

  it('impossible from an unverified state → constraint_verification_failed, never math', () => {
    const view = run({ rerunState: 'rerun_incomplete', hardBlockers: ['missing_base_engine_metrics'] });
    expect(view.outcome).toBe('zablokowane');
    expect(view.failureReason).toBe('constraint_verification_failed');
    expect(view.outcomeDetail).not.toContain('missing_base_engine_metrics');
  });

  it('optimizer-blocked routing → profile_not_supported', () => {
    const view = run({ decision: 'blocked', rerunState: 'blocked', hardBlockers: ['optimizer_blocked'] });
    expect(view.outcome).toBe('zablokowane');
    expect(view.failureReason).toBe('profile_not_supported');
  });

  it('unresolved ingredients → ingredient_not_engine_ready (pipeline never runs)', () => {
    const throwing: PiRecalculationRunner = () => { throw new Error('must not run'); };
    const view = recalculateWithPi({
      baseIntent: piBaseIntentFromRecipe(realStandardGelato(-11)),
      recipeDraft: {}, axisIntents: NEUTRAL_AXIS_INTENTS,
      resolution: { allResolved: false, unresolvedCount: 2, unresolvedNames: ['a', 'b'] },
      persona: 'home', runner: throwing,
    });
    expect(view.ran).toBe(false);
    expect(view.failureReason).toBe('ingredient_not_engine_ready');
  });
});

/* ------------------------------------------------------------------ *
 * Demo / Home / Pro: one canonical calculation, redaction after it    *
 * ------------------------------------------------------------------ */

describe('Track G — Demo / Home / Pro share the same canonical calculation', () => {
  it('the engine decision and failure reason are persona-independent (−13 residual)', () => {
    const demo = recalc(realStandardGelato(-13), 'demo');
    const home = recalc(realStandardGelato(-13), 'home');
    const pro = recalc(realStandardGelato(-13), 'pro');
    for (const other of [home, pro]) {
      expect(other.outcome).toBe(demo.outcome);
      expect(other.failureReason).toBe(demo.failureReason);
      expect(other.outcomeDetail).toBe(demo.outcomeDetail);
    }
    const positions = (v: ReturnType<typeof recalc>) => v.before.map((r) => `${r.id}:${r.position}`);
    expect(positions(home)).toEqual(positions(demo));
  });

  it('Demo carries NO exact grams: no adjustments, no numeric readings, no corrected snapshot', () => {
    const demo = recalc(realStandardGelato(-12), 'demo');
    expect(demo.gramsVisible).toBe(false);
    expect(demo.proposedAdjustments).toBeUndefined();
    expect(demo.correctedRecipeSnapshot).toBeNull();
    for (const reading of [...demo.before, ...(demo.after ?? [])]) {
      expect(reading.value).toBeUndefined();
      expect(reading.band).toBeUndefined();
    }
  });

  it('Home receives numeric readings for the same recipe (redaction is presentation-side only)', () => {
    const home = recalc(realStandardGelato(-12), 'home');
    expect(home.gramsVisible).toBe(true);
    expect(home.before.some((r) => typeof r.value === 'number')).toBe(true);
  });
});
