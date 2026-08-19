# Production Rescue staging QA

Date: 2026-08-19

## Exact targets

| System | Identity |
|---|---|
| Supabase staging | `pinguino-staging`, ref `tunabqqrwabacxjcxxkz`, `ACTIVE_HEALTHY` |
| Vercel staging | `pinguino-staging`, project `prj_6h8PDTCUrdDdXNzfEfjJNsVL5BcE`, `staging.pinguinoai.com` |
| Supabase public production | `pinguino-intelligence-v1`, ref `riwipywgqobrulyzrzad` — untouched |
| Vercel public production | `pinguino-intelligence`, `www.pinguinoai.com` — untouched |

No credential, JWT, API key, service-role value or private candidate payload is recorded in this report.

## Database integration

- Supabase CLI: `2.115.0`.
- Pre-apply `supabase db push --dry-run --linked`: exactly `20260819031000_production_rescue_event_state.sql`; no seed or role change.
- Apply: exactly `20260819031000_production_rescue_event_state.sql` on staging.
- Post-apply migration list: local/remote `20260819031000` match.
- Post-apply dry-run: remote database is up to date.
- The forward migration changes only the existing trigger function and permits `rescue_applied` only while its owned run is `in_progress`. It performs no DML, table rewrite or ACL change.

The staging database lint still reports three pre-existing, unrelated global-catalog errors: two inserts into the non-updatable `global_catalog_variants.image_phashes` view projection and one insert into the non-updatable `catalog_product_behavior_bindings.main_eligibility` projection. No Rescue/Production function lint error was reported.

## Authenticated served run

| Field | Result |
|---|---|
| Saved recipe | `QA Production Rescue 2026-08-19`, version 4 |
| Recipe ID | `0fb7b366-2a54-4c93-9d0a-88090ab15181` |
| RecipeVersion ID | `5e1d9828-4f44-4b14-a679-2e7b61ffd218` |
| Production run | `3ebbfe29-e4a3-4141-9225-ca47625f0d5e` |
| Served deviation | Strawberry plan 838 g, confirmed 837 g |
| Trusted option | `leave_as_is` / `Zostaw tak` |
| Preview | 999 g, 10/10, no correction instructions |
| Authorization | `e09324bb-84dc-4715-b9da-f64a858285cd` |
| Candidate fingerprint | `00ae1fa089b4ecc03e7042574c687f1b4f1e80731e51749f0fd3f46e0bf7c9ed` |
| Authorization basis | actual revision 4, Rescue revision 0 |
| Authorization TTL | `2026-08-19T13:42:54.555441Z` to `2026-08-19T13:47:54.482Z` |
| Authorize response | HTTP 200 from `production-rescue-authorize` |
| Consume response | HTTP 200 from `production_consume_rescue_authorization_v1` |
| Consume idempotency key | `1076c97f-1176-4eb1-b81c-bc86776a62c4` |
| Durable result | actual revision 4, Rescue revision 1, target Strawberry 837 g |
| Audit event | exactly one `rescue_applied`, ID `8bff77ae-c5d2-4154-8b02-63e7e6c8dd62` |
| Recovery | PASS after reopening the exact saved version; 837 g plan and 10/10 restored |
| Cleanup | run archived as `cancelled` at `2026-08-19T13:46:18.486082Z`; audit retained |

The first consume attempt before this migration returned SQLSTATE `23514` because the historical event-state trigger did not know `rescue_applied`; the transaction rolled back and the plan stayed unchanged. The forward repair was applied, the Preview was freshly re-authorized, and the second consume succeeded atomically.

## Browser evidence

- The browser request to authorize contained only run ID, stable option, expected actual/Rescue revisions and an idempotency key.
- The browser consume request contained only authorization ID, expected revisions and the idempotency key.
- After consume, the server run returned Rescue revision 1 and exactly one `rescue_applied` event.
- No console exception, HTTP response >=400 or `Network.loadingFailed` occurred during the successful retest and archive.
- Raw CDP replay is not supported by the connected browser. Exact consume replay remains proven by repository/RPC idempotency tests, not claimed as a second served HTTP observation.

## Kiwi and Fructose

- Canonical regression: Kiwi request 8000 g -> certified 706 g maximum in a 1000 g batch, first rejected 707 g, one proof attempt; no hang.
- A previously served mixed-composition QA recipe legitimately resolved to 454 g rather than 706 g because its complete composition and locks differed from the canonical fixture.
- Fructose `PI-ING-000496` is suggested only as a manual search when the closest safe sweetness Preview remains below target. It is never auto-inserted.
