# Vegan internet-recipe corpus — mapping authority survey (2026-08-23)

Base: `origin/staging` `190a66f`. Read-only survey of the immutable Mapper;
nothing was written.

## Mappable pool

**1293** products are `vegan = true` AND `approved_for_engines = true`.
Top categories: flavor_paste 283 · beverage 184 · fruit 169 · alcohol 116 ·
nut 110 · base_mix 93 · chocolate 51 · sweetener 32 · stabilizer 31 ·
coconut 13 · fiber 13.

## Required diversity — availability

| Flavour class | Verified product available | Example |
| --- | --- | --- |
| oat | yes | PI-ING-001565 OAT DRINK BIO |
| soy | yes | PI-ING-002109 SOY DRINK 0 % · PI-ING-002110 HIGH-PROTEIN SOY |
| chocolate | yes | PI-ING-000089 BITTER CHOCOLATE 80 % (fat 45) |
| dark cocoa | yes | PI-ING-000717 CACAOPAT (fat 49.1) |
| strawberry | yes | PI-ING-000406 WILD STRAWBERRY |
| raspberry/berry | yes | PI-ING-000394 RASPBERRIES |
| banana | yes | PI-ING-000345 BANANA |
| mango/tropical | yes | PI-ING-000339 MANGO CHATO |
| lemon/citrus | yes | PI-ING-000368 LEMON SQUEEZED |
| coffee | yes | PI-ING-000166 COFFEE BEAN ROASTED |
| caramel | yes | PI-ING-000308 CARAMEL Fabbri |
| pistachio | yes | PI-ING-000413 PISTACHIO Fabbri (fat 55) |
| hazelnut | yes | PI-ING-000415 HAZELNUT PreGel (fat 67.8) |
| peanut | yes | PI-ING-000412 PEANUTS Fabbri (fat 51) |
| almond | yes | PI-ING-001040 ALMOND Sempre (fat 54) |
| liquid oil | yes | PI-ING-000305 SUNFLOWER · 000299 CANOLA · 000303 OLIVE |
| solid/lauric fat | yes | PI-ING-000163 REFINED COCONUT OIL (fat 100) |
| **coconut milk/cream** | **NO** | — |
| **cocoa butter** | **NO** | — |

## Two hard mapping constraints

1. **No VEGAN_VERIFIED coconut milk or coconut cream exists.** The Mapper's
   coconut category holds oil, flakes, desiccated meat and pastes only. This
   matches the existing engine test that keeps an invalid high-water
   coconut-milk reference blocked. Every internet coconut recipe must therefore
   be reconstructed from REFINED COCONUT OIL + a plant drink + water rather than
   mapped 1:1, and that reconstruction must be recorded as a substitution.
2. **No VEGAN_VERIFIED cocoa butter product exists.** The "hard fat / cocoa
   butter" diversity slot must be served by a dark couverture that carries cocoa
   butter as its fat phase (e.g. PI-ING-000089 BITTER CHOCOLATE 80 %, fat 45),
   not by a pure cocoa-butter article.

Neither gap may be closed by inventing a product or editing the Mapper.

## Price provenance for corpus ingredients

Plant drinks (OAT/RICE/ALMOND) and many pastes carry **no** Mapper
`cost_per_kg`, so ECO on those recipes depends on owner `MOJA CENA`. The
verified owner-price position is recorded in
`reports/VEGAN_INTERNET_PRICE_SNAPSHOT.csv`; five owner prices already exist and
must never be overwritten, and SUCROSE/DEXTROSE were persisted through the app's
own Moja cena channel.

## Served-QA constraint discovered

Building an arbitrary corpus recipe **in the served app** requires the ingredient
picker, whose search field does not accept synthetic input — while the Moja cena
numeric field in the same app does (proven this session). Served coverage of
custom corpus recipes therefore cannot be driven through the picker and needs
either the favourites list, a persisted-recipe route, or a store/service-layer
harness.
