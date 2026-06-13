import { describe, expect, it } from 'vitest';
import { copy } from '@/copy/en';
import { DEMO_PRESETS } from '@/data/demoPresets';
import { proposeCorrections } from '@/engine';
import { buildCorrectionView } from '@/features/corrections/correctionView';
import { buildRecipeInput, recipeContext } from './buildRecipeInput';

/** Ingredient-name fragments that must never appear in a redacted demo view. */
const NAME_LEAKS = [
  'sucrose',
  'dextrose',
  'milk',
  'cream',
  'inulin',
  'smp',
  'skimmed',
  'tara',
  'raspberry',
  'banana',
  'cocoa',
  'chocolate',
  'pistachio',
  'whiskey',
  'beam',
];

const deepNumbers = (value: unknown, found: number[] = []): number[] => {
  if (typeof value === 'number') found.push(value);
  else if (Array.isArray(value)) value.forEach((v) => deepNumbers(v, found));
  else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((v) => deepNumbers(v, found));
  }
  return found;
};

describe('demo scenario redaction (every preset)', () => {
  for (const preset of DEMO_PRESETS) {
    const input = buildRecipeInput(preset);
    const context = recipeContext(input);

    it(`${preset.id}: demo view has zero numbers and no ingredient names`, () => {
      const view = buildCorrectionView(proposeCorrections({ input, context, redact: true }));
      expect(view.mode).toBe('demo');
      expect(deepNumbers(view.proposals), `${preset.id} numbers`).toEqual([]);
      const json = JSON.stringify(view.proposals).toLowerCase();
      for (const leak of NAME_LEAKS) {
        expect(json, `${preset.id} leak: ${leak}`).not.toContain(leak);
      }
    });

    it(`${preset.id}: internal Pro view exposes finite grams or a tradeoff`, () => {
      const view = buildCorrectionView(proposeCorrections({ input, context, redact: false }));
      expect(view.mode).toBe('pro');
      if (view.mode !== 'pro') return;
      expect(view.proposals.length).toBeGreaterThan(0);
      for (const proposal of view.proposals) {
        const isTradeoff = proposal.kind !== 'correction';
        const hasFiniteGrams =
          proposal.actions.length > 0 &&
          proposal.actions.every((action) => Number.isFinite(action.grams) && action.grams > 0);
        expect(isTradeoff || hasFiniteGrams, `${preset.id} proposal ${proposal.id}`).toBe(true);
      }
    });
  }

  it('actual-batch rescue runs in actual_batch context (add-only rescue)', () => {
    const rescue = DEMO_PRESETS.find((preset) => preset.id === 'actual-batch-rescue')!;
    const input = buildRecipeInput(rescue);
    expect(recipeContext(input)).toBe('actual_batch');
    const view = buildCorrectionView(proposeCorrections({ input, context: 'actual_batch', redact: false }));
    if (view.mode !== 'pro') throw new Error('expected pro');
    for (const proposal of view.proposals) {
      // nothing physically added is reduced — every action is an "Add"
      for (const action of proposal.actions) {
        expect(action.verb).toBe(copy.studio.corrections.add);
      }
    }
  });
});
