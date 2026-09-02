# Product Intake and Versioning

## Intake boundary

All concrete commercial products use the existing shared catalog core/version domain. Source adapters may collect different evidence, but they must enter the same server transaction and produce an immutable `global_catalog_product_versions` row. Migration 0045 attaches one post-version classifier trigger, so OCR, manual completion, admin correction and future imports cannot select separate behavior logic.

Supported ingest source vocabulary is recorded in `unified_product_ingest_events`:

`ocr`, `barcode`, `manual`, `admin`, `catalog_import`, `retailer_feed`, `spreadsheet`, `supplier_specification`, `shop`, `franchise`, `internal_subproduct`, `future_integration`.

`internal_subproduct` remains owner-private and must not be published automatically. Ambiguous intake must ask whether it is a commercial product or an own mixture.

## Required order

1. capture immutable evidence;
2. normalize facts without invented values;
3. exact/likely duplicate resolution;
4. reuse/create identity;
5. create immutable product version;
6. verify facts;
7. authorize exact Mapper mapping;
8. classify versioned behavior;
9. persist binding/review case;
10. expose server resolver result;
11. update only caller-owned favorite/recent/private commercial data.

The catalog implementation in migrations 0043/0044 owns evidence, duplicate, rate-limit and product-version gates. Migration 0045 does not duplicate those state machines; it begins only at the immutable version boundary.

## Material changes

Ingredients, nutrition, allergens, net quantity, EAN, ABV, declared concentration, mapping or verification changes create a new immutable version. The behavior binding is keyed to the exact version. A current pointer changes only after the full accepted transaction.

Recipe versions store their behavior snapshots. Product correction therefore invalidates a staged Preview but cannot mutate a previously saved recipe.

## Idempotency and abuse

Catalog submission retains server-side account/IP/device reservations, image checksums/hashes, duplicate collapse, escalation limits and audit events. `unified_product_ingest_events` adds a unique `(source,idempotency_key)` reconciliation ledger after accepted version creation.

## External deployment requirement

This repository cannot prove the linked runtime until migration history is deliberately reconciled, `catalog-submit` is deployed, and required risk/OCR/Turnstile configuration is present. Do not repair migration history or set secrets automatically.
