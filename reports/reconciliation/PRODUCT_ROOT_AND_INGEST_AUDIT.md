# Canonical product root and ingest audit

## Root A — legacy owner product evidence

- Table: `public.products` from logical migration 0007.
- Ownership: one row per owner; RLS permits owner CRUD.
- Writers: `src/services/products.ts`, catalog import, OCR save flow and manual/admin import surfaces.
- Readers: product management, OCR duplicate matching, Mapper review and the current `catalog-submit` bridge.
- Versioning: narrow best-effort `product_snapshots`; not the canonical shared immutable catalog version.

## Root B — shared global catalog

- Tables: `global_catalog_products`, immutable `global_catalog_product_versions`, variants, aliases, evidence bindings, private account relation, review/rate/audit tables.
- Ownership: shared service-controlled facts; caller-private relations remain owner-scoped.
- Writers: service-role RPCs behind `catalog-submit`.
- Readers: catalog search, picker, recipe Base/Topping handoff, UPI classification/resolver.
- Versioning: current pointer plus immutable product-version snapshots.

## Final authority

`global_catalog_products` + `global_catalog_product_versions` are the canonical growing product identity/version root. `mapper_basement` remains locked, separate and read-only. `public.products` may remain a compatibility/source-evidence relation during migration, but cannot remain an independent customer intake root.

## Current blocker

The shipped OCR path still performs:

```text
browser OCR -> owner public.products write -> catalog-submit -> global catalog product/version
```

The required final path is:

```text
any source adapter -> catalog-submit/ingest_product_v1 -> global product/version/evidence/binding
                                              -> caller-private relation (when applicable)
```

The current `catalog-submit` contract requires `privateProductId` and `ocrSessionId`, and the hardened SQL reads `public.products%rowtype`. Therefore OCR, barcode, manual, admin, spreadsheet, supplier and retailer inputs do not yet share one transaction or one DTO. Treating the legacy row as “just an adapter” without changing this writer would leave two write authorities and is not accepted.

## Safe migration rule

- Existing legacy rows remain readable for migration and duplicate evidence.
- New customer intake must not receive direct INSERT/UPDATE grants on technical/verification/policy fields.
- Migration to the shared root is idempotent and records the legacy ID as provenance, not as the behavior authority.
- After backfill, unresolved recipes/products are marked for revalidation; no automatic GREEN or Main envelope is invented.
