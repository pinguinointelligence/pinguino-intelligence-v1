import { describe, expect, it } from 'vitest';
import { activeFlavorChips, createCustomerFlow } from './customerFlow';
import { buildCustomerRecipeStructure } from './recipeStructure';

/**
 * End-to-end flavor RETENTION (PART 5): a flavor recognized from inflected Polish
 * must survive into the working chips AND the recipe structure — nothing silently
 * dropped or merged, and no dose invented for it.
 */
const CASES: ReadonlyArray<[string, readonly string[]]> = [
  ['lody waniliowe z rumem i whisky', ['vanilla', 'rum', 'whisky']],
  ['wanilia, rum i whisky', ['vanilla', 'rum', 'whisky']],
  ['waniliowe z dodatkiem bazylii', ['vanilla', 'basil']],
  ['czekoladowe z wanilią i maliną', ['chocolate', 'vanilla', 'raspberry']],
];

describe('flavor retention across the customer flow', () => {
  it('keeps every recognized flavor as an active working chip', () => {
    for (const [text, expected] of CASES) {
      const chips = activeFlavorChips(createCustomerFlow({ text }));
      for (const tag of expected) expect(chips).toContain(tag);
    }
  });

  it('gives every active flavor its own structure line (none dropped/merged)', () => {
    for (const [text, expected] of CASES) {
      const flow = createCustomerFlow({ text });
      const chips = activeFlavorChips(flow);
      const structure = buildCustomerRecipeStructure(flow);
      const flavorLineTags = structure.lines
        .filter((l) => l.role === 'flavor')
        .map((l) => l.flavorTag);
      for (const tag of chips) expect(flavorLineTags).toContain(tag);
      for (const tag of expected) expect(flavorLineTags).toContain(tag);
    }
  });

  it('never resolves a flavor line to an invented dose (stays honest)', () => {
    const structure = buildCustomerRecipeStructure(
      createCustomerFlow({ text: 'lody waniliowe z rumem i whisky' }),
    );
    for (const line of structure.lines.filter((l) => l.role === 'flavor')) {
      expect(line.grams).toBeNull();
      expect(line.resolution).not.toBe('resolved');
    }
    expect(structure.fullyResolved).toBe(false);
  });
});
