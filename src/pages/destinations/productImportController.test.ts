import { describe, expect, it } from 'vitest';
import type { ProductIntakeCandidate, ProductIntakeResult } from '@/data/products/productTableParser';
import type { ProductInsert } from '@/data/products/productRow';
import { importPreviewRedFlags } from './productImportController';

const cand = (rowIndex: number, insert: ProductInsert, status: ProductIntakeCandidate['status'] = 'valid'): ProductIntakeCandidate => ({
  rowIndex,
  status,
  insert,
  warnings: [],
  skipReason: null,
});
const result = (candidates: ProductIntakeCandidate[]): ProductIntakeResult => ({
  total: candidates.length,
  valid: candidates.filter((c) => c.status === 'valid').length,
  warnings: 0,
  skipped: candidates.filter((c) => c.status === 'skip').length,
  candidates,
});

describe('importPreviewRedFlags — internal preview annotations', () => {
  it('plain milk / cream carry no red flags', () => {
    const rows = importPreviewRedFlags(
      result([
        cand(1, { product_name_display: 'Leche entera UHT de vaca' }),
        cand(2, { product_name_display: 'Nata para montar Hacendado' }),
      ]),
    );
    expect(rows).toEqual([]);
  });

  it('flags sugar-free chocolate, sweeteners, and a protein drink — all block auto-verify', () => {
    const rows = importPreviewRedFlags(
      result([
        cand(1, { product_name_display: 'Chocolate con leche 0% azúcares añadidos maltitol' }),
        cand(2, { product_name_display: 'Edulcorante Eritritol y Sucralosa' }),
        cand(3, { product_name_display: 'Batido lácteo +Proteínas chocolate' }),
      ]),
    );
    expect(rows.map((r) => r.rowIndex)).toEqual([1, 2, 3]);
    expect(rows[0]!.codes).toContain('sweetener_or_polyol');
    expect(rows[1]!.codes).toContain('sweetener_or_polyol');
    expect(rows[2]!.codes).toContain('protein_fortified');
    expect(rows.every((r) => r.blocksAutoVerify)).toBe(true);
  });

  it('omits skip rows from the preview', () => {
    const rows = importPreviewRedFlags(result([cand(1, { product_name_display: 'Helado con maltitol' }, 'skip')]));
    expect(rows).toEqual([]);
  });

  it('never matches or reaches the reference base (pure annotation only)', () => {
    // a row that WOULD match a dairy reference still produces only red-flag annotations,
    // never a mapper result — importPreviewRedFlags returns [] for a clean dairy product.
    expect(importPreviewRedFlags(result([cand(1, { product_name_display: 'Leche', product_category: 'dairy' })]))).toEqual([]);
  });
});
