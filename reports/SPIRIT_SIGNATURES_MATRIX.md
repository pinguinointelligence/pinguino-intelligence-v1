# Spirit Signatures — research and executable-template gap matrix

**Audit date / source retrieval date:** 2026-08-15

**Scope:** the 15 Spirit Signature concepts specified by the Recipe Library V1 brief.
**Publication state:** research only; non-production; owner review required.

## Finding

There is no Spirit Signatures recipe registry, executable template set or approved technical vector in the repository. A few Mapper rows are possible ingredient exemplars, but not formula evidence:

- Whisky Cream paste `PI-ING-000324` — its own audit records blocked data/Main-policy evidence;
- Jim Beam Original `PI-ING-001737` — branded product, Main blocked on science evidence;
- Disaronno `PI-ING-001768` — branded product, blocked on science evidence;
- Pallini Limoncello `PI-ING-001770` — branded product, blocked on science evidence.

These records cannot make a brand mandatory and cannot be transformed into recipe grams. `src/data/recipes/flavorCatalogue.generated.ts` contains broad inspiration records but no Spirit Signature template with version, exact canonical ingredient IDs, grams, process or technical result.

## Rules applied

- The mandatory spirit/liqueur is a **generic category**, not a brand. Actual product selection is a versioned formulation input.
- A substitution is not “equivalent” by name: it requires recalculation from actual ABV, sugar, water, density and price data.
- Source/category facts and PINGÜINO sensory decisions are kept separate.
- No row has approved executable grams. Base grams, optional topping grams and final mass are all `BLOCKED — NO APPROVED INTERNAL VECTOR`.
- Each row requires a canonical recipe/version, one of the six canonical serving choices, canonical product/Mapper IDs, process, technical result, alcohol-frontier proof, tasting and publication decision.
- Protected spirit/category names and allusions require legal review against [Regulation (EU) 2019/787][eu-spirit]. That regulation is naming/category evidence, not a frozen formula.

## Concept matrix

| # | Spirit Signature | Generic mandatory spirit / architecture | Primary-source support | PINGÜINO sensory decision (not a source formula) | Internal evidence | Exact missing evidence | State |
|---:|---|---|---|---|---|---|---|
| 1 | Bourbon Oak & Vanilla | Bourbon/whiskey category + vanilla/oak cues | [EU spirit-drinks regulation][eu-spirit] governs category naming. No actual product specification selected. | Build an oak, vanilla and warm-spice signature without requiring a named brand. | Jim Beam `PI-ING-001737` exists only as a blocked branded Mapper exemplar. | Actual product ID, ABV, sugar/water/density, vanilla system, vector, serving choice, alcohol frontier, process and test. | `RESEARCH GAP — BLOCKED` |
| 2 | Whisky Cream | Whisky category + dairy cream | [IBA Irish Coffee][iba-irish] supports whisky–coffee–cream architecture only when coffee is present; it is not this formula. | Creamy whisky-led gelato signature; keep separate from Whisky Sour. | Whisky Cream paste `PI-ING-000324` is blocked and is not an approved recipe template. | Actual whisky and cream system, allergens, alcohol model, vector, process and sensory proof. | `RESEARCH GAP — BLOCKED` |
| 3 | Smoky Whisky Caramel | Whisky category + smoke + caramel | No selected primary product specification. | Smoke must be traceable to the actual whisky or separately declared flavour; caramel is a balancing/sensory decision. | No executable internal evidence located. | Actual smoky-whisky profile/ABV, caramel product composition, vector, alcohol frontier and tasting. | `OFFICIAL PRODUCT SOURCE ABSENT — BLOCKED` |
| 4 | Herbal Bitter Citrus | Generic bitter/herbal liqueur or aperitif + citrus | [IBA Spritz][iba-spritz] supports a bitter aperitif, sparkling wine, soda and orange architecture; it does not define this frozen signature. | Generic herbal bitterness with citrus lift; no brand-specific botanical claim. | No executable internal evidence located. | Actual bitter product specification, citrus system, ABV/sugar model, vector, process and test. | `RESEARCH GAP — BLOCKED` |
| 5 | Vodka Energy Citrus | Vodka category + energy-drink/citrus system | [EU spirit-drinks regulation][eu-spirit] supports category naming only; no actual energy drink selected. | Citrus-forward frozen signature; caffeine/energy-drink labelling and responsible-marketing review required. | No executable internal evidence located. | Actual vodka and beverage labels, caffeine/other actives, market/legal review, vector, alcohol frontier and test. | `OFFICIAL PRODUCT SOURCE ABSENT — BLOCKED` |
| 6 | Rum Cola Lime | Rum category + cola + lime | [IBA Cuba Libre][iba-cuba] supports rum–cola–lime drink architecture. | Preserve rum, cola and lime recognition; carbonation is a cue, not an assumed physical property after freezing. | Discovery flavour evidence only; no recipe vector. | Actual rum/cola/lime products, ABV/sugar/water/density, vector, process and test. | `RESEARCH ONLY — BLOCKED` |
| 7 | Whisky Cola | Whisky category + cola | No single official canonical definition selected. | Generic whisky-and-cola signature, independently formulated; do not relabel the Cuba Libre architecture as evidence. | No executable internal evidence located. | Actual whisky and cola products, current labels/specs, vector, alcohol frontier and test. | `OFFICIAL REFERENCE ABSENT — BLOCKED` |
| 8 | Coffee Liqueur Cream | Coffee liqueur + dairy cream | [Kahlúa White Russian][kahlua-white] supports coffee liqueur–vodka–cream architecture; the source is branded and does not define this generic frozen formula. | Coffee-liqueur cream signature. Whether vodka is present is an explicit recipe decision, never inferred. | No executable internal evidence located. | Actual generic-role liqueur and cream products, optional spirit decision, ABV/sugar model, vector and test. | `RESEARCH GAP — BLOCKED` |
| 9 | Amaretto Almond | Amaretto/almond liqueur category + almond cue | [EU spirit-drinks regulation][eu-spirit] supports liqueur naming rules only; no actual product specification selected. | Almond/marzipan-like signature with generic liqueur role; allergen status must follow actual ingredients, not flavour name. | Disaronno `PI-ING-001768` is a blocked branded Mapper exemplar only. | Actual liqueur label/specification, nut/allergen determination, ABV/sugar/water, vector and test. | `RESEARCH GAP — BLOCKED` |
| 10 | Limoncello Cream | Limoncello/limoncello-style liqueur + cream | No approved actual-product primary source selected; category/name use needs market/legal confirmation. | Bright lemon-peel liqueur character in a stable cream base. | Pallini Limoncello `PI-ING-001770` is a blocked branded Mapper exemplar only. | Actual liqueur and dairy products, acid/protein stability, ABV/sugar/water, vector, process and test. | `OFFICIAL PRODUCT SOURCE ABSENT — BLOCKED` |
| 11 | Tequila Lime Salt | Tequila category + lime + salt | [IBA Margarita][iba-margarita] and [IBA Paloma][iba-paloma] support tequila–lime–salt relationships, not this frozen formula. | Tequila-led, lime-bright, controlled saline signature; no orange liqueur or grapefruit is inferred unless explicitly selected. | No executable internal evidence located. | Actual tequila/lime/salt system, ABV/acid/water, vector, alcohol frontier and test. | `RESEARCH ONLY — BLOCKED` |
| 12 | Spiced Rum Caramel | Rum category + spice + caramel | No selected actual product primary source. | Spice must come from the selected rum label/specification or declared separate ingredients; caramel is a formulation decision. | No executable internal evidence located. | Actual spiced rum and caramel products, declared flavour/allergen data, vector, alcohol frontier and test. | `OFFICIAL PRODUCT SOURCE ABSENT — BLOCKED` |
| 13 | Dark Rum Chocolate | Rum category + cocoa/chocolate system | No single official product/reference selected. | Dark-rum warmth with chocolate bitterness/body; generic mandatory spirit, actual cocoa/chocolate products required. | No executable internal evidence located. | Actual rum and chocolate products, ABV/sugar/fat/solids data, vector, process and test. | `OFFICIAL PRODUCT SOURCE ABSENT — BLOCKED` |
| 14 | Cherry Liqueur Noir | Cherry liqueur + dark-chocolate/cocoa system | No actual generic-role liqueur product selected. [Ferrero Mon Chéri][mon-cheri] is useful only as separate confection sensory evidence and remains a protected branded reference. | Cherry-liqueur and dark-chocolate signature; do not copy a confection formula or imply affiliation. | No executable internal evidence located. | Actual cherry liqueur and chocolate products, alcohol/cherry solids, allergens, vector and test. | `RESEARCH GAP — BLOCKED` |
| 15 | Irish Cream Coffee | Irish-cream liqueur category + coffee | [IBA Irish Coffee][iba-irish] supports Irish whiskey–coffee–cream architecture, but not an Irish-cream liqueur formula. | Coffee-led creamy liqueur signature; actual liqueur identity determines ABV, sugar and dairy/allergen facts. | No executable internal evidence located. | Actual liqueur and coffee products, ABV/sugar/water/dairy data, vector, process and test. | `RESEARCH GAP — BLOCKED` |

