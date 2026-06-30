import { describe, expect, it } from 'vitest';
import {
  conceptsFromName,
  nameTiebreakScore,
  normalizeTokens,
  rankCandidatesByName,
} from './productNameTiebreak';

describe('normalizeTokens', () => {
  it('strips accents, lowercases, and splits into word tokens', () => {
    expect(normalizeTokens('Café Molido Hacendado')).toEqual(['cafe', 'molido', 'hacendado']);
    expect(normalizeTokens('Almendra molida')).toEqual(['almendra', 'molida']);
    expect(normalizeTokens('Kéfir natural')).toEqual(['kefir', 'natural']);
  });
});

describe('conceptsFromName', () => {
  it('maps Spanish/English tokens to canonical concepts', () => {
    expect([...conceptsFromName('Leche entera Hacendado')]).toContain('milk');
    expect([...conceptsFromName('Nata para montar')]).toContain('cream');
    expect([...conceptsFromName('Almendra molida')]).toContain('almond');
    expect([...conceptsFromName('Edulcorante granulado stevia')].sort()).toEqual(['stevia', 'sweetener']);
    expect([...conceptsFromName('Chocolate negro 72%')].sort()).toEqual(['chocolate', 'dark']);
  });
});

describe('nameTiebreakScore — false-positive avoidance', () => {
  it('shares a concept for true synonyms', () => {
    expect(nameTiebreakScore('Leche entera', 'Whole Milk')).toBeGreaterThan(0);
    expect(nameTiebreakScore('Almendra molida', 'Almond Paste')).toBeGreaterThan(0);
    expect(nameTiebreakScore('Crema de cacahuete', 'Peanut Paste')).toBeGreaterThan(0);
  });

  it('scores 0 for unrelated names (no signal, never a false positive)', () => {
    expect(nameTiebreakScore('Leche entera', 'Dark Chocolate 70%')).toBe(0);
    expect(nameTiebreakScore('Edulcorante stevia', 'Whole Milk')).toBe(0);
  });

  it('never conflates two DIFFERENT specific concepts (almond ≠ hazelnut, peanut ≠ pistachio)', () => {
    expect(nameTiebreakScore('Almendra natural', 'Avellana tostada')).toBe(0);
    expect(nameTiebreakScore('Crema de cacahuete', 'Pasta de pistacho')).toBe(0);
  });
});

describe('rankCandidatesByName', () => {
  it('ranks by shared concepts; unrelated candidates score 0', () => {
    const candidates = [
      { id: 'choc', name: 'Dark Chocolate' },
      { id: 'milk', name: 'Whole Milk' },
      { id: 'cream', name: 'Cream 35%' },
    ];
    const ranked = rankCandidatesByName('Leche entera Hacendado', candidates);
    expect(ranked[0]!.id).toBe('milk');
    expect(ranked[0]!.score).toBe(1);
    expect(ranked.find((r) => r.id === 'choc')!.score).toBe(0);
  });

  it('distinguishes dark vs white chocolate while both share the chocolate concept', () => {
    const candidates = [
      { id: 'white', name: 'Chocolate blanco' },
      { id: 'dark', name: 'Chocolate negro 70%' },
    ];
    const ranked = rankCandidatesByName('Chocolate negro 72% cacao', candidates);
    expect(ranked[0]!.id).toBe('dark');
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it('is stable on ties (original order preserved)', () => {
    const candidates = [
      { id: 'a', name: 'Plain Sugar' },
      { id: 'b', name: 'Glucose Syrup' },
    ];
    const ranked = rankCandidatesByName('Leche entera', candidates);
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b']); // both score 0, order kept
  });
});
