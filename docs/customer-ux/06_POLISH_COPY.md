# 06 — Polish Primary UI Copy (customer UI is Polish)

Exact PL strings for every customer screen and state. Tone: calm, professional,
warm, second person singular ("Ty" implied, not formal "Pan/Pani"). No engine
jargon. This is a **copy spec**, not code — it does not modify `en.ts` (which is the
in-flight English source and out of scope to edit). Keys mirror the intended
structure for a future PL locale.

Placeholders: `{smak}`, `{typ}`, `{urządzenie}`, `{ilość}`, `{jednostka}`.

---

## Global / chrome

| Key | PL |
|-----|-----|
| brand | PINGÜINO |
| nav.back | Wróć |
| nav.menu | Menu |
| nav.account | Konto |
| nav.signIn | Zaloguj się |
| nav.signOut | Wyloguj |
| nav.newRecipe | Nowa receptura |
| nav.myRecipes | Moje receptury |
| nav.catalogue | Receptury PINGÜINO |
| nav.subscription | Subskrypcja |
| nav.comingSoonGroup | Wkrótce |
| tier.freePreview | Free Preview |
| tier.home | Home |
| tier.pro | Pro |

---

## S0 · Start

| Key | PL |
|-----|-----|
| s0.title | Co dzisiaj robimy? |
| s0.placeholder | Powiedz lub napisz, jakie lody chcesz przygotować… |
| s0.micIdle | Dotknij i mów |
| s0.micListening | Słucham… |
| s0.micProcessing | Przetwarzam… |
| s0.micStop | Zatrzymaj |
| s0.micNoSpeech | Nie usłyszałem nic — spróbuj jeszcze raz lub wpisz tekst. |
| s0.micDenied | Brak dostępu do mikrofonu — możesz wpisać tekst. |
| s0.micUnavailable | Dyktowanie niedostępne w tej przeglądarce — wpisz tekst. |
| s0.submit | Dalej |
| s0.parseEmpty | Nie rozpoznałem smaku — spróbuj np. „wanilia”. |

## S1 · Intent chips

| Key | PL |
|-----|-----|
| s1.title | Rozumiem to tak: |
| s1.flavorsLabel | Smaki |
| s1.quantityLabel | Ilość |
| s1.typeLabel | Rodzaj |
| s1.deviceLabel | Urządzenie |
| s1.addFlavor | Dodaj smak |
| s1.recognizedFrom | rozpoznano z Twojego opisu |
| s1.editHint | Coś jeszcze do poprawienia? Dotknij, aby edytować. |
| s1.checkChip | Sprawdź: {smak} |
| s1.removeAria | Usuń {smak} |
| s1.editAria | Edytuj {smak} |
| s1.needFlavor | Dodaj przynajmniej jeden smak. |
| s1.confirm | Tak, dalej |

## S2 · Product type

| Key | PL |
|-----|-----|
| s2.title | Jaki to rodzaj lodów? |
| s2.gelato.label | Gelato |
| s2.gelato.desc | Na bazie mleka — klasyczne i kremowe |
| s2.sorbet.label | Sorbet |
| s2.sorbet.desc | Bez nabiału — owoc gra pierwsze skrzypce |
| s2.vegan.label | Vegan |
| s2.vegan.desc | Bez składników odzwierzęcych |
| s2.protein.label | Protein |
| s2.protein.desc | Więcej białka |

> Note: there is deliberately **no** "Czekolada / Chocolate" option. A chocolate
> idea stays labeled **Gelato**; routing is internal and never surfaced.

## S2b · Protein — honest unsupported state

| Key | PL |
|-----|-----|
| s2b.title | Protein — jeszcze nad tym pracujemy |
| s2b.body | Nie mamy jeszcze dedykowanego profilu dla lodów proteinowych, więc nie policzymy dla nich dokładnej receptury. Nie chcemy zgadywać. |
| s2b.captured | Zapisaliśmy Twój pomysł: {smak} · Protein · {ilość} |
| s2b.altGelato | Zrób to jako Gelato (na bazie mleka) |
| s2b.notify | Powiadom mnie, gdy Protein będzie gotowy |
| s2b.notifySavedLocal | Zapamiętamy to na tym urządzeniu. |

## S3 · Equipment / serving mode

