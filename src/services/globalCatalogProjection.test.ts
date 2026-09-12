import { describe, expect, it } from 'vitest';
import { mapSearchRow } from './globalCatalog';

describe('server ProductBehavior readiness projection', () => {
  it('PRING-READINESS-01 does not revoke TOPPING=true for an unmapped commercial PR', () => {
    const hit = mapSearchRow({
      id: 'haribo-product-id',
      current_version_id: 'haribo-version-id',
      entity_kind: 'commercial_product',
      status: 'verified',
      verification_method: 'automatic',
      provenance: 'customer_added_scanner_v1',
      display_name: 'Sandía',
      original_name: 'Sandía',
      original_language: 'es',
      brand: 'Haribo',
      canonical_family: 'confectionery',
      category: 'Candies',
      product_form: 'solid',
      mapped_ingredient_id: null,
      markets: ['ES'],
      retailers: [],
      eans: ['8426617014254'],
      aliases: [],
      favorite: false,
      recently_used_at: null,
      usable_in_base: false,
      main_allowed: false,
      usable_as_topping: true,
      blocked_reason: null,
      missing_fields: ['ingredients_text', 'allergens_text'],
      invalid_fields: [],
      public_data: { productCode: 'PR-ING-007205' },
      private_price: null,
      private_currency: null,
      relevance: 1,
    });

    expect(hit).toMatchObject({
      productCode: 'PR-ING-007205',
      mappedIngredientId: null,
      usableInBase: false,
      usableAsTopping: true,
      missingFields: ['ingredients_text', 'allergens_text'],
    });
  });
});
