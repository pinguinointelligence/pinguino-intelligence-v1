# Production Rescue authorization schema

Date: 2026-08-19

Migration: `20260819024500_production_rescue_authorization.sql`

## Private proof

`private.production_rescue_authorizations` is not part of the browser API. Direct privileges are revoked from `public`, `anon`, `authenticated` and `service_role`; only the narrow SECURITY DEFINER functions can create or consume a proof.

Each proof binds:

- authenticated owner and personal account;
- exact run and immutable recipe-version UUID;
- caller-basis actual and Rescue revisions;
- Edge source, ProductBehavior, request and candidate SHA-256 fingerprints;
- independent database source, ProductBehavior and complete-proof SHA-256 fingerprints;
- private whole-gram recipe candidate and product-composition authority;
- stable option ID;
- Engine, config, practical-recipe and Rescue-model versions;
- generated bundle, source-closure and bundler identities;
- safe Preview metadata;
- authorize idempotency key, authorization/expiry timestamps;
- one-time consume identity, actor, event and consume idempotency key.

Authorization lifetime is at most five minutes.

## RPC boundary

`production_create_rescue_authorization_v1` is executable only by `service_role`. It checks service identity, owner/account, Pro entitlement, exact active run/version, both revisions, Engine/config, ProductBehavior and all fingerprints before inserting one proof.

`production_consume_rescue_authorization_v1` is executable only by `authenticated`. Its browser input is limited to authorization UUID, expected actual revision, expected Rescue revision and consume idempotency key. It locks both proof and run, rechecks owner, Pro, expiry, both revisions, source/PB/proof fingerprints and Engine/config, then calls the internal cumulative Rescue validator and atomically marks the proof consumed.

Direct execution of `production_apply_rescue_v1` is revoked from browser and service roles. The browser cannot submit a candidate to any executable Rescue write RPC.

## Atomicity and retry

- authorize retries with the same account/key and byte-equivalent semantic request return the original proof;
- mismatched reuse of a key is rejected;
- consume generates its event UUID in PostgreSQL;
- exact lost-response consume replay returns the same run without another snapshot/event/revision;
- stale/cross-account/expired/tampered proof is rejected;
- Rescue write, event insert, revision update and consumed marker share one transaction, so any failure rolls everything back.

Staging execution and RLS evidence are recorded separately in `PRODUCTION_RESCUE_STAGING_QA.md` after deployment.
