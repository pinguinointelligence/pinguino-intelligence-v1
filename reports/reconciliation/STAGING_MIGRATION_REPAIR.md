# Staging migration repair ledger

Status: local history reconciliation complete; remote application deliberately not executed.

## Before local history

- Short local versions: `0001`..`0045`.
- Logical `0043`, `0044`, and `0045` are new candidate migrations and are not present in linked staging history.
- Short files contain a mixture of exact historical statements, formatting changes, and later hardening edits.

## Before remote history

- 41 applied timestamped versions.
- First: `20260716101413_0001_auth_my_recipes.sql`.
- Last: `20260812034500_recipe_composition_toppings_and_defaults.sql`.
- Missing locally before forensic fetch: every one of those 41 timestamped filenames.
- Linked `migration list` therefore reported every short local version as pending and every timestamped remote version as missing locally.

## Discovery action

`supabase migration fetch` was run against linked staging in an isolated temporary project. It recovered the exact stored statements and names for all 41 remote versions. This is legitimate history recovery, not reconstructed SQL and not a migration-history repair.

## Schema difference

Pending exact comparison. Known facts:

- most logical `0001`..`0029` local differences are a one-character cleanup of a historical double semicolon;
- later logical migrations contain real post-application hardening/formatting deltas;
- logical `0034` and `0035` have no applied remote counterpart;
- logical `0043`..`0045` have no applied remote counterpart.

No remote schema equivalence is assumed until the forward plan and dry-run are proven.

## Repair action

1. Restored the 41 exact fetched history files under their authoritative timestamped names.
2. Moved development-era short-name copies `0001`..`0042` out of the deployable directory into `supabase/migration_sources/legacy_short_sequence/`; no SQL was discarded.
3. Kept unapplied catalog/UPI migrations forward-only as:
   - `20260813110000_global_product_catalog.sql`
   - `20260813110100_global_product_catalog_trust_hardening.sql`
   - `20260813110200_unified_product_intelligence.sql`
4. Linked only the isolated reconciliation worktree to staging.
5. Did not run `migration repair`, `db push`, or any remote mutation.

## After local history

- 41 exact timestamped entries match the staging ledger one-for-one.
- Three new forward-only migrations are pending after the staging head.
- Short aliases and the two reviewed/destructive legacy cleanup candidates remain available as source history outside `supabase/migrations` and cannot be applied accidentally.

## After remote history

Unchanged: 41 applied timestamped versions ending at `20260812034500`. Production remains untouched.

## Final dry-run

`npx supabase db push --dry-run --linked` exits 0 and would apply exactly the three new migrations above. It does not propose any historical replay or repair. Deployment remains blocked by unresolved product-root/ingest/resolver-consumer requirements, so the dry-run was not followed by a push.
