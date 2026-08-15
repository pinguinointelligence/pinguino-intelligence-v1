# Cocktail Library — research and executable-template gap matrix

**Audit date / source retrieval date:** 2026-08-15

**Scope:** the 22 Cocktail Library priorities specified by the Recipe Library V1 brief.
**Publication state:** research only; non-production; owner review required.

## Finding

The repository does **not** contain an executable Cocktail Library registry or an approved Cocktail recipe template. It contains discovery-only flavour cards in `src/data/recipes/flavorCatalogue.generated.ts` (for example Mojito `FL-002375`, Piña Colada `FL-002380`, Margarita `FL-002385`, and Espresso Martini `FL-002390`). Those cards have a name, short ingredient notes, category/profile metadata and tags, but no recipe version, canonical product/Mapper IDs, base/topping grams, serving choice, process, technical result, alcohol-frontier proof, provenance or publication decision. They cannot be promoted to executable recipes.

`reports/MAPPER_2088_PRODUCT_BEHAVIOR_AUDIT.csv` contains isolated product records such as Mojito puree `PI-ING-001527`, Pinacolada puree `PI-ING-001529`, an RTD Mojito `PI-ING-001841` and an RTD Espresso Martini `PI-ING-001852`; the audit itself records missing process or science evidence. They are products, not Cocktail recipe templates.

No grams below are inferred from a liquid cocktail formula. An official liquid definition is used only to identify the sensory architecture. Frozen formulation must be rebuilt and validated against the actual selected products.

## Global execution blockers

Every row is blocked until it has all of the following:

- canonical recipe ID and version;
- one of the six canonical serving choices (`−11°C`, `−12°C`, `−13°C`, `Świeże`, `Ninja Gelato`, `Ninja Swirl`), including internal routing where applicable;
- exact canonical product and Mapper IDs for every ingredient;
- actual-product ABV, sugar, water, density, declared allergens, market and price evidence;
- explicit frozen-base grams and separately modelled post-process topping grams;
- a process, technical result, machine/serving validation, sensory test and owner publication decision;
- a demonstrated alcohol frontier. The liquid proportions in a source are **not** a frozen-base formula.

Accordingly, every executable-grams field is `BLOCKED — NO APPROVED INTERNAL VECTOR`.

## Research-definition matrix

Source facts are deliberately separated from PINGÜINO decisions. Ingredient quantities published for the liquid drink are not reproduced because they are irrelevant to an approved frozen formula.

