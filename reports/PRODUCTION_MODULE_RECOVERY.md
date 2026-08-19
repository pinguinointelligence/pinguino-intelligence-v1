# Production module recovery

Date: 2026-08-19

Branch: `codex/production-monitor-recovery`

Starting SHA: `91e83ae6c1763fda1253ce884b7309afa0148099`

## Current result

The original blank Production screen is repaired locally. Route state is authoritative, the recipe editor stays mounted, prerequisites are discriminated and actionable, start is explicit, real version UUIDs are used and stale/missing durable runs fail closed.

The forward-only migration `20260819023000_production_transactional_rpc.sql` now provides:

- active Pro entitlement and exact owner/recipe/version enforcement;
- `ON DELETE RESTRICT` for run history;
- atomic start and completion;
- one active exact batch per owner/version/batch with advisory serialization;
- exact full-vector actual writes and unique operator chronology;
- structured cumulative Rescue snapshots and append-only events;
- caller-basis CAS across both actual and Rescue revisions;
- strict JSON number/null/whole-gram validation;
- revocation of direct authenticated table writes.

The Supabase adapter and local reference adapter share the same revision contract. Server-returned vectors are hydrated as physical authority while compatible unconfirmed drafts may be preserved locally. Persisted v4 sessions migrate to v5 with explicit zero revision bases.

## Trusted Rescue closure

The browser no longer calculates or submits a Rescue candidate. The staging Edge Function rebuilds the authoritative run and calls the generated exact shared `assessProductionRescue` Engine bundle. A service-only authorization binds the selected option, run, exact immutable version, actual/Rescue revisions, ProductBehavior and Engine/config/bundle fingerprints. The authenticated browser can only consume that one-time authorization.

Direct `production_apply_rescue_v1` execution is revoked. Authorize/consume are idempotent and CAS-bound, with atomic rollback and a five-minute proof lifetime.

## QA status

- Production/Repository/Edge focused: PASS; independent reviews P0=0/P1=0/P2=0.
- Full suite: 521/521 files, 6591/6591 tests PASS.
- Supabase linked dry-run: exactly two pending forward migrations; no seeds or roles.
- Staging database write/run ID: none.
- Public production: untouched.
