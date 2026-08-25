import { describe, expect, it } from 'vitest';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { internalCategoryFor, type VisibleProductType } from '@/features/studio/productType';
import { classifyProfileTransition, PRO_VISIBLE_PRODUCT_TYPES } from './profileCompatibility';

const PROFILES: readonly VisibleProductType[] = ['gelato', 'protein', 'sorbet', 'vegan'];

describe('Pro profile compatibility', () => {
  it('keeps Gelato and Protein adjacent in the Pro selector', () => {
    expect(PRO_VISIBLE_PRODUCT_TYPES).toEqual(['gelato', 'protein', 'sorbet', 'vegan']);
  });

  for (const from of PROFILES) {
    for (const to of PROFILES) {
      it(`${from} → ${to} uses an approved native runtime route without changing the vector`, () => {
        const base = starterMilkBase();
        const input = {
          ...base,
          category: internalCategoryFor(from, base.items, base.category),
        };
        const before = JSON.stringify(input.items);

        const decision = classifyProfileTransition(input, to);

        expect(decision.supported).toBe(true);
        expect(JSON.stringify(input.items)).toBe(before);
        if (decision.supported) expect(decision.templateId).not.toHaveLength(0);
      });
    }
  }
});
