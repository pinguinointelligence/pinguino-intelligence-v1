# AGENT C — LIVE MAPPER SEARCH FINALIZATION LEDGER

Date: 2026-07-24 · Branch: `worktree-agent-ad62b5b16ee66f53f` · Baseline: `4dfb097` (frozen search engine, commits 0473c3b/14be387/869a65d)

Scope honoured: only the search service (`src/services/ingredients.ts` — search path), the
normalization/alias/ranking module (`src/features/ingredient-builder/ingredientSearch.ts`),
presentation (`src/features/ingredient-builder/ingredientPresentation.ts`) and their tests.
No formulation, constraint-studio, recipeStore, engine or customer-shell file touched. No copy
key changes needed (all picker copy keys already exist in `src/copy/en.ts`).

---

## 1. Invariant verification table

| Invariant | Status | Protecting test (file → test) |
|---|---|---|
| Every query hits the current backend; no session-long snapshot; no full-catalogue preload | VERIFIED (baseline) | `liveSearchContract.test.ts` → "every settled query issues a CURRENT backend request…", "an empty query fetches NOTHING", "the Pro library hook NO LONGER preloads the catalogue", "no permanent catalogue storage" |
| No 1,000-row PostgREST truncation — `.range` paging present | **FIXED THIS PASS** (baseline used `.limit(n)`; `loadMore` past 1,000 was silently capped by PostgREST `max-rows` and `hasMore` turned false) | `liveSearchContract.test.ts` → "a client window past 1,000 pages via `.range` in sub-cap windows", "a short `.range` page ends paging early", "every `.range` window repeats the SAME filters and deterministic order" |
| Debounce + stale-response cancellation (no stale Add) | VERIFIED (baseline) + pins added | `liveSearchContract.test.ts` → "requests are abortable", "debounce + per-query key + abort propagation", "stale-add protection: selection is keyed to the settled query and add resolves by exact id"; the per-query react-query key (`['ingredient-search', norm, limit]`) makes an older response structurally unable to serve a newer query |
| Pagination correctness (reset on new query, truthful hasMore, widen-only-current-query) | VERIFIED (baseline) + pins added | `liveSearchContract.test.ts` → "pagination correctness: window is stored WITH its query…" |
| Mid-session freshness (server-side update discoverable without reload) | VERIFIED (baseline) | `liveSearchContract.test.ts` → "the search hook is fresh-by-default: short staleTime (15 s), refetchOnMount 'always', query in the key"; every settled query is a live fetch, so a row added/updated server-side appears on the next settled query / picker reopen |
| Stable `PI-ING-*` identity on every result row | VERIFIED | `coreSearchQueries.test.ts` → "stable PI-ING-* identity on every result row"; `serverSearchRanking.test.ts` → "a search hit exposes only identity/name/category/form" (id always present, resolved fresh by exact id on Add) |
| Safe payload (no PAC/POD/composition in search results) | VERIFIED (baseline) | `liveSearchContract.test.ts` → "selects only identity/name/category/form columns" |

## 2. Presentation changes (the only intended code changes + two proven alias gaps)

