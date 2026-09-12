# Gellatti Official Recipe Library — 177 recipes · images · FINAL Mapper · country-aware resolution

Owner workstream 2026-09-11 (+ addendum „COUNTRY PRODUCTS v12 → PR-ING FIRST"). Branch
`claude/official-recipe-library`, PR #286. Processing Rules (Workstream 3) are out of scope.

## 1. Baseline and the §20 gate

- Branch base: staging `c65e52eff72a7829ba3209546d5a162e2cfd8fa5`.
- **Owner §20 gate — OPEN since 2026-09-11 14:13 UTC:** the final Mapper/Search runtime landed on
  staging with PR #291 (merge `64995dc94422d95eb84ed97d61f16289d1aab51e`); the repository projection
  `docs/ingredients/validation/mapper_basement.csv` is now the FINAL 2541 (sha `a6a849a5…`).
- Before #291 landed, this branch was probed on top of it: merge-tree clean, focused suites 128/128,
  51 tree-walking guard files / 669 tests, full typecheck — all PASS.
- Reconciled head: this branch merged with staging `64995dc9` (#291 included). Gates on that head are
  listed in §7.
- **Staging's full suite is red since #291.** Staging's own push-CI run `34608842973` on `64995dc9` failed
  „Typecheck, lint, tests, build" and „Solver time contracts" (#291 merged with only the required check
  green). Re-running on a clean checkout of `64995dc9`, the **same 34 test files** fail (136 tests) as on this
  branch's reconciled head (135 tests): **this branch adds 0 failing files**. The failures are tests pinned to
  the old 2089-row Mapper projection (row/hash pins, Vegan/Protein coverage audits, Production Rescue
  fixtures, the executable-template handoff) — the Mapper/Search stream's fallout, not touched here.
- Production (`main`) untouched. This workstream made no shared-database write.

## 2. Sources (SHA-256)

| Source | SHA-256 | Role |
|---|---|---|
| `GELLATTI_RECEPTURY.xlsx` (01_RECEPTURY + 03_SKLAD_RECEPTUR) | `a85e32a42a8a2e18a375647f8606c3d20c77f7f37a178273f557445579c76dfb` | recipe authority |
| `mapper_basement.csv` FINAL 2541 × 62 | `a6a849a596acef75e0760992353bddf5cbca24ff37744e36414da18ca45556f6` | PI identity authority (audit only, never written by this workstream) |
| `Archiwum.zip` (Desktop/RECEPTURY/Ice Cream Pictures) | per-file SHA-256 in `src/data/recipes/official/officialRecipeLibrary.manifest.json` | images, number = authority |
| `GELLATTI_BAZA_GELATO_75_KRAJOW_v12_SYNC.xlsx` | `09864e8602a6a7d3a89838091ce83dec7659bd2143517b5831d86f8d2f356172` | country products (PR-ING) |
| `GELLATTI_PROCESSING_RULES_v1_1_PR04.xlsx` | `f7210b231421541fcf078957c5254db04831e464a0c1575e967332216a96f7e1` | read-only context |
| `…INGESTION_RULES_v1_CLEAN_REBUILD.xlsx` | `4bde149e0ab86665bdb18660fd69cb5fa83a06f9f580aa3138a69298a83dd0f3` | historical only (READY_FOR_OWNER_REVIEW) |
| `04_RYNKI` (inside the recipe workbook) | — | historical research only; the app's market configuration is untouched |

## 3. Import audit (§25) — `scripts/importOfficialRecipeLibrary.mjs` (fail-closed; `--check` PASS)

| Measure | Result |
|---|---|
| Recipes | 177 / 177 |
| Ingredient lines | 1510 / 1510 |
| Source total | 1000 g for every recipe |
| Mapped PI lines | 1458 |
| BRAK lines | 52 = 49 unresolved + 3 dynamic Sorbet-scaffold Main (169, 170, 171) |
| Recipes with BRAK | 41 (38 with an unresolved line + 3 scaffolds) |
| Unique referenced PI | 113 |
| Referenced PI missing from FINAL Mapper | 0 |
| Images | 177 / 177 found, 0 missing, 0 duplicated, no off-by-one |
| Collection heroes | 5 / 5 (`Classics.png`, `Icons.png`, `Cocktails_Spirits.png`, `Lost_Legendary.png`, `Technical_Bases.png`) |
| Collections | Classics 77 · Icons 25 · Cocktails & Spirits 48 · Lost & Legendary 15 · Technical Bases 12 |
| Name drift | 634 lines / 16 PI keep their PI; the workbook name is audited in the manifest, never imported |
| Source statuses | NEW_TO_ENGINE 159 · ENGINE_BASE_VALID_BLOCKED 5 · CORRECTION_TO_ENGINE 5 · VERIFIED_EXISTING 5 · SCAFFOLD_RECALC_BY_MAIN 3 |
| Stages (verbatim) | MIX 1440 · LATE ADD 32 · SWIRL 13 · CHOCOLATE THIRD 9 · VANILLA THIRD 8 · STRAWBERRY THIRD 8 |
| Degassing | 10 recipes (107, 109, 110, 111, 115, 116, 119, 120, 126, 129); notice kept verbatim |

## 4. What ships

- **Navigation:** `Gellatti · Moje · Udostępnione · Community · Top 100`. Inspiracje retired (tab, panel,
  view, product-type filter, copy keys, the Inspiracje-only `inspirationClustering` module and its test);
  `?tab=inspiration` and stale `collection`/`recipe` params normalise to `/recipes`. „Udostępnione mi" →
  „Udostępnione" in copy (PL + EN objects), comments and test titles; sharing semantics untouched.
  The drawer's „Receptury" entry still opens „Moje" (unchanged behaviour).
- **Gellatti tab:** five collection cards (owner heroes) → recipe grid (`GEL-NNN-480.webp`) → recipe
  detail (`GEL-NNN-960.webp`): source label, stage (display map keyed by the verbatim value), current
  Mapper name + PI from the Mapper runtime, exact market product when the country resolver routes one,
  grams (hidden for Demo), status rows (source recipe · engine status · ingredients · production
  „Instrukcja procesu w przygotowaniu"), verbatim process notice. Owner-review tooling (Fantasy, curated
  research, countries) stays for admins only.
- **Use (PRO):** `/pro/recipe?source=official_recipe&officialRecipe=<id>` → `openOfficialRecipe`:
  detached copy → Mapper row per PI → existing `resolveCountryProductsForSlots` → exact PR (own profile →
  own composition; otherwise Mapper science + exact identity; no route → canonical PI) → ProductBehavior
  → Engine mass check → new unsaved draft. BRAK, scaffold Main and PIs the runtime does not serve block
  before the store changes. One-shot URL consumed after success. An empty Mapper answer (unconfigured or
  unauthorised read) means "cannot verify", never "every ingredient unavailable".
- **Storage:** static and repository-seeded — no schema, no migration, no DB write.

## 5. Country products v12 (addendum) — `scripts/countryProducts/*`

| Measure | Value |
|---|---|
| Country × slot selections inspected | 450 (375 exact-product + 75 SUCROSE on the global PI) |
| Exact PR identities (deduplicated) | 253 — MILK 67 · CREAM 52 · SMP 52 · DEXTROSE 51 · STABILIZER 31 |
| Existing PR reused | 1 (PR-ING-007174 FR, route already present) |
| New PR-ING required | 252 (created now: **0** — shared-DB write awaits owner approval) |
| Duplicates prevented | 122 of 375 proposals |
| Look-alikes deliberately NOT merged | Chemstock dextrose BH/DZ/KW; Louis François tara CA/DK |
| Routes creatable now / present / blocked by market FK / blocked otherwise | 77 / 1 / 285 / 12 |
| Markets missing from `catalog_market_countries` (18 rows today) | 57 |
| Expected engine-routable after sanctioned ingest | 172 (81 not: estimated/missing label fields or disputed energy) |
| Open gaps (40_POZOSTALE_V12) | **Cream 4 · SMP 16 · Dextrose 42 · Stabilizer research 47 = 109 — all MATCH the owner's lists** |
| New PI created / Mapper modified | 0 / no |

Stabilizer 47 ≠ 47 markets missing a mandatory TARA: they are research cases on the product chosen for
the functional STABILIZER slot. No stabilizer is substituted; TARA grams are never kept under another name.
Reports: `reports/COUNTRY_PRODUCTS_V12_{COVERAGE,OPEN_GAPS,DB_PACKAGE}.md`. Delta tooling for the next
owner workbook: `scripts/countryProducts/diffGelatoBaseRegistry.mjs` + `importGelatoBaseV12.mjs --check`.

**DB package (NOT executed):** 54 new products (requests, versions, bindings, variants, slot reviews) and
77 PRIMARY_DEFAULT routes in the 18 existing markets; 198 products deferred. Sanctioned RPC path modelled
on the country-milk seed; per product it also writes request events, notifications and a requester
favourite (QA Pro account). Dry-run by default; mutation requires
`--project-ref=tunabqqrwabacxjcxxkz --apply --owner-db-approval=GELLATTI-V12-PR-ING`.

## 6. Findings for the owner

1. **The live runtime is the FINAL 2541** (shared `mapper_basement` = 2541 rows with GC75 names, migration
   `20260911120000_mapper_search_final_2541_sync` applied by the Mapper/Search stream). **111 of 113**
   referenced PIs are active + base + engine approved. **PI-ING-000618** (rose paste, #72) and
   **PI-ING-001705** (Leagel vanilla paste, #15 #19 #34 #39 #123 #138 #150 #153 + four BRAK recipes) are
   not, so those 9 BRAK-free recipes block honestly at „Użyj receptury" — **127 of 177** recipes open as
   working copies today (177 − 38 unresolved-BRAK − 3 scaffolds − 9).
2. PL and ES already have live milk defaults for other products (PR-ING-007172, PR-ING-007173); the v12
   package does not replace them.
3. Three identity merges rest on article codes, not GTINs (Louis François 450A across FR/GR/QA/OM;
   Valknut VAL444 across CZ/SK) — confirm or veto.
4. Scaffold Technical Bases (169–171) are shown as templates; opening one needs a „choose Main" flow
   (not built here). HOME shows exact grams but has no working-copy path for library recipes.

## 7. Completion ledger (§36 + addendum §18)

| Item | Result |
|---|---|
| current staging base SHA | branch base `c65e52ef`; reconciled with staging `64995dc9` (#291) |
| source recipe workbook | GELLATTI_RECEPTURY.xlsx (`a85e32a4…`) |
| final mapper_basement SHA | `a6a849a5…` (2541 × 62) — now also the repository projection on staging |
| official recipes / lines / mapped / BRAK / recipes with BRAK | 177 / 1510 / 1458 / 52 / 41 |
| unique referenced PI / missing | 113 / 0 |
| images found / missing / heroes | 177 / 0 / 5 |
| canonical-name reconciliation | PASS (634 lines / 16 PI on their PI; the runtime now serves the FINAL names) |
| import architecture | static repository seed (generated module + manifest + WebP) |
| DB mutation required | Library: NO. v12 PR-ING layer: YES — prepared, not executed, **OWNER DB APPROVAL** |
| Recipe nav order · Inspiracje removed · Udostępnione rename | PASS · PASS · PASS |
| 177/177 recipes · 1510/1510 lines · 177/177 image map · collection counts | PASS · PASS · PASS · PASS |
| country resolver handoff · BRAK no-guess · Technical Bases · immutable official recipes | PASS · PASS · PASS · PASS |
| reconciled-head gates | library `--check` PASS · v12 `--check` PASS · `git diff --check` PASS · owner-locked / protected-path / HOME-ledger guards PASS · focused 36 files / 464 tests PASS |
| verify:staging on the reconciled head | PASS — guards OK, owner-locked contracts 225/225, typecheck, lint 0 errors (8 pre-existing warnings), build |
| full suite on the reconciled head | 1128 files passed / **34 failed** (135 tests) — the **identical 34 files** fail on clean staging `64995dc9` (inherited from #291); **0 new** |
| merge SHA · served staging SHA · served acceptance A–P | NOT MERGED — owner decision: merge onto the red staging (0 new failures) or wait for the #291 fallout repair |
| production untouched | YES |
| country product source | GELLATTI_BAZA_GELATO_75_KRAJOW_v12_SYNC.xlsx (`09864e86…`) |
| v12 products inspected | PASS |
| existing PR reused / new PR-ING created / duplicates prevented | 1 / 0 created (252 required) / 122 |
| recipe/base country routing | PASS (runtime path); v12 routes await DB approval |
| Mapper modified / new PI created | NO / 0 |
| Cream / SMP / Dextrose gaps · Stabilizer research | 4 / 16 / 42 · 47 |
| STABILIZER SLOT rule preserved | PASS |
| missing products block library visibility | NO |
| missing products explicitly recorded | PASS |
| future owner delta import ready | YES |
| PR-ING country base layer ready with current coverage | package READY; live only after OWNER DB APPROVAL |
