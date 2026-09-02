import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ingestProduct } = vi.hoisted(() => ({
  ingestProduct: vi.fn(async () => ({
    kind: 'created',
    productId: 'product-fixture',
  })),
}));

vi.mock('./productIngest', () => ({ ingestProduct }));

import {
  ingestAdministratorProduct,
  ingestBarcodeProduct,
  ingestFranchiseProduct,
  ingestFutureIntegrationProduct,
  ingestImportedCatalogProduct,
  ingestInternalSubproduct,
  ingestManualProduct,
  ingestOcrProduct,
  ingestRetailerProduct,
  ingestShopProduct,
  ingestSpreadsheetProduct,
  ingestSupplierSpecificationProduct,
} from './productSourceAdapters';

describe('canonical product source adapters', () => {
  beforeEach(() => ingestProduct.mockClear());

  it('routes every declared source through the one canonical Edge/ingest boundary', async () => {
    const routes = [
      ['ocr', ingestOcrProduct],
      ['barcode', ingestBarcodeProduct],
      ['manual', ingestManualProduct],
      ['admin', ingestAdministratorProduct],
      ['catalog_import', ingestImportedCatalogProduct],
      ['spreadsheet', ingestSpreadsheetProduct],
      ['retailer_feed', ingestRetailerProduct],
      ['supplier_specification', ingestSupplierSpecificationProduct],
      ['shop', ingestShopProduct],
      ['franchise', ingestFranchiseProduct],
      ['internal_subproduct', ingestInternalSubproduct],
      ['future_integration', ingestFutureIntegrationProduct],
    ] as const;

    for (const [source, route] of routes) {
      ingestProduct.mockClear();
      await route({ idempotencyKey: `adapter:${source}:fixture`, input: { displayName: 'Fixture' } });
      expect(ingestProduct).toHaveBeenCalledOnce();
      expect(ingestProduct).toHaveBeenCalledWith(expect.objectContaining({ source }));
    }
  });
});
