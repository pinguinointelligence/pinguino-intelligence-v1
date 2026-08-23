# PINGÜINO v1.4 — global save / immutable versions / reopen metadata + Product Scanner Edge

**Date:** 2026-08-23 · **Scope:** staging only · **Production `main` 4dfb097 untouched.**

Two owner-reported workflows. Neither root cause was what the screenshots suggested, so both are
recorded here with the evidence that settled them.

---

## Starting point

| | |
|---|---|
| Starting `origin/staging` | `92edb67` |
| Rebased twice during the task | `0ab80ed` (rescue advisor), `778fef8` (reports only) |
| Final `origin/staging` | `4c38fd4` |
| Production `main` | `4dfb097` — untouched, not merged, not deployed |
| DB migration level at start | `20260822190000_intimport_enrichment_usage` |
| Worktree | `~/Developer/pinguino-intelligence-v1-persistence`, branch `claude/persistence-scanner-v14` |

---

## PART A — recipe save / immutable versioning

### A1. „ZAKTUALIZOWANO 23.08" vs „22.08.2026 · v1" — no version was ever missing

Of the owner's five hypotheses the answer is none of A/B/E and a variant of C/D: **the two surfaces
formatted the same instant with two different calendars.**

`QA Protein v2 -12C` (`saved_recipes.1d14a107-9284-4b04-9e7a-1454c6ec9c53`) was saved **exactly once**:

```
saved_recipes.created_at   2026-08-22 23:29:59.494922+00
saved_recipes.updated_at   2026-08-22 23:29:59.494922+00   ← identical, so no second write
recipe_versions v1         2026-08-22 23:29:59.494922+00   ← the one and only version
saved_recipe_meta.latest_version_number = 1
```

- „Moje receptury" rendered `new Date(updated_at).toLocaleDateString('pl-PL')` → the viewer's local
  day → **23.08.2026** (Europe/Warsaw is UTC+2, so 23:29Z is 01:29 next day).
- „Wersje" rendered `iso.slice(0,10)` → the **UTC** day → **22.08.2026**.

One save, two calendars, and it reads exactly like a save that produced no version.

**Fix.** `src/features/recipes/savedRecipeDate.ts` is now the single formatter for every
saved-recipe date, on the viewer's calendar (that is what „kiedy zapisałem" means). Additionally
the library dates a row from its **newest immutable version**, not `saved_recipes.updated_at` —
which a rename also bumps — so the two views are the same fact by construction.

### A2. TYP „—", TRYB „—", SILNIK „−11°C Engine" on a −12°C Protein save

The library read three denormalized `saved_recipes` columns that the canonical save path **never
writes**:

| column | why it was wrong | owner symptom |
|---|---|---|
| `product_type` | `create_recipe_with_v1` was called with `p_product_profile: null` literally; `advanceAggregate` only patched it `if (version.productProfile != null)` and `buildRecipeVersion` defaults that to `null` with no caller ever supplying it | **TYP: —** |
| `serving_profile` | never written by any canonical path | **TRYB: —** |
| `active_engine_label` | migration 0001 `default '−11°C Engine'`, never overwritten | **SILNIK: −11°C Engine** on every recipe |

So the −11°C was a **column default**, not an engine decision, and it never came from the recipe
name. All 30 saved recipes on staging carried the same three values. Meanwhile the whole truth was
already inside `recipe_input` — `pinguino_profile_v1.visibleProductType/formulationStrategy/
servingModeId/targetTemperatureC` plus `goals.formulation_strategy` — just never mirrored back.

`recipe_versions.product_profile` and `.temperature_c` were NULL for the same reason, so a version
snapshot could not name its own profile.

**Fix, in two independent layers:**

1. **Write** — `savedRecipeColumnsFromInput` feeds every save path (create RPC, non-RPC fallback,
   every aggregate advance), and `versionIdentityFromInput` populates the version's own
   `product_profile`/`temperature_c`.
2. **Read** — `readSavedRecipeMetadata` derives display from the persisted `recipe_input`, with the
   columns only as a last resort. This is why the ~30 recipes already stored with NULL columns
   display correctly **without rewriting a single historical row**.

TRYB now means ECO/OPTIMAL (the product-layer objective actually stored in the recipe) and SILNIK
means the saved serving route, so the two cells stop being redundant.

