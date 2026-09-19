# Scanner Runtime Step 1.7 — OFF live lineage closure

Scope is Step 1.7 only. Step 1.6 remains paused/deferred by Owner. Steps 1.8, 1.9 and all later
checklist sections remain **NOT REVIEWED**. This document does not grade them.

## Data lineage before

| Boundary        | Before                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Input from      | Confirmed EAN after Scan Core                                                                                                                 |
| Producer        | Browser `createOpenFoodFactsEvidencePort().research()` and independent server `product-scan-analyze` lookup                                   |
| Output          | Two unrelated OFF representations: client `ExternalEvidence` and server `result_json.externalSources[]`                                       |
| Persisted where | Server sources in `product_scan_sessions.result_json` and `product_scan_external_sources`; client source appended later only to `result_json` |
| Read by         | Recognition/prefill read the client object; finalize/profile read a mixture of server session and client `automaticEvidence`                  |
| Passed as       | Client family was passed as `customerFamily`; client facts as `automaticEvidence`                                                             |
| Downstream      | `applyAutomaticEvidence`, semantic classification, session result, product profile, normalized evidence rows                                  |
| Readback        | Session JSON could contain client OFF + server OFF + retailer while normalized rows contained only server OFF + retailer                      |
| Loop closed     | **NO**                                                                                                                                        |

## Data lineage after

| Boundary        | After                                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input from      | Confirmed EAN plus per-run context (`accountId`, canonical GTIN, `ctx.now`)                                                                                                  |
| Producer        | The server `product-scan-analyze` `ean_lookup`; its exact GELLATTI lookup precedes its one direct OFF GET                                                                    |
| Output          | One canonical server session result with one logical OFF receipt (`sourceType`, exact EAN, URL, confirmation method/time, receipt ID, fields used, automatic authority)      |
| Persisted where | `product_scan_sessions.result_json.externalSources[]`; the same result is atomically projected by `complete_product_scan_ean_lookup_v1` into `product_scan_external_sources` |
| Read by         | `canonicalRegistryIdentityFromScanResult`, ledger construction, finalize, semantic classification, profile authority and readback/re-evaluation                              |
| Passed as       | `canonicalResult` for client presentation/prefill; server session ID for finalize. No OFF fields or family are sent back as customer authority                               |
| Downstream      | Recognition presentation, prefill, deterministic/server semantic classification, profile/readiness, session trace, normalized source persistence, stored product facts       |
| Readback        | Repeated finalize returns the saved product; rescans reconstruct from stored canonical facts and reuse the same source lineage                                               |
| Loop closed     | **YES in code; focused Owner tests remain NOT_TESTED until explicitly authorized**                                                                                           |

## Authority and request count

- Before: two application-originated physical OFF requests on a normal authenticated GELLATTI MISS
  (browser OFF GET + server OFF GET).
- After: one application-originated physical OFF request (server exact-EAN GET). The early
  Recognition prefetch and `startDiscovery` share one server promise keyed by account, GTIN and
  scan-run time. The browser OFF adapter is not wired into production ports.
- The bounded server fallback may research missing manufacturer/retailer fields. Any OFF fact it
  reports is filtered before merge, so it cannot create another OFF receipt or populate competing
  OFF fields.
- Canonical OFF authority: server-verified exact-EAN `product-scan-analyze` receipt.

## Pass-forward closure

