import { describe, expect, it } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import { proposeCorrections, type LockType, type RecipeInput, type RecipeItem } from '@/engine';
import { buildCorrectionView } from './correctionView';

const line = (id: string, planned: number, lock: LockType = 'unlocked'): RecipeItem => ({
  id: `l-${id}`,
  ingredient: findDemoIngredient(id)!,
  planned_grams: planned,
  actual_grams: null,
  lock_type: lock,
});

// A conventional milk base — under the current config its NPAC lands too low,
// so the solver always has something to propose (same as the golden milk base).
const milkBase: RecipeInput = {
  items: [
    line('milk_3_5', 670),
    line('cream_30', 130),
    line('smp', 35),
    line('sucrose', 130),
    line('dextrose', 30),
    line('tara_gum', 5),
  ],
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
};

const deepNumbers = (value: unknown, found: number[] = []): number[] => {
  if (typeof value === 'number') found.push(value);
  else if (Array.isArray(value)) value.forEach((v) => deepNumbers(v, found));
  else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((v) => deepNumbers(v, found));
  }
  return found;
};

describe('buildCorrectionView — demo', () => {
  const view = buildCorrectionView(proposeCorrections({ input: milkBase, context: 'planning', redact: true }));

  it('is the demo branch with at least one proposal', () => {
    expect(view.mode).toBe('demo');
    expect(view.proposals.length).toBeGreaterThan(0);
  });

  it('contains no numbers and no ingredient names anywhere', () => {
    expect(deepNumbers(view.proposals)).toEqual([]);
    const json = JSON.stringify(view.proposals).toLowerCase();
    for (const leak of ['sucrose', 'dextrose', 'milk', 'cream', 'inulin', 'smp', 'tara', 'gram']) {
      expect(json, `leak: ${leak}`).not.toContain(leak);
    }
  });

  it('relabels into a direction + area + confidence', () => {
    if (view.mode !== 'demo') throw new Error('expected demo');
    const first = view.proposals[0]!;
    expect(first.directionText.length).toBeGreaterThan(0);
    expect(first.areaLabels.length).toBeGreaterThan(0);
    expect(first.confidenceLabel.length).toBeGreaterThan(0);
  });
});

describe('buildCorrectionView — pro', () => {
  const view = buildCorrectionView(
    proposeCorrections({ input: milkBase, context: 'planning', redact: false }),
  );

  it('is the pro branch exposing finite exact grams', () => {
    expect(view.mode).toBe('pro');
    if (view.mode !== 'pro') throw new Error('expected pro');
    const withActions = view.proposals.find((proposal) => proposal.actions.length > 0);
    expect(withActions).toBeDefined();
    for (const action of withActions!.actions) {
      expect(Number.isFinite(action.grams)).toBe(true);
      expect(action.grams).toBeGreaterThan(0);
      expect(action.name.length).toBeGreaterThan(0);
    }
  });
});
