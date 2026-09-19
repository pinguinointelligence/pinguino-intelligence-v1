# Scanner 1.5 — external evidence outcome correction

Scope is Scanner 1.5 Phase A only. Scanner 1.6 and Recognition 3.2 are not entered. The checks
below are focused local regressions; staging Edge deployment and Owner runtime acceptance belong to
Phase B.

## Canonical Do przetestowania

| Stable ID  | Short name                                           | Coverage                                                           | Status     |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------------------ | ---------- |
| S15-FIX-01 | OFF 404 is definitive no-record                      | `externalEvidenceOutcome.test.ts`                                  | PASS_LOCAL |
| S15-FIX-02 | OFF timeout is retryable, never no-record            | `externalEvidenceOutcome.test.ts`                                  | PASS_LOCAL |
| S15-FIX-03 | OFF 429 stays rate-limited                           | `externalEvidenceOutcome.test.ts`                                  | PASS_LOCAL |
| S15-FIX-04 | OFF 5xx/network exception is unavailable             | `externalEvidenceOutcome.test.ts`                                  | PASS_LOCAL |
| S15-FIX-05 | OFF malformed JSON/schema is malformed               | `externalEvidenceOutcome.test.ts`                                  | PASS_LOCAL |
| S15-FIX-06 | OFF failure plus valid fallback retains evidence     | `externalEvidenceOutcome.test.ts`                                  | PASS_LOCAL |
| S15-FIX-07 | Both providers fail without finalize                 | `externalEvidenceOutcome.test.ts`, `ScanFlow.networkHint.test.tsx` | PASS_LOCAL |
| S15-FIX-08 | Explicit provider notFound resolves no-record        | `externalEvidenceOutcome.test.ts`                                  | PASS_LOCAL |
| S15-FIX-09 | Empty/malformed/refused fallback is an error         | `structuredProviderOutput.test.ts`                                 | PASS_LOCAL |
| S15-FIX-10 | Label refusal is failed, not completed               | `structuredProviderOutput.test.ts`                                 | PASS_LOCAL |
| S15-FIX-11 | Empty label output is failed                         | `structuredProviderOutput.test.ts`                                 | PASS_LOCAL |
| S15-FIX-12 | Malformed/schema-invalid label JSON is failed        | `structuredProviderOutput.test.ts`                                 | PASS_LOCAL |
| S15-FIX-13 | Valid partial label output merges cumulatively       | `structuredProviderOutput.test.ts`                                 | PASS_LOCAL |
| S15-FIX-14 | Identical photo replay keeps one identity            | `labelAnalysisRequest.test.ts`                                     | PASS_LOCAL |
| S15-FIX-15 | Different second photo uses bounded accurate pass    | `labelAnalysisRequest.test.ts`, `discoveryAdapter.test.ts`         | PASS_LOCAL |
| S15-FIX-16 | Third/exhausted photo is blocked before provider     | `labelAnalysisRequest.test.ts`, `discoveryAdapter.test.ts`         | PASS_LOCAL |
| S15-FIX-17 | Failed provider payload has a bounded retry identity | `labelAnalysisRequest.test.ts`                                     | PASS_LOCAL |
| S15-FIX-18 | Provider unavailable keeps label/retry action        | `discovery.test.ts`, `ScanFlow.networkHint.test.tsx`               | PASS_LOCAL |
| S15-FIX-19 | Failed retry preserves prior valid evidence          | `liveEvidenceQuota.migration.test.ts`                              | PASS_LOCAL |
| S15-FIX-20 | Stale response cannot alter a newer run              | `ScanFlow.currentScan.test.tsx`                                    | PASS_LOCAL |
| S15-FIX-21 | Exact product/no-product/conflict remains unchanged  | `ScanFlow.exactConflict.test.tsx`, exact lookup suites             | PASS_LOCAL |
| S15-FIX-22 | Network-hint correction remains unchanged            | `ScanFlow.networkHint.test.tsx`                                    | PASS_LOCAL |

Focused command result: 12 files, 186 tests passed. Targeted ESLint passed. No full Vitest,
`npm test`, build, `verify:staging`, live scan or deployment was run in Phase A.