| Consumer                       | Input field                        | Source object                  | Field read / value                                                                           | Persisted location                                        | Next consumer                | Unambiguous |
| ------------------------------ | ---------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------- | ----------- |
| `recognitionPresentation`      | name, brand, quantity              | `canonicalResult`              | Only exact server receipt fields listed in `fieldsUsed`; safe presentation name              | no separate presentation persistence                      | customer Recognition line    | YES         |
| `recognized`                   | canonical registry view            | `canonicalResult`              | Same server-selected values                                                                  | React temp state only                                     | label/field UX               | YES         |
| Former `automaticEvidenceRef`  | n/a                                | removed                        | No browser evidence object survives as authority                                             | n/a                                                       | n/a                          | YES         |
| `prefillFromIdentity`          | product fields                     | canonical server receipt view  | Exact receipt allowlist only                                                                 | React temp values                                         | explicit completion form     | YES         |
| `family`                       | explicit choice only               | customer action                | Automatic family never calls `setFamily`                                                     | `validation_json.customerFamily` only after action marker | later finalize rounds        | YES         |
| finalize request               | session ID, explicit confirmations | server session + customer form | No automatic OFF replay; family action includes `evidenceOrigin=customer_action`             | Edge request                                              | V2 contract                  | YES         |
| V2 finalize contract           | `automaticEvidence`, confirmations | request envelope               | Legacy automatic bundle can only reference an existing canonical receipt; cannot add facts   | none                                                      | `applyAutomaticEvidence`     | YES         |
| `applyAutomaticEvidence`       | source, EAN, URL                   | canonical session result       | validates matching server receipt; returns session result unchanged                          | session result                                            | semantic evidence extraction | YES         |
| semantic classification/family | identity/category/ingredients      | `corrections.result`           | OFF yogurt may resolve `dairy_liquid` with `DETERMINISTIC`; no customer reason/evidence refs | `validation_json.recognition`                             | Mapper/profile authorities   | YES         |
| session result                 | `corrections.result`               | finalize authority             | canonical logical sources deduplicated by provider/URL/exact EAN                             | `product_scan_sessions.result_json`                       | trace/save/readback          | YES         |
| external-source persistence    | `result.externalSources`           | same persistence RPC call      | replacement projection, not append                                                           | `product_scan_external_sources`                           | audit/readback               | YES         |
| later readback                 | stored facts/source trace          | saved version/session          | same canonical source lineage                                                                | product version facts + session validation                | exact rescan/re-evaluation   | YES         |

## Dependency map — downstream steps are not graded

| Downstream boundary                        | What it needs from 1.7               | Where it reads it                                  | Linking identifier                  | Expected source                           | Actual source after fix                          | Unambiguous |
| ------------------------------------------ | ------------------------------------ | -------------------------------------------------- | ----------------------------------- | ----------------------------------------- | ------------------------------------------------ | ----------- |
| Label continuation (step not graded)       | accepted identity and remaining gaps | `DiscoverySession.result`, `missingCritical`       | session UUID + canonical GTIN       | canonical server result                   | canonical server result                          | YES         |
| Finalize/profile (step not graded)         | facts, provenance, exact barcode     | session `result_json`, `barcode`                   | session UUID                        | server receipt + explicit customer fields | server receipt + explicit customer fields        | YES         |
| Semantic/Mapper boundary (step not graded) | truthful family source               | semantic evidence + persisted recognition          | evidence fingerprint + session UUID | deterministic/server or explicit customer | deterministic/server unless action marker exists | YES         |
| Product save (step not graded)             | one assessed source package          | `p_scan_result`, assessment hash                   | session UUID + idempotency key      | finalized canonical result                | finalized canonical result                       | YES         |
| Normalized audit rows (step not graded)    | parity with session sources          | persistence RPC projection                         | session UUID                        | `result_json.externalSources[]`           | same array, replacement semantics                | YES         |
| Exact rescan/readback (step not graded)    | saved evidence and authority         | stored product facts → `scanResultFromStoredFacts` | exact GTIN + product/version ID     | saved canonical lineage                   | saved canonical lineage                          | YES         |

## Canonical Do przetestowania

The pasted QA specification is recorded here but is not executed without a separate explicit Owner
instruction. Automatic PR CI may run normally.

| Stable ID                | Short name                                                | Status     |
| ------------------------ | --------------------------------------------------------- | ---------- |
| ST17-SINGLE-OFF          | Authenticated MISS has one canonical OFF lineage          | NOT_TESTED |
| ST17-PROV-FAMILY         | Automatic OFF family never persists as customer-confirmed | NOT_TESTED |
| ST17-CROSS-EAN           | EAN-1 cannot modify runtime state after EAN-2 is active   | NOT_TESTED |
| ST17-PERSIST-PARITY      | Session and normalized source persistence have parity     | NOT_TESTED |
| ST17-IDEMPOTENT-EVIDENCE | Repeated finalize does not duplicate OFF evidence         | NOT_TESTED |
| ST17-GELLATTI-HIT        | Exact GELLATTI product outranks early lookup              | NOT_TESTED |
