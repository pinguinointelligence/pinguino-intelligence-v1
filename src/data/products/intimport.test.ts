import { describe, expect, it } from 'vitest';
import {
  INTIMPORT_COLUMNS,
  intimportIdentityKey,
  intimportNumber,
  intimportText,
  isMissingValue,
  mapIntimportRow,
  normalizeNutritionBasis,
  parseINTIMPORT,
  type IntimportColumn,
  canonicalProductName,
} from './intimport';
import { parseIntake } from '@/pages/destinations/productImportController';

/** Build a valid one-row INTIMPORT file from field overrides. */
const row = (overrides: Partial<Record<IntimportColumn, string>> = {}): Record<string, string> => {
  const base = Object.fromEntries(
    INTIMPORT_COLUMNS.map((column) => [column, 'not_found']),
  ) as Record<IntimportColumn, string>;
  return {
    ...base,
    'Product ID': 'PL-TEST-0001',
    'Country Code': 'PL',
    Brand: 'Testowa Marka',
    'Product Name Original': 'Produkt testowy',
    'Net Quantity Value': '500',
    'Net Quantity Unit': 'g',
    ...overrides,
  };
};

const quote = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const csv = (rows: readonly Record<string, string>[], bom = false): string => {
  const header = INTIMPORT_COLUMNS.map(quote).join(',');
  const body = rows.map((r) => INTIMPORT_COLUMNS.map((c) => quote(r[c] ?? '')).join(','));
  return `${bom ? '﻿' : ''}${[header, ...body].join('\n')}`;
};

describe('INTIMPORT contract', () => {
  it('declares exactly the 36 official columns in official order', () => {
    expect(INTIMPORT_COLUMNS).toHaveLength(36);
    expect(INTIMPORT_COLUMNS[0]).toBe('Product ID');
    expect(INTIMPORT_COLUMNS[27]).toBe('EAN / GTIN');
    expect(INTIMPORT_COLUMNS[35]).toBe('Notes');
    expect(new Set(INTIMPORT_COLUMNS).size).toBe(36);
  });

  it('accepts the official header with zero unknown-column warnings', () => {
    const result = parseINTIMPORT(csv([row()]));
    expect(result.headerOk).toBe(true);
    expect(result.missingColumns).toEqual([]);
    expect(result.unexpectedColumns).toEqual([]);
    expect(result.candidates[0]!.warnings.join(' ')).not.toContain('unknown column');
  });

  it('reports a header that does not match the contract instead of guessing', () => {
    const text = csv([row()]).replace('"EAN / GTIN"', '"Barcode"');
    const result = parseINTIMPORT(text);
    expect(result.headerOk).toBe(false);
    expect(result.missingColumns).toContain('EAN / GTIN');
    expect(result.unexpectedColumns).toContain('Barcode');
  });

  it('is reachable from the shared source selector', () => {
    const result = parseIntake(csv([row()]), 'intimport');
    expect(result.total).toBe(1);
    expect(result.candidates[0]!.insert.catalog_source).toBe('INTIMPORT');
  });
});

describe('INTIMPORT CSV decoding', () => {
  it('reads UTF-8 with and without a BOM identically', () => {
    const plain = parseINTIMPORT(csv([row()]));
    const withBom = parseINTIMPORT(csv([row()], true));
    expect(withBom.headerOk).toBe(true);
    expect(withBom.candidates[0]!.displayName).toBe(plain.candidates[0]!.displayName);
  });

  it('keeps commas, escaped quotes and newlines inside quoted cells', () => {
    const ingredients = 'Cukier, kakao 20%, emulgator "E322"\nMoże zawierać orzechy.';
    const result = parseINTIMPORT(csv([row({ 'Ingredients Original': ingredients })]));
    expect(result.summary.rows).toBe(1);
    expect(result.candidates[0]!.source['Ingredients Original']).toBe(ingredients);
  });

  it('preserves international text verbatim', () => {
    const name = 'Kakao ciemne 70% — żółć, ćwikła, Ærø';
    const result = parseINTIMPORT(csv([row({ 'Product Name Original': name })]));
    expect(result.candidates[0]!.displayName).toBe(name);
  });
});

