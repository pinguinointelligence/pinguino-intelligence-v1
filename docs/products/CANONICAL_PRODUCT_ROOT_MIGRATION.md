# Canonical product root migration

Migration `20260813110300_canonical_product_root_and_ingest.sql` makes
`public.products` the sole writable product identity root.

It preserves existing Global Catalog product and version UUIDs, copies their
immutable facts and behavior bindings, moves account-only facts to
`user_product_relations`, and retains the previous roots as read-only archives
behind compatibility views. It does not alter Mapper Basement or Engine science.

Every active Mapper row receives a deterministic internal `mapper_reference`
identity (`md5(pinguino:mapper-reference:<dataset>:<ingredient>)`) and immutable
V1 snapshot. Migration `20260813110400` publishes its canonical current behavior
binding; the stable join is `normalized_identity = mapper:<ingredient_id>` plus
`facts.mapperIngredientId` / `facts.mapperDatasetVersion`.

All normal intake sources use the service-role-only transaction:

```sql
ingest_product_v1(
  p_actor_user_id uuid,
  p_source text,
  p_idempotency_key text,
  p_input jsonb,
  p_evidence jsonb,
  p_private_overlay jsonb,
  p_risk jsonb
)
```

The transaction derives its own payload fingerprint, applies rate and
idempotency controls, resolves an identity, writes or reuses an immutable
version, attaches evidence, publishes an explicit behavior binding, creates or
consolidates review work, updates the private relation and records the result.
Unknown behavior is represented by a blocked binding; no Mapper value or Engine
science is guessed.

OCR can become verified/automatic only from an existing service-owned
attestation bound to the actor, terminal session, exact ready-image checksum
set, archived paths and exact validated public label facts. Without that proof,
the same ingest remains manual-unverified or blocked. Canonical search reads the
current version and binding with caller-private price/favorite data only from
`user_product_relations`; legacy catalog compatibility views are read-only and
exclude shared blocked products.

Object storage is intentionally outside the database transaction. An adapter
archives and checksum-verifies evidence first, then calls `ingest_product_v1`
once. A rolled-back ingest may leave an unreferenced archive object for a later
garbage-collection job, but cannot leave a partial product/version/binding.

`p_input.operation` is `upsert` by default and may be `retire`. Explicit
corrections and retirement carry `p_input.productId`; retirement is a soft
retirement that preserves all immutable history. `p_input.expectedStatusNot`
provides the atomic status guard used by enrichment/correction jobs. Customer
retirement is restricted to the caller's account-private product; shared or
internal retirement requires an active admin assignment. Successful returns
include `kind`, `productId`, `productVersionId`, `behaviorBindingId` and
`ingestEventId`; a retirement returns `kind: retired`. Administrative lifecycle
decisions use `p_input.lifecycleDecision` and `p_input.reviewEvidence`; the
database requires an active `admin_users` assignment and strict evidence for
`pi_verified`.

An exact Mapper mapping or revocation uses the same RPC with
`p_input.mapperDecision.mapperIngredientId` (explicit `null` means revoke), an
exact `productId`, and reviewed evidence/signoff. Only an active app admin may
authorize it; the Mapper target must be active, Base/Engine-approved and
verified. The transaction publishes a version-bound provisional binding and
immediately reclassifies it through the canonical classifier. A non-admin
`mapperCandidate` can create review evidence only and never grants Base/Main
permission.

Before staging deployment, apply the full migration ledger to a disposable
PostgreSQL database and run collision, count/fingerprint, rollback,
concurrency/idempotency and two-account RLS fixtures. The frontend/Edge adapter
must be updated before applying this migration because legacy direct writes are
revoked.
