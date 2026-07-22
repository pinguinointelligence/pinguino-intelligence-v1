# CORE INGREDIENT SEARCH — natural Polish queries — completion ledger

**Status:** `CORE INGREDIENT SEARCH — WORKING FOR NATURAL POLISH QUERIES`
**Date:** 2026-07-22 · Scope: frontend search-normalization repair. No Engine science, no DB change.

## Root cause (proven, not assumed)

The ingredients are NOT missing. On staging `tunabqqrwabacxjcxxkz` (direct DB proof):
- `mapper_basement` = 2,083 rows; **2,070 `is_active AND approved_for_engines`** (all also `approved_for_base`).
- **truskawka: 4 approved rows** — Polish „TRUSKAWKA" is in the DISPLAY name (e.g. `PI-ING-000986` „UVA FRAGOLA TRUSKAWKA · Aromitalia", `PI-ING-000960`, `PI-ING-001036`, `PI-ING-000632`); + strawberry 26, fragola 16.
- **wanilia: 7 approved rows** — Polish „wanilia" is ONLY in `ingredient_name_internal` (display is Italian „VANIGLIA"/„BOURBON"/„GOLDEN"): `PI-ING-000748/000760/000761/000961/001110/001111/001194`; + vanilla 26, vaniglia 13.
- **ananas: the ONE row `PI-ING-001351` is `approved_for_base=false` / `Blocked`** → correctly excluded from every search view; there is NO approved „ananas". Pineapple: 10 approved rows.
- RLS `mapper_basement_select_pro` = `authenticated AND is_active AND approved_for_base AND active-subscription`. **pro@pro.com HAS an active subscription** (until 2026-08-15). **RLS-simulated as pro@pro.com → the base-table query returns 2,070 rows (truskawka 4, wanilia 7).** So the live rows LOAD for the owner.

**Where they disappeared:** the frontend matcher `filterIngredients` did a raw `haystack.includes(rawQuery.toLowerCase())` ([ingredientLibrary.ts:119](src/features/ingredient-builder/ingredientLibrary.ts)). It searched BOTH display + internal names (so exact „wanilia"/„truskawka" would match), but had **no diacritic / plural / grammatical / cross-language handling**, so the owner's natural forms failed:
- „truskawki" / „świeże truskawki" / „truskawek" ≠ stored „truskawka";
- „wanilii" / „waniliowy" ≠ „wanilia";
- „ananas" / „ananasa" → no approved row at all → must alias to „pineapple".

How many recipe stores: ONE (`recipeStore`). Monitor uses the same live state (proven earlier). Home/Demo vs Pro: same picker; demo route + non-Pro short-circuit to the 12-item demo catalog (English) — which is also why a demo-fallback state shows no Polish.

## Completed
- NEW [ingredientSearch.ts](src/features/ingredient-builder/ingredientSearch.ts) — one canonical, PURE normalization + alias layer: `normalizeSearchText` (lowercase, NFD diacritic strip, ł→l, punctuation/whitespace unify), `stem` (Polish inflection → root), a controlled PL↔EN↔IT↔ES alias dictionary (strawberry/vanilla/pineapple + raspberry/chocolate/pistachio/hazelnut/lemon), and `haystackMatchesQuery` (full-substring wins first → then per-token stem/alias match; stopwords like „świeże" never hide everything).
- [ingredientLibrary.ts](src/features/ingredient-builder/ingredientLibrary.ts) — the search index haystack is now NORMALIZED at build (display + internal + id + brand + category + subcategory); `filterIngredients` delegates to `haystackMatchesQuery`. No change to the load path, the demo fallback, or the selection→RecipeInput seam (stable `PI-ING-*` id preserved).
- Honest UX (Phase 6): the picker already distinguishes backend-unavailable (`fallbackNote` „Biblioteka PI Base niedostępna — pokazujemy składniki podglądowe.") from no-match; no-match copy sharpened to „Nie znaleziono składnika w katalogu PI. Spróbuj innej nazwy, formy lub kategorii." + „Wyczyść wyszukiwanie" exit. A backend/filter problem is never labelled an empty catalogue.
- **Tests:** NEW [ingredientSearch.test.ts](src/features/ingredient-builder/ingredientSearch.test.ts) (fixtures modelled on the REAL rows) — truskawka/truskawki/truskawek/świeże truskawki/świeżych truskawek/truskawkowy → strawberry family (incl. EN „strawberry"/IT „fragola"); wanilia/wanilii/waniliowy/vanilla → vanilla family (incl. the internal-name-only rows); ananas/ananasa/ananasowy/pineapple → pineapple; diacritic-insensitive; exact `PI-ING` id → that row only; no duplicates; all-stopword keeps the full list; truly-absent → honest empty; precision (czekolada ≠ strawberry). Gate: **4629 tests / 341 files PASS · ESLint 0 errors · tsc ✓ · build ✓.** Engine science untouched.
- **Commit + staging deploy:** see final report.

## Not completed
- Authenticated served-staging owner run (enter the queries as Pro) — AWAITING OWNER: the picker is Pro-gated and credential entry is disallowed for the agent, so I cannot log in to demonstrate on the served app. The fix is proven against the real row shapes (unit) + the DB (records exist + load for pro@pro.com) + the served bundle contains the normalization module.
- „ananas" surfaces PINEAPPLE rows via alias (there is no approved raw „ananas" product); if the owner specifically needs the raw „ANANAS · Giuso" powder (`PI-ING-001351`), it must first be approved (`approved_for_base=true`) — that is a data-curation decision, not a search fix. Logged honestly.

## Regression proof
Existing picker/search tests updated for the normalized haystack and green; workbench, save, versions, delete, entitlement, exact grams, Engine output, menu all unaffected (full suite 4629/4629). Selection still carries the stable `PI-ING-*` id into RecipeInput.

## Online verification
- local (unit + DB): **VERIFIED** — normalization resolves all owner families against real row shapes; DB confirms records exist + load for pro@pro.com.
- staging desktop / mobile (served, authenticated Pro search): **AWAITING OWNER**.
- production: **BLOCKED** (PI-P0-001, external).

## Owner test (staging, logged in as Pro)
Open `/pro/recipe` → the ingredient picker → type each and confirm real `PI-ING-*` rows:
- `truskawka` / `truskawki` / `świeże truskawki` → FRAGOLA TRUSKAWKA / STRAWBERRY rows;
- `wanilia` / `wanilii` → VANIGLIA / GOLDEN / VANILLA rows (Polish is in the internal name);
- `ananas` / `ananasa` → PINEAPPLE rows (no approved raw „ananas" product exists).
