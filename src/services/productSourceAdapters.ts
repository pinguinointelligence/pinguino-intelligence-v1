import {
  ingestProduct,
  type ProductIngestRequest,
  type ProductIngestResult,
  type ProductIngestSource,
} from './productIngest';

export type ProductSourceAdapterRequest = Omit<ProductIngestRequest, 'source'>;
export type ProductSourceAdapter = (
  request: ProductSourceAdapterRequest,
) => Promise<ProductIngestResult>;

/** Every channel is a thin evidence DTO adapter. Product identity, version,
 * verification, Mapper binding and behavior remain owned by ingest_product_v1. */
const adapter = (source: ProductIngestSource): ProductSourceAdapter =>
  (request) => ingestProduct({ ...request, source });

export const ingestOcrProduct = adapter('ocr');
export const ingestBarcodeProduct = adapter('barcode');
export const ingestManualProduct = adapter('manual');
export const ingestAdministratorProduct = adapter('admin');
export const ingestImportedCatalogProduct = adapter('catalog_import');
export const ingestSpreadsheetProduct = adapter('spreadsheet');
export const ingestRetailerProduct = adapter('retailer_feed');
export const ingestSupplierSpecificationProduct = adapter('supplier_specification');
export const ingestShopProduct = adapter('shop');
export const ingestFranchiseProduct = adapter('franchise');
export const ingestInternalSubproduct = adapter('internal_subproduct');
export const ingestFutureIntegrationProduct = adapter('future_integration');

