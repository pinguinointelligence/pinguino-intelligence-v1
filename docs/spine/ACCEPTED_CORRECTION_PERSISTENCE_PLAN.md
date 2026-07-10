# Accepted Correction Persistence — design & LIVE write path

_Created 2026-07-09 (Spine Slice 16); owner decisions locked and the write path opened 2026-07-10
(Spine Slice 24). Companion to [PINGUINO_SPINE.md](../PINGUINO_SPINE.md) and
[TEMPERATURE_AWARE_TARGET_BANDS_PLAN.md](../engine/TEMPERATURE_AWARE_TARGET_BANDS_PLAN.md)._

**Status: LIVE (Slice 24).** Migration `0012_accepted_corrections` is applied; the service
(`src/services/acceptedCorrections.ts`) and the Pro-only Studio save control exist. Everything
below §0 is the original Slice 16 design, kept verbatim as the record it was approved from.

## 0. Owner decisions — LOCKED (2026-07-10)

| # | Decision | Locked |
|---|---|---|
| A | `accepted_corrections` as a separate immutable audit table | **YES** |
| B | Save accepted correction only for Pro users | **YES** |
| C | Owner-scoped RLS | **YES** |
| D | No update policy | **YES** |
| E | Owner delete allowed; no update | **YES** |
| F | v1 tier enforcement: service/client gate + owner-scoped RLS now; **an Edge-Function-mediated insert remains REQUIRED hardening before wider production scale** | **YES** |
| G | Store original and corrected recipe JSON snapshots | **YES** |
| H | Target modes `engine_seeded` and `regulator_shadow` | **YES** |
| I | Save must never touch Mapper, PAC/POD, mapper_basement, product statuses, or PI Calculated activations | **YES** |

**Decision F — recorded consequences (v1 only):** RLS protects OWNERSHIP, not subscription tier.
A hostile signed-in Free user could bypass the client gate via raw REST and insert THEIR OWN row
(no cross-user access is possible; no data leak) — this risk is **accepted for v1 only** and the
Edge-Function insert path is the standing hardening requirement before wider production scale.
Accepted-correction records are immutable (write-once + owner delete) and fully separate from
`saved_recipes`, which is never mutated by a correction.

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

## 5. Approval checklist before live persistence — COMPLETED in Slice 24

- [x] Owner approves the data model in §2 (field-by-field) and the Pro-only capability rule (A/B/G/H).
- [x] Owner approves the RLS + no-update immutability policy and the delete-own rule (C/D/E).
- [x] Owner decides DB-side TIER enforcement: **decision F** — service/client gating for v1 with
      owner-scoped RLS; Edge-Function-mediated insert REQUIRED before wider production scale.
- [x] Proposal SQL copied to `supabase/migrations/0012_accepted_corrections.sql` unchanged except the
      header, and applied via the migration tool (Slice 24).
- [x] Post-apply verification: table exists, RLS enabled, exactly select/insert/delete owner policies
      (no update policy), `anon` has no table privileges, `authenticated` has select/insert/delete only;
      indexes + creator-is-owner / target-mode / optimizer-decision constraints present (§8 results).
- [x] Negative tests against the live table (transaction-scoped role simulation, §8): anon insert and
      select denied; owner insert allowed; a different uid sees 0 rows and cannot delete; update denied.
- [x] Service layer `src/services/acceptedCorrections.ts` (`createAcceptedCorrection` /
      `listMyAcceptedCorrections` / `deleteAcceptedCorrection`; NO update function).
- [x] Studio `SaveCorrectionControl` wired Pro-only + signed-in, honest failure states, no fake success.
- [x] Redaction re-verified: demo/free see no save affordance (tests + preview browser, §8.3).
- [x] Full gates + adversarial review; browser proof of every unauthenticated state (§8.3).
- [x] End-to-end signed-in save proof COMPLETED in Slice 24B (§8.3): one real save (201 on the
      wire), row field-verified, proof row deleted through the service, baseline unchanged.

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

---

## 8. Slice 24 verification results (2026-07-10) — migration applied + RLS proven

Migration `0012_accepted_corrections` applied via the write-capable Supabase migration tool
(`apply_migration`, project `riwipywgqobrulyzrzad`) → `{"success": true}`. The SQL is the approved
proposal verbatim except the header comment (diff-checked).

### 8.1 Post-apply schema verification (live catalog queries)

