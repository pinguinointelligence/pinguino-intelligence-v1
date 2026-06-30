# Legacy `public.ingredients` — Cleanup Plan

> Analysis + options for the pre-v0.95 `ingredients` table. **No drop/alter performed** —
> every cleanup option is a destructive ALTER/DROP requiring explicit owner approval. 2026-06-29.

## Findings (read-only)
| property | value |
|---|---|
| rows | 542 (same set as `mapper_basement`) |
| columns | 67 — **including `npac_value`** (the only place it survives) |
| RLS | enabled, 1 policy |
| grants to `authenticated` | **none** → effectively inaccessible to app users |
| code references in `src/` | **none** (`.from('ingredients')` / `TABLE='ingredients'` not found; the active service uses `mapper_basement`) |
| migration history | created in `0004_ingredients.sql`; superseded by `0005_ingredients_final_v0_95_no_npac.sql` → `0006_mapper_basement.sql` |

**Conclusion**: `public.ingredients` is an **orphaned, superseded, access-locked** legacy table. It is the sole remaining carrier of `npac_value`, but it is NOT in the active product/engine pipeline (`products` + `mapper_basement` are both npac-free, verified). It is currently harmless (no grants, no code path).

## Options
1. **Leave as-is (default, zero-risk).** Orphaned + RLS + no grants = inert. Documented as deprecated. The `npac_value` invariant for the ACTIVE pipeline already holds.
2. **Drop the `npac_value` column** (`alter table public.ingredients drop column npac_value`). Removes the last npac trace. **Destructive ALTER → approval required.** Risk: low (no code reads it); irreversible without a backup.
3. **Rename to `ingredients_legacy_pre_v095`.** Makes deprecation explicit; non-data-losing but still an ALTER. Risk: anything (none found) referencing the name breaks. Low risk; reversible (rename back).
4. **Drop the table** (`drop table public.ingredients`). Fully removes it. **Destructive → approval + verified backup required.** Risk: irreversible; confirm no external/edge-function/backup-job dependency first.

## Recommendation
**Option 1 now** (leave inert; the active invariant holds), then **Option 4 (or 2) as a gated, approved migration** once the owner confirms nothing external depends on it. Before any drop: snapshot/export the 542 rows, confirm no Edge Function / external job reads `public.ingredients`, and stage it as its own reversible migration.

## Re-verified 2026-06-30 + non-destructive proposal staged
Live state re-confirmed: **542 rows · 67 columns incl. `npac_value` · 1 RLS policy · ZERO `src/` references**.
A **safe, reversible read-only-lock** proposal is staged (no DROP/column removal): [legacy_ingredients_readonly_lock.proposal.sql](legacy_ingredients_readonly_lock.proposal.sql) — it lives under `docs/` (NOT `supabase/migrations/`) so it is never auto-applied; a human promotes it to a real migration after confirming no external dependency. A guard test (`src/services/legacyIngredients.guard.test.ts`) asserts no service reads the legacy `ingredients` table, keeping it safe to lock/archive. The destructive drop stays OUT of the proposal (hard-stop).

## Guardrails
- Do **not** drop/alter autonomously (hard-stop list: destructive ALTER / DROP).
- The active "no `npac_value`" rule is enforced for `products` + `mapper_basement` + live code regardless of this table's fate.

See [MAPPER_IMPLEMENTATION_STATUS.md](MAPPER_IMPLEMENTATION_STATUS.md).