### A3. Appending v2+ was not atomic

`saveNewVersion` was four unwrapped client round-trips: read history → INSERT `recipe_versions` →
UPDATE `saved_recipes` → UPDATE `saved_recipe_meta`. A failure after the INSERT left immutable
history ahead of the aggregate the library reads, and two writers could read the same
`max(version_number)`.

**Fix** — `append_recipe_version_v1` (SECURITY INVOKER, migration `20260823103000`): locks the
parent row, derives the next number under that lock, writes version + both aggregate rows in ONE
transaction. `saveNewVersion` and `restore` both route through it; the old path stays as the
documented fallback for a database that lacks the function.

### A4. Rename

`renameRecipe` still bumps `updated_at` and still creates no version — correct, because the library
no longer dates a row by that column.

---

## PART B — Product Scanner Edge

### B1. The failing call

`product-scan-finalize`, **HTTP 400**, body `{"error":"product_ingest_failed"}`.
Staging `function_edge_logs`, 2026-08-23T06:34:05.729Z, immediately after
`product-scan-analyze` → **200** at 06:33:47. Session `4c969b3f-fa89-46de-90fc-7802e66a21ed`
(Cacao Puro / La Chocolatera). So the analysis had fully succeeded; only the save failed.

### B2. Server-side root cause

`postgres_logs` at 06:34:05.622Z:

```
classification entity not found (kind=catalog_product_version,
  id=d78f19a4-c709-45a3-b79e-7bc4ec64be57, version=f, product=f, current=f)
```

`ingest_product_v1` line 1022, run right after it INSERTs the new `public.product_versions` row:

```sql
update public.product_behavior_reclassification_queue set status='succeeded', …
where entity_kind='catalog_product_version' and entity_id=v_version_id::text
  and status in ('pending','running')
  and source_fingerprint = public.product_behavior_entity_fingerprint_v1(
        'catalog_product_version', v_version_id::text);
```

