/**
 * Identity preflight (§15) and the idempotency rules that depend on it (§16).
 *
 * The property under test throughout: a WEAKER fingerprint must never merge two
 * rows when a STRONGER identity key proves they are different.
 */
import { describe, expect, it } from 'vitest';
import { parseINTIMPORT } from '@/data/products/intimport';
import { manufacturerCodeOf, planIntimportDedup } from './intimportDedup';

const CSV_HEADER =
  'Product ID,Country Code,Category,Subcategory,Product Type,Brand,Product Name Original,' +
  'Product Name English,Variant Original,Variant English,Manufacturer,Net Quantity Value,' +
  'Net Quantity Unit,Package Count,Ingredients Original,Ingredients English,Allergens,' +
  'Nutrition Basis,Energy kJ,Energy kcal,Fat g,Saturated Fat g,Carbohydrates g,Sugars g,' +
  'Fibre g,Protein g,Salt g,EAN / GTIN,Country of Origin,Professional Dosage,' +
  'Technical Parameters,Technical PDF URL,Primary Source URL,Product Status,Checked At,Notes';

/** One INTIMPORT row with only the identity-bearing columns that matter here. */
const row = (o: {
  id: string;
  name: string;
  brand?: string;
  category?: string;
  variant?: string;
  qty?: string;
  ean?: string;
  technical?: string;
}) =>
  [
    o.id,
    'PL',
    o.category ?? 'Gelato base',
    'sub',
    'retail',
    o.brand ?? 'TestBrand',
    o.name,
    '',
    o.variant ?? '',
    '',
    'TestCo',
    o.qty ?? '1',
    'kg',
    '1',
    '',
    '',
    '',
    'not_found',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    o.ean ?? '',
    '',
    '',
    o.technical ?? '',
    '',
    '',
    '',
    '',
    '',
  ].join(',');

const planOf = (rows: string[], knownIdentities?: Set<string>) =>
  planIntimportDedup(parseINTIMPORT(`${CSV_HEADER}\n${rows.join('\n')}`).candidates, {
    knownIdentities,
  });

describe('manufacturer code extraction', () => {
  it('reads the code the source printed, and invents none', () => {
    expect(manufacturerCodeOf('Kod producenta: P1237 | Linia: Speedy Trilogy')).toBe('P1237');
    expect(manufacturerCodeOf('Linia: Speedy Classic | H/C: C')).toBeNull();
    expect(manufacturerCodeOf(null)).toBeNull();
  });
});

describe('identity preflight', () => {
  it('keeps two products apart when only a stable source Product ID separates them', () => {
    // The Comprital case: identical brand, name, category and size.
    const plan = planOf([
      row({ id: 'PL-COM-P307B', name: 'LIMONE' }),
      row({ id: 'PL-COM-P1237', name: 'LIMONE' }),
    ]);
    expect(plan.rows[0]!.classification).toBe('NEW_CANONICAL_PRODUCT');
    expect(plan.rows[1]!.classification).toBe('IDENTITY_COLLISION_RESOLVED_AS_DISTINCT');
    expect(plan.rows[1]!.forceDistinct).toBe(true);
  });

  it('keeps them apart on a differing manufacturer code too', () => {
    const plan = planOf([
      row({ id: 'A', name: 'NOCCIOLA', technical: 'Kod producenta: P338 | Linia: Classic' }),
      row({ id: 'B', name: 'NOCCIOLA', technical: 'Kod producenta: P1244 | Linia: Trilogy' }),
    ]);
    expect(plan.rows[1]!.classification).toBe('IDENTITY_COLLISION_RESOLVED_AS_DISTINCT');
    expect(plan.rows[1]!.reason).toContain('Kod producenta');
  });

  it('calls two rows an exact duplicate only when a STRONG key agrees', () => {
    const plan = planOf([
      row({ id: 'A', name: 'Mleko', ean: '5901234123457' }),
      row({ id: 'B', name: 'Mleko', ean: '5901234123457' }),
    ]);
    expect(plan.rows[1]!.classification).toBe('EXACT_DUPLICATE');
  });

  it('never calls two rows duplicates merely because their names normalize alike', () => {
    // Same normalized name, nothing strong agreeing: this is not a duplicate.
    const plan = planOf([row({ id: 'A', name: 'Syrop' }), row({ id: 'B', name: 'syrop  ' })]);
    expect(plan.rows[1]!.classification).not.toBe('EXACT_DUPLICATE');
    expect(plan.rows[1]!.classification).toBe('IDENTITY_COLLISION_RESOLVED_AS_DISTINCT');
  });

  it('reports a conflict when one strong key claims two different products', () => {
    const plan = planOf([
      row({ id: 'A', name: 'Mleko', ean: '5901234123457' }),
      row({ id: 'B', name: 'Czekolada', brand: 'Inna', ean: '5901234123457' }),
    ]);
    expect(plan.rows[1]!.classification).toBe('IDENTITY_CONFLICT');
  });

  it('holds a collision for review when nothing stronger separates the rows', () => {
    // Neither row states an EAN, a code, or a source Product ID.
    const plan = planOf([row({ id: '', name: 'Baza' }), row({ id: '', name: 'Baza' })]);
    expect(plan.rows[1]!.classification).toBe('POSSIBLE_DUPLICATE_REVIEW');
    expect(plan.rows[1]!.forceDistinct).toBe(false);
  });

  it('resolves a row already in the catalogue as reuse, not creation', () => {
    const first = planOf([row({ id: 'A', name: 'Mleko' })]);
    const identity = first.rows[0]!.identity.canonicalIdentity;
    const second = planOf([row({ id: 'A', name: 'Mleko' })], new Set([identity]));
    expect(second.counts.EXISTING_CANONICAL_REUSE).toBe(1);
    expect(second.counts.NEW_CANONICAL_PRODUCT).toBe(0);
  });

  it('accounts for every row exactly once', () => {
    const plan = planOf([
      row({ id: 'A', name: 'Mleko', ean: '5901234123457' }),
      row({ id: 'B', name: 'Mleko', ean: '5901234123457' }),
      row({ id: 'C', name: 'LIMONE' }),
      row({ id: 'D', name: 'LIMONE' }),
      row({ id: 'E', name: 'Czekolada' }),
    ]);
    expect(plan.totalAccounted).toBe(plan.totalInput);
    expect(plan.totalInput).toBe(5);
  });

  it('leaves the display name untouched — identity is not presentation', () => {
    const plan = planOf([row({ id: 'A', name: 'LIMONE' }), row({ id: 'B', name: 'LIMONE' })]);
    expect(plan.rows.map((entry) => entry.displayName)).toEqual(['LIMONE', 'LIMONE']);
  });
});
