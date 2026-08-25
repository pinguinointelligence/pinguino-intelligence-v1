import { describe, expect, it } from 'vitest';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { internalCategoryFor, type VisibleProductType } from '@/features/studio/productType';
import {
  classifyProfileTransition,
  PROFILE_BASE_FAMILY,
  PRO_VISIBLE_PRODUCT_TYPES,
} from './profileCompatibility';

const PROFILES: readonly VisibleProductType[] = ['gelato', 'protein', 'sorbet', 'vegan'];

describe('Pro profile compatibility', () => {
  it('keeps Gelato and Protein adjacent in the Pro selector', () => {
    expect(PRO_VISIBLE_PRODUCT_TYPES).toEqual(['gelato', 'protein', 'sorbet', 'vegan']);
  });

  it('records the nominal families and Protein dual-route contract', () => {
    expect(PROFILE_BASE_FAMILY).toEqual({
      gelato: 'dairy',
      protein: 'dairy_or_plant',
      sorbet: 'sorbet',
      vegan: 'vegan',
    });
  });

  for (const from of PROFILES) {
    for (const to of PROFILES) {
      it(`${from} → ${to} classifies same-family versus native-base replacement`, () => {
        const base = starterMilkBase();
        const input = {
          ...base,
          category: internalCategoryFor(from, base.items, base.category),
        };
        const before = JSON.stringify(input.items);

        const decision = classifyProfileTransition(input, to);

        expect(decision.supported).toBe(true);
        expect(JSON.stringify(input.items)).toBe(before);
        if (!decision.supported) return;
        expect(decision.templateId).not.toHaveLength(0);
        expect(decision.kind).toBe(
          (from === 'gelato' || from === 'protein') &&
            (to === 'gelato' || to === 'protein')
            ? 'same_family'
            : from === to
              ? 'same_family'
              : 'new_base_required',
        );
      });
    }
  }

  it('does not relabel a plant-route Protein recipe as dairy Gelato', () => {
    const base = starterMilkBase();
    const plantProtein = {
      ...base,
      category: 'protein_gelato' as const,
      goals: { ...base.goals, dietary: ['vegan' as const] },
    };

    expect(classifyProfileTransition(plantProtein, 'gelato')).toMatchObject({
      supported: true,
      kind: 'new_base_required',
    });
  });
});
