import { describe, expect, it } from 'vitest';
import { productRowToPickerEntry } from './productRowMapper';
import { evaluatePickerReadiness } from './productSearch';
import type { ProductRow } from '@/data/products/productRow';
import type { ReferenceEngineValues } from '@/data/products/productEngineResolver';

const product = (over: Partial<ProductRow>): ProductRow =>
  ({
    id: 'row-1',
    product_code: 'PR-1',
    product_name_display: 'Test Chocolate',
    product_name_internal: null,
    brand: 'BrandX',
    ean_code: '1234567890123',
    product_category: 'czekolada',
    package_size: '100 g',
    product_image_url: null,
    pac_value: null,
    pod_value: null,
    mapper_status: null,
    matched_basement_id: null,
    detected_text: null,
    allergens: null,
    polyol_percent: null,
    total_sugars_percent: null,
    source_type: 'catalog_import',
    status: 'draft',
    ...over,
  }) as unknown as ProductRow;

describe('productRowToPickerEntry', () => {
  it('maps the real ProductRow schema onto the picker entry (no invention)', () => {
    const e = productRowToPickerEntry(product({}));
    expect(e).toMatchObject({
      productId: 'row-1',
      productCode: 'PR-1',
      displayName: 'Test Chocolate',
      brand: 'BrandX',
      ean: '1234567890123',
      category: 'czekolada',
      packageSize: '100 g',
      status: 'draft',
    });
    expect(e.readiness.pac_value).toBeNull();
    expect(e.reference).toBeNull();
  });

  it('falls back to internal name then product code for the display name', () => {
    expect(productRowToPickerEntry(product({ product_name_display: null, product_name_internal: 'Internal' })).displayName).toBe('Internal');
    expect(productRowToPickerEntry(product({ product_name_display: null, product_name_internal: null })).displayName).toBe('PR-1');
  });

  it('a matched row WITH a reference carrying pac/pod is exact-ready', () => {
    const reference: ReferenceEngineValues = { ingredient_id: 'REF-1', ingredient_name_display: 'Cocoa 70', pac_value: 120, pod_value: 30 };
    const e = productRowToPickerEntry(product({ mapper_status: 'matched', matched_basement_id: 'REF-1' }), reference);
    expect(evaluatePickerReadiness(e).exactReady).toBe(true);
  });

  it('a matched row WITHOUT a reference stays honestly not-ready (no fabricated link)', () => {
    const e = productRowToPickerEntry(product({ mapper_status: 'matched', matched_basement_id: 'REF-1' }), null);
    expect(evaluatePickerReadiness(e).exactReady).toBe(false);
  });
});