| # | Working concept | Required profile(s) | Primary-source sensory definition | PINGÜINO formulation decision / gap | Template state |
|---:|---|---|---|---|---|
| 1 | Margarita | Sorbet; optional acid-safe Gelato only if validated | [IBA Margarita][iba-margarita]: tequila, orange liqueur, fresh lime; optional partial salt rim. | Preserve tequila–orange–lime–salt recognition. Gelato branch needs acid/protein stability evidence; salt is a sensory cue, not permission to copy the liquid ratio. | `NO TEMPLATE — BLOCKED` |
| 2 | Mojito | Sorbet | [IBA Mojito][iba-mojito]: white Cuban rum, lime, mint, cane sugar and soda water. | Mint freshness and lime must survive freezing; carbonation can only be represented as a sensory cue unless a validated process exists. | `NO TEMPLATE — BLOCKED` |
| 3 | Piña Colada | Sorbet + Gelato | [IBA Piña Colada][iba-pina]: white rum, coconut cream and pineapple juice. | Separate sorbet and gelato vectors are required; coconut fat/solids and pineapple acidity need their own balancing and process evidence. | `NO TEMPLATE — BLOCKED` |
| 4 | Rum & Cola Lime | Sorbet | [IBA Cuba Libre][iba-cuba-libre]: white rum, cola and fresh lime. | Generic rum and cola are mandatory; no brand may be required. Cola concentration and acidity must come from actual selected products. | `NO TEMPLATE — BLOCKED` |
| 5 | Whisky & Cola | Sorbet | No single official canonical definition was selected. [EU spirit-drinks regulation][eu-spirit] governs protected category names, not a frozen formula. | Lock an actual generic-category whisky and cola input; document market composition. Do not substitute the Cuba Libre definition. | `RESEARCH GAP — BLOCKED` |
| 6 | Bitter Orange Spritz | Sorbet | [IBA Spritz][iba-spritz]: Prosecco, bitter orange aperitif and soda; orange garnish; the IBA notes other bitter variants. | Use a generic legally permissible bitter-orange architecture. Wine/aperitif alcohol, sugar and carbonation cues require actual-product modelling. | `NO TEMPLATE — BLOCKED` |
| 7 | Vodka Lemonade | Sorbet | No single current IBA definition selected. | The brief supplies the concept only. Actual vodka and lemonade/juice/syrup products, acid system and sweetness target must be selected and evidenced. | `RESEARCH GAP — BLOCKED` |
| 8 | Vodka Soda Citrus | Sorbet | No single current IBA definition selected. | Citrus and effervescence cues must be defined without pretending retained carbonation. Actual spirit and citrus inputs are unresolved. | `RESEARCH GAP — BLOCKED` |
| 9 | Gin & Tonic | Sorbet | No single current IBA definition selected. | Select actual gin and tonic; capture ABV, sugar, quinine/botanical profile and market label. Generic names only. | `RESEARCH GAP — BLOCKED` |
| 10 | Dry Martini | Sorbet / frozen | [IBA Dry Martini][iba-dry-martini]: gin and dry vermouth, with lemon oil or olive garnish. | This is an unusually low-sugar, high-alcohol architecture. It needs a defensible frozen structure and alcohol-frontier validation; garnish is post-process/serving metadata. | `NO TEMPLATE — BLOCKED` |
| 11 | Espresso Martini | Gelato; optional Sorbet | [IBA Espresso Martini][iba-espresso]: vodka, coffee liqueur, sugar syrup and strong espresso. | Coffee strength, liqueur sugar/ABV and dairy interaction require actual products. Sorbet is a separate vector, not a dairy-free flag on the same vector. | `NO TEMPLATE — BLOCKED` |
| 12 | Passionfruit Vanilla Martini | Sorbet + Gelato | [IBA Porn Star Martini][iba-passion]: vanilla vodka, passion-fruit liqueur/purée and vanilla sugar, with sparkling wine served separately. | Public working name stays generic. Treat sparkling wine as an optional serving/topping cue unless explicitly modelled; separate sorbet and gelato vectors. | `NO TEMPLATE — BLOCKED` |
| 13 | Strawberry Daiquiri | Sorbet; optional Gelato | [IBA Daiquiri][iba-daiquiri] supports the rum–lime–sugar backbone; it does not establish a strawberry frozen formula. | Strawberry is a PINGÜINO concept addition requiring an actual fruit product and fruit/acid evidence. Optional gelato needs a separate acid-safe validation. | `PARTIAL RESEARCH — BLOCKED` |
| 14 | Sex on the Beach | Sorbet | [IBA Sex on the Beach][iba-sex]: vodka, peach schnapps, orange juice and cranberry juice. | Select actual juices/fruit preparations and spirit products; balance juice sugars/acids from current labels, not assumed values. | `NO TEMPLATE — BLOCKED` |
| 15 | Long Island Iced Tea | Sorbet | [IBA Long Island Iced Tea][iba-long-island]: vodka, tequila, white rum, gin, orange liqueur, lemon, syrup and cola. | Multi-spirit composition creates a high alcohol-model burden. Every actual product and contribution must be versioned; no shortcut aggregate “alcohol” ingredient. | `NO TEMPLATE — BLOCKED` |
| 16 | Paloma | Sorbet | [IBA Paloma][iba-paloma]: agave tequila, lime, salt and pink-grapefruit soda. | Grapefruit soda is an actual-product dependency. Preserve grapefruit–lime–salt recognition; model carbonation only as a sensory/process cue. | `NO TEMPLATE — BLOCKED` |
| 17 | Moscow Mule | Sorbet | [IBA Moscow Mule][iba-mule]: vodka, ginger beer and lime. | Ginger heat and lime acidity must survive freezing; actual ginger beer sugar/composition is mandatory. | `NO TEMPLATE — BLOCKED` |
| 18 | Tequila Sunrise | Sorbet | [IBA Tequila Sunrise][iba-sunrise]: tequila, orange juice and grenadine. | Sunrise appearance can be a post-process presentation decision; base must remain recognizable without decorative syrup. | `NO TEMPLATE — BLOCKED` |
| 19 | Whisky Sour | Sorbet | [IBA Whiskey Sour][iba-whiskey-sour]: bourbon, lemon, sugar syrup; egg white optional. | Egg white, if used, creates an allergen/process branch and may not be silently assumed. “Whisky Cream” is a separate Spirit Signature gelato concept, not this recipe. | `NO TEMPLATE — BLOCKED` |
| 20 | Caipirinha | Sorbet | [IBA Caipirinha][iba-caipirinha]: cachaça, lime and cane sugar. | Cachaça must be an actual selected product with evidence. Preserve lime peel/pulp character only through a validated process. | `NO TEMPLATE — BLOCKED` |
| 21 | Irish Coffee | Gelato | [IBA Irish Coffee][iba-irish-coffee]: Irish whiskey, hot coffee, fresh cream and sugar. | Frozen gelato requires its own dairy/coffee/alcohol vector; the liquid temperature/layering method is not transferable. | `NO TEMPLATE — BLOCKED` |
| 22 | White Russian | Gelato | [Kahlúa White Russian][kahlua-white-russian] (manufacturer source): coffee liqueur, vodka and heavy cream. | Source is branded and may inform architecture only. Executable recipe must use locked actual products without making a brand mandatory. | `NO TEMPLATE — BLOCKED` |

