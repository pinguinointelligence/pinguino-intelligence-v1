# US cream powder 72 % — evaluation against the existing Gellatti mechanism

**Date:** 2026-09-17
**Scope:** ONE product, ONE role (CRP — cream powder), ONE market (US).
**Nature of this file:** read-only evaluation. No code was changed, no DB row was written, no migration was
applied, no PR was opened. Every SQL statement run against the shared Supabase project
`tunabqqrwabacxjcxxkz` was a `SELECT`.
**Status of every recommendation below:** `NOT YET APPROVED`.

Owner instruction this answers (2026-09-17 evening): evaluating a real dairy cream powder with a different
fat content as a local alternative to the 42 % product is allowed; this is not automatic acceptance of the
72 % product; check full identity, composition, the right profile, and how the EXISTING Gellatti
substitution and recalculation mechanism would use it; do not map it onto the reference 42 % cream ID; no
1:1 substitution advice and no calculator beside the Engine; keep the difference between a local tara gum
and the Gellatti blend; use the existing product context, onboarding and importer; coordinate with the
workstream that owns the product binding; no second Mapper, no scanner re-implementation.

---

## 1. Identity and composition — what the page actually prints

### 1.1 Source and evidence

Evidence was re-read from the local evidence cache written by
`/Users/tomaszboro22/Developer/pinguino-pl-country/reports/a03/tooling/verify_ean_market.py` earlier the
same day (2026-09-17 15:37 UTC). The cache holds the complete page, so no new fetch was made.

| Artefact | Path |
|---|---|
| Verifier verdict | `/Users/tomaszboro22/.cache/gellatti-evidence/verify/0709986311180401.json` |
| Cached page body (745 554 bytes, complete) | `/Users/tomaszboro22/.cache/gellatti-evidence/vcache/9bbfcfa02c72a41c` |
| Quote — butterfat | `/Users/tomaszboro22/.cache/gellatti-evidence/verify/quote_9eea9fd8dceb85b2.json` |
| Quote — ingredients | `/Users/tomaszboro22/.cache/gellatti-evidence/verify/quote_1d5ae18cb65fc536.json` |
| Quote — US-only shipping (FAQ) | `/Users/tomaszboro22/.cache/gellatti-evidence/verify/quote_bd674776a3739bdb.json` |
| Research record | `/Users/tomaszboro22/Developer/pinguino-pl-country/reports/shop_starter_local/research/US.json` (item `CRP`, rank 1) |

The verifier verdict records `verification_class: EAN_ON_MARKET_PAGE`, `identity_basis:
GTIN_ON_THIS_PAGE`, `page_market: US`, `market_by: ADDRESS_COUNTRY`, `identifier_confirmed: true`,
`market_binding_confirmed: true`. Identity (A) and market binding (B) both hold, so `CONFIRMED_LOCAL`
under protocol rule 3 is correct.

### 1.2 Identity, as data on the page

From the page's `ProductGroup` JSON-LD and the embedded Shopify variant data in
`vcache/9bbfcfa02c72a41c`:

| Fact | Value | Where on the page |
|---|---|---|
| Product group | `Heavy Cream Powder` | JSON-LD `ProductGroup.name` |
| Brand | `Hoosier Hill Farm` | JSON-LD `brand.name` |
| Variant evaluated | `Heavy Cream Powder - 1 lb` | JSON-LD `hasVariant[0].name` |
| SKU | `HHF263` | JSON-LD `hasVariant[0].sku` |
| GTIN | `850054854513` (GTIN-12 / UPC-A) | JSON-LD `hasVariant[0].gtin` **and** Shopify variant `"barcode":"850054854513"` |
| Net weight | `454` g | Shopify variant `"weight":454` |
| Price | 19.99 USD | JSON-LD offer |
| Other variants | 2 lbs → `850054854001` (`HHF470`, 907 g); 25 lbs → `810215130375` (`HHF848`, 11 340 g) | JSON-LD + variant data |
| Market binding | `shippingDestination.addressCountry = "US"` on all three offers; `hasMerchantReturnPolicy.applicableCountry = "US"` | JSON-LD |
| Seller shipping policy | "We ship within the Continental U.S. … we do not ship internationally." | `hoosierhillfarm.com/pages/faqs`, quote file above |

The GTIN sits next to its own variant in the page's variant data (`"weight":454,… "barcode":"850054854513"`),
not in the URL or in a search echo. Protocol rule 2 is satisfied.

### 1.3 Composition — what IS printed

Exactly two composition facts are printed anywhere on the page:

1. **Butterfat, in prose, in the product description:**
   "this dried sweet cream has a 72% butterfat content".
   This is descriptive copy inside `ProductGroup.description`. It is **not** a declared label value from a
   Nutrition Facts panel.
2. **Ingredient list:**
   "Ingredients Cream, Nonfat Dry Milk, Natural Vitamin E & Vitamin C Ester (added to preserve freshness)".

Non-composition badges printed: `GMO Free`, `Gluten Free`, `Hormone Free`. Storage: "Store in a cool, dry
place." Usage note: "this is not a powdered coffee creamer or an instant cream powder and will not dissolve
instantly in liquid."

### 1.4 Composition — what is NOT printed

I scanned the complete cached HTML, including every `<script>` block, for nutrition-panel tokens. Counts of
occurrences in the whole 745 KB document:

```
'Nutrition Facts': 0      'Serving Size': 0       'Servings Per': 0
'Calories': 0             'Total Fat': 0          'Saturated Fat': 0
'Trans Fat': 0            'Cholesterol': 0        'Sodium': 0
'Total Carbohydrate': 0   'Dietary Fiber': 0      'Total Sugars': 0
'Added Sugars': 0         'Calcium': 0            'Allergen'/'allergen': 0
'Contains Milk': 0        'per 100'/'100 g': 0    'per serving': 0
```

So the page publishes **no nutrition panel at all**. Absent facts, named explicitly:

- **protein** — not printed
- **carbohydrate / sugars / lactose** — not printed
- **MSNF (non-fat milk solids)** — not printed
- **water / moisture / total solids** — not printed
- **salt / sodium / ash** — not printed
- **saturated fat, energy (kcal/kJ)** — not printed
- **allergen statement** — not printed (no "Contains: Milk"), although the ingredient list names Cream and
  Nonfat Dry Milk, so milk is present by ingredient
- **serving basis** — not printed. The US per-serving vs per-100 g question therefore does not even arise:
  there are no numeric nutrient values on the page to convert. The only numbers are the 72 % butterfat
  prose figure and the 454 g net weight. **No conversion was performed and none is possible from this page.**

The three product photographs (`HHF263_HeavyCream_1lb-3.jpg` and views 2–6) may show the physical panel,
but their `alt` text is generic ("Hoosier Hill Farm Heavy Cream Powder product photo (view 3)") and reading
them would require image OCR. That is out of scope here by the owner's instruction (no scanner work).

### 1.5 Composition findings that matter

1. **It is not a pure spray-dried cream.** The ingredient list carries **Nonfat Dry Milk** as a declared
   second ingredient and an **antioxidant system** (Natural Vitamin E & Vitamin C Ester). The Gellatti
   reference role (`RESEARCH_PROTOCOL.md`, CRP row) describes "spray-dried dairy cream … cream (optionally
   milk proteins, lecithin, an anti-caking agent)". Added nonfat dry milk is a *composition-shifting*
   addition, not a processing aid: it raises MSNF, lactose and protein relative to a pure cream powder at
   the same fat.
2. **The page contradicts itself.** The description says the product "is made with 100% real sweet cream"
   while the ingredient list has three items. Both sentences are page-printed. If anything is quoted to a
   customer it must be the ingredient list, not the 100 % claim.
3. **72 % is a category figure, not a lot spec.** The rank-2 US candidate, Anthony's
   (`646437482301`, LEAD only), prints the same 72 % butterfat while describing itself as "Only one
   ingredient - sweet cream solids" — a materially different composition at an identical headline number.
   Two different formulations quoting the same round figure is a signal that 72 % is a trade convention for
   "heavy cream powder" in US retail, not a measured declaration.
4. **The fat number alone cannot close the composition.** With fat = 72 and no panel, the remaining ~28 g
   per 100 g split between water, protein, lactose and ash is entirely unknown, and the declared nonfat dry
   milk makes a generic cream-powder assumption wrong rather than merely imprecise.

Equivalence class `B_SAME_TYPE_DIFFERENT_COMPOSITION` in `research/US.json` is correct and, if anything,
understated: the class captures the fat gap but the missing panel is the harder problem.

---

## 2. Profile in Gellatti's own data

### 2.1 Where ingredient profiles live

| Layer | Object | Evidence |
|---|---|---|
| Live DB (shared project `tunabqqrwabacxjcxxkz`) | `public.mapper_basement` — **2 541 rows** | `select count(*) from public.mapper_basement` |
| Live DB | `public.ingredients`, `public.ingredients_final_v0_95_no_npac` — **0 rows each** (legacy, empty) | same query pattern |
| Repo file | `/Users/tomaszboro22/Developer/pinguino-intelligence-v1/docs/ingredients/validation/mapper_basement.csv` — **2 147 records** | read directly |
| Table DDL | `/Users/tomaszboro22/Developer/pinguino-intelligence-v1/supabase/migrations/20260716101631_0006_mapper_basement.sql:32` (composition block from `:55`, engine block `:78-89`) | read |
| Row type | `/Users/tomaszboro22/Developer/pinguino-intelligence-v1/src/data/ingredients/ingredientRow.ts:37-113` | read |

The live DB is the FINAL 2541 set; the checked-out repo tree (`pinguino-intelligence-v1`, branch
`codex/live-product-scanner`) is still at 2147. **The two disagree about the reference row itself** (§2.2),
so any work here must state which of the three Mapper states it means.

### 2.2 (a) Does a high-fat dairy cream powder profile already exist? — **NO**

The reference row, as it stands in the live DB:

| Field | `PI-ING-000260` (live DB) | same id in repo CSV record 261 |
|---|---|---|
| display name | `CREAM POWDER · 42% FAT · Mlekovita · Dry` | `CREAM · Mlekovita Cream` |
| subcategory | `cream` | `cream` |
| water % | 3 | **0** |
| total solids % | 97 | **100** |
| fat % / milk fat % | 42 / 42 | 42 / 42 |
| NFMS % | 55 | **58** |
| protein % | 20 | 20 |
| lactose % / total sugars % | 30 / 30 | 30 / 30 |
| ash % | 5 | **0** |
| POD / PAC | 4.8 / 30.585 | 4.8 / 30.585 |
| kcal/100 g | 578 | 578 |
| verification | `Estimated / PI Calculated`, confidence 85 | `Verified`, confidence 98 |
| allergens | `milk` | `milk` |

There is also a **brand-neutral** 42 % cream powder in the live DB that is **absent from the repo CSV**:

- `PI-ING-002242` — `CREAM POWDER · 42% FAT · Dry`, brand `Standard`, country `General`,
  subcategory **`cream_powder`**, water 3 / fat 42 / NFMS 55 / protein 20 / lactose 30,
  `Estimated / PI Calculated`. It belongs to the `global_*` family of neutral type profiles
  (`global_cream_powder_42_fat_dry`), alongside e.g. `PI-ING-002244 WHOLE MILK POWDER · 28% FAT · Dry`.

**Search for an existing ~60–75 % fat dairy cream powder — none exists.** Query over the whole live Mapper
for `fat_percent between 58 and 80` and `water_percent <= 12` returns 40 rows: nuts and nut pastes,
lecithins, emulsifier and stabilizer blends, coconut, and one flavoured `base_mix`
(`PI-ING-000070 MASCARPONE COD 075 · Elenka Base Mix`, fat 78). **Not one dairy cream powder.** The highest
dry dairy rows are `PI-ING-002239 BUTTER · 82% FAT · Salted` (water 15) and, below the band,
`PI-ING-000260`/`PI-ING-002242` at 42 %. In the 42–53 % window every hit is an Italian manufacturer cream
*paste* (Fabbri, Irca, Leagel, Stella), i.e. chilled flavoured product, not milk-derived cream powder.

