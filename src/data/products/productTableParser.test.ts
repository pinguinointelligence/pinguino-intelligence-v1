/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  mapRowToProductInsert,
  normalizeHeader,
  parseNumeric,
  parseProductBoolean,
  parseProductTable,
} from './productTableParser';

describe('normalizeHeader', () => {
  it('lowercases, trims, and collapses non-alphanumerics to underscores', () => {
    expect(normalizeHeader('EAN Code')).toBe('ean_code');
    expect(normalizeHeader('  Brand ')).toBe('brand');
    expect(normalizeHeader('Total Sugars (%)')).toBe('total_sugars');
    expect(normalizeHeader('cost-per-kg')).toBe('cost_per_kg');
  });
});

describe('parseNumeric — honest numbers (real 0 vs missing)', () => {
  it('blank -> null with no warning', () => {
    expect(parseNumeric('')).toEqual({ value: null, warning: null });
    expect(parseNumeric(null)).toEqual({ value: null, warning: null });
    expect(parseNumeric(undefined)).toEqual({ value: null, warning: null });
  });
  it('a real 0 stays 0 (never fake / never null)', () => {
    expect(parseNumeric('0')).toEqual({ value: 0, warning: null });
    expect(parseNumeric(' 0 ')).toEqual({ value: 0, warning: null });
  });
  it('dot and EU comma decimals parse to the same number', () => {
    expect(parseNumeric('12.5').value).toBe(12.5);
    expect(parseNumeric('12,5').value).toBe(12.5);
    expect(parseNumeric('0,75').value).toBe(0.75);
  });
  it('ambiguous comma-grouping or mixed separators -> null + warning (no guess)', () => {
    expect(parseNumeric('1,234').value).toBeNull();
    expect(parseNumeric('1,234').warning).toMatch(/ambiguous/);
    expect(parseNumeric('1.234,5').value).toBeNull();
    expect(parseNumeric('1.234,5').warning).toMatch(/ambiguous/);
  });
  it('garbage -> null + warning (never a fake 0)', () => {
    expect(parseNumeric('abc').value).toBeNull();
    expect(parseNumeric('abc').warning).toMatch(/non-numeric/);
  });
});

describe('parseProductBoolean — tri-state', () => {
  it('maps common variants', () => {
    expect(parseProductBoolean('yes').value).toBe('true');
    expect(parseProductBoolean('1').value).toBe('true');
    expect(parseProductBoolean('no').value).toBe('false');
    expect(parseProductBoolean('unknown').value).toBe('unknown');
  });
  it('blank -> null; unrecognized -> null + warning', () => {
    expect(parseProductBoolean('').value).toBeNull();
    expect(parseProductBoolean('maybe').value).toBeNull();
    expect(parseProductBoolean('maybe').warning).toMatch(/unrecognized/);
  });
});

