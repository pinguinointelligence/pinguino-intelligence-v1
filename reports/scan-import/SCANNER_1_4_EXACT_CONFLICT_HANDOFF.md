# Scanner 1.4 — EXACT_CONFLICT client handoff

## Scope

Start staging: `7a0a817d0411366cae612268c066705633bb60c7` (moved from
`732306b95e7ea60411eb0a2fbbfed2097b27f36a` through PR #455).

Client-only conflict handoff and endpoint-specific response integrity. Reuse the existing
`ambiguous` result and ScanFlow screen. No live collisions, scans, Edge, DB/RPC/migrations,
Recognition, Mapper, readiness, routing or network handling changes.

Current analyze conflict responses contain caller-visible `productIds` only, before creating a
server session. Preserve those IDs and the validated request's canonical identity; do not invent
names, versions, visibility, ownership or readiness. Ambiguous candidates may therefore carry
only their product ID. They are not selectable exact products.

## Canonical focused checklist

Statuses describe isolated local mocked contracts, never a live staging collision.

| ID | Check | Status |
| --- | --- | --- |
| S14-CONFLICT-01 | Analyze 409 conflict → ambiguous, never researched | PASS |
| S14-CONFLICT-02 | Candidate IDs and canonical identity survive adapter → discovery, including label | PASS |
| S14-CONFLICT-03 | Existing ScanFlow conflict screen; no finalize/import, including earlier exact | PASS |
| S14-CONFLICT-04 | Conflict needs no persisted session/session lookup | PASS |
| S14-CONFLICT-05 | Malformed candidate identity fails closed, including earlier exact | PASS |
| S14-CONFLICT-06 | Unknown/cross-endpoint/error/malformed analyze responses fail closed | PASS |
| S14-CONFLICT-07 | Finalize structured not-ready/stale/family contracts preserved | PASS |
| S14-CONFLICT-08 | Authoritative absence's normal ean_lookup path still auto-finalizes; skipped response retained | PASS |
| S14-CONFLICT-09 | Existing exact product success preserved | PASS |
| S14-CONFLICT-10 | Late conflict cannot replace newer same/different-EAN run | PASS |

## Parked operation

DB-OPS-01 — EXACT RPC MIGRATION HISTORY RECONCILIATION: **PARKED**.
The active 20-column RPC contract is current; migration history lacks `20260915170000` and
`20260915173000` (previous read-only closure evidence). No repair/reapply here. This is not a
functional blocker for this handoff fix.

## Delivery ledger

1. Requested scope: terminal EXACT_CONFLICT handoff, endpoint-specific structured responses,
   fail-closed response integrity, existing flow regression coverage and staging delivery.
2. Completed locally: analyze conflict maps directly to the existing ambiguous result, through
   initial discovery, label analysis and revalidation of an earlier exact hit. No session-based
   continuation or finalize after conflict. Analyze contract errors cannot revive the earlier hit.
   Endpoint-specific HTTP allowlists preserve finalize business verdicts. The existing customer
   conflict screen is reused without UI/ScanFlow production edits.
3. Production files: scan-import-v2 `contracts.ts`, `discovery/contracts.ts`,
   `discovery/discovery.ts`, `adapters/supabaseDiscoveryAdapter.ts`, `pipeline.ts`.
   Additional files: this ledger and `src/features/scan-flow/ScanFlow.exactConflict.test.tsx`.
4. New tests: the focused file above, 32 mocked cases covering the ten IDs individually.
   Existing regression test files were not modified.
5. Exact commands executed:

   ```sh
   npx vitest run src/features/scan-flow/ScanFlow.exactConflict.test.tsx --reporter=dot
   npx vitest run src/features/scan-flow/ScanFlow.exactConflict.test.tsx src/features/scan-flow/ScanFlow.networkHint.test.tsx src/features/scan-flow/ScanFlow.currentScan.test.tsx src/features/scan-flow/ScanFlow.test.tsx src/scan-import-v2/__tests__/discoveryAdapter.test.ts src/scan-import-v2/__tests__/discovery.test.ts src/scan-import-v2/__tests__/pipeline.test.ts --reporter=dot
   npx eslint src/scan-import-v2/contracts.ts src/scan-import-v2/discovery/contracts.ts src/scan-import-v2/discovery/discovery.ts src/scan-import-v2/pipeline.ts src/scan-import-v2/adapters/supabaseDiscoveryAdapter.ts src/features/scan-flow/ScanFlow.exactConflict.test.tsx
   git diff --check
   ```

6. Results: initial pre-fix run reproduced researched/discovered_pending and lost conflict;
   22 failures/8 passes also included a test-fixture error (null external port), corrected before
   acceptance. First combined run: 141 PASS. Final combined run after adding label/skipped coverage:
   **143 PASS in 7 files**. Targeted ESLint and diff check PASS. No local full suite/build/contracts.
7. Accepted flows retested: explicit false-online-hint requests, safe retries, service vs transport
   failures, ordinary discovery/automatic finalize, exact successes, stale same/different-EAN
   rejection, existing scan-session adapter and readiness/business response mappings.
8. Deployment: frontend only. Required GitHub CI, merge and canonical Vercel SHA parity are delivery
   gates; their final evidence is reported in the delivery response. No Edge or DB deployment.
9. Remaining: delivery gates at commit time; no live collision or additional Owner scan required.
10. External/operational item: DB-OPS-01 remains parked under separate authority, not a functional
    blocker here. No production action authorized or taken.
11. Git: isolated `codex/scanner-exact-conflict`, minimal seven-file change; unrelated worktrees and
    Owner changes preserved. PR/merge/final clean status recorded in the delivery response.
