/**
 * Track G — customer Monitor PI recalculation: temperature routing, honest
 * structured failure states, and persona-equal canonical calculation.
 *
 * Evidence base (2026-07-18): TARGET_BANDS seed all 12 profile × temperature
 * cells (CONFIG 0.6.0, commit 70fcbd7) and the Monitor/solver aims at the
 * recipe's own cell — but the engine ice-fraction model has exactly ONE seeded
 * anchor row (milk_gelato @ −11, `src/engine/config/iceAnchors.ts`), so the
 * approved G17/G18 anchors land out of the approved ice bands through the real
 * engine at −12/−13. Interactive tuning is therefore HONESTLY UNAVAILABLE at
 * −12/−13 pending external scientific calibration (`monitorTuningApproval.ts`),
 * and no integration/data state may ever present as mathematical infeasibility.
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
  TUNING_NOT_APPROVED_COPY,
  type IngredientResolutionSummary,
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
  opts: { runner?: PiRecalculationRunner; tuningApproved?: boolean } = {},
) =>
  recalculateWithPi({
    baseIntent: piBaseIntentFromRecipe(recipe),
    recipeDraft: recipe,
    axisIntents: NEUTRAL_AXIS_INTENTS,
    resolution: RESOLVED,
    persona,
    ...(opts.tuningApproved !== undefined ? { tuningApproved: opts.tuningApproved } : {}),
    runner: opts.runner ?? realPiRecalculationRunner,
  });

/* ------------------------------------------------------------------ *
 * Six-mode temperature routing + approval matrix (owner test matrix)  *
 * ------------------------------------------------------------------ */

describe('Track G — six-mode routing inherits the verified temperature cells', () => {
  const EXPECTED: Record<string, { temp: number; tuningApproved: boolean }> = {
    temp_minus_11: { temp: -11, tuningApproved: true },
    temp_minus_12: { temp: -12, tuningApproved: false },
    temp_minus_13: { temp: -13, tuningApproved: false },
    fresh: { temp: -11, tuningApproved: true },
    ninja_gelato: { temp: -13, tuningApproved: false },
    ninja_swirl: { temp: -11, tuningApproved: true },
  };

  for (const mode of SERVING_MODES) {
    const expected = EXPECTED[mode.id];
    if (!expected) throw new Error(`missing expectation for mode ${mode.id}`);
    it(`${mode.id} → ${expected.temp}°C, tuning ${expected.tuningApproved ? 'approved' : 'honestly unavailable'}`, () => {
      const temp = temperatureForMode(mode.id);
      expect(temp).toBe(expected.temp);
      expect(isMonitorTuningApproved(temp!)).toBe(expected.tuningApproved);
    });
  }

  it('Ninja Gelato and temp_minus_13 share the exact same engine route (decision equality)', () => {
    const direct = previewOptimization({ recipe: realStandardGelato(-13), intent: studioIntentFromRecipe(realStandardGelato(-13)) });
    const ninjaTemp = temperatureForMode('ninja_gelato')!;
    const ninja = previewOptimization({ recipe: realStandardGelato(ninjaTemp), intent: studioIntentFromRecipe(realStandardGelato(ninjaTemp)) });
    expect(ninja.finalDecision).toBe(direct.finalDecision);
    expect(ninja.rerunState).toBe(direct.rerunState);
  });
});

/* ------------------------------------------------------------------ *
 * −11: the approved cell recalculates cleanly through the real path   *
 * ------------------------------------------------------------------ */

describe('Track G — −11 (and Świeże/Ninja Swirl) recalculate through the canonical path', () => {
  it('−11: honest success outcome, no failure reason', () => {
    const view = recalc(realStandardGelato(-11), 'home');
    expect(view.ran).toBe(true);
    expect(view.outcome).toBe('juz_w_zakresie');
    expect(view.failureReason).toBeNull();
  });

  it('customer runner and Studio previewOptimization agree for the identical RecipeInput', () => {
    const recipe = realStandardGelato(-11);
    const studio = previewOptimization({ recipe, intent: studioIntentFromRecipe(recipe) });
    const viaRunner = realPiRecalculationRunner({ intent: studioIntentFromRecipe(recipe), recipeDraft: recipe });
    expect(viaRunner.decision).toBe(studio.finalDecision);
    expect(viaRunner.rerunState).toBe(studio.rerunState);
    expect(viaRunner.beforeMetrics.pod).toBe(studio.beforeMetrics.pod);
    expect(viaRunner.beforeMetrics.iceFraction).toBe(studio.beforeMetrics.iceFraction);
  });
});

/* ------------------------------------------------------------------ *
 * −12/−13: honest structured availability, never a false "impossible" *
 * ------------------------------------------------------------------ */

