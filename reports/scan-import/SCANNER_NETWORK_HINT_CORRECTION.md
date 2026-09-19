# Scanner network-hint correction — 2026-09-19

## Scope and evidence

Start staging: `bdfcca6828cbb76f5ffe363e7b7280f58a154075`.
Historical desktop incident cause: **STILL NOT VERIFIED**.
Confirmed code behavior: `navigator.onLine=false` previously selected the pipeline's offline
branch before the ordinary authorized lookup. Explicit Scanner actions now separately grant
permission to attempt that request. The browser hint is retained. Offline-only callers and
non-authoritative cache behavior remain supported.

Transport errors produce a connection-to-service message. HTTP responses take precedence over
network-looking error text; 401/403 have access copy, 5xx/546 remain service errors, and structured
409 business verdicts retain their existing interpretation. Empty/non-object response payloads
fail as service errors. No Recognition, exact resolver, Mapper, readiness or routing changes.

Manual retry resumes the current operation and scan authority. A failed finalization retains its
session, input and assessment binding; it does not restart analyze/research. A rejected initial
research promise can be replaced only on the next explicit attempt, in the same session. Pending
and successful research remains shared. Double-click retry is guarded; no automatic retry loop.

## Canonical focused checklist

PASS below means deterministic local regression coverage, **not a live staging scan**.

| ID | Check | Status | Evidence |
| --- | --- | --- | --- |
| NET-01 | False browser hint + successful backend, manual and camera | PASS | `ScanFlow.networkHint.test.tsx`, two entry cases |
| NET-02 | Authoritative absence continues discovery | PASS | Same file, one analyze and automatic finalize |
| NET-03 | Genuine transport failure, honest retry, no false success/absence | PASS | Same file, failure then explicit barcode-preserving retry |
| NET-04 | 401/403 retain access-error meaning | PASS | Same file, both HTTP statuses |
| NET-05 | Structured 409 not-ready / stale assessment | PASS | Same file, both business verdicts |
| NET-06 | 500/546, malformed payload and server error envelope remain service failures | PASS | Same file, both statuses and five payload cases |
| NET-07 | NO_SAFE_RESULT / missing fields remain business data | PASS | Same file, genuine missing-total-solids form |
| NET-08 | Stale response cannot replace newer run | PASS | Existing `ScanFlow.currentScan.test.tsx`, ST17-CROSS-EAN and ST17-SAME-EAN |
| NET-09a | Research retry retains session and per-attempt sharing | PASS | `ScanFlow.networkHint.test.tsx` |
| NET-09b | Finalize retry retains values/input, no analyze replay, double-click guarded | PASS | Same file |
| NET-10 | Offline cache remains only a hint | PASS | Existing `pipeline.test.ts` and `offlinePersistence.test.ts` |
| NET-OWNER-DESKTOP | Owner desktop smoke on delivered canonical staging | NOT_TESTED | Owner action after delivery; no live scan during implementation |

## Completion ledger

1. Requested: bounded network hint, error mapping and safe manual retry correction.
2. Implemented: explicit request permission, truthful service errors, operation-preserving retry.
3. Production files: `ScanFlow.tsx`, `scannerStatusCopy.ts`, scan-import-v2 `contracts.ts`,
   `pipeline.ts`, `adapters/supabaseDiscoveryAdapter.ts`; plus one focused test file and this ledger.
4. Added tests: `src/features/scan-flow/ScanFlow.networkHint.test.tsx` (17 cases).
5. Exact focused command:

   ```sh
   npx vitest run src/features/scan-flow/ScanFlow.networkHint.test.tsx src/features/scan-flow/ScanFlow.currentScan.test.tsx src/features/scan-flow/ScanFlow.test.tsx src/scan-import-v2/__tests__/pipeline.test.ts src/scan-import-v2/__tests__/discoveryAdapter.test.ts src/scan-import-v2/__tests__/offlinePersistence.test.ts --reporter=dot
   npx eslint src/features/scan-flow/ScanFlow.networkHint.test.tsx src/features/scan-flow/ScanFlow.tsx src/features/scan-flow/scannerStatusCopy.ts src/scan-import-v2/contracts.ts src/scan-import-v2/pipeline.ts src/scan-import-v2/adapters/supabaseDiscoveryAdapter.ts
   git diff --check
   ```

   Final UI/adapter amendment rechecked with:

   ```sh
   npx vitest run src/features/scan-flow/ScanFlow.networkHint.test.tsx src/scan-import-v2/__tests__/discoveryAdapter.test.ts --reporter=dot
   npx eslint src/features/scan-flow/ScanFlow.networkHint.test.tsx src/scan-import-v2/adapters/supabaseDiscoveryAdapter.ts
   git diff --check
   ```

6. Local result: 6 files, 104 tests PASS; final UI/adapter amendment: 2 files, 35 tests PASS, including the additional server-error envelope case. Targeted lint and diff check PASS. An initial test fixture
   lacked the source confidence required by existing presentation rules; corrected the fixture.
7. Accepted flows retested: shared Scanner recipe/catalog flow, automatic finalization, current-run
   rejection, discovery adapter session contract, explicit offline-only/cache behavior.
8. Deployment: frontend only; delivery requires green required GitHub CI and canonical Vercel parity.
   Edge Functions, DB and production are untouched. No local full suite, build or live replay.
9. Remaining: Owner desktop smoke. Historical cause remains unproven.
10. External actions: Owner smoke after delivery. Other audit findings remain parked.
11. Git: isolated branch `codex/scanner-network-hint`; PR/merge/deployment evidence is reported in
    the delivery response. Unrelated Owner worktrees and changes were preserved.
