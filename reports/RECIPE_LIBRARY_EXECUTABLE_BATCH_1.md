# Recipe Library — Executable Batch 1

Date: 2026-08-15

Profile: `milk_gelato`

Serving mode: −11°C

Strategy: OPTIMAL

Publication: Owner Review / testowe / nieprodukcyjne

## Strict result

All six Base vectors are exact, whole-gram, 1000 g and produce zero current native Engine violations. None is currently eligible to open as an executable Owner Review template because exact ProductBehavior Main/process evidence or mandatory Topping product data is missing. The registry therefore publishes no false process, no fake product identity and no customer-visible Owner reference.

| Recipe | Pro route | Status | Base g | Topping g | Final g | Technical | Overall | Cost/kg | Process | Template ID |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|
| Śmietankowe na żółtkach | ROUTE_ONLY_PASS / EXECUTION_BLOCKED | BLOCKED_EXACT_PRODUCT_DATA | 1000 | 0 | 1000 | 97.5000 | 84.6667 | incomplete | not published | `lost-pl-smietankowe-z-zoltkami-v1` |
| Rocero | ROUTE_ONLY_PASS / EXECUTION_BLOCKED | BLOCKED_EXACT_PRODUCT_DATA | 1000 | 100 | 1100 | 89.1667 | 83.3022 | incomplete | not published | `fantasy-rocero-v1` |
| Raphaello | ROUTE_ONLY_PASS / EXECUTION_BLOCKED | BLOCKED_EXACT_PRODUCT_DATA | 1000 | 100 | 1100 | 89.1667 | 83.9556 | incomplete | not published | `fantasy-raphaello-v1` |
| Kidi Bueno | ROUTE_ONLY_PASS / EXECUTION_BLOCKED | BLOCKED_EXACT_PRODUCT_DATA | 1000 | 90 | 1090 | 89.1667 | 83.2980 | €3.6696 Base | not published | `fantasy-kidi-bueno-v1` |
| Oreyo | ROUTE_ONLY_PASS / EXECUTION_BLOCKED | BLOCKED_EXACT_PRODUCT_DATA | 1000 | 100 | 1100 | 97.5000 | 84.6667 | incomplete | not published | `fantasy-oreyo-v1` |
| Knickers | ROUTE_ONLY_PASS / EXECUTION_BLOCKED | BLOCKED_EXACT_PRODUCT_DATA | 1000 | 120 | 1120 | 88.3333 | 84.6990 | €3.5903 Base | not published | `fantasy-knickers-v1` |

Costs above are Base-only Engine truth. Final cost/nutrition/label is incomplete whenever a required Topping product is unresolved.

Provenance for every Base result: Owner seed in the 2026-08-15 Batch 1 authorization; immutable Mapper validation file `docs/ingredients/validation/mapper_basement.csv`; Engine `0.4.0`; configuration `0.7.0`; profile `milk_gelato`; −11°C; whole-gram recalculation. Current ProductBehavior bindings and process metadata remain authoritative for execution and are the reason these technically coherent vectors stay fail-closed.

## Exact vectors and Engine truth

### Śmietankowe na żółtkach

Owner-only research reference: Polish traditional cream-and-yolk ice cream.

| Canonical ID | Ingredient | Owner seed g | Final g | Change |
|---|---|---:|---:|---|
| PI-ING-000236 | Milk 3.5% | 550 | 555 | +5; mass reconciliation |
| PI-ING-000180 | Cream 30% | 180 | 180 | — |
| PI-ING-001646 | Fresh egg yolk | 80 | 80 | — |
| PI-ING-000270 | Skimmed milk powder | 35 | 30 | −5; smallest Engine correction |
| PI-ING-000514 | Sucrose | 90 | 90 | — |
| PI-ING-000494 | Dextrose | 50 | 50 | — |
| PI-ING-000456 | Inulin | 13 | 13 | — |
| PI-ING-000492 | Tara gum | 2 | 2 | — |

POD 13.4483; PAC 23.2260; NPAC 35.2638; ice 52.1105%; water 65.8637%; solids 34.1363%; fat 9.5275%; protein 4.4340%; lactose 4.7145%; dairy carrier 76.5%. Known allergens: milk, egg. Cost incomplete: PI-ING-001646. Blocker: the current process authority has no exact versioned fresh-yolk heat process; no process ID is claimed.

### Rocero

Owner-only research reference: Ferrero Rocher sensory direction.