| Key | PL |
|-----|-----|
| s3.title | Na czym podajesz albo mrozisz? |
| s3.ninja.label | Ninja |
| s3.ninja.sub | Miękkie · świeże |
| s3.ninjaSwirl.label | Ninja Swirl |
| s3.ninjaSwirl.sub | Miękkie · świeże |
| s3.witryna.label | Witryna |
| s3.witryna.sub | Świeże gelato |
| s3.m11.label | −11°C |
| s3.m11.sub | Miękkie · około −11°C |
| s3.m12.label | −12°C |
| s3.m12.sub | Twardsze · około −12°C |
| s3.m13.label | −13°C |
| s3.m13.sub | Twarde · około −13°C |
| s3.m18.label | −18°C |
| s3.m18.sub | Do przechowywania |
| s3.custom.label | Własne ustawienie |
| s3.custom.sub | Ustaw ręcznie |
| s3.capacityPending | pojemność do potwierdzenia |
| s3.previewNote | Podgląd — na razie liczymy na −11°C. |
| s3.autoBatchToast | Ustawiłem partię na {ilość} dla tego urządzenia. |

### S3 capacity confirm sheet

| Key | PL |
|-----|-----|
| s3cap.title | Jaka jest pojemność tego urządzenia? |
| s3cap.unitLabel | Jednostka |
| s3cap.unitMl | ml |
| s3cap.unitG | g |
| s3cap.densityNote | Podaj w gramach, jeśli znasz. Jeśli w ml, policzymy masę według gęstości mieszanki. |
| s3cap.densityDeferred | Policzymy masę, gdy wybierzesz bazę. |
| s3cap.save | Zapisz pojemność |
| s3cap.errPositive | Podaj liczbę większą niż 0. |

## S4 · Batch

| Key | PL |
|-----|-----|
| s4.title | Ile chcesz zrobić? |
| s4.1kg | 1 kg |
| s4.5kg | 5 kg |
| s4.10kg | 10 kg |
| s4.custom | Własna ilość |
| s4.customPlaceholder | Podaj ilość |
| s4.errPositive | Podaj ilość większą niż 0. |

## S5 · Fork

| Key | PL |
|-----|-----|
| s5.summaryChips | {smak} · {typ} · {urządzenie} · {ilość} |
| s5.title | Jak chcesz działać? |
| s5.createTitle | Stwórz nową recepturę |
| s5.createDesc | PINGÜINO zbalansuje ją od zera |
| s5.matchTitle | Pokaż pasujące gotowe receptury |
| s5.matchDesc | Zacznij od sprawdzonej bazy |

## S5b · Ready recipes

| Key | PL |
|-----|-----|
| s5b.title | Pasujące receptury |
| s5b.matchClosest | Najbliższa Twojemu pomysłowi |
| s5b.matchGood | Dobre dopasowanie |
| s5b.matchOtherBase | Inna baza |
| s5b.view | Zobacz recepturę |
| s5b.useAsStart | Użyj jako punkt wyjścia |
| s5b.photoSoon | zdjęcie wkrótce |
| s5b.empty | Nie mamy jeszcze gotowej receptury dla tego pomysłu — stwórz nową. |
| s5b.emptyCta | Stwórz nową recepturę |
| s5b.error | Nie udało się wczytać receptur. Spróbuj ponownie. |
| s5b.retry | Spróbuj ponownie |
| s5b.loading | Wczytuję receptury… |

## S6 · Result recipe card

| Key | PL |
|-----|-----|
| s6.metaLine | {typ} · {urządzenie} · {ilość} |
| s6.statusLabel | Status |
| s6.statusBalanced | Zbilansowane — gotowe do produkcji |
| s6.statusNeedsAttention | Wymaga drobnej korekty |
| s6.statusCannotBalance | Nie da się w pełni zbalansować w tych ustawieniach |
| s6.ingredientsLabel | Składniki |
| s6.gramsLocked | 🔒 |
| s6.gramsLockedAria | Dokładna ilość dostępna po odblokowaniu |
| s6.prepLabel | Jak to zrobić |
| s6.substituteLabel | Zamień składnik |
| s6.techDetailsToggle | Dane techniczne |
| s6.loading | Liczę recepturę… |
| s6.empty | Nie udało się zbudować receptury — wróć i zmień wybór. |
| s6.errCapacity | Ta ilość nie zmieści się w wybranym urządzeniu — zmień ilość lub urządzenie. |
| s6.errGeneric | Coś nie zgadza się w recepturze — sprawdź wybór. |