## Base / topping / mass gate

| Concept set | Frozen base grams | Post-process topping grams | Final mass | Technical status |
|---|---|---|---|---|
| All 15 Spirit Signatures | `BLOCKED` | `BLOCKED` | `BLOCKED` | No approved canonical vector or alcohol-frontier validation exists. |

Any topping candidate must be recorded outside frozen-base technical metrics as a `POST_PROCESS_ADDON`, with its own grams, allergens, nutrition, cost and final-mass effect. No topping is approved by this report.

## Sources

Retrieved **2026-08-15**:

- [Regulation (EU) 2019/787 on the definition, description, presentation and labelling of spirit drinks][eu-spirit] — primary EU legal source; EUR-Lex indicates an in-force act and links its current consolidated version.
- [IBA Cuba Libre][iba-cuba]
- [IBA Spritz][iba-spritz]
- [IBA Margarita][iba-margarita]
- [IBA Paloma][iba-paloma]
- [IBA Irish Coffee][iba-irish]
- [Kahlúa White Russian][kahlua-white] — manufacturer primary source; architecture evidence only.
- [Ferrero Poland — Mon Chéri][mon-cheri] — manufacturer primary source; confection architecture evidence only.

[eu-spirit]: https://eur-lex.europa.eu/eli/reg/2019/787/oj
[iba-cuba]: https://iba-world.com/iba-cocktail/cuba-libre/
[iba-spritz]: https://iba-world.com/iba-cocktail/spritz/
[iba-margarita]: https://iba-world.com/iba-cocktail/margarita/
[iba-paloma]: https://iba-world.com/iba-cocktail/paloma/
[iba-irish]: https://iba-world.com/iba-cocktail/irish-coffee/
[kahlua-white]: https://www.kahlua.com/en-us/drinks/white-russian/
[mon-cheri]: https://www.ferrero.com/pl/pl/nasze-marki/mon-cheri

## Gate conclusion

All **15 of 15** concepts remain research gaps. None has approved executable grams, an approved substitution model, or a demonstrated alcohol-safe frozen frontier. The next valid step is owner-approved actual-product selection and evidence capture, followed by independent formulation and testing—not conversion of flavour notes or liquid-drink ratios into recipes.
