/// <reference types="node" />
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SPINE_CONTRACT_VERSION, type NormalizedRecipeIntent } from '@/spine';
import { PiMonitorPanel } from './PiMonitorPanel';
import { evaluateRecalcGate, monitorRecipe, recalculateWithPi } from './piMonitor';
import {
  NEUTRAL_AXIS_INTENTS,
  type IngredientResolutionSummary,
  type PiAxisMetricValues,
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

const metrics: PiAxisMetricValues = { pod: 15, iceFraction: 60, fat: 8, solids: 38 };
const RESOLVED: IngredientResolutionSummary = { allResolved: true, unresolvedCount: 0, unresolvedNames: [] };

const runnerResult: PiRecalculationRunnerResult = {
  category: 'milk_gelato',
  servingTemperatureC: -11,
  beforeMetrics: metrics,
  afterMetrics: { pod: 15, iceFraction: 50, fat: 8, solids: 38 },
  decision: 'optimized',
  rerunNewFailures: [],
  rerunWorsenedFailures: [],
  proposedAdjustments: [{ type: 'add', ingredient: 'Dextrose', grams: 41.2 }],
  correctedRecipeSnapshot: { ok: true },
  warnings: [],
  hardBlockers: [],
};
const runner: PiRecalculationRunner = () => runnerResult;

const renderFor = (persona: PiMonitorPersona, resolution = RESOLVED) => {
  const monitor = monitorRecipe({ metrics, category: 'milk_gelato', servingTemperatureC: -11, persona });
  const gate = evaluateRecalcGate(resolution);
  const result = recalculateWithPi({ baseIntent, recipeDraft: { items: [], category: 'milk_gelato' }, axisIntents: NEUTRAL_AXIS_INTENTS, resolution, persona, runner });
  return renderToStaticMarkup(
    <PiMonitorPanel monitor={monitor} axisIntents={NEUTRAL_AXIS_INTENTS} gate={gate} result={result} />,
  );
};

describe('PiMonitorPanel — customer copy + controls', () => {
  it('renders the monitor, the four axes, stepped choices and the actions', () => {
    const html = renderFor('home');
    expect(html).toContain('Monitor PI');
    expect(html).toContain('Słodycz');
    expect(html).toContain('Miękkość–twardość');
    expect(html).toContain('Kremowość–tłuszcz');
    expect(html).toContain('Pełnia–body');
    expect(html).toContain('Słodsze'); // stepped choice label (not a numeric slider)
    expect(html).toContain('Przelicz z PI');
    expect(html).toContain('Zastosuj zmiany');
    expect(html).toContain('Cofnij');
    expect(html).toContain('Dostosuj ponownie');
    expect(html).toContain('Poprawione'); // honest outcome label
    expect(html).toContain('Przed');
    expect(html).toContain('Po zmianie');
  });

  it('Home shows exact gram adjustments', () => {
    const html = renderFor('home');
    expect(html).toContain('Zmiany dawek');
    expect(html).toContain('Dextrose');
    expect(html).toContain('41.2');
  });

  it('Demo shows NO gram numbers or numeric doses anywhere', () => {
    const html = renderFor('demo');
    expect(html).toContain('Słodycz'); // qualitative axis still present
    expect(html).not.toContain('Zmiany dawek');
    expect(html).not.toContain('Dextrose');
    expect(html).not.toContain('41.2');
    expect(html).not.toContain('(zakres'); // the numeric band suffix never renders for Demo
  });

  it('blocks recalculation and shows the exact resolution copy when ingredients are unresolved', () => {
    const html = renderFor('home', { allResolved: false, unresolvedCount: 2, unresolvedNames: ['a', 'b'] });
    expect(html).toContain('Najpierw wybierz konkretny produkt dla 2 składników');
    // The Przelicz z PI button is disabled while blocked.
    expect(html).toMatch(/Przelicz z PI/);
    expect(html).toMatch(/disabled/);
  });
});