describe('mapRowToProductInsert', () => {
  it('preserves EAN/barcode leading zeros verbatim (never numeric)', () => {
    const c = mapRowToProductInsert({ brand: 'B', 'Product Name': 'Milk', EAN: '0049000028911', barcode: '007123' });
    expect(c.insert.ean_code).toBe('0049000028911');
    expect(c.insert.barcode).toBe('007123');
  });

  it('maps a generic "Product Name" header to product_name_display', () => {
    const c = mapRowToProductInsert({ brand: 'B', 'Product Name': 'Whole Milk' });
    expect(c.insert.product_name_display).toBe('Whole Milk');
  });

  it('keeps a real 0 but omits a blank numeric (stays NULL, never fake 0)', () => {
    const zero = mapRowToProductInsert({ brand: 'B', name: 'N', fat: '0' });
    expect(zero.insert.fat_percent).toBe(0);
    const blank = mapRowToProductInsert({ brand: 'B', name: 'N', fat: '' });
    expect('fat_percent' in blank.insert).toBe(false);
  });

  it('warns (and omits the field) on a garbage numeric — no fake 0', () => {
    const c = mapRowToProductInsert({ brand: 'B', name: 'N', fat: 'abc' });
    expect('fat_percent' in c.insert).toBe(false);
    expect(c.warnings.some((w) => /fat_percent/.test(w))).toBe(true);
  });

  it('stamps source_type from the intake profile', () => {
    expect(mapRowToProductInsert({ brand: 'B', name: 'N' }, 'generic').insert.source_type).toBe('catalog_import');
    expect(mapRowToProductInsert({ brand: 'B', name: 'N' }, 'mercadona').insert.source_type).toBe('mercadona');
    expect(mapRowToProductInsert({ brand: 'B', name: 'N' }, 'colin').insert.source_type).toBe('colin_catalog');
  });

  it('normalizes category via mapDatasetCategory and warns on an inexact mapping', () => {
    const inexact = mapRowToProductInsert({ brand: 'B', name: 'N', category: 'bakery' });
    expect(inexact.insert.product_category).toBe('other');
    expect(inexact.warnings.some((w) => /category/.test(w))).toBe(true);
    const exactCat = mapRowToProductInsert({ brand: 'B', name: 'N', category: 'dairy' });
    expect(exactCat.insert.product_category).toBe('dairy');
    expect(exactCat.warnings.some((w) => /category/.test(w))).toBe(false);
  });

  it('warns on an unknown column and never maps it', () => {
    const c = mapRowToProductInsert({ brand: 'B', name: 'N', warehouse_id: 'W42' });
    expect(c.warnings.some((w) => /warehouse_id/.test(w))).toBe(true);
    expect('warehouse_id' in c.insert).toBe(false);
  });

  it('skips a row with no brand AND no product name', () => {
    const c = mapRowToProductInsert({ EAN: '12345678', fat: '5' });
    expect(c.status).toBe('skip');
    expect(c.skipReason).toMatch(/no usable identity/);
  });

  it('warns (but still maps) when only one of brand/name is missing', () => {
    expect(mapRowToProductInsert({ brand: 'B' }).warnings).toContain('missing product name');
    expect(mapRowToProductInsert({ name: 'N' }).warnings).toContain('missing brand');
    expect(mapRowToProductInsert({ brand: 'B' }).status).toBe('warning');
  });

  it('warns (not silently overwrites) when two distinct headers map to the same field', () => {
    const c = mapRowToProductInsert({ brand: 'B', name: 'N', EAN: '111', ean_code: '222' });
    expect(c.warnings.some((w) => /duplicate column mapping to "ean_code"/.test(w))).toBe(true);
    expect(c.insert.ean_code).toBe('222'); // last non-blank value wins, but the loss is surfaced
  });

  it('warns on a short EAN but keeps the raw value', () => {
    const c = mapRowToProductInsert({ brand: 'B', name: 'N', ean: '12345' });
    expect(c.insert.ean_code).toBe('12345'); // not destroyed
    expect(c.warnings.some((w) => /looks short/.test(w))).toBe(true);
  });

  it('never maps a DB-computed / mapper-result / npac column', () => {
    const c = mapRowToProductInsert({ brand: 'B', name: 'N', vegan: 'yes', fat: '10' });
    for (const forbidden of ['product_code', 'ean_code_normalized', 'barcode_normalized', 'npac_value', 'matched_basement_id']) {
      expect(forbidden in c.insert).toBe(false);
    }
    expect(c.insert.vegan).toBe('true');
  });
});

describe('parseProductTable', () => {
  it('parses a CSV into candidates with tallies', () => {
    const csv = 'brand,product name,ean,fat\nBabbi,Crumble,0049000028911,30\n,,,\nNoName,,12345,';
    const result = parseProductTable(csv, 'mercadona');
    expect(result.total).toBe(2); // the all-blank middle line is skipped
    expect(result.candidates[0]!.insert.ean_code).toBe('0049000028911');
    expect(result.candidates[0]!.insert.source_type).toBe('mercadona');
    // 'NoName' row has a brand but no name -> warning
    expect(result.candidates[1]!.status).toBe('warning');
    expect(result.valid + result.warnings + result.skipped).toBe(result.total);
  });
});

describe('productTableParser + csv — purity / boundary (static source scan)', () => {
  const HERE = import.meta.dirname;
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const PARSER = stripComments(readFileSync(join(HERE, 'productTableParser.ts'), 'utf8'));
  const CSV = stripComments(readFileSync(resolve(HERE, '..', '..', 'lib', 'csv.ts'), 'utf8'));

  it('is pure: no DB / Supabase / services / engine / AI-billing, no IO, no file API, no network', () => {
    for (const code of [PARSER, CSV]) {
      expect(/supabase/i.test(code)).toBe(false);
      expect(/@\/services\//.test(code)).toBe(false);
      expect(/@\/engine/.test(code)).toBe(false);
      expect(/\b(openai|stripe)\b/i.test(code)).toBe(false);
      expect(/node:fs|readFileSync|FileReader|\bfetch\b|XMLHttpRequest/.test(code)).toBe(false);
    }
  });

  it('never touches the locked base, never fakes a 0, carries no npac_value, and computes no product code', () => {
    for (const code of [PARSER, CSV]) {
      expect(/mapper_basement/i.test(code)).toBe(false);
      expect(/npac_value/i.test(code)).toBe(false);
      expect(/\?\?\s*0\b/.test(code)).toBe(false);
      expect(/product_code|ean_code_normalized|barcode_normalized/.test(code)).toBe(false);
      expect(/createProductWithIdentity|matchAndSaveProduct/.test(code)).toBe(false);
    }
  });

  it('pulls in no third-party parsing package (CSV is hand-rolled)', () => {
    for (const code of [PARSER, CSV]) {
      expect(/from\s+['"](papaparse|xlsx|exceljs|csv-parse|d3-dsv|sheetjs)['"]/.test(code)).toBe(false);
    }
  });
});
