# Staging migration dependency graph

Status: local history reconciled; deployment pending and blocked by architecture review.

## Authoritative histories

- Local reconciliation branch before repair: short versions `0001` through `0045`.
- Linked staging history: 41 timestamped versions from `20260716101413` through `20260812034500`.
- `supabase migration fetch --project-ref <staging>` recovered the exact SQL stored in the staging migration ledger into an isolated forensic directory. No migration body was fabricated.
- No timestamped migration file was present in any Git worktree or reachable Git path before the fetch.
- Deployable local history now contains the 41 exact staging versions plus three forward-only catalog/UPI versions at `20260813110000`..`20260813110200`.

## Logical dependency graph

```text
remote 20260716101413..20260717134505
  (logical 0001..0031)
        |
        +--> remote 20260723231007 (logical 0036 create_recipe_with_v1)
        |
        +--> remote 20260809194001 (Mapper 2088 seed)
               |
               +--> remote 20260809194002 (Mapper authenticated search)
               +--> remote 20260809194003 (Mapper Demo search)
               +--> remote 20260809194004 (customer ingredient prices)
               +--> remote 20260809194005 (owner/RLS hardening)
                       |
                       +--> remote 20260810125404 (process metadata schema)
                              |
                              +--> remote 20260810165100 (process metadata seed)
                                     |
                                     +--> remote 20260810165300 (read-only assertion)
                                            |
                                            +--> remote 20260812034500 (recipe composition)
                                                   |
                                                   +--> logical 0043 Global Catalog
                                                          |
                                                          +--> logical 0044 trust hardening
                                                                 |
                                                                 +--> logical 0045 Unified Product Intelligence
                                                                        |
                                                                        +--> reconciliation follow-up
```

## Object dependencies

| Logical migration | Requires | Creates/changes | Deployment rule |
|---|---|---|---|
| 0043 | `auth.users`, legacy `products`, OCR evidence/session tables, Mapper tables | canonical shared catalog root, versions, variants, aliases, relations, review/rate/audit tables | Must run after the exact fetched staging history. |
| 0044 | every 0043 catalog object plus verification review/signoff tables and storage evidence | trust-bound submission, attestation, current-version mapping, private catalog data, hardened search/RLS | Must run after 0043 in the same release. |
| 0045 | 0043 product/version root, 0044 current-version mapping, Mapper 2088, process metadata | taxonomy, policy, Mapper/catalog behavior bindings, resolver, audits | Must run after 0044. It does not modify Mapper source data. |
| follow-up | logical 0043-0045 | one canonical ingest, deterministic behavior classification, legacy compatibility/backfill, consumer audit | Still required before staging deployment. |

## Repair rule

The timestamped files fetched from staging are the historical authority. The short local copies are development-era aliases and contain later edits that staging did not execute under those versions. They must not be marked applied or pushed as old versions. Exact remote files are restored under their timestamped names; any intentional delta is carried by a new forward-only migration after the linked staging head. Logical 0043/0044/0045 remain ordered and are assigned new timestamped deployment versions because linked staging has never applied them.

The final linked dry-run is clean with respect to history and proposes only the three new forward migrations. No repair operation was needed. Production migration history is out of scope and remains untouched.
