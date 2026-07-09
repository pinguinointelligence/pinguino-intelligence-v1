/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BatchRescueIntent } from './batchRescueRouter';
import { routeBatchRescue } from './batchRescueRouter';
import type { BaseEngineMetrics } from './evaluateTemperatureRegulator';
import { dispatchIntegrationFlow } from './integrationFlowDispatch';
import { routeRecipeIntegrationFlow, type IntegrationFlowInput } from './integrationFlowRouter';
import { routeStockShortage, type StockShortageIntent } from './stockShortageRouter';
import { SPINE_CONTRACT_VERSION, type NormalizedRecipeIntent } from './types';

const METRICS: BaseEngineMetrics = {
  npac: 40, pod: 15, iceFraction: 50, water: 60, solids: 37,
  fat: 8, lactose: 5, lactoseSanding: 7, aeratingProtein: 4, proteinShareInSolids: 10, stabilizerGrams: 5,
};

const intent = (): NormalizedRecipeIntent => ({
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
});

const recipeDesign = (): IntegrationFlowInput => ({ intent: intent(), baseEngineMetrics: METRICS });

const batchRescue = (): BatchRescueIntent => ({
  productProfile: 'standard_gelato',
  intendedServingTemperatureC: -11,
  batchSizeG: 5000,
  observation: { problem: 'too_hard' },
  constraints: { canReprocess: true, liquidAdditionPossible: true, dryAdditionPossible: true, batchAlreadyFrozen: false },
});

const stockShortage = (): StockShortageIntent => ({
  productProfile: 'sorbet',
  batchSizeG: 5000,
  observation: { shortages: [{ lineId: 'strawberry', ingredientName: 'Strawberry', correctionFamily: 'fruit', requiredG: 1000, availableG: 720 }] },
  constraints: { canScaleBatchDown: true, canReformulate: true, purchaseOrWaitPossible: true },
});

describe('dispatchIntegrationFlow — the three locked contexts', () => {
  it('recipe_design delegates VERBATIM to the existing router (default flow unchanged)', () => {
    const direct = routeRecipeIntegrationFlow(recipeDesign());
    const dispatched = dispatchIntegrationFlow({ context: 'recipe_design', recipeDesign: recipeDesign() });
    expect(dispatched.branch).toBe('recipe_design');
    expect(dispatched.decision).toBe(direct.decision);
    expect(JSON.stringify(dispatched.recipeDesign)).toBe(JSON.stringify(direct));
    expect(dispatched.batchRescue).toBeNull();
    expect(dispatched.stockShortage).toBeNull();
  });

  it('actual_batch_rescue routes to IF9 with the identical result', () => {
    const direct = routeBatchRescue(batchRescue());
    const dispatched = dispatchIntegrationFlow({ context: 'actual_batch_rescue', batchRescue: batchRescue() });
    expect(dispatched.branch).toBe('actual_batch_rescue');
    expect(JSON.stringify(dispatched.batchRescue)).toBe(JSON.stringify(direct));
    expect(dispatched.decision).toBe(direct.decision);
  });

  it('stock_shortage routes to IF10 with the identical result', () => {
    const direct = routeStockShortage(stockShortage());
    const dispatched = dispatchIntegrationFlow({ context: 'stock_shortage', stockShortage: stockShortage() });
    expect(dispatched.branch).toBe('stock_shortage');
    expect(JSON.stringify(dispatched.stockShortage)).toBe(JSON.stringify(direct));
    expect(dispatched.decision).toBe(direct.decision);
  });

  it('missing IF9 payload blocks — actual-batch data is never inferred', () => {
    const r = dispatchIntegrationFlow({ context: 'actual_batch_rescue', recipeDesign: recipeDesign() });
    expect(r.branch).toBe('none');
    expect(r.decision).toBe('blocked_missing_data');
    expect(r.blockedReason).toBe('missing_batch_rescue_payload');
    expect(r.batchRescue).toBeNull();
  });

  it('missing IF10 payload blocks — stock data is never inferred', () => {
    const r = dispatchIntegrationFlow({ context: 'stock_shortage', batchRescue: batchRescue() });
    expect(r.decision).toBe('blocked_missing_data');
    expect(r.blockedReason).toBe('missing_stock_shortage_payload');
  });

  it('missing recipe_design payload blocks', () => {
    const r = dispatchIntegrationFlow({ context: 'recipe_design' });
    expect(r.decision).toBe('blocked_missing_data');
    expect(r.blockedReason).toBe('missing_recipe_design_payload');
  });

  it('unknown context → not_supported, never remapped', () => {
    const r = dispatchIntegrationFlow({ context: 'production_planning', recipeDesign: recipeDesign() });
    expect(r.branch).toBe('none');
    expect(r.decision).toBe('not_supported');
    expect(r.blockedReason).toBe('unknown_integration_flow_context');
  });

  it('never mutates its input', () => {
    const input = { context: 'actual_batch_rescue', batchRescue: batchRescue(), stockShortage: stockShortage() };
    const snapshot = JSON.stringify(input);
    dispatchIntegrationFlow(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('is deterministic', () => {
    const run = () => dispatchIntegrationFlow({ context: 'stock_shortage', stockShortage: stockShortage() });
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

describe('integrationFlowDispatch — boundary + default-flow isolation', () => {
  const HERE = import.meta.dirname;
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const dispatchSrc = strip(readFileSync(join(HERE, 'integrationFlowDispatch.ts'), 'utf8'));
  const routerSrc = strip(readFileSync(join(HERE, 'integrationFlowRouter.ts'), 'utf8'));

  it('imports only within src/spine', () => {
    for (const match of dispatchSrc.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      expect(match[1]).toMatch(/^\.\//);
    }
  });

  it('the EXISTING router remains untouched by the wiring (no IF9/IF10 references inside it)', () => {
    expect(routerSrc.includes('batchRescue')).toBe(false);
    expect(routerSrc.includes('stockShortage')).toBe(false);
    expect(routerSrc.includes('dispatchIntegrationFlow')).toBe(false);
  });

  it('no DB / Mapper / persistence path', () => {
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(', 'fetch(']) {
      expect(dispatchSrc.includes(verb), verb).toBe(false);
    }
    expect(/mapper_basement|service_role|saveRecipe|persistRecipe/i.test(dispatchSrc)).toBe(false);
  });
});
