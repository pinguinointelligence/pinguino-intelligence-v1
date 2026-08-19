# Production Rescue adversarial QA

Date: 2026-08-19

## Local contract matrix

| Attack / race                                                      | Expected result                  | Local status                            |
| ------------------------------------------------------------------ | -------------------------------- | --------------------------------------- |
| Browser adds `recipeInput` or candidate grams to authorize request | Reject unexpected field          | PASS                                    |
| Browser supplies candidate fingerprint/user ID                     | Reject unexpected field          | PASS                                    |
| Unknown stable option                                              | Reject                           | PASS                                    |
| Stale actual revision                                              | No authorization                 | PASS                                    |
| Stale Rescue revision                                              | No authorization                 | PASS                                    |
| Cross-owner run                                                    | No authorization/data projection | PASS                                    |
| Missing/inactive run                                               | No authorization                 | PASS                                    |
| Engine/config drift                                                | No authorization                 | PASS                                    |
| Candidate not emitted by canonical Engine                          | No authorization                 | PASS                                    |
| ProductBehavior failure/timeout                                    | No authorization                 | PASS                                    |
| Automatic Fructose addition                                        | Reject                           | PASS                                    |
| Direct authenticated `production_apply_rescue_v1`                  | Privilege revoked                | PASS by migration contract              |
| Other account consumes proof                                       | Reject                           | PASS by migration contract              |
| Expired/tampered proof                                             | Reject                           | PASS by migration contract              |
| Exact authorize retry                                              | Same proof                       | PASS                                    |
| Exact consume replay                                               | Same run, no second write        | PASS                                    |
| Changed actual/Rescue after Preview                                | CAS reject and refresh required  | PASS                                    |
| Event or Rescue write fails                                        | Whole transaction rolls back     | PASS by transactional fake/SQL contract |

## Staging adversarial evidence

Pending final green-gate deployment. The served run IDs, authorization IDs and sanitized HTTP/RPC outcomes will be added here without tokens, secrets or private recipe payloads.