So the 72 % product has **no home profile today**, and the neutral slot next to it
(`PI-ING-002242`, subcategory `cream_powder`) is the natural sibling shape for one.

A second, structural gap sits one layer up. The engine's neutral vocabulary
`CorrectionFamily`
(`/Users/tomaszboro22/Developer/pinguino-intelligence-v1/src/spine/productProfiles.ts:43-69`) lists
`milk | cream | skimmed_milk_powder | …` and **contains no `cream_powder`**; a repo-wide grep for
`cream_powder` in `src/` returns zero hits. This was already recorded as a known gap in
`/Users/tomaszboro22/Developer/pinguino-pl-country/reports/GLOBAL_BASE_PRODUCT_ARCHITECTURE_AUDIT.md`
(section "THE SAME TEST APPLIED TO MILK, CREAM, CREAM POWDER"): *cream powder is in real production use
with no neutral family and no engine family … a genuine gap at BOTH layers*. The same section warns that
if cream powder ever becomes a correction lever, a high-fat candidate would push the HARD fat gate.

### 2.3 (b) What fields the engine needs

Two different lists, and the difference matters.

**Stored on the Mapper row** (`mapper_basement` / `IngredientRow`): `water_percent`,
`total_solids_percent`, `fat_percent`, `saturated_fat_percent`, `milk_fat_percent`,
`non_fat_milk_solids_percent`, `protein_percent`, `aerating_protein_percent`, `carbohydrate_percent`,
`total_sugars_percent`, `sucrose/dextrose/glucose/fructose/lactose/polyol/fiber/salt/alcohol/ash/acidity/
brix/dry_matter`, plus `pod_value`, `pac_value`, `de_value`, `sweetness_factor`, `freezing_factor`,
`stabilizer_activity`, dosage min/max, `kcal_per_100g`.

**The engine's minimum bar to treat a row as usable** — `MAPPER_ENGINE_REQUIRED_FIELDS` at
`/Users/tomaszboro22/Developer/pinguino-intelligence-v1/src/features/product-intelligence/mapperRuntimeUsability.ts:11-20`,
repeated as `REQUIRED_COMPOSITION_FIELDS` at
`/Users/tomaszboro22/Developer/pinguino-intelligence-v1/src/features/ingredient-builder/recipeSubstitution.ts:10-14`:

> `water_percent, total_solids_percent, fat_percent, protein_percent, carbohydrate_percent,
> total_sugars_percent, salt_percent, pod_value, pac_value` — plus `is_active` and `approved_for_engines`.

**What the engine actually reads when it computes** —
`/Users/tomaszboro22/Developer/pinguino-intelligence-v1/src/engine/composition.ts:67-103`
(`computeComponentTotals`): water, solids, fat, protein, lactose, sucrose, glucose, dextrose, fructose,
polyol, fiber, salt, alcohol, each as `grams × percent / 100`.

**Important:** `non_fat_milk_solids_percent` and `milk_fat_percent` are **carried in data but dropped at the
engine seam** — `ingredientRowToEngineIngredient()`
(`/Users/tomaszboro22/Developer/pinguino-intelligence-v1/src/data/ingredients/ingredientMapper.ts:26-88`)
never forwards them, and `EngineIngredient`
(`/Users/tomaszboro22/Developer/pinguino-intelligence-v1/src/engine/types.ts:129-176`) has no MSNF field.
So for this product the load-bearing unknowns are **protein, lactose, water/solids, salt** — precisely the
fields the page does not print — while MSNF matters for audit and display, not for the arithmetic.

`pod_value` / `pac_value` are stored-verified-first (`types.ts:149-160`) and are, by the repo's own words,
"team-calibrated and not publicly sourceable"
(`/Users/tomaszboro22/Developer/pinguino-intelligence-v1/src/data/products/referenceProposals.ts:41`,
where every staged reference proposal is permanently `readiness: 'needs_pacpod'`).

### 2.4 (c) Which table/column holds them

`public.mapper_basement` (live DB), read by the app through
`/Users/tomaszboro22/Developer/pinguino-intelligence-v1/src/services/ingredients.ts:19-20`
(`TABLE = 'mapper_basement'`, `AUTHENTICATED_SELECTION_VIEW = 'mapper_basement_search'`).
The table is **read-only to the application**: its only RLS policy is `mapper_basement_select_pro`
(`.../20260716101631_0006_mapper_basement.sql:129-153`, "writes are admin/server-side only"), and a
repo-wide grep finds no `from('mapper_basement')` write anywhere in `src/`.

**This evaluation does not propose mapping the Hoosier Hill Farm product onto `PI-ING-000260`.** Note that
nothing in the schema prevents it: `country_local_products.canonical_ingredient_id` is plain `text` with no
foreign key (constraint list on `public.country_local_products` shows FKs only on `component_product_id →
shop_products` and `country_iso2 → shop_countries`). The protection is the owner rule, not the database.

---

## 3. The existing substitution and recalculation path

### 3.1 The two mechanisms that exist, and which one applies

There are two distinct things called "substitution" in this system, living in different places.

**(A) SHOP / country-local mechanism — "buy this instead, here".**
Tables in the live DB: `shop_country_components` (13 cols, 14 rows) and `country_local_products`
(59 cols, 4 rows). App code lives on branch `claude/global-country-readiness`, worktree
`/Users/tomaszboro22/Developer/pinguino-country-readiness`:
`src/services/shopCountries.ts` (reads `shop_country_local_readiness` `:98,:216`, `shop_country_components`
`:157,:240,:276`), Edge Function `supabase/functions/shop-local-pack/index.ts`, migrations
`supabase/migrations/20260902150000_shop_country_and_shipping_authority.sql` and
`.../20260903110000_country_readiness_research.sql`.
It is **not** on the branch checked out in `pinguino-intelligence-v1` (`codex/live-product-scanner`), where
a grep for these table names returns zero hits.

