# Gellatti — global label compliance audit

Stan źródeł i implementacji: **25 sierpnia 2026 r.**  
Zakres produktu: gelato, lody, sorbet i podobne mrożone desery; przede wszystkim opakowania konsumenckie.  
Profile produktu: wyłącznie **EU, UK, USA, Canada, Australia / New Zealand, World / Universal**.

Dokument jest specyfikacją produktu opartą na źródłach urzędowych. Nie jest poradą prawną, certyfikatem regulatora ani deklaracją zgodności dowolnej receptury. Preflight dotyczy konkretnego snapshotu: produktu, batcha, opakowania, języka, rynku, renderera i wersji prawa.

## Reguła systemowa

- `unknown` nigdy nie oznacza zera, braku alergenu ani wyjątku;
- actual completed Production Run ma pierwszeństwo przed planowaną recepturą;
- package fill jest niezależny od masy batcha;
- decyzje warunkowe (QUID, origin, FOP, claims, shelf life) wymagają authority i review;
- WORLD może być `PRINT_READY_UNIVERSAL`, ale nigdy `REGULATORY_VERIFIED`;
- Kanada pozostaje `EXTERNAL_ASSET_BLOCKED` do instalacji oficjalnego pakietu FOP Health Canada.

# 1. Unia Europejska