| Check | Result |
|---|---|
| Table exists, RLS enabled | `pg_class.relrowsecurity = true` for `public.accepted_corrections` |
| Policies | exactly 3: `accepted_corrections_select_own` (`auth.uid() = user_id`), `accepted_corrections_insert_own` (`auth.uid() = user_id AND auth.uid() = created_by`), `accepted_corrections_delete_own` (`auth.uid() = user_id`) — **no update policy** |
| Grants (`has_table_privilege`, authoritative) | `authenticated`: select ✓ insert ✓ delete ✓ **update ✗** · `anon`: select ✗ insert ✗ update ✗ delete ✗ |
| Check constraints | `accepted_corrections_creator_is_owner` (`created_by = user_id`), `optimizer_decision` ∈ {optimized, tradeoff}, `target_mode` ∈ {engine_seeded, regulator_shadow} |
| Indexes | pkey + `user_id`, `recipe_id`, `created_at desc` |

Note: `information_schema.role_table_grants` returned empty on this connection (viewer-privilege
filtering); `has_table_privilege()` was used as the authoritative source instead.

### 8.2 Negative RLS tests (transaction-scoped role simulation, ALL rolled back)

Method: on the write connection, `begin; set local role anon|authenticated;
select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true); …;
rollback;` — the same role + JWT-claims mechanism PostgREST uses, so `auth.uid()` resolves the
claims `sub`. Owner uid = the project's sole real user `8bb05419-…-213dff23e7ee`; "stranger" =
random uuid `00000000-0000-4000-8000-000000000001`.

| # | Test | Result |
|---|---|---|
| 1 | anon insert | **denied** — `42501 permission denied for table accepted_corrections` |
| 2 | anon select | **denied** — `42501 permission denied` |
| 3 | owner insert (valid row, `created_by = user_id`) | **allowed**; owner select then sees exactly 1 row |
| 4 | stranger select of owner's row | **0 rows** (RLS filters silently) |
| 5 | stranger delete of owner's row | **0 rows affected** |
| 6 | owner delete of own row | **allowed** — 1 row affected |
| 7 | update as authenticated owner | **denied** — `42501 permission denied` (no update grant; policy layer never reached) — write-once proven |

Every test ran inside `begin … rollback`; post-test `select count(*)` = **0 rows** — no test data
persisted. Baseline re-checked in the Slice 24 report: mapper_basement 542, products 69, PAC/POD
0/69, `pi_calculated` activations 1 — untouched.

**Not verifiable on this connection (stated honestly):** simulation covers the PostgREST
role/claims mechanism but not the full HTTP stack (JWT signature verification, `apikey` header
handling).

### 8.3 Browser proof (Slice 24 + 24B) — COMPLETE, end to end

Proven in the local preview browser (anon session, `/studio`, Slice 24):
- signed-out + optimization preview computed → the control area shows only
  **"Sign in to save corrections"** — zero save buttons, zero solve radios;
- `/demo` now redirects to `/` (retired route) — the anon `/studio` session IS the free-preview
  state, covered above;
- DEV Pro override WITHOUT sign-in (exact grams visible in the optimization panel) → **still**
  only the sign-in note: capability alone never unlocks the write control, auth is checked first.

**Signed-in end-to-end save — COMPLETED 2026-07-10 (Slice 24B).** The proof was blocked in
Slice 24 (no signed-in session available; nothing was faked) and completed the next session after
the owner signed in at `/studio` (real password sign-in, `POST /auth/v1/token` → 200; a first
manual attempt without a real sign-in produced — correctly — no button and no request, which the
logs proved: `last_sign_in_at` four days stale, auth log empty, zero insert attempts). With the
owner's session:
- Milk Base preset with sugars reduced (Sucrose 130→50 g, Dextrose 30→10 g — a local, unsaved
  edit) → Preview optimization → decision **tradeoff**, both solves saveable, control rendered;
- **Save correction** click → UI showed `Saved — record 168157b9-6011-4fc6-9367-3da78f5ede37`,
  button flipped to disabled "Saved" (write-once UX);
- **wire proof:** the ONLY write on the network was `POST /rest/v1/accepted_corrections` → **201**
  (everything else: the auth token POST and GETs of subscriptions/products/mapper_basement);
