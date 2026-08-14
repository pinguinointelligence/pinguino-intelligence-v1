# Canonical product ingest adapter matrix

Authority: `catalog-submit` captures/validates caller-owned evidence and invokes the
service-role-only `ingest_product_v1` transaction exactly once. Browser code never
sets verification, Mapper mapping, taxonomy, Main policy, or module permissions.

| Source | Previous write path | Canonical write path | Migrated | Tested |
|---|---|---|---:|---:|
| OCR quick scan | OCR session → `importProductCatalog` → mutable `products`, then catalog RPC | reviewed session/evidence → `productIngest` → `catalog-submit` → `ingest_product_v1` | yes | focused + boundary |
| Multi-image OCR | same two-write flow | same single canonical transaction after server evidence capture | yes | focused + boundary |
| Manual product form | direct `products.insert` | `createProduct` compatibility adapter → canonical ingest | yes | focused + boundary |
| Barcode scan/enrichment | direct guarded `products.update` + best-effort snapshot | guarded canonical update/version through ingest | yes | focused + boundary |
| ProductScanPage | `persistSessionAndSave` private save + contribution | `persistSessionAndSave` injects canonical persistence into duplicate UX | yes | focused |
| `catalog-submit` Edge | preflight RPC + snapshot RPC + catalog submit RPC | one `ingest_product_v1` RPC | yes | boundary + security |
| Spreadsheet/CSV/catalog import | browser loop → direct products create + optional snapshot | browser loop → compatibility adapter → canonical ingest per row | yes (row-atomic) | focused |
| Administrator product creation/review | generic root update | privileged source DTO through canonical adapter/RPC | yes | boundary + admin gate |
| Retailer/supplier feed | no previous writer | `retailer_feed` / `supplier_specification` source adapter | yes (adapter) | source contract; served fixture pending staging |
| Shop | no previous writer | `shop` source adapter | yes (adapter) | source contract; served fixture pending staging |
| Franchise | no previous writer | `franchise` source adapter | yes (adapter) | source contract; served fixture pending staging |
| Internal subproduct | no canonical path | `internal_subproduct`; account-private root/relation policy | yes (adapter) | source + migration; served RLS pending staging |
| Future integration | generic API/direct root | `future_integration` source adapter, no frontend taxonomy deployment | yes (adapter) | source contract; no-redeploy fixture pending staging |

CSV/XLSX import is explicitly **row-atomic**. Each stable row key is idempotent; a
failed row rolls back its own product/version/binding/relation transaction and the
summary reports it. A future batch-atomic import must be a server batch wrapper over
the same ingest authority, never a browser transaction simulation.

Rows marked `yes (adapter)` have no pre-existing customer UI/feed writer to
migrate. Their executable source adapters and server source contracts are
present; end-to-end served proof remains a staging acceptance step, not a second
implementation path.
