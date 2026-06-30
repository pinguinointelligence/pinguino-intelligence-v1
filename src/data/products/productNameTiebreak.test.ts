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

  it('new concepts match their own synonyms only (no false positives)', () => {
    // mascarpone / condensed / mango / pineapple / lemon / coconut each map to their own concept
    expect(nameTiebreakScore('Queso Mascarpone', 'Mascarpone — Standard')).toBeGreaterThan(0);
    expect(nameTiebreakScore('Leche condensada', 'Condensed Milk')).toBeGreaterThan(0); // shares 'milk' + 'condensed'
    expect(nameTiebreakScore('Mango pulp', 'Mango — General')).toBeGreaterThan(0);
    expect(nameTiebreakScore('Piña natural', 'Pineapple — General')).toBeGreaterThan(0); // piña→pina
    expect(nameTiebreakScore('Limón', 'Lemon Sauce')).toBeGreaterThan(0);
    expect(nameTiebreakScore('Coco rallado', 'Coconut — Standard')).toBeGreaterThan(0);
    // and they do NOT cross-match
    expect(nameTiebreakScore('Mango pulp', 'Pineapple — General')).toBe(0);
    expect(nameTiebreakScore('Queso Mascarpone', 'Cream 35%')).toBe(0); // mascarpone ≠ cream
    expect(nameTiebreakScore('Coco rallado', 'Cacao puro')).toBe(0); // coco ≠ cacao/cocoa
    expect(nameTiebreakScore('Limón', 'Whole Milk')).toBe(0);
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

  it('greek yogurt outranks plain yogurt (greek concept), but never a non-yogurt', () => {
    const candidates = [
      { id: 'plain', name: 'Natural Yogurt' },
      { id: 'greek', name: 'Greek Yogurt' },
      { id: 'cream', name: 'Polish Cream 12%' },
    ];
    const ranked = rankCandidatesByName('Yogur griego natural Hacendado', candidates);
    expect(ranked[0]!.id).toBe('greek');
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score); // greek (2) > plain yogurt (1)
    expect(ranked.find((r) => r.id === 'cream')!.score).toBe(0);
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

  it('treats bitter / fondente as dark chocolate (domain synonyms)', () => {
    expect(nameTiebreakScore('Chocolate negro 72%', 'Bitter Chocolate Power 80%')).toBeGreaterThan(0);
    expect(nameTiebreakScore('Chocolate negro 72%', 'Dark Chocolate Irca Reno Fondente')).toBeGreaterThan(0);
    // but a white chocolate shares only the generic chocolate concept, not dark
    expect(nameTiebreakScore('Chocolate negro 72%', 'White Chocolate')).toBe(1);
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