### S6 · "Dane techniczne" (collapsed, professional)

| Key | PL |
|-----|-----|
| tech.nutritionLabel | Wartości odżywcze (na 100 g) |
| tech.energy | Energia |
| tech.fat | Tłuszcz |
| tech.saturated | w tym kwasy nasycone |
| tech.carbs | Węglowodany |
| tech.sugars | w tym cukry |
| tech.protein | Białko |
| tech.salt | Sól |
| tech.costLabel | Koszt |
| tech.costPerKg | Za kg |
| tech.costPerServing | Za porcję |
| tech.costIncomplete | Cena niepełna — brakuje cen niektórych składników. |
| tech.stabilityLabel | Stabilność i tekstura |
| tech.stabilityPlain | Zbilansowane dla wybranej temperatury podania. |
| tech.unavailable | Niedostępne |
| tech.lockedNote | Dokładne wartości dostępne w Home i Pro. |

## S6-Demo · Upgrade card

| Key | PL |
|-----|-----|
| upgrade.title | Odblokuj dokładne ilości |
| upgrade.body | Zobacz dokładne gramatury i pełną recepturę. |
| upgrade.chooseHome | Wybierz Home |
| upgrade.seePro | Zobacz Pro |
| upgrade.billingSoon | Płatności będą wkrótce. |

---

## Subscription / plans (customer language)

| Key | PL |
|-----|-----|
| sub.title | Subskrypcja |
| sub.freeName | Free Preview |
| sub.freeTagline | Poznaj PINGÜINO za darmo. |
| sub.homeName | Home |
| sub.homeTagline | Dokładne receptury dla Twojej kuchni. |
| sub.proName | Pro |
| sub.proTagline | Pełny warsztat, bez ograniczeń. |
| sub.freeFeatures | Podgląd receptury · nazwy składników · bez dokładnych gramatur |
| sub.homeFeatures | Dokładne gramatury · jedna zapisana receptura z historią wersji · eksport |
| sub.proFeatures | Wszystko z Home · nielimitowane receptury · tryb produkcyjny |
| sub.billingSoon | Płatności i checkout pojawią się wkrótce. |

## Moje receptury (cards, not table)

| Key | PL |
|-----|-----|
| my.title | Moje receptury |
| my.empty | Nie masz jeszcze zapisanych receptur — stwórz jedną i zapisz. |
| my.signInToView | Zaloguj się, aby zobaczyć zapisane receptury. |
| my.open | Otwórz |
| my.delete | Usuń |
| my.deleteConfirmTitle | Usunąć tę recepturę? |
| my.deleteConfirmBody | Tej operacji nie można cofnąć. |
| my.deleteConfirmYes | Usuń |
| my.deleteConfirmNo | Anuluj |
| my.loading | Wczytuję… |
| my.metaType | Rodzaj |
| my.metaDevice | Urządzenie |
| my.metaBatch | Ilość |
| my.metaUpdated | Zaktualizowano |

---

## Shared states / toasts

| Key | PL |
|-----|-----|
| state.loading | Chwila… |
| state.retry | Spróbuj ponownie |
| state.saved | Zapisano |
| state.copied | Skopiowano |
| state.copyLocked | Kopiowanie dostępne po odblokowaniu dokładnych ilości. |
| state.printLocked | Wydruk dostępny po odblokowaniu dokładnych ilości. |
| state.offline | Brak połączenia — spróbuj ponownie. |
| state.genericError | Coś poszło nie tak. Spróbuj ponownie. |

---

## Copy principles (for whoever fills the PL locale)

1. **No engine words** in customer copy: never NPAC, POD, „silnik −11°C” as a
   headline, IF9/IF10, „dispatcher”, „regulator”. Temperature may appear as a plain
   secondary hint ("około −11°C").
2. **Honesty over polish:** „podgląd”, „do potwierdzenia”, „zdjęcie wkrótce”,
   „jeszcze nad tym pracujemy” — always specific, never a fake promise.
3. **Never fake precision:** no „94% dopasowania”; use „Najbliższa Twojemu pomysłowi”.
4. **Locks explain, not scold:** „dostępne po odblokowaniu”, not „zablokowane”.
5. **Diacritics required** (ł, ż, ś, ó, ą, ę, ć, ń) — verify encoding on device.
