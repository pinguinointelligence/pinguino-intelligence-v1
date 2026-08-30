import { describe, expect, it } from 'vitest';
import type { SafeMapperSearchRow } from '@/services/productPicker/mapperSearch';
import {
  catalogueSearchTerms,
  isPlainForm,
  matchStem,
  resolveIdentity,
  scoreCandidate,
} from './homeIdentityResolution';

const row = (id: string, name: string): SafeMapperSearchRow => ({
  ingredient_id: id,
  ingredient_name_display: name,
  ingredient_name_internal: null,
  ingredient_category: null,
  ingredient_subcategory: null,
  vegan: null,
  dairy_free: null,
  gluten_free: null,
  contains_alcohol: null,
  approved_for_base: null,
  approved_for_engines: null,
  dataset_version: null,
});

describe('§22 — a term never becomes a guessed product', () => {
  it('reports unresolved when the catalogue knows nothing', () => {
    expect(resolveIdentity([], 'kombucha')).toEqual({ kind: 'unresolved' });
  });
});

describe('§24 — an existing canonical identity resolves on its own', () => {
  it('adopts a single catalogue identity without asking', () => {
    const result = resolveIdentity([row('PI-ING-1', 'OREO ORIGINAL')], 'oreo');
    expect(result.kind).toBe('resolved');
    if (result.kind === 'resolved') expect(result.row.ingredient_id).toBe('PI-ING-1');
  });
});

describe('§23 — materially different real products are a user choice', () => {
  it('asks when several distinct products match', () => {
    const result = resolveIdentity(
      [
        row('PI-ING-1', 'CHOCOLATE DARK 70%'),
        row('PI-ING-2', 'CHOCOLATE MILK 33%'),
        row('PI-ING-3', 'CHOCOLATE SPREAD'),
      ],
      'chocolate',
    );
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') expect(result.candidates).toHaveLength(3);
  });

  it('caps the choice list rather than showing a catalogue dump', () => {
    const many = Array.from({ length: 20 }, (_, i) => row(`PI-${i}`, `OREO VARIANT ${i}`));
    const result = resolveIdentity(many, 'oreo');
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') expect(result.candidates.length).toBeLessThanOrEqual(6);
  });
});

describe('§58 — do not ask when the answer is obvious', () => {
  it('takes the single exact name match over its longer siblings', () => {
    const result = resolveIdentity(
      [row('PI-ING-2', 'OREO CRUMBS'), row('PI-ING-1', 'OREO'), row('PI-ING-3', 'OREO CREAM')],
      'oreo',
    );
    expect(result.kind).toBe('resolved');
    if (result.kind === 'resolved') {
      expect(result.row.ingredient_id).toBe('PI-ING-1');
      expect(result.exact).toBe(true);
    }
  });

  it('still asks when two rows are BOTH exact matches', () => {
    const result = resolveIdentity([row('A', 'OREO'), row('B', 'Oreo')], 'oreo');
    expect(result.kind).toBe('ambiguous');
  });
});

describe('scoring', () => {
  it('ranks exact over prefix over contains', () => {
    expect(scoreCandidate(row('a', 'OREO'), 'oreo')).toBe(3);
    expect(scoreCandidate(row('a', 'OREO CRUMBS'), 'oreo')).toBe(2);
    expect(scoreCandidate(row('a', 'BISCUIT OREO STYLE'), 'oreo')).toBe(1);
    expect(scoreCandidate(row('a', 'VANILLA'), 'oreo')).toBe(0);
  });

  it('is diacritics-insensitive so Polish input matches catalogue names', () => {
    expect(scoreCandidate(row('a', 'TRUSKAWKA'), 'truskawką')).toBe(3);
  });
});

