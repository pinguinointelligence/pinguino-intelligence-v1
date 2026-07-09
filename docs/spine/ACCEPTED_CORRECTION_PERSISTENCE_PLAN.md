# Accepted Correction Persistence — design & non-applied migration preview

_Created 2026-07-09 (Spine Slice 16). Companion to [PINGUINO_SPINE.md](../PINGUINO_SPINE.md) and
[TEMPERATURE_AWARE_TARGET_BANDS_PLAN.md](../engine/TEMPERATURE_AWARE_TARGET_BANDS_PLAN.md)._

**Status: DESIGN ONLY. No migration applied, no DB write, no live correction record, no recipe
mutated.** This slice prepares the FIRST real write path (saving an accepted optimizer correction)
without opening it. The write itself is a later, explicitly-approved slice.

---

## 1. Persistence architecture audit (what exists today)

| Concern | Current state |
|---|---|
| Recipe saves | `public.saved_recipes` via `src/services/recipes.ts` — the ONLY DB access for recipes; TanStack hooks on top; UI never touches the client directly |
| Source of truth | `saved_recipes.recipe_input` (jsonb) — the engine recomputes everything; **no calculated values stored** |
| Ownership | `user_id uuid references auth.users(id) on delete cascade` |
| RLS pattern | per-verb owner policies `auth.uid() = user_id` (select/insert/update/delete), table grants to `authenticated` only (migration `0002`), `anon` gets schema usage only |
| Keys | client uses the anon key + user JWT; **no privileged server role anywhere** |
| Migrations | `supabase/migrations/NNNN_snake_name.sql`, applied via SQL editor / `supabase db push`; next number is `0012` |
| Capabilities | `src/access/plans.ts`: `saveRecipes` (free + pro), `exactCorrectionGrams` (pro only); `useAccess()` derives the tier from real auth + subscription |
| Audit conventions | `created_at`/`updated_at` defaults + `touch_updated_at` trigger; provenance stamps `engine_version`/`config_version` on every saved recipe |

**New table vs saved-recipe metadata:** a separate `accepted_corrections` table. Reasons:
a correction must also work for a recipe that was never saved (snapshot-carrying); `saved_recipes`
rows are **never mutated** by a correction (hard rule); and a correction is an immutable audit
record with its own provenance, while `recipe_input` stays the single clean source of truth.

## 2. What will be saved (the draft contract, already implemented as pure code)

`src/features/optimization/acceptedCorrectionDraft.ts` — `AcceptedCorrectionDraft`,
`buildAcceptedCorrectionDraft`, `validateAcceptedCorrectionDraft`. Pure; no DB client; nothing
writes. One draft =

- `ownerId` / `createdBy` (must match; from the signed-in user),
- `recipeId` (saved recipe, optional) **or** the full `originalRecipeSnapshot` for unsaved recipes,
- `sourceRecipeHash` (deterministic FNV-1a over the original snapshot — drift detection at write time),
- `originalRecipeSnapshot` + `correctedRecipeSnapshot` (verbatim `RecipeInput` JSON; never mutated),
- `optimizerDecision` (**only** `optimized` | `tradeoff` — blocked/impossible/no_action are rejected),
- `correctionActions` (exact gram actions), `beforeMetrics` / `afterMetrics`,
- `targetMode` (`engine_seeded` | `regulator_shadow`), `productProfile`, `servingTemperatureC`,
- `warnings` + `trace` (rerun state, improvement flag, injected metrics, regulator profile),
- `engineVersion` / `configVersion` provenance (same convention as saved recipes),
- `schemaVersion` (`'1'`).

The top-level key set is **closed** (`ACCEPTED_CORRECTION_DRAFT_KEYS`); the validator rejects any
extra key, so no product PAC/POD write, Mapper field, or status flag can ride along. `created_at`
is a DB default (`now()`), keeping the builder deterministic.

**Capability rule:** saving a correction embodies exact grams → requires Pro
(`exactCorrectionGrams`); demo/free are rejected (`requires_pro`), never silently redacted.
Only a rerun-verified solve (`rerun_complete`) with ≥1 gram action and both snapshots is accepted.