describe('INTIMPORT missing values', () => {
  it.each(['not_found', 'not_applicable', '', 'N/A', 'n/a', 'null', 'unknown', 'NOT_FOUND'])(
    'treats %s as UNKNOWN rather than a value',
    (token) => {
      expect(isMissingValue(token)).toBe(true);
      expect(intimportText(token)).toBeNull();
    },
  );

  it('never converts a missing value into a numeric parser error', () => {
    const parsed = intimportNumber('not_found');
    expect(parsed.value).toBeNull();
    expect(parsed.warning).toBeNull();
  });

  it('maps a missing Energy kcal to null, not zero', () => {
    const candidate = mapIntimportRow(
      row({ 'Nutrition Basis': '100 g', 'Energy kcal': 'not_found' }),
      1,
    );
    expect(candidate.insert.kcal_per_100g).toBeUndefined();
  });

  it('keeps a real zero as numeric zero', () => {
    const candidate = mapIntimportRow(
      row({ 'Nutrition Basis': '100 g', 'Fat g': '0', 'Salt g': '0.0' }),
      1,
    );
    expect(candidate.insert.fat_percent).toBe(0);
    expect(candidate.insert.salt_percent).toBe(0);
  });
});

describe('INTIMPORT product name', () => {
  it('prefers Product Name Original for display', () => {
    const candidate = mapIntimportRow(
      row({ 'Product Name Original': 'Mleko w proszku', 'Product Name English': 'Milk powder' }),
      1,
    );
    expect(candidate.displayName).toBe('Mleko w proszku');
    expect(candidate.insert.product_name_internal).toBe('Milk powder');
  });

  it('falls back to Product Name English and does NOT report a missing name', () => {
    const candidate = mapIntimportRow(
      row({ 'Product Name Original': 'not_found', 'Product Name English': 'Milk powder' }),
      1,
    );
    expect(candidate.displayName).toBe('Milk powder');
    expect(candidate.reasons.join(' ')).not.toContain('missing product name');
    expect(candidate.state).not.toBe('INVALID');
  });

  it('is INVALID only when both names and the brand are absent', () => {
    const candidate = mapIntimportRow(
      row({
        'Product Name Original': 'not_found',
        'Product Name English': 'not_found',
        Brand: 'not_found',
      }),
      1,
    );
    expect(candidate.state).toBe('INVALID');
  });
});

describe('INTIMPORT EAN / GTIN', () => {
  it('keeps the code as a string with leading zeros intact', () => {
    const candidate = mapIntimportRow(row({ 'EAN / GTIN': '0049000028911' }), 1);
    expect(candidate.insert.ean_code).toBe('0049000028911');
    expect(candidate.eanRaw).toBe('0049000028911');
  });

  it('accepts a checksum-valid EAN-13 through the existing barcode authority', () => {
    const candidate = mapIntimportRow(row({ 'EAN / GTIN': '4001686322536' }), 1);
    expect(candidate.ean).toBe('4001686322536');
    expect(candidate.warnings.join(' ')).not.toContain('checksum');
  });

  it('keeps a checksum-invalid code but refuses to use it as identity', () => {
    const candidate = mapIntimportRow(row({ 'EAN / GTIN': '4001686322530' }), 1);
    expect(candidate.insert.ean_code).toBe('4001686322530');
    expect(candidate.ean).toBeNull();
    expect(candidate.warnings.join(' ')).toContain('checksum');
  });
});