`product_behavior_entity_fingerprint_v1` was declared **STABLE**. A STABLE function evaluates
against the calling query's snapshot, so it could not see the `product_versions` row its own
transaction had just written — `version=f` in the diagnostic is that fact. It raised, and because
ingest deliberately treats a classifier failure as fatal ("any classifier failure rolls the
identity, version, relation and provisional binding back together"), the whole product creation
rolled back.

**Every scanner save of a new product was failing.**

Proven, not inferred — reproduced deterministically inside a rolled-back transaction:

| function volatility | `ingest_product_v1` result |
|---|---|
| `STABLE` (as deployed) | `classification entity not found (… version=f, product=f, current=f)` |
| `VOLATILE` (identical body) | `kind=created`, `PR-ING-006304` |

The fingerprint is an authority over the state being written, so it must read its own
transaction's writes: VOLATILE is the correct category, not a tuning choice
(migration `20260823104000`, body otherwise byte-identical).

### B3. …and a second defect the fix uncovered

Re-running the owner's finalize after B2 returned **429 `scanner_product_quota_reached`** — on an
account holding exactly ONE reservation in its history, already `released`.

`reserve_product_scan_creation_v1` short-circuits on the idempotency key before the limits, with
`allowed = v_existing.status <> 'released'`. But `released` means *the previous attempt failed and
the slot was given back* — the opposite of spent quota. And because the scanner derives the key
from the session (`<sessionId>:create-v1`), that scan could never be saved again: **every scan that
hit the 400 stayed permanently unsavable even after the 400 was fixed.** The release path was right
about the count and wrong about the key.

**Fix** (migration `20260823110000`): a released slot is re-openable, through the same ceilings as a
fresh reservation, reusing the row so one scan keeps one reservation. `reserved` and `consumed` are
untouched, so a retry still returns the existing product instead of creating a second one.

### B4. The message the user saw

`finalizeProductScan` did `throw new Error(error.message)` without reading the function's JSON body,
so the SDK's generic HTTP-error string — „Edge Function returned a non-2xx status code" — landed on
screen under a correct scan result.

Now: `classifyScannerError` maps every server code to one of eight actionable categories with
Polish copy; the raw text lives in `diagnostic`/console only; and
`assertUserSafeScannerMessage` (services layer, where naming vendor vocabulary is allowed) is a
final gate that replaces anything still shaped like infrastructure. A failed **save** no longer
reads like a failed **analysis** — the result stays on screen and says so explicitly.

Also fixed on that screen: the package value shows the normalized `250 g` with „PESO NETO 250 g"
kept beside it as label evidence (the structured pair was always in the payload — only the display
conflated them), and the completeness badge stopped printing the internal overlay enum
(`USABLE_FOR_OWNER`) at the user.

Allergen semantics are unchanged and now pinned by tests: „no separate allergen declaration
observed" never becomes „no allergens".

---

## Served proof on current staging

Deployment `dpl_HqpcRnSRUXtqrP9cVZNuyfUcdAa2` (SHA `c4bb217`, bundle `index-DVuwoB0F.js`); the
retry fix then deployed as `dpl_FCSKDRZxLGPJDN8Xt1wALb2GN5vm` (SHA `4c38fd4`, bundle
`index-Cm1rtq4Z.js`, READY) — SQL + tests only, and the leak proof below was re-verified on it.

### Recipe E2E — the owner's own recipe

```
Library   QA Protein v2 -12C · TYP Protein · TRYB ECO · SILNIK −12°C · 1000 g · 23.08.2026
Wersje    23.08.2026 · v1        ← same calendar, same date, defect A gone
```

Then, through the served UI (Przelicz → Preview → Zastosuj → ZAPISZ):

```
v1  2026-08-22 23:29:59.494922Z  manual    product_profile NULL   eco      milk 510 … sucrose 96/unlocked
v2  2026-08-23 08:28:38.846165Z  manual    product_profile protein  -12  optimal  milk 460 … sucrose 96/GRAMS
v3  2026-08-23 08:30:14.423624Z  restored (z v1)  product_profile protein  -12  eco  milk 510 … = v1 exactly
```

- **v1 → v2**: v1 byte-identical afterwards; v2 carries a complete identity (`protein` / `−12` /
  `optimal`) where every prior version on staging had NULL; the **gram lock persisted**
  (`sucrose 96/grams`, and the Apply preview showed „Blokady: 1 … BEZ ZMIAN · ZABLOKOWANE").
- **restore v1 → v3**: new latest version, `source=restored`, `restored_from_version=1`, v1 and v2
  untouched, no renumbering. v3 inherited the backfilled identity rather than v1's NULL.
- **Atomicity**: `saved_recipes.updated_at` = `2026-08-23 08:30:14.423624+00` is **byte-identical**
  to v3's `created_at`. Under the old two-step client path those were two separate
  `new Date().toISOString()` calls and could never be equal — this is the transaction timestamp.
- **Parent columns after the save**: `product_type=protein`, `serving_profile=temp_minus_12`,
  `active_engine_label=Silnik −12°C` (was the `−11°C Engine` default).
- **Reopen diff**: zero. 510/110/90/97/96/95/2 g, `dirty=false`, matching v3 exactly.

### Scanner E2E — the owner's own failing session

```
POST product-scan-finalize  session 4c969b3f …                  → 200  kind=created  PR-ING-006306
POST identical (retry 1)                                        → 200  kind=idempotent  same productId
POST identical (retry 2)                                        → 200  kind=idempotent  same productId
```

- Exactly **one** Cacao Puro product exists — no duplicate from the retries.
- `facts.packageSize = "250 g"`, `facts.netQuantityText = "PESO NETO 250 g"` — normalized value,
  provenance retained.
- `allergensText` = the full „Osobna deklaracja alergenów niewidoczna … nie oznacza to
  automatycznie braku alergenów." Session records
  `allergenConfirmation.kind = no_additional_statement_visible` with who/when, plus the warning
  `allergen_statement_absence_owner_confirmed`.
- Destination is the Catalog / Live-Overlay path: `products` row `commercial_product`,
  `visibility=shared`, `canonical_provenance=product_scanner_v1`, overlay row
  `USABLE_FOR_OWNER` / `PR-ING-006306`.
- **`mapper_basement` untouched**: 2088 rows, last written 2026-08-09 18:14:44Z.

### Raw-message leak

`index-Cm1rtq4Z.js` (and `index-DVuwoB0F.js` before it) contains the string „non-2xx status code" exactly twice, and neither is
reachable as user copy:

1. inside the vendor SDK's own `FunctionsHttpError` constructor;
2. inside our **detector** regex list `[/non-2xx status code/i, /edge function/i, …]`.

No app code path renders it.

### Console / network

Clean. The only console error is the single 429 from the pre-fix probe call above; every page
request 200/304.

---

## Changes

**Frontend**

- `src/features/recipes/savedRecipeDate.ts` *(new)* — the one saved-recipe calendar
- `src/features/recipes/savedRecipeMetadata.ts` *(new)* — TYP/TRYB/SILNIK/ILOŚĆ from persisted state
- `src/features/product-scanner/scannerErrors.ts` *(new)* — typed error model + Polish copy
- `src/features/product-scanner/resultPresentation.ts` *(new)* — package normalization, completeness
- `src/services/scannerErrorGuard.ts` *(new)* — the render gate (services layer by boundary rule)
- `src/services/proCore/supabaseRecipes.ts` — honest columns, version identity, atomic append RPC
- `src/services/recipes.ts` — library rows carry their newest version's number + timestamp
- `src/services/productScanner.ts` — classify every failure; never throw the transport message
- `src/pages/recipes/MyRecipesPage.tsx` — render from persisted state
- `src/pages/products/ProductScannerV1Page.tsx` — safe copy, retained-analysis note, package, badge
- `src/features/pro-core/RecipeVersionsSection.tsx` — delegate to the shared formatter
- `src/features/recipes/recipePayload.ts`, `src/services/proCore/supabaseRecipesFake.ts` — support

**Database (staging only)**

- `20260823103000_recipe_save_atomicity_and_metadata.sql` — `create_recipe_with_v1` gains
  `p_serving_profile`/`p_active_engine_label`; new `append_recipe_version_v1`
- `20260823104000_product_behavior_fingerprint_volatility.sql` — STABLE → VOLATILE
- `20260823110000_product_scan_retry_after_failed_save.sql` — released reservation is re-openable

**Edge functions:** none changed. Deployed `product-scan-finalize` v7 read back from the Supabase
API and confirmed byte-identical to the repo source. Production Rescue bundle verified unchanged
(`3716be4d…`).

**Tests added** — 9 files:
`savedRecipeMetadata.test.ts` (16), `savedRecipeDate.test.ts` (4),
`recipeSaveContract.test.ts` (17, both persistence paths), `recipeSaveAtomicity.migration.test.ts` (9),
`scannerErrors.test.ts` (8), `resultPresentation.test.ts` (9),
`productScanner.errors.test.ts` (9), `finalizeSaveContract.test.ts` (11),
`productBehaviorFingerprint.migration.test.ts` (3), `scanRetryQuota.migration.test.ts` (8).

`RecipeVersionsSection.test.tsx` had pinned the UTC calendar — i.e. the defect — and now pins
agreement between the two surfaces instead.

---

## Validation

| check | result |
|---|---|
| Full suite | **603 files / 7578 PASS**, exit 0 |
| Typecheck (`tsc -b`) | clean |
| Lint | 0 errors, 2 pre-existing `react-refresh` warnings |
| Clean install (`npm ci`) | exit 0 |
| Clean build | exit 0 |
| `npm run recipes:validate` / `process:validate` / `catalog:mapper-only:validate` | exit 0 |
| `production-rescue:bundle-check` | `3716be4d…` verified |
| `git diff --check` | clean |

---

## Two things the owner should know

1. **I appended a version to your evidence recipe.** Running the served save E2E, my ZAPISZ landed
   on the linked recipe `QA Protein v2 -12C` instead of creating a separate one — it now has v2
   (my OPTIMAL + gram-lock save) and v3 (restore of v1). Nothing was destroyed: v1 is byte-intact
   and v3 has already returned the parent to v1's exact formulation. It also produced the cleanest
   possible v1→v2→restore proof on your real data. Say the word if you would rather I had not, and
   the history is all still there to inspect.

2. **Protein Main is not settable in this starter.** Every „Ustaw jako składnik główny" toggle is
   `disabled` for the seven ingredients of the Protein −12 starter, so the owner Test-1 step
   „set a Main" could not be performed served. That is a pre-existing Protein Main-eligibility
   rule, unrelated to persistence — Main **persistence** is covered by `recipeSaveContract.test.ts`
   (`lock_type: 'main'` round-trips through create, append and restore on both paths). Worth a
   separate look if Protein Mains are meant to be selectable.
