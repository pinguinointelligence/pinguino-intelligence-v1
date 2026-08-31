import { describe, expect, it } from 'vitest';
import {
  boundedEditDistance,
  detectProfile,
  detectStatedRole,
  normalizeIntentText,
  parseIntent,
} from './homeIntentParsing';

const concepts = (text: string) => parseIntent(text).terms.map((t) => t.concept);

describe('§25 — multilingual intent', () => {
  it('understands strawberry in every named language', () => {
    for (const word of ['strawberry', 'truskawka', 'fresa', 'Erdbeere']) {
      expect(concepts(word), word).toContain('strawberry');
    }
  });

  it('understands the whisky-cola variants', () => {
    for (const phrase of ['whisky cola', 'whiskey & coke', 'whisky z colą']) {
      const found = concepts(phrase);
      expect(found, phrase).toContain('whisky');
      expect(found, phrase).toContain('cola');
    }
  });

  it('understands the mojito misspellings the owner named', () => {
    for (const word of ['mojito', 'mochito', 'mojitto']) {
      expect(concepts(word), word).toContain('mojito');
    }
  });
});

describe('§25 — typo tolerance is bounded, not reckless', () => {
  it('recovers a long misspelling', () => {
    expect(concepts('chocolatte')).toContain('chocolate');
    expect(concepts('piastachio')).toContain('pistachio');
  });

  it('refuses to "fix" a short word into a different ingredient', () => {
    // "line" must NOT become "lime", "run" must NOT become "rum".
    expect(concepts('line')).not.toContain('lime');
    expect(concepts('run')).not.toContain('rum');
  });

  it('computes a bounded edit distance and gives up past the bound', () => {
    expect(boundedEditDistance('mojito', 'mojitto', 2)).toBe(1);
    expect(boundedEditDistance('abc', 'xyzxyz', 1)).toBeGreaterThan(1);
  });
});

describe('normalisation', () => {
  it('strips diacritics across languages', () => {
    expect(normalizeIntentText('Truskawką')).toBe('truskawka');
    expect(normalizeIntentText('Erdbeere')).toBe('erdbeere');
    expect(normalizeIntentText('piña')).toBe('pina');
  });
});

describe('§31 — profile detection', () => {
  it('detects each of the four profiles', () => {
    expect(detectProfile('mojito sorbet')).toBe('sorbet');
    expect(detectProfile('lody proteinowe')).toBe('protein');
    expect(detectProfile('vegan ice cream')).toBe('vegan');
    expect(detectProfile('gelato z wanilią')).toBe('gelato');
  });

  it('prefers the specific frozen-dessert word over the generic one', () => {
    expect(detectProfile('sorbet lody')).toBe('sorbet');
    expect(detectProfile('protein ice cream')).toBe('protein');
  });

  it('returns null when nothing was stated — so the four choices are shown', () => {
    expect(detectProfile('banana and oreo')).toBeNull();
  });

  it('never emits the profile word as an ingredient term', () => {
    expect(concepts('mango sorbet')).toEqual(['mango']);
  });
});

describe('§20 — a whole spoken sentence is the same input as typed words', () => {
  it('extracts profile, ingredients and role from one natural sentence', () => {
    const parsed = parseIntent('I want mango sorbet with raspberries and white chocolate pieces');
    expect(parsed.profile).toBe('sorbet');
    const found = parsed.terms.map((t) => t.concept);
    expect(found).toContain('mango');
    expect(found).toContain('raspberry');
    expect(found).toContain('white_chocolate');
  });

  it('keeps a compound concept whole instead of shredding it', () => {
    const found = concepts('peanut butter');
    expect(found).toContain('peanut_butter');
    expect(found).not.toContain('peanut');
  });
});

describe('§33 — explicit role', () => {
  it('marks a stated topping role on the terms', () => {
    expect(detectStatedRole('oreo as topping')).toBe('topping');
    expect(detectStatedRole('oreo posypka')).toBe('topping');
    expect(detectStatedRole('banana')).toBeNull();
    const parsed = parseIntent('oreo topping');
    expect(parsed.terms.every((t) => t.role === 'topping')).toBe(true);
  });
});

describe('§22 — understanding is not identity resolution', () => {
  it('keeps an unrecognised word as a raw term with no invented concept', () => {
    const parsed = parseIntent('kombucha');
    expect(parsed.terms).toHaveLength(1);
    expect(parsed.terms[0]?.concept).toBeNull();
    expect(parsed.terms[0]?.raw).toBe('kombucha');
  });

  it('never returns a duplicate concept for one utterance', () => {
    const found = concepts('chocolate czekolada chocolate');
    expect(found.filter((c) => c === 'chocolate')).toHaveLength(1);
  });
});
