/**
 * An idea is not a recipe until every part of it has been answered.
 *
 * OWNER QA 2026-09-06: the flow reached the profile, the machine and a finished recipe
 * while elements were still unresolved. The customer met a recipe whose NAME mentioned
 * products that were never in it.
 */
import { describe, expect, it } from 'vitest';
import { blocksAdvance, resolveIdea } from './homeIdeaResolution';
import type { IntentChip } from './homeDraftStore';

const chip = (over: Partial<IntentChip>): IntentChip =>
  ({
    id: 'c1',
    label: 'banan',
    productId: 'prod-banana',
    productName: 'BANANA · Puree',
    role: 'ingredient',
    ambiguous: false,
    ...over,
  }) as IntentChip;

describe('every element needs a product, a role and an amount', () => {
  it('is ready when all three are settled', () => {
    const r = resolveIdea([chip({})], { c1: 40 });
    expect(r.ready).toBe(true);
    expect(r.unresolved).toEqual([]);
  });

  it('a term with no product is not resolved, only searched', () => {
    const r = resolveIdea([chip({ productId: null })], { c1: 40 });
    expect(r.unresolved[0]?.gaps).toContain('product');
  });

  it('an AMBIGUOUS chip counts as having no product', () => {
    // Matching several products is not the same as choosing one.
    const r = resolveIdea([chip({ ambiguous: true })], { c1: 40 });
    expect(r.unresolved[0]?.gaps).toContain('product');
  });

  it('a missing or zero amount is a gap — this is where the 0 g rows came from', () => {
    expect(resolveIdea([chip({})], {}).unresolved[0]?.gaps).toContain('amount');
    expect(resolveIdea([chip({})], { c1: 0 }).unresolved[0]?.gaps).toContain('amount');
    expect(resolveIdea([chip({})], { c1: -5 }).unresolved[0]?.gaps).toContain('amount');
  });

  it('reports every gap at once, so the customer is asked in one pass', () => {
    const r = resolveIdea([chip({ productId: null })], {});
    expect(r.unresolved[0]?.gaps).toEqual(['product', 'amount']);
  });
});

describe('the role question is asked by its own authority, not re-derived here', () => {
  it('an unstated role is a gap only for a product that genuinely needs the question', () => {
    const ambiguousRole = resolveIdea([chip({ role: null })], { c1: 40 }, new Set(['c1']));
    expect(ambiguousRole.unresolved[0]?.gaps).toContain('role');

    const settled = resolveIdea([chip({ role: null })], { c1: 40 }, new Set());
    expect(settled.ready).toBe(true);
  });
});

describe('what blocks the flow', () => {
  it('an unfinished idea blocks', () => {
    const chips = [chip({ productId: null })];
    expect(blocksAdvance(resolveIdea(chips, {}), chips)).toBe(true);
  });

  it('a finished idea does not', () => {
    const chips = [chip({})];
    expect(blocksAdvance(resolveIdea(chips, { c1: 40 }), chips)).toBe(false);
  });

  it('an EMPTY idea does not block — that is `Create my own`, not an unfinished idea', () => {
    // Blocking here would trap a customer who never named anything.
    expect(blocksAdvance(resolveIdea([], {}), [])).toBe(false);
  });

  it('one unresolved element among finished ones still blocks', () => {
    const chips = [chip({}), chip({ id: 'c2', label: 'czekolada', productId: null })];
    const r = resolveIdea(chips, { c1: 40 });
    expect(r.unresolved.map((u) => u.chipId)).toEqual(['c2']);
    expect(blocksAdvance(r, chips)).toBe(true);
  });
});
