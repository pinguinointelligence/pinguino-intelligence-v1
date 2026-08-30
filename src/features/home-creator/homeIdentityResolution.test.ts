import { describe, expect, it } from 'vitest';
import type { SafeMapperSearchRow } from '@/services/productPicker/mapperSearch';
import { resolveIdentity, scoreCandidate } from './homeIdentityResolution';

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
