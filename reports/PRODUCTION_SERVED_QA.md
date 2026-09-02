# Production served QA

Date: 2026-08-19

## Verdict

Authenticated staging Production and trusted Rescue are operational. The original blank/contradictory prerequisite state is gone; ProductBehavior blocks are readable and actionable, and a server-authorized Rescue Preview can be consumed atomically and recovered after reopening the saved version.

## Served evidence

| Check | Result |
|---|---|
| Exact staging domain | `https://staging.pinguinoai.com` |
| Supabase staging | `pinguino-staging` / `tunabqqrwabacxjcxxkz` |
| Edge function | `production-rescue-authorize`, ACTIVE, JWT required |
| Production run | `3ebbfe29-e4a3-4141-9225-ca47625f0d5e` |
| Trusted Preview | HTTP 200, `leave_as_is`, 999 g, 10/10 |
| Atomic consume | HTTP 200, returned the same run ID |
| Durable Rescue | revision 1, Strawberry target 837 g |
| Audit | exactly one `rescue_applied` event |
| Recovery | exact run and target recovered after reopening version 4 |
| Cleanup | archived/cancelled, not deleted |
| Successful retest console/network | no exception, HTTP >=400 or loading failure |
| Public production | unchanged and untouched |

## Honest blocking behavior

The separate Milk Base QA recipe remained blocked because its milk, cream and SMP ProductBehavior process evidence is unknown. This is correct fail-closed behavior; the QA did not invent or bypass process evidence.

The connected browser does not support raw CDP replay of an already completed XHR. Therefore served replay is not overstated: exact-authorize retry and exact-consume replay are covered by executable repository/RPC tests, while the live staging evidence proves one successful authorization, one successful atomic consume and one durable audit event.
