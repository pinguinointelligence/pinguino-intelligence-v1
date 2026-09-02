import { describe, expect, it } from 'vitest';
import { VISIBLE_PRODUCT_TYPES } from '@/features/studio/productType';
import { HOME_PROFILE_ORDER, intentProfileFor, visibleProductTypeFor } from './homeProfileMapping';

describe('§31/§41 — HOME profiles are the existing product families, renamed for nobody', () => {
  it('covers exactly the canonical VisibleProductType union — no fifth profile', () => {
    expect([...HOME_PROFILE_ORDER].sort()).toEqual([...VISIBLE_PRODUCT_TYPES].sort());
  });

  it('round-trips every profile without re-pointing one', () => {
    for (const visible of VISIBLE_PRODUCT_TYPES) {
      expect(visibleProductTypeFor(intentProfileFor(visible))).toBe(visible);
    }
  });

  it('offers the four choices in the owner-listed order', () => {
    expect(HOME_PROFILE_ORDER).toEqual(['gelato', 'sorbet', 'protein', 'vegan']);
  });
});