describe('catalogue search terms — the §25 ↔ §22 boundary', () => {
  it('tries the canonical English concept BEFORE the user’s own word', () => {
    // The catalogue is named in English; the user may type Polish. Searching the raw
    // word first found nothing for every non-English input — the bug this fixes.
    // The STEM leads: the server-side ILIKE `%strawberry%` misses STRAWBERRIES, and
    // resolution stops at the first term that returns rows.
    expect(catalogueSearchTerms({ label: 'truskawka', concept: 'strawberry' })).toEqual([
      'strawberr',
      'strawberry',
      'truskawka',
    ]);
  });

  it('spaces a snake_case concept so it can match a catalogue name', () => {
    // Only the LAST word is stemmed — `peanut butt` would be nonsense, and `butter`
    // has no plural suffix, so the phrase survives intact.
    expect(catalogueSearchTerms({ label: 'maslo orzechowe', concept: 'peanut_butter' })[0]).toBe(
      'peanut butter',
    );
  });

  it('falls back to the raw word when nothing was recognised (§22)', () => {
    expect(catalogueSearchTerms({ label: 'kombucha', concept: null })).toEqual(['kombucha']);
  });

  it('does not repeat the same term twice', () => {
    // `mango` has no plural suffix, so stem and word coincide and dedupe to one.
    expect(catalogueSearchTerms({ label: 'mango', concept: 'mango' })).toEqual(['mango']);
  });

  it('reaches a plural catalogue row that the singular ILIKE would miss', () => {
    // Proven on staging: %strawberry% = 24 rows without STRAWBERRIES;
    // %strawberr% = 26 rows with it.
    const terms = catalogueSearchTerms({ label: 'truskawka', concept: 'strawberry' });
    expect(terms[0]).toBe('strawberr');
    expect('STRAWBERRIES · FRESH FRUIT'.toLowerCase()).toContain(terms[0]);
    expect('STRAWBERRY PUR KERRY'.toLowerCase()).toContain(terms[0]);
  });

  it('drops an empty raw word rather than searching for nothing', () => {
    expect(catalogueSearchTerms({ label: '   ', concept: 'vanilla' })).toEqual(['vanilla']);
  });
});

describe('§23 ordering — the plain form is offered first', () => {
  it('puts fresh fruit ahead of a lollipop, a soda and a paste', () => {
    // Real staging rows: "truskawka" matches all of these equally well BY NAME.
    const fresh = {
      ...row('PI-ING-001553', 'STRAWBERRIES · Fresh Fruit'),
      ingredient_subcategory: 'fresh_fruit_profile',
    };
    const lollipop = row('PI-ING-002068', 'CHUPA CHUPS STRAWBERRY LOLLIPOP · Inclusion');
    const soda = row('PI-ING-001888', 'FANTA STRAWBERRY · Beverage');
    const result = resolveIdentity([lollipop, soda, fresh], 'strawberry');

    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      // Still a CHOICE — nothing was auto-adopted (§22/§23).
      expect(result.candidates.length).toBe(3);
      expect(result.candidates[0]?.ingredient_id).toBe('PI-ING-001553');
    }
  });

  it('identifies a plain form only by its subcategory, never by its name', () => {
    expect(isPlainForm(row('a', 'STRAWBERRIES · Fresh Fruit'))).toBe(false);
    expect(
      isPlainForm({ ...row('a', 'ANYTHING'), ingredient_subcategory: 'fresh_fruit_profile' }),
    ).toBe(true);
  });

  it('matches a plural catalogue name against a singular concept', () => {
    // The staging defect verbatim: STRAWBERRIES vs strawberry.
    expect(matchStem('strawberries')).toBe(matchStem('strawberry'));
    expect(matchStem('cherries')).toBe(matchStem('cherry'));
    expect(matchStem('bananas')).toBe('banana');
    expect(scoreCandidate(row('a', 'STRAWBERRIES · Fresh Fruit'), 'strawberry')).toBeGreaterThan(0);
  });

  it('never lets the plain-form nudge outrank an exact name match', () => {
    const exact = row('EXACT', 'MANGO');
    const plain = { ...row('PLAIN', 'MANGO PUREE'), ingredient_subcategory: 'fresh_fruit_profile' };
    const result = resolveIdentity([plain, exact], 'mango');
    // A single exact name match still resolves outright (§58: do not ask needlessly).
    expect(result.kind).toBe('resolved');
    if (result.kind === 'resolved') expect(result.row.ingredient_id).toBe('EXACT');
  });
});
