/**
 * Duplicate-handling tests (spec §10, §16): exact EAN, identity-hash (REUSED key),
 * likely (near-miss OCR spelling wobble), new product, allowedActions per the LOCKED
 * rules, and owner-scoping passthrough (the module only ever sees the rows it is
 * given — it filters nothing and does no IO).
 */
import { describe, expect, it } from 'vitest';
import { productIdentityKey, productInsertToIdentityInput } from '@/data/products/productIdentity';
import type { ProductInsert } from '@/data/products/productRow';
import {
  assessDuplicate,
  BRAND_SIMILARITY_THRESHOLD,
  NAME_SIMILARITY_THRESHOLD,
  SIZE_SIMILARITY_THRESHOLD,
  similarityRatio,
  STRICT_NAME_SIMILARITY_THRESHOLD,
  type ExistingProductForDedup,
} from './duplicateCheck';

const insert = (overrides: ProductInsert = {}): ProductInsert => ({
  product_name_display: 'Yogur Griego Natural',
  brand: 'Danone',
  package_size: '500 g',
  source_type: 'label_scan',
  ...overrides,
});

const existingRow = (overrides: Partial<ExistingProductForDedup> = {}): ExistingProductForDedup => ({
  id: 'prod-1',
  brand: 'Danone',
  product_name_display: 'Yogur Griego Natural',
  package_size: '500 g',
  ...overrides,
});

describe('check 1 — normalized EAN exact match', () => {
  it('manual EAN vs stored normalized column → exact_duplicate', () => {
    const a = assessDuplicate(
      { insert: insert({ product_name_display: 'Totally Different Name', brand: 'Other' }), manualEan: '8480000610928' },
      [existingRow({ ean_code_normalized: '8480000610928' })],
    );
    expect(a.verdict).toBe('exact_duplicate');
    expect(a.reasons).toEqual([{ check: 'ean_match', existingProductId: 'prod-1' }]);
  });

  it('OCR ean evidence with spacing/punctuation matches a raw stored ean (same digit rule)', () => {
    const a = assessDuplicate(
      { insert: insert({ ean_code: '8 480000 610-928' }), manualEan: null },
      [existingRow({ ean_code: '8480000610928' })],
    );
    expect(a.verdict).toBe('exact_duplicate');
    expect(a.reasons[0]?.check).toBe('ean_match');
  });

  it('a barcode match also counts as an EAN-family exact hit', () => {
    const a = assessDuplicate(
      { insert: insert({ barcode: '0049000028911' }), manualEan: null },
      [existingRow({ barcode_normalized: '0049000028911' })],
    );
    expect(a.verdict).toBe('exact_duplicate');
  });

  it('leading zeros are PRESERVED — "0123…" never matches "123…"', () => {
    const a = assessDuplicate(
      { insert: insert({ product_name_display: 'X', brand: 'Y', ean_code: '01234567' }), manualEan: null },
      [existingRow({ product_name_display: 'Other', brand: 'Z', ean_code: '1234567' })],
    );
    expect(a.verdict).toBe('new_product');
  });

  it('a candidate without any EAN never fires the EAN check', () => {
    const a = assessDuplicate(
      { insert: insert({ product_name_display: 'Completely Unrelated', brand: 'Nobody' }), manualEan: null },
      [existingRow({ ean_code_normalized: '8480000610928' })],
    );
    expect(a.reasons.every((r) => r.check !== 'ean_match')).toBe(true);
  });
});

