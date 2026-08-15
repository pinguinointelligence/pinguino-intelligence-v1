# Recipe Library V1 — completion ledger

Audit date: 2026-08-15
Baseline: `origin/staging` at `7de5bcac28e7e8d7cf292dab98ba95df6091c87e`
Publication boundary: research / Owner Review / staging only

## Status

**NOT READY — EXACT RECIPE LIBRARY DEFECTS REMAIN**

The evidence phase is complete for the supplied lists, but the repository and supplied artifacts do not contain the exact executable vectors needed to create real recipe cards. No recipe was made selectable from research metadata, product names, liquid cocktail ratios or guessed grams.

## Requested scope and completed work

| Area | Requested | Completed | Executable result | Exact blocker |
|---|---:|---:|---:|---|
| Lost & Legendary | recover 19 selected rows plus mandatory Poland proof | 19/19 reconciled; Poland searched across refs and recoverable objects | 0 new templates | Existing 19 are research candidates without grams; `Śmietankowe na żółtkach` vector is absent |
| New Recipe toolboxes | Gelato/Sorbet/Vegan/Protein neutral starters | 4/4 implemented from accepted canonical templates | 4 explicit new-draft starters | Served staging QA pending until deployment |
| Cocktails | 22 research and executable templates | 22/22 research rows and 22/22 architecture-gap rows | 0/22 | No approved canonical vectors, products, grams, process, alcohol frontier or sensory proof |
| Spirit Signatures | 15 | 15/15 research rows | 0/15 | Actual product ABV/sugar/water/density, vector, process and alcohol frontier absent |
| Fantasy research | 50 | 50/50 official-source research rows | 0/50 | No approved vectors; trademark/product decisions and several exact sources remain blocked |
| Fantasy Base/Topping | 50 | 50/50 decisions | 0/50 | Base, Topping and final grams are absent; technical/sensory/process proof absent |

## Lost & Legendary / Poland proof

The complete country-by-country reconciliation is in `reports/LOST_LEGENDARY_RECONCILIATION.md`. The historical 19-item payload survives, but `CuratedRecipeCandidate` contains no exact formula. `Śmietankowe na żółtkach` was not found in the selected commit/branch, current refs, 91 unreachable commits, 313 unreachable blobs or available attachments. Required external action: supply an authoritative historical file, commit, database row or exact ingredient-and-whole-gram vector.

## Research deliverables

- `reports/COCKTAIL_LIBRARY_MATRIX.md` — 22 concepts; official definition vs frozen-formulation gap kept separate.
- `reports/SPIRIT_SIGNATURES_MATRIX.md` — 15 concepts; generic spirit categories, not mandatory brands.
- `reports/FANTASY_50_RESEARCH_MATRIX.md` — complete 50-row Owner Review research register with source retrieval date.
- `reports/FANTASY_BASE_TOPPING_MATRIX.md` — complete 50-row Base/Topping decision register; no manufactured masses.
- `reports/NEW_RECIPE_TOOLBOX_MATRIX.md` — exact accepted starter template/ID/gram matrix.

## Safety and accepted behavior

- No `mapper_basement`, Base Engine formula, target band, secret, production data, billing or environment file changed.
- No liquid cocktail ratio was copied into a frozen formula.
- No branded packaged product was made mandatory.
- No research card was represented as an executable recipe.
- Existing Lost & Legendary publication decisions were preserved.
- New starters apply only to an explicit `+ Nowa receptura`; saved, historical, library and Production-source recipes retain their own stored lines.

## Tests and evidence

Focused recovery evidence: `npm test -- --run src/data/recipes/curatedCollections.test.ts src/data/recipes/inspirationHandoff.test.ts` → 2 files / 13 tests PASS. New Recipe focused and full-project commands/results are recorded in `reports/SERVED_STAGING_SELF_AUDIT.md` and the final handoff. Research files are data-gap reports, not executable recipe fixtures.

## Remaining exact items

1. Recover the Poland recipe vector.
2. Select exact canonical products/versions and serving profiles for each future template.
3. Supply approved Base/Topping grams and process scopes.
4. Prove Engine, alcohol frontier, allergen/nutrition/cost and sensory acceptance.
5. Resolve source/market/trademark decisions called out per row.
6. Only then create versioned templates, normal Recipe Library cards, staging fixtures and served QA.

## Git / deployment

The exact final commit and staging deployment are reported after the shared New Recipe candidate is deployed. The Recipe Library research reports themselves create no runtime cards and require no database write. Customer production remains unchanged.