## 3. Why RLS (and which policies)

The record contains the user's own recipes (their IP) and exact correction grams (Pro-paid detail).
Without owner-scoped RLS, any authenticated user could read other users' formulas. The proposal
mirrors the proven `saved_recipes` pattern with one strengthening: **no update policy** — an
accepted correction is a write-once audit record (revisions = new inserts); `insert` additionally
checks `created_by = auth.uid()`, and a table constraint pins `created_by = user_id`. `anon` gets
nothing (demo sessions can never write).

**Known limitation (stated, not hidden):** RLS as proposed enforces OWNERSHIP, not TIER. A signed-in
Free user is `authenticated`, so the DB alone would accept their insert; the Pro-only rule lives in
the draft builder / service gate today. This mirrors the existing Account Access status ("Rule 1:
server-side enforcement pending"). Before or with the live write slice, the owner must decide the
DB-side tier enforcement — e.g. an insert policy that joins the billing/subscription state, or an
Edge-Function-mediated insert — and it is a hard checklist item below.

## 4. The non-applied migration proposal

[`proposals/accepted_corrections_table.proposal.sql`](proposals/accepted_corrections_table.proposal.sql)
— full DDL, indexes (`user_id`, `recipe_id`, `created_at desc`), RLS policies, grants, and a
rollback plan (self-contained drop; `saved_recipes` untouched). It lives **outside**
`supabase/migrations` on purpose and is guarded by tests
(`acceptedCorrectionDraft.test.ts`): the file must stay out of the live migration path, be labelled
non-applied, include RLS + rollback, and touch no Mapper/product table.

**Why this slice does not apply it:** the first write path needs explicit owner approval — it
changes the DB surface, the RLS story and the billing boundary (Pro-only detail at rest). Design
first, verify the checklist, then write.

## 5. Approval checklist before live persistence

- [ ] Owner approves the data model in §2 (field-by-field) and the Pro-only capability rule.
- [ ] Owner approves the RLS + no-update immutability policy and the delete-own rule (§3).
- [ ] Owner decides DB-side TIER enforcement (§3 known limitation): subscription-aware insert policy,
      Edge-Function-mediated insert, or explicitly accept client/service-side gating for v1.
- [ ] Proposal SQL reviewed and copied to `supabase/migrations/0012_accepted_corrections.sql`
      **unchanged except the header**, then applied (SQL editor / `db push`).
- [ ] Post-apply verification via the read-only MCP: table exists, RLS enabled, policies present,
      `anon` has no grants, `authenticated` has select/insert/delete only (no update).
- [ ] Negative tests against the live table: anon insert fails; user A cannot select user B's rows;
      update fails for everyone.
- [ ] Service layer added under `src/services/` (the sanctioned DB layer) mirroring
      `recipes.ts` (`create` / `listMine` / `remove`; no update function).
- [ ] Studio "Save correction" button wired Pro-only, with honest failure states — no fake success.
- [ ] Redaction re-verified: demo/free never see a save affordance beyond the upgrade hint.
- [ ] Full gates + browser proof + adversarial review, as every slice.

## 6. Exact next live-write slice (after approval)

**"Accepted Correction Persistence — live write path"**: copy the proposal into
`supabase/migrations/0012_accepted_corrections.sql`, apply it, add
`src/services/acceptedCorrections.ts` (uses `buildAcceptedCorrectionDraft` +
`validateAcceptedCorrectionDraft` as its input gate), wire the Pro-only Studio save button to it,
and verify with the checklist above. The draft builder in this slice is intentionally the exact
input contract of that service, so the write slice adds IO only — no new business logic.

## 7. What this slice deliberately did NOT do

- No migration applied; no file added under `supabase/migrations`.
- No DB write, no external-DB import in the new module (test-guarded).
- No Studio UI: a disabled "Save correction" placeholder was considered and **skipped** — a dead
  control in production Studio invites confusion, and the panel already says "Preview only —
  nothing is saved". The UI lands with the real write path.
- No Mapper/product/status/PAC-POD touch anywhere.