describe('INTIMPORT field retention', () => {
  const filled = row({
    'Product ID': 'PL-ACME-0007',
    Category: 'Stabilizers & emulsifiers',
    Subcategory: 'Hydrocolloids',
    'Product Type': 'professional',
    Brand: 'ACME',
    'Variant Original': 'Wariant A',
    'Variant English': 'Variant A',
    Manufacturer: 'ACME Sp. z o.o.',
    'Net Quantity Value': '1',
    'Net Quantity Unit': 'kg',
    'Package Count': '6',
    'Ingredients Original': 'Guma tara.',
    'Ingredients English': 'Tara gum.',
    Allergens: 'Brak deklarowanych alergenów.',
    'Nutrition Basis': 'W 100 g',
    'Energy kJ': '1500',
    'Energy kcal': '360',
    'Fat g': '0.5',
    'Saturated Fat g': '0.1',
    'Carbohydrates g': '80',
    'Sugars g': '0',
    'Fibre g': '75',
    'Protein g': '2',
    'Salt g': '0.02',
    'EAN / GTIN': '4001686322536',
    'Country of Origin': 'IT',
    'Professional Dosage': '0.2–0.4%',
    'Technical Parameters': 'Viscosity 3000 mPa·s',
    'Technical PDF URL': 'https://example.test/tds.pdf',
    'Primary Source URL': 'https://example.test/product',
    'Product Status': 'complete',
    'Checked At': '2026-08-20',
    Notes: 'Zweryfikowano z kartą techniczną.',
  });

  it('retains every one of the 36 official fields as source evidence', () => {
    const candidate = mapIntimportRow(filled, 1);
    const retained = (
      candidate.insert.extracted_json as { intimport: { fields: Record<string, unknown> } }
    ).intimport.fields;
    for (const column of INTIMPORT_COLUMNS) expect(retained).toHaveProperty(column);
    expect(retained['Technical Parameters']).toBe('Viscosity 3000 mPa·s');
    expect(retained['Checked At']).toBe('2026-08-20');
    expect(retained.Notes).toBe('Zweryfikowano z kartą techniczną.');
  });

  it('maps the fields the product model does expose', () => {
    const candidate = mapIntimportRow(filled, 1);
    expect(candidate.insert.brand).toBe('ACME');
    expect(candidate.insert.supplier).toBe('ACME Sp. z o.o.');
    expect(candidate.insert.package_size).toBe('1 kg × 6');
    expect(candidate.insert.detected_text).toBe('Guma tara.');
    expect(candidate.insert.allergens).toBe('Brak deklarowanych alergenów.');
    expect(candidate.insert.usage_notes).toBe('0.2–0.4%');
    expect(candidate.insert.engine_notes).toBe('Viscosity 3000 mPa·s');
    expect(candidate.insert.source_url).toBe('https://example.test/product');
    expect(candidate.insert.kcal_per_100g).toBe(360);
    expect(candidate.insert.fiber_percent).toBe(75);
    expect(candidate.insert.total_sugars_percent).toBe(0);
  });

  it('preserves an unmapped source category instead of destroying the row', () => {
    const candidate = mapIntimportRow(filled, 1);
    expect(candidate.sourceCategory).toBe('Stabilizers & emulsifiers');
    expect(candidate.sourceSubcategory).toBe('Hydrocolloids');
    expect(candidate.state).not.toBe('INVALID');
    expect(candidate.source.Category).toBe('Stabilizers & emulsifiers');
  });

  it('treats source Product Status as metadata, never as engine authority', () => {
    const candidate = mapIntimportRow(row({ 'Product Status': 'complete' }), 1);
    expect(candidate.source['Product Status']).toBe('complete');
    // "complete" in the source file cannot make an evidence-poor row ready.
    expect(candidate.state).toBe('ENRICHMENT_REQUIRED');
  });
});

describe('INTIMPORT nutrition basis', () => {
  it.each([
    ['100 g', 'per_100g'],
    ['W 100 g', 'per_100g'],
    ['per 100 g', 'per_100g'],
    ['100 ml', 'per_100ml'],
    ['W 100 ml', 'per_100ml'],
  ])('normalizes %s', (raw, expected) => {
    expect(normalizeNutritionBasis(raw)).toBe(expected);
  });

  /* OWNER RULE, frozen 2026-08-25: Gellatti normalises 1 ml = 1 g (1 L = 1000 g),
     deliberately ignoring the density spread between water, milk and cream.
     A per-100 ml panel therefore becomes per-100 g NUMERICALLY 1:1.

     The rule is not cosmetic. While per-100 ml rows were refused for want of a
     density, no liquid dairy product could ever reach the Engine — and milk and
     cream are the dairy and fat carriers of every gelato base, declared per 100
     ml throughout the EU. Density must never be reintroduced as a requirement. */
  it('maps a per-100 ml panel into the per-100 g fields 1:1', () => {
    const candidate = mapIntimportRow(
      row({
        'Nutrition Basis': '100 ml',
        'Energy kcal': '60',
        'Fat g': '3.2',
        'Carbohydrates g': '4.7',
        'Protein g': '3.2',
        'Ingredients Original': 'mleko',
      }),
      1,
    );
    expect(candidate.insert.kcal_per_100g).toBe(60);
    expect(candidate.insert.fat_percent).toBe(3.2);
    expect(candidate.insert.carbohydrate_percent).toBe(4.7);
    expect(candidate.insert.protein_percent).toBe(3.2);
    // No density was consulted, and the row is not held for one.
    expect(candidate.reasons.join(' ')).not.toContain('density');
    expect(candidate.state).toBe('READY');
  });

  it('preserves BOTH the manufacturer basis and how it was normalized', () => {
    const ml = mapIntimportRow(row({ 'Nutrition Basis': '100 ml', 'Fat g': '3.2' }), 1);
    expect(ml.nutritionBasis).toBe('per_100ml');
    expect(ml.normalizationBasis).toBe('GELLATTI_1ML_1G_NORMALIZATION');
    // A genuine per-100 g label stays distinguishable from a normalized one.
    const g = mapIntimportRow(row({ 'Nutrition Basis': '100 g', 'Fat g': '3.2' }), 1);
    expect(g.nutritionBasis).toBe('per_100g');
    expect(g.normalizationBasis).toBe('SOURCE_PER_100G');
  });

  it('still refuses a basis it never established', () => {
    // The rule converts ml to g. It does not license reading a panel declared
    // per portion or per serving as though it were per 100 g.
    const candidate = mapIntimportRow(
      row({ 'Nutrition Basis': 'per portion (30 g)', 'Energy kcal': '60', 'Fat g': '3.5' }),
      1,
    );
    expect(candidate.insert.kcal_per_100g).toBeUndefined();
    expect(candidate.insert.fat_percent).toBeUndefined();
    expect(candidate.reasons.join(' ')).toContain('without a recognized');
    expect(candidate.source['Energy kcal']).toBe('60');
  });
});

