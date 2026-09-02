# AGENT E — PERSISTENCE AND COST DIAGNOSTIC LEDGER

Nightly P0 program · 2026-07-24 · branch `worktree-agent-a28db60091b8bfd9c`
Scope: recipe/version repositories, costs repositories, repository tests, safe staging migration.
Staging ref verified via `get_project` before any write: **tunabqqrwabacxjcxxkz** (pinguino-staging,
ACTIVE_HEALTHY). Production `riwipywgqobrulyzrzad` untouched.

---

## E1 — TRANSACTIONAL FIRST SAVE

### Verdict: the first save was NOT transactional

Evidence (`src/services/proCore/supabaseRecipes.ts`, pre-change): `createRecipe` issued **three
sequential PostgREST client calls** — (1) `INSERT saved_recipes`, (2) `INSERT saved_recipe_meta`,
(3) `INSERT recipe_versions` (v1) — with a client-side **compensating DELETE** of the
`saved_recipes` row on failure (relying on FK `ON DELETE CASCADE` to sweep meta/version). The
compensation is best-effort only:

- a network drop / tab close between call (1) and the compensation leaves an **orphan
  `saved_recipes` row** (no meta, no v1) that the aggregate reads then treat as absent;
- the compensation itself is a fourth network call that can fail, and its failure is swallowed
  ("Best-effort — the surfaced error is always the real cause").

Migrations audit (read, not guessed): 0027 creates `saved_recipe_meta` + `recipe_versions`
(SELECT+INSERT-only RLS on versions — append-only by grant), 0028 production runs, 0029 costs.
None provides a transactional entry point; PostgREST cannot batch multiple table inserts into one
transaction without a function.

### Fix: `public.create_recipe_with_v1` (migration 0036) + adapter RPC path

- **Migration file**: `supabase/migrations/0036_create_recipe_with_v1.sql` — ONE plpgsql function
  performing the three inserts; a Postgres function body is atomic, so any failure rolls back all
  three (no orphan possible, no compensation needed).
- **Security**: `SECURITY INVOKER` (deliberately NOT definer) — every RLS policy from migrations
  0001/0027 still applies to each insert; the owner id and `created_by` are stamped from
  `auth.uid()` inside the function, never trusted from a parameter. `EXECUTE` granted to
  `authenticated` only; revoked from `public`/`anon`.
- **APPLIED to staging** `tunabqqrwabacxjcxxkz` (2026-07-24, `apply_migration`
  `0036_create_recipe_with_v1` → success). Post-apply audit (read-only SQL): function present,
  `security_definer=false`, EXECUTE grantees = `authenticated, postgres, service_role` (no anon).
