# Production Rescue Edge Function audit

Date: 2026-08-19

Function: `production-rescue-authorize`

## Trust boundary

The browser request schema contains exactly:

```text
runId
stableOptionId
expectedActualRevision
expectedRescueRevision
idempotencyKey
```

Recipe vectors, ingredient facts, candidate grams, ProductBehavior facts, candidate fingerprints and user/account IDs are rejected as unexpected fields.

The function verifies the JWT with `auth.getUser`, checks the existing active-Pro server authority, binds the personal account to the authenticated UID, and reads only an owned active run plus its exact immutable recipe version, frozen plan, full actual vector, cumulative Rescue snapshot and event history.

## Canonical shared Engine

The function imports a generated single-file ESM runtime built from the real `src/features/production-workspace/productionRescue.ts` dependency graph. No formula is copied into the Edge adapter.

| Item                     | Exact identity                                                     |
| ------------------------ | ------------------------------------------------------------------ |
| Engine                   | `0.4.0`                                                            |
| Config                   | `0.7.0`                                                            |
| Practical recipe         | `pro-whole-gram-v1`                                                |
| Production Rescue        | `production-rescue-v1`                                             |
| Bundler                  | Rolldown `1.0.3`                                                   |
| Bundle SHA-256           | `1072f345fc5dbe24de6a2ef1e340db831192bf049b4e8a890a3a559488b8e1e7` |
| Source-closure SHA-256   | `170e07b896430a1c6fc8c1055f898b54c3fe88d1f8479f21a2573dfeb39e7d69` |
| Bundle size              | 209,992 bytes                                                      |
| Source files             | 43                                                                 |
| External/dynamic imports | 0 / 0                                                              |

`production-rescue:bundle-check` builds twice, requires byte-identical output and module closure, rejects browser/client modules and verifies the committed bundle, manifest and metadata.

## Server candidate checks

- requested stable option must exist in the regenerated canonical assessment;
- `verifiedByEngine` must be true;
- every candidate gram is non-negative and whole;
- candidate base grams total the exact target batch;
- ProductBehavior snapshots are complete and revalidated by the database authority;
- Engine/config and immutable version identities match the run;
- automatic Fructose addition is rejected;
- candidate, source, ProductBehavior and request fingerprints are generated server-side;
- only safe Preview copy plus the authorization identity/fingerprint/basis/expiry is returned.

## Deadline and leakage controls

- ProductBehavior authority has an absolute 15-second deadline; SQL checks it after ProductBehavior, before insert and after insert so a late transaction rolls back.
- The transport has a separate 17-second response timeout, allowing the database deadline to return safely. A lost response is retried with the same authorization idempotency key.
- PostgreSQL `statement_timeout = '15s'` is function-scoped and hoisted by PostgREST for the current REST transaction.
- statement timeout maps to the exact `product_behavior_timeout` state.
- failed/timed-out authority cannot persist a partial authorization transaction.
- no service-role key, JWT, private candidate, ProductBehavior payload or private database proof is returned or logged.
- Supabase JS is pinned to `jsr:@supabase/supabase-js@2.112.3`; Deno check used Deno `2.9.5`.

## Local verification

- `deno check`: PASS.
- canonical source/generated runtime parity fixtures: PASS.
- Edge request, Engine, fingerprint, timeout and safe-projection tests: PASS.
- staging deploy/runtime checks: pending the final green-gate deployment phase.
