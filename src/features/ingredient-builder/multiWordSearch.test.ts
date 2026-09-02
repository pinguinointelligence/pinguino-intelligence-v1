/**
 * A multi-word query means ALL of its concepts, not any one of them.
 * „mleko kokosowe" is milk AND coconut — 81 milk products are not the answer.
 */
import { describe, expect, it } from 'vitest';
import { queryTokenTerms, stem } from './ingredientSearch';

/** Does this catalogue text satisfy every concept in the query? */
const matchesAll = (haystack: string, query: string): boolean =>
  queryTokenTerms(query).every((group) => group.some((term) => haystack.includes(term)));

const COCONUT_MILK = 'coconut milk coconut dry';
const MILK_2 = 'milk 2 dairy fresh';
const MILK_CHOCOLATE = 'milk chocolate chocolate';
const PISTACHIO_CHOCOLATE = 'pistachio chocolate chocolate';
const COCONUT_OIL = 'coconut oil coconut fat';

describe('multi-word query semantics', () => {
  it('resolves Polish concepts onto the canonical English catalogue', () => {
    expect(matchesAll(COCONUT_MILK, 'mleko kokosowe')).toBe(true);
  });

  it('does not let a single generic token answer a two-concept query', () => {
    expect(matchesAll(MILK_2, 'mleko kokosowe')).toBe(false);
    expect(matchesAll('whipping cream dairy', 'mleko kokosowe')).toBe(false);
    expect(matchesAll('butter dairy', 'mleko kokosowe')).toBe(false);
  });

  it('still matches the generic product for the generic query', () => {
    expect(matchesAll(MILK_2, 'mleko')).toBe(true);
  });

  it('separates milk chocolate from pistachio chocolate', () => {
    expect(matchesAll(MILK_CHOCOLATE, 'czekolada mleczna')).toBe(true);
    expect(matchesAll(MILK_CHOCOLATE, 'czekolada pistacjowa')).toBe(false);
    expect(matchesAll(PISTACHIO_CHOCOLATE, 'czekolada pistacjowa')).toBe(true);
  });

  it('handles paste and oil concepts', () => {
    expect(matchesAll('pistachio paste nut paste', 'pasta pistacjowa')).toBe(true);
    expect(matchesAll(COCONUT_OIL, 'olej kokosowy')).toBe(true);
    expect(matchesAll(COCONUT_OIL, 'mleko kokosowe')).toBe(false);
  });

  it('never turns a chocolate query into a coconut one', () => {
    // `cocoa` only looks inflected; stemming it to `coco` made it a prefix of
    // `coconut`, which quietly merged two different concepts.
    expect(stem('cocoa')).toBe('cocoa');
    expect(matchesAll(COCONUT_MILK, 'cocoa')).toBe(false);
    expect(matchesAll('cocoa butter chocolate', 'cocoa')).toBe(true);
  });
});
