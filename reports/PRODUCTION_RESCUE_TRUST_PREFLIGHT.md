# Production Rescue trusted-runtime preflight

Date: 2026-08-19

Branch: `codex/production-monitor-recovery`

Base HEAD / `origin/staging`: `91e83ae6c1763fda1253ce884b7309afa0148099`

## Recovery and scope

- Recovery directory: `/Users/tomaszboro22/Developer/_pinguino_recovery/production-rescue-trust`
- Base patch SHA-256: `89b48f8a75d93af43dd814a4da77cf866fb6f73785cc773409611ace1017b6ae`
- Base untracked archive SHA-256: `14e6a1a8cdde343d25d13830645f95a1325ef3d380d21c32a2d43b4f33c3d7f3`
- Owner report `reports/MAC_MAIN_STATE_STAGING_RELEASE.md` remains untracked and excluded.
- Public production Supabase ref `riwipywgqobrulyzrzad` is out of scope and untouched.

## Exact staging identities

| System                | Identity                                                           | Preflight result                    |
| --------------------- | ------------------------------------------------------------------ | ----------------------------------- |
| Supabase              | `pinguino-staging`, ref `tunabqqrwabacxjcxxkz`, region `eu-west-1` | Linked, `ACTIVE_HEALTHY`            |
| Vercel                | `pinguino-staging`, project `prj_6h8PDTCUrdDdXNzfEfjJNsVL5BcE`     | Read-only identity confirmed        |
| Served staging domain | `staging.pinguinoai.com`                                           | Alias belongs to `pinguino-staging` |

## Pending staging database closure

Read-only command:

```text
supabase db push --dry-run --linked
```

Exact result: only these two forward migrations would be applied; no seeds or roles:

1. `20260819023000_production_transactional_rpc.sql`
2. `20260819024500_production_rescue_authorization.sql`

No migration or remote database write occurred during this preflight.

## Immutable authority checks

- Engine formulas: no working-tree diff under `src/engine`.
- Mapper Basement migration SHA-256: `3c59e5a23a30b9d209e584d5cc8f2085c40a1888808d3182b2f3092ecb7ba4df`.
- Mapper CSV SHA-256: `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38`.
- Official logo SHA-256: `b1c85e5a47fb25ab296668e17a04f33df56d6701aba4525d2fd9ee6fd72b7721`.

## Pre-deployment stop rule

All three independent reviews and every local repository gate are green with no open P0/P1/P2. The code is ready for the authorized staging-only integration phase.

Deployment remains fail-closed if the staged Edge runtime, PostgreSQL rollback/RLS checks, authenticated Owner flow or served Vercel QA fails. No public-production target is permitted.