## Architecture and alcohol-frontier inventory

`Topping` means a separately recorded post-process addition. A garnish or “fizz” cue is not included in base metrics unless it is actually in the frozen base.

| # | Spirit architecture | Fruit / acid | Sweetness / body cue | Herb, bitter, spice or carbonation cue | Topping / presentation candidate | Alcohol-frontier evidence |
|---:|---|---|---|---|---|---|
| 1 | Tequila + orange liqueur | Lime | Unresolved frozen sweetener system | Salt | Optional salt accent; grams blocked | Missing |
| 2 | White rum | Lime | Cane-sugar cue | Mint; soda/fizz cue | Mint/lime garnish optional; grams blocked | Missing |
| 3 | White rum | Pineapple | Coconut cream/body | None defined | Coconut/pineapple accent optional; grams blocked | Missing |
| 4 | Rum | Lime + cola acidity | Cola sugars | Cola/fizz cue | Lime accent optional; grams blocked | Missing |
| 5 | Whisky | Cola acidity | Cola sugars | Cola/fizz cue | None approved | Missing |
| 6 | Bitter aperitif + sparkling wine | Orange/bitter citrus | Aperitif/wine sugars | Bitter botanicals; soda/fizz cue | Orange accent optional; grams blocked | Missing |
| 7 | Vodka | Lemon | Lemonade/sweetener unresolved | None defined | Lemon accent optional; grams blocked | Missing |
| 8 | Vodka | Citrus unresolved | Sweetener unresolved | Soda/fizz cue | Citrus accent optional; grams blocked | Missing |
| 9 | Gin | Tonic/citrus acidity unresolved | Tonic sugar unresolved | Botanicals, quinine, fizz cue | Citrus/botanical accent optional; grams blocked | Missing |
| 10 | Gin + dry vermouth | Lemon-oil cue or none | Frozen-structure system unresolved | Olive/saline or lemon-oil cue | Olive/lemon service choice; grams blocked | Missing; especially high-risk |
| 11 | Vodka + coffee liqueur | None | Liqueur/syrup plus gelato solids | Espresso bitterness | Coffee/cocoa accent optional; grams blocked | Missing |
| 12 | Vanilla vodka + passion-fruit liqueur | Passion fruit | Vanilla/sugar system | Sparkling cue served separately in source | Passion-fruit accent; optional separate sparkling component, grams blocked | Missing |
| 13 | Rum | Strawberry + lime | Sugar/fruit solids | None defined | Strawberry accent optional; grams blocked | Missing |
| 14 | Vodka + peach liqueur | Orange + cranberry | Juice/liqueur sugars | None defined | Fruit accent optional; grams blocked | Missing |
| 15 | Vodka + tequila + rum + gin + orange liqueur | Lemon | Syrup + cola | Cola/fizz cue | Lemon accent optional; grams blocked | Missing; multi-spirit high-risk |
| 16 | Tequila | Grapefruit + lime | Grapefruit-soda sugar | Salt; fizz cue | Salt/grapefruit accent optional; grams blocked | Missing |
| 17 | Vodka | Lime | Ginger-beer sugar | Ginger heat; fizz cue | Ginger/lime accent optional; grams blocked | Missing |
| 18 | Tequila | Orange + grenadine fruit/acid | Juice + grenadine sugar | None defined | Grenadine “sunrise” swirl only as post-process candidate; grams blocked | Missing |
| 19 | Bourbon/whisky | Lemon | Sugar syrup | Optional egg-white foam in source | Foam/garnish not approved; grams blocked | Missing |
| 20 | Cachaça | Lime | Cane sugar | Lime-peel aromatic cue | Lime accent optional; grams blocked | Missing |
| 21 | Irish whiskey | Coffee | Sugar + dairy gelato solids | Coffee bitterness | Cream/coffee accent optional; grams blocked | Missing |
| 22 | Vodka + coffee liqueur | None | Cream + liqueur sugar | Coffee bitterness | Cream/coffee accent optional; grams blocked | Missing |

