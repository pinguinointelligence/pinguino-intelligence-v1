# Recipe Library Batch 1 — required products and readiness gates

Date: 2026-08-15

Scope: Batch 1 only. No Batch 2, Cocktails or Fantasy 50 work is included.

## Egg-yolk powder Owner decision

`Śmietankowe na żółtkach` requires a versioned PINGÜINO Starter Pack egg-yolk powder. Fresh yolk `PI-ING-001646` is not an allowed fallback and is absent from the executable template.

The immutable Mapper contains `PI-ING-001645` (`EGGS CHICKEN YOLK DRIED · Egg`) with verified generic Engine composition: water 6.056%, dry matter 93.944%, fat 56.5%, protein 34.5%, carbohydrate 2.5%, sugars 0%, salt 0.44375%, POD 0 and PAC 2.596. This is not enough to identify or formulate the required Starter Pack product. The current authority has no manufacturer or product version, EAN/SKU, dosage, reconstitution ratio, fresh-yolk equivalence, product-specific process/temperature evidence, package size or price. Process metadata is explicitly `UNKNOWN / PROCESS_DATA_INSUFFICIENT`.

Therefore no powder dose or water reconciliation is calculated, no generic Mapper row is presented as the Starter Pack product, and no replacement Engine result is claimed. Poland alone remains `BLOCKED_EXACT_PRODUCT_DATA` pending the priority-1 intake below.

## Required new products

Exact machine-readable fields and blockers are in `reports/RECIPE_LIBRARY_REQUIRED_PRODUCTS.csv`. Blank/unknown values are never replaced with estimates.

| Priority | Required product | Exact form | Recipes | Scope | Responsible party | Status | Exact blocker |
|---:|---|---|---|---|---|---|---|
| 1 | Egg-yolk powder — PINGÜINO Starter Pack | Versioned dried egg-yolk powder, not fresh yolk or a generic Mapper reference | Śmietankowe na żółtkach | Base | PINGÜINO creates internal Starter Pack product | `PRIORITY_1_EXTERNAL_BLOCKER` | No exact product version, dose, reconstitution/fresh-yolk equivalence, process, package or price |
| 2 | Neutral light wafer crumble | Neutral dry light/thin crumble for post-process use | Rocero, Raphaello, Kidi Bueno | Topping | PINGÜINO internal subproduct | `DATA_REQUIRED_CONSOLIDATION_UNDECIDED` | One shared composition/process/allergen/texture contract is not yet proven |
| 3 | Roasted hazelnut pieces | Roasted pieces with controlled size | Rocero, Kidi Bueno | Topping | Owner uploads exact retailer/supplier product | `PRODUCT_DATA_REQUIRED` | No exact versioned product, label, process or dose authority |
| 4 | Milk-chocolate coating/ripple | Versioned post-process coating/ripple; Knickers pieces only if proven compatible | Rocero, Kidi Bueno; Knickers conditionally | Topping | Internal product or exact Owner upload | `DATA_REQUIRED_CONSOLIDATION_UNDECIDED` | `PI-ING-000118` does not prove post-process scope or cross-recipe form equivalence |
| 5 | Roasted almond pieces | Roasted pieces with controlled size | Raphaello | Topping | Owner uploads exact retailer/supplier product | `PRODUCT_DATA_REQUIRED` | No exact versioned product, label, process or dose authority |
| 6 | Dark cocoa-cookie crumble | Versioned dark cocoa-cookie internal crumble | Oreyo | Topping | PINGÜINO internal subproduct | `PRODUCT_DATA_REQUIRED` | No complete composition, allergens, process or cost |
| 7 | Vanilla-cream ripple | Versioned post-process ripple/variegate | Oreyo | Topping | PINGÜINO internal subproduct | `PRODUCT_DATA_REQUIRED` | No complete composition, allergens, process or cost |
| 8 | Roasted peanut pieces | Roasted pieces with controlled size | Knickers | Topping | Owner uploads exact retailer/supplier product | `PRODUCT_DATA_REQUIRED` | No exact versioned product, label, process or dose authority |
| 9 | Milk-chocolate pieces/coating for Knickers | Separate post-process pieces/coating if item 4 cannot truthfully cover this form | Knickers | Topping | Internal product or exact Owner upload | `CONDITIONAL_PENDING_CONSOLIDATION` | Item 4 equivalence is unproven; this row remains explicit until one-product vs two-product evidence is complete |

The intake for every row requires the exact composition, allergen, process, price and dose fields listed in the CSV. The manifest asks for evidence, not guessed numbers.

## Consolidation decisions

- Wafer: one internal product is only a candidate. It may cover Rocero, Raphaello and Kidi Bueno only after the same composition, process, allergen statement and light/thin/neutral texture are proven for all three. No subproduct is created now.
- Milk chocolate: item 4 may cover Knickers only if its exact version is truthful as coating/ripple/pieces with the same composition, process, allergens and texture. Item 9 is retained as a separate conditional requirement while that equivalence is unresolved; it becomes required if item 4 cannot cover Knickers. Never silently reuse `PI-ING-000118`.

## Existing canonical products needing data completion

These identities already exist in the immutable Mapper. The Owner must not upload duplicates; only the listed missing authority must be completed. The machine-readable table is `reports/RECIPE_LIBRARY_EXISTING_PRODUCTS_NEEDING_DATA.csv`.

