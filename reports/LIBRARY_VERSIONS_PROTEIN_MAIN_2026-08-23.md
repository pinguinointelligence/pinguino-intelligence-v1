# PINGÜINO v1.4 — Recipe Library inline version selector + Protein Main / Multi-Main

**Date:** 2026-08-23 · **Scope:** staging only · **Production `main` 4dfb097 untouched.**

| | |
|---|---|
| Starting `origin/staging` | `36e9bb1` |
| Code commit | `6824dc7` |
| Final `origin/staging` | `05e5fdd` |
| Final deployment | `dpl_4ehZN6yBNtmrd2Rf4aqDTbwYFDoG` READY |
| Final served bundle | `index-B-yvCBqD.js` (read AFTER the last push, via the browser — `curl` gets Vercel's bot checkpoint and returns the challenge page's asset names) |
| Branch / worktree | `claude/library-versions-protein-main` · `~/Developer/pinguino-intelligence-v1-persistence` |

---

## PART A — inline version selector

### What shipped

`WERSJA` sits between ZAKTUALIZOWANO and OTWÓRZ on every „Moje receptury" row: `v3 ▾`, opening a
compact list of the recipe's whole immutable history, newest first, each line dated by its **own**
version timestamp. The newest carries a quiet „Aktualna". Version numbers and dates only — no UUID,
no snapshot id, no internal identifier.

**Files:** `features/recipes/RecipeVersionSelector.tsx` (new), `features/pro-core/HistoricalVersionNotice.tsx`
(new), `pages/recipes/MyRecipesPage.tsx`, `services/recipes.ts`, `features/recipes/recipePayload.ts`,
`features/recipes/SaveRecipeDialog.tsx`, `features/studio/StudioEngineSurface.tsx`,
`stores/recipeStore.ts`, `copy/en.ts`.

### Version-query architecture (§10)

`listMine` reads the recipes, then **one** `.in('recipe_id', ids)` query covering every listed
recipe, ordered by version desc. Two queries for the whole page regardless of row count.
`libraryVersionLoading.test.ts` counts the actual client calls, so an N+1 regression fails there
rather than as a slow page nobody measures.

### Selected-version state (§5)

A plain `Record<recipeId, versionNumber>` in the page. Nothing else. `resolveSelectedVersion` falls
back to the newest whenever the pick is absent or no longer in the reloaded history, so a refresh
resets to latest and a version deleted elsewhere can never stay selected.

The no-mutation guarantee is proven **structurally**: `myRecipesVersionSelector.test.tsx` hands the
page a repository whose `createRecipe`/`saveNewVersion`/`renameRecipe`/`archiveRecipe`/`restore` all
throw. Browsing versions with that repository passes, so a write introduced later fails the test
instead of the owner's data.

### Served proof

Deployment for the code commit `6824dc7`: `dpl_HpwM8tovKyE6NhqM83P2cWstGL4k` (READY, bundle
`index-BGdGE_mw.js`). Re-confirmed on the final deployment `dpl_4ehZN6yBNtmrd2Rf4aqDTbwYFDoG`
(`05e5fdd`, bundle `index-B-yvCBqD.js`): WERSJA present, `QA Protein v2 -12C` at v4.

```
QA Protein v2 -12C … ZAKTUALIZOWANO 23.08.2026 · WERSJA v3 ▾ · Otwórz · Usuń
dropdown: v3 · 23.08.2026 Aktualna   v2 · 23.08.2026   v1 · 23.08.2026
QA Protein CLOSEOUT -12 ECO … WERSJA v1        (single-version row)
```

- **v1/v2/v3 display** — newest first, one „Aktualna", each with its own immutable date (v1's
  2026-08-22T23:29:59Z renders 23.08 local, consistently with the Wersje tab).
- **No mutation on selection** — history hash `63ab7f9aa3c6e1b7e4801235aba7ca4a`, 3 versions,
  `parent_updated_at 2026-08-23 08:30:14.423624+00`, `latest_version_number 3` **before and after**
  selecting v1. Byte-identical.
- **Historical open** — selecting v2 and pressing Otwórz loaded exactly v2:
  `milk 460 · cream 94 · WPC 84 · water 166 · sucrose 96 (gram-locked) · dextrose 98 · tara 2`,
  distinct from v1/v3 (`510/110/90/97/96/95/2`). No silent fallback to latest. The v2 gram lock came
  back with it.