## Primary sources

All sources were retrieved on **2026-08-15**. IBA pages are used to identify drink architecture only. The manufacturer White Russian page is used as a primary branded reference, not as a mandatory product instruction. The EU regulation is a category/naming source, not formulation evidence.

- [International Bartenders Association — official cocktail list](https://iba-world.com/cocktails/)
- [Regulation (EU) 2019/787 on spirit-drink definitions and labelling][eu-spirit] (current consolidated version linked by EUR-Lex)

[iba-margarita]: https://iba-world.com/iba-cocktail/margarita/
[iba-mojito]: https://iba-world.com/iba-cocktail/mojito/
[iba-pina]: https://iba-world.com/iba-cocktail/pina-colada/
[iba-cuba-libre]: https://iba-world.com/iba-cocktail/cuba-libre/
[iba-spritz]: https://iba-world.com/iba-cocktail/spritz/
[iba-dry-martini]: https://iba-world.com/iba-cocktail/dry-martini/
[iba-espresso]: https://iba-world.com/iba-cocktail/espresso-martini/
[iba-passion]: https://iba-world.com/iba-cocktail/porn-star-martini/
[iba-daiquiri]: https://iba-world.com/iba-cocktail/daiquiri/
[iba-sex]: https://iba-world.com/iba-cocktail/sex-on-the-beach/
[iba-long-island]: https://iba-world.com/iba-cocktail/long-island-iced-tea/
[iba-paloma]: https://iba-world.com/iba-cocktail/paloma/
[iba-mule]: https://iba-world.com/iba-cocktail/moscow-mule/
[iba-sunrise]: https://iba-world.com/iba-cocktail/tequila-sunrise/
[iba-whiskey-sour]: https://iba-world.com/iba-cocktail/whiskey-sour/
[iba-caipirinha]: https://iba-world.com/iba-cocktail/caipirinha/
[iba-irish-coffee]: https://iba-world.com/iba-cocktail/irish-coffee/
[kahlua-white-russian]: https://www.kahlua.com/en-us/drinks/white-russian/
[eu-spirit]: https://eur-lex.europa.eu/eli/reg/2019/787/oj

## Gate conclusion

The Cocktail Library can proceed to owner-approved product selection and lab research, but **zero of 22 concepts is currently an executable or publishable recipe**. The four flavour cards are discovery evidence only. No exact grams, serving validation or alcohol-safe frontier exists in the repository.
