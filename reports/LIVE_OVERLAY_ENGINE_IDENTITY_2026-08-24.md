# Live Overlay engine identity — the last hop from a scan to a recipe

**Branch** `claude/scanner-live-capture` → `origin/staging` · 2026-08-24
**Owner decision:** do NOT put EANs on the 2088 Mapper rows to make Scanner → Recipe work.
Implement the last hop through the existing Product Intelligence / Catalog / Live Overlay
authority. **Production `main` untouched.**

---

## 1. Where the wall actually was

A scanned product was saved to the catalogue correctly and then had nowhere to go. The
chain is:

```
recipe line  ←  BASE_RECIPE eligibility  ←  product_behavior_bindings.mapper_ingredient_id
```

and that identity could be written by exactly one thing: an **administrator** decision
inside `ingest_product_v1`, requiring a verification signoff or declared independent
provenance. Nothing else in the system ever wrote it. Measured on staging: **all 16
commercial products had `mapper_ingredient_id = null`**, so neither the Scanner nor
INTIMPORT could produce a recipe-usable product — the wall was never scanner-specific.

Two more things were in the way, both found by running the real authority rather than
reading it:

- **The picker admitted only Mapper Basement rows.** `currentMapperCatalogId` rejected
  anything whose `entityKind` was not `pi_base`, so even an authorized catalogue product
  would never have appeared.
- **`verification_status = 'verified'` matches ZERO of 2088 Mapper rows.** The dataset's
  v1.0 vocabulary is `Verified`, `Verified / Basis Check Needed`, `Verified / PI Calculated`,
  `Verified / Public Label` — capitalised families, exactly as `ingredientRowToEngineIngredient`
  already treats them. Any predicate written as lowercase `'verified'` can never be
  satisfied. See §6.

---

## 2. What was built

### Findable and selectable are two different questions
A parallel change (`7b74792`) opened the picker's SEARCH to imported products, because
817 of them were invisible. This change answers the other half: which of them may become
a recipe line. They compose — an imported product is now findable, and one without an
authorized Mapper identity renders as not selectable with the reason that is actually
true: *„jest w katalogu produktów, ale nie ma jeszcze przypisanej tożsamości Mapper"*.

### The picker resolves, it no longer requires
`currentMapperCatalogId` now admits a catalogue product that **resolves** to a current
Mapper identity, alongside the Mapper rows themselves. The physics are untouched:
`engineIngredientForCatalogSelection` builds the recipe line from the Mapper row —
composition, POD/PAC, category, flags — and changes only the NAME, so the owner sees the
product they scanned rather than the generic ingredient behind it. Identity for
deduplication stays the Mapper id. Both catalogue entries stand side by side; neither
hides the other.

The fail-closed boundary is unchanged and now does real work: `getEngineApprovedIngredientById`
must return the exact current row, and `resolve_product_behavior_v1` re-checks the whole
chain server-side before the line is accepted.

### `propose_live_overlay_mapper_identity_v1(product_version_id)` — read-only
Deterministic, writes nothing, inspectable before it is acted on. It returns
`PROPOSE` / `REVIEW` / `BLOCKED` for the exact product version:

- **BLOCKED** — high-risk additive (the same vocabulary the Scanner's validator uses:
  aspartame, acesulfame, sucralose, carrageenan, tara/guar gum, polysorbate, enzymes,
  E407/E410/E412/E433/E471), a technical/dosage-declaring product, alcohol, a blocked
  product, or anything that is not an ordinary commercial product.
- **REVIEW** — an incomplete label (ingredients, allergens, nutrition per 100 g, five
  declared macros), no agreeing Mapper row, or **more than one** agreeing row.
- **PROPOSE** — exactly one active, base-approved, engine-approved, `Verified*` Mapper row
  whose own composition agrees with the declared label within published tolerances
  (fat/carbohydrate/protein ±1.5 g, sugars ±2.0 g, salt ±0.2 g, energy ±20 kcal).

Agreement is a **comparison**, never an estimate. No physics are inferred anywhere.

### `authorize_live_overlay_mapper_identity_v1(actor, product_id)` — service-role only
Takes a product id and nothing else — no client-supplied candidate, no client-supplied
evidence. It re-runs the proposal, re-checks Engine eligibility, then writes a versioned
provisional binding carrying the identity and hands over to the ordinary classifier
(`classify_catalog_product_behavior_v2`). If the classifier refuses, the whole
authorization rolls back with it. An identity somebody already decided is never
overwritten.

