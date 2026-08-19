# Production Rescue adversarial QA

Date: 2026-08-19

## Contract matrix

| Attack / race | Expected | Result |
|---|---|---|
| Browser adds recipe input, grams, fingerprint or user ID to authorize | Reject unexpected field | PASS |
| Unknown stable option | Reject | PASS |
| Stale actual or Rescue revision | No authorization/consume | PASS |
| Cross-owner, missing or inactive run | No data projection | PASS |
| Engine/config/model/bundle drift | No authorization | PASS |
| Candidate not emitted by canonical Engine | No authorization | PASS |
| ProductBehavior failure or timeout | No authorization | PASS |
| Automatic Fructose insertion | Never | PASS |
| Direct authenticated `production_apply_rescue_v1` | Privilege revoked | PASS |
| Other account consumes proof | Reject | PASS |
| Expired/tampered proof | Reject | PASS |
| Exact authorize retry | Same proof | PASS in executable logic tests |
| Exact consume replay | Same run, no second write | PASS in executable repository/RPC tests |
| Changed actual/Rescue after Preview | CAS reject and refresh | PASS |
| Event/Rescue write failure | Whole transaction rolls back | PASS; observed rollback on historical trigger mismatch |
| `rescue_applied` with non-active run | SQLSTATE 23514 | PASS by exact trigger allowlist test |

## Staging evidence

- The first live consume exposed the historical trigger mismatch and returned HTTP 400 / SQLSTATE `23514`. The run remained at Rescue revision 0 and the UI explicitly reported that the plan was unchanged: rollback PASS.
- `20260819031000_production_rescue_event_state.sql` was dry-run, applied only to staging and independently reviewed. It adds only the `rescue_applied` + `in_progress` lifecycle pair.
- A fresh authorization then returned HTTP 200 and atomic consume returned HTTP 200.
- The durable server record moved from Rescue revision 0 to 1 and contains exactly one `rescue_applied` event.
- Reopening the exact RecipeVersion recovered the authorized 837 g target and 10/10 result.
- The QA run was archived/cancelled through the owner UI; it was not deleted.
- The successful retest produced no console exception, failed network load or HTTP >=400 response.

## Evidence boundary

Raw CDP XHR replay is not supported by the connected browser. No JWT or session token was read to work around that limitation. Replay/idempotency is therefore attributed to executable code/RPC tests, while the served claim is limited to the successful 200 authorize, 200 consume, one durable revision and one event.
