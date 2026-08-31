# COMMUNITY DERIVATION — FORENSIC + FIX

Scope: the last §32–§40 Case 6 blocker. Two independent defects were found. Neither was
bad QA data, and neither was fixed by touching the guard.

---

## 1. The refusal, exactly as it arrived

Deriving a Community publication through the HOME match popup returned HTTP 400 from
`create_recipe_with_v1`:

```
P0001  recipe product behavior scope mismatch
```

raised by `assert_recipe_behavior_authority_all_lines_v1`, reached through
`recipe_behavior_write_guard_v1`.

## 2. The guard was NOT touched first

Per the owner instruction, the guard was treated as correct until proven otherwise, and
the data was audited before any code was written.

**Audit: 4 publications, 0 invalid.** Every publication's stored
`product_composition` satisfied the authority — schemaVersion 1, BASE_FORMULATION,
three arrays, one behaviour snapshot per line id. The refusal was reproducible on
publications whose data was provably well-formed, including ones seeded through the
canonical RPCs.

That result eliminated the two comfortable explanations at once: it was not a bad row,
and it was not `QA Gelato Wanilia -11` in particular. The defect was systemic, on the
read side.

## 3. Root cause — the entitled read dropped the composition

`gellatti_get_publication_full_v1` returned the recipe input but **never returned
`product_composition`**. `useRecipeDerivation` therefore called `createRecipe` with
recipe lines and no behaviour snapshots. The new recipe had N lines and 0 snapshots, so
`assert_recipe_behavior_authority_all_lines_v1` refused — **correctly**. The guard was
right the whole time; it was reporting a real scope mismatch produced upstream.

This is why every honest-looking workaround would have been a lie:

| Tempting "fix" | What it actually does |
|---|---|
| Relax the scope check | Lets genuinely unauthoritative recipes be written |
| Fabricate `productComposition` | Invents behaviour the source recipe never had |
| Write null/empty to satisfy the RPC | Same as above, with the CHECK constraint hiding it |
| Service-role lineage insert | Proves nothing about the customer path |

## 4. Fix

**Migration `20260831090000_publication_full_carries_composition.sql`** — the entitled
publication read now also returns `'product_composition', v_version.product_composition`.
No visibility rule changed: this RPC was already the entitled full read, and the
composition is the behaviour authority for lines the caller is already entitled to see.

**`src/features/community/useRecipeDerivation.ts`** — `SourceRead` carries
`productComposition`; the publication branch returns it; `createRecipe` receives it.

**Verified:** 400 → 200, **6 behaviour snapshots carried** into the derived recipe.

### Known remaining gap, stated rather than hidden

`gellatti_open_share_v1` and `gellatti_open_received_share_v1` still do not return
`product_composition` (verified 2026-08-31). A **share** of a recipe with ingredient
lines therefore still hits the same authority refusal the publication path just escaped.
This is documented in the code at the share branch and is recorded as a separate task —
it is out of scope here and is not silently patched.

---

## 5. Second defect — the derivation succeeded but the recipe never opened

With the composition fix deployed, served QA on staging showed the derivation was fully
correct server-side:

- popup appeared automatically after the §23 answer (no second CTA),
- popup closed with **no refusal** (`status === 'done'`),
- saved count **0 → 1**,
- recipe written with **6 lines**,
- lineage `relation: copy`, `depth: 1`, root creator preserved.

And the customer was still returned to an empty intent screen:

```
{ path: "/", recipeLines: [], storeItems: 0 }
```

**Cause:** `useRecipeDerivation` finishes with `navigate('/pro/recipe')`. That is right
for a Pro user. A HOME subscriber is correctly bounced back by the §13 redirect
(`HomeSubscriberProRedirect`), and HOME's `recipeStore` had never been loaded with the
derived recipe. The customer owned a recipe they could not see.

**Fix (PR #53):** `HomeMatchGate` reads the finished recipe through the canonical
repository (`getRecipe` + `getVersions`) and loads the one shared store via
`loadRecipeInput` — the same pattern `RecipeVersionsSection` uses. It runs only after
`derivationSucceeded`, so a refusal still leaves the popup open with its honest message.

No HOME-side derive, copy or formulation logic was added; a test forbids
`createRecipe(`, `recordDerivation(`, `saveNewVersion(` and `buildDerivedRecipe(` in
that file. HOME remains a presentation layer.


---

## 6. Third defect — HOME generated a recipe behind an unanswered question

With the composition fix and the opener seam both deployed, the derivation was correct
end to end and the customer was STILL shown the wrong recipe.

The auto-generate effect fires as soon as profile + machine are known. The match popup
did not block it. So while the popup was still asking *„Możesz zacząć od jednej z nich"*,
the effect ran `rebuildNewRecipeStarter` — deliberately a NEW draft — which replaced the
just-adopted recipe and cleared its saved link.

**Why it nearly passed review.** The publication was itself built from the canonical
milk-base starter, so a regenerated recipe has the SAME six ingredients and the SAME
`milk-base:*` line ids. Every identity-based check passes. Only two things differed:

| Line | Adopted (source) | Regenerated |
| --- | --- | --- |
| MILK 3.5% | 670 g | 672 g |
| TARA GUM | 5 g | 3 g |

plus `savedRecipeId: null`, which is also why the header showed HOME's proposed name
instead of `QA Gelato Wanilia -11`. That name mismatch was the visible thread; it would
have been easy to dismiss as cosmetic.

**Fix (PR #56).** Generation is held while the popup is open, and adopting claims the
generate key without generating. The guard POSTPONES — a customer who dismisses the
popup still gets exactly one starter, proven served.

## 7. Two process errors worth recording

1. **A changed bundle hash is not proof of the right deployment.** Two deploys were in
   flight; the intermediate one did not contain the fix, and a whole QA run was void.
   Deploy identity now comes from Vercel's alias record: alias → deployment → commit SHA.
2. **A stale-state read can imitate success.** `derive()` returned `void` and set React
   state, so a caller that awaited it and read `state` saw `idle` for a real success. The
   popup still appeared to close — but only because the hook's `navigate` remounted the
   page. `derive()` now returns its terminal state, and a test forbids the old signature.