describe('INTIMPORT deduplication', () => {
  it('marks the second row with the same GTIN as a duplicate', () => {
    const result = parseINTIMPORT(
      csv([
        row({ 'Product ID': 'A', 'EAN / GTIN': '4001686322536' }),
        row({ 'Product ID': 'B', 'EAN / GTIN': '4001686322536' }),
      ]),
    );
    expect(result.candidates[1]!.state).toBe('DUPLICATE');
    expect(result.candidates[1]!.duplicateOfRow).toBe(1);
    expect(result.summary.duplicates).toBe(1);
    expect(result.summary.uniqueProducts).toBe(1);
  });

  it('treats equivalent UPC-A and EAN-13 forms as the same product', () => {
    const result = parseINTIMPORT(
      csv([
        row({ 'Product ID': 'A', 'EAN / GTIN': '049000028911' }),
        row({ 'Product ID': 'B', 'EAN / GTIN': '0049000028911' }),
      ]),
    );
    expect(result.candidates[1]!.state).toBe('DUPLICATE');
  });

  it('does NOT fuzzy-merge same-name rows carrying different source Product IDs', () => {
    const result = parseINTIMPORT(
      csv([
        row({ 'Product ID': 'PL-COM-P1237', 'Product Name Original': 'LIMONE' }),
        row({ 'Product ID': 'PL-COM-P307B', 'Product Name Original': 'LIMONE' }),
      ]),
    );
    expect(result.candidates[1]!.state).toBe('REVIEW_REQUIRED');
    expect(result.summary.duplicates).toBe(0);
    expect(result.candidates[1]!.reasons.join(' ')).toContain('different source Product ID');
  });

  it('keeps same-name rows separate when their true GTINs differ', () => {
    const result = parseINTIMPORT(
      csv([
        row({ 'Product ID': 'A', 'EAN / GTIN': '4001686322536' }),
        row({ 'Product ID': 'B', 'EAN / GTIN': '5901234123457' }),
      ]),
    );
    expect(result.summary.duplicates).toBe(0);
    expect(result.summary.uniqueProducts).toBe(2);
  });

  it('recognizes a row that already exists as a canonical product by GTIN', () => {
    const result = parseINTIMPORT(csv([row({ 'EAN / GTIN': '4001686322536' })]), {
      byBarcode: (values) => (values.includes('4001686322536') ? 'product-existing-1' : null),
    });
    expect(result.candidates[0]!.state).toBe('EXISTING');
    expect(result.candidates[0]!.existingProductId).toBe('product-existing-1');
    expect(result.summary.existing).toBe(1);
  });

  it('recognizes an existing overlay product by deterministic identity when no GTIN exists', () => {
    const key = intimportIdentityKey({
      brand: 'Testowa Marka',
      name: 'Produkt testowy',
      variant: null,
      netQuantity: '500',
      unit: 'g',
    });
    const result = parseINTIMPORT(csv([row()]), {
      byIdentity: (candidate) => (candidate === key ? 'overlay-1' : null),
    });
    expect(result.candidates[0]!.state).toBe('EXISTING');
    expect(result.candidates[0]!.existingProductId).toBe('overlay-1');
  });

  it('never lets an EXISTING or DUPLICATE row reach the writer', () => {
    const result = parseIntake(
      csv([
        row({ 'Product ID': 'A', 'EAN / GTIN': '4001686322536' }),
        row({ 'Product ID': 'B', 'EAN / GTIN': '4001686322536' }),
      ]),
      'intimport',
      { byBarcode: () => null },
    );
    const importable = result.candidates.filter((candidate) => candidate.status !== 'skip');
    expect(importable).toHaveLength(1);
  });
});

