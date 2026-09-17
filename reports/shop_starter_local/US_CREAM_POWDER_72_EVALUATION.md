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

## 0. Correction — what the first version of this file got wrong, and against what

**Re-checked 2026-09-17 against `origin/staging` = `b0455b24e8de3522c351ac363f56ef6d5baa6129`**
(2026-09-17 21:28:50 +0200, merge of PR #408) and against the live shared Supabase project
`tunabqqrwabacxjcxxkz`. Sections 2, 3, 4, the integration half of 6 and items 3/5 of 7 were rewritten.

**Section 1 was separately re-done on the source side, in the same pass** (owner correction, 2026-09-17):
the product page was re-fetched, the whole image gallery was downloaded and *looked at*, and §1.3–§1.6 now
replace the first version's claims that the product publishes "no nutrition panel at all" and "no allergen
statement". A full panel does exist in the gallery; it was transcribed (§1.4.1) and then shown to be
unusable for this SKU (§1.4.2–§1.4.3). The self-correction is §1.6. Section 5 (the workbook row and the
candidate table) is unchanged.

The integration half of the first version was read from a **stale worktree**:
`/Users/tomaszboro22/Developer/pinguino-intelligence-v1` at
`c39f6e8762fd21e2d11bfabb5e50c3709980b00b`, branch `codex/live-product-scanner`, committed
**2026-08-25** — **1 373 commits behind `staging`**. Four conclusions were artefacts of that checkout:

| First version said | Actually, on `b0455b24` |
|---|---|
| "The repo CSV is 2 147 records and the live DB is 2 541 — the two disagree about `PI-ING-000260` itself" | `docs/ingredients/validation/mapper_basement.csv` on `staging` holds **2 541 records**, and its ingredient-id set hashes **identically** to the live table (`md5 = 4ae515e378b6d275a109f2137ac26553` on both sides). `PI-ING-000260` matches field-for-field. **There is no repo-vs-DB difference to reconcile, and nothing needs copying in either direction.** The 2 147-record file was an *uncommitted* local edit sitting in that 2026-08-25 worktree; the committed CSV at that SHA held 2 088. The FINAL 2 541 set landed on `staging` in `e9c2547ab15df5e73aa5d6bade803d653961c5db` (2026-09-11). |
| "There is no `product_add_request` table or propose-a-product form in the application" | The lane exists and is wired: `public.product_add_requests` (`supabase/migrations/20260826120000_admin_partner_controlled_catalog.sql:118`, 186 live rows), approved through `approveProductRequest()` at `src/services/adminControl.ts:210`. |
| "The SHOP country-local code is not in this repo" | `shop_country_components` and the readiness view are read by `src/services/shopCountries.ts:206,289,325` and served by `supabase/functions/shop-local-pack/index.ts` on `staging`. (`country_local_products` is the genuine exception — see §4.1.) |
| "There is no Starter Pack rescue palette" | `src/features/constraint-studio/starterPackRescuePalette.ts` exists on `staging` (landed `449146812597066bec427f61b21e9580cc1243ef`, 2026-08-28) and lists `PI-ING-000260` at `:94-102`. |

**One substantive claim is withdrawn.** The first version wrote that a substitute is "swapped gram-for-gram
with no fat awareness". The first half is true and the second half is false, and the file contradicted
itself by quoting the engine's own `hard:<metric>` refusal codes in the same paragraph. The starting mass
*is* inherited, and the substitute's **own composition is then what the whole recipe is recomputed from**;
the optimiser rebalances the other lines against it and the preview is refused on `hard:fat` when the new
fat cannot be brought back inside the band. Preserving the starting mass is not the same as ignoring the
new composition. §3.2 now states this correctly.

**One claim is narrowed.** The absent `cream_powder` `CorrectionFamily` is real (§2.2) but it was given
more weight than it carries: `CorrectionFamily` is the *correction-lever* vocabulary (which family the
optimiser may reach for to fix a metric), not a usability gate on recipe ingredients. The substitution
catalogue never reads it. Its absence does not, on its own, prevent a cream powder from being used as an
ingredient with its own profile.

**The real blocker is elsewhere, and it is narrower and harder** — §4.2: no existing channel lets a
real-world product carry its **own** composition into a base recipe. A matched product *borrows* the
composition of the `mapper_basement` row it is bound to. That, not the family vocabulary and not the
importer, is what would have to change.

---

## 1. Identity and composition — what the page actually prints

### 1.1 Source and evidence

Evidence was first read from the local evidence cache written by
`/Users/tomaszboro22/Developer/pinguino-pl-country/reports/a03/tooling/verify_ean_market.py`
(2026-09-17 15:37 UTC). The page was then **re-fetched fresh** at 2026-09-17 19:29 UTC for the label pass
below (`--agent us-label`); the verdict is unchanged and the body grew from 745 554 to 748 118 bytes.

| Artefact | Path |
|---|---|
| Verifier verdict (first pass) | `/Users/tomaszboro22/.cache/gellatti-evidence/verify/0709986311180401.json` |
| Cached page body, first pass (745 554 bytes, complete) | `/Users/tomaszboro22/.cache/gellatti-evidence/vcache/9bbfcfa02c72a41c` |
| Cached page body, label pass (748 118 bytes, sha256 `768b5077…a4aa5`, 2026-09-17 19:29 UTC) | same cache key, re-fetched |
| Quote — butterfat | `/Users/tomaszboro22/.cache/gellatti-evidence/verify/quote_9eea9fd8dceb85b2.json` |
| Quote — ingredients | `/Users/tomaszboro22/.cache/gellatti-evidence/verify/quote_1d5ae18cb65fc536.json` |
| Quote — US-only shipping (FAQ) | `/Users/tomaszboro22/.cache/gellatti-evidence/verify/quote_bd674776a3739bdb.json` |
| Label images + gallery manifest (§1.5) | `/Users/tomaszboro22/.cache/gellatti-evidence/label/hhf263/` |
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

### 1.3 Composition — what the page's own text prints

Exactly two composition facts are printed in the page's **text** (HTML, JSON-LD, `body_html` from
`/products/heavy-cream-powder.json`):

1. **Butterfat, in prose, in the product description:**
   "this dried sweet cream has a 72% butterfat content".
   This is descriptive copy inside `ProductGroup.description`. It is **not** a declared label value from a
   Nutrition Facts panel.
2. **Ingredient list:**
   "Ingredients Cream, Nonfat Dry Milk, Natural Vitamin E & Vitamin C Ester (added to preserve freshness)".

Non-composition badges printed: `GMO Free`, `Gluten Free`, `Hormone Free`. Storage: "Store in a cool, dry
place." Usage note: "this is not a powdered coffee creamer or an instant cream powder and will not dissolve
instantly in liquid."

A token scan of the complete cached HTML, including every `<script>` block, returns **zero** occurrences of
`Nutrition Facts`, `Serving Size`, `Servings Per`, `Calories`, `Total Fat`, `Saturated Fat`, `Trans Fat`,
`Cholesterol`, `Sodium`, `Total Carbohydrate`, `Dietary Fiber`, `Total Sugars`, `Added Sugars`, `Calcium`,
`Allergen`, `Contains Milk`, `per 100` / `100 g`, `per serving`. There is no nutrition panel **in the page's
markup**, and no machine-readable nutrition metafield.

**That is a statement about the HTML only. It is not evidence about the photographs**, and §1.4 shows the
photographs say something different.

### 1.4 Composition — what the gallery images print

The product gallery holds 10 images (full list, stamps and hashes in §1.5). **One of them carries a complete
US Nutrition Facts panel**: gallery position 2, `Heavy_Cream_Powder_Side.webp?v=1789600314`, native
2048 × 2048, a render of a jar photographed from the label side.

#### 1.4.1 Transcription — verbatim, at 2048 px, with illegible values marked

| Line | As printed | %DV as printed |
|---|---|---|
| Servings per container | `About 181 servings per container` — see the digit note below | — |
| Serving size | `About 1 Tbsp (6g)` | — |
| Calories | `45` | — |
| Total Fat | `0g` | `3%` |
| Saturated Fat | `5g` | `10%` |
| *Trans* Fat | `0g` | (none printed) |
| Cholesterol | `10mg` | `0%` |
| Sodium | `10mg` | `0%` |
| Total Carbohydrate | `1g` | `0%` |
| Dietary Fiber | `0g` | `0%` |
| Total Sugars | `1g` | (none printed) |
| Includes Added Sugars | `1g` | `0%` |
| Protein | `1g` | `0%` |
| Vitamin D | `0mcg` | `0%` |
| Calcium | `28mg` | `0%` |
| Iron | `0mg` | `0%` |
| Potassium | `26mg` | `0%` |
| (unnamed vitamin row) | `Vitamin 3.45mg` — **no vitamin letter is printed** | `0%` |
| DV footnote | `*The % Daily Value (DV),` then **illegible** — see §1.4.3 | — |

Below the panel, in the label's serif type and fully legible:

- `INGREDIENTS: Cream, nonfat dry milk, natural vitamin E and vitamin C Ester (added to preserve freshness).`
- `CONTAINS MILK` (no colon)
- `Store in a cool/dry place`
- `HOOSIER HILL FARM, MIDDLETHIN, IN`

**No net weight, no lot code and no "72 % butterfat" claim appear anywhere on this image.**

**Digit note (servings per container).** At native resolution the middle digit is a two-counter glyph whose
shape matches the `8` of this image's own `Calcium 28mg` and does **not** match the `5` of its own
`Calories 45` or `Saturated Fat 5g`. The reading is therefore `181`. It is at the legibility limit, so the
alternative `151` is recorded; §1.4.2 shows the variant question does not turn on which of the two it is.

**The other nine images carry no panel.** Position 1 (`HHF263_HeavyCream_1lb-3.jpg`, the 1 lb variant's
`featured_media`) is a front-of-jar photo whose label prints `1 LB (453 G)` and four icons
(`GMO FREE`, `GLUTEN FREE`, `HORMONE FREE`, `PEANUT & TREE NUT FREE`) — no nutrient values. Position 8
(the 2 lb variant's `featured_media`) is the same shot printing `2 LB (907 G)`. Position 4 — the image the
owner pointed at, `image_441x441_4.jpg?v=1775257602` — is a **marketing graphic**, not a panel: it prints
four per-serving callouts (`1g PROTEIN`, `45 CALORIES`, `2% CALCIUM`, `1g CARBS`) under the heading
`PER SERVING`, six claim icons, and a jar whose front label reads `1 LB (453 G)`. It states no serving
size, so its four numbers cannot be converted to any basis on their own. Positions 3, 5, 6, 7 are marketing
graphics and a mixing-instructions card; positions 9 and 10 are the 25 lb bulk carton and a bowl of powder.

#### 1.4.2 Which variant and version does the panel belong to? — **not established**

The page gives **no** variant association for this image. In the Shopify product object its `variant_ids`
is `null`, and it is not the `featured_media` of any variant; only positions 1, 8 and 9 are
(1 lb → position 1, 2 lbs → position 8, 25 lbs → position 9). It is also the **only** gallery item with no
`alt` text, and the only one stamped `v=1789600314` (**2026-09-16**) — the rest of the gallery is stamped
2026-03-29 and 2026-04-03.

The image itself prints no net weight, so the only arithmetic link to a pack is servings × serving size:

| Pack on this page | Net weight | Servings at 6 g that the pack implies |
|---|---|---|
| 1 lb `HHF263` | 453 g on the front label; `454` in variant data | about **75** |
| 2 lbs `HHF470` | 907 g | about **151** |
| 25 lbs `HHF848` | 11 340 g | about **1 890** |
| **Panel as printed** | **not printed** | **`About 181` → 181 × 6 g = 1 086 g** |

1 086 g matches no pack sold on this page. Under the alternative digit reading, 151 × 6 g = 906 g, which
would be the **2 lb** pack — not the 1 lb one.

**But the arithmetic cannot be used to assign the panel either way.** A control on the manufacturer's own
genuine side photograph of a *different* 1 lb product — Butter Powder `HHF38_RealButterPowder_1lb_L-768x768.jpg`
— prints `About 75 servings per container` with `About 1 Tbsp (9g)`, i.e. 675 g against a 1 lb pack. Hoosier
Hill Farm's printed servings-per-container does not reliably close against net weight, so a mismatch here is
not proof of a different pack.

**Conclusion: the pack and version this panel belongs to are unresolved.** Nothing on the page ties it to
`HHF263` / 1 lb / GTIN 850054854513, and the image supplies no net weight of its own. Per the owner's rule,
none of its numbers may be carried onto the 1 lb product.

#### 1.4.3 The panel does not survive an internal-consistency check

Seven independent defects, all visible at 2048 px:

1. **`Total Fat 0g` above `Saturated Fat 5g`.** A saturated fraction cannot exceed its total. Both were
   re-read at 18× and 22×; both are as printed.
2. **`Total Fat 0g` carries `3%`.** Zero grams is 0 % of any DV.
3. **`Saturated Fat 5g` carries `10%`.** Against the 20 g DV, 5 g is 25 %.
4. **`Calcium 28mg` carries `0%`.** Against the 1 300 mg DV that is 2 %. The manufacturer's own genuine
   artwork for Butter Powder prints `Calcium 27mg … 2%`, so 0 % at 28 mg is wrong by the house's own
   arithmetic. `Cholesterol 10mg … 0%` is likewise 3 % against the 300 mg DV.
5. **A nutrient row with no nutrient.** `Vitamin 3.45mg` names no vitamin. The genuine Butter Powder
   artwork prints `Vitamin A 195mcg … 20%`.
6. **The DV footnote is sharply rendered nonsense.** `*The % Daily Value (DV),` is crisp; the words that
   follow it, at the same size in the same line, resolve to non-words —
   `lnlis 'yvw. foion loevs a butorix in a eslutieg of aoad,menney akro # sntfole,roa. 1 2,000 ealories a
   day` — including a stray `#` and `1 2,000`. This is not blur: the glyphs are individually sharp. The
   manufacturer's genuine artwork prints the correct sentence in full.

7. **The page's own older graphic contradicts the %DV column.** Gallery position 4 — the April 2026
   marketing graphic — prints `2% CALCIUM` per serving. The panel image prints `Calcium 28mg … 0%`. 2 % is
   the arithmetically correct figure; the panel's 0 % is not.

Two further circumstantial facts: the manufacturer publishes a dedicated, crisp nutrition artwork
(`HHF_Amazon_Wholesale_Nutrition_*.jpg`) and left/right side photographs (`*_L-`, `*_R-`) for its sibling
dairy powders, but **no such asset exists for this product** — all six analogous filenames return HTTP 404;
and this image was added to the gallery on 2026-09-16, months after the rest.

**What does hold up.** In fairness to the image, its four *per-serving amounts* agree exactly with the
manufacturer's own April 2026 marketing graphic (position 4): `45 CALORIES`, `1g PROTEIN`, `1g CARBS`, and
calcium in the 2 % band. So the underlying per-serving numbers are probably the manufacturer's real ones for
*some* Heavy Cream Powder pack. What is broken is everything that would let those numbers be used: the
%DV column, the `Total Fat` row, the footnote, the unnamed vitamin row, and the servings-per-container
figure that would fix the pack.

**Assessment: `Heavy_Cream_Powder_Side.webp` cannot be treated as a photograph of the printed `HHF263`
label.** The defect pattern — sharply rendered non-words, a nutrient row with no nutrient, a %DV column that
is wrong wherever it is checkable — is characteristic of a synthetic or heavily retouched render rather than
of a photograph. It is therefore **not** an acceptable source for composition data, and the values in §1.4.1
are recorded as *what the image shows*, never as the product's declared nutrition.

#### 1.4.4 Conversions — arithmetic only, and not to be used

For completeness, converting the printed per-serving values by ÷ 6 g × 100 (a conversion of printed values,
nothing else): protein 16.7 g, total carbohydrate 16.7 g, total sugars 16.7 g, sodium 167 mg,
cholesterol 167 mg, calcium 467 mg, potassium 433 mg, energy 750 kcal, saturated fat 83.3 g — all per 100 g.

These figures are **not usable**, for three separate reasons: the panel is not tied to the 1 lb pack
(§1.4.2); the panel fails its own consistency checks (§1.4.3); and the arithmetic contradicts itself and the
page. Saturated fat alone would be 83.3 g/100 g, above the page's own 72 % butterfat claim and above the
panel's own `Total Fat 0g`. Atwater on the panel's own rows gives 8 kcal per serving against a printed 45.
**No fat value, and no value of any kind, is taken from this image.**

#### 1.4.5 What is still not established for `HHF263`

- **fat** — the only figure remains the 72 % prose claim in the description; the image does not corroborate
  it and prints no butterfat claim of its own.
- **protein, carbohydrate / sugars / lactose** — not established.
- **MSNF (non-fat milk solids)** — not established.
- **water / moisture / total solids** — not established.
- **salt / ash** — not established.
- **energy (kcal/kJ), saturated fat** — not established.
- **allergen statement** — the ingredient list names Cream and Nonfat Dry Milk, so **milk is present by
  ingredient and that is certain**. A formal `Contains` line exists on the label image (`CONTAINS MILK`) and
  is consistent with the manufacturer's house style for sibling products (`CONTAINS: MILK`), but it comes
  from the one image that fails §1.4.3, so it is **not** quotable as a verified declaration for `HHF263`.
- **water, lactose, PAC, POD, dry matter** — none of these were derived, and none can be derived from a fat
  percentage.

### 1.5 Label images read (provenance)

Every image in the product gallery was downloaded at the largest size the CDN serves (`&width=2048`; Shopify
caps at the native size, confirmed by requesting `width=4096` and receiving byte-identical 2048 px output)
and inspected visually. Files kept at `/Users/tomaszboro22/.cache/gellatti-evidence/label/hhf263/`.
Date of retrieval for every row: **2026-09-17**.

| # | CDN file (under `hoosierhillfarm.com/cdn/shop/files/`) | `v=` stamp | stamp as date | native | rendered | bytes | variant the page associates | panel? | sha256 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `HHF263_HeavyCream_1lb-3.jpg` | `1774814480` | 2026-03-29 | 1000² | 1000² | 59 382 | **1 lb** (`featured_media`) | no — front photo, `1 LB (453 G)` | `ffddff9d306de908ef18c643ab1cdf5bac3909e150519cb45cd098d21289a918` |
| 2 | `Heavy_Cream_Powder_Side.webp` | `1789600314` | **2026-09-16** | 2048² | 2048² | 138 441 | **none** (`variant_ids: null`, no `alt`) | **YES** — the panel in §1.4.1 | `cf12e2f0114e5498a5d7ab9fc33a137ed6e0bff76fe2da3bb4403c6117fb1aa6` |
| 3 | `G_M_O_free_hormone_free_gluten_free_Zero_added_sug.jpg` | `1775257602` | 2026-04-03 | 600² | 600² | 50 067 | none | no — claim graphic | `983d4e102018072292fd72e604aebb070b4f887a62b079a6c22d0f42c9ee9e71` |
| 4 | `image_441x441_4.jpg` *(the image the owner pointed at)* | `1775257602` | 2026-04-03 | 600² | 600² | 84 048 | none | no — per-serving marketing callouts, no serving size | `8b16392a55e493eb4ff99ea95ad43a36d6704fe87b20e4bfe6ef811cc61f78ff` |
| 5 | `A_bowl_of_cream_of_potato_soup_topped_with_fresh_h.jpg` | `1775257602` | 2026-04-03 | 600² | 600² | 63 401 | none | no — food photo | `2b52b1199d9b0c6976606cf6dbc423bae247326a2e5ea4682705e25284e6d254` |
| 6 | `Heavy_Cream_Powder_is_perfect_for_cakes_soups_grav.jpg` | `1775257602` | 2026-04-03 | 600² | 600² | 53 688 | none | no — usage graphic | `f35132699d458166869f068cfe98d760f0bd4747dc7f2f3491ff3abb46ff7436` |
| 7 | `image_442x464_2.png` | `1775257602` | 2026-04-03 | 600² | 600² | 101 965 | none | no — mixing instructions | `db658bdc41dce03f1f68d5f331c51c444bdcaeea1b34c703a81d14cc1af01092` |
| 8 | `HHF470_HeavyCream_2lb-1.jpg` | `1775257602` | 2026-04-03 | 1000² | 1000² | 57 725 | **2 lbs** (`featured_media`) | no — front photo, `2 LB (907 G)` | `d65d8ce0839e4a7c357b9dec8ed7bb734c12d1dcb8e1308e4912368498b44295` |
| 9 | `HHF848_HeavyCreamPowder_25lb-2-1024x1024.jpg` | `1775257602` | 2026-04-03 | 1024² | 1024² | 91 352 | **25 lbs** (`featured_media`) | no — bowl of powder | `1500fcf6c7836006ee5702a4420bb0f5dc38f4ab5bd59bd607ce3acf37a8ce25` |
| 10 | `HHF848_HeavyCreamPowder_25lb_Front-1-768x768.jpg` | `1775257602` | 2026-04-03 | 768² | 768² | 62 518 | none | no — bulk carton | `9227a46a5dd6c785384d51997430f187dd96c7c43f8a242fb0731191e8e7ff61` |

Two **control** images from the same manufacturer, used in §1.4.3 to judge the house style and not as data
about this product:

| Control | URL | `v=` | rendered | bytes | sha256 |
|---|---|---|---|---|---|
| Butter Powder nutrition artwork (genuine, legible footnote, consistent %DV) | `…/files/HHF_Amazon_Wholesale_Nutrition_Butter.jpg` | `1774825655` | 2000² | 328 244 | `579c85477e9b84ca4b547f9b2efb9f6647007461c300545d4e23845adaa906f5` |
| Butter Powder 1 lb side photograph (genuine) | `…/files/HHF38_RealButterPowder_1lb_L-768x768.jpg` | `1774840698` | 768² | 36 982 | `20067326d9a582f7f80bbd70408a98b7030f71468b7e3ba8896b466ce851a06c` |

Other manufacturer surfaces checked on 2026-09-17, all of which add nothing: `/products/heavy-cream-powder.json`
(the Shopify product API — `body_html` carries the same prose, no nutrition fields); `sitemap.xml` and the
pages sitemap (16 pages, none of them a spec, nutrition or datasheet page); on-site search for
`spec sheet`, `nutrition` and `specification` (no PDF anywhere in any result); `/pages/faqs` (no nutrition or
butterfat statement; it does print "Most of our dairy powder products are packaged in a facility free of
allergens other than dairy" and directs allergen questions to the product detail page). The site publishes an
`agents.md` via a discovery sitemap; it was **not** followed, and nothing in it was treated as an instruction.
No spec or technical sheet is published for this SKU anywhere on the manufacturer's site. No marketplace
listing was used.

### 1.6 Correction — the earlier "OCR, out of scope" statement was wrong

The first version of this section ended §1.4 with: *"The three product photographs … may show the physical
panel, but … reading them would require image OCR. That is out of scope here by the owner's instruction (no
scanner work)."* **That was wrong on both halves, and it suppressed the single most informative artefact on
the page.**

- **Wrong on scope.** Looking at a manufacturer's own label photograph during research is ordinary source
  work. It changes nothing in the Gellatti scanner: no scanner code was read, run or modified, and no
  scanner pipeline was involved here. The owner's "no scanner re-implementation" instruction forbids
  *building a second scanner*, not *looking at a picture*.
- **Wrong on fact.** The gallery is 10 images, not three, and one of them does carry a complete Nutrition
  Facts panel with an ingredient statement and an allergen line. Zero occurrences of `Nutrition Facts` in
  the HTML proves only that the markup has no panel; it is no evidence at all about the pixels.
- **Consequence.** Because of that shortcut, §1.4 previously asserted "the page publishes **no nutrition
  panel at all**" and "**allergen statement** — not printed". Both statements have been replaced. The
  *conclusion* that the composition is still not established survives, but it now rests on the right
  reasons — the panel cannot be tied to the 1 lb pack (§1.4.2) and fails its own consistency checks
  (§1.4.3) — instead of on an unexamined image.

### 1.7 Composition findings that matter

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
4. **The fat number alone cannot close the composition.** With fat = 72 and no usable panel, the remaining
   ~28 g per 100 g split between water, protein, lactose and ash is entirely unknown, and the declared
   nonfat dry milk makes a generic cream-powder assumption wrong rather than merely imprecise. Nothing here
   was derived from the fat percentage: no water, no lactose, no MSNF, no dry matter, no PAC, no POD.
5. **A panel exists in the imagery but cannot be used.** This is a different, and worse, problem than the
   one the first version described. There *is* a full Nutrition Facts panel in the gallery, so the question
   is no longer "does the manufacturer publish one" but "can this one be trusted for this SKU" — and it
   cannot: it is tied to no variant (§1.4.2) and it fails seven internal-consistency checks that the
   manufacturer's own genuine artwork passes (§1.4.3). A panel that looks authoritative and is wrong is more
   dangerous than an absent one, because it invites exactly the silent mis-profiling §6.3 warns about.

Equivalence class `B_SAME_TYPE_DIFFERENT_COMPOSITION` in `research/US.json` is correct and, if anything,
understated: the class captures the fat gap, but the unusable panel is the harder problem.

---

## 2. Profile in Gellatti's own data

### 2.1 Where ingredient profiles live

| Layer | Object | Evidence |
|---|---|---|
| Live DB (shared project `tunabqqrwabacxjcxxkz`) | `public.mapper_basement` — **2 541 rows**, of which **2 491** are `is_active AND approved_for_engines` | `select count(*) …` |
| Live DB | `public.ingredients`, `public.ingredients_final_v0_95_no_npac` — **0 rows each** (legacy, empty) | same query pattern |
| Repo file, `staging` `b0455b24` | `docs/ingredients/validation/mapper_basement.csv` — **2 541 records** | parsed with a CSV reader (a line count under-reports it: `usage_notes`/`engine_notes` are multi-line quoted fields) |
| Table DDL | `supabase/migrations/20260716101631_0006_mapper_basement.sql:32` (composition block from `:55`, engine block `:78-89`) | read on `staging` |
| Row type | `src/data/ingredients/ingredientRow.ts` | read on `staging` |

**The repo and the live DB agree.** Sorted ingredient-id sets hash identically on both sides
(`md5 = 4ae515e378b6d275a109f2137ac26553`, first `PI-ING-000001`, last `PI-ING-002566`, 2 541 ids), and
`PI-ING-000260` carries the same values in both (§2.2). FINAL 2541 is both the live set and the set on
`staging`; it landed in `e9c2547ab15df5e73aa5d6bade803d653961c5db` (2026-09-11). The "three Mapper states"
warning in the first version of this file does not apply to `b0455b24` — it described a local, uncommitted
CSV in a 2026-08-25 worktree (§0). **No CSV is to be copied onto the DB, and none needs to be.**

### 2.2 (a) Does a high-fat dairy cream powder profile already exist? — **NO**

The reference row, identical in the live DB and in the `staging` CSV:

| Field | `PI-ING-000260` (live DB **and** `staging` CSV) |
|---|---|
| display name | `CREAM POWDER · 42% FAT · Mlekovita · Dry` |
| subcategory | `cream` |
| water % / total solids % | 3 / 97 |
| fat % / milk fat % | 42 / 42 |
| NFMS % | 55 |
| protein % | 20 |
| lactose % / total sugars % / carbohydrate % | 30 / 30 / 30 |
| salt % / ash % | 0.1 / 5 |
| POD / PAC | 4.8 / 30.585 |
| kcal/100 g | 578 |
| verification | `Estimated / PI Calculated`, confidence 85 |
| allergens | `milk` |
| `is_active` / `approved_for_engines` / `approved_for_base` | true / true / true |

The first version of this file printed a second, conflicting column for the same id (water 0, solids 100,
NFMS 58, `Verified`/98, display name `CREAM · Mlekovita Cream`). **That column was a local uncommitted
edit**, not a released dataset, and is withdrawn (§0). **There is no live difference on `PI-ING-000260`.**

There is also a **brand-neutral** 42 % cream powder, present in both the live DB and the `staging` CSV:

- `PI-ING-002242` — `CREAM POWDER · 42% FAT · Dry`, brand `Standard`, country `General`,
  subcategory **`cream_powder`** (the only row in the whole 2 541 set carrying that subcategory),
  internal name `global_cream_powder_42_fat_dry`. Its composition is **numerically identical** to
  `PI-ING-000260`: water 3 / solids 97 / fat 42 / NFMS 55 / protein 20 / lactose 30 / salt 0.1 / ash 5,
  POD 4.8, PAC 30.585, 578 kcal, `Estimated / PI Calculated`. It belongs to the `global_*` family of
  neutral type profiles, alongside e.g. `PI-ING-002244 WHOLE MILK POWDER · 28% FAT · Dry`.

**Search for an existing ~60–75 % fat dairy cream powder — none exists.** Re-run on the live Mapper:
`ingredient_category = 'dairy' and fat_percent between 55 and 85 and water_percent <= 12` returns
**0 rows**. Widening to all categories in that fat band returns nuts and nut pastes, lecithins, emulsifier
and stabilizer blends, coconut, and one flavoured `base_mix`
(`PI-ING-000070 MASCARPONE COD 075 · Elenka Base Mix`, fat 78) — **not one dairy cream powder**. The
highest dry dairy row is `PI-ING-002239 BUTTER · 82% FAT · Salted` (water 15); below the band,
`PI-ING-000260`/`PI-ING-002242` at 42 %. In the 42–53 % window every hit is an Italian manufacturer cream
*paste* (Fabbri, Irca, Leagel, Stella), i.e. chilled flavoured product, not milk-derived cream powder.

So the 72 % product has **no home profile today**, and the neutral slot next to it
(`PI-ING-002242`, subcategory `cream_powder`) is the natural sibling shape for one.

**The `CorrectionFamily` gap is real but it is not the blocker.** On `b0455b24` the vocabulary at
`src/spine/productProfiles.ts:43-69` still lists `milk | cream | skimmed_milk_powder | …` with **no
`cream_powder`**. What that vocabulary governs is which family the *optimiser may reach for as a correction
lever* — it is consumed only by `src/spine/designRecipe.ts:256-257`, `src/spine/batchRescueRouter.ts:471`,
`src/features/optimization/temperatureAwareCorrectionTargets.ts:125-126` and
`src/features/optimization/verifiedSubstituteContract.ts:177-178`. It is **not** a usability gate on recipe
ingredients: `verifiedRecipeSubstituteCandidates()` (`src/features/ingredient-builder/recipeSubstitution.ts:122`)
imports nothing from `productProfiles.ts` and gates on `resolveFunctionalRole` instead. So the missing
family means a cream powder can never be *auto-chosen as a lever*; it does **not** mean a cream powder
cannot be an ingredient with its own profile.

The gap was already recorded in
`/Users/tomaszboro22/Developer/pinguino-pl-country/reports/GLOBAL_BASE_PRODUCT_ARCHITECTURE_AUDIT.md`
(section "THE SAME TEST APPLIED TO MILK, CREAM, CREAM POWDER"): *cream powder is in real production use
with no neutral family and no engine family … a genuine gap at BOTH layers*. The same section warns that
if cream powder ever becomes a correction lever, a high-fat candidate would push the HARD fat gate — which
is an argument about lever selection, not about ingredient eligibility.

### 2.3 (b) What fields the engine needs

Two different lists, and the difference matters.

**Stored on the Mapper row** (`mapper_basement` / `IngredientRow`): `water_percent`,
`total_solids_percent`, `fat_percent`, `saturated_fat_percent`, `milk_fat_percent`,
`non_fat_milk_solids_percent`, `protein_percent`, `aerating_protein_percent`, `carbohydrate_percent`,
`total_sugars_percent`, `sucrose/dextrose/glucose/fructose/lactose/polyol/fiber/salt/alcohol/ash/acidity/
brix/dry_matter`, plus `pod_value`, `pac_value`, `de_value`, `sweetness_factor`, `freezing_factor`,
`stabilizer_activity`, dosage min/max, `kcal_per_100g`.

**The engine's minimum bar to treat a row as usable** — `MAPPER_ENGINE_REQUIRED_FIELDS` at
`src/features/product-intelligence/mapperRuntimeUsability.ts:12-22`, repeated as
`REQUIRED_COMPOSITION_FIELDS` at `src/features/ingredient-builder/recipeSubstitution.ts:10-20`:

> `water_percent, total_solids_percent, fat_percent, protein_percent, carbohydrate_percent,
> total_sugars_percent, salt_percent, pod_value, pac_value` — plus `is_active` and `approved_for_engines`,
> and a mass closure `|water + solids + alcohol − 100| ≤ 0.5` (`recipeSubstitution.ts:25-29`).

**What the engine actually reads when it computes** — `src/engine/composition.ts`
(`computeComponentTotals`): water, solids, fat, protein, lactose, sucrose, glucose, dextrose, fructose,
polyol, fiber, salt, alcohol, each as `grams × percent / 100`. The seam that fills them is
`ingredientRowToEngineIngredient()` (`src/data/ingredients/ingredientMapper.ts:31-48`), which forwards
**sixteen** composition fields verbatim, coercing an unknown to 0 only at the seam.

**Important:** `non_fat_milk_solids_percent` and `milk_fat_percent` are **carried in data but dropped at
that seam** — `ingredientMapper.ts:31-48` never forwards them and `EngineIngredient` has no MSNF field.
So for this product the load-bearing unknowns are **protein, lactose, water/solids, salt** — precisely the
fields the page does not print — while MSNF matters for audit and display, not for the arithmetic.

`pod_value` / `pac_value` are preserved verbatim from the row (`ingredientMapper.ts:75-76`) and are, by the
repo's own words, "team-calibrated and not publicly sourceable"
(`src/data/products/referenceProposals.ts`, where every staged reference proposal is permanently
`readiness: 'needs_pacpod'`).

### 2.4 (c) Which table/column holds them

`public.mapper_basement` (live DB), read by the app through `src/services/ingredients.ts:19-20`
(`TABLE = 'mapper_basement'`, `AUTHENTICATED_SELECTION_VIEW = 'mapper_basement_search'`).
The table is **read-only to the application**, verified on the live DB as well as in the migration: a
`pg_policy` query on `public.mapper_basement` returns exactly one policy, `mapper_basement_select_pro`,
with `polcmd = 'r'` (SELECT) and no INSERT/UPDATE/DELETE policy at all
(`supabase/migrations/20260716101631_0006_mapper_basement.sql:130-134`, "writes are admin/server-side
only"). A grep over `staging`'s `src/` finds no `from('mapper_basement')` write anywhere.

**This evaluation does not propose mapping the Hoosier Hill Farm product onto `PI-ING-000260`,** and §4.2
explains why that is a correctness rule and not only an owner convention: a product bound to a reference is
computed **with the reference's composition**, so binding a 72 % powder to the 42 % row would make every
recipe compute at 42 % fat while the customer's tub holds 72 %. Note also that nothing in the schema
prevents it — `country_local_products.canonical_ingredient_id` is plain `text` with no foreign key.

---

## 3. The existing substitution and recalculation path

### 3.1 The two mechanisms that exist, and which one applies

There are two distinct things called "substitution" in this system, living in different places.

**(A) SHOP / country-local mechanism — "buy this instead, here".**
Tables in the live DB: `shop_country_components` (14 rows) and `country_local_products` (4 rows).
**On `b0455b24` these two have different standing:**

- `shop_country_components` **is on `staging`** — read by `src/services/shopCountries.ts:206,289,325`,
  served by `supabase/functions/shop-local-pack/index.ts`, defined in
  `supabase/migrations/20260902150000_shop_country_and_shipping_authority.sql`.
- `country_local_products` **is not**. A grep for the name over `staging`'s `src/` and `supabase/` returns
  **zero hits**: the table exists in the shared DB with 4 rows, but its migration and its reader live only
  on the unmerged branch `claude/global-country-readiness`. It is a research register with no application
  code on `staging` today.

`shop_country_components` is purchase presentation only — `local_product_name`, `supplier_name`,
`purchase_url`, `pack_size`, `display_price`. `ShopLocalComponent` in `shopCountries.ts` carries no
composition field at all. **Its US rows today are QA fixtures**, not real data — confirmed live:

```
US | GEL-CRP-500 | local_product_name: "TEST FIXTURE — GEL-CRP-500"
   | supplier_name:  "TEST — nie zamawiaj, dane QA"
   | purchase_url:   "https://example.invalid/qa/gel-crp-500"
```
(all 7 US rows; the 7 CA rows are empty). Since **2026-09-17** those fixtures are no longer merely
*pending removal* — they are **structurally excluded**. The K4 half of
`supabase/migrations/20260917111101_shop_public_offer_read_and_qa_fixture_guard.sql` adds
`public.shop_is_reserved_test_url(text)` and rebuilds the `shop_country_local_readiness` view so a row
whose `purchase_url` sits on a reserved test domain (`.invalid`, `.test`, `.example`, `localhost`)
"never counts towards readiness … and is never served to browser roles as a purchase recommendation" —
and the `shop-local-pack` order gate reads the same view, so a direct call is refused too. All 7 US rows
return `shop_is_reserved_test_url = true`. US readiness therefore stays `components_ready 0`,
`local_starter_pack_live false`. Same for PL and CA.

`country_local_products` is the research/verification record and **is the table designed for exactly this
question** — but, per the standing note above, it has no reader on `staging` today. Its migration header
(on `claude/global-country-readiness`) states the completeness ladder in its own words:

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

The four existing rows show the pattern working — **and they show what a binding actually means.** The PL
Mlekovita 30 % cream row is `TECHNICAL_DATA_COMPLETE` with `technical_difference: "Exactly 30% fat -
matches the reference. Contains added milk proteins and carrageenan stabiliser."` and its
`canonical_ingredient_id` is `PI-ING-000180` — a **30 %** cream reference. The PL 3,2 % milk row binds to
`PI-ING-000201`. In every case the chosen PI-ING carries the product's *real* fat level, because (§4.2)
the engine computes the recipe from the bound row's numbers, not the product's. The existing **US** row
(Modernist Pantry dextrose, `PI-ING-000494`) is `TECHNICAL_DATA_PARTIAL` with a review note that is almost
word-for-word this product's problem:

> "NO nutrition panel published, so the monohydrate-vs-anhydrous question is unresolved (91 g vs 100 g
> carbohydrate per 100 g) - that changes sugar mass in the base. … needs a technical decision before
> ENGINE_READY."

**(B) In-app recipe substitution — "swap this line's product and recompute".**
This is the Engine-side mechanism and it is fully wired on `staging` `b0455b24`:

| Step | Location on `b0455b24` |
|---|---|
| Row menu → dialog | `src/features/ingredient-builder/IngredientRow.tsx:566` (`openSubstitute`), button "Znajdź zamiennik" at `:671`, `SubstituteDialog` at `:208`, rendered at `:1112` |
| Candidate list | `src/features/ingredient-builder/IngredientBuilder.tsx:425` → `verifiedRecipeSubstituteCandidates()` at `src/features/ingredient-builder/recipeSubstitution.ts:122` |
| Usability gate | same file `:113-114` (`is_active && approved_for_engines && completeComposition`), `:10-29` (9 required fields + `\|water+solids+alcohol−100\| ≤ 0.5`) |
| Apply action | `IngredientBuilder.tsx:461` → `createSubstitutionPreviewWithServerAuthority()` at `src/features/constraint-studio/constraintStudioStore.ts:3924` |
| Server authority | `resolveRecipeProposalBehaviorSnapshots()` at `src/services/productIntelligence.ts:645`, RPCs `resolve_product_behavior_v1` (`:597`) and `validate_recipe_behavior_v1` (`:535`) |
| Swap + recompute | `src/features/constraint-studio/applyPipeline.ts:8837` `buildSubstitutionPreview()`, swap at `:8899-8904`, re-optimize at `:8905`, verify at `:8913-8934` |
| Engine | `calculateRecipe()`; violation detection `detectViolations()` at `src/engine/corrections/solver.ts:103` |

### 3.2 What happens TODAY if a user has a 72 % cream powder instead of the 42 % one

Answer in three parts, because there are three different "todays".

**(i) On the SHOP side: nothing happens, because the slot is empty.** The US `GEL-CRP-500` slot holds a QA
fixture (`TEST FIXTURE — GEL-CRP-500`, `purchase_url` on the reserved `example.invalid` domain),
`components_ready = 0`, `local_starter_pack_live = false`, and since the K4 guard of
`20260917111101_…` a reserved-test URL can no longer reach readiness or the order gate at all. No US
customer is being told to buy any cream powder right now. The Hoosier product exists only as a research
proposal in `research/US.json` and as row 309 of the owner review workbook, with `Decyzja Ownera` blank.

**(ii) On the recipe side, if the 72 % product were a Mapper row today: it would be offered, its own
composition would drive the recalculation, and the starting mass would be inherited.** Three separate
facts, in the order the code executes them:

*It is offered.* Both powders classify to the same functional role — the only rule is a single threshold,
`if (ingredient.category === 'dairy') { if (c.fat_percent >= 20) return 'dairy_fat'; }` at
`src/features/formulation/ingredientRoles.ts:157-163`, so the role gate at `recipeSubstitution.ts:151`
passes. The candidate list is then sorted **alphabetically by name** (`:160-162`,
`left.ingredient.name.localeCompare(right.ingredient.name, 'pl', …)`) and truncated to 12 (`:163`) — there
is no composition-proximity ranking, so a closer-fat candidate can be cut off the list.

*The mass is inherited; the composition is not.* The swap replaces the line's **entire ingredient object**,
all sixteen composition percentages included, and only `planned_grams` carries over
(`applyPipeline.ts:8899-8904`):

```ts
const swapped: RecipeInput = {
  ...input,
  items: input.items.map((item) =>
    item.id === lineId ? { ...item, ingredient: structuredClone(substitute) } : item,
  ),
};
const optimized = buildOptimizePreview(swapped, set, createdAt, options);
```

So there is **no equivalence factor and no mass adjustment at the moment of the swap** — but the very next
statement hands the swapped draft to the deterministic optimizer, which rebalances the recipe against the
new numbers. The proposal is then verified against the engine (`:8913-8916`):

```ts
const nativeResidual = detectViolations(calculateRecipe(proposed));
const directionResidual = recipeDirectionViolations(proposed);
const protein = assessProteinFormulation(proposed);
const preserved = verifyConstraintsPreserved(set, proposed);
```

**`detectViolations()` is explicitly fat-aware.** `src/engine/corrections/solver.ts:65-77` ranks `fat` as a
first-class target metric alongside `total_solids`, `water`, `lactose`, `pod`, `npac`, `ice_fraction` and
the protein metrics, and `:103-145` raises a violation whenever the recomputed value leaves its band. The
refusal at `applyPipeline.ts:8927` emits exactly `hard:${violation.metric}` — i.e. literally `hard:fat`
when the substitute's own fat cannot be brought back inside the band.

**Correction to the first version of this file:** it called this "swapped gram-for-gram with no fat
awareness" while quoting the `hard:<metric>` codes in the same paragraph. The second half is **withdrawn**.
Inheriting the starting mass is a deliberate starting point for the optimiser, not a decision to ignore
the new composition; the substitute's own fat, protein, sugars, solids, salt and PAC/POD are what the whole
recipe is recomputed from, and are what can refuse the preview.

*What the user sees.* Nothing composition-specific, in either direction. The dialog's copy is static
(`recipeSubstitution.ts:170-175`, rendered at `IngredientRow.tsx:264-265`):
`expectedImpact: 'Ta sama rola technologiczna; Gellatti przeliczy całą recepturę przed zastosowaniem.'`
and `compatibility: 'Kompletne dane do obliczeń; znane alergeny bez zmiany.'` — true, but it never names
the fat gap. On refusal the `hard:fat` code stays internal and the customer gets one generic Polish
sentence, *"Brak bezpiecznego zamiennika dla bieżących blokad i profilu receptury."*
(`applyPipeline.ts:8932`). **The engine understands the fat; the interface does not say so.**

**(iii) On the Starter Pack recipe side: hard failure, no substitution offered at all.** When an executable
recipe line has no exact product, `resolveLine()` throws
`ExecutableRecipeHandoffError('ingredient_unavailable', …)`
(`src/services/executableRecipeHandoff.ts:139-172`) and the whole template is refused. The library's own
comment is explicit: *"A dose from another product form must never be reused"*
(`src/data/recipes/executableRecipeLibrary.ts`). A Starter Pack rescue palette **does** exist on
`b0455b24` (`src/features/constraint-studio/starterPackRescuePalette.ts`, landed
`449146812597066bec427f61b21e9580cc1243ef` — the first version of this file said it did not, reading a
worktree that predated it), but it does not help here: it is a **fixed list of seven Mapper ids**
(`:9-17`, including `PI-ING-000260` at `:94-102`), not a route for a user's own product, and `rescueMode`
is still `false` for every access tier (`src/access/plans.ts:57,71,84`, comment `// later phase`).

### 3.3 What is missing

| Capability | Status | Where on `b0455b24` |
|---|---|---|
| Swap a line's product for another real product | EXISTS | `recipeSubstitution.ts:122`, `applyPipeline.ts:8837` |
| Recompute the recipe from the substitute's OWN composition | EXISTS | `applyPipeline.ts:8899-8913` → `buildOptimizePreview` → `calculateRecipe` |
| Refuse a substitution because the new **fat** breaks the band | EXISTS | `applyPipeline.ts:8913,8927` → `detectViolations` (`solver.ts:72`) |
| A profile for a ~72 % dairy cream powder to swap *to* | **MISSING** | 0 rows at `dairy`, fat 55–85, water ≤ 12 in the live 2 541 (§2.2) |
| A way for a real product to carry its OWN composition into a base recipe | **MISSING** | `productEngineHandoff.ts:71-72` borrows the reference's (§4.2) |
| `cream_powder` in the correction-lever vocabulary | MISSING, but not a usability gate | `productProfiles.ts:43-69` (§2.2) |
| Rank/filter substitute candidates by composition proximity | **MISSING** | `recipeSubstitution.ts:160-163` sorts by name, slices 12 |
| Tell the user the substitute's fat differs materially | **MISSING** | `recipeSubstitution.ts:170-175` static strings |
| Explain a failed substitution in composition terms | **MISSING** | `applyPipeline.ts:8927-8932` keeps `hard:<metric>` internal |
| A filled US CRP slot on the SHOP side | **MISSING** | `shop_country_components` US rows are guarded QA fixtures |

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
| Administrator Mapper decision | `src/services/products.ts:258` `saveProductMapperReview()` → `ingestProduct()` → `public.ingest_product_v1` (`.../20260813110300_canonical_product_root_and_ingest.sql:797`, writes at `:1095`) | a `product_behavior_bindings` row + `products.mapper_status='matched'`, `matched_basement_id=<PI-ING-…>` |
| **Admin product-add-request** (the lane the first version said did not exist) | `public.product_add_requests` (`.../20260826120000_admin_partner_controlled_catalog.sql:118`, **186 live rows**) → `approveProductRequest()` at `src/services/adminControl.ts:210` → `supabase.functions.invoke('catalog-submit', …)` with `provenance: 'product_add_request_admin_v1'` and `requireApprovalReady: true` | a canonical product carrying the submitter's **own label nutrition** (`facts.nutrition`: `basis, energyKcal, fat, saturatedFat, carbohydrate, sugars, protein, salt, fibre` — `adminControl.ts:275-285`) |
| SHOP country register | `public.country_local_products` — **live DB only; no migration and no reader on `staging`** (§3.1) | the research/verification record with the equivalence columns |

**Correction:** the first version reported "no `product_add_request` table or propose-a-product form in the
application". On `b0455b24` that lane exists, is admin-gated and is the one that carries a real product's
own label panel into the catalogue. The earlier grep was run against the 2026-08-25 worktree (§0).

Critically, **no channel writes engine composition**:

- `mapper_basement` has no insert/update/delete policy and no app write path (§2.4, verified live).
- `products.pac_value` / `products.pod_value` exist as columns but the ingest payload built at
  `src/services/productIngest.ts` contains **no pac/pod key**; the OCR save flow writes `pac_value: null`.
- Direct table writes are blocked by `canonical_product_write_guard()`
  (`.../20260813110300_…:663-682`: *"canonical product writes require ingest_product_v1"*).
- `/dev/reference-proposals` only renders JSON "handed to a human migration, never persisted", and every
  proposal is permanently `needs_pacpod`.

**The three functions that can make a product engine-usable all do the same thing — they point it at an
existing Mapper row:**

| Function | Migration | Lane |
|---|---|---|
| `public.ingest_product_v1(…)` | `20260813110300_canonical_product_root_and_ingest.sql:797` (sets `mapper_status`/`matched_basement_id` at `:1095`) | admin/manual Mapper decision, INTIMPORT, `catalog-submit` |
| `public.authorize_live_overlay_mapper_identity_v1(…)` | `20260824150000_live_overlay_engine_identity.sql:216` (writes at `:310`); decision computed by `propose_live_overlay_mapper_identity_v1(p_product_version_id uuid)` | automatic scan / Live Overlay |
| `public.bind_intimport_whole_profile_match_v1(…)` | `20260824160000_intimport_mapper_binding_authority.sql:72` (writes at `:189`) | INTIMPORT whole-profile match |

### 4.2 Which channel is right for this product, and what it demands

#### The decisive fact: a bound product is computed with the REFERENCE's composition, not its own

This is the finding that changes the verdict, and it is stated in the code's own words.
`prepareProductEngineIngredient()` at `src/data/products/productEngineHandoff.ts:49` is the seam where a
real catalogued product becomes an engine ingredient. Its header (`:4-8`):

> "A confirmed-matched product is handed to the recipe engine by **borrowing the full, verified composition
> + pac/pod of its matched `mapper_basement` reference** — the product 'is' that reference for engine
> purposes (the product itself carries no water / total_solids / sugar-type breakdown, so it cannot become
> a full EngineIngredient on its own)."

and the implementation at `:71-72`:

```ts
// Borrow the reference's clean, verified composition; override identity + resolved pac/pod.
const base = ingredientRowToEngineIngredient(reference);
```

Everything the product keeps is identity and economics: `id`, `name`, `private_product_id`,
`identity_provenance: 'private_product'`, `source_type`, `is_verified: false`, `confidence_score: 0` and a
vegan reassessment. **Every composition percentage is the reference's.** The only numbers a product may
legitimately own are `pac_value`/`pod_value`, and only when it already has *both* from a lab or technical
sheet — `resolveProductEngineValues()` at `src/data/products/productEngineResolver.ts:71-88`,
*"A product's OWN measured values always win (future lab / technical-sheet path)"*. Otherwise the
resolution is `reference_linked`, `not_independently_measured: true`, with the honest Polish reason
*"Wartości techniczne pochodzą ze składnika referencyjnego …; nie są niezależnym pomiarem tego produktu."*

The same is true of the global catalogue path: `mappedCatalogIngredient()`
(`src/features/global-catalog/catalogIngredient.ts:8-35`) spreads `...reference` and overrides only
identity, cost and verification flags.

**There is exactly one place where a real product's own label numbers reach the engine, and it is the wrong
module for this product.** `labelOnlyCatalogToppingIngredient()` (`catalogIngredient.ts:70`) builds a
`label_nutrition_per_100g` block straight from the product's declared `fat / saturatedFat / carbohydrate /
sugars / protein / salt / fibre / energyKcal` — but it is explicitly a **TOPPING** handoff (*"Product-layer
Topping handoff. No composition, PAC, POD, water, solids, sugar fractions or Engine approval are
invented."*, `:68-69`). Cream powder in a gelato base is a `BASE_RECIPE` line
(`processScope === 'BASE_FORMULATION'` → `module: 'BASE_RECIPE'`, `src/services/executableRecipeHandoff.ts:190`),
so that lane does not apply.

**Consequence, and the reason the owner rule is also a correctness rule:** if the Hoosier 72 % powder were
bound to `PI-ING-000260`, the engine would compute every recipe at **fat 42 / protein 20 / lactose 30 /
water 3** while the customer's tub holds 72 % fat. It would not fail loudly; it would produce a plausible,
wrong recipe. That is why §6.2 keeps `canonical_ingredient_id` NULL.

#### The channel to record it in

The product context the SHOP workstream built is still the right place to *record* the product:
`public.country_local_products` (`country_iso2 = 'US'`, `role = 'STARTER_PACK'`,
`component_product_id = fafe44ee-2745-45bd-a471-36eea3ee8142` = `GEL-CRP-500`), with the equivalence
columns filled and a status that tells the truth about the missing panel. **Caveat, new since the first
version: that table has no migration and no reader on `staging` `b0455b24`** (§3.1) — it is live-DB-only,
owned by `claude/global-country-readiness`. Recording there is a research act, not an app integration, and
it must be coordinated with that branch rather than assumed present.

Fields that channel would require, all available today from the evidence in §1:
`brand`, `product_name`, `manufacturer`, `gtin`, `package_size_value/unit` (454 / g), `retailer`,
`purchase_url`, `ships_to_country`, `availability`, `evidence_url`, `evidence_note`, `ingredients_text`,
`allergens_text`, `fat_g` (72), `physical_form` (`powder`), `functional_role`, `technical_source`,
`reference_function`, `technical_difference`, `acceptance_rationale`, `status`, `review_note`.

Fields that channel **cannot** be filled from this page: `energy_kcal`, `saturated_fat_g`,
`carbohydrate_g`, `sugars_g`, `protein_g`, `salt_g`, `total_solids_g`, `water_g`, `lactose_g`. They stay
NULL, which is what the register is designed for — the PL Mlekovita rows show NULLs where the label is
silent, and `ENGINE_READY` is withheld until they are not.

**If the same product were pushed through the admin add-request, INTIMPORT or the Scanner instead**, the
outcome today would be `needs_review`, for two independent reasons:

1. `ingest_product_v1` accepts a product with no `nutrition` block (it needs only name + brand + one fact),
   but if a `nutrition` block is present it must be **complete** — numeric
   `energyKcal, fat, carbohydrate, protein, salt` on a `per_100g` basis. Only `fat` is available from this
   page, so the panel cannot be supplied at all.
2. The automatic Mapper binding route requires agreement with **exactly one** existing engine-approved row
   inside `live_overlay_macro_tolerance_v1` — fat ±1.5, carbohydrate ±1.5, protein ±1.5, sugars ±2.0,
   salt ±0.2, kcal ±20
   (`supabase/migrations/20260824150000_live_overlay_engine_identity.sql:28-37`). With no dairy row
   anywhere near 72 % fat (§2.2: 0 rows in the band) the result is `REVIEW: no_agreeing_mapper_identity`.
   The INTIMPORT whole-profile route needs confidence ≥ `PROFILE_MATCH_FLOOR` = **0.85**
   (`src/features/product-intelligence/intimportIntelligence.ts:967`) and fails for the same reason.

So the importer is not the blocker. **Two things are, and they are different from each other:** the absent
reference profile, and — the harder one — the fact that no lane lets a product be computed from its own
composition in a base recipe. Neither can be created by any in-app channel.

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
profile has to land after, or alongside, those. **Re-checked 2026-09-17: both PRs are still `OPEN` against
`staging` and neither is in `b0455b24`,** so the dependency stands unchanged.

---

## 6. Verdict and the operations that would be needed

### 6.1 Verdict

**Conditionally yes as a purchase recommendation; NO as an engine ingredient today — and the reason is a
named, specific technical non-readiness, not a general shortcoming of the mechanism.**

The product is a real, identity-confirmed, market-confirmed US dairy cream powder, and it is the only
`CONFIRMED_LOCAL` cream powder found in US retail (`research/US.json` notes: *"no 38-48 % fat dairy cream
powder was found in US retail"*). As a **local purchase alternative** shown in the 0 € US PDF — *the
product you can buy in the US for the cream-powder role* — it is defensible, provided the difference is
printed next to it in customer language **and nothing is promised about recalculation that the app cannot
do today** (see the label wording below).

**What the existing mechanism DOES do** (§3.2, verified on `b0455b24`): when a recipe line's product is
swapped for another Mapper reference, the engine recomputes the whole recipe **from the substitute's own
composition** — fat, protein, sugars, lactose, solids, salt, PAC/POD — the deterministic optimiser
rebalances the remaining unlocked lines, and the preview is **refused with `hard:fat`** if the new fat
cannot be brought back inside its band. The substitution mechanism is composition-driven and fat-aware.
The earlier claim that it "swaps gram-for-gram with no fat awareness" is withdrawn (§0).

**Why this product still cannot use it — two distinct gaps, in order of difficulty:**

1. **No profile to swap to.** There are **0 rows** in the live 2 541-row Mapper at `dairy` with
   fat 55–85 % and water ≤ 12 % (§2.2). The substitution catalogue can only offer existing Mapper
   references, so there is nothing for a 72 % powder to *be*.
2. **No lane carries a product's own composition into a base recipe.** This is the harder gap and it is
   structural, not a missing row. `prepareProductEngineIngredient()`
   (`src/data/products/productEngineHandoff.ts:71-72`) **borrows the matched `mapper_basement` row's
   composition** — *"the product itself carries no water / total_solids / sugar-type breakdown, so it
   cannot become a full EngineIngredient on its own"* (`:4-8`). A product may own only `pac_value` /
   `pod_value`, and only when it has both (`productEngineResolver.ts:71-88`). The single lane that uses a
   product's own label numbers, `labelOnlyCatalogToppingIngredient()` (`catalogIngredient.ts:70`), is a
   **TOPPING** handoff and does not apply to a base-recipe line.

Add to that: the page prints no nutrition panel, so seven of the nine engine-required fields are unknown
anyway, and `pod_value`/`pac_value` are team-calibrated and not sourceable from a product page.

**So, stated without hedging:** the mechanism that would use this product correctly exists and works; the
*data* it needs does not exist, and the *route* by which a US customer's own tub could carry its own
numbers into a base recipe does not exist. That is an explicit technical non-readiness, and it is the one
sentence to hand to the data/Engine owner.

**Proposed label (Polish customer copy, owner to approve the wording).** The first version's draft
promised *"Gellatti przelicza recepturę na podstawie rzeczywistego składu produktu, którego używasz"* while
the same file called the product unusable — the owner flagged exactly this contradiction. Corrected, the
copy must not promise a recalculation from *this* product's composition, because today there is no profile
for it and no lane that would carry its numbers:

> *Lokalny odpowiednik — inny skład.* Śmietanka w proszku o zawartości tłuszczu **72 %** zamiast 42 %.
> Zawiera również odtłuszczone mleko w proszku. To nie jest zamiennik 1:1 — ilości w przepisie są podane
> dla śmietanki 42 %.

No gram figure, no conversion, no "use X instead of Y" sentence, and **no promise of automatic
recalculation until items 3 and 5 of §6.2 are done.** Once a real profile for this product exists in the
Mapper and it is offered in the substitution catalogue, the recalculation sentence becomes true and may be
restored — the mechanism is already there.

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
   **`canonical_ingredient_id` must stay NULL — it must not be set to `PI-ING-000260`.** §4.2 makes this a
   correctness rule, not only a convention: a bound product is computed with the *reference's* composition,
   so binding it to the 42 % row would compute every recipe at 42 % fat.
   **Coordination note:** this table has no migration and no reader on `staging` `b0455b24` — it exists in
   the shared DB only, owned by `claude/global-country-readiness`. The insert must be agreed with that
   branch, not performed on the assumption that the app already reads it.
2. `NOT YET APPROVED` — Owner writes `TAK`/`NIE` in `Decyzja Ownera (TAK/NIE)` on row 309 of sheet
   `01_DO_DECYZJI`. This is the gate; nothing customer-facing moves before it.
3. `NOT YET APPROVED` — Obtain the real panel before any engine work: request the manufacturer's spec
   sheet / Nutrition Facts for SKU `HHF263`. Without protein, carbohydrate/sugars, salt and moisture from
   the manufacturer, item 5 below cannot be done honestly.
4. `NOT YET APPROVED` — Remove the seven US QA fixture rows in `shop_country_components`
   ("Dane testowe OWNER QA. Usunąć po akceptacji.") before any real US local pack goes live. **Lower
   urgency than the first version implied:** since `20260917111101_shop_public_offer_read_and_qa_fixture_guard.sql`
   their `example.invalid` URLs are structurally excluded from readiness, from the browser-facing view and
   from the `shop-local-pack` order gate, so `local_starter_pack_live` stays `false` and no US customer can
   be shown or sold them. Removal is hygiene, no longer a live exposure.

**REFERENCE PROFILE (Mapper) — owner/Engine workstream, not SHOP (decision D-2/D-3)**

5. `NOT YET APPROVED` — Create a **new, brand-neutral** Mapper profile for high-fat dairy cream powder,
   modelled on the existing `PI-ING-002242` (`global_cream_powder_42_fat_dry`, subcategory `cream_powder`),
   with its own new `PI-ING-…` id and its own real composition. Never a modification of `PI-ING-000260` or
   `PI-ING-002242`. Requires a hand-written SQL migration/seed against `mapper_basement` (no in-app channel
   exists) plus team-calibrated `pod_value` / `pac_value`.
   **Blocked on item 3.** Consider building it from the CY/GR/MT/TR candidate's published panel rather than
   from the Hoosier page, and then binding the Hoosier product to it only if its real panel agrees.
6. `NOT YET APPROVED` — Decide whether `cream_powder` becomes a `CorrectionFamily`
   (`src/spine/productProfiles.ts:43-69`). **Independent of item 5 and lower priority:** this vocabulary
   governs only which family the optimiser may reach for as a *correction lever* (§2.2); a new Mapper
   profile is usable as an ingredient and as a substitution candidate without it. If it is added, apply the
   warning already recorded in `GLOBAL_BASE_PRODUCT_ARCHITECTURE_AUDIT.md`: pick a lever candidate by
   composition, not by family label, or a 72 % powder can be chosen as a lever and push the HARD fat gate.

**CODE**

7. `NOT YET APPROVED` — Rank substitute candidates by composition proximity instead of alphabetically
   (`src/features/ingredient-builder/recipeSubstitution.ts:160-163`), so that the 12-item slice cannot hide
   the closest match.
8. `NOT YET APPROVED` — Show the material composition difference in the substitute dialog
   (`recipeSubstitution.ts:170-175`, rendered at `IngredientRow.tsx:264-265`), and name the failing metric
   in customer language when a substitution is refused (`applyPipeline.ts:8927-8932` computes `hard:fat`
   correctly but shows the customer only one generic Polish sentence). **This is a presentation gap, not an
   engine gap** — the number the user needs is already in the refusal payload.
9. `NOT YET APPROVED` — **The structural item, for the Engine owner.** Decide whether a real product may
   ever be computed from its **own** composition in a base recipe, instead of borrowing its matched
   reference's (`src/data/products/productEngineHandoff.ts:71-72`). Today only PAC/POD may be product-owned
   (`productEngineResolver.ts:71-88`) and only the TOPPING lane reads a product's own label
   (`catalogIngredient.ts:70`). Until this is decided, every local product is exactly as accurate as the
   reference row it is bound to, and "use your own product, Gellatti will recalculate" cannot be promised
   for a base ingredient. This is the single item that most changes what SHOP can honestly print.

**MIGRATION**

10. `NOT YET APPROVED` — The `country_local_products` insert (item 1) is a data change on the shared DB; it
   needs the normal admin write path (`gellatti_admin_has_permission_v1('FINANCE')`), not a schema
   migration. Item 5 **does** need a migration, and it touches a table the app cannot write.
11. `NOT YET APPROVED` — Sequence item 5 after PR #336
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
- **Allergen wording.** The page's **text** prints no allergen statement; a `CONTAINS MILK` line does appear
  on the one gallery image that fails §1.4.3, so it is not quotable as a verified declaration (§1.4.5).
  Milk is nonetheless present **by ingredient** (Cream, Nonfat Dry Milk), and that is certain.
  `GEL-CRP-500` in `shop_products` declares `allergens = 'milk'`. Any customer text must state milk on the
  basis of the ingredient list — it must not quote a formal allergen declaration sourced only from that
  image.
- **Pack size.** 1 lb = 454 g against `GEL-CRP-500`'s `pack_size_g = 500`. Protocol rule 9 says pack size
  never has to match, but the PDF must print the real pack (454 g), and the existing US dextrose row
  already records the same lesson ("Pack is 200 g, not the canonical 500 g: PDF quantities must reflect the
  real pack").
- **The app computes amounts from composition.** This is the decisive risk, and it is now sharper than the
  first version stated. `calculateRecipe` reads the sixteen composition fields the seam forwards
  (`src/data/ingredients/ingredientMapper.ts:31-48` → `src/engine/composition.ts`). A profile with guessed
  protein/lactose/water does not fail loudly — it produces a plausible recipe that is wrong. **And because a
  matched product borrows its reference's composition wholesale** (§4.2,
  `productEngineHandoff.ts:71-72`), a wrong *binding* is as damaging as a wrong *profile*: bind the 72 %
  powder to the 42 % row and the engine silently computes 42 % fat for a 72 % product.
- **Reading a stale checkout.** The first version of this file was written against a 2026-08-25 worktree
  1 373 commits behind `staging`, with an uncommitted CSV on disk, and four of its conclusions were wrong
  because of it (§0). **Any statement about what the app does or does not have must name the SHA it was
  read at.** This version: `origin/staging` `b0455b24e8de3522c351ac363f56ef6d5baa6129`, live DB
  `tunabqqrwabacxjcxxkz`, both on 2026-09-17.
- **Genuine branch/DB skew that remains.** `country_local_products` exists in the shared DB with 4 rows but
  has **no migration and no reader on `staging`** — its code is on `claude/global-country-readiness`.
  `shop_country_components`, `product_add_requests` and the Starter Pack rescue palette, which the first
  version reported as absent, are all present on `staging`. The remaining lesson stands: check the SHA.

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
high-risk additive list — `public.live_overlay_high_risk_terms_v1()` at
`supabase/migrations/20260824150000_live_overlay_engine_identity.sql:44-51`, still exactly so on
`b0455b24` — so any local gum product is **excluded from the automatic Mapper binding route by name** and
always lands in review. Stabilizers are additionally refused outright as recipe substitution candidates:
`if (originalRole === 'stabilizer') return [];` at
`src/features/ingredient-builder/recipeSubstitution.ts:140`, whose comment gives the reason —
*"Mapper verification and a matching functional role do not provide an activity conversion contract"*
(`:137-139`). `buildSubstitutionPreview()` repeats the refusal for template-controlled stabilizers on both
sides of the swap (`applyPipeline.ts:8868-8873`, reason
`template_controlled_stabilizer_substitution_unsupported`).

The owner's v23 selection already shows the stabilizer slot as *a local alternative*, not as the Gellatti
product (`RESEARCH_PROTOCOL.md`, STB row). That framing should stay exactly as it is: a local tara gum is a
different ingredient that the Engine must be told about, never a relabelled Gellatti Stabilizer.

---

## 7. What I could not determine

1. **The real nutrition panel for `HHF263`.** Protein, carbohydrate/sugars (lactose), salt,
   moisture/total solids, saturated fat and energy are unknown. The page's text publishes no panel; the
   gallery does contain one, and it was read in full (§1.4.1), but it is tied to no variant and fails seven
   internal-consistency checks, so nothing from it may be used (§1.4.2–§1.4.4). The manufacturer publishes
   no spec or technical sheet for this SKU on any of its own surfaces (§1.5). Settling this needs either a
   genuine photograph of the 1 lb jar's own panel or a manufacturer spec sheet (the latter would be
   outbound contact, not requested here). *The first version of this file dismissed the photographs as
   needing "OCR, out of scope" — that was wrong; see §1.6.*
2. **Whether the 72 % figure is a specification or marketing copy.** Only the manufacturer can settle this.
3. **MSNF and lactose.** Not derivable. The declared nonfat dry milk makes any generic cream-powder
   estimate unsafe. MSNF is in any case dropped at the engine seam — `ingredientRowToEngineIngredient()`
   (`src/data/ingredients/ingredientMapper.ts:31-48`, verified on `b0455b24`) forwards sixteen composition
   fields but neither `non_fat_milk_solids_percent` nor `milk_fat_percent` — so it would be an audit value,
   not a computed one. **Lactose is not:** it is forwarded (`:42`) and consumed, so an unknown lactose is a
   real arithmetic hole, not a display one.
4. **`pod_value` / `pac_value` for a high-fat cream powder.** Team-calibrated by design
   (`src/data/products/referenceProposals.ts`); not sourceable from any page. Note that a product may carry
   its own PAC/POD if it has **both** (`productEngineResolver.ts:71-88`) — this is the only composition-side
   number a real product is allowed to own today.
5. ~~**The `product_add_requests` channel.**~~ **RESOLVED.** The lane is on `staging` `b0455b24`:
   `public.product_add_requests` (`supabase/migrations/20260826120000_admin_partner_controlled_catalog.sql:118`,
   186 live rows), approved by `approveProductRequest()` (`src/services/adminControl.ts:210`) through the
   `catalog-submit` Edge Function with `provenance: 'product_add_request_admin_v1'`. It carries the
   product's own label panel. **It is not a better fit than `country_local_products` for this product**,
   because neither lane can give the product its own engine composition (§4.2) — and this one additionally
   requires a complete `energyKcal/fat/carbohydrate/protein/salt` panel, which this page does not print.
   The first version reported this channel as absent; that was a stale-checkout artefact (§0).
6. **Whether a product will ever be computed from its own composition in a base recipe.** Not a research
   question — an owner/Engine decision, and the one that decides whether a local 72 % powder can ever be
   used as itself. See §6.2 item 9.
7. **Whether the owner's "row 309" means the review workbook or the v23 source workbook.** Row 309 of sheet
   `01_DO_DECYZJI` in
   `reports/shop_starter_local/review/GELLATTI_STARTER_PACK_LOKALNE_ODPOWIEDNIKI_REVIEW.xlsx` matches the
   description exactly (US, Hoosier Hill Farm, GTIN 850054854513, "ten sam rodzaj, inny skład"), so that is
   what this evaluation assumed. The v23 source workbook
   (`~/Developer/gellatti-source-data`, 89 sheets) was not opened.
8. **Whether the 75 % Ingredients Bar candidate (rows 76/146/224/301) is a better technical donor.** It
   publishes a full per-100 g panel, but its evidence class is LEAD, and confirming it is the other
   workstream's job, not this evaluation's.