- **Historical marker** — „Wersja v2 · 23.08.2026 — podgląd historii. Najnowsza wersja to v3. Zapis
  nie nadpisze tej wersji; utworzy nową." plus „Przywróć tę wersję".
- **Restore → new version** — restoring v2 created **v4** (`source=restored`,
  `restored_from_version=2`), formulation byte-identical to v2 including its gram lock. v1/v2/v3
  hash after the restore: **`63ab7f9aa3c6e1b7e4801235aba7ca4a`** — unchanged. No renumbering, no
  overwrite. The banner disappeared once the draft became the newest version.
- **Reload** — reopening the library after the saves showed `QA Protein CLOSEOUT -12 ECO … WERSJA v3`
  and `QA Protein v2 -12C … TRYB OPTIMAL` (following v4, restored from the OPTIMAL v2). The default
  reset to latest on its own.

### §9 — editing a historical version

Every save appends; nothing can overwrite v1/v2/v3. One real bug was fixed on the way: with v1 of a
v3 recipe open, the dialog offered „Zapisz nową wersję (**v2**)" while the database correctly wrote
v4. It now numbers from the newest version and adds „Pracujesz na wersji v1. Zapis nie nadpisze jej
— utworzy nową wersję v4."

### §11 — responsiveness

The row's metadata group now wraps (`flex-wrap`, `gap-x-5 gap-y-3`) so six cells become a second
line on narrow screens instead of a squeezed strip. The name block keeps its own row.

---

## PART B — Protein Main / Multi-Main

### Root cause of „all seven toggles are disabled" (§14/§15)

Traced: snapshot → `moduleEligibility.MAIN` → `mainBehaviorBlockReason` → the `disabled` attribute.
**The authority is right and the UI reports it faithfully.** The neutral Protein starter is milk,
cream, whey protein concentrate, water, sucrose, dextrose and tara gum — a base with no flavour
identity in it. None of those is a Main in any profile. Making them selectable to light up the
control would have been the actual defect.

### The eligibility rule (§16) and the contract that matters (§17)

Staging publishes **five verified Protein Main policies**, and `resolve_product_behavior_v1` at
`protein_gelato / −12 / optimal` answers:

| ingredient | policy | basis | eco floor | ceiling | multi limit | MAIN |
|---|---|---|---|---|---|---|
| STRAWBERRIES · Fresh Fruit (PI-ING-001553) | `main-protein-fruit-combination-v2` | FRUIT_EQUIVALENT | 10 % | 49.5 % | 20.7 % | **eligible** |
| BANANA · Fresh Fruit (PI-ING-000345) | `main-protein-fruit-combination-v2` | FRUIT_EQUIVALENT | 10 % | 17.1 % | 20.7 % | **eligible** |
| COCOA ALKALIZED 100 % (PI-ING-001578) | `main-protein-cocoa-1578` | COCOA_SOLIDS_EQUIVALENT | 6 % | 6.1 % | — | **eligible** |
| PISTACHIO · Aldori 100 % (PI-ING-000614) | `main-protein-pistachio-0614` | NUT_EQUIVALENT | 10 % | 10 % | — | **eligible** |
| FRENCH VANILLA · MEC3 (PI-ING-000246) | `main-protein-vanilla-0246` | PERCENT_OF_BASE | 0.5 % | 4.9 % | — | **eligible** |
| PROTEIN GEL WPC (PI-ING-000264) | — | — | — | — | — | **blocked** `main_policy_not_approved:…:use_standard_or_approved_main` |

So the §17 contract holds: **a legitimate Main-capable Protein ingredient is selectable.** The
default starter's lines staying disabled is correct, and is proven ingredient-by-ingredient in
`proteinMainEligibility.test.ts`.

### The one real defect found

`mainBehaviorBlockReason` checks module eligibility first and returns a generic sentence, so the
precise „Składnik białkowy nie jest automatycznie smakiem Main." was **unreachable** — a protein
contributor is never MAIN-eligible, so the classification branch below it never ran. Every disabled
Protein toggle explained itself with the same vague „Produkt nie jest zatwierdzony jako Main w tym
profilu." The contributor case is now answered before the fallback.

### Served proof — single Main (§18 A)

On `QA Protein CLOSEOUT -12 ECO`, adding STRAWBERRIES · Fresh Fruit:

- toggle **enabled** (`disabled: false`) — the reported symptom does not occur for a real flavour;
- set as Main (`aria-pressed: true`, row shows „Główny");
- at 200 g the Preview is honestly **diagnostic-only** — NPAC 53.6 (band 42–50), POD 17.3 (12–17),
  fat 4.3 % (5–12) — Apply disabled, Main held at 200 g, „Główne: 1";
- at **114 g** (10.2 %, inside 10–49.5 %) the Preview is clean: „parametry poza zatwierdzonym
  zakresem 1 → 0", protein 8.5 % / 21 % energy, „Główne: 1";
- **Apply** → strawberry 114 g still Main, total exactly 1000 g, **zero 0 g rows**;
- **Save** → immutable version carries `line-mt5owuqc-0=114/main`, `product_profile=protein`,
  `temperature_c=-12`;
- **Reopen** → byte-exact, strawberry 114 g with `main: true`, no historical banner (it is latest).

### Served — Multi-Main (§19/§20): NOT verified, and why

Strawberry + banana is the only approved Protein multi-main group (shared policy, shared basis,
shared 20.7 % combined limit). Served, the group **is recognised and protected** — both lines are
listed as „Składnik główny · ustawienie receptury" and the combined limit is enforced by name.

But the combined-percentage verdict is **inconsistent**, and Apply could not be reached:

| Mains | draft sum | target batch | Engine verdict |
|---|---|---|---|
| 100 + 100 = 200 g | 1086 g | 1000 g | „Grupa Main przekracza twardy limit 20.7%." |
| 80 + 80 = 160 g | 1092 g | 1000 g | „Grupa Main ma **0.2%**; wymagane minimum to 10.0%." |
| 80 + 80 = 160 g | **1000 g** | 1000 g | „Grupa Main przekracza twardy limit 20.7%." |

Those cannot all be right. 160 g of a 1000 g batch is 16 % — inside 10–20.7 % — yet the same state
reads as both „0.2 %" and „over 20.7 %" depending on the draft sum. Reducing the Mains from 200 g to
160 g cannot move the group from above the ceiling to 0.2 %.

`verifyMainEnvelope` itself computes this correctly under test (1:1 at 100+100 accepted, 2:1 at
138+69 accepted, 300+100 rejected for exceeding the combined limit, 20+20 rejected below the floor —
all green in `proteinMainEligibility.test.ts`), so the fault is most likely in how the **served**
path derives equivalent grams / percent, not in the envelope. I did not chase it further: fixing
Engine percentage math on a hunch is exactly the kind of change that needs proof first.

**Multi-Main 1:1 and 2:1 through Recalc → Preview → Apply → Save → reopen are therefore NOT proven
served.** This is the one substantive gap in this task.

### Not reached

§18 B/C (cocoa, pistachio served), §21 Main + Direction, §22 Main + Rescue, §23 Main + ECO,
§24 MOJA CENA (not triggered — strawberry already carries a 10,00 EUR/kg „Moja" price, so ECO never
hit `missing_prices` in what was run), §25 Main + locks beyond the gram lock that round-tripped
through v2. All are gated behind the Multi-Main issue above or ran out of session.

---

## Validation

| check | result |
|---|---|
| Full suite | **610 files / 7654 PASS** |
| Typecheck | clean |
| Lint | 0 errors (4 pre-existing `react-refresh` warnings) |
| Clean build | exit 0 |
| `production-rescue:bundle-check` | `500042cb…` verified (regenerated — `productBehaviorAccess.ts` is in the closure) |
| `git diff --check` | clean |
| Mapper | 2088 rows, hash `9769e3356c851c9adfd497778d841c97`, last written 2026-08-09 — untouched |
| Console (served) | no app errors; the only entries are from my own injected QA scripts |

**Focused tests added:** `recipeVersionSelector.test.tsx` (10), `myRecipesVersionSelector.test.tsx` (7),
`historicalVersionNotice.test.tsx` (7), `libraryVersionLoading.test.ts` (4),
`proteinMainEligibility.test.ts` (27).

### A pre-existing failure I had to touch

`mainTechnicalMaximum.test.ts` timed out under the serial whole-suite run. Verified pre-existing by
stashing this branch and reproducing it on clean `origin/staging` 36e9bb1: `MAX_SOLVER_ROUNDS`
12 → 18 (c9e9560, the parallel Direction work) pushed several solver proofs from ~2.5 s past
vitest's 5 s default. They pass in isolation and flake under load, on different cases each run.
The two solver-heavy describes now carry an explicit 30 s budget — the work still has to finish,
rather than cases being skipped or the global default being weakened for everything else.
**Flagged for whoever owns the Direction work**, since it is their performance envelope.
