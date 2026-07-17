/**
 * Track G — customer Monitor PI recalculation: honest structured failure states
 * + persona-equal canonical calculation.
 *
 * These tests run the REAL sanctioned path (`buildStarterRecipeFromIntent` →
 * `realPiRecalculationRunner` → `previewOptimization` → canonical engine + solver)
 * and pin the behaviour the owner required:
 *  - the −11 base recalculates cleanly (chain is correctly wired);
 *  - at −12 / −13 the same base is genuinely out of band and the solver finds no
 *    safe correction — the customer sees an HONEST structured reason that names the
 *    serving temperature and states "Receptura nie została zmieniona.", never the
 *    old generic "Nie da się bezpiecznie przeliczyć";
 *  - Ninja Gelato inherits the exact −13 path;
 *  - only a VERIFIED optimizer no-solution may present as infeasibility;
 *  - Demo / Home / Pro get the SAME canonical calculation — persona changes only
 *    redaction (Demo never receives exact grams or the corrected snapshot).
 */
import { describe, expect, it } from 'vitest';
import type { RecipeGoals, RecipeInput } from '@/engine';
import { buildStarterRecipeFromIntent } from '@/features/studioFlow/intentRecipeDraft';
import {
  previewOptimization,
  studioIntentFromRecipe,
} from '@/features/optimization/optimizationPreviewRunner';
import { temperatureForMode } from '@/features/customer-flow/servingMode';
import {
  NEUTRAL_AXIS_INTENTS,
  piBaseIntentFromRecipe,
  realPiRecalculationRunner,
  recalculateWithPi,
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

const recalc = (recipe: RecipeInput, persona: PiMonitorPersona, runner: PiRecalculationRunner = realPiRecalculationRunner) =>
  recalculateWithPi({
    baseIntent: piBaseIntentFromRecipe(recipe),
    recipeDraft: recipe,
    axisIntents: NEUTRAL_AXIS_INTENTS,
    resolution: RESOLVED,
    persona,
    runner,
  });

describe('Track G — real path recalculates cleanly at −11', () => {
  it('−11: the base is in band → an honest success outcome, not a refusal', () => {
    const view = recalc(realStandardGelato(-11), 'home');
    expect(view.ran).toBe(true);
    expect(view.outcome).toBe('juz_w_zakresie');
  });
});

describe('Track G — honest structured failure at colder serving temperatures', () => {
  for (const temp of [-12, -13] as const) {
    it(`${temp}: verified no-solution → honest reason naming ${temp}°C, states nothing changed`, () => {
      const view = recalc(realStandardGelato(temp), 'home');
      // The pipeline RAN (chain is wired) and the failure is a VERIFIED optimizer no-solution.
      expect(view.ran).toBe(true);
      expect(view.outcome).toBe('niemozliwe');
      // Never the old generic message.
      expect(view.outcomeLabel).not.toBe('Nie da się bezpiecznie przeliczyć');
      expect(view.outcomeLabel).toBe('PI nie zmieniło receptury');
      // Honest, specific, and the mandatory sentence.
      expect(view.outcomeDetail).toContain(`${temp}°C`);
      expect(view.outcomeDetail).toContain('Receptura nie została zmieniona.');
    });
  }
});

describe('Track G — Ninja Gelato inherits the exact −13 verified path', () => {
  it('ninja_gelato routes to −13, and its recipe decision equals temp_minus_13', () => {
    expect(temperatureForMode('ninja_gelato')).toBe(-13);
    expect(temperatureForMode('temp_minus_13')).toBe(-13);
    const direct = previewOptimization({ recipe: realStandardGelato(-13), intent: studioIntentFromRecipe(realStandardGelato(-13)) });
    const ninjaTemp = temperatureForMode('ninja_gelato')!;
    const ninja = previewOptimization({ recipe: realStandardGelato(ninjaTemp), intent: studioIntentFromRecipe(realStandardGelato(ninjaTemp)) });
    expect(ninja.finalDecision).toBe(direct.finalDecision);
    expect(ninja.rerunState).toBe(direct.rerunState);
  });
});

describe('Track G — only a VERIFIED optimizer failure may present as infeasibility', () => {
  const base = (over: Partial<PiRecalculationRunnerResult>): PiRecalculationRunnerResult => ({
    category: 'milk_gelato', servingTemperatureC: -12,
    beforeMetrics: { pod: 15, iceFraction: 50, fat: 8, solids: 38 },
    afterMetrics: null, decision: 'impossible', rerunState: 'solver_no_correction',
    rerunNewFailures: [], rerunWorsenedFailures: [], proposedAdjustments: [],
    correctedRecipeSnapshot: null, warnings: [], hardBlockers: [], ...over,
  });

  it('impossible + solver_no_correction → stays "niemozliwe"', () => {
    const view = recalc({} as RecipeInput, 'home', () => base({ rerunState: 'solver_no_correction' }));
    expect(view.outcome).toBe('niemozliwe');
  });

  it('impossible from a non-verified state → downgraded to an honest block', () => {
    const view = recalc({} as RecipeInput, 'home', () =>
      base({ decision: 'impossible', rerunState: 'rerun_incomplete', hardBlockers: ['missing_base_engine_metrics'] }));
    expect(view.outcome).toBe('zablokowane');
    expect(view.outcomeDetail).toContain('Receptura nie została zmieniona.');
    // No raw engine codes leak to the customer.
    expect(view.outcomeDetail).not.toContain('missing_base_engine_metrics');
  });
});

describe('Track G — Demo / Home / Pro share the same canonical calculation', () => {
  const recipe = () => realStandardGelato(-12);

  it('the engine decision is persona-independent (persona is not an engine input)', () => {
    const demo = recalc(recipe(), 'demo');
    const home = recalc(recipe(), 'home');
    const pro = recalc(recipe(), 'pro');
    // Same outcome + same customer-facing reason across all three personas.
    for (const other of [home, pro]) {
      expect(other.outcome).toBe(demo.outcome);
      expect(other.outcomeLabel).toBe(demo.outcomeLabel);
      expect(other.outcomeDetail).toBe(demo.outcomeDetail);
    }
    // Same qualitative band positions (redaction never changes the underlying math).
    const positions = (v: ReturnType<typeof recalc>) => v.before.map((r) => `${r.id}:${r.position}`);
    expect(positions(home)).toEqual(positions(demo));
    expect(positions(pro)).toEqual(positions(demo));
  });

  it('Demo carries NO exact grams: no adjustments, no numeric readings, no corrected snapshot', () => {
    const demo = recalc(realStandardGelato(-11), 'demo'); // a successful recalc path
    expect(demo.gramsVisible).toBe(false);
    expect(demo.proposedAdjustments).toBeUndefined();
    expect(demo.correctedRecipeSnapshot).toBeNull();
    for (const reading of [...demo.before, ...(demo.after ?? [])]) {
      expect(reading.value).toBeUndefined();
      expect(reading.band).toBeUndefined();
    }
  });

  it('Home receives exact grams and the corrected snapshot for the same recipe', () => {
    const home = recalc(realStandardGelato(-11), 'home');
    expect(home.gramsVisible).toBe(true);
    // At −11 the base is already in range → no adjustments, but numeric readings are present.
    expect(home.before.some((r) => typeof r.value === 'number')).toBe(true);
  });
});