Base: PI-ING-000236 573 g; PI-ING-000180 80 g; PI-ING-000270 29 g; PI-ING-000514 64 g; PI-ING-000494 40 g; PI-ING-000456 50 g; PI-ING-000419 hazelnut paste 83 g; PI-ING-000118 milk chocolate 74 g; PI-ING-001579 defatted cocoa 12% 5 g; PI-ING-000492 2 g. Total 1000 g.

Required Topping: own wafer crumble 45 g; roasted hazelnut pieces 25 g; milk-chocolate coating/ripple 30 g. These three forms are unresolved and deliberately have no substitute canonical ID.

POD 14.3335; PAC 23.4203; NPAC 41.0849; ice 45.9659%; water 57.0045%; solids 42.9955%; fat 11.6519%; protein 4.7143%; lactose 5.0793%; dairy carrier 68.2%. Known Base allergens: milk, soy, hazelnut. Cost incomplete: PI-ING-001579. Blockers: hazelnut Main policy/process, milk-chocolate scope, all three exact Topping forms.

Seed deltas: milk 533→573 (+40, mass/water reconciliation); SMP 30→29 (−1), sucrose 70→64 (−6), dextrose 45→40 (−5), hazelnut paste 100→83 (−17), milk chocolate 80→74 (−6), cocoa 10→5 (−5). The combined 40 g redistribution is the smallest found whole-gram correction that closes the water/NPAC gates while retaining hazelnut ≥80 g and all signature ingredients.

### Raphaello

Owner-only research reference: Raffaello sensory direction.

Base: PI-ING-000236 574 g; PI-ING-000180 90 g; PI-ING-000270 25 g; PI-ING-000514 80 g; PI-ING-000494 44 g; PI-ING-000456 45 g; PI-ING-000151 coconut paste 60 g; PI-ING-001512 almond paste 30 g; PI-ING-000142 white chocolate 50 g; PI-ING-000492 2 g. Total 1000 g.

Topping: PI-ING-000146 coconut flakes 50 g; unresolved own light wafer crumble 30 g; unresolved roasted almond pieces 20 g. Total 100 g.

Resolved Topping truth — PI-ING-000146: €5/kg EUR; per 100 g: 651 kcal, water 24.61 g, solids 75.39 g, fat 61 g, protein 7.9 g, carbohydrate 7.3 g, sugars 6.7 g, salt 0.09 g; no declared allergens in the current Mapper row. Process remains `UNKNOWN / PROCESS_DATA_INSUFFICIENT`, so this line is not production-ready despite known composition and price.

POD 15.1647; PAC 24.1545; NPAC 41.9275; ice 45.0765%; water 57.6101%; solids 42.3899%; fat 11.9770%; protein 4.0765%; lactose 4.5108%; dairy carrier 68.9%. Known allergens: milk, soy, almond; final list incomplete. Cost incomplete: PI-ING-001512. Blockers: coconut/almond Main policies and processes; exact wafer and roasted-almond Toppings.

Seed deltas: milk 520→574 (+54); cream 100→90 (−10); dextrose 45→44 (−1); coconut 70→60 (−10); almond paste 40→30 (−10); white chocolate 73→50 (−23). The 54 g correction preserves cream at 90 g and every signature ingredient; smaller candidate corrections retained an NPAC/ice violation.

### Kidi Bueno

Owner-only research reference: Kinder Bueno sensory direction.

Base: PI-ING-000236 559 g; PI-ING-000180 100 g; PI-ING-000270 30 g; PI-ING-000514 75 g; PI-ING-000494 36 g; PI-ING-000456 45 g; PI-ING-000419 hazelnut paste 79 g; PI-ING-000118 milk chocolate 58 g; PI-ING-000142 white chocolate 16 g; PI-ING-000492 2 g. Total 1000 g.

Required Topping: own thin wafer crumble 50 g; roasted hazelnut pieces 20 g; milk-chocolate coating/ripple 20 g. All three are unresolved rather than substituted.

POD 15.1278; PAC 23.7972; NPAC 41.7450; ice 45.2692%; water 57.0061%; solids 42.9939%; fat 11.9855%; protein 4.5820%; lactose 5.0677%; dairy carrier 68.9%; Base cost €3.6696/kg. Known allergens: milk, soy, hazelnut; final list incomplete. Blockers: hazelnut Main/process and exact Toppings.