| Canonical ID | Product | Existing | Missing fields | Affected recipes |
|---|---|---|---|---|
| `PI-ING-001579` | DEFATTED COCOA 12% · Cocoa Powder | Yes — canonical Mapper identity | Price; exact manufacturer/label evidence; saturated-fat label value if declared; profile Main ProductBehavior policy | Rocero, Oreyo |
| `PI-ING-001512` | FROM ROASTED UNBLANCHED ALMONDS · Ruda Kita Paste · 100% Nut | Yes — canonical Mapper identity | Price; dosage/scope; saturated-fat label value if declared; product-specific process; form/concentration evidence; Main ProductBehavior; exact label/manufacturer evidence | Raphaello |
| `PI-ING-001705` | VANILLE · Leagel Paste · 315305 | Yes — canonical Mapper identity | Price; dosage/scope; saturated-fat label value if declared; product-specific process; form/concentration evidence; Main ProductBehavior; exact label/manufacturer evidence | Oreyo |
| `PI-ING-000419` | HAZELNUT · Pi-NUTS Paste · Dry · 100% Nut | Yes — canonical Mapper identity | Product-specific process; form/concentration evidence; Main ProductBehavior; exact allergen/manufacturer process evidence | Rocero, Kidi Bueno |
| `PI-ING-000151` | COCONUT · Pi-NUTS Paste · Dry · 100% | Yes — canonical Mapper identity | Dosage/scope; product-specific process; form/concentration evidence; Main ProductBehavior; exact allergen/label evidence | Raphaello |
| `PI-ING-000437` | PEANUT BUTTER · Pi-NUTS Paste · Dry · 100% Nut | Yes — canonical Mapper identity | Product-specific process; form/concentration evidence; Main ProductBehavior; exact allergen/label evidence | Knickers |
| `PI-ING-000118` | MILK CHOCOLATE 33% · Pi-NUTS Chocolate · Dry | Yes — canonical Mapper identity | Dose/scope; post-process coating/ripple/pieces ProductBehavior; application process; exact label/manufacturer evidence | Rocero, Kidi Bueno, Knickers |
| `PI-ING-000142` | WHITE CHOCOLATE 30% · Pi-NUTS Chocolate · Dry | Yes — canonical Mapper identity | Dosage/scope; form/concentration evidence; Main ProductBehavior; exact label/manufacturer evidence | Raphaello, Kidi Bueno |
| `PI-ING-000308` | CARAMEL · Fabbri Paste · 07062014 | Yes — canonical Mapper identity | Family/form evidence; Main ProductBehavior; product-specific process; exact allergen/label evidence | Knickers |
| `PI-ING-000146` | COCONUT FLAKES · Coconut · Dry | Yes — canonical Mapper identity | Dosage; post-process scope; form/concentration ProductBehavior; product-specific process; exact allergen/label evidence | Raphaello |
| `PI-ING-000309` | CREMA AMORETTA SALTED BUTTER · Aromitalia Rippling Sauce · 3353 | Yes — canonical Mapper identity | Form/concentration ProductBehavior; exact versioned post-process scope; exact manufacturer label/process evidence | Knickers |

## Owner Review / Production / Label gate table

| Recipe | Owner Review | Production | Label | Runtime boundary |
|---|---|---|---|---|
| Śmietankowe na żółtkach | `BLOCKED_EXACT_PRODUCT_DATA` | `PRODUCTION_BLOCKED` | `LABEL_BLOCKED` | Cannot open until the powder product and exact 1000 g conversion exist |
| Rocero | `OWNER_REVIEW_EDITABLE` | `PRODUCTION_BLOCKED` | `LABEL_BLOCKED` | Exact zero-violation Base can open; unresolved Toppings are visibly omitted; ProductBehavior/Main blockers remain authoritative for PI/Apply |
| Raphaello | `OWNER_REVIEW_EDITABLE` | `PRODUCTION_BLOCKED` | `LABEL_BLOCKED` | Exact zero-violation Base can open; unresolved Toppings are visibly omitted; ProductBehavior/Main blockers remain authoritative for PI/Apply |
| Kidi Bueno | `OWNER_REVIEW_EDITABLE` | `PRODUCTION_BLOCKED` | `LABEL_BLOCKED` | Exact zero-violation Base can open; unresolved Toppings are visibly omitted; ProductBehavior/Main blockers remain authoritative for PI/Apply |
| Oreyo | `OWNER_REVIEW_EDITABLE` | `PRODUCTION_BLOCKED` | `LABEL_BLOCKED` | Exact zero-violation Base can open; unresolved Toppings are visibly omitted; ProductBehavior/Main blockers remain authoritative for PI/Apply |
| Knickers | `OWNER_REVIEW_EDITABLE` | `PRODUCTION_BLOCKED` | `LABEL_BLOCKED` | Exact zero-violation Base can open; unresolved Toppings are visibly omitted; ProductBehavior/Main blockers remain authoritative for PI/Apply |

`OWNER_REVIEW_EDITABLE` is not a Production or Label bypass. The handoff resolves only exact verified Base identities, never elevates the resolver's module eligibility, retains all original block reasons, and runs the unmodified Engine. It adds a restrictive `owner_review_production_label_gate` overlay for Production, Process, Label, Master Label and Export because Toppings/final legal authority are deliberately omitted. It does not forge an eligible Main policy, ProductBehavior, process, allergen fact or Topping. A behavior-blocked Base may be opened for inspection/editing but PI/Preview/Apply must continue to return the exact fail-closed terminal reason until its behavior authority is complete.

## Recipes still blocked

- External Owner Review block: Śmietankowe na żółtkach — exact Starter Pack egg-yolk powder and technically correct 1000 g conversion.
- Production/Label blocks: all six — exact product/process/behavior/Topping/legal evidence listed above.
- No Batch 2 recipe was started.

## Immutability proof boundary

This audit reads `docs/ingredients/validation/mapper_basement.csv`, `reports/MAPPER_2088_PRODUCT_BEHAVIOR_AUDIT.csv` and current registry code. It changes no Mapper Basement row, seed or migration.
