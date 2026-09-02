# Canonical product root and ingest audit

## Final identity authority

`public.products` is the only writable product identity root. Immutable public
facts live in `product_versions`; the current server classification lives in
`product_behavior_bindings`; evidence, ingest events and consolidated review
cases are separate append/audit relations. Account data lives only in
`user_product_relations`.

`global_catalog_products` and `global_catalog_product_versions` are read-only
compatibility views. Their former tables are locked archives and all legacy
submit/classify writers are revoked. `mapper_basement` remains a separate,
read-only scientific source; deterministic `mapper_reference` products bind it
to the canonical product/version model without modifying its 2,088 rows.

## One write boundary

Every normal source adapter calls:

```text
authenticated adapter -> catalog-submit -> ingest_product_v1
```

The Edge adapter authenticates, performs the durable cheap preflight, captures
owned evidence and invokes the service-role-only RPC once. The RPC owns identity,
duplicate resolution, immutable versioning, verification, classification,
behavior publication, review aggregation, private relation/favorite and the
ingest audit event in one transaction.

Browser services no longer insert/update/delete `public.products` directly.
Legacy product CRUD functions are compatibility adapters to canonical ingest;
retirement and administrator lifecycle/Mapper decisions use guarded operations
of the same RPC. A repository boundary test rejects reintroduction of direct
root writes or the retired catalog submit RPCs.

## Visibility and privacy

- Shared, non-blocked product facts are discoverable through safe projections
  and resolver/search RPCs.
- Blocked shared candidates are visible only to their creator/contributor or an
  administrator through scoped functions.
- `account_private` and `internal_subproduct` products remain owner-private.
- Private price, supplier, note and stock are never copied into shared versions
  or behavior snapshots.
- Shared-root mutation requires the administrator, owning account or original
  creator; merely contributing duplicate evidence does not grant version-write
  authority.

## Migration invariants

The forward migration preserves legacy UUIDs and version chains, creates a
version and explicit ready/blocked behavior binding for every active canonical
product, migrates private overlays, and publishes current pointers last. Any
identity collision, missing pointer, incomplete Mapper backfill or dangling
relationship aborts the transaction. Object-storage evidence uses durable
preflight/finalization plus compensating cleanup for failures outside the SQL
transaction.

## Runtime proof still required

Static parser, source-contract and unit/integration tests prove the candidate
shape. Actual row counts, two-account RLS, concurrency, Edge evidence capture and
future-product behavior must still be executed after applying the pending
migrations/function to the linked staging project. Production is out of scope.
