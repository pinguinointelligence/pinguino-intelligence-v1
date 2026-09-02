/**
 * AGENT D — `/start` entitlement P0: the persona → presentation PROJECTION MATRIX.
 *
 * Pins the pure access-resolution seam `CustomerShellV1` consumes
 * (`customerShellAccessFor` / `resolveCustomerMachineGate` / `demoPaywallVisible`)
 * so the audit-proven defect — a hardcoded `'demo'` persona (54d58b1:211) that made
 * a paying Home/Pro user permanently paywalled at `/start` — can never return:
 *
 *   persona (from the REAL entitlement chain) × { grams visibility, Demo paywall,
 *   save availability, machine flow, technical details }
 *
 * Plus the FROZEN Demo redaction rule at the two `/start` data seams:
 *  - `buildCustomerRecipeView` (Demo lines carry NO grams key at all);
 *  - `recalculateWithPi` (Demo never receives proposed correction grams nor the
 *    corrected snapshot — even when the solver produced them).
 */
import { describe, expect, it } from 'vitest';
import {
  buildCustomerRecipeView,
  buildCustomerResult,
  createCustomerFlow,
  selectServingMode,
  setBatchGrams,
  setProductType,
  type CustomerPersona,
  type CustomerRecipeInput,
} from '@/features/customer-flow';
import {
  HOME_MAX_SAVED_RECIPES,
  PRO_MAX_SAVED_RECIPES,
} from '@/features/pro-core/proCoreCapabilities';
import {
  NEUTRAL_AXIS_INTENTS,
  isMonitorTuningApproved,
  piBaseIntentFromRecipe,
  realPiRecalculationRunner,
  recalculateWithPi,
  type IngredientResolutionSummary,
  type PiRecalculationRunner,
  type PiRecalculationRunnerResult,
} from '@/features/pi-monitor';
import {
  customerShellAccessFor,
  demoPaywallVisible,
  resolveCustomerMachineGate,
} from './customerShellAccess';

const PERSONAS: readonly CustomerPersona[] = ['demo', 'home', 'pro'];

/* ------------------------------------------------------------------ *
 * Persona projection matrix                                           *
 * ------------------------------------------------------------------ */

describe('customerShellAccessFor — the persona projection matrix', () => {
  it('demo: grams hidden, no save, machine-first flow, no technical details', () => {
    const a = customerShellAccessFor('demo');
    expect(a.persona).toBe('demo');
    expect(a.gramVisibility.canViewExactGrams).toBe(false);
    expect(a.save.canSaveRecipe).toBe(false);
    expect(a.save.maxSavedRecipes).toBe(0);
    expect(a.machineFlow).toBe('machine_first');
    expect(a.showsTechnicalDetails).toBe(false);
  });

  it('home: exact grams, save limited to HOME_MAX_SAVED_RECIPES, machine-first flow', () => {
    const a = customerShellAccessFor('home');
    expect(a.gramVisibility.canViewExactGrams).toBe(true);
    expect(a.save.canSaveRecipe).toBe(true);
    expect(a.save.maxSavedRecipes).toBe(HOME_MAX_SAVED_RECIPES);
    expect(HOME_MAX_SAVED_RECIPES).toBe(1); // the canonical Home limit
    expect(a.machineFlow).toBe('machine_first');
    expect(a.showsTechnicalDetails).toBe(false); // §3/§10 — professional surface only
  });

  it('pro: exact grams, unlimited saves, temperature-first flow, technical details', () => {
    const a = customerShellAccessFor('pro');
    expect(a.gramVisibility.canViewExactGrams).toBe(true);
    expect(a.save.canSaveRecipe).toBe(true);
    expect(a.save.maxSavedRecipes).toBe(PRO_MAX_SAVED_RECIPES);
    expect(PRO_MAX_SAVED_RECIPES).toBeNull(); // null = unlimited
    expect(a.machineFlow).toBe('temperature_first');
    expect(a.showsTechnicalDetails).toBe(true);
  });
});

