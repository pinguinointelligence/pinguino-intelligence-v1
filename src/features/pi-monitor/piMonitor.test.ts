import { describe, expect, it } from 'vitest';
import { SPINE_CONTRACT_VERSION, type NormalizedRecipeIntent } from '@/spine';
import { recalculateWithPi } from './piMonitor';
import {
  NEUTRAL_AXIS_INTENTS,
  type IngredientResolutionSummary,
  type PiAxisIntents,
  type PiMonitorPersona,
  type PiRecalculationRunner,
  type PiRecalculationRunnerResult,
} from './piMonitorContracts';

const baseIntent: NormalizedRecipeIntent = {
  productProfile: 'standard_gelato',
  qualityTier: 'classic',
  servingTemperatureC: -11,
  texturePreference: 'medium',
  sweetnessPreference: 'balanced',
  costPriority: 'balanced',
  flavorGroup: 'unknown',
  flavorTags: [],
  naturalOnly: false,
  allowBoosters: true,
  dietary: { vegan: false, lactoseFree: false, glutenFree: false, allergenAware: false, noAddedSugar: false, lowSugar: false, alcohol: false },
  constraints: { excludedIngredientIds: [], lockedIngredientIds: [], heroIngredientIds: [], batchSizeG: null, machineCapacityG: null },
  source: 'user_input',
  warnings: [],
  contractVersion: SPINE_CONTRACT_VERSION,
};

const RESOLVED: IngredientResolutionSummary = { allResolved: true, unresolvedCount: 0, unresolvedNames: [] };

// milk_gelato @ −11: pod [12,17], ice_fraction [45,54.5], fat [5,12], total_solids [31,45].
const result = (over: Partial<PiRecalculationRunnerResult> = {}): PiRecalculationRunnerResult => ({
  category: 'milk_gelato',
  servingTemperatureC: -11,
  beforeMetrics: { pod: 15, iceFraction: 60, fat: 8, solids: 38 },
  afterMetrics: { pod: 15, iceFraction: 50, fat: 8, solids: 38 },
  decision: 'optimized',
  rerunNewFailures: [],
  rerunWorsenedFailures: [],
  proposedAdjustments: [{ type: 'add', ingredient: 'Dextrose', grams: 41.2 }],
  correctedRecipeSnapshot: { ok: true },
  warnings: [],
  hardBlockers: [],
  ...over,
});

const runnerOf = (r: PiRecalculationRunnerResult): PiRecalculationRunner => () => r;

const run = (opts: {
  persona?: PiMonitorPersona;
  axisIntents?: PiAxisIntents;
  resolution?: IngredientResolutionSummary;
  runner: PiRecalculationRunner;
}) =>
  recalculateWithPi({
    baseIntent,
    recipeDraft: { items: [], category: 'milk_gelato' },
    axisIntents: opts.axisIntents ?? NEUTRAL_AXIS_INTENTS,
    resolution: opts.resolution ?? RESOLVED,
    persona: opts.persona ?? 'home',
    runner: opts.runner,
  });

describe('recalculateWithPi — honest optimized vs tradeoff', () => {
  it('optimized: labels "poprawione" and reports the axis that moved into range', () => {
    const view = run({ runner: runnerOf(result({ decision: 'optimized' })) });
    expect(view.ran).toBe(true);
    expect(view.outcome).toBe('poprawione');
    expect(view.changedAxes).toContain('miekkosc_twardosc'); // ice 60 → 50 (into range)
    expect(view.tradedOffAxes).toHaveLength(0);
  });

  it('tradeoff: labels "kompromis" and names the traded-off axis', () => {
    // Improves hardness (60→50) but pushes sweetness out of band (15→19).
    const view = run({
      runner: runnerOf(result({ decision: 'tradeoff', afterMetrics: { pod: 19, iceFraction: 50, fat: 8, solids: 38 } })),
    });
    expect(view.outcome).toBe('kompromis');
    expect(view.tradedOffAxes).toContain('slodycz');
    expect(view.changedAxes).toContain('miekkosc_twardosc');
    expect(view.outcomeDetail.toLowerCase()).toContain('kompromis');
  });

  it('no_action_needed: labels "już w zakresie" with no after column', () => {
    const view = run({ runner: runnerOf(result({ decision: 'no_action_needed', afterMetrics: null })) });
    expect(view.outcome).toBe('juz_w_zakresie');
    expect(view.after).toBeNull();
    expect(view.changedAxes).toHaveLength(0);
    expect(view.tradedOffAxes).toHaveLength(0);
  });
});

describe('recalculateWithPi — ingredient-resolution gate blocks the run', () => {
  it('does not call the runner and surfaces the exact block copy', () => {
    const throwingRunner: PiRecalculationRunner = () => {
      throw new Error('runner must not be called while blocked');
    };
    const view = run({
      resolution: { allResolved: false, unresolvedCount: 3, unresolvedNames: ['a', 'b', 'c'] },
      runner: throwingRunner,
    });
    expect(view.ran).toBe(false);
    expect(view.outcome).toBeNull();
    expect(view.after).toBeNull();
    expect(view.outcomeDetail).toContain('dla 3 składników');
  });
});

describe('recalculateWithPi — persona gating (grams)', () => {
  it('Demo: qualitative only — no gram adjustments and no numeric axis values', () => {
    const view = run({ persona: 'demo', runner: runnerOf(result()) });
    expect(view.gramsVisible).toBe(false);
    expect(view.proposedAdjustments).toBeUndefined();
    for (const reading of view.before) {
      expect(reading.value).toBeUndefined();
      expect(reading.band).toBeUndefined();
    }
  });

  it('Home: exact grams — proposed adjustments and numeric axis values present', () => {
    const view = run({ persona: 'home', runner: runnerOf(result()) });
    expect(view.gramsVisible).toBe(true);
    expect(view.proposedAdjustments?.length).toBe(1);
    expect(view.before.some((r) => typeof r.value === 'number')).toBe(true);
  });

  it('Pro: exact grams too (canonical capability)', () => {
    const view = run({ persona: 'pro', runner: runnerOf(result()) });
    expect(view.gramsVisible).toBe(true);
    expect(view.proposedAdjustments?.length).toBe(1);
  });
});
