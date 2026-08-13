# Catalog Product Behavior Audit

## Static completeness contract

Migration 0045 creates service-only `catalog_product_behavior_audit_v1`. It enumerates every active catalog product with a LEFT JOIN to its current exact-version binding, including `UNKNOWN_REQUIRES_REVIEW`; rows cannot disappear through an inner join.

Reported fields include current product/version/status, exact Mapper binding, family/subfamily/form, Main eligibility, module/profile/process permissions, warnings, block reasons, classifier version and binding status. Private price, supplier, note, stock, favorite/recent state and user identity are excluded.

## Current counts

Exact active linked-staging counts are **UNPROVABLE in this workspace**. The linked migration ledger is out of sync, migrations 0043–0045 have not been dry-run against the linked database, and `catalog-submit` is not deployed/configured there. Reporting zero would be false.

After audited migration-history reconciliation, the required command is a service-role export of:

```sql
select * from public.catalog_product_behavior_audit_v1 order by catalog_product_id;
```

Acceptance requires row count equality with `global_catalog_products where is_active`, unique product IDs, exact status/UNKNOWN reconciliation and no stale version binding.