- **Client adapter** (`src/services/proCore/supabaseRecipes.ts`): `createRecipe` now prefers the
  RPC. The original sequential path remains as the **explicit, documented non-transactional
  fallback**, activated ONLY by function-not-found (`PGRST202`/`42883`/"Could not find the
  function"); the probe result is memoized per adapter instance. Any other RPC error is surfaced
  honestly — never silently retried down the weaker path. Repository selection (the selector
  pattern) is unchanged; capability gates still run client-side before any write.
- **No default flip without proof**: the pre-existing legacy-path tests run unchanged (fake DB
  without the RPC) and stay green; a shape-parity test proves both paths return the same
  aggregate/version shape.

Tests (`src/services/proCore/supabaseRecipes.test.ts`, "E1:" block): RPC persists all three rows;
a failure inside the transaction persists NOTHING; PGRST202 activates the fallback; a real RPC
error is never retried down the fallback; shape parity; Demo capability refused before any write.
The fake client (`src/services/proCore/supabaseRecipesFake.ts`) models the function atomically
and returns the exact PostgREST function-missing error when disabled.

### Owner-run SQL (only if staging is ever re-provisioned)

The applied migration is byte-identical to `supabase/migrations/0036_create_recipe_with_v1.sql`;
run that file in the SQL editor of **staging only** (never `riwipywgqobrulyzrzad`).

---

## E2 — VERSIONS: PROOF TABLE

Contract suite `src/services/proCore/recipesRepositoryContract.test.ts` runs ONE behavioural
contract against three adapter shapes: in-memory (DEV singleton), Supabase adapter without the
RPC (legacy first save), Supabase adapter with the migration-0036 RPC. Plus the pre-existing
adapter suites (`supabaseRecipes.test.ts`, `proCoreRecipes.test.ts`).

| Guarantee | Proof | Result |
|---|---|---|
| Version continuation v1 → v2 → v3, ascending history, latest pointer advances | contract: "continues version numbering" (×3 adapters) | PASS |
| Restore creates a NEW version (v3 from v1), `source='restored'`, `restoredFromVersion=1`, target snapshot byte-identical after | contract: "restore creates a NEW version" (×3) | PASS |
| An earlier version is immutable across later saves (deep-equal before/after) | contract: "an earlier version is immutable" (×3) | PASS |
| Refresh/login: a fresh repository over the same store sees the history and continues numbering (v3 after reopen, never a reset to v1) | contract: "refresh/login" (×3); plus `supabaseRecipes.test.ts` S2 "survives a reload → v4" | PASS |
| User isolation on list reads | contract: "owner isolation" (×3); plus rename/archive/list suite | PASS |
| Concurrency: UNIQUE(recipe_id, version_number) violation → recompute + retry, gap-free numbering | `supabaseRecipes.test.ts` S2 retry test | PASS |
| DB-level append-only versions (UPDATE on `recipe_versions` refused) | `supabaseRecipes.test.ts` "refuses any UPDATE" | PASS |

**RLS assumptions — documented from the APPLIED migrations (not guessed).** Fakes cannot execute
Postgres policies; in the real DB: migration 0001 scopes `saved_recipes` by `auth.uid() = user_id`
(full CRUD own rows); migration 0027 scopes `saved_recipe_meta` (select/insert/update own) and
`recipe_versions` (**select + insert own ONLY — no UPDATE/DELETE policy or grant exists**, so
history cannot be rewritten even by a buggy client); grants: `authenticated` only, nothing to
`anon`. The adapter additionally owner-filters every list query, which is what the fake-backed
suite proves. Durability semantics: the in-memory adapter is session-scoped and honestly
non-durable (a reload clears it — surfaced by `isLocalDev`); the Supabase adapter persists across
refresh/login, proven by the reopen tests.

---

## E3 — COSTS DIAGNOSTIC: why cost/kg disappears after formulation

### Trace (code-grounded)

1. **Selected Product identity.** A picked product enters the recipe as an engine ingredient whose
   `id` is the PRODUCT identity `PR-ING-*` (`src/data/products/productEngineHandoff.test.ts`:
   `h.ingredient?.id === 'PR-ING-000010'` — "product identity"), linked to the canonical basement
   ingredient via `matched_basement_id: 'PI-ING-000180'`.
2. **User cost entry keying.** `ingredient_cost_entries.ingredient_id` (migration 0029) is ONE
   free-text id — whatever identity the entry was created under (product id, demo id, or
   canonical PI-ING-*).
3. **Formulation-added line identity.** FULL FORMULATION auto-fills unfilled roles from the
   approved toolbox (`src/features/formulation/formulate.ts`): the added line's item id is
   `formulation-<toolboxId>` and its `ingredient.id` is the **canonical toolbox/basement id**
   (`src/features/constraint-studio/applyPipeline.ts`: "the STABLE `ingredient.id`
   (PI-ING-* / canonical toolbox id)"). Real-catalogue basement ingredients typically carry
   `cost_per_kg: null` (unknown is preserved verbatim — `src/data/ingredients/ingredientMapper.ts`).
4. **Cost lookup.** `selectCurrentEntry` (`src/features/pro-core/costing.ts`) matched entries by
   **strict single-key equality** `e.ingredientId === ingredientId`. No canonical/alias mapping
   existed anywhere in the cost layer — an entry keyed `PR-ING-000010` can never price a line
   keyed `PI-ING-000180`, and vice versa.
5. **Recipe-cost calculation.** Two collapse points:
   - engine `computeRecipeCosts` (`src/engine/cost.ts`, out of E scope, documented masterplan
     §12.10 behaviour): ANY line with `cost_per_kg === null` ⇒ `complete:false` and **all money
     fields null** — so one formulation-added unpriced line makes the whole panel show "—";
   - data layer `buildRecipeCostSnapshot`: incomplete ⇒ `totalCost=null`, `costPerKg=null`; the
     per-line costs existed but no contract exposed an honest partial subtotal.

### Root cause

**Confirmed the prime suspect, plus a missing partial contract.** (a) Cost entries are keyed by a
single identity that PI-/formulation-added lines don't match (product `PR-ING-*` vs canonical
`PI-ING-*` / toolbox id), so lookups return `unknown`; (b) both cost computations then collapse
the WHOLE recipe cost to null instead of degrading to an explicit partial state.

### Fix (data layer + state contract only — no UI, no engine changes)

1. **Keying fix** (`src/features/pro-core/costing.ts`): `CostLineIdentity { ingredientId,
   aliasIds? }` + `resolveCostsForLines(entries, lines, options)` — each line is priced by its
   primary id first, then by its aliases IN ORDER; the first id with an applicable entry decides
   (a failing entry is reported honestly — aliases are never shopped for a better price);
   resolutions stay keyed by the line's primary id. `SnapshotLineInput` gains optional `aliasIds`
   (lookup-only — never stored on the frozen snapshot). Both repository adapters
   (`inMemoryCosts.ts`, `supabaseCosts.ts`) resolve snapshots through it. The plain
   `resolveCosts(ids)` port keeps its exact-id behaviour (back-compat, proven by test).
   Callers wire aliases from what they already know: a product line's
   `{ id: PR-ING-*, matched_basement_id: PI-ING-* }` pair yields
   `{ ingredientId, aliasIds: [theOtherId] }`.
2. **Three-state presentation contract** (`presentRecipeCost(snapshot)`, pure):
   - `complete` — every line priced: real `totalCost` + `costPerKg`;
   - `partial` — some lines priced: explicit `knownCost` subtotal, `pricedGrams`/`totalGrams`
     coverage, and a `missing[]` list with id + name + honest reason per unpriced ingredient;
     whole-recipe `totalCost`/`costPerKg` stay **null** — a gap is never averaged over or
     silently treated as 0;
   - `no_prices` — nothing priced (or no lines): only the missing list is meaningful.

### Tests (all three states + the formulation-added unpriced line)

`src/features/pro-core/costResolutionStates.test.ts`: complete / partial (with a
formulation-added `PI-ING-000123` line without a price — degrades, never collapses, lists the
gap) / no_prices / empty-snapshot; alias resolves product-keyed entry for a canonical line;
primary beats alias; failing primary reported (not shopped); deterministic alias order;
back-compat strict lookup; in-memory repository round-trip (snapshot strips `aliasIds`).
`supabaseCosts.test.ts` "E3:" case proves the backend adapter path. Existing incomplete-snapshot
honesty tests unchanged and green.

**Remaining consumer note (out of E scope):** the Studio panel reads engine
`result.costs` (`NutritionCostScorePanel`), which still renders the engine's all-or-nothing
result; wiring that surface to `presentRecipeCost` (and passing `aliasIds` from the product ↔
basement pair at snapshot build time) is UI work owned by the surface owners.

---

## GATES

| Gate | Result |
|---|---|
| `npx vitest run` (full suite) | 4787 passed, **14 failed — ALL pre-existing on clean main** (proven by a stash cycle: the same 14 fail at 4dfb097 with Agent E changes removed). They are the products-migration text-guard files under `src/features/ingredients/*` (0007-0011 guards, stale since the legacy-products retirement 0034/0035) — outside Agent E ownership; flagged as a separate background task. **Zero new failures from this branch; every Agent E suite green (125 focused tests).** |
| `npm run build` | PASS (only the long-standing chunk-size warning) |
| `npx eslint .` | PASS — 0 errors (2 pre-existing warnings elsewhere) |
| `npx tsc -b` | PASS |

## REMAINING OWNER ACTIONS

1. **Nothing required for staging DB** — migration 0036 is applied and audited (SECURITY INVOKER,
   no anon). If staging is ever re-provisioned, re-run
   `supabase/migrations/0036_create_recipe_with_v1.sql`.
2. **Production** (whenever the launch gate opens): apply 0036 alongside 0027-0029 — the client
   already prefers the RPC and falls back honestly until then.
3. **Cost surface wiring** (surface owners, not E): pass `aliasIds` (product id ↔
   `matched_basement_id`) into `buildSnapshot` lines and render `presentRecipeCost`'s three
   states instead of the engine's all-or-nothing `result.costs`.
4. Merge branch `worktree-agent-a28db60091b8bfd9c` after review.