Źródła podstawowe: [FIC 1169/2011 — tekst skonsolidowany](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02011R1169-20250401), [dyrektywa LOT 2011/91/UE](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32011L0091), [pochodzenie składnika podstawowego 2018/775](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32018R0775), [wytyczne Komisji dotyczące tolerancji](https://food.ec.europa.eu/system/files/2016-10/labelling_nutrition-vitamins_minerals-guidance_tolerances_summary_table_012013_en.pdf).

| Wymaganie               | Obowiązek, moment i wyjątki                                                                                                                               | Co robi Gellatti                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Nazwa                   | Obowiązkowa nazwa prawna; w jej braku zwyczajowa lub opisowa. Marka/nazwa fantazyjna jej nie zastępuje.                                                   | Oddziela display name od legal name; oba są wersjonowane językowo.                                                               |
| Skład i kolejność       | Obowiązkowy dla żywności wieloskładnikowej; malejąco według masy w chwili użycia, z wyjątkami technicznymi załącznika VII.                                | Sortuje po potwierdzonych `actualGrams` completed run; review rozstrzyga wyjątki i remisy.                                       |
| Składniki złożone       | Nazwa składnika złożonego i jego komponenty, chyba że działa konkretny wyjątek; alergeny i działające dodatki nadal mogą wymagać ujawnienia.              | Przechowuje drzewo komponentów, masy, nazwy i decyzję `componentsDeclared`; brak authority blokuje final review.                 |
| QUID                    | Warunkowo: składnik w nazwie, wyróżniony słowem/grafiką lub charakteryzujący produkt; wyjątki w załączniku VIII.                                          | Drukuje procent tylko przy `required + percentage + reviewed`; nie publikuje całej receptury.                                    |
| Alergeny                | 14 kategorii z załącznika II, wyróżnionych w wykazie składników. PAL tylko po ocenie ryzyka.                                                              | Używa taksonomii EU, pogrubia potwierdzony termin inline; UNKNOWN i nierozpoznany termin blokują.                                |
| Nutrition               | Zasadniczo obowiązkowe, z wyjątkami załącznika V. Kolejność: energia, tłuszcz, nasycone, węglowodany, cukry, opcjonalnie m.in. fibre, białko, sól.        | Niezależny renderer `eu-label-v2`; fibre przed protein; brak sat/sugars blokuje.                                                 |
| 100 g / porcja          | 100 g obowiązkowe. Porcja jest dodatkiem pod warunkami, nie zamiennikiem.                                                                                 | Core zawsze per 100 g.                                                                                                           |
| Energia                 | kJ i kcal z właściwych współczynników załącznika XIV.                                                                                                     | `energyKjPer100g` pochodzi z market factors actual batch lub laboratory authority; gotowe kcal nie są ślepo mnożone.             |
| Zaokrąglenia            | Wartości średnie; Komisja publikuje guidance tolerancji/rounding, a nie jeden globalny algorytm dla wszystkich rynków.                                    | Zachowuje źródła niezaokrąglone i stosuje formatter EU; wersjonuje authority.                                                    |
| Fibre / witaminy        | Fibre dobrowolne, chyba że claim je uruchamia; witaminy/minerały tylko według dozwolonego wykazu, znaczących ilości i %NRV.                               | Fibre tylko gdy reliable; claims i mikroskładniki wymagają odrębnego authority (poza bazowym gelato).                            |
| Ilość netto             | Obowiązkowa, zwykle g/kg dla stałego produktu; wyjątki m.in. bardzo małe ilości. Nazwa i ilość w tym samym polu widzenia.                                 | Używa wybranego fillu, nie batch mass; renderer ma blok same-field-of-vision.                                                    |
| LOT                     | Obowiązkowy; data z dniem i miesiącem może zastąpić LOT. Są wyjątki dla określonych opakowań/nieopakowanych porcji.                                       | Zachowuje Production LOT; obecna ścieżka retail jest celowo bardziej rygorystyczna i wymaga LOT.                                 |
| Daty                    | Data produkcji nie jest ogólnie obowiązkowa. Best before zwykle obowiązkowe; use by dla szybko psującej się żywności stanowiącej bezpośrednie zagrożenie. | Nie zgaduje daty. Wymaga manual authority albo wersjonowanej, zatwierdzonej shelf-life policy.                                   |
| Storage / use           | Warunkowo, gdy potrzebne do prawidłowego przechowania/użycia, także po otwarciu.                                                                          | Wymaga storage dla mrożonego use case; tekst i temperatura pochodzą z authority produktu/procesu.                                |
| Operator/adres          | Operator w UE, a jeśli operator nie ma siedziby w UE — importer do UE; fizyczny adres.                                                                    | Waliduje kraj operatora/importera i drukuje właściwy podmiot. Website nie zastępuje adresu.                                      |
| Pochodzenie             | Warunkowe, gdy brak wprowadzałby w błąd lub działa przepis szczególny; 2018/775 dla innego pochodzenia składnika podstawowego.                            | Pole origin jest warunkowe/optional i wymaga review; niczego nie wyprowadza z adresu firmy.                                      |
| Alkohol                 | `actual alcoholic strength` dotyczy napojów >1,2% obj., nie automatycznie gelato zawierającego alkohol.                                                   | Wymaga jawnej decyzji beverage/non-beverage. `% vol` drukuje wyłącznie dla potwierdzonego napoju >1,2%.                          |
| Język                   | Informacja w języku łatwo zrozumiałym; państwa mogą wymagać języków urzędowych. Nie istnieje jeden język „EU”.                                            | Wymaga kodu docelowego państwa członkowskiego i potwierdzenia kompletności wybranych tłumaczeń.                                  |
| FOP                     | Brak jednego obowiązkowego systemu FOP UE; mogą istnieć reguły krajowe/dobrowolne.                                                                        | Bazowy EU nie dodaje FOP ani krajowych logo.                                                                                     |
| Czytelność/powierzchnia | x-height ≥1,2 mm; ≥0,9 mm, gdy largest surface <80 cm². Wyjątki <10 cm² i nutrition <25 cm² mają własny zakres.                                           | Mierzy x-height Noto Sans z metryki fontu i wymiarów PDF; mała powierzchnia musi być jawnie podana. Nie schodzi poniżej minimum. |
| GTIN/QR                 | Nie są ogólnym obowiązkiem FIC i nie zastępują tekstu.                                                                                                    | Tylko opcjonalne, potwierdzone wartości; GTIN ma check digit.                                                                    |
| Luzem/direct            | Art. 44 gwarantuje co najmniej informacje o alergenach; reszta zależy od państwa.                                                                         | `display_gelateria`/loose jest innym purpose i nie udaje pełnej etykiety prepacked.                                              |
| Mały producent          | Brak ogólnego zwolnienia „mała firma”; możliwy wąski wyjątek nutrition dla bezpośrednich małych ilości/lokalnego detalu.                                  | Nie oferuje globalnego checkboxa exemption; potrzebna byłaby konkretna krajowa authority.                                        |

# 2. Wielka Brytania

Źródła: [GOV.UK food information](https://www.gov.uk/guidance/food-labelling-giving-food-information-to-consumers), [GOV.UK packaging and labelling — aktualizacja 2026](https://www.gov.uk/government/publications/packaging-and-labelling/packaging-and-labelling), [FSA PPDS](https://www.food.gov.uk/allergen-labelling-changes-for-prepacked-for-direct-sale-ppds-food).

| Wymaganie                    | Obowiązek, moment i wyjątki                                                                                                               | Co robi Gellatti                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| GB / NI                      | Obowiązkowe rozstrzygnięcie. GB i NI mają różne ścieżki prawne/adresowe.                                                                  | Jeden profil UK pyta o sub-context `GB` albo `NI`; renderer i preflight zapisują tę decyzję.    |
| Nazwa, skład, compound, QUID | FIC-style: legal/customary/descriptive name, malejąca kolejność, compound i QUID warunkowy.                                               | Niezależny renderer `uk-label-v2`, ale współdzielone bezpieczne prymitywy ingredient/QUID.      |
| Alergeny                     | 14, wyróżnione inline.                                                                                                                    | UK taxonomy; PPDS zawsze full ingredients + inline emphasis.                                    |
| Nutrition                    | Dla typowej prepacked: kJ/kcal, fat, saturates, carbohydrate, sugars, opcjonalne fibre, protein, salt; per 100 g. Wyjątki są kontekstowe. | UK formatter i market-factor energy; brak FDA DV.                                               |
| PPDS                         | Od 1.10.2021 nazwa żywności i pełny wykaz składników z wyróżnionymi alergenami na etykiecie.                                              | `packagingContext=ppds` jest zapisywany; wydruk zawiera food name, full ingredients i emphasis. |
| Net/LOT/date/storage         | Obowiązki FIC-style z wyjątkami zależnymi od produktu/opakowania.                                                                         | Selected fill; LOT; authority shelf life; storage produktu mrożonego.                           |
| Podmiot/adres                | GB: UK/Channel Islands/Isle of Man address operatora lub importera. NI: NI/EU address. Od 1.01.2024 GB nie akceptuje wyłącznie adresu UE. | Wybiera operatora lub importera na podstawie sub-context i kodu kraju.                          |
| Język                        | English baseline w GB; Welsh może być używany; NI/EU i kanał mogą powodować dalsze obowiązki.                                             | Wymaga `en` i user review tłumaczeń.                                                            |
| Alkohol                      | Jak właściwa ścieżka FIC dla napoju >1,2%; nie dla każdego gelato z alkoholem.                                                            | Ta sama jawna decyzja applicability co EU; UK renderer drukuje `% vol` tylko gdy required.      |
| FOP                          | UK traffic-light jest co do zasady dobrowolny.                                                                                            | Nie jest automatycznie dodawany.                                                                |
| Tekst/małe opakowanie        | Baseline x-height 1,2/0,9 mm i odpowiednie wyjątki małych powierzchni.                                                                    | Physical preflight jak UK profile, bez ręcznego zejścia poniżej minimum.                        |
| Mikroproducent               | Istnieje wąski wyjątek nutrition (m.in. mikroprzedsiębiorstwo + direct/local supply); nie usuwa innych obowiązków.                        | Brak automatycznego exemption bez kompletnego dowodu operatora/kanału/geografii.                |
| Loose/direct                 | Informacje o alergenach pozostają obowiązkowe; PPDS nie jest tym samym co packed on request/loose.                                        | Purpose i packaging context są rozdzielone; retail renderer nie certyfikuje karty gelaterii.    |

# 3. Stany Zjednoczone

Źródła: eCFR [21 CFR 101.3](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.3), [101.4](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.4), [101.5](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.5), [101.9](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.9), [101.12](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.12), [101.105](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.105), FDA allergen guidance.

| Wymaganie                       | Obowiązek, moment i wyjątki                                                                                                              | Co robi Gellatti                                                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Statement of identity           | Obowiązkowe na PDP; common/usual name, właściwy rozmiar i relacja do innych elementów.                                                   | Legal product name jest statement of identity i pojawia się na PDP, niezależnie od brand name.                                                            |
| Ingredients/order/compound      | Common/usual names, malejąco według wagi; subingredients parenthetical lub rozproszone zgodnie z regułami.                               | Actual batch order i strukturalne compound components; US nie drukuje europejskiego QUID.                                                                 |
| Allergens                       | Big 9. Contains albo źródło w ingredient name; fish, crustacean shellfish i tree nuts wymagają konkretnego źródła/typu.                  | Generic `tree_nuts`, `fish`, `crustaceans` blokuje; obsługiwany zapis authority np. `tree_nuts: almond`. Sesame jest uwzględnione.                        |
| Nutrition Facts                 | Prescribed FDA panel, nie tabela UE.                                                                                                     | Renderer `fda-nutrition-facts-v2` ma Calories, fat, sat, trans, cholesterol, sodium, carbohydrate, fibre, sugars, added sugars, protein, D/Ca/Fe/K i %DV. |
| Serving/RACC                    | Dla ice cream RACC 2/3 cup (160 mL). Opakowanie <200% RACC jest single serving; 200–300% wymaga dual column; większe jest multi-serving. | Gęstość zamienia 160 mL na gramy. Preflight sprawdza serving, count i format; PDF/HTML mają realne per serving/per container.                             |
| Rounding                        | Prescribed buckets zależne od nutrientu.                                                                                                 | Osobne roundery FDA dla Calories, fat, sodium, cholesterol i whole grams.                                                                                 |
| Net contents                    | Obowiązkowe na PDP w US customary i metric; sposób weight/volume zależy od stanu fizycznego/trade practice.                              | Drukuje OZ + g albo FL OZ + mL z potwierdzonego fillu; system nie wybiera trade practice bez danych opakowania.                                           |
| Manufacturer/packer/distributor | Nazwa i place of business; odpowiedni qualifier, jeżeli podmiot nie jest manufacturer.                                                   | Snapshot przechowuje role i adres; renderer pokazuje responsible business.                                                                                |
| Date / LOT / storage            | Federalna data produkcji/quality date i LOT nie są ogólnym obowiązkiem zwykłej żywności; state rules i safety mogą dodać wymagania.      | Gellatti wymaga traceability LOT/date/storage jako rygorystyczny profil operacyjny; nie przedstawia ich jako federalnego wyjątku.                         |
| Język                           | English; użycie innego języka dla informacji może uruchomić wymóg pełnego użycia tego języka.                                            | Profil wymaga English.                                                                                                                                    |
| Małe powierzchnie               | ≤40 in² może kwalifikować tabular/linear; linear dopiero gdy tabular nie mieści się; <12 in² ma szczególne zasady.                       | Wymaga potwierdzonej ADS i fail-closed kwalifikacji; auto wybiera standard/dual.                                                                          |
| Small business                  | Nutrition exemption zależy m.in. od sprzedaży/FTE/jednostek i może wymagać annual notice; claims/fortification mogą ją wyłączyć.         | Bazowa ścieżka nie stosuje wyjątku, dopóki pełny evidence model nie istnieje.                                                                             |
| Barcode/QR/FOP                  | Brak ogólnego obowiązkowego QR/GTIN/FOP dla tego use case.                                                                               | Kody optional confirmed-only; brak country FOP.                                                                                                           |
| Food service/loose              | 21 CFR menu i state/local rules mogą mieć inny zakres.                                                                                   | `usSaleContext` rozstrzyga packaged retail vs food service; regulatory retail ready dotyczy packaged retail.                                              |

# 4. Kanada

Źródła: [CFIA bilingual labelling](https://inspection.canada.ca/en/food-labels/labelling/industry/bilingual-food-labelling), [ingredients/allergens](https://inspection.canada.ca/en/food-labels/labelling/industry/list-ingredients-and-allergens), [NFT formats](https://inspection.canada.ca/en/food-labels/labelling/industry/nutrition-labelling/nutrition-facts-table-formats), [Health Canada Directory of NFT formats](https://www.canada.ca/en/health-canada/services/technical-documents-labelling-requirements/directory-nutrition-facts-table-formats/nutrition-labelling.html), [reference amounts](https://www.canada.ca/en/health-canada/services/technical-documents-labelling-requirements/nutrition-labelling-table-reference-amounts-food.html), [CFIA net quantity](https://inspection.canada.ca/en/food-labels/labelling/industry/net-quantity), [FOP specifications](https://www.canada.ca/en/health-canada/services/technical-documents-labelling-requirements/nutrition-symbol-specifications/nutrition-labelling.html).

| Wymaganie                  | Obowiązek, moment i wyjątki                                                                                                                   | Co robi Gellatti                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Common name                | Obowiązkowa bilingual common name, chyba że prawidłowo działa wyjątek językowy.                                                               | EN/FR product/common names są oddzielne i kompletne.                                                                                                                                           |
| Ingredients/order/compound | Malejąca kolejność; prescribed component/common names i sugars grouping mają specyficzne zasady.                                              | Actual batch + compound tree; bilingual declarations; user review Canadian specifics.                                                                                                          |
| Allergens                  | Priority allergens, gluten sources i added sulphites; prescribed source names i bilingual output.                                             | Kanada ma własną taksonomię i `Contains / Contient`; unknown blokuje.                                                                                                                          |
| NFT                        | Prescribed Canadian bilingual Nutrition Facts Table i nutrient order.                                                                         | Renderer `canada-nft-v2` implementuje bilingual Figure 3.4(B), nie look-alike USA.                                                                                                             |
| Serving / RA               | Dla tub ice cream/frozen dessert RA 188 mL; inne formy mają 125 mL lub 75 mL. Serving w jednostce zgodnej z net quantity.                     | Tub wymaga 188 mL; density wylicza 117,5 g itp. tylko dla math. Gramów nie drukuje w serving statement.                                                                                        |
| Nutrients/rounding         | Calories; fat; saturated+trans; carbohydrate; fibre; sugars; protein; cholesterol; sodium; potassium; calcium; iron; %DV i Canadian rounders. | Osobne roundery Canadian i prescribed order.                                                                                                                                                   |
| Net quantity               | Consumer PDP; ice cream i food containing ice cream — **volume**, metric. Symbols mL/L są bilingual. Type size zależy od PDP/quantity.        | Kanada odrzuca package tylko w g; wymaga confirmed `netVolumeMl` i drukuje mL/L.                                                                                                               |
| Dealer/address             | Canadian dealer albo imported-by/for z właściwym Canadian responsible party i principal place of business.                                    | Operator CA albo importer CA z fizycznym adresem.                                                                                                                                              |
| Bilingual                  | Zasadniczo English i French; prowincje (np. Quebec) mogą mieć dalsze wymagania.                                                               | `en` + `fr` są wymagane; prowincjonalne overlay pozostaje poza federalnym certyfikatem.                                                                                                        |
| Date/storage               | Durable life ≤90 dni ma prescribed date/storage rules; inne produkty/sytuacje mają wyjątki.                                                   | Shelf-life/date authority jest wymagana w bazowej retail ścieżce; nie jest wyliczana arbitralnie.                                                                                              |
| FOP                        | Od 1.01.2026 symbol dla high in saturated fat/sugars/sodium, o ile nie działa exemption/prohibition; progi zależą od RA/product class.        | Ocena na większej z serving/RA, osobne progi 10/15/30% DV. Brak official artwork blokuje wymagany symbol.                                                                                      |
| Official asset             | Ready-to-use high-resolution package jest udostępniany oficjalną ścieżką Health Canada.                                                       | Nie rysuje symbolu. Wymagane: email `smiu-ugdi@hc-sc.gc.ca`, subject `HPFB BNS Compendium of Nutrition Symbol Formats`; po odbiorze instalacja/checksum w `src/assets/regulatory/canada-fop/`. |
| ADS / font                 | Największy format NFT mieszczący się w 15% ADS; dalsze hierarchie formatów. Figure 3.4(B) ma prescribed point/leading/rules.                  | Software footprint 29,7 cm²; wymaga ADS ≥198 cm² dla tej figury. Mniejszy ADS fail-closed — nie udaje small-package exception.                                                                 |
| Small package              | <100 cm² może mieć szczególne wyjątki, ale ich utrata zależy od claims i innych przesłanek; często potrzebny bilingual contact statement.     | Obecny verified path nie automatyzuje wyjątku. Użytkownik wybiera większe opakowanie/layout; to nie tworzy drugiego zewnętrznego blockera dla bazowego tub use case.                           |
| GTIN/QR                    | Nie zastępują federalnych informacji.                                                                                                         | Optional confirmed-only.                                                                                                                                                                       |

**Status:** renderer, data, serving, volume, ADS, NFT i FOP decision są zaimplementowane. Aktywacja `PRINT_READY_REGULATORY` pozostaje zablokowana wyłącznie przez brak oficjalnego pakietu assetów FOP.

# 5. Australia / Nowa Zelandia

Źródła: [FSANZ Food Standards Code](https://www.foodstandards.gov.au/food-standards-code/legislation), [Nutrition Information Panels](https://www.foodstandards.gov.au/consumer/labelling/panels), [ingredients](https://www.foodstandards.gov.au/consumer/labelling/ingredients), [PEAL allergen labelling](https://www.foodstandards.gov.au/business/labelling/allergen-labelling), [date marking](https://www.foodstandards.gov.au/consumer/labelling/dates), [Code compilation April 2026](https://www.foodstandards.gov.au/sites/default/files/2026-04/Food%20Standards%20Code%20-%20Compilation%20%28April%202026%29.pdf).

| Wymaganie                  | Obowiązek, moment i wyjątki                                                                                                                                        | Co robi Gellatti                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Name/description           | Obowiązkowa nazwa prescribed albo wystarczający opis true nature.                                                                                                  | Legal description oddzielona od product name.                                                                               |
| Ingredients/order/compound | Malejąca ingoing weight, compound rules, additives z class name/number/name; characterising ingredients mogą wymagać %.                                            | Actual order + compound tree + QUID-style AU/NZ percentage tylko po review.                                                 |
| PEAL                       | Required names, bold w ingredients i oddzielny bold `Contains` bezpośrednio po ingredients.                                                                        | Renderer `fsanz-nip-v2` spełnia relację i używa AU/NZ taxonomy.                                                             |
| NIP                        | Serving size, servings per package, per serving i per 100 g/mL; energy, protein, fat, saturated, carbohydrate, sugars, sodium; dodatkowe nutrients, gdy triggered. | Dwukolumnowy NIP z kJ market-factor authority i sodium (nie salt).                                                          |
| Net quantity               | Obowiązkowa miara zgodnie z prawem measurement właściwego kraju i naturą produktu.                                                                                 | Selected package fill z jednostką; market review potwierdza weight/volume dla konkretnego SKU.                              |
| Supplier                   | Nazwa i business address w Australii lub Nowej Zelandii.                                                                                                           | Operator lokalny albo lokalny distributor/supplier; zagraniczny adres nie przechodzi.                                       |
| LOT                        | Obowiązkowa identyfikacja lot z wyjątkami Code.                                                                                                                    | Production LOT jest wymagany w bazowym retail path.                                                                         |
| Date/storage/use           | Best-before/use-by według durable life/safety i prescribed wording; storage, jeśli potrzebne do ważności daty lub bezpiecznego użycia.                             | Authority shelf life i storage; system nie zgaduje.                                                                         |
| Origin                     | Australia ma obowiązkowe Country of Origin Labelling Information Standard dla większości retail food; NZ nie ma identycznej nakładki.                              | Sub-context AU wymaga origin; NZ go nie wymusza w bazowym rendererze.                                                       |
| Język/tekst                | English; mandatory words/legibility i min sizes zależą od pola/małego opakowania.                                                                                  | English required, 6 pt baseline i geometry preflight; dłuższy NIP wymusza większy format.                                   |
| HSR/FOP                    | Health Star Rating jest dobrowolny w obecnym use case.                                                                                                             | Nie dodaje HSR automatycznie.                                                                                               |
| Small package / direct     | <100 cm² oraz food made/packaged on premises, packed in presence, assisted display i unpackaged mają szczególne wyjątki; allergens pozostają istotne.              | Bazowa regulatory ready ścieżka to prepacked retail; loose/display używa osobnego purpose i nie udaje pełnego retail label. |
| Small producer             | Brak ogólnego wyjątku tylko ze względu na rozmiar firmy.                                                                                                           | Brak checkboxa small producer exempt.                                                                                       |

# 6. WORLD / UNIVERSAL

WORLD nie jest jurysdykcją. Wymaga: product name, actual ingredients malejąco, confirmed allergens, neutral nutrition per 100 g (kJ/kcal, fat, saturates, carbohydrate, sugars, protein, salt; fibre gdy reliable), actual package net weight, LOT, production date i storage. Best-before, operator/adres, origin, website, short description, QR, LOT barcode, GTIN/EAN i internal article ID są drukowane tylko po włączeniu i podaniu rzeczywistej wartości.

WORLD nie zawiera Canadian FOP/NFT, FDA Nutrition Facts, UK PPDS claims, EU compliance wording, FSANZ NIP ani country warning symbols. Domyślny język to English; dodatkowe języki są wyborem użytkownika. Status końcowy: `PRINT_READY_UNIVERSAL`, nigdy regulatory certification.

# A. MASTER DATA MODEL ETYKIETY

Gellatti musi przechowywać:

1. Profile: market, sub-context (EU destination, GB/NI, AU/NZ, US sale), profile/renderer version, checked date, required languages, readiness kind.
2. Source: Production Run ID, completion time/timezone, recipe ID/version, actual final mass, actual lines/order/grams, toppings, batch/LOT.
3. Identity: marketing name, legal/common/statement-of-identity per language, category/form, claims/highlighted ingredients, alcohol applicability/ABV authority.
4. Ingredients: canonical ID, actual grams/share, multilingual common names, compound tree/components/order, additives/functions, QUID trigger/exception/percentage/review.
5. Allergens: market taxonomy, exact source/type/species when required, evidence revision, present/unknown, cross-contact/PAL authority, sulphite/gluten specifics.
6. Nutrition: unrounded per 100 g values; kJ authority; kcal, fat, sat, trans, carbohydrate, sugars, added sugars, protein, salt, sodium, fibre, cholesterol, vitamin D, calcium, iron, potassium; method/date/uncertainty; DV/NRV version and display rounding.
7. Serving: household description per language, mass/volume, density/overrun, servings/package, FDA RACC/form, Canadian RA/form, format family.
8. Package: actual fill value/unit/mass/volume/source/time, SKU/form, inner/outer relationship, dimensions, largest surface, ADS/PDP, label size/shape.
9. Dates/storage: production date, date-mark kind/value/basis, shelf-life policy/authority/method/reviewer, storage temperature/text, use instructions.
10. Business: brand, operator/FBO/dealer/manufacturer/packer, importer/distributor, roles, physical addresses/country, website/contact/registration IDs.
11. Origin: finished product and relevant primary ingredient origin plus decision/review.
12. Symbols/codes: FOP assessment/official asset/package version, confirmed GTIN/check digit, QR payload, LOT barcode.
13. Print evidence: exact layout, base font/x-height, size, printer preset/DPI/orientation/margin/copies, PDF metadata/hash, preflight items, acknowledgement.
14. Immutable history: snapshot ID/version/content hash, account profile snapshot, regulatory and renderer versions; append-only reprints.

# B. MARKET DIFFERENCE MATRIX

| Pole              | EU                | UK                | USA                             | Canada                          | AU/NZ                   | WORLD               |
| ----------------- | ----------------- | ----------------- | ------------------------------- | ------------------------------- | ----------------------- | ------------------- |
| Nutrition basis   | 100 g             | 100 g             | serving/RACC                    | serving/RA                      | serving + 100 g         | 100 g               |
| Panel             | EU declaration    | UK declaration    | FDA Nutrition Facts             | bilingual Canadian NFT          | FSANZ NIP               | neutral table       |
| Salt/sodium       | salt              | salt              | sodium                          | sodium                          | sodium                  | salt                |
| Trans/cholesterol | no core           | no core           | required                        | required                        | conditional/no core     | no                  |
| Added sugars      | no                | no                | required                        | no separate row                 | no core                 | no                  |
| Micros core       | none              | none              | D/Ca/Fe/K                       | K/Ca/Fe                         | triggered               | none                |
| Allergens         | Annex II inline   | 14 inline/PPDS    | Big 9 + source                  | priority/gluten/sulphites EN/FR | PEAL inline + Contains  | confirmed only      |
| Language          | destination state | English + context | English                         | EN + FR                         | English                 | English default     |
| Net gelato        | typically mass    | mass              | trade/state dependent           | **volume**                      | product/country measure | selected net weight |
| FOP               | none common       | voluntary         | none core                       | threshold-based mandatory       | HSR voluntary           | none                |
| Business          | EU FBO/importer   | GB UK vs NI/EU    | manufacturer/packer/distributor | Canadian dealer/importer        | local AU/NZ supplier    | configurable        |
| Ready status      | regulatory        | regulatory        | regulatory                      | external asset blocked          | regulatory              | universal only      |

# C. MISSING DATA / MISSING AUTHORITY

## Mapper / Product authority

- compound ingredient trees, additive function/name and component weights are not universally structured;
- supplier facts do not universally provide trans fat, cholesterol, sodium, added sugars, D/Ca/Fe/K, sulphite concentration or specific allergen source/species;
- market-specific common names/origins/claims and laboratory uncertainty remain external authority;
- `mapper_basement` pozostaje nietknięty; enrichment musi być wersjonowaną warstwą obok niego.

## Product Catalog

- validated shelf-life per product + process + package + storage;
- package SKU geometry, ADS/PDP/largest surface, density/overrun and measurement authority;
- typed supplier evidence, claims/highlighted ingredients, serving/RACC/RA category;
- issuer/provenance for EAN/UPC/GTIN beyond check-digit validation.

## User Profile

- wielopodmiotowa wersjonowana macierz legal entities dla wielu rynków (UI przechowuje bieżący operator/importer/distributor, ale nie pełny rejestr historycznych podmiotów);
- province/state, Quebec overlay, Member-State rule package and local non-prepacked rules;
- facility cross-contact/PAL assessment;
- evidence dla small-business exemptions (bazowa ścieżka ich nie stosuje).

## Production Run

- per-package measured fill samples, package SKU/inner/outer and supplier lot per line;
- validated density/overrun at declared frozen state;
- laboratory/market authority where catalog-only topping prevents energy-factor derivation;
- authoritative shelf-life policy if business has not configured one.

# D. PRINT LAYOUT REQUIREMENTS

Realistyczne rodziny:

1. WORLD compact thermal: 58/62/80/104 mm, monochrome, traceability i optional codes.
2. EU/UK compact tub/wrap: 80–104 mm, ale dopiero po x-height/content preflight.
3. USA PDP + information panel/wrap: FDA panel, identity i net contents; dual column potrzebuje wyższego panelu.
4. Canada front + bilingual information panel: common name/net quantity/FOP oraz pełny NFT; typowo wrap lub front/back.
5. AU/NZ ingredients + PEAL + NIP; AU origin overlay.
6. 102×152 mm, A4/Letter proof/PDF oraz custom/continuous media.
7. Calibration label bez danych receptury.

Wspólne zasady: exact mm, embedded Noto Sans, no browser chrome, 1:1 scaling, vector text, raster tylko dla logo/official assets/codes, geometry fail-closed, same document CSS dla preview/system print, auto-layout nie schodzi poniżej minimum, manual controls nie obchodzą preflight.

# E. IMPLEMENTATION PRIORITY

1. **P0 truth:** actual run, package fill, allergen fail-closed, shelf-life authority, immutable append-only snapshots.
2. **P1 market data:** business jurisdiction, EU destination languages, FDA RACC/serving, Canadian RA/volume/ADS/FOP, AU/NZ local supplier/origin.
3. **P2 renderers:** EU, UK/PPDS, FDA, Canadian NFT, FSANZ NIP/PEAL, neutral WORLD — każdy niezależny.
4. **P3 physical output:** exact preview, direct deterministic PDF, system print, calibration and printer software matrix.
5. **P4 activation:** migration + staging browser matrix + official Canada asset. Public production pozostaje poza zakresem.
