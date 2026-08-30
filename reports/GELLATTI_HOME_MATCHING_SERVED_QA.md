# §32–§40 MATCHING — SERVED QA EVIDENCE

Environment: `staging.pinguinoai.com` · project `tunabqqrwabacxjcxxkz`
RPC under test: `gellatti_match_community_top100_v1(text[], text, integer)`

## 1. Matching matrix — executed against REAL staging data

| # | Case | Requested canonical identity | Profile | Result | Why |
| --- | --- | --- | --- | --- | --- |
| 1 | **True match** | `PI-ING-000180` (CREAM 30% · Mlekovita) | Gelato | **1 match** | `QA Gelato Wanilia -11` genuinely contains this identity |
| 2 | **False friend — title matches, composition does not** | `PI-ING-001705` (VANILLE · Leagel Paste) | Gelato | **0** | The publication is TITLED „Wanilia" but its composition contains **no vanilla identity at all**. Title similarity alone proves nothing. |
| 3 | **False friend — branded paste** | `PI-ING-000723` (CORIANDOLINA STRAWBERRY · PreGel Paste) | any | **0** | No publication contains it |
| 4 | **`truskawka sorbet`** | `PI-ING-001553` (STRAWBERRIES · Fresh Fruit) | Sorbet | **0** | No Sorbet publication exists, and none contains strawberries |
| 5 | **Strictness** | `PI-ING-000180` **AND** `PI-ING-001553` | Gelato | **0** | One identity present, one missing → not a match. Containment, not overlap. |
| 6 | Missing identity | `PI-ING-000180` + `PI-ING-999999` | any | **0** | — |
| 7 | Wrong category | `PI-ING-000180`,`PI-ING-000236` | Sorbet | **0** | §40 profile filter |
| 8 | Empty request | `[]` | any | **0** | Refuses to match everything |

Case 2 is the important one: it is a genuine, unstaged demonstration that a perfect
title match is correctly rejected when the canonical identities are absent.

## 2. Security properties — executed live

| Property | Method | Result |
| --- | --- | --- |
| Unpublished cannot appear | Set `status='unpublished'` on the only ingredient-bearing publication, re-ran the matcher | **0 matches** |
| …and restoration works | Set `status='published'` again | **1 match** — data restored, verified |
| No gram leak | Key scan + regex over the returned payload | 13 keys returned, **none** gram-related; `"(planned_grams\|actual_grams\|grams\|percent\|total_batch_g)"` → **no match** |
| Returned keys | — | `all_requested_present`, `also_includes`, `based_on`, `category`, `creator`, `description`, `image_url`, `publication_id`, `published_at`, `rank`, `slug`, `title`, `version_number` |
| Drafts unreachable | Source contract test | the function never references `saved_recipes` |
| Ranking not reimplemented | Source contract test | sources `gellatti_top_recipes_v1`, preserves order via `WITH ORDINALITY`, references no popularity component |

## 3. Official library — honest state

`EXECUTABLE_RECIPE_TEMPLATES` is the only executable official authority: **6 templates,
all `milk_gelato`, all `publicationStage: 'owner_review'`**. Opening one runs
`openExecutableRecipeTemplate` → `currentUserHasOwnerReviewAccess` → `admin_users`.

**For an ordinary customer the official corpus is empty by design.** `officialCandidatesFor`
is therefore gated on the same authority as opening, so an offer and an open can never
disagree. Every customer query today yields no official match — including
`truskawka sorbet`, which is the correct outcome, not a weakened matcher.

## 4. Identity resolution — served (from the previous phase, re-confirmed)

`truskawka` now offers, in order:

1. **STRAWBERRIES · Fresh Fruit**
2. STRAWBERRIES · Frozen Fruit
3. STRAWBERRY PUR KERRY · Ravifruit Puree
4. STRAWBERRY · Backaldrin Paste
5. STRAWBERRY · Backaldrin Variegato
6. STRAWBERRY · Master Martini Variegato

The plain forms lead; branded commercial forms follow; the beverage that previously
appeared has dropped out of the offered set.