describe('check 2 — identity-hash match (REUSED productIdentityKey)', () => {
  it('recomputes the SAME key the D5B import dedupes on when no stored hash exists', () => {
    const candidate = insert({ fat_percent: 10, total_sugars_percent: 4.5 });
    const row = existingRow({ fat_percent: 10, total_sugars_percent: 4.5, source_type: 'label_scan' });
    // sanity: both sides produce the identical reused key
    expect(productIdentityKey(productInsertToIdentityInput(candidate))).toBe(
      productIdentityKey(productInsertToIdentityInput(row as ProductInsert)),
    );
    const a = assessDuplicate({ insert: candidate, manualEan: null }, [row]);
    expect(a.verdict).toBe('exact_duplicate');
    expect(a.reasons[0]).toEqual({ check: 'identity_hash_match', existingProductId: 'prod-1' });
  });

  it('prefers the STORED product_identity_hash when the row carries one', () => {
    const candidate = insert();
    const storedHash = productIdentityKey(productInsertToIdentityInput(candidate));
    const a = assessDuplicate({ insert: candidate, manualEan: null }, [
      existingRow({
        product_identity_hash: storedHash,
        // deliberately different visible fields — the stored hash is authoritative
        product_name_display: 'renamed later',
        brand: 'rebranded',
      }),
    ]);
    expect(a.verdict).toBe('exact_duplicate');
    expect(a.reasons[0]?.check).toBe('identity_hash_match');
  });

  it('a WEAK key (no brand, no name) never hash-matches (mirrors the import guard)', () => {
    const weak: ProductInsert = { fat_percent: 10, source_type: 'label_scan' };
    const a = assessDuplicate({ insert: weak, manualEan: null }, [
      existingRow({ brand: null, product_name_display: null, fat_percent: 10, source_type: 'label_scan' }),
    ]);
    expect(a.verdict).toBe('new_product');
  });

  it('an EAN hit is not double-reported as a hash hit for the same row', () => {
    const candidate = insert({ ean_code: '8480000610928' });
    const row = existingRow({ ean_code: '8480000610928', source_type: 'label_scan' });
    const a = assessDuplicate({ insert: candidate, manualEan: null }, [row]);
    expect(a.reasons.filter((r) => r.existingProductId === 'prod-1')).toHaveLength(1);
    expect(a.reasons[0]?.check).toBe('ean_match');
  });
});

describe('check 3 — normalized similarity (OCR spelling wobble)', () => {
  it('near-miss NAME spelling with the same brand → likely_duplicate with a score', () => {
    const a = assessDuplicate(
      { insert: insert({ product_name_display: 'Yogur Griego Natura1' }), manualEan: null },
      [existingRow()],
    );
    expect(a.verdict).toBe('likely_duplicate');
    const reason = a.reasons[0];
    expect(reason?.check).toBe('normalized_identity_match');
    if (reason?.check === 'normalized_identity_match') {
      expect(reason.score).toBeGreaterThanOrEqual(80);
      expect(reason.score).toBeLessThanOrEqual(100);
    }
  });

  it('near-miss BRAND spelling ("Danome" vs "Danone") → likely_duplicate', () => {
    const a = assessDuplicate({ insert: insert({ brand: 'Danome' }), manualEan: null }, [existingRow()]);
    expect(a.verdict).toBe('likely_duplicate');
  });

  it('case/punctuation differences alone score 100 (matcher normalization reused)', () => {
    const a = assessDuplicate(
      { insert: insert({ product_name_display: 'YOGUR   GRIEGO, NATURAL', brand: 'DANONE' }), manualEan: null },
      [existingRow({ fat_percent: 9 })], // nutrition differs → hash differs → similarity path
    );
    expect(a.verdict).toBe('likely_duplicate');
    const reason = a.reasons[0];
    if (reason?.check === 'normalized_identity_match') expect(reason.score).toBe(100);
  });

  it('DIFFERENT package sizes (both declared) are distinct products, not duplicates', () => {
    const a = assessDuplicate(
      { insert: insert({ package_size: '1 kg' }), manualEan: null },
      [existingRow({ package_size: '500 g' })],
    );
    expect(a.verdict).toBe('new_product');
  });

  it('a missing package size on one side stays neutral', () => {
    const a = assessDuplicate({ insert: insert({ package_size: null }), manualEan: null }, [existingRow()]);
    expect(a.verdict).toBe('likely_duplicate');
  });

  it('DIFFERENT countries (both declared) are distinct market products', () => {
    const a = assessDuplicate(
      { insert: insert({ country: 'España' }), manualEan: null },
      [existingRow({ country: 'Portugal' })],
    );
    expect(a.verdict).toBe('new_product');
  });

  it('same country (both declared) participates and stays likely', () => {
    const a = assessDuplicate(
      { insert: insert({ country: 'España' }), manualEan: null },
      [existingRow({ country: 'españa' })],
    );
    expect(a.verdict).toBe('likely_duplicate');
  });

  it('without a brand on both sides the name must be NEAR-IDENTICAL (≥ strict threshold)', () => {
    const nearIdentical = assessDuplicate(
      { insert: insert({ brand: null, product_name_display: 'Yogur Griego Natural 500' }), manualEan: null },
      [existingRow({ brand: null, product_name_display: 'Yogur Griego Natural 500g' })],
    );
    expect(nearIdentical.verdict).toBe('likely_duplicate');

    const merelySimilar = assessDuplicate(
      { insert: insert({ brand: null, product_name_display: 'Yogur Griego Naturalisimo' }), manualEan: null },
      [existingRow({ brand: null })],
    );
    expect(merelySimilar.verdict).toBe('new_product');
  });

  it('genuinely different names stay new_product (wobble tolerance never over-matches)', () => {
    const a = assessDuplicate(
      { insert: insert({ product_name_display: 'Leche Entera Fresca' }), manualEan: null },
      [existingRow()],
    );
    expect(a.verdict).toBe('new_product');
  });

  it('a nameless candidate never claims similarity', () => {
    const a = assessDuplicate(
      { insert: { brand: 'Danone', source_type: 'label_scan' }, manualEan: null },
      [existingRow()],
    );
    expect(a.verdict).toBe('new_product');
  });
});