describe('Track G — −12/−13 are honestly limited pending scientific calibration', () => {
  for (const temp of [-12, -13] as const) {
    it(`${temp}: the customer path never runs the unvalidated cell and shows the owner copy`, () => {
      const throwingRunner: PiRecalculationRunner = () => {
        throw new Error('the pipeline must not run on an unapproved tuning cell');
      };
      const view = recalc(realStandardGelato(temp), 'home', {
        runner: throwingRunner,
        tuningApproved: isMonitorTuningApproved(temp),
      });
      expect(view.ran).toBe(false);
      expect(view.failureReason).toBe('correction_targets_not_approved');
      expect(view.outcomeDetail).toContain(TUNING_NOT_APPROVED_COPY);
      expect(view.outcomeDetail).toContain('Receptura nie została zmieniona.');
      // Never the old generic refusal.
      expect(view.outcomeLabel).not.toBe('Nie da się bezpiecznie przeliczyć');
    });

    it(`${temp}: no-mutation-on-failure — the recipe draft is untouched`, () => {
      const recipe = realStandardGelato(temp);
      const snapshot = JSON.parse(JSON.stringify(recipe));
      recalc(recipe, 'home', { tuningApproved: false });
      // Default-path run too (Studio/dev callers without the flag).
      recalc(recipe, 'home');
      expect(JSON.parse(JSON.stringify(recipe))).toEqual(snapshot);
    });
  }

  it('−12 without the customer flag (Studio/dev): a VERIFIED no-solution classifies as optimizer_no_solution', () => {
    const view = recalc(realStandardGelato(-12), 'home');
    expect(view.ran).toBe(true);
    expect(view.outcome).toBe('niemozliwe');
    expect(view.failureReason).toBe('optimizer_no_solution');
    expect(view.outcomeDetail).toContain('-12°C');
    expect(view.outcomeDetail).toContain('Receptura nie została zmieniona.');
  });
});

/* ------------------------------------------------------------------ *
 * Structured failure classification (owner taxonomy)                  *
 * ------------------------------------------------------------------ */

describe('Track G — only a verified, target-aligned optimizer failure is infeasibility', () => {
  const base = (over: Partial<PiRecalculationRunnerResult>): PiRecalculationRunnerResult => ({
    category: 'milk_gelato', servingTemperatureC: -11,
    beforeMetrics: { pod: 15, iceFraction: 50, fat: 8, solids: 38 },
    afterMetrics: null, decision: 'impossible', rerunState: 'solver_no_correction',
    solverTargetAligned: true,
    rerunNewFailures: [], rerunWorsenedFailures: [], proposedAdjustments: [],
    correctedRecipeSnapshot: null, warnings: [], hardBlockers: [], ...over,
  });
  const run = (over: Partial<PiRecalculationRunnerResult>) =>
    recalc({} as RecipeInput, 'home', { runner: () => base(over) });

  it('verified + aligned → optimizer_no_solution (the only genuine infeasibility)', () => {
    const view = run({});
    expect(view.outcome).toBe('niemozliwe');
    expect(view.failureReason).toBe('optimizer_no_solution');
  });

  it('verified but NOT target-aligned → correction_targets_not_connected, honest block', () => {
    const view = run({ solverTargetAligned: false });
    expect(view.outcome).toBe('zablokowane');
    expect(view.failureReason).toBe('correction_targets_not_connected');
    expect(view.outcomeDetail).toContain(TUNING_NOT_APPROVED_COPY);
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
    const throwingRunner: PiRecalculationRunner = () => {
      throw new Error('must not run');
    };
    const view = recalculateWithPi({
      baseIntent: piBaseIntentFromRecipe(realStandardGelato(-11)),
      recipeDraft: {},
      axisIntents: NEUTRAL_AXIS_INTENTS,
      resolution: { allResolved: false, unresolvedCount: 2, unresolvedNames: ['a', 'b'] },
      persona: 'home',
      runner: throwingRunner,
    });
    expect(view.ran).toBe(false);
    expect(view.failureReason).toBe('ingredient_not_engine_ready');
  });
});

/* ------------------------------------------------------------------ *
 * Demo / Home / Pro: one canonical calculation, redaction after it    *
 * ------------------------------------------------------------------ */

describe('Track G — Demo / Home / Pro share the same canonical calculation', () => {
  it('the engine decision and failure reason are persona-independent', () => {
    const recipe = () => realStandardGelato(-12);
    const demo = recalc(recipe(), 'demo');
    const home = recalc(recipe(), 'home');
    const pro = recalc(recipe(), 'pro');
    for (const other of [home, pro]) {
      expect(other.outcome).toBe(demo.outcome);
      expect(other.failureReason).toBe(demo.failureReason);
      expect(other.outcomeDetail).toBe(demo.outcomeDetail);
    }
    const positions = (v: ReturnType<typeof recalc>) => v.before.map((r) => `${r.id}:${r.position}`);
    expect(positions(home)).toEqual(positions(demo));
    expect(positions(pro)).toEqual(positions(demo));
  });

  it('Demo carries NO exact grams: no adjustments, no numeric readings, no corrected snapshot', () => {
    const demo = recalc(realStandardGelato(-11), 'demo');
    expect(demo.gramsVisible).toBe(false);
    expect(demo.proposedAdjustments).toBeUndefined();
    expect(demo.correctedRecipeSnapshot).toBeNull();
    for (const reading of [...demo.before, ...(demo.after ?? [])]) {
      expect(reading.value).toBeUndefined();
      expect(reading.band).toBeUndefined();
    }
  });

  it('Home receives numeric readings for the same recipe (redaction is presentation-side only)', () => {
    const home = recalc(realStandardGelato(-11), 'home');
    expect(home.gramsVisible).toBe(true);
    expect(home.before.some((r) => typeof r.value === 'number')).toBe(true);
  });
});
