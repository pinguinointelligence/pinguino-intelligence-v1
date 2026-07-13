import { describe, expect, it, vi } from 'vitest';
import { createSupabaseProductCatalog } from './supabaseProductCatalog';
import { searchPickerCatalogue } from '@/features/product-picker';
import type { ProductRow } from '@/data/products/productRow';
import type { ReferenceEngineValues } from '@/data/products/productEngineResolver';

const row = (over: Partial<ProductRow>): ProductRow =>
  ({
    id: 'row-1',
    product_code: 'PR-1',
    product_name_display: 'Lindt Excellence 70%',
    product_name_internal: null,
    brand: 'Lindt',
    ean_code: '3046920022606',
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

describe('createSupabaseProductCatalog (mocked client)', () => {
  it('maps owner rows to picker entries via the injected reader (no real backend)', async () => {
    const listProducts = vi.fn(async () => [row({}), row({ id: 'row-2', product_name_display: 'Jameson', brand: 'Jameson', product_category: 'whisky' })]);
    const port = createSupabaseProductCatalog({ listProducts });

    const entries = await port.fetch({ text: 'lindt' });
    expect(listProducts).toHaveBeenCalledOnce();
    expect(entries).toHaveLength(2);

    // The pure ranker then filters/sorts the mapped entries.
    const results = searchPickerCatalogue({ text: 'lindt' }, entries);
    expect(results.map((r) => r.entry.productId)).toEqual(['row-1']);
    expect(results[0]?.readiness.exactReady).toBe(false); // no reference → honest not-ready
  });

  it('resolves a matched reference through the injected lookup (read-only)', async () => {
    const reference: ReferenceEngineValues = { ingredient_id: 'REF-1', pac_value: 120, pod_value: 30 };
    const listProducts = vi.fn(async () => [row({ mapper_status: 'matched', matched_basement_id: 'REF-1' })]);
    const lookupReference = vi.fn(async (id: string) => (id === 'REF-1' ? reference : null));

    const port = createSupabaseProductCatalog({ listProducts, lookupReference });
    const [entry] = await port.fetch({ text: '' });
    expect(lookupReference).toHaveBeenCalledWith('REF-1');
    expect(entry?.reference).toEqual(reference);
  });

  it('never calls the reference lookup for an unmatched row', async () => {
    const listProducts = vi.fn(async () => [row({ matched_basement_id: null })]);
    const lookupReference = vi.fn(async () => null);
    const port = createSupabaseProductCatalog({ listProducts, lookupReference });
    await port.fetch({ text: '' });
    expect(lookupReference).not.toHaveBeenCalled();
  });
});