Seed deltas: milk 540→559 (+19); dextrose 45→36 (−9); hazelnut paste 80→79 (−1); milk chocolate 60→58 (−2); white chocolate 23→16 (−7). Nineteen grams is the smallest whole-gram redistribution found; an 18 g correction leaves the combined water/NPAC gate unresolved.

### Oreyo

Owner-only research reference: Oreo sensory direction.

Base: PI-ING-000236 622 g; PI-ING-000180 120 g; PI-ING-000270 30 g; PI-ING-000514 85 g; PI-ING-000494 45 g; PI-ING-000456 50 g; PI-ING-001579 defatted cocoa 12% 40 g; PI-ING-001705 vanilla paste 5 g; PI-ING-000458 salt 1 g; PI-ING-000492 2 g. Total 1000 g.

Required Topping: own dark cocoa-cookie crumble 70 g; own vanilla-cream ripple 30 g. Both internal subproducts are absent and have no fake IDs.

POD 13.1321; PAC 23.2910; NPAC 36.4530; ice 50.8552%; water 63.8934%; solids 36.1066%; fat 6.2425%; protein 4.1775%; lactose 4.8374%; dairy carrier 77.2%. Known Base allergen: milk; final list incomplete. Cost incomplete: PI-ING-001579 and PI-ING-001705. Blockers: cocoa/vanilla Main/process and both internal Topping subproducts.

Seed deltas: milk 623→622 (−1); salt 0→1 (+1). This is the smallest whole-gram addition that preserves exact 1000 g and makes the required slight-salt identity explicit; every other Owner-seed line is unchanged.

### Knickers

Owner-only research reference: Snickers sensory direction.

Base: PI-ING-000236 541 g; PI-ING-000180 90 g; PI-ING-000270 25 g; PI-ING-000514 58 g; PI-ING-000456 45 g; PI-ING-000437 peanut paste 100 g; PI-ING-000308 caramel 80 g; PI-ING-000118 milk chocolate 58 g; PI-ING-000458 salt 1 g; PI-ING-000492 2 g. Owner-seed dextrose PI-ING-000494 40 g is removed; the smallest valid correction shifts that mass principally to milk while retaining peanut, caramel and chocolate identity. Total 1000 g.

Topping: unresolved roasted peanut pieces 35 g; PI-ING-000309 caramel ripple 55 g; unresolved milk-chocolate coating/pieces 30 g. Total 120 g.

Resolved Topping truth — PI-ING-000309: €14/kg EUR; per 100 g: 517 kcal, water 13.168 g, solids 86.832 g, fat 35.1 g, protein 5.1 g, carbohydrate 46.2 g, sugars 40.8 g, lactose 10.8 g, fibre 0 g, salt 0.432 g; declared allergens: wheat/gluten, egg, soy and milk. Process audit says `COLD_PROCESS_OK / READY_TO_USE_VARIEGATO` for late addition, but Main/form evidence remains blocked and the other two exact Toppings are unresolved.

POD 13.6790; PAC 24.0872; NPAC 41.7732; ice 45.2394%; water 57.6619%; solids 42.3381%; fat 11.3589%; protein 5.4155%; lactose 4.6161%; dairy carrier 65.6%; Base cost €3.5903/kg. Known final allergens include milk, soy, peanut, wheat/gluten and egg; final list remains incomplete because two Toppings are unresolved. Blockers: peanut Main/process and exact roasted-peanut/chocolate Topping forms.

Seed deltas: milk 499→541 (+42); sucrose 60→58 (−2); dextrose 40→0 (−40, recorded as a removed Owner-seed line). Forty-one redistributed grams remained NPAC-infeasible; 42 g is the smallest whole-gram correction found while preserving peanut 100 g, caramel 80 g, milk chocolate 58 g and salt 1 g.

## Topping truth boundary

For every unresolved Topping line, cost, nutrition, complete allergen list, label statement and process are **unavailable**, not zero and not inferred. Those outputs may be created only after the exact internal/retailer product receives an immutable product version, ProductBehavior binding and post-process scope. Until then the final-product label and final-product cost are blocked even when the 1000 g Base has a complete cost.

## Publication and privacy

- All six remain `BLOCKED_EXACT_PRODUCT_DATA`, Owner Review, non-production.
- No branded reference is compiled into the customer app registry or card projection.
- Working names remain `TRADEMARK_REVIEW_REQUIRED` where applicable.
- Technical Engine validity does not imply sensory or process approval.
- No Base Engine formula and no Mapper row was changed.
