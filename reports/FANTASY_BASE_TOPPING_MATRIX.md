# Fantasy 50 — Base / Topping decision and mass gap matrix

**Audit date / source retrieval date:** 2026-08-15

**Scope:** all 50 Fantasy concepts in required priority order.
**Evidence companion:** [Fantasy 50 primary-source register](./FANTASY_50_RESEARCH_MATRIX.md#sources) contains the official manufacturer-source links, market scope, declared facts and source/concept mismatches used here; those sources were retrieved on 2026-08-15.

## Decision model

- **Base** is the frozen mixture and must carry the recognizable core concept without a topping. It participates in technical metrics.
- **Topping** is an optional, separately versioned `POST_PROCESS_ADDON`. It affects final mass, nutrition, cost and allergens but must not be counted in frozen-base technical metrics.
- A deleted topping must not make the base unrecognizable. Where deletion removes the defining “shell” format, that is called out as a concept risk.
- No approved Fantasy recipe/vector exists in the repository. Therefore every row has `Base g = BLOCKED`, `Topping g = BLOCKED`, and `Final g = BLOCKED`. Supplying numbers would invent a formula.
- All allergen entries are **provisional research flags**, derived from the cited reference architecture and the proposed concept. Final allergens must be recalculated from the exact canonical products, cross-contact declarations and market labels.
- Common process state for every row: base mix/pasteurisation/aging/freezing route is `TBD AND UNVALIDATED`; topping is separately prepared and added only at `POST_PROCESS_ADDON`, also `TBD AND UNVALIDATED`.
- Every row remains `RESEARCH · NIEZWERYFIKOWANE PRODUKCYJNIE · WYMAGA TESTU`.

## A. Najpopularniejsze

| # | Working name | What must be in Base | Optional Topping (`POST_PROCESS_ADDON`) | Why / result if topping is deleted | Base g | Topping g | Final mass | Provisional allergen flags | Process stage |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | ROCERO | Roasted hazelnut praline, milk chocolate, cocoa, milk cream | Own wafer-hazelnut crunch + thin chocolate-hazelnut ripple | Adds wafer/shell contrast; deletion loses praline crunch but base must still read hazelnut-chocolate. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, hazelnut/tree nut, wheat/gluten, soy possible | Base frozen TBD; topping post-process TBD |
| 2 | RAPHAELLO | Coconut, almond, milk, vanilla | Own coconut-wafer-almond crunch | Adds wafer and whole-nut contrast; deletion leaves coconut-almond-milk identity. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, almond/tree nut, wheat/gluten, soy possible | Base frozen TBD; topping post-process TBD |
| 3 | KIDI BUENO | Milk-hazelnut cream, milk chocolate, light cocoa | Own thin wafer-hazelnut crunch | Adds thin-wafer fracture; deletion leaves milk-hazelnut chocolate identity. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, hazelnut/tree nut, wheat/gluten, soy | Base frozen TBD; topping post-process TBD |
| 4 | GIOTINI | Roasted hazelnut praline, milk cream, wafer character | Own fine hazelnut-wafer pearls/crunch | Reinforces pearl/crisp format; deletion leaves roasted hazelnut cream but lowers wafer recognition. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, hazelnut/tree nut, wheat/gluten, soy possible | Base frozen TBD; topping post-process TBD |
| 5 | OREYO | Dark cocoa cookie, vanilla milk cream, slight salt | Own dark cocoa-cookie crumble | Supplies cookie texture; deletion leaves cocoa-cookie/vanilla flavour if base succeeds. | `BLOCKED` | `BLOCKED` | `BLOCKED` | wheat/gluten, milk, soy; vegan branch differs | Base frozen TBD; topping post-process TBD |
| 6 | KNICKERS | Peanut, caramel, nougat, milk chocolate, salt | Own salted peanut-caramel crunch | Adds peanut/caramel fracture; deletion leaves core bar architecture without crunch. | `BLOCKED` | `BLOCKED` | `BLOCKED` | peanut, milk, soy; egg/tree-nut/wheat possible by products | Base frozen TBD; topping post-process TBD |
| 7 | BAUNTY | Coconut cream and selected milk/dark chocolate profile | Own coconut-chocolate shell/chips | Adds coating snap and coconut texture; deletion leaves coconut-chocolate base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk and soy possible; coconut; vegan branch differs | Base frozen TBD; topping post-process TBD |
| 8 | TWIKS | Caramel, biscuit, milk chocolate | Own biscuit-caramel crunch/ripple | Adds cookie fracture and caramel pockets; deletion leaves caramel-biscuit-chocolate flavour. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, wheat/gluten, soy | Base frozen TBD; topping post-process TBD |
| 9 | KITIKAT | Milk chocolate, wafer/toasted-cereal character | Own thin chocolate-coated wafer crunch | Provides recognizable wafer snap; deletion leaves chocolate/toasted-wafer flavour, with reduced format recognition. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, wheat/gluten, soy | Base frozen TBD; topping post-process TBD |
| 10 | AFTER NINE | Dark chocolate and cool mint | Own thin dark shell + subtle mint layer | Adds thin-shell snap and mint pulse; deletion leaves dark chocolate-mint base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk and soy possible; branch-dependent | Base frozen TBD; topping post-process TBD |
| 11 | MALTEEZERS | Malted milk and milk chocolate | Own malt crisp pearls | Adds honeycomb/malt crisp contrast; deletion leaves malted milk-chocolate base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, barley/gluten, wheat possible, soy | Base frozen TBD; topping post-process TBD |
| 12 | TOBLERONI | Milk chocolate, honey, almond nougat | Own honey-almond nougat crunch | Adds characteristic nougat crunch; deletion leaves honey-almond milk-chocolate base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, almond/tree nut, soy, egg | Base frozen TBD; topping post-process TBD |

## B. Bary i dziecięce klasyki

| # | Working name | What must be in Base | Optional Topping (`POST_PROCESS_ADDON`) | Why / result if topping is deleted | Base g | Topping g | Final mass | Provisional allergen flags | Process stage |
|---:|---|---|---|---|---|---|---|---|---|
| 13 | NOCELLA | Hazelnut, cocoa, milk cream | Own roasted-hazelnut cocoa ribbon | Boosts roast and ripple contrast; deletion leaves hazelnut-cocoa cream identity. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, hazelnut/tree nut, soy possible | Base frozen TBD; topping post-process TBD |
| 14 | MILKI BAY | Light milk nougat, milk chocolate, vanilla | Own light chocolate shell | Adds coating snap; deletion leaves light nougat/milk-chocolate base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, soy; egg possible by nougat product | Base frozen TBD; topping post-process TBD |
| 15 | MARRS | Nougat, caramel, milk chocolate | Own caramel ribbon + chocolate crunch | Adds layered caramel pockets and bite; deletion leaves nougat-caramel-chocolate base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, soy; egg/wheat/tree nut possible by products | Base frozen TBD; topping post-process TBD |
| 16 | REESI’S | Peanut butter, chocolate, salt | Own peanut-chocolate crumble/cup element | Adds cup/crumble contrast; deletion leaves salty peanut-chocolate base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | peanut, milk, soy | Base frozen TBD; topping post-process TBD |
| 17 | MIMI’S | Milk chocolate, vanilla, candy-shell character | Own coloured sugar-chocolate crisp pieces; no original candy | Adds colour and crisp shell cue; deletion leaves chocolate/vanilla base and loses candy-shell format. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, soy; colours/additives need market review | Base frozen TBD; topping post-process TBD |
| 18 | DUPLINO | Milk chocolate, hazelnut, wafer | Own hazelnut-wafer crunch | Adds layered wafer texture; deletion leaves milk-chocolate hazelnut/wafer flavour. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, hazelnut/tree nut, wheat/gluten, soy | Base frozen TBD; topping post-process TBD |
| 19 | KNOPPINO | Milk cream, hazelnut, cocoa, wafer/cereal | Own layered wafer-cereal crunch | Supplies layered cereal texture; deletion leaves creamy hazelnut-cocoa wafer flavour. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, hazelnut/tree nut, wheat/gluten, soy | Base frozen TBD; topping post-process TBD |
| 20 | LYON | Caramel, milk chocolate, cereal crunch character | Own caramel cereal crisp | Adds pronounced cereal snap; deletion leaves caramel-chocolate cereal flavour. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, wheat/gluten, soy | Base frozen TBD; topping post-process TBD |
| 21 | KIDI CHOCO | Strong milk cream and milk chocolate | Own fine milk-chocolate flakes | Adds fine chocolate texture; deletion leaves dairy-forward milk-chocolate base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, soy possible | Base frozen TBD; topping post-process TBD |
| 22 | KIDI PINGU | Milk cream, cocoa, chocolate-coating character | Own cocoa-cake crumble + chocolate shell | Adds cake and coating layers; deletion leaves milk-cocoa-chocolate base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, wheat/gluten, soy, egg possible | Base frozen TBD; topping post-process TBD |
| 23 | KIDI COUNTRY | Milk cream, milk chocolate, toasted/puffed cereal character | Own puffed-cereal chocolate crunch | Adds characteristic cereal texture; deletion leaves cereal/milk-chocolate flavour. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, wheat/barley/gluten, soy | Base frozen TBD; topping post-process TBD |
| 24 | KIDI CARDS | Milk/cocoa cream and thin-wafer character; **hazelnut pending source/owner resolution** | Own thin wafer-card crunch | Adds thin-card snap; deletion leaves milk/cocoa wafer base. Hazelnut cannot be treated as sourced yet. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, wheat/gluten, soy; hazelnut only if approved | Base frozen TBD; topping post-process TBD |
| 25 | KIDI BONS | Milk-hazelnut chocolate | Own hazelnut–milk-chocolate pearls | Adds pearl/bite contrast; deletion leaves milk-hazelnut chocolate base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, hazelnut/tree nut, soy | Base frozen TBD; topping post-process TBD |

## C. Premium / Praliny

| # | Working name | What must be in Base | Optional Topping (`POST_PROCESS_ADDON`) | Why / result if topping is deleted | Base g | Topping g | Final mass | Provisional allergen flags | Process stage |
|---:|---|---|---|---|---|---|---|---|---|
| 26 | MILCANA | Soft milk chocolate and strong dairy creaminess | Own milk-chocolate flakes/ribbon | Adds chocolate concentration/texture; deletion leaves dairy-rich milk-chocolate base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, soy possible | Base frozen TBD; topping post-process TBD |
| 27 | LINDORO | Smooth chocolate-truffle character and cocoa-butter richness | Own soft chocolate-truffle ripple | Adds soft molten contrast; deletion leaves smooth rich chocolate base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, soy; tree-nut cross-contact product-dependent | Base frozen TBD; topping post-process TBD |
| 28 | RITTERA | Locked v1: whole-hazelnut milk-chocolate character | Own roasted-hazelnut chocolate crunch | Adds whole-nut texture; deletion leaves hazelnut milk-chocolate base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, hazelnut/tree nut, soy | Base frozen TBD; topping post-process TBD |
| 29 | GALAXIA | Silky milk chocolate; caramelised-dairy note only after evidence | Own soft chocolate ribbon | Adds flowing chocolate contrast; deletion leaves silky milk-chocolate base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, soy possible | Base frozen TBD; topping post-process TBD |
| 30 | CADBERRI | Creamy milk chocolate; caramelised-milk note only after evidence | Own fudge/chocolate pieces | Adds chewy/solid contrast; deletion leaves creamy milk-chocolate base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, soy; wheat possible by fudge/pieces | Base frozen TBD; topping post-process TBD |
| 31 | AEROZA | V1 milk-chocolate aerated character | Own aerated/crisp chocolate pieces | Adds bubble/crisp texture that a homogeneous base cannot reproduce; deletion leaves milk-chocolate base but weakens aerated identity. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, soy | Base frozen TBD; topping post-process TBD |
| 32 | WHISPA | Aerated milk-chocolate character | Own light chocolate shards | Adds light fracture; deletion leaves bubbly-chocolate sensory direction but no physical aeration cue. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, soy | Base frozen TBD; topping post-process TBD |
| 33 | TOFFIFI | Caramel, hazelnut, nougat, chocolate | Own hazelnut-caramel cup/crunch | Adds cup/crunch architecture; deletion leaves four-layer flavour base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, hazelnut/tree nut, soy; wheat possible | Base frozen TBD; topping post-process TBD |
| 34 | MON CHERIO | Dark chocolate, cherry, liqueur character with validated alcohol frontier | Own cherry-liqueur ripple + dark shell | Adds cherry pockets/shell snap; deletion leaves dark-cherry liqueur base. Alcohol remains in base metrics if present. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk/soy possible; alcohol; cherry product cross-contact | Base frozen TBD; topping post-process TBD |
| 35 | MOZARTINI | Pistachio, marzipan/almond, nougat, dark chocolate | Own pistachio-marzipan truffle pieces | Adds layered praline pieces; deletion leaves four-layer Mozart-style direction if exact variant approved. | `BLOCKED` | `BLOCKED` | `BLOCKED` | pistachio, almond/tree nuts, milk/soy; egg possible | Base frozen TBD; topping post-process TBD |
| 36 | MERZI | Proposed hazelnut-almond cream chocolate; exact reference still blocked | Own mixed-nut chocolate crisp | Adds nut/chocolate bite; deletion leaves proposed cream-chocolate base. Generation cannot start before exact source lock. | `BLOCKED` | `BLOCKED` | `BLOCKED` | hazelnut, almond/tree nuts, milk, soy | Base frozen TBD; topping post-process TBD |
| 37 | BACINI | Dark chocolate and hazelnut gianduja | Own dark-hazelnut truffle pieces | Adds whole-praline contrast; deletion leaves dark hazelnut-gianduja base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | hazelnut/tree nut, milk/soy possible | Base frozen TBD; topping post-process TBD |
| 38 | KISSINI | Proposed roasted hazelnut and milk chocolate; exact official reference blocked | Own whole-roasted-hazelnut chocolate crunch | Adds kiss/praline bite; deletion leaves proposed nut-chocolate base. No recipe generation until reference is resolved. | `BLOCKED` | `BLOCKED` | `BLOCKED` | hazelnut/tree nut, milk, soy | Base frozen TBD; topping post-process TBD |
| 39 | RONDORO NOIR | Dark chocolate; hazelnut/wafer only after source/concept resolution | Own dark wafer-hazelnut crunch | Adds wafer/nut contrast; deletion leaves dark chocolate base but current source does not establish hazelnut. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk/soy, wheat/gluten; hazelnut only if approved | Base frozen TBD; topping post-process TBD |
| 40 | HAZNUTA | Hazelnut, cocoa, milk, wafer character | Own large wafer-hazelnut slab/crumble | Adds large-format wafer break; deletion leaves hazelnut-cocoa milk/wafer flavour. | `BLOCKED` | `BLOCKED` | `BLOCKED` | hazelnut/tree nut, milk, wheat/gluten, soy | Base frozen TBD; topping post-process TBD |

## D. Biscuit / Crunch / Shell

| # | Working name | What must be in Base | Optional Topping (`POST_PROCESS_ADDON`) | Why / result if topping is deleted | Base g | Topping g | Final mass | Provisional allergen flags | Process stage |
|---:|---|---|---|---|---|---|---|---|---|
| 41 | LOTIS BISCOTTO | Caramelised spiced biscuit, brown-sugar and cinnamon/spice character | Own caramelised-biscuit crumble/ripple | Adds biscuit particles and syrup contrast; deletion leaves spiced caramelised-biscuit base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | wheat/gluten, soy possible; milk branch-dependent | Base frozen TBD; topping post-process TBD |
| 42 | KRUNCH | Milk chocolate and toasted rice/cereal character | Own crisped-rice chocolate crunch | Adds defining cereal crisp; deletion leaves chocolate/toasted-cereal flavour with reduced crunch identity. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, soy; cereal/gluten depends on product | Base frozen TBD; topping post-process TBD |
| 43 | HONEY KRUNCH | Honey/toffee and milk chocolate | Own honeycomb crunch | Adds defining honeycomb fracture; deletion leaves honey/toffee chocolate base. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, soy; egg/gluten product-dependent | Base frozen TBD; topping post-process TBD |
| 44 | BILLIONAIRE SHELL | Caramel, biscuit, chocolate, salt | Own salted-caramel ribbon + biscuit crunch + chocolate shell | Adds layered “shell” format. Deletion leaves caramel-biscuit-chocolate base but removes shell identity; concept acceptance risk. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, wheat/gluten, soy | Base frozen TBD; topping post-process TBD |
| 45 | PISTACHIO ROYAL SHELL | Pistachio | Own chocolate shell + roasted pistachio pieces | Adds premium shell/nut texture. Deletion leaves pistachio base but removes shell identity; concept acceptance risk. | `BLOCKED` | `BLOCKED` | `BLOCKED` | pistachio/tree nut, milk/soy depending shell; vegan branch differs | Base frozen TBD; topping post-process TBD |
| 46 | ALMOND ROYAL SHELL | Vanilla, almond, dairy cream | Own selected milk/dark shell + roasted almond pieces | Adds coated format and nut crunch. Deletion leaves almond-vanilla dairy base but removes shell identity. | `BLOCKED` | `BLOCKED` | `BLOCKED` | almond/tree nut, milk, soy possible | Base frozen TBD; topping post-process TBD |
| 47 | WHITE STRAWBERRY SHELL | Strawberry and vanilla/milk cream | Own white-chocolate shell + strawberry crisp | Adds coating and fruit crisp. Deletion leaves strawberry-cream base but removes shell identity. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, soy possible; fruit crisp cross-contact product-dependent | Base frozen TBD; topping post-process TBD |
| 48 | SALTED CARAMEL SHELL | Caramel, dairy cream, salt | Own salted-caramel ripple + chocolate shell | Adds caramel pockets and coating snap. Deletion leaves salted-caramel dairy base but removes shell identity. | `BLOCKED` | `BLOCKED` | `BLOCKED` | milk, soy possible | Base frozen TBD; topping post-process TBD |
| 49 | DUBAI PISTACHIO CRUNCH | Pistachio and chocolate; sesame/tahini **not approved without separate evidence** | Own toasted kataifi-style crunch + pistachio cream + chocolate shell | Adds defining pastry crunch/shell. Deletion leaves pistachio-chocolate base but weakens Dubai-style recognition. | `BLOCKED` | `BLOCKED` | `BLOCKED` | pistachio/tree nut, milk, wheat/gluten, soy; sesame only if actually selected | Base frozen TBD; topping post-process TBD |
| 50 | CARAMEL PRETZEL RIOT | Caramel, biscuit/toasted grain, salt, chocolate | Own pretzel-style salted crunch + caramel ripple | Adds defining salty pretzel fracture. Deletion leaves caramel-grain-salt-chocolate base but reduces pretzel recognition. | `BLOCKED` | `BLOCKED` | `BLOCKED` | wheat/gluten, milk, soy; sesame possible by pretzel product | Base frozen TBD; topping post-process TBD |

## Generation gate

Before any mass cell can be filled, each individual concept needs:

1. owner approval of its research row and exact reference market/variant;
2. trademark/public-name clearance;
3. canonical recipe ID/version, profile and serving choice;
4. canonical ingredient and Mapper IDs with current product data;
5. an independently formulated Base vector and separately formulated optional Topping vector;
6. whole-gram practicalisation followed by full recalculation;
7. technical, process, allergen and (where relevant) alcohol-frontier proof;
8. a sensory ledger proving recognition both without and with Topping;
9. owner publication decision.

Until those gates pass, **0/50 Base masses, 0/50 Topping masses and 0/50 final masses are executable**.