describe('demoPaywallVisible — the paywall column of the matrix', () => {
  it('shows ONLY for a result whose view withheld grams (Demo)', () => {
    for (const persona of PERSONAS) {
      const gramsVisible = customerShellAccessFor(persona).gramVisibility.canViewExactGrams;
      expect(demoPaywallVisible({ isResultPhase: true, gramsVisible })).toBe(persona === 'demo');
      // Never outside the result phase — not even for Demo.
      expect(demoPaywallVisible({ isResultPhase: false, gramsVisible })).toBe(false);
    }
  });
});

describe('resolveCustomerMachineGate — the machine-flow column of the matrix', () => {
  const base = {
    preferenceStatus: 'ready' as const,
    hasUsableProfileMachine: false,
    machineChangeOpen: false,
  };

  it("pro (temperature-first) is 'off' regardless of any saved machine", () => {
    const flow = customerShellAccessFor('pro').machineFlow;
    expect(resolveCustomerMachineGate({ ...base, machineFlow: flow })).toBe('off');
    expect(
      resolveCustomerMachineGate({ ...base, machineFlow: flow, hasUsableProfileMachine: true }),
    ).toBe('off');
    expect(
      resolveCustomerMachineGate({ ...base, machineFlow: flow, preferenceStatus: 'loading' }),
    ).toBe('off');
  });

  it('demo and home are machine-first: onboarding without a machine, saved with one', () => {
    for (const persona of ['demo', 'home'] as const) {
      const flow = customerShellAccessFor(persona).machineFlow;
      expect(resolveCustomerMachineGate({ ...base, machineFlow: flow })).toBe('onboarding');
      expect(
        resolveCustomerMachineGate({ ...base, machineFlow: flow, hasUsableProfileMachine: true }),
      ).toBe('saved');
      expect(
        resolveCustomerMachineGate({ ...base, machineFlow: flow, preferenceStatus: 'loading' }),
      ).toBe('loading');
      // An explicit „Zmień maszynę” re-opens onboarding even with a saved machine.
      expect(
        resolveCustomerMachineGate({
          ...base,
          machineFlow: flow,
          hasUsableProfileMachine: true,
          machineChangeOpen: true,
        }),
      ).toBe('onboarding');
    }
  });
});

/* ------------------------------------------------------------------ *
 * FROZEN Demo redaction — recipe view (grams never enter the payload) *
 * ------------------------------------------------------------------ */

const RECIPE: CustomerRecipeInput = {
  recipeId: 'preview-gelato',
  title: 'Malina · Gelato',
  productType: 'gelato',
  lines: [
    { ingredientId: 'milk', ingredientName: 'Mleko', grams: 620 },
    { ingredientId: 'cream', ingredientName: 'Śmietanka', grams: 110 },
    { ingredientId: 'sugar', ingredientName: 'Cukier', grams: 150 },
  ],
};

describe('FROZEN product rule — Demo recipe-view redaction at source', () => {
  it('demo: gramsVisible false and NO line carries a grams key at all', () => {
    const view = buildCustomerRecipeView(RECIPE, customerShellAccessFor('demo').gramVisibility);
    expect(view.gramsVisible).toBe(false);
    for (const line of view.lines) {
      expect(Object.hasOwn(line, 'grams')).toBe(false);
    }
    // Belt & braces: no digit bound to a gram value anywhere in the payload.
    expect(JSON.stringify(view.lines)).not.toMatch(/\d/);
  });

  it('home and pro: the SAME recipe carries the exact grams', () => {
    for (const persona of ['home', 'pro'] as const) {
      const view = buildCustomerRecipeView(RECIPE, customerShellAccessFor(persona).gramVisibility);
      expect(view.gramsVisible).toBe(true);
      expect(view.lines.map((l) => l.grams)).toEqual([620, 110, 150]);
    }
  });
});

/* ------------------------------------------------------------------ *
 * FROZEN Demo redaction — correction grams (the Monitor recalc seam)  *
 * ------------------------------------------------------------------ */

