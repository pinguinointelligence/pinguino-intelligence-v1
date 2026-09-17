# Dependency handover — a real product whose composition differs from the role's reference

**From:** SHOP / Starter Pack local guide (this workstream, branch `claude/pl-country-product-set`).
**To:** the owner of the Mapper / products track, and the integrator of "Plan przygotowania Gellatti z istniejących danych".
**Date:** 2026-09-17. **Status of everything below:** `NOT YET APPROVED`, nothing applied.
**Accepted 2026-09-17** by the "Plan przygotowania Gellatti z istniejących danych" track, recorded on their side in
`~/Developer/pinguino-affiliate-work/design-rollout-evidence/MAPA-WDROZENIA.md §9`. They verified the two findings
independently (the adapter borrowing the reference composition, and only two 42 % cream-powder rows in the frozen SA-10
release) and split it as: the CODE question (which lane binds a real product to a profile, whether a product's own
composition ever reaches the Engine, and what happens to the recipe) is theirs; **creating new profiles is a catalogue
data change that needs the owner's separate, specific consent**, which they do not hold, so nothing is created or bound
meanwhile. They will put two options from existing patterns to the owner: a neutral profile per composition band (like
today's neutral 42 % row) or passing a product's own composition to the Engine with a named owner for verifying those
values. Their sequencing: after #409 and Production stage 1, not attached to either PR. Until the owner decides, they
asked SHOP to keep exactly the behaviour below.

**Scope:** one dependency, handed over — SHOP does not implement it. No second Mapper, no new classifier, no arbitrary
single profile for a whole fat band, and the 72 % product is never bound to the 42 % reference.

## 1. What SHOP needs, in one sentence

For the Starter Pack cream-powder role, several markets can only be closed with a **genuine dairy cream powder whose fat
differs from the 42 % reference**. SHOP can offer such a product as a purchase line, but the app cannot compute a base
recipe from that product's own composition — so the country is purchase-ready and **not** publication-ready.

## 2. What was verified (read-only, on current staging)

| Fact | Evidence |
|---|---|
| A catalogue product cannot carry its own composition into a base recipe | `src/data/products/productEngineHandoff.ts:71-72` — `prepareProductEngineIngredient()` borrows the reference's composition; header at `:4-8`: "the product itself carries no water / total_solids / sugar-type breakdown, so it cannot become a full EngineIngredient on its own" |
| The second adapter does the same | `mappedCatalogIngredient` in `src/features/global-catalog/catalogIngredient.ts` also takes the reference composition; a product's own label facts are handled separately for TOPPING (`labelOnlyCatalogToppingIngredient`), and cream powder in a base is `BASE_RECIPE` |
| The substitution path is NOT fat-blind (an earlier claim of ours, withdrawn) | `applyPipeline.ts:8899-8904` swaps the whole ingredient object (16 composition fields) via `structuredClone`, `:8905` re-optimises, `:8913` verifies, and the refusal is literally `hard:fat` (`solver.ts:72,103`) |
| Live ingredient data is FINAL 2541 and matches the repo | `public.mapper_basement` = 2 541 rows; `docs/ingredients/validation/mapper_basement.csv` identical id-set hash; `PI-ING-000260` identical field-for-field. The earlier "2 147 rows / repo-vs-DB mismatch" was an uncommitted edit in a 2026-08-25 worktree — withdrawn |
| No profile exists for a 53–75 % dairy cream powder | the only `cream_powder` rows are `PI-ING-002242` ("CREAM POWDER · 42% FAT · Dry", neutral) and `PI-ING-000260` (Mlekovita 42 %); everything at 45–53 % in the dairy band is a chilled Fabbri/Leagel cream, not a powder |
| A neutral profile is an existing pattern, not a new idea | `PI-ING-002242` is exactly that: brand-neutral, subcategory `cream_powder` |

Note on scope: these two adapters show what the app does today. They do **not** by themselves establish what the upstream
data model permits — that judgement belongs to the Mapper/products track, which is why this is a handover and not a plan.

## 3. The rows this blocks (stable IDs)

**Closing a role today, but needing their own profile** (country purchase-ready, not publication-ready):

| ID | Product | Fat | Evidence |
|---|---|---|---|
| `NZ-CRP-1` | Keto Store NZ, Cream Powder 750 g | 53.3 % (computed from the printed panel: 6.4 g fat per 12 g powder) | CONFIRMED_LOCAL, in stock |
| `SE-CRP-1` | Skafferimat, Gräddpulver — äkta lufttorkad grädde | 53.5 % | CONFIRMED_LOCAL, in stock |
| `US-CRP-1` | Hoosier Hill Farm, Heavy Cream Powder 1 lb | 72 % (prose claim only; see §4) | CONFIRMED_LOCAL, in stock |

**Not closing a role, but the same question** — one UK product recorded as a lead in 11 markets:
`AR-CRP-2`, `AU-CRP-1`, `BR-CRP-2`, `CA-CRP-2`, `CL-CRP-1`, `CO-CRP-1`, `CR-CRP-1`, `DO-CRP-1`, `MX-CRP-2`, `PA-CRP-1`,
`UY-CRP-1` — Ingredients Bar Cream Powder, 75 % fat, with a full per-100 g panel (fat 75 g, protein 8.5 g, carbs 12 g of
which sugars 12 g, salt 2 g; ingredients: dairy cream, milk protein, lactose).

## 4. What is a data problem and what is a matching problem — kept apart

- **US (`US-CRP-1`) has a source-data problem of its own.** The only composition on the manufacturer's page is the prose
  "72 % butterfat" plus the ingredient list. The gallery's nutrition image cannot be used: Total Fat 0 g is printed above
  Saturated Fat 5 g, a 0 g line carries 3 % DV, one nutrient row has no nutrient name, the Daily-Value footnote is not
  language, the servings arithmetic (151 × 6 g ≈ 906 g) matches no pack on that page, and the address reads
  "MIDDLETHIN, IN". These are observations about the image; **how the image came about is not established and is not
  claimed**. A proper specification for SKU HHF263 has not been found (no spec sheet on the manufacturer's site).
  Nothing was inferred from the fat percentage, and no values were carried over from another variant.
- **NZ and SE have usable printed panels.** Their problem is only the missing profile/binding path.
- Obtaining a manufacturer specification by writing to a seller is possible but **requires the owner's separate consent
  to send a message**; it has not been done.

## 5. What we ask the receiving track to decide

The approved path, end to end, for a product whose composition differs from the role reference:

1. **profile** — does a neutral profile per composition band get created (pattern: `PI-ING-002242`), and who creates it?
2. **binding** — which existing lane binds a real local product to that profile (admin product-add-request →
   `catalog-submit`, or another current lane), and with what provenance?
3. **composition to Engine** — is the product's own composition ever passed, or does the profile carry it?
4. **recalculation** — confirm the recipe is then recomputed for that composition, or state plainly that it is not.

Until 1–4 are answered, SHOP will:
- keep such a product as a **purchase** line only, labelled "different composition" with its fat printed;
- print, under that product, "The app calculates amounts for the reference composition, not for this product";
- count the country as purchase-ready and **not** publication-ready;
- never set a `canonical_ingredient_id` for it, and never bind it to `PI-ING-000260`.

## 6. Sequencing already known

PRs #336 and #328 are open and touch the route validator and related paths; any new profile migration would sequence
after them. The US QA fixture rows in `shop_country_components` are already excluded structurally by
`public.shop_is_reserved_test_url` (migration `20260917111101`), so they are not a blocker here.
