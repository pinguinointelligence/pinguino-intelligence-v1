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
| Administrator product creation/review | generic root update | privileged source DTO through canonical adapter/RPC | seam ready | boundary |
| Retailer/supplier feed | no complete writer | `retailer_feed` / `supplier_specification` source DTO | seam ready | source contract |
| Shop | no complete writer | `shop` source DTO | seam ready | source contract |
| Franchise | no complete writer | `franchise` source DTO | seam ready | source contract |
| Internal subproduct | no canonical path | `internal_subproduct`; account-private root/relation policy | seam ready | source + migration |
| Future integration | generic API/direct root | `future_integration` source DTO, no frontend taxonomy deployment | seam ready | source + migration |

CSV/XLSX import is explicitly **row-atomic**. Each stable row key is idempotent; a
failed row rolls back its own product/version/binding/relation transaction and the
summary reports it. A future batch-atomic import must be a server batch wrapper over
the same ingest authority, never a browser transaction simulation.