const RESOLVED: IngredientResolutionSummary = {
  allResolved: true,
  unresolvedCount: 0,
  unresolvedNames: [],
};

/** A REAL calculated /start flow (the same shape PiMonitorSection receives). */
const calculatedStartRecipeInput = () => {
  let s = createCustomerFlow({ text: 'lody waniliowe' });
  s = setProductType(s, 'gelato');
  s = selectServingMode(s, 'temp_minus_12');
  s = setBatchGrams(s, 1000);
  const result = buildCustomerResult(s);
  expect(result.calculated).toBe(true);
  expect(result.recipeInput).not.toBeNull();
  return result.recipeInput!;
};

describe('FROZEN product rule — Demo never receives exact correction grams', () => {
  // The solver PRODUCED exact gram corrections — redaction must strip them for Demo.
  const solved = (): PiRecalculationRunnerResult => ({
    category: 'milk_gelato',
    servingTemperatureC: -11,
    beforeMetrics: { pod: 15, iceFraction: 60, fat: 8, solids: 38 },
    afterMetrics: { pod: 15, iceFraction: 50, fat: 8, solids: 38 },
    decision: 'optimized',
    rerunState: 'rerun_complete',
    solverTargetAligned: true,
    rerunNewFailures: [],
    rerunWorsenedFailures: [],
    proposedAdjustments: [{ type: 'add', ingredient: 'Dekstroza', grams: 41.2 }],
    correctedRecipeSnapshot: { items: [{ id: 'dextrose', grams: 41.2 }] },
    warnings: [],
    hardBlockers: [],
  });
  const runner: PiRecalculationRunner = () => solved();

  const run = (persona: CustomerPersona) =>
    recalculateWithPi({
      baseIntent: piBaseIntentFromRecipe(calculatedStartRecipeInput()),
      recipeDraft: {},
      axisIntents: NEUTRAL_AXIS_INTENTS,
      resolution: RESOLVED,
      persona,
      tuningApproved: true,
      runner,
    });

  it('demo: no proposedAdjustments, no corrected snapshot, no 41.2 anywhere', () => {
    const view = run('demo');
    expect(view.ran).toBe(true);
    expect(view.gramsVisible).toBe(false);
    expect(view.proposedAdjustments).toBeUndefined();
    expect(view.correctedRecipeSnapshot).toBeNull();
    const json = JSON.stringify(view);
    expect(json).not.toContain('41.2');
    expect(json.toLowerCase()).not.toContain('dekstroza');
  });

  it('home and pro: the SAME run carries the exact correction grams (control)', () => {
    for (const persona of ['home', 'pro'] as const) {
      const view = run(persona);
      expect(view.gramsVisible).toBe(true);
      expect(view.proposedAdjustments).toEqual([
        { type: 'add', ingredient: 'Dekstroza', grams: 41.2 },
      ]);
      expect(view.correctedRecipeSnapshot).not.toBeNull();
    }
  });

  it('demo through the REAL runner on the REAL /start recipe leaks no adjustment grams', () => {
    const recipeInput = calculatedStartRecipeInput();
    const view = recalculateWithPi({
      baseIntent: piBaseIntentFromRecipe(recipeInput),
      recipeDraft: recipeInput,
      axisIntents: NEUTRAL_AXIS_INTENTS,
      resolution: RESOLVED,
      persona: 'demo',
      tuningApproved: isMonitorTuningApproved(recipeInput.category, recipeInput.target_temperature_c),
      runner: realPiRecalculationRunner,
    });
    expect(view.gramsVisible).toBe(false);
    expect(view.proposedAdjustments).toBeUndefined();
    expect(view.correctedRecipeSnapshot).toBeNull();
    // No numeric axis readings either — Demo is qualitative only.
    for (const reading of view.before) {
      expect(reading.value).toBeUndefined();
      expect(reading.band).toBeUndefined();
    }
  });
});