describe('INTIMPORT safety', () => {
  it('keeps a technical product out of the writer until it is reviewed', () => {
    const result = parseIntake(
      csv([
        row({
          Category: 'Stabilizers & emulsifiers',
          'Product Type': 'professional',
          'Ingredients Original': 'Guma tara.',
          'Professional Dosage': 'not_found',
          'Product Status': 'complete',
        }),
      ]),
      'intimport',
    );
    // Identity/evidence parse fine, but the row is not ready and is flagged, never
    // silently promoted by the source's own "complete" status.
    expect(result.candidates[0]!.status).not.toBe('valid');
  });

  it('does not overwrite a stronger existing value with a missing one', () => {
    const candidate = mapIntimportRow(
      row({ 'Nutrition Basis': '100 g', 'Protein g': 'not_found' }),
      1,
    );
    // The field is simply absent from the insert, so a merge cannot null out a
    // stronger verified value downstream.
    expect('protein_percent' in candidate.insert).toBe(false);
  });

  it('stamps the shared catalog intake channel rather than a private one', () => {
    const candidate = mapIntimportRow(row(), 1);
    expect(candidate.insert.source_type).toBe('catalog_import');
    expect(candidate.insert.catalog_source).toBe('INTIMPORT');
  });
});

describe('INTIMPORT preview summary', () => {
  it('counts rows, countries and states without inventing anything', () => {
    const result = parseINTIMPORT(
      csv([
        row({
          'Product ID': 'A',
          'Country Code': 'PL',
          'Nutrition Basis': '100 g',
          'Energy kcal': '100',
          'Fat g': '1',
          'Carbohydrates g': '10',
          'Protein g': '2',
          'Ingredients Original': 'Cukier.',
        }),
        row({ 'Product ID': 'B', 'Country Code': 'ES', 'Product Name Original': 'Inny produkt' }),
        row({
          'Product ID': 'C',
          'Country Code': 'PL',
          'Product Name Original': 'not_found',
          'Product Name English': 'not_found',
          Brand: 'not_found',
        }),
        row({
          'Product ID': 'D',
          'Country Code': 'PL',
          'Product Name Original': 'Trzeci produkt',
          'EAN / GTIN': '5901234123457',
        }),
      ]),
    );
    expect(result.summary.rows).toBe(4);
    expect(result.summary.countries).toEqual(['ES', 'PL']);
    expect(result.summary.ready).toBe(1);
    expect(result.summary.enrichmentRequired).toBe(2);
    expect(result.summary.invalid).toBe(1);
    expect(result.summary.duplicates).toBe(0);
  });

  it('ignores fully blank lines rather than counting them as rows', () => {
    const result = parseINTIMPORT(`${csv([row()])}\n\n`);
    expect(result.summary.rows).toBe(1);
  });
});

describe('canonical naming keeps commercial identity apart', () => {
  it('appends the source variant so different formulations do not share an identity', () => {
    // The catalogue's non-EAN identity is brand + name + size. Three quark fat
    // levels sold as the same name and size must not collapse into one product.
    const names = ['chudy', 'półtłusty', 'tłusty'].map((variant) =>
      canonicalProductName('Twaróg klinek Delikate', variant),
    );
    expect(new Set(names).size).toBe(3);
    expect(names[0]).toBe('Twaróg klinek Delikate chudy');
  });

  it('does not repeat a variant the name already carries', () => {
    expect(canonicalProductName('Jogurt truskawkowy', 'truskawkowy')).toBe('Jogurt truskawkowy');
    expect(canonicalProductName('LIMONE Cytrynowy', 'Cytrynowy')).toBe('LIMONE Cytrynowy');
  });

  it('leaves a name untouched when the source supplies no variant', () => {
    expect(canonicalProductName('Mleko UHT 3.2%', null)).toBe('Mleko UHT 3.2%');
    expect(canonicalProductName(null, 'cokolwiek')).toBeNull();
  });
});