`shop_country_components` is purchase presentation only — `local_product_name`, `supplier_name`,
`purchase_url`, `pack_size`, `display_price`. `ShopLocalComponent` in `shopCountries.ts:53-60` carries no
composition field at all. **Its US rows today are QA fixtures**, not real data:

```
US | GEL-CRP-500 | local_product_name: "TEST FIXTURE — GEL-CRP-500"
   | supplier_name: "TEST — nie zamawiaj, dane QA"
   | notes: "Dane testowe OWNER QA. Usunąć po akceptacji."
```
(all 7 US rows; the 7 CA rows are empty). `shop_country_local_readiness` accordingly reports, for US:
`components_required 7, components_ready 0, missing_components [GEL-CRP-500 … GEL-YOL-500],
mapping_complete false, local_starter_pack_live false`. Same for PL and CA.

`country_local_products` is the research/verification record and **is the table designed for exactly this
question**. Its migration header states the completeness ladder in its own words:

> "A country is never READY because links exist. It is READY when the products its default base needs are
> ENGINE_READY and the Engine has accepted the base."
> — `pinguino-country-readiness/supabase/migrations/20260903110000_country_readiness_research.sql`

and the functional-equivalence migration
(`.../20260903110200_country_local_products_functional_equivalence.sql`) adds the three columns that carry
the owner's rule as data:

> "A country product does NOT have to match a reference specification. It has to perform the same FUNCTION
> and then be calculated with its OWN real numbers. 3.2 % milk standing in for a 3.5 % reference is
> correct; relabelling it 3.5 % to make the numbers tidy is not."
> `reference_function` / `technical_difference` / `acceptance_rationale`

`status` is a CHECK-constrained ladder: `IDENTIFIED → PURCHASE_VERIFIED → TECHNICAL_DATA_PARTIAL →
TECHNICAL_DATA_COMPLETE → CANONICAL_MAPPING_VERIFIED → ENGINE_READY`, plus `REVIEW_REQUIRED` and `BLOCKED`.

The four existing rows show the pattern working. The PL Mlekovita 30 % cream row is `TECHNICAL_DATA_COMPLETE`
with `technical_difference: "Exactly 30% fat - matches the reference. Contains added milk proteins and
carrageenan stabiliser."` and an `acceptance_rationale` that says the carrageenan is the point to watch.
The existing **US** row (Modernist Pantry dextrose) is `TECHNICAL_DATA_PARTIAL` with a review note that is
almost word-for-word this product's problem:

> "NO nutrition panel published, so the monohydrate-vs-anhydrous question is unresolved (91 g vs 100 g
> carbohydrate per 100 g) - that changes sugar mass in the base. … needs a technical decision before
> ENGINE_READY."

**(B) In-app recipe substitution — "swap this line's product and recompute".**
This is the Engine-side mechanism and it is fully wired in `pinguino-intelligence-v1`:

| Step | Location |
|---|---|
| Row menu → dialog | `src/features/ingredient-builder/IngredientRow.tsx:468-478` (`openSubstitute`), dialog at `:155-235`, render at `:886-897` |
| Candidate list | `src/features/ingredient-builder/recipeSubstitution.ts:118-173` `verifiedRecipeSubstituteCandidates()` |
| Usability gate | same file `:107-110` (`is_active && approved_for_engines && completeComposition`), `:19-23` (9 required fields + `|water+solids+alcohol−100| ≤ 0.5`) |
| Store actions | `src/features/ingredient-builder/IngredientBuilder.tsx:283-291`, `:292-330`; `src/features/constraint-studio/constraintStudioStore.ts:1325-1420`, `:2558-2650` |
| Swap + recompute | `src/features/constraint-studio/applyPipeline.ts:6831` `buildSubstitutionPreview()`, swap at `:6891-6897`, re-optimize + `calculateRecipe` at `:6898-6904` |
| Engine | `src/engine/calculateRecipe.ts:116`; live Studio recompute at `src/features/studio/useStudioResult.ts:74` |

### 3.2 What happens TODAY if a user has a 72 % cream powder instead of the 42 % one

Answer in three parts, because there are three different "todays".

**(i) On the SHOP side: nothing happens, because the slot is empty.** The US `GEL-CRP-500` slot holds a QA
fixture (`TEST FIXTURE — GEL-CRP-500`), `components_ready = 0`, `local_starter_pack_live = false`. No US
customer is being told to buy any cream powder at all right now. The Hoosier product exists only as a
research proposal in `research/US.json` and as row 309 of the owner review workbook, with
`Decyzja Ownera` blank.

**(ii) On the recipe side, if the 72 % product were a Mapper row today: it would be offered, and swapped
gram-for-gram with no fat awareness.** Both powders classify to the same functional role — the only rule is
a single threshold, `if (ingredient.category === 'dairy') { if (c.fat_percent >= 20) return 'dairy_fat'; }`
at `src/features/formulation/ingredientRoles.ts:157-163`. So the role gate at `recipeSubstitution.ts:147`
passes. The candidate list is then sorted **alphabetically by name** (`:156-159`,
`left.ingredient.name.localeCompare(right.ingredient.name, 'pl', …)`) and truncated to 12 — there is no
composition-proximity ranking, so a closer-fat candidate can be cut off. The dialog's copy makes no
composition claim: `expectedImpact: 'Ta sama rola technologiczna; PI przeliczy całą recepturę przed Apply.'`
(`:166-170`). The swap itself copies `planned_grams` verbatim (`applyPipeline.ts:6891-6897`) — **no
equivalence factor, no mass adjustment**. The engine then recomputes the whole recipe from the new
composition and the optimizer rebalances the other unlocked lines. If it cannot bring the bands back, the
user gets a generic refusal with internal `hard:<metric>` codes and one Polish sentence, *"Brak bezpiecznego
zamiennika dla bieżących blokad i profilu receptury."* (`:6905-6925`) — which never names fat or the
substitute's composition.

