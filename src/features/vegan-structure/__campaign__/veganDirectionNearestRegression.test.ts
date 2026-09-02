/**
 * Deterministic repro for the two ok:false Direction states the 1800-state
 * matrix found. Both must degrade to a truthful NEAREST preview, never to a
 * dead end (P1-A / RC-2 principle).
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeDirectionTarget } from '@/engine';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';
import { buildVeganCampaignInput, OWNER_PRICES } from './veganCampaignInput';

const CASES = [
  { id: 'R12', temperature: -11 as const, sweetness: -1, softness: 0 },
  { id: 'R13', temperature: -11 as const, sweetness: -1, softness: -2 },
];

describe('Vegan Direction ok:false repro', () => {
  it.each(CASES)('$id sweetness $sweetness / softness $softness', (c) => {
    const input = buildVeganCampaignInput(c.id, c.temperature, 'optimal', {
      sweetness: c.sweetness as RecipeDirectionTarget,
      softness: c.softness as RecipeDirectionTarget,
    });
    const startingViolations = detectViolations(calculateRecipe(input));
    const built = buildOptimizePreview(input, { byLineId: {} }, '2026-08-23T00:00:00.000Z', {
      effectivePriceOverrides: OWNER_PRICES,
    });
    // Diagnostics first — these print even when the assertion below fails.
    console.log(
      `${c.id} startingViolations=${startingViolations.length} [${startingViolations.map((v) => `${v.metric}:${v.direction}`).join('|')}] ok=${built.ok} code=${built.ok ? '-' : built.code}`,
    );
    expect(built.ok, `${c.id} must produce a preview, not a dead end`).toBe(true);
    if (built.ok) {
      expect(built.preview.proposedInput.items.filter((i) => i.planned_grams === 0)).toEqual([]);
      expect(detectViolations(calculateRecipe(built.preview.proposedInput))).toEqual([]);
    }
  });
});