`src/features/ingredient-builder/ingredientPresentation.ts`
- **Fresh dairy = „Świeże", never „Świeży owoc"** — shipped fix verified (`ingredientPresentation.test.ts` "owner defect" block still green) and coverage EXTENDED over the full live census: `cream_18_percent`, `cream_33_percent_uht`, `clotted_cream`, `creme_fraiche`, `fresh_whipping_cream`, `unsalted_butter`, all fresh cheeses (`cottage/blue/brie/gorgonzola/mozzarella/parmesan/ricotta/soft/cream_cheese/mascarpone_cream_cheese`), all yogurts (`greek/natural/skyr/yoghurt_9_percent`) now map to `fresh` instead of falling to `Inne` (e.g. real row `CREAM 18% · Piątnica` was „Inne" before this pass).
- Generic census-safe rule: any real `fresh_*` subcategory (herb, flower, milk, whipping cream, fruit profile) → `fresh`.
- `liquid_*` vocabulary (`liquid_emulsifier`, `liquid_stabilizer_emulsifier_mix`, `glucose_syrup_liquid`) → `Płynne i napoje`, never powder via the mix/emulsifier keywords.
- `agar`/`pectin` → `Proszki i suche` (were `Inne`).
- Paste categories keep drink-named pastes in `Pasty`: real rows `whisky`, `whisky_cream`, `prosecco`, `cream_liqueur`, `liquorice` under `flavor_paste` no longer render under „Płynne i napoje"; real alcohol rows stay liquid.
- Category labels: added `seed → Nasiona`, `confectionery_spread → Kremy do smarowania` — with these, **all 48 live categories** carry Polish labels (0 raw enums renderable).
- Group order unchanged and pinned: Świeże; Mrożone; Puree i przeciery; Koncentraty; Pasty; Płynne i napoje; Proszki i suche; Aromaty; Dodatki; Inne — only non-empty groups render; unmapped vocabularies map honestly to `Inne` (pinned for `kajmak`, `condensed_milk`, `couverture`, `unmapped_novel_form`).

`src/features/ingredient-builder/ingredientSearch.ts` (alias layer — staging-proven gaps, both required core queries returned **0 rows** before)
- `{ roots: ['proszk', 'proszek', 'powder'] }` — 0 staging rows contain „proszk" in any searchable column; „mleko w proszku" only works via alias (0 → 34 live hits).
- `{ roots: ['smp', 'skimmed'], categories: ['dairy'] }` — 0 staging rows contain „smp"; SMP is the trade abbreviation for skimmed milk powder (0 → 3 live hits).

`src/services/ingredients.ts`
- `searchEngineApprovedIngredients` now pages with `.range(offset, to)` in `SEARCH_DB_PAGE_ROWS = 500` windows (strictly below the PostgREST 1,000 `max-rows` cap), deterministic order (`ingredient_name_display`, `ingredient_id` tiebreak), stops on a short page. External contract unchanged (same signature, same result, same AbortSignal semantics); the normal 200-row first page is still a single request.

## 3. The 12 core queries — live staging counts + grouped output

Live counts are the EXACT ilike replication of `buildSearchTermGroups` (generated from the
module, `scratchpad/gen-core-query-sql.mjs`) run read-only on staging `tunab…` `mapper_basement`
(`is_active AND approved_for_engines`, total 2,070). Grouped samples are proven in
`coreSearchQueries.test.ts` over real staging rows (ids/display/category/subcategory verified live).

| # | Query pair | Live hits | Top ranked row (`NAZWA · Kategoria · Forma`) | Non-empty groups in order |
|---|---|---|---|---|
| 1 | milk / mleko | 95 / 95 | `MILK 3.5% · Nabiał · Świeże` | Świeże → Płynne i napoje → Proszki i suche → Inne |
| 2 | cream / śmietana | 581 / 581 | `CREAM · Nabiał · Świeże` (plain dairy creams lead; `*_ice_cream_*` pastes sink) | Świeże → Pasty → Proszki i suche |
| 3 | SMP | 3 (was **0**) | `SKIMMED MILK · Nabiał · Proszek` | Proszki i suche |
| 4 | mleko w proszku | 34 (was **0**) | `SKIMMED MILK · Nabiał · Proszek`; AND-semantics exclude chilled `MILK 3.5%` | Proszki i suche |
| 5 | sucrose / sacharoza | 39 / 39 | `SUCROSE SUGAR · Cukry i substancje słodzące · Suche` (zero-sugar colas sink) | Płynne i napoje → Proszki i suche |
| 6 | dextrose / dekstroza | 3 / 3 | `DEXTROSE · Cukry i substancje słodzące · Suche` | Proszki i suche |
| 7 | inulin / inulina | 4 / 4 | `INULIN · Specjalne · Inne` (specialty_component — honest Inne); `FRIMULSION FIB · Błonnik · Suche` | Proszki i suche → Inne |
| 8 | stabilizer / tara | 49 / 1 | `TARA GUM · Stabilizatory · Suche`; `AGAR · Stabilizatory · Proszek` | Proszki i suche |
| 9 | pineapple / ananas | 13 / 13 (no „ananas" row exists — pure alias reach) | `PINEAPPLE · Owoce · Świeże` | Świeże → Puree i przeciery → Pasty → Płynne i napoje |
| 10 | strawberry / truskawka | 48 / 48 | truskawka: `STRAWBERRIES · Owoce · Świeże`; strawberry: exact-prefix `STRAWBERRY PUR KERRY` leads (baseline quality rule), fresh still beats frozen | Świeże → Mrożone → Puree i przeciery → Pasty → Proszki i suche |
| 11 | banana / banan | 11 / 11 | `BANANA · Owoce · Świeże` | Świeże → Puree i przeciery → Pasty |
| 12 | basil / bazylia + vanilla / wanilia | 1 / 1 + 44 / 44 | `BASIL · Zioła · Świeże`; wanilia: `VANIGLIA` leads, `GOLDEN` found via Polish internal name, colas last | Świeże (basil); Pasty → Płynne i napoje (wanilia) |

## 4. Discoverability coverage — ALL active searchable records

Population: **2,070** active + engine-approved rows (live staging census 2026-07-24).

Method (exact server semantics — a record is *reachable* when at least one natural name token
of `normalize(display + internal)` matches it through `buildSearchTermGroups` → ilike):

- **2,051 rows** whose display+internal are ASCII-only (after the `·` separator): every such row
  contains at least one ≥2-char ASCII name token (SQL-verified: **0** rows lack one), and any such
  token matches itself verbatim through the substring filter → **all trivially reachable**.
- **19 rows** carry non-ASCII letters (Ä ą É Í Ó ó ż Ú — the full cohort was pulled live): each was
  audited individually with the exact filter replica (`coreSearchQueries.test.ts` →
  "all 19 non-ASCII rows are reached by at least one natural name token"). All 19 have clean ASCII
  internal names (`jagermeister`, `bacardi_limon_35_percent`, `cream_18_percent_bio`,
  `rose_petals_in_sugar_polska_r_a`, …) → **all reachable**; „róża"/„roza" additionally bridges
  through the alias family to the `ROSE PETALS` display.

**Coverage: 2,070 / 2,070 (100%). Unreachable records: 0 (empty list — nothing capped).**

Known query-form limitation (not per-record unreachability): a *brand-only* diacritic query typed
in its ASCII form (e.g. „piatnica") cannot match the raw `Piątnica` brand column through ilike;
those rows remain reachable by every name token (`cream`, `skyr`, `cottage`, …). Fixing the brand
form would need server-side unaccent — out of scope for this pass (DB-side change).

## 5. Staging-vs-fixture verification note

- Live verification ran READ-ONLY on the staging-scoped connector (project `tunab…`), never the
  production `mcp__supabase__*` connector. Queries: censuses (48 categories / 428 subcategories,
  all mapped by `formGroupOf` — the honest `Inne` remainder is enumerated in the census test),
  the 12 core-query count replications, top-sample pulls, and the non-ASCII cohort pull.
- Unit fixtures in `coreSearchQueries.test.ts` are the REAL staging rows (ids, display names,
  categories, subcategories from the live pulls; internal names representative where the pull
  did not include them). The PostgREST *translation* (or-groups, eq filters, `.range`, safe
  columns, abort) is pinned separately by `liveSearchContract.test.ts` against a capturing fake,
  so fixture tests + contract pins together cover the whole live path.
- First-window note (baseline behaviour, unchanged): the ranked view draws on the first 200-row
  alphabetical window; for families larger than 200 (cream = 581) some candidates enter ranking
  only after „Pokaż więcej wyników". `SEARCH_PAGE_SIZE = 200` still covers the largest single
  CONCEPT family (milk = 95) whole, per the frozen baseline comment.

## 6. Gates

| Gate | Result |
|---|---|
| `npm run build` (tsc -b + vite build) | PASS |
| `npx vitest run` | Owned scope: **145/145 PASS** (8 files, incl. new `coreSearchQueries.test.ts`). Full suite: 4,804 passed, **14 pre-existing failures** in `src/features/ingredients/*migration*` pin tests — proven identical on clean baseline `4dfb097` with this branch's diff stashed; outside AGENT C ownership (flagged separately, chip already pending) |
| `npx eslint .` | PASS — 0 errors (2 pre-existing warnings in router/pro-core, not in scope) |
| `npx tsc -b` | PASS |
