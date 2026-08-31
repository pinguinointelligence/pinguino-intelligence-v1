# §32–§40 MATCHING — CLOSE-OUT

**Staging HEAD** `c004d659` · **deployment** `dpl_4fTPsCFVRjgURj7TPUfgvENV4yXA` ·
**served bundle** `index-DCMh6D8d.js` · viewport 390×844

| PR | SHA |
| --- | --- |
| #40 CI-INFRA | `283b24b5` |
| #37 matching | `6c60a571` |
| #46 ordering + refusal | `c004d659` |

New RPC: `gellatti_match_community_top100_v1(text[], text, integer)` → grants `anon, authenticated`.
Returns 13 keys — publication_id, slug, title, description, image_url, category,
published_at, version_number, rank, all_requested_present, also_includes, creator,
based_on. **No gram key** (verified by key scan and regex).

## Served QA matrix

| Case | Result | Evidence |
| --- | --- | --- |
| 1 Community true match | **PASS** | popup automatic after §23 answer, **no second CTA** |
| 2 title-only false friend | **PASS** | "Wanilia"-titled publication, no vanilla identity → no popup |
| 3 branded strawberry | **PASS** | Ravifruit puree `PI-ING-001435` → no popup |
| 4 `truskawka sorbet` no-match | **PASS** | no popup, normal creation, fruit added as `GŁÓWNY` |
| 5 strict multi-ingredient | **PASS** | 2→1, 3→1, present+missing→0 (both variants) |
| 6 Community selection / DNA | **PARTIAL — see below** | |
| 7 anonymous visibility | **PASS** | HTTP 200; names + creator + based_on; `gramKeysPresent: []` |
| 8 Gellatti language | **PASS** | zero leaked technical terms |

Bonus: **§12/§75/§11C** — PRO with `default_experience=home` landed on the HOME creator
with both segments rendering (HOME active, PRO inactive). Setting restored afterwards.

## Case 6 — what is proven and what is not

QA account: dedicated staging HOME fixture, provisioned exactly as
`scripts/seed-staging-admin.mjs` does (confirmed email, active account state, profiles,
`admin_grant` HOME entitlement). 0 saved recipes at start. Credentials not recorded here.

| # | Criterion | Result |
| --- | --- | --- |
| 1–4 | reach match, resolve §23, popup, choose Community | **PASS** |
| 5 | `useRecipeDerivation` reaches `status === 'done'` | **NOT REACHED** for the matched publication |
| 6 | popup closes only after success | **PASS** — it stayed open on refusal |
| 7 | resulting recipe has real lines | not reached through the popup |
| 8 | saved-recipe count follows the HOME rule | **PASS** — 0 → 1, at the cap of 1 |
| 9 | lineage row exists | **PASS** |
| 10 | parent correct | **PASS** — `QA-STAGING-SEED A — Maria original` / Maria QA |
| 11 | root correct | **PASS** — same, Maria QA |
| 12 | public `based_on` credits root | **PASS** (proven at depth 2 in #35) |
| 13 | grams governed by existing entitlement | **PASS** |
| 14 | no HOME-specific copy/derive | **PASS** — `useRecipeDerivation` + `recordDerivation` only |

### The blocker (a separate, pre-existing defect)

Deriving `QA Gelato Wanilia -11` fails in the canonical path:

```
POST /rpc/create_recipe_with_v1 → 400
{"code":"P0001","message":"recipe product behavior scope mismatch for milk-base:milk_3_5"}
```

`useRecipeDerivation` passes `productComposition: null`, and that publication's seeded
lines (`milk-base:milk_3_5`) carry ProductBehavior scope expectations the guard refuses.

**Isolated:** deriving `QA-STAGING-SEED A` through the identical RPCs as the same user
returned **200** and created recipe `64d245fe-cd20-4c02-9990-ba23b23e7a30`, then
`gellatti_record_derivation_v1` returned depth 1 with root = Maria. So the derivation
path is functional; the defect is that ONE publication's data.

It cannot be reached through the popup because the symbolic seeds carry no ingredients,
so the matcher correctly never offers them — the only ingredient-bearing Top 100
publication is the one with the broken data.

**This is not a matching defect and not a HOME defect.** Matching, the popup, the
canonical wiring and the refusal handling are all verified.

## Defects found by served QA in this phase

1. **Ordering** — matching ran only on the CTA, so for any ambiguous ingredient (the
   common case) the popup never appeared. Fixed in #46; re-verified on the served build.
2. **Refused derivation looked like success** — popup closed and marked the recipe ready
   with 0 lines. Now only `status === 'done'` closes it; refusals stay and explain
   themselves in Gellatti Polish.
3. **`rules-of-hooks`** — a predicate named `use*`; renamed rather than suppressed.

## Negative control retained

`home@home.com` holds 4 saved recipes against `HOME_MAX_SAVED_RECIPES = 1`, so
`canCreateNewRecipe` (enforced in `supabaseRecipes.createRecipe`) refuses. Served: popup
stays open, recipe untouched, canonical Gellatti explanation shown, "Tworzę własną
recepturę" still available.

## Follow-ups recorded (NOT fixed here)

- **§11C** — the HOME|PRO switch is not mounted on the PRO workspace, so a PRO
  subscriber sitting in PRO has no header route back to HOME.
- **Derivation data defect** — `QA Gelato Wanilia -11` cannot be derived
  (`recipe product behavior scope mismatch for milk-base:milk_3_5`).