describe('verdict → allowedActions (LOCKED rules)', () => {
  it('exact_duplicate → open_existing + update_existing_with_review, NEVER create_new', () => {
    const a = assessDuplicate({ insert: insert(), manualEan: '8480000610928' }, [
      existingRow({ ean_code_normalized: '8480000610928' }),
    ]);
    expect(a.allowedActions).toEqual(['open_existing', 'update_existing_with_review']);
  });

  it('likely_duplicate → all three actions including create_new', () => {
    const a = assessDuplicate({ insert: insert({ brand: 'Danome' }), manualEan: null }, [existingRow()]);
    expect(a.allowedActions).toEqual(['open_existing', 'update_existing_with_review', 'create_new']);
  });

  it('new_product → create_new only', () => {
    const a = assessDuplicate({ insert: insert(), manualEan: null }, []);
    expect(a.verdict).toBe('new_product');
    expect(a.allowedActions).toEqual(['create_new']);
    expect(a.reasons).toEqual([]);
  });
});

describe('assessment mechanics', () => {
  it('collects EVERY reason that fired, exact families first, similarity scores descending', () => {
    const a = assessDuplicate({ insert: insert({ ean_code: '8480000610928' }), manualEan: null }, [
      existingRow({ id: 'prod-sim-weak', product_name_display: 'Yogur Griego Natural XL' }),
      existingRow({ id: 'prod-ean', ean_code_normalized: '8480000610928', product_name_display: 'unrelated' }),
      existingRow({ id: 'prod-sim-strong' }),
    ]);
    expect(a.verdict).toBe('exact_duplicate');
    expect(a.reasons[0]).toEqual({ check: 'ean_match', existingProductId: 'prod-ean' });
    const sims = a.reasons.filter((r) => r.check === 'normalized_identity_match');
    expect(sims.map((r) => r.existingProductId)).toEqual(['prod-sim-strong', 'prod-sim-weak']);
  });

  it('OWNER SCOPING passes through: only the caller-provided rows are ever assessed', () => {
    // identical candidate, disjoint row sets → verdicts depend ONLY on the given rows
    const mine = assessDuplicate({ insert: insert(), manualEan: null }, [existingRow({ fat_percent: 9 })]);
    const none = assessDuplicate({ insert: insert(), manualEan: null }, []);
    expect(mine.verdict).toBe('likely_duplicate');
    expect(none.verdict).toBe('new_product');
  });

  it('is deterministic — same input, same assessment', () => {
    const run = () =>
      assessDuplicate({ insert: insert({ brand: 'Danome' }), manualEan: null }, [
        existingRow(),
        existingRow({ id: 'prod-2', package_size: '500g' }),
      ]);
    expect(run()).toEqual(run());
  });

  it('pins the deterministic thresholds (changing them is a deliberate act)', () => {
    expect(NAME_SIMILARITY_THRESHOLD).toBe(0.8);
    expect(BRAND_SIMILARITY_THRESHOLD).toBe(0.8);
    expect(STRICT_NAME_SIMILARITY_THRESHOLD).toBe(0.9);
    expect(SIZE_SIMILARITY_THRESHOLD).toBe(0.8);
  });

  it('similarityRatio: identity → 1, empty-vs-empty → 0 (no evidence, no claim)', () => {
    expect(similarityRatio('danone', 'danone')).toBe(1);
    expect(similarityRatio('', '')).toBe(0);
    expect(similarityRatio('danone', 'danome')).toBeCloseTo(1 - 1 / 6, 10);
  });
});