**(iii) On the Starter Pack recipe side: hard failure, no substitution offered at all.** When an executable
recipe line has no exact product, `resolveLine()` throws
`ExecutableRecipeHandoffError('ingredient_unavailable', …)`
(`src/services/executableRecipeHandoff.ts:138-158`) and the whole template is refused at `:243-249`. The
library's own comment is explicit: *"A dose from another product form must never be reused"*
(`src/data/recipes/executableRecipeLibrary.ts:17`). There is no Starter Pack rescue palette that maps a
user's product onto a reference role; `rescueMode` is `false` for every access tier
(`src/access/plans.ts:44,57,71,84`, comment `// later phase`).

### 3.3 What is missing

| Capability | Status | Where |
|---|---|---|
| Swap a line's product for another real product | EXISTS | `recipeSubstitution.ts:118`, `applyPipeline.ts:6831` |
| Recompute the recipe from the new composition | EXISTS | `applyPipeline.ts:6898-6904` → `calculateRecipe` |
| A profile for a ~72 % dairy cream powder to swap *to* | **MISSING** | no such row in the 2 541-row Mapper (§2.2) |
| `cream_powder` in the engine's neutral family vocabulary | **MISSING** | `productProfiles.ts:43-69` |
| Rank/filter substitute candidates by composition proximity | **MISSING** | `recipeSubstitution.ts:141-159` sorts by name |
| Tell the user the substitute's fat differs materially | **MISSING** | `recipeSubstitution.ts:166-170` static strings |
| Explain a failed substitution in composition terms | **MISSING** | `applyPipeline.ts:6917-6924` returns `hard:<metric>` |
| A filled US CRP slot on the SHOP side | **MISSING** | `shop_country_components` US rows are QA fixtures |

**No 1:1 substitution rule is proposed here and no conversion factor belongs anywhere outside the Engine.**
The only honest statement of distance is: at equal mass the 72 % powder carries materially more milk fat
and materially less of everything else than the 42 % reference, and the size of "everything else" is
currently unknown because the page prints no panel. What that means in grams is for `calculateRecipe` to
decide on real numbers, per recipe, per batch — not for a table in a PDF.

---

## 4. Onboarding and importer — the right existing channel

### 4.1 The channels that exist

| Channel | Entry point | What it produces |
|---|---|---|
| INTIMPORT (bulk CSV, 36 fixed columns) | `/products/import` → `src/pages/destinations/ProductImportPage.tsx:70`; columns at `src/data/products/intimport.ts:24-60` | `products` + `product_versions` + `product_variants` + `product_behavior_bindings` via `ingest_product_v1` |
| Product Scanner v1 | `/products/scan` → `src/pages/products/ProductScannerV1Page.tsx:18`; finalize in `supabase/functions/product-scan-finalize/index.ts` | same pipeline |
| TEXTIMPORT | `/products/textimport` → `src/services/productTextImport.ts` | adapts into the Scanner pipeline |
| Administrator Mapper decision | `src/services/products.ts:257-284` `saveProductMapperReview()`; SQL gate at `.../20260813110300_canonical_product_root_and_ingest.sql:939-944, 1013` | a `product_behavior_bindings` row + `products.mapper_status='matched'`, `matched_basement_id=<PI-ING-…>` |
| SHOP country register | `public.country_local_products` (admin-written, `gellatti_admin_has_permission_v1('FINANCE')`) | the research/verification record with the equivalence columns |

There is **no** `product_add_request` table or "propose a product" form in the application: a repo-wide grep
for `add_request|addRequest|product_add_request|propose[ _]?product` in `src/`, `supabase/` and `docs/`
returns zero hits. (The live DB does have a `product_add_requests` table with 186 rows, but the branch
checked out in `pinguino-intelligence-v1` contains no code for it — another instance of the branch/DB skew
noted in §2.1. This should be checked against the branch that owns it before anyone relies on it.)

Critically, **no channel writes engine composition**:

- `mapper_basement` has no insert/update/delete policy and no app write path.
- `products.pac_value` / `products.pod_value` exist as columns but the ingest payload built at
  `src/services/productIngest.ts:236-266` contains **no pac/pod key**; the OCR save flow writes
  `pac_value: null` (`src/features/ocr-intake/session/saveFlow.ts:276`).