- **row verified field-by-field** via read-only SQL: id matched the UI exactly; `user_id` =
  `created_by` = the signed-in owner; `schema_version` 1; decision `tradeoff`; mode
  `engine_seeded`; hash `058a035a`; original snapshot 6 items → corrected snapshot 7 items;
  action `add Dextrose 113.42 g`; npac 20.20 → 49.07; `rerun_complete` + improvement true;
  engine 0.4.0 / config 0.5.0; `recipe_id` null (unsaved recipe carries its snapshot);
- **no other table changed:** mapper_basement 542, products 69 (PAC/POD 0/69, `updated_at`
  untouched since 2026-07-06), `pi_calculated` 1, saved_recipes 1 (untouched since 2026-06-17);
- **cleanup:** the proof row was deleted through the REAL service (`deleteAcceptedCorrection`
  called in the signed-in session — the owner-scoped RLS delete path);
  `accepted_corrections` returned to **0** and every baseline number re-verified identical.

Standing hardening requirement (decision F, unchanged): an Edge-Function-mediated insert /
server-side tier enforcement before wider production scale.

---

## 9. Server-side tier enforcement — hardening slice (2026-07-10; **Option A APPLIED the same day, §9.1**)

**Phase-1 audit verdict: `server_tier_source_ready`.** The server-side source of truth for Pro
entitlement is `public.subscriptions` (migration `0003`): select-own RLS only, and — live-verified
via `has_table_privilege` — `authenticated` has **no insert/update/delete** grant and `anon` has
nothing. Every row is therefore server-written by construction, so DB-side enforcement that reads
it never trusts the client. Current shape (stated honestly): 1 row (`active`, period end
2026-07-16), **owner-seeded at service level** — the Phase 2B.3 Stripe-webhook writer Edge
Function does NOT exist yet (live project has zero Edge Functions), so freshness is manual until
that lands. The pure mapping `planFromSubscription` (active | trialing | past_due-in-grace) is the
locked tier semantic; every artifact below mirrors it and tests pin the literals in lockstep.

**Deliverables (both approval-gated at authoring time; Option A was approved and applied the
same day — §9.1; Option B remains approval-gated and NOT deployed):**