### One authority, both doors
`product-scan-finalize` and `catalog-submit` call the same shared helper immediately after
a successful ingest. A refused identity never rolls back the product that was just saved —
it simply waits for a human, as before.

---

## 3. Calibration, measured on the real dataset

| | rows |
|---|---|
| Mapper rows | 2088 |
| active + base + engines + `Verified*` + full macros, no alcohol | **1602** |
| uniquely identifiable by agreement **within category** | **772 (48 %)** |
| uniquely identifiable by agreement **across all categories** | 593 (37 %) |
| ambiguous → REVIEW | the rest |

A category is used as a filter when the Mapper taxonomy recognises the word the package
uses, and otherwise the agreement has to be unique across the whole eligible set — the
stricter of the two paths. About half of ordinary products resolve automatically; the
rest are refused rather than guessed.

---

## 4. Served proofs (staging, live authority, every write rolled back)

**B — safe new ordinary product → usable, without Mapper mutation**
A ŚMIETANKA 30 % label (292 kcal · 30 g fat · 3.2 g carb · 3.2 g sugars · 2.3 g protein ·
0.08 g salt):

```
propose = PROPOSE : PI-ING-000180  (CREAM 30% · Mlekovita)
auth    = true    : PI-ING-000180
state   = eligible   BASE_RECIPE = eligible   OPTIMAL = eligible   ECO = eligible
blockReasons = []
sharedFacts.technicalComposition = fat 30 · pac 3.668 · pod 0.512   ← the Mapper row's
bindings: [seeded cur=f map=-] [classified cur=t map=PI-ING-000180 base=true] [provisional cur=f]
```

**C — high-risk product → NOT usable automatically**
The same product plus `aspartame, karagen` in the ingredients:

```
authorized = false   reason = blocked   mapper = -   no eligibility granted
```

**D — Scanner and INTIMPORT reach identical capability**
Two products identical but for `canonical_provenance`:

```
D-scanner   : authorized=true mapper=PI-ING-000180 BASE=eligible OPTIMAL=eligible pac=3.668
D-intimport : authorized=true mapper=PI-ING-000180 BASE=eligible OPTIMAL=eligible pac=3.668
```

**A — a scanned product already backed by a Mapper identity is usable in the picker**
Covered by `scannedProductToRecipe.test.ts` and `mapperOnlyCatalog.test.ts` against the
real selection boundary, plus the served existing-product path in the scanner close-out.

**Real products, real refusals.** Every commercial product on staging today answers
honestly: the eight Fabbri neutro/stabilizer imports → `REVIEW: ingredients_missing,
allergens_missing, nutrition_per_100g_missing`; the two scanner-created products with
complete labels (Cacao Puro, Owner Biscuit Topping) → `REVIEW: no_agreeing_mapper_identity`.
Nothing was auto-identified that should not have been.

---

## 5. What is NOT done, and why

- **The live E2E through the served Scanner could not complete today.** The save of the
  ŚMIETANKA scan was refused by the shared ingest rate limiter —
  `preflight_product_ingest_v1` → `reason: 'daily'`, `retryAt 2026-08-25T07:35Z` — because
  this account ran an 822-row INTIMPORT at 11:16–11:46 the same morning. That is the
  limiter doing its job, not a defect, and I did not raise or bypass it. The scan itself
  reached „Analiza kompletna" from a single frame (name, brand, 500 ml, 292 kcal, EAN),
  and the authority chain behind the save is proved above against the live functions.
- **No Mapper mutation, no per-SKU SQL, no scanner bypass, no arbitrary scanned JSON
  reaching a recipe.** The Engine's composition is always the Mapper row's.
- **PRODUCTION / PROCESS still require a Mapper identity** — unchanged shared rule. A
  product that gets its identity this way satisfies it; one that does not, does not.

---

## 6. Finding for the owner: a predicate that can never match

`verification_status = 'verified'` (lowercase, exact) appears in
`ingest_product_v1`, `authorize_global_catalog_engine_mapping`, `search_global_catalog`,
`publish_product_scan_overlay_v1` and both `submit_owned_product_to_global_catalog*`.
**It matches 0 of 2088 rows** — the dataset uses the `Verified*` families. The live
`classify_catalog_product_behavior_v2` no longer carries it (a later migration relaxed
that lookup to `m.is_active`), which is why the chain works at all.

The new functions use `ilike 'Verified%'`, the documented v1.0 vocabulary. **I did not
change the other five**, because they gate publication and administrator mapping, and
widening them is an owner decision rather than a drift fix. They are, as written today,
unsatisfiable.