- Direct table writes are blocked by `canonical_product_write_guard()`
  (`.../20260813110300_canonical_product_root_and_ingest.sql:663-682`: *"canonical product writes require
  ingest_product_v1"*).
- `/dev/reference-proposals` (`src/pages/dev/ReferenceProposalsPage.tsx:45-59`) only renders JSON "handed to
  a human migration, never persisted", and every proposal is permanently `needs_pacpod`.

A product becomes engine-usable only by being **linked** to an existing `mapper_basement` row
(`src/data/products/productEngineResolver.ts:88-110`: `mapper_status === 'matched'` **and**
`matched_basement_id` with non-null `pac_value` and `pod_value`).

### 4.2 Which channel is right for this product, and what it demands

**The right channel is the one the SHOP workstream already built:** record the product in
`public.country_local_products` (`country_iso2 = 'US'`, `role = 'STARTER_PACK'`,
`component_product_id = fafe44ee-2745-45bd-a471-36eea3ee8142` = `GEL-CRP-500`), with the equivalence columns
filled and a status that tells the truth about the missing panel. That is the existing product context. No
new channel, no second Mapper, no scanner work.

Fields that channel would require, all available today from the evidence in §1:
`brand`, `product_name`, `manufacturer`, `gtin`, `package_size_value/unit` (454 / g), `retailer`,
`purchase_url`, `ships_to_country`, `availability`, `evidence_url`, `evidence_note`, `ingredients_text`,
`allergens_text`, `fat_g` (72), `physical_form` (`powder`), `functional_role`, `technical_source`,
`reference_function`, `technical_difference`, `acceptance_rationale`, `status`, `review_note`.

Fields that channel **cannot** be filled from this page: `energy_kcal`, `saturated_fat_g`,
`carbohydrate_g`, `sugars_g`, `protein_g`, `salt_g`, `total_solids_g`, `water_g`, `lactose_g`. They stay
NULL, which is what the register is designed for — the PL Mlekovita rows show NULLs where the label is
silent, and `ENGINE_READY` is withheld until they are not.

**If the same product were pushed through INTIMPORT / the Scanner instead**, the outcome today would be
`needs_review`, for two independent reasons:

1. `ingest_product_v1` accepts a product with no `nutrition` block (it needs only name + brand + one fact,
   `.../20260813110300_…:1309-1314`), but if a `nutrition` block is present it must be **complete** —
   numeric `energyKcal, fat, carbohydrate, protein, salt` on a `per_100g` basis (`:1452-1534`). Only `fat`
   is available, so the panel cannot be supplied at all.
2. The automatic Mapper binding route requires agreement with **exactly one** existing engine-approved row
   inside `live_overlay_macro_tolerance_v1` — fat ±1.5, carbohydrate ±1.5, protein ±1.5, sugars ±2.0,
   salt ±0.2, kcal ±20
   (`supabase/migrations/20260824150000_live_overlay_engine_identity.sql:28-37`). With no row anywhere near
   72 % fat (§2.2) the result is `REVIEW: no_agreeing_mapper_identity`. The INTIMPORT whole-profile route
   needs confidence ≥ 0.85 against a `Verified*` donor (`PROFILE_MATCH_FLOOR` at
   `src/features/product-intelligence/mapperValueInference.ts:965`) and fails for the same reason.

So the importer is not the blocker — **the absent reference profile is**, and creating a reference profile
is not something any in-app channel can do.

---

## 5. Other workstream — what must be coordinated, not duplicated

The product→PI binding decision for the seven Starter Pack items is **already owned** by the SHOP Starter
Pack local-equivalents workstream on branch `claude/pl-country-product-set`, writing into
`/Users/tomaszboro22/Developer/pinguino-pl-country/reports/shop_starter_local/`.

| Artefact | What it holds |
|---|---|
| `reports/shop_starter_local/RESEARCH_PROTOCOL.md` | The item→PI binding table (CRP → `PI-ING-000260`), reference facts, equivalence classes, evidence rules |
| `reports/shop_starter_local/research/*.json` (75 files) | The per-market candidate records, incl. `research/US.json` |
| `reports/shop_starter_local/review/GELLATTI_STARTER_PACK_LOKALNE_ODPOWIEDNIKI_REVIEW.xlsx` | The owner decision workbook (sheets `00_INSTRUKCJA` … `04_MACIERZ`) |
| `reports/GLOBAL_BASE_PRODUCT_ARCHITECTURE_AUDIT.md` | Owner decisions D-1…D-38, incl. D-2/D-3 (SHOP never creates a PI; it binds by stable PI-ING id) and the cream-powder family gap |
| `reports/GELLATTI_SHOP_RECONCILIATION_2026-09-17.md` | Current SHOP state; §M lifts the D-38 pause for CRP/FRU/INU/YOL only |

**This product is row 309 of sheet `01_DO_DECYZJI`** — it matches the owner's reference exactly:

```
r309 | US | United States | Śmietanka w proszku 42% | 1 | Hoosier Hill Farm | Heavy Cream Powder - 1 lb
     | 1 lb (454 g) | 850054854513 | hoosierhillfarm.com/products/heavy-cream-powder
     | GTIN-12 (UPC-A) | POTWIERDZONY LOKALNIE | ten sam rodzaj, inny skład
     | Rekomendacja: "DO DECYZJI: inny skład" | Decyzja Ownera: <empty>
```

**The result to coordinate with is the owner's decision cell in that workbook**, not a separate acceptance
produced here. Nothing in this evaluation changes that cell, and no row is written anywhere.

This decision is also **not a one-off**. Of 51 CRP proposal rows in the workbook, 9 are
`ten sam rodzaj, inny skład` high-fat cream powders across 8 markets:

| Row | Market | Brand | Printed fat | Evidence class | Note |
|---|---|---|---|---|---|
| 309 | US | Hoosier Hill Farm | 72 % | CONFIRMED_LOCAL | this evaluation |
| 310 | US | Anthony's | 72 % | LEAD | single-ingredient claim |
| 2 | AE | Hoosier Hill Farm | 72 % | LEAD | same product via a marketplace |
| 44 | CA | Moléculaire | 72 % | LEAD | sweet cream, skim milk, sodium caseinate, anti-caking |
| 76 / 146 / 224 / 301 | CY / GR / MT / TR | Ingredients Bar | 75 % | LEAD | **has a full per-100 g panel** (fat 75, sat 51, carb 12, sugars 12, protein 8.5) |
| 281 | SE | Skafferimat | 53.5 % | CONFIRMED_LOCAL | 100 % air-dried cream, protein 15.9 |

A single neutral high-fat cream powder profile would serve several of these markets; a product-specific
patch for the US alone would not. Note also that the 75 % Ingredients Bar candidate publishes the panel
this one does not — if a high-fat profile is built, that row is the better *technical* donor even though its
evidence class is weaker.

Two further external dependencies, from `GELLATTI_SHOP_RECONCILIATION_2026-09-17.md:204`: the app-side route
validator (PR #336, `codex/f2541-01-eligibility-authority`) currently **rejects the milk, cream and SMP
PIs**, and v23 routes are not stored (PR #328 fail-closed). Any engine-side work on a new cream powder
profile has to land after, or alongside, those.

---

## 6. Verdict and the operations that would be needed

### 6.1 Verdict

**Conditionally yes as a purchase recommendation; no as an engine ingredient, today.**

The product is a real, identity-confirmed, market-confirmed US dairy cream powder, and it is the only
`CONFIRMED_LOCAL` cream powder found in US retail (`research/US.json` notes: *"no 38-48 % fat dairy cream
powder was found in US retail"*). As a **local purchase alternative** shown in the 0 € US PDF — *the
product you can buy in the US for the cream-powder role* — it is defensible, provided the difference is
printed next to it in customer language and the customer is told the app will recalculate from the real
product, not from the reference.

As an **engine ingredient** it is not usable and cannot be made usable by any existing in-app channel,
because (a) no ~72 % dairy cream powder profile exists in the 2 541-row Mapper, (b) the page prints no
nutrition panel, so seven of the nine engine-required fields are unknown, and (c) `pod_value` / `pac_value`
are team-calibrated and not sourceable from a product page.

**Proposed label (Polish customer copy, owner to approve the wording):**
> *Lokalny odpowiednik — inny skład.* Śmietanka w proszku o zawartości tłuszczu **72 %** zamiast 42 %.
> Zawiera również odtłuszczone mleko w proszku. To nie jest zamiennik 1:1 — Gellatti przelicza recepturę
> na podstawie rzeczywistego składu produktu, którego używasz.

No gram figure, no conversion, no "use X instead of Y" sentence.

### 6.2 Concrete operations — each NOT YET APPROVED

**DATA**

1. `NOT YET APPROVED` — Insert one row in `public.country_local_products`: `country_iso2='US'`,
   `role='STARTER_PACK'`, `option_rank='PRIMARY'`,
   `component_product_id='fafe44ee-2745-45bd-a471-36eea3ee8142'` (`GEL-CRP-500`),
   `canonical_ingredient_id = NULL`, with the §1.2/§1.3 identity and evidence fields,
   `fat_g = 72`, all other nutrient columns NULL,
   `status = 'TECHNICAL_DATA_PARTIAL'`, and the three equivalence columns filled
   (`reference_function`: "spray-dried dairy cream, ~42 % fat, as the concentrated fat + milk-solids
   carrier of the Starter Pack base"; `technical_difference`: "72 % butterfat vs 42 % reference; contains
   nonfat dry milk and an added antioxidant system; no nutrition panel published";
   `acceptance_rationale`: to be written by the owner, not by SHOP).
   **`canonical_ingredient_id` must stay NULL — it must not be set to `PI-ING-000260`.**
2. `NOT YET APPROVED` — Owner writes `TAK`/`NIE` in `Decyzja Ownera (TAK/NIE)` on row 309 of sheet
   `01_DO_DECYZJI`. This is the gate; nothing customer-facing moves before it.
3. `NOT YET APPROVED` — Obtain the real panel before any engine work: request the manufacturer's spec
   sheet / Nutrition Facts for SKU `HHF263`. Without protein, carbohydrate/sugars, salt and moisture from
   the manufacturer, item 5 below cannot be done honestly.
4. `NOT YET APPROVED` — Remove the seven US QA fixture rows in `shop_country_components`
   ("Dane testowe OWNER QA. Usunąć po akceptacji.") before any real US local pack goes live. Until then
   `local_starter_pack_live` stays `false` and no US customer sees anything.

**REFERENCE PROFILE (Mapper) — owner/Engine workstream, not SHOP (decision D-2/D-3)**

5. `NOT YET APPROVED` — Create a **new, brand-neutral** Mapper profile for high-fat dairy cream powder,
   modelled on the existing `PI-ING-002242` (`global_cream_powder_42_fat_dry`, subcategory `cream_powder`),
   with its own new `PI-ING-…` id and its own real composition. Never a modification of `PI-ING-000260` or
   `PI-ING-002242`. Requires a hand-written SQL migration/seed against `mapper_basement` (no in-app channel
   exists) plus team-calibrated `pod_value` / `pac_value`.
   **Blocked on item 3.** Consider building it from the CY/GR/MT/TR candidate's published panel rather than
   from the Hoosier page, and then binding the Hoosier product to it only if its real panel agrees.
6. `NOT YET APPROVED` — Decide whether `cream_powder` becomes a `CorrectionFamily`
   (`src/spine/productProfiles.ts:43-69`). If it does, apply the warning already recorded in
   `GLOBAL_BASE_PRODUCT_ARCHITECTURE_AUDIT.md`: pick a lever candidate by composition, not by family label,
   or a 72 % powder can be chosen as a lever and push the HARD fat gate.

**CODE**

7. `NOT YET APPROVED` — Rank substitute candidates by composition proximity instead of alphabetically
   (`src/features/ingredient-builder/recipeSubstitution.ts:156-159`), so that a 12-item slice cannot hide
   the closest match.
8. `NOT YET APPROVED` — Show the material composition difference in the substitute dialog
   (`recipeSubstitution.ts:166-170`, rendered at `IngredientRow.tsx:198-223`), and name the failing metric
   in customer language when a substitution is refused (`applyPipeline.ts:6917-6924` currently emits
   `hard:<metric>` plus one generic Polish sentence).

**MIGRATION**

9. `NOT YET APPROVED` — The `country_local_products` insert (item 1) is a data change on the shared DB; it
   needs the normal admin write path (`gellatti_admin_has_permission_v1('FINANCE')`), not a schema
   migration. Item 5 **does** need a migration, and it touches a table the app cannot write.
10. `NOT YET APPROVED` — Sequence item 5 after PR #336
    (`codex/f2541-01-eligibility-authority`, which currently rejects the milk/cream/SMP PIs) and PR #328
    (routes not stored, fail-closed), or the new profile will be created into a validator that refuses it.

### 6.3 Risks

- **Composition distance from the reference.** 72 % vs 42 % printed fat is a 30 percentage-point gap on the
  one number we have, and the remainder of the product is unknown. This is far outside the protocol's
  `A_EQUIVALENT` band (38–48 %) and outside the automatic binding tolerance (fat ±1.5).
- **The added nonfat dry milk.** It is a declared ingredient, not an aid. It changes MSNF, lactose and
  protein at a given fat level. A profile built by assuming "pure cream powder at 72 % fat" would be wrong
  in a way that silently changes every recipe computed from it — precisely what the functional-equivalence
  migration warns against.
- **The antioxidants.** Natural Vitamin E & Vitamin C Ester are negligible in mass but they are a declared
  addition and belong in `ingredients_text` verbatim. They are not on the Live Overlay high-risk list, so
  they do not block the automatic route — the missing panel does.
- **The self-contradicting page.** "made with 100 % real sweet cream" next to a three-ingredient list. Only
  the ingredient list may be repeated to a customer.
- **The 72 % figure's provenance.** Prose in a description, not a declared label value, and the same figure
  appears on a competitor product with a different formulation. Treat it as a claim to be confirmed against
  a spec sheet, not as a measurement.
- **Allergen wording.** The page prints **no** allergen statement. Milk is present by ingredient
  (Cream, Nonfat Dry Milk). `GEL-CRP-500` in `shop_products` declares `allergens = 'milk'`. Any customer
  text must state milk on the basis of the ingredient list and say the page publishes no formal allergen
  declaration — it must not quote an allergen line that does not exist.
- **Pack size.** 1 lb = 454 g against `GEL-CRP-500`'s `pack_size_g = 500`. Protocol rule 9 says pack size
  never has to match, but the PDF must print the real pack (454 g), and the existing US dextrose row
  already records the same lesson ("Pack is 200 g, not the canonical 500 g: PDF quantities must reflect the
  real pack").
- **The app computes amounts from composition.** This is the decisive risk. `calculateRecipe`
  (`src/engine/calculateRecipe.ts:116`) reads 13 composition percentages per ingredient
  (`src/engine/composition.ts:67-103`). A profile with guessed protein/lactose/water does not fail loudly —
  it produces a plausible recipe that is wrong. The three Mapper states (repo CSV 2 147, live DB 2 541, and
  the disagreement on `PI-ING-000260`'s own water/solids/ash shown in §2.2) make it doubly important to say
  which dataset any new row is written into.
- **Branch/DB skew.** The SHOP country-local code is on `claude/global-country-readiness`; the engine code
  examined here is on `codex/live-product-scanner`; the live DB carries tables neither branch fully covers
  (`product_add_requests`, 186 rows). Nobody should assume a single checkout shows the whole mechanism.

### 6.4 Separate point — a local tara/guar gum is not the Gellatti stabilizer

This is a distinct decision and must not be folded into the cream-powder one.

The Gellatti blend and a plain tara gum are **two different rows with two different compositions** in the
live Mapper:

| | `PI-ING-002114` | `PI-ING-000492` |
|---|---|---|
| name | `GELLATTI STABILIZER · Gellatti Stabilizer Blend · Dry` | `TARA GUM · Stabilizer` |
| subcategory | `stabilizer_blend` | `tara_gum` |
| water % | 7.1625 | 9.5 |
| fat % | 0.5375 | 0.5 |
| protein % | 2.9985 | 2 |
| fibre % | **74.315** | **86.5** |
| dosage min/max % | null / null | 0.2 / 1 |
| verification | `Verified / PI Calculated` | `Verified` |

Per `RESEARCH_PROTOCOL.md` the Gellatti blend is tara 60 / LBG 25 / guar 15 — three hydrocolloids with
different gelation and different water binding, not tara at a different purity. The engine reads fibre,
water and protein per gram, so the two rows do not produce the same result at the same dose, and the plain
tara row carries a dosage window the blend does not.

There is also a mechanical consequence: `tara gum`, `guma tara` and `guar` are on the Live Overlay
high-risk additive list (`.../20260824150000_live_overlay_engine_identity.sql:44-51`), so any local gum
product is **excluded from the automatic Mapper binding route by name** and always lands in review.
Stabilizers are additionally refused outright as recipe substitution candidates
(`src/features/ingredient-builder/recipeSubstitution.ts:136`).

The owner's v23 selection already shows the stabilizer slot as *a local alternative*, not as the Gellatti
product (`RESEARCH_PROTOCOL.md`, STB row). That framing should stay exactly as it is: a local tara gum is a
different ingredient that the Engine must be told about, never a relabelled Gellatti Stabilizer.

---

## 7. What I could not determine

1. **The real nutrition panel.** The page publishes none. Protein, carbohydrate/sugars (lactose), salt,
   moisture/total solids, saturated fat and energy for SKU `HHF263` are unknown. They exist physically on
   the container and possibly in the product photographs, but reading those needs OCR (out of scope by
   instruction) or a manufacturer spec sheet (not requested — that would be outbound contact).
2. **Whether the 72 % figure is a specification or marketing copy.** Only the manufacturer can settle this.
3. **MSNF and lactose.** Not derivable. The declared nonfat dry milk makes any generic cream-powder
   estimate unsafe, and MSNF is in any case dropped at the engine seam
   (`src/data/ingredients/ingredientMapper.ts:26-88`), so it would be an audit value, not a computed one.
4. **`pod_value` / `pac_value` for a high-fat cream powder.** Team-calibrated by design
   (`src/data/products/referenceProposals.ts:41`); not sourceable from any page.
5. **The `product_add_requests` channel.** The live DB has the table with 186 rows, but the branch checked
   out in `pinguino-intelligence-v1` (`codex/live-product-scanner`) contains no code for it. Which branch
   owns it, and whether it is a better fit than `country_local_products` for this product, was not resolved
   here.
6. **Whether the owner's "row 309" means the review workbook or the v23 source workbook.** Row 309 of sheet
   `01_DO_DECYZJI` in
   `reports/shop_starter_local/review/GELLATTI_STARTER_PACK_LOKALNE_ODPOWIEDNIKI_REVIEW.xlsx` matches the
   description exactly (US, Hoosier Hill Farm, GTIN 850054854513, "ten sam rodzaj, inny skład"), so that is
   what this evaluation assumed. The v23 source workbook
   (`~/Developer/gellatti-source-data`, 89 sheets) was not opened.
7. **Whether the 75 % Ingredients Bar candidate (rows 76/146/224/301) is a better technical donor.** It
   publishes a full per-100 g panel, but its evidence class is LEAD, and confirming it is the other
   workstream's job, not this evaluation's.
