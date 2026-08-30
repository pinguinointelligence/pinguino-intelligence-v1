# §32–§40 MATCHING — FORENSIC INVENTORY (canonical owners)

| # | Concern | Canonical owner | Notes |
| --- | --- | --- | --- |
| 1 | Official / library recipe querying | `src/data/recipes/executableRecipeLibrary.ts` → `EXECUTABLE_RECIPE_TEMPLATES` | **6 templates only**, ALL `profile: 'milk_gelato'`, `servingModeId: 'temp_minus_11'`, `publicationStage: 'owner_review'`. Lines carry real `mapperIngredientId`. Names: Śmietankowe na żółtkach, Rocero, Raphaello, Kidi Bueno, Oreyo, Knickers. |
| 1b | Flavour inspiration | `src/data/recipes/flavorCatalogue*.ts` | **NOT a recipe authority.** Its own header: "imports flavor INSPIRATION metadata only — no grams, no product ids, no verified doses, no Engine-ready recipe." Must not be matched as if executable. |
| 2 | Community published recipes | `src/services/community.ts` → `gellatti_list_community_v1`, `gellatti_search_community_v1`, `gellatti_get_publication_v1` | Formulation only via `getPublicationFull` → entitlement-gated, refuses server-side when unpaid (§9). |
| 3 | Top 100 / ranking | `gellatti_top_recipes_v1(p_window,p_limit)` + `src/features/community/domain/ranking.ts` (`RANKING_WEIGHTS_V1`) | Weights mirrored EXACTLY in SQL; a source test pins the two together. **No second ranking may be introduced.** |
| 4 | DNA / `based_on` | `public.recipe_lineage` (+ `root_publication_id`/`root_creator_user_id`) and `gellatti_publication_card_v1.based_on`; pure rules in `src/features/community/domain/lineage.ts` | Root resolution fixed in #30, proven on staging (Maria→Tomek→Anna). |
| 5 | Recipe cards + open/copy/derive | `useRecipeDerivation` (**THE canonical derive authority**), `UseRecipeActions`, `CommunityRecipeCard`, `recordDerivation` | Re-reads the source through the entitlement-gated RPC, returns typed refusals, records lineage. HOME must call this, never reimplement. |
| 6 | Search normalization / ranking utils | SQL: `gellatti_search_root` (Polish stemmer: owych/owym/owej/owe/owy/owa/ami/ach/om/ow/ie/y/i/a/e), `gellatti_search_match_tier`. Client: `normalizeIntentText`, `matchStem`, `scoreCandidate`, `escapeLikePattern`/`ilikeOrFilter` | `gellatti_search_root` is Polish-oriented; it stems `strawberry`→`strawberr` but NOT `strawberries`. |
| 7 | Account / plan visibility | `EffectiveAccess.canHome/canPro` via `proCoreAccessStore`; `demoSafeRecipe.ts`; server-side refusal in `getPublicationFull`; `useHomeEntitlement`/`useCanSeeExactGrams` | Gram visibility is already decided; matching introduces NO new paywall decision. |

## The decisive structural constraint

`gellatti_top_recipes_v1` returns a card: slug, title, tags, category, image_url,
creator, metrics, `based_on`, published_at, publication_id, version_number.
**It carries NO ingredients** — by design, because the formulation is entitlement-gated.

Verified on staging: `QA Gelato Wanilia -11` has 6 items with canonical ids
(PI-ING-000180/000236/000270/000492/000494/000514) in `recipe_versions.recipe_input`,
but none of that reaches the public card.

Therefore §32's strict rule ("every requested ingredient identity must be present")
**cannot be evaluated client-side** without either leaking formulation or degrading to
title matching — and the owner explicitly forbids title-only proof.

## Design that follows

A SECURITY DEFINER matcher evaluates the ingredient rule INSIDE the database and
returns only card-level fields plus match EVIDENCE (which requested ids were found, how
many extras). No gram, no dose, no composition crosses the boundary — the same pattern
as `gellatti_publication_is_published_v1` and `gellatti_active_mapper_ingredient_v1`.

Ranking is NOT recomputed: candidates are restricted to the Top 100 as returned by
`gellatti_top_recipes_v1`, preserving its order.

## Honest consequence for the official side (CORRECTED after deeper inspection)

Stronger than first reported. `openExecutableRecipeTemplate` calls
`currentUserHasOwnerReviewAccess`, which checks `admin_users` and whose own comment
says: *"Owner Review is an administrative staging surface, not a Pro-plan
entitlement."* Every template is `publicationStage: 'owner_review'`.

So the official corpus is not merely small — **for an ordinary customer it is empty by
design.** There is currently NO customer-facing official recipe library in Gellatti.

The matcher is therefore built and tested against the real templates so it works the
moment such a library exists, but `officialCandidatesFor` takes the viewer's
owner-review access and returns nothing without it. Offering a customer a match that
`openExecutableRecipeTemplate` would then refuse is worse than offering none.

`truskawka sorbet` correctly yields no official match — and so does every other
customer query today.

## Visibility correction accepted (owner, 2026-08-30)

Recipe COMPOSITION is public in Gellatti; only exact GRAMS are entitlement-gated. The
matcher therefore returns ingredient NAMES freely (§36 "Also includes"), and its single
hard boundary is that no gram, ratio or mass ordering may cross it. `also_includes` is
aggregated ORDER BY NAME precisely so mass order cannot be inferred from position.