1. **Option A — RECOMMENDED: tier-checking INSERT policy.**
   [`proposals/accepted_corrections_tier_policy.proposal.sql`](proposals/accepted_corrections_tier_policy.proposal.sql)
   replaces `accepted_corrections_insert_own` with ownership **and** an EXISTS check against the
   caller's own `subscriptions` row (runs under the caller's own select-own privileges — no
   security-definer helper, no privileged role, no deploy, no secrets, no new runtime). Client
   code is unchanged; a Free user's raw-REST insert fails at the DB with an RLS violation.
   **Option A APPLIED as migration `0013`** on 2026-07-10 (owner-approved; verification record in
   §9.1); rollback kept as comments in the migration.
   *Adversarial-review addition (both options):* an optional `recipe_id` must now point at the
   **caller's own** saved recipe — the bare FK from 0012 would have allowed a crafted raw insert
   to link another user's recipe id (and probe uuid existence). Option A pins it in the policy;
   the Edge Function pins it with a read-as-the-user check (`recipe_not_owned`). The production
   Studio path is unaffected (it only ever links the user's own `savedRecipeId`).
2. **Option B — Edge Function `create-accepted-correction`** at
   `supabase/functions/create-accepted-correction/index.ts`. **NOT deployed** (the live project
   still has zero Edge Functions). Identity ONLY from the verified JWT (anon → 401); tier ONLY
   from the user-scoped `subscriptions` read (a body-supplied plan/tier flag does not exist and is
   test-pinned absent); the SAME closed draft contract (key set test-pinned equal to
   `ACCEPTED_CORRECTION_DRAFT_KEYS`, FNV-1a hash recomputed); insert via service role with
   `user_id`/`created_by` FORCED from the JWT; write-once (no update path); touches exactly
   `subscriptions` (read) + `accepted_corrections` (insert). Option B is only meaningful as ONE
   atomic cutover: deploy + rewire `createAcceptedCorrection()` + revoke the direct authenticated
   INSERT grant (SQL in the proposal) — revoking alone would break the proven Pro save path.

**Current enforcement state: accepted-correction INSERT is tier-enforced at the DB/RLS level**
(Option A applied as migration `0013`, §9.1). A signed-in Free / no-subscription / expired user's
raw-REST insert now fails at the database with an RLS violation — the direct authenticated INSERT
grant no longer bypasses the Pro tier. Ownership (select/delete-own) and write-once (no update
policy or grant) are unchanged from Slice 24.

**Why A over B for now:** this codebase deliberately has *no privileged server role anywhere*;
Option A keeps that property (enforcement lives in Postgres next to the ownership RLS it
strengthens) and requires no deploy pipeline, no service-role secret handling and no duplicated
validation runtime. Option B becomes the natural vehicle when the Stripe webhook writer (2B.3)
introduces Edge Functions anyway. Trade-offs recorded: A's policy runs a per-insert subquery
(trivial at this volume) and A leaves grams-in-flight validation entirely to the client contract
(as today), while B centralizes validation server-side but adds service-role usage + deploy
surface + drift risk between duplicated validators (mitigated by the lockstep tests).

**Owner decision menu — resolved:**
1. ~~Approve Option A~~ → **DONE 2026-07-10** (§9.1): migration `0013` applied, negative/positive
   RLS matrix green, guard tests flipped.
2. The Option B atomic cutover (deploy function + rewire client create + revoke grant + browser
   re-proof) stays available for the 2B.3 / wider-scale era. The function source remains
   **NOT deployed** (live project has zero Edge Functions, re-verified after 0013).
3. The Stripe webhook writer (2B.3) remains the standing prerequisite for subscription freshness
   at scale — enforcement reads the server-written cache; keeping that cache fresh is still a
   manual owner action until webhooks exist. **Update 2026-07-10:** the webhook writer SOURCE is
   now ready (`supabase/functions/stripe-subscription-webhook/` + unit-tested pure mapping,
   lockstepped with `planFromSubscription`) but **NOT deployed** — see
   [STRIPE_SUBSCRIPTION_WEBHOOK_PLAN.md](STRIPE_SUBSCRIPTION_WEBHOOK_PLAN.md) for the event
   contract, required env names and the owner deployment checklist. Freshness stays manual until
   that checklist is executed.

### 9.1 Option A applied — migration 0013 verification record (2026-07-10)

Migration `0013_accepted_corrections_tier_policy` applied via the write-capable migration tool →
`{"success": true}`, registered as version `20260710133335`. The executable SQL is the approved
proposal's Option-A block verbatim (test-pinned equivalence).

**Post-apply catalog:** RLS enabled; exactly 3 policies (select_own / insert_own / delete_own —
still NO update policy); the live INSERT `with_check` contains ownership (`user_id` +
`created_by`), the own-recipe link clause and the tier EXISTS with `active`/`trialing` +
`past_due … current_period_end > now()`; grants unchanged (authenticated select/insert/delete,
update **false**; anon nothing); Edge Functions still `[]`.

**RLS matrix (transaction-scoped, ALL rolled back; synthetic users/subscriptions created in-txn
only; post-test counts: accepted_corrections 0, subscriptions 1, auth users 1, baseline
542 / 69 / 0-of-69 / 1):**

| # | Case | Result |
|---|---|---|
| 1 | anon insert | denied — `42501 permission denied` (grant level) |
| 2 | signed-in, NO subscription row | denied — `new row violates row-level security policy` |
| 3 | signed-in, `canceled` subscription (even with future period end) | denied — policy |
| 4 | signed-in owner, `active` subscription | **allowed** (rolled back) |
| 5 | signed-in, `trialing` | **allowed** |
| 6 | signed-in, `past_due` with `current_period_end` in the future | **allowed** (grace) |
| 7 | signed-in, `past_due` EXPIRED | denied — policy |
| 8 | owner select | sees exactly own rows |
| 9 | stranger select | 0 rows |
| 10 | owner delete | works (2 rows) |
| 11 | stranger delete | 0 rows affected |
| 12 | update (owner) | denied — no grant (write-once intact) |
| 13 | `recipe_id` not the caller's own (foreign ids are indistinguishable from nonexistent under select-own RLS — same policy path; policy fires BEFORE the FK, so no uuid probing) | denied — policy; own-recipe link **allowed** |
| 14 | `user_id != created_by` | denied — policy |

**Service/UI proof (signed-in owner session):** with 0013 live, Preview optimization → `tradeoff`
→ Save correction succeeded (record `69f053ea-5cc9-4b05-a163-50d662301c54`), row verified via the
service list, then deleted through `deleteAcceptedCorrection` — table back to 0. The Pro save
path is unaffected by the policy change; unsigned/Free UI gating is unchanged (Slice 24 §8.3).

**Rollback plan** (kept as comments in the migration): drop the tier policy and recreate the
Slice-24 ownership-only insert policy — two statements, no data touched.
