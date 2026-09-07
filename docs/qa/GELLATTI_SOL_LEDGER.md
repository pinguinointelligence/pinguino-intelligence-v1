# Gellatti SOL ledger

This is the single canonical, append-only ledger for the SOL workstream. Do not
copy this list into a second ledger. Reports must link to this file and may quote
it, but they must not become an independent source of numbering or status.

Rules:

- IDs are append-only and are never deleted, moved, renumbered, or reused.
- A newly confirmed defect receives the next free ID at the end of this file.
- DESIGN subpoints are append-only, uniquely numbered under their parent, and do
  not consume or change the next main SOL ID.
- DESIGN is the penultimate workstream stage. The final stage remains the full
  end-to-end test of every flow.
- A code change or a green test alone does not prove a staging resolution.
- Status changes are appended to the history below; prior states are retained.
- `RESOLVED_IN_PR_AWAITING_MERGE` means the repair exists only in an unmerged PR.
- `RESOLVED_ON_STAGING` requires the normal merge, the exact staging deployment,
  and proof that no migration SQL was executed again.

`NEXT_FREE_SOL_ID: SOL-052`

> Rekonsyliacja Owner QA 2026-09-06/07: cztery zgłoszone defekty Scannera oraz audyt Product
> Registry mieszczą się w istniejących wpisach SOL-042, SOL-043, SOL-044, SOL-045 i SOL-049 —
> każdy dostaje dowody, nie nowy identyfikator. Automatyczny zoom gościa NIE jest osobnym
> defektem: to ta sama awaria kamery co SOL-045, zaobserwowana na telefonie zamiast na
> komputerze. `SOL-050` zajął w międzyczasie inny workstream (prywatne produkty „Niegotowe”,
> decyzja Ownera 2026-09-06), więc ten checkpoint nie tworzy żadnego nowego ID.

`NEXT_FREE_DESIGN_SUBPOINT: SOL-047.3`

## Current ledger

- [ ] **SOL-001 · TODO — terminalny timeout kombinacji dwóch owoców.** Historycznie 12 przypadków M05–M06, M11–M12, M17–M18, M23–M24, M35–M36 i M41–M42 kończyło się watchdogiem około 20 s; solver potrzebował 50–92 s. W komentarzu kodu widnieje „Thirty seconds”, a stała nadal wynosi `20_000` — również wyjaśnić tę niespójność.
- [ ] **SOL-002 · TODO — wizualnie nietknięte Direction może być aktywne.** Historyczne `U*` wyglądało jak brak wyboru, ale po przejściu przez profil zapisywało `direction_targets_active: true`. Ustalić dokładny bieżący lifecycle: nowa receptura, wybór profilu, zapis i reopen.
- [ ] **SOL-003 · TODO — Sorbet Direction omija wymagane minimum Main.** Historycznie solver publikował 57,2% Main przy polityce minimum 60%, oznaczał `mainHeldByExactDirection`, a późny Binder odrzucał wynik. Dotyczy przypadków Owner A/C i części M13–M24.
- [ ] **SOL-004 · TODO — Preview i Apply mają sprzeczny kontrakt TARA.** Preview legalnie proponowało TARA `1,3 → 1 g`, po czym Apply nazywało gramaturę zablokowaną mimo braku widocznej kłódki. Historyczne przypadki M31–M34.
- [ ] **SOL-005 · TODO — arbuz nie ma potwierdzonej polityki Main dla Sorbet/Vegan/Protein.** Historycznie Preview mogło przejść jako `USER_HELD`, ale trustless Apply nie potrafił ponownie potwierdzić Main. Zweryfikować aktualne dane po #189; nie tworzyć polityki bez decyzji Ownera.
- [ ] **SOL-006 · TODO — rzeczywista przyczyna skoku masy Sorbet pozostaje nieustalona.** Stary raport przypisał ją dodaniu owocu przy `0 g`, lecz badany kod już wymagał `planned_grams > 0`. Nie powtarzać tej diagnozy; odtworzyć kolejność zdarzeń i znaleźć miejsce, w którym draft miał rosnąć do około 1024 g.
- [ ] **SOL-007 · TODO — acceptance matrix może być fałszywie zielona.** Kontrolowane `REFUSED` są liczone jako wiersze, główna asercja pilnuje liczby rekordów, test omija realny picker/UI, używa fallbacków fixture, in-memory save/reopen i nie wykonuje prawdziwego Production Check.
- [ ] **SOL-008 · TODO — stare wyniki Ninja są nieaktualne po #193.** Ponowić wszystkie Home/Ninja dopiero po zamknięciu wcześniejszych błędów, z rozdzieleniem soft recommendation, target batch i hard capacity oraz z modułem Home i temperaturą −11°C.
- [ ] **SOL-009 · TODO — historyczny audyt nie wykonał dokładnego bazowego układu Professional −11°C.** W macierzy Professional było −13°C, a −11°C testowano na Ninja. Dokładny przypadek Professional −11°C jest obowiązkową bazą SOL-001.
- [ ] **SOL-010 · TODO — RPC zaproszenia partnerskiego uruchamia się przed gotową sesją.** `rpc/gellatti_accept_my_partner_invitation_v1` zwraca HTTP 400 `authentication_required`, ponieważ wywołanie biegnie przed zakończeniem inicjalizacji użytkownika i dostępnością `auth.uid()`. Po podłączeniu sesji błąd nie występuje. Należy później zweryfikować bramkowanie RPC stanem gotowej sesji.
- [ ] **SOL-011 · TODO — panele Studio pokazują użytkownikom PRO wewnętrzne pojęcia Engine.** `OptimizationPreviewPanel` i `BranchWorkflowPreviewPanel` ujawniają NPAC, POD oraz określenie „solver”. Należy później zastąpić je językiem klienta zgodnym z zasadą Gellatti, bez zmiany logiki Engine.
- [ ] **SOL-012 · TODO — komunikat odmowy Produkcji podaje niewłaściwą przyczynę.** UI mówi o konieczności odświeżenia weryfikacji produktów również wtedy, gdy rzeczywistą przyczyną są brakujące dane procesu. Należy rozdzielić przyczyny i pokazywać komunikat odpowiadający rzeczywistemu blockerowi.
- [ ] **SOL-013 · TODO — CACAO ma podejrzane dane składu `water=0 / totalSolids=100`.** CACAO przechodzi obecnie NUTRITION, LABEL i PRODUCTION, ale jakość tych wartości wymaga osobnego audytu źródła. Nie poprawiaj ich przez zgadywanie ani automatyczne wyliczenie.
- [ ] **SOL-014 · RESOLVED_IN_PR_AWAITING_MERGE — stagingowa baza zawiera migrację reklasyfikującą, której nie ma jeszcze w scalonym stagingowym repo.** PR #198 dopasowuje pliki do zastosowanych wersji `20260906003955` i `20260906004154`, lecz pozostaje draftem, nie jest scalony ani wdrożony. Status można zmienić na `RESOLVED_ON_STAGING` dopiero po zwykłym merge, deploymencie dokładnego merge SHA i dowodzie braku ponownego wykonania SQL.
- [ ] **SOL-015 · TODO — natychmiastowe Undo po Apply może być no-op.** Kompletna logika Undo i snapshot istnieją, lecz UI nie bramkuje akcji stanem trwającego Apply.
- [ ] **SOL-016 · TODO — wynik 10/10 nie gwarantuje idempotencji przy Multi-Main.** Fixed point istnieje, ale ścieżka null hypothesis wymaga braku `mainIntent`, przez co ponowne przeliczenie może nadal proponować zmiany.
- [ ] **SOL-017 · TODO — zielony „Wynik aktualny” może być pokazany przy dirty draft.** Aktualny staging pokazywał zielone `10` równocześnie z komunikatem „Receptura się zmieniła”.
- [ ] **SOL-018 · TODO — świeży draft może zostać potraktowany jako receptura historyczna.** Guard obejmuje starter template, ale nie każdą niezapisaną working copy.
- [ ] **SOL-019 · TODO — odświeżanie niezapisanej working copy prowadzi do dead-endu.** Refresh bez saved recipe/version ID bezwarunkowo zwraca `saved_version_required`.
- [x] **SOL-020 · RESOLVED_LATER — CACAO PURO było zaklasyfikowane jako `other`.** Późniejszy audyt potwierdził binding `chocolate_cocoa`, formę `cocoa_powder`, `MAIN_ALLOWED` i pełne wymagane role.
- [ ] **SOL-021 · TODO — w PRO montowany jest niewłaściwy panel Guide.** #197 zmienił responsywny shell i swipe, ale audytowane wejście nadal pokazywało ogólny `ContextualEducationView`.
- [x] **SOL-022 · RESOLVED_LATER — stary układ Label został zastąpiony właściwym układem.** PR #199 przywrócił autorytet bieżącej etykiety i usunął ustawienia z głównego widoku Label.
- [x] **SOL-023 · RESOLVED_LATER — pętla CACAO Apply → stale → ponowne przeliczanie → blokada Produkcji.** Późniejszy E2E oraz role w bazie potwierdziły NUTRITION, LABEL i PRODUCTION bez stale bindingu.
- [ ] **SOL-024 · TODO — komunikat po skanowaniu Crunchy Sante ukrywa gotowość produktu wyłącznie jako topping.** Exact GTIN `5900617002228` prowadzi do właściwego produktu z `TOPPING_ONLY` i `TOPPING_READY`, ale UI mówi, że produkt „wymaga jeszcze weryfikacji”.
- [ ] **SOL-025 · TODO — starter Professional 1000 jest projekcją Home 670.** Fresh flow może utworzyć starter/key/fingerprint dla Home 670, a następnie tylko przeskalować materialne wiersze do deklarowanego Professional 1000.
- [ ] **SOL-026 · TODO — Sorbet Preview nie przechodzi własnego Apply proof.** Preview publikuje propozycję, której trustless Apply nie potrafi zaakceptować.
- [ ] **SOL-027 · TODO — Vegan picker pokazuje nabiał jako selectable Base.** Picker dopuszcza nabiał jako Base w profilu Vegan.
- [ ] **SOL-028 · TODO — Protein Multi-Main przekracza watchdog.** Przypadek Protein z wieloma składnikami Main nie kończy obliczeń w wymaganym czasie.
- [ ] **SOL-029 · TODO — otwarty Guide znika po zmianie desktop → tablet/mobile.** Problem dotyczy zachowania otwartego panelu podczas zmiany breakpointu, nie geometrii plansz.
- [ ] **SOL-030 · TODO — draft Label pomija topping i finalną masę.** Draft korzysta tylko z bazy; dla bazy 1000 g i toppingu 25 g powinien przedstawiać produkt finalny 1025 g.
- [x] **SOL-031 · RESOLVED_ON_STAGING — draft Label nie przedstawia znanych alergenów.** Bieżąca poprawka Owner QA po #208 zachowuje wszystkie znane deklaracje Base/Main/Topping/pozostałych składników nawet wtedy, gdy inny składnik ma `UNKNOWN`; ręczna końcowa linia receptury lub partii pozostaje najwyższym autorytetem. Jeden wspólny modal przed drukiem dla EU/UK/US/CA/AU-NZ/World pozwala uzupełnić dowolną część brakujących danych albo pominąć je bez usuwania znanej części. Pominięte wartości nie tworzą pustych wierszy, zer, `UNKNOWN` ani tekstu „bez alergenów”, a braki nie blokują podglądu, snapshotu, PDF ani wydruku. Główny ekran etykiety ogranicza się do nazwy, podglądu, dwóch kompaktowych wierszy oraz `Drukuj`/`Zmień`; bez zmian Scannera, Mappera, Product Registry ani Engine. Evidence: PR #216; head `73186e957858b91de2877928144a818ed8296fab`; merge i finalny staging SHA `5091cd866581f9d4993e7333c74e09328601cc02`; staging CI run `34060072184` PASS; canonical `staging.pinguinoai.com` zwraca HTTP 200 i wskazuje na deployment `dpl_6ZKwjNiZiLV7GQzT4iCzuHdJnuQq` o statusie READY. Staging Supabase `tunabqqrwabacxjcxxkz` zastosował wyłącznie migrację `20260906192729_nonblocking_label_print_snapshots.sql`; RPC `production_save_label_snapshot_v3` jest potwierdzone w wygenerowanych typach i zdalnym ledgerze. Produkcyjny `main` pozostał na `0a523544b79f3f1c6b0881b8605a639f5ac1b027`. `OWNER QA PENDING`; `OWNER ACCEPTED: NO`.
- [ ] **SOL-032 · TODO — wyścig gotowości Produkcji Sorbet po Apply/Save.** Gotowość Produkcji może być oceniona przed ustabilizowaniem aktualnego stanu po Apply lub Save.
- [ ] **SOL-033 · TODO — aktywny backend Scannera pochodzi częściowo z niezmergowanego PR #186.** Ledger migracji i aktywne funkcje zawierają elementy workstreamu `claude/scanner-complete`, których nie ma w scalonym stagingowym repo.
- [x] **SOL-034 · RESOLVED_ON_STAGING — geometria Knowledge Tour w pełnym webie, mobile i embedded PRO została poprawiona przez #204 i zaakceptowana w Owner QA 2026-09-06.** Evidence: PR #204; merge SHA `6f71ac6a`; web PASS; mobile PASS; prawy podgląd dashboardu PASS; `OWNER ACCEPTED: YES`.
- [ ] **SOL-035 · TODO — automatycznie generowany LOT jest błędnie pokazywany jako brakujący zamiast od razu pojawić się na etykiecie.**
- [ ] **SOL-036 · TODO — nowa etykieta nie inicjalizuje i nie pokazuje dzisiejszej daty produkcji.**
- [ ] **SOL-037 · TODO — etykieta jest błędnie blokowana przez wymóg potwierdzenia składników z Produkcji.**
- [ ] **SOL-038 · TODO — brakujące dane są pokazywane jako bierna lista zamiast edytowalnych pól; brakuje kompletnego przejścia ZMIEŃ → Ustawienia → Wróć.**
- [ ] **SOL-039 · TODO — HOME nie odczytywał opublikowanego werdyktu „Przelicz i popraw”.**
- [ ] **SOL-040 · TODO — HOME nie miał działającego etapu wykonania po „Zróbmy to”.**
- [ ] **SOL-041 · TODO — frakcyjny stabilizator dla Gelato/Vegan/Protein nadal używa Sorbet-only authority.**
- [ ] **SOL-042 · TODO — odczyt kodu zależy od orientacji produktu; Cola Zero wymagała obrócenia puszki.** Evidence (Owner QA 2026-09-06, druga awaria; przyczyna ustalona 2026-09-07): przyczyną nie jest dekoder ani brak pętli rotacji, lecz kształt wycinka. `PolicyState.cropOn` (`src/scan-core/policy.ts`) budował ROI jako prostokąt osiowy, używając `widthPx` jako rozmiaru w X i `heightPx` w Y, ignorując `angleDeg`. `widthPx` to długość kodu wzdłuż JEGO osi odczytu, więc było to poprawne tylko dla kodu poziomego; dla kodu pionowego wycinek wychodził transponowany — niski i szeroki plaster przez środek wysokiego kodu, zawierający paski, ale ani jednego guard pattern. Żaden dekoder tego nie odczyta, przy żadnych opcjach i żadnej rotacji. To wyjaśnia okres asymetrii: 0 i 180 stopni są dla dekodera liniowego nieodróżnialne i oba działały, 90 i 270 są nieodróżnialne i oba zawodziły; „cyfry na dole” to czynność sprowadzenia osi odczytu do poziomu. Wcześniejsza poprawka rotacji (`36e38f16`) nigdy nie trafiła na `staging` — potwierdzone przez `git merge-base`. Naprawa: `cropOn` rzutuje obrócony prostokąt tak samo jak `candidateBox` w `quality.ts` (no-op przy 0 stopni), a ścieżka zbliżeniowa `LOW_MEDIUM` — dokładnie ta, na którą trafia klient trzymający puszkę przy obiektywie — dostaje ten sam próg eskalacji `harder` po dwóch nietrafieniach, który `NATIVE_ROI` już miał; wcześniej miała `harder: false` bezwarunkowo. Kontrakt: `src/scan-core/rotatedCropSOL042.test.ts` (8 przypadków: 0/90/180/270, płaskie opakowanie i zakrzywiona puszka); cofnięcie rzutowania powoduje awarię dokładnie przy 90 i 270 stopniach.
- [ ] **SOL-043 · TODO — klient widzi surowe statusy techniczne, np. `INGREDIENTS_EVIDENCE_REQUIRED`, `roleReadiness` i `recognition`.** Evidence (Owner QA 2026-09-06, nawrót; przyczyna ustalona 2026-09-07 na danych stagingu): picker znalazł zapisany produkt Cola Zero (`CA-ING-007185`), pokazał aktywny przycisk „Dodaj do receptury”, a naciśnięcie nie dodało nic i wypisało surowe zdanie z dwoma UUID. Binding NIE był brakujący: `a5eee764-0b47-4279-b3b6-84d2d41f3065` jest `is_current`, `binding_status` = `ready`, na dokładnie `products.current_version_id`. Przyczyna: dwie autoryzacje miały dwie różne reguły widoczności. `search_products_v1` dopuszcza produkt na pięć warunków, w tym `customer_added_product_accounts` — tabelę, którą tworzy sam skaner — a `resolve_product_behavior_evidence_gate_v1` znała tylko `visibility = shared`, dwie kolumny właścicielskie, `created_by` i admina. Cola Zero jest podpięta do `home@` i `pro@`, a utworzona przez `home@`, więc dla drugiego konta wyszukiwarka ją widziała, a bramka nie. Powtórzony UUID jest podpisem tej sytuacji: bramka buduje powód jako `coalesce(v_product_id::text, p_entity_id)` i `coalesce(v_version_id::text, p_entity_id)`, więc przy braku wiersza OBA pola przyjmują wysłane `p_entity_id` (id wersji). Żaden kod klienta nie podstawia wersji za produkt. Naprawa: migracja `20260907013000_behavior_gate_sees_linked_customer_products.sql` uczy bramkę tych samych dwóch predykatów, których używa wyszukiwarka (nie nadaje żadnego nowego dostępu), zastosowana na stagingu i zweryfikowana na wdrożonym ciele funkcji. Druga przyczyna: sanitizer istniał, ale był opt-in — `homeCustomerNotice` przekazywały tylko dwa montowania HOME, a picker jest jednym komponentem dzielonym z PRO, więc ta sama odmowa była spokojna na jednym ekranie i surowa na drugim. Lista przeniesiona do `src/copy/customerSafeNotice.ts` i stosowana w pickerze DOMYŚLNIE; dopisane wzorce na goły UUID, dowolny kod SCREAMING_SNAKE oraz klucze statusów camelCase — `INGREDIENTS_EVIDENCE_REQUIRED` i `roleReadiness` z tego wpisu NIE były wcześniej łapane.
- [ ] **SOL-044 · TODO — niejasny lifecycle prywatnego produktu oraz przejścia do wspólnego Product Registry; niezrozumiałe „Zgłoś do weryfikacji”.** Evidence (audyt Product Registry, 2026-09-07, na wdrożonych funkcjach stagingu): `product_kind = customer_provisional` + `visibility = internal` + `owner_user_id NULL` NIE oznacza „prywatny dla konta”. Oznacza jeden centralny wiersz na EAN, nieposiadający właściciela, czytelny dla kont wymienionych w `customer_added_product_accounts`; Cola Zero (`distinct_customer_count = 2`) jest podpięta jednocześnie do `home@` i `pro@`. Zdanie na ekranie „Zapisano jako Twój produkt (prywatny, widoczny tylko na Twoim koncie)” jest więc twierdzeniem klienta, a nie stanem zapisanym w bazie, i jest nieprawdziwe dla produktu podpiętego do wielu kont. Evidence (implementacja kontraktu Ownera 2026-09-07): lifecycle jest teraz jednoznaczny. Nowy produkt nie jest klasyfikowany przed zakonczeniem calej automatycznej sciezki; decyzja zapada raz, na koncu, z tego samego kanonicznego profilu, ktory ta sciezka wyprodukowala. PM to `visibility=account_private` + `owning_account_id` (wymuszone przez `products_canonical_privacy_check`), a nie dawne `internal` bez wlasciciela — wiec prywatny produkt jest naprawde prywatny. `customer_added_products` stracilo `UNIQUE (normalized_ean)` na rzecz unikalnosci per (EAN, wlasciciel), bo model jednego wiersza na EAN byl dokladnie tym, co pozwolilo Coli Zero nalezec jednoczesnie do home@ i pro@. Polityka RLS `products_customer_added_linked_read` zostala zwezona o `owning_account_id is null or = auth.uid()`, wiec zabladzony wiersz w tabeli linkujacej nie moze wystawic cudzego PM.
- [ ] **SOL-045 · TODO — kamera komputerowa pokazuje kod zbyt rozmyty do odczytu.** Należy sprawdzić rzeczywistą rozdzielczość strumienia, autofocus i rozdzielczość klatki przekazywanej dekoderowi. Evidence (Owner QA 2026-09-06, rozszerzenie; przyczyny ustalone 2026-09-07): „lewo zachowuje się jak prawo, góra jak dół” to DWA różne defekty. Poziomy jest obrazem: `open()` prosi o `facingMode: environment` jako `ideal` (słusznie — `exact` nie powiodłoby się na laptopie), komputer nie ma tylnej kamery, więc przeglądarka oddaje kamerę PRZEDNIĄ i nic jej nie lustrzy; nielustrzana kamera przednia to widok, jaki ma na nas druga osoba. Pionowy jest zdaniem: nic w potoku nie odwraca osi Y, ale każda wskazówka była poleceniem ruchu KAMERĄ („Unieś telefon wyżej”), a na komputerze kamera stoi i rusza się PRODUKT. Rozmycie ma trzy współdziałające przyczyny: historia ostrości była zasilana wyłącznie klatkami z kandydatem, a klatka rozmyta to dokładnie ta, która kandydata nie daje; próg był wyłącznie względny wobec mediany bieżącej sesji, więc sesja rozmyta od pierwszej klatki obniżała własną medianę i test nie mógł się nigdy odpalić; a gałąź dla kamer stałoogniskowych wymagała `autofocus === false`, podczas gdy przeglądarki desktopowe nie ujawniają ani capability, ani setting, więc wartość to `null` i gałąź była nieosiągalna dokładnie tam, gdzie stałe ogniskowe występują. Podgląd nie miał `max-width` i miał sztywny portret 3:4, więc na stronie Produkty rozciągał się na całą kanwę 1280 px (wideo 1280x1706), a `object-cover` obcinał ~58% kadru 16:9 poza widok, podczas gdy dekoder analizował cały kadr — klient celował w ramkę, która nic nie znaczyła dla silnika. Naprawy: podgląd lustrzany tylko dla kamery przedniej (dekoder nigdy), lustrzana także WARSTWA nakładki ROI, dwa głosy wskazówek o identycznym kierunku, `max-w-[420px]` i `sm:aspect-video`, bezwzględny próg rozmycia obok względnego, historia ostrości zasilana każdą klatką, oraz desktop bez zgłoszonego autofocusu traktowany jak stałoogniskowy. Kontrakt: `src/features/scan-flow/desktopCameraSOL045.test.ts` (12 przypadków). Sprawdzono też jawnie pytanie Ownera: ŻADNA gałąź desktopowa nie może odpalić dla gościa na telefonie — jedynym klasyfikatorem w ścieżce skanera jest `formFactor()`, który dla iPhone nie zwraca `desktop`. Automatyczny zoom gościa należy do tego samego wpisu: `maxZoomSteps: 2` nie był limitem sesji, lecz budżetem NA TOŻSAMOŚĆ ŚCIEŻKI — `rearm()` zeruje go przy każdej zmianie id, a kod zgubiony na ponad 500 ms dostaje nowe id, więc każde ponowne złapanie tej samej puszki dawało kolejne dwa kroki, a `ScanCoreCapture.zoomLevel` mnożył poprzednią wartość zgłoszoną przez urządzenie i nic nigdy nie wracało do 1: x1.5, x2.3, x3.5, x5.3, x8, x10. Zgodnie z decyzją Ownera drabinka została USUNIĘTA, nie ograniczona; sesja jawnie wraca do 1x, `probeZoom` przywraca stan bezwarunkowo (restore siedział w gałęzi `typeof before === number`, a iOS Safari nie zgłasza `zoom` przed pierwszym ustawieniem, więc pierwsza sonda zostawiała własny cel), a techniczne „x10” zniknęło z ekranu klienta.
- [x] **SOL-046 · RESOLVED_ON_STAGING — komunikat o brakującej cenie jest techniczny, za długi i wyświetlany podwójnie.** Evidence: Owner QA 2026-09-06 na canonical `staging.pinguinoai.com`, staging SHA `f6778265b2bf8f302d446055417524c235eb1c84`. Potwierdzono jeden krótki komunikat wskazujący produkt bez ceny, bez technicznych i powielonych komunikatów; „Moja cena” działa; po wpisaniu i zapisaniu ceny komunikat znika; koszt partii zostaje przeliczony; matematyka kosztów nie została naruszona. `OWNER ACCEPTED: YES`. Historyczny zakres: brak ceny dla toppingu `LIME · MASTER MARTINI VARIEGATO · AJ01AQ`; docelowa treść **„Wprowadź cenę dla LIME · MASTER MARTINI VARIEGATO · AJ01AQ.”** Nazwa pochodzi z aktualnej receptury, bez hardcode produktu; obliczanie kosztów, zapisana cena użytkownika, Engine i dane produktu pozostają niezmienione.
- [ ] **SOL-047 · TODO · DESIGN — końcowy, spójny przegląd wyglądu, układu i komunikacji wszystkich powierzchni klienta HOME i PRO.** Ten nadrzędny punkt jest realizowany jako przedostatni etap całego workstreamu. Kolejne uwagi dotyczące wyłącznie wyglądu, układu, odstępów, nazw widocznych dla klienta i responsywności otrzymują kolejne unikalne podpunkty `SOL-047.x`. Ostatnim etapem pozostaje pełny test końcowy wszystkich przepływów.

  1. **SOL-047.1 · TODO — wynik receptury w PRO.** Evidence: Owner QA 2026-09-06, PRO Receptura. Na zrzucie wynik `8` znajduje się w dolnym pasku, a docelowe miejsce jest wolną trzecią kolumną obok kalorii i kosztu. W fazie DESIGN usunąć cały obecny blok wyniku z dolnego paska receptury i przenieść go do prawego panelu. Kalorie (`kcal / 100 g`), koszt partii i wynik receptury mają tworzyć jeden uporządkowany rząd. Wynik nadal pokazuje liczbę w okręgu oraz wyłącznie jedno krótkie słowo; usunąć „Wynik aktualny”, „Bardzo dobrze dopasowana” i dodatkowe zdanie opisowe. Zamrożona reguła: wynik `10` → **„Bellissimo!”**. Pozostałe jednowyrazowe kandydaty to między innymi „Świetnie!”, „Dobrze!”, „Nieźle!” i „Popraw!”, ale przed implementacją należy odczytać istniejące przedziały oceny, przygotować mapowanie bez zmiany progów i przedstawić je Ownerowi do zatwierdzenia. Nie zmieniać sposobu obliczania wyniku, progów Engine, kolorów stanu, momentu aktualizacji ani danych receptury. Desktop: wynik jest trzecim elementem obok kalorii i kosztu. Tablet: elementy zachowują równy rytm i nie nachodzą na siebie. Mobile: elementy mogą przejść do kolejnego wiersza, ale wynik nie może wrócić do dolnego paska. Układ nie może skakać przy zmianie wyniku; liczba i komunikat pozostają czytelne; dostępność nie może opierać się wyłącznie na kolorze. Sprawdzić Gelato, Sorbet, Vegan i Protein. Jest to wyłącznie zmiana prezentacji i położenia.

  2. **SOL-047.2 · TODO — ekran Scannera HOME odbiega od zaakceptowanego języka wizualnego HOME.** Evidence: Owner QA 2026-09-06, Scanner HOME. W późniejszej, przedostatniej fazie DESIGN przejrzeć typografię, odstępy, wielkości i kształty przycisków, hierarchię informacji, nadmierne puste przestrzenie, wygląd kamery i ramki, ekrany sukcesu, braków i błędów, spójność mobile/desktop, zgodność ze wspólnymi komponentami HOME oraz brak skakania i migania układu. Nie implementować tego redesignu w ramach checkpointu ledgera. Funkcjonalne błędy Scannera pozostają osobnymi SOL.

- [ ] **SOL-048 · TODO — Scanner pokazuje mikrosekundowe, zmieniające się komunikaty i pozwala spóźnionym odpowiedziom nadpisywać aktualny stan.** Evidence: Owner QA 2026-09-06. Informacje zmieniają się tak szybko, że nie można ich przeczytać; przy nieruchomym produkcie komunikat czasami się stabilizuje, ale podczas normalnego skanowania UI wygląda, jakby „wariowało”, a obrazy lub stany przelatują w tle. Terminalny wynik nie jest odpowiednio zatrzaśnięty. Jest to błąd maszyny stanów i współbieżności, nie wyłącznie DESIGN.
- [ ] **SOL-049 · TODO — nowy produkt rozpoznany po dokładnym EAN nie przechodzi pełnego enrichmentu i Mapper Rescue; kończy jako produkt prywatny albo automatycznie zgłoszony do weryfikacji.** Evidence: Owner QA 2026-09-06. Nestea Mango-Piña 330 ml, EAN `8411092721032`: nazwa została rozpoznana, lecz produkt zapisano wyłącznie jako prywatny, bez jasnej próby publikacji w Product Registry. Haribo Favoritos Original, EAN `842617014032`: dostępne były EAN, skład i tabela odżywcza, ale UI automatycznie pokazało „Zgłoszono do weryfikacji”; Owner nie uruchomił świadomie żadnego zgłoszenia ani nigdy nie zatwierdził automatycznego wysyłania produktu do ręcznej weryfikacji. Docelowa ścieżka: `dokładny EAN → źródła/dowody → Vision/OCR → Mapper Rescue → kanoniczne bramki → Product Registry`; jeżeli dowodów brakuje, pokazać konkretną prośbę o brakujące dane. Zakazane domyślne zakończenia to automatyczny prywatny produkt, automatyczne wysłanie do weryfikacji, „Damy znać” bez realnego i świadomie uruchomionego procesu oraz wiele prywatnych kopii tego samego EAN. SOL-044 pozostaje TODO: opisuje niejasny model lifecycle prywatny produkt → Product Registry, podczas gdy SOL-049 dokumentuje konkretną awarię wykonania pełnej ścieżki exact-EAN → enrichment → Mapper Rescue. Evidence (audyt Product Registry, 2026-09-07): ścieżka wspólnego Product Registry ZOSTAŁA wykonana, ale wyłącznie jako WYSZUKANIE istniejącego wiersza po EAN. `gellatti_upsert_customer_added_product_v1` szuka `visibility = shared and product_kind = commercial_product and product_code like PR-ING-%`; gdy nic nie znajdzie, jedyna pozostała gałąź wstawia wiersz z literałami `customer_provisional`, `internal` i `owner_user_id = null`. To stałe, nie wyrażenia — żadne wejście, flaga ani właściwość konta ich nie zmieni. W całym stosie skanera NIE MA gałęzi, która potrafi UTWORZYĆ wiersz wspólnego Registry; publikacja jest osobną, świadomie uruchamianą akcją („Zgłoś do weryfikacji” przez `gellatti_submit_product_request_v1` do przeglądu admina), a `discoveredExact` w `src/scan-import-v2/discovery/discovery.ts` dodatkowo zwraca `entityKind: customer_provisional` i `canonical: false` bezwarunkowo. Odpowiedź na pytanie Ownera: nic nie zostało odrzucone przez bramkę — skaner nie ma kodu, który publikuje. Gdyby ten literał usunąć, następną PRAWDZIWĄ bramką nie jest gotowość techniczna, lecz `canonical_verification_status`: wiersz powstaje jako `manual_unverified` z `canonical_provenance = customer_added_scanner_v1`, a jedynym miejscem ustawiającym `verified`/`human` jest transakcja kanonizacji. Obie sesje QA zakończyły się `roleReadiness = BASE_READY` z pustą listą blokerów (accuracy 87.8 i 96.8), a wszystkie trzy produkty mają `profile_permissions.BASE_RECIPE = true` — czyli brak przydatności do receptury NIE był powodem zapisu prywatnego. Evidence (implementacja kontraktu Ownera 2026-09-07): sciezka do wspolnego Product Registry ISTNIEJE juz w kodzie. `gellatti_upsert_customer_added_product_v1` kieruje wynik dwiema bramkami — `finalConfidence > 85` ORAZ `productionReady` — gdzie `productionReady` pochodzi z istniejacego kanonicznego werdyktu `gellattiReadiness`, a nie z drugiej listy pol. 85,00 nie jest powyzej 85 (porownanie jest scisle `> 85`). Trzy wyniki: PR-ING (wspolny, od razu, bez kolejki i bez statusu oczekujacego), PM-ING READY (prywatny, uzywalny) oraz PM-ING UNVERIFIED (prywatny, niegotowy, widoczny w Produkty → Niezweryfikowane). Literaly, ktore robily z kazdego produktu CA — `set_config(app.product_article_origin, CUSTOMER_ADDED)` oraz `'customer_provisional','internal'` — zniknely z wdrozonego ciala funkcji; zweryfikowane zapytaniem po zastosowaniu migracji. Wszystkie 18 produktow `CA-ING-*` na stagingu usunieto w jednej transakcji ze straznikiem wlasnosci; po usunieciu CA = 0 i zero sierot.
- [ ] **SOL-050 · TODO — prywatne produkty niegotowe nie mają własnego miejsca, kompletnego edytora ani dobrowolnej ścieżki wysłania do weryfikacji.** Evidence: decyzja Ownera 2026-09-06. Evidence (implementacja kontraktu Ownera 2026-09-07): filtr `Niezweryfikowane` istnieje w hamburgerze (Produkty → Niezweryfikowane, `/products?filter=unverified`) i pokazuje wylacznie prywatne produkty aktualnego uzytkownika, ktore nie przeszly production readiness — przez RPC `gellatti_my_unverified_products_v1`, ktore zwraca braki JEZYKIEM KLIENTA, nigdy `roleReadiness`, `binding_missing`, `INGREDIENTS_EVIDENCE_REQUIRED` ani nazw RPC. „Uzupelnij dane" wchodzi w TEN SAM formularz uzupelniania, ktorego uzywa skaner, podajac mu zapisany kod (`/products/scan?code=`) — jeden formularz i jedna authority, bez drugiego edytora. Produkt znika z filtra sam, gdy uzyska gotowosc. Niegotowy produkt zapisuje sie wylacznie na wyrazne zyczenie klienta („Zapisz i uzupelnij pozniej"); nic nie zapisuje niezweryfikowanego produktu automatycznie.

  Docelowy kontrakt:

  1. W hamburger menu, w obszarze produktów, powstaje dodatkowa pozycja **Niegotowe**.
  2. `Niegotowe` pokazuje wszystkie prywatne produkty użytkownika, którym brakuje danych technicznych wymaganych do użycia w recepturze.
  3. Produkt niegotowy nie może znikać po zakończeniu skanowania ani prowadzić do martwego ekranu. Scanner zapisuje go w `Niegotowe`.
  4. Po wejściu w produkt użytkownik widzi wszystkie znalezione dane i dostępne źródła, jednoznacznie wskazane brakujące pola, możliwość uzupełnienia braków i poprawienia istniejących danych, zapis zmian oraz przycisk `Wyślij do weryfikacji`.
  5. Jako braki pokazujemy wyłącznie dane rzeczywiście potrzebne do uzyskania gotowości technicznej dla co najmniej jednej roli i użycia produktu w lodach.
  6. Nie są brakami blokującymi: alergeny, cena, dane wymagane wyłącznie do publikacji w Product Registry ani inne informacje niewpływające na obliczenia i bezpieczeństwo techniczne receptury.
  7. Po każdym zapisie system ponownie uruchamia istniejący Mapper Rescue oraz właściwy authority. Jeżeli danych nadal brakuje, produkt pozostaje w `Niegotowe`. Jeżeli profil uzyska `engineReady` i gotowość przynajmniej jednej roli, produkt automatycznie przechodzi do `Moje produkty`; gotowego produktu prywatnego można od razu używać w recepturze i produkcji. Ukończenie produktu nie wymaga wcześniejszej weryfikacji ani publikacji w Product Registry.
  8. Dane wpisane przez użytkownika są jego danymi/override’em. Nie nadpisują bezpośrednio Mappera ani wspólnego Product Registry i nie niszczą oryginalnych dowodów źródłowych.
  9. `Wyślij do weryfikacji` jest zawsze dobrowolne: użytkownik może wysłać produkt niekompletny albo w pełni uzupełniony; wysłanie nie jest wymagane do prywatnego używania gotowego produktu; nic nie może wysyłać się automatycznie; wysłanie nie oznacza automatycznego dodania do Product Registry. Produkt trafia do Product Registry dopiero po przejściu właściwego procesu weryfikacji.
  10. Produkt wysłany do weryfikacji nie znika z konta i nie zostaje zablokowany. Użytkownik widzi prosty status `Wysłano do weryfikacji`.
  11. Przycisk `Wyślij do weryfikacji` musi być dostępny zarówno przy produkcie w `Niegotowe`, jak i przy gotowym produkcie prywatnym w `Moje produkty`.
  12. Edycja danych technicznych w tym przepływie jest dostępna dla produktów prywatnych znajdujących się w `Niegotowe`. Ten punkt nie wprowadza edytora wspólnych produktów z Product Registry.

  Rozróżnienie:

  - **Niegotowe** — prywatny produkt bez wystarczających danych do lodów.
  - **Moje produkty** — prywatny produkt gotowy do użycia.
  - **Product Registry** — zweryfikowany wspólny produkt dostępny wszystkim.

  Kryteria akceptacyjne:

  1. Nieudany lub niepełny skan tworzy widoczny wpis w `Niegotowe`.
  2. Użytkownik może ponownie otworzyć produkt po wylogowaniu, zalogowaniu i odświeżeniu.
  3. Wszystkie znalezione dane są widoczne.
  4. Brakujące dane techniczne są przedstawione prostym językiem, bez surowych enumów.
  5. Użytkownik może uzupełniać i poprawiać pola.
  6. Zapis ponownie uruchamia Mapper Rescue.
  7. Gotowy produkt przechodzi z `Niegotowe` do `Moje produkty`.
  8. Gotowy prywatny produkt działa w pickerze, recepturze i produkcji.
  9. Brak alergenów ani ceny nie zatrzymuje przejścia.
  10. Wysłanie do weryfikacji działa przed i po uzupełnieniu.
  11. Nic nie jest wysyłane automatycznie.
  12. Weryfikacja nie blokuje dalszej edycji ani prywatnego użycia.
  13. Nie powstają duplikaty tego samego produktu użytkownika.
  14. Mapper, Engine i Product Registry nie są bezpośrednio nadpisywane danymi użytkownika.

- [ ] **SOL-051 · TODO — produkt WANILIA ma nieprawidłową nazwę pochodzącą z Mappera.** Produkt lub składnik waniliowy jest wyświetlany z błędną pisownią, na przykład `VANILIA`. Należy ustalić konkretny rekord `PI-ING`, wszystkie jego aliasy oraz miejsce, z którego błędna nazwa trafia do aplikacji.

  Oczekiwane nazwy:

  - polski: `WANILIA`;
  - angielski: `VANILLA`;
  - `VANILIA` nie może być wyświetlane jako nazwa kanoniczna.

  Zakres późniejszej naprawy:

  1. znaleźć dokładny rekord lub rekordy wanilii w Mapperze;
  2. sprawdzić nazwę kanoniczną, tłumaczenia, aliasy i duplikaty;
  3. ustalić, czy błąd pochodzi z Mappera, importu, lokalizacji czy warstwy prezentacji;
  4. poprawić nazwę w jednym kanonicznym źródle, a nie maskować literówki wyłącznie w UI;
  5. nie zmieniać kompozycji, parametrów technologicznych, ID ani zachowania Engine;
  6. sprawdzić HOME i PRO: wyszukiwarkę składników, picker, recepturę, zapis i ponowne otwarcie, listę składników oraz etykietę;
  7. potwierdzić, że poprawka nie tworzy drugiego produktu ani nie rozłącza istniejących receptur;
  8. dodać test zabraniający kanonicznego napisu `VANILIA`.

  `SOL-051 STATUS: TODO`; `OWNER ACCEPTED: NO`.

## SOL-014 migration dependency checkpoint — 2026-09-06

This is a read-only reconciliation checkpoint, not a migration plan and not an
authorization to execute SQL.

- `origin/staging`: `f03038d06efc41325a715cdd66ded2cc1e1d835b`.
- PR #181: OPEN draft, API base SHA `7cb20e7f564f3a2f36cd9b42014c544de89afdaf`,
  head SHA `5adcd5345f5ce1c67304aaac39248b52a107a78c`, behind staging.
- PR #198 before reconciliation: OPEN draft, API base SHA
  `c66c1d011a8f5cd5d16005aaa012b775a3a29776`, head SHA
  `d6825f5046f376d9de97942ac6884e026d0f1da1`, behind staging.
- PR #198 after merging current staging and committing the first read-only
  reconciliation snapshot: OPEN draft, API base SHA
  `f03038d06efc41325a715cdd66ded2cc1e1d835b`; that snapshot was commit
  `561aa9c0c098a79be705700751c5993b36b282b8`. Later ledger-only checkpoint
  commits may advance the PR head without changing this dependency finding. No
  merge or staging deployment has occurred.

| Operation                             | Applied remote version                                    | Repository state at checkpoint                                                                                                     | Reconciliation required before merge                                           |
| ------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| BASE_ONLY nutrition/label classifier  | `20260905103024_base_only_nutrition_label_permission`     | PR #181 has semantically identical SQL as `20260905120000_base_only_nutrition_label_permission.sql`; staging has no source file    | Rename the PR #181 file to the applied version without changing executable SQL |
| Customer private not-ready product    | `20260905132215_customer_private_not_ready_product`       | Source exists only on unmerged PR #186; staging has no source file                                                                 | Remains frozen under SOL-033; it is not a semantic prerequisite of #181/#198   |
| BASE_ONLY nutrition reclassification  | `20260905142334_reclassify_base_only_nutrition_bindings`  | PR #181 has semantically identical SQL as `20260905120100_reclassify_base_only_nutrition_bindings.sql`; staging has no source file | Rename the PR #181 file to the applied version without executing it again      |
| Current Mapper lineage                | `20260906003955_mapper_lineage_current_binding`           | Staging uses the wrong local identity `20260905150000`; PR #198 corrects it by a 100% rename                                       | Keep the PR #198 canonical identity                                            |
| Stale Mapper-lineage reclassification | `20260906004154_reclassify_stale_mapper_lineage_bindings` | Staging has no source file; PR #198 contains the canonical applied identity                                                        | Keep the PR #198 canonical identity and never rerun it                         |

Semantic dependency and safe sequence:

1. First synchronize PR #181 with current staging and align its two filenames to
   applied versions `20260905103024` and `20260905142334`, preserving executable
   SQL.
2. Re-run #181 structural migration contracts and confirm those two operations
   are local/remote matches rather than pending.
3. Merge #181 normally into staging.
4. Merge the resulting staging into PR #198 normally; do not rebase or force
   push.
5. Confirm the repository execution order is classifier change → BASE_ONLY
   reclassification → current Mapper-lineage resolver → stale-lineage
   reclassification.
6. Only then merge #198 normally and verify the exact deployed merge SHA plus
   no repeated migration SQL.

PR #198 semantically depends on #181: its stale-lineage reclassification invokes
the canonical queue and classifier and asserts the NUTRITION/PRODUCTION
relationship introduced by #181. Green CI on #198 does not replace that database
ordering requirement. The wider remote-only Scanner history remains SOL-033 and
is not repaired by this checkpoint.

## SOL-031 Owner QA correction checkpoint — 2026-09-06

This checkpoint extends the existing SOL-031; it does not allocate another SOL ID.

- Before: one `UNKNOWN` ingredient could suppress known allergen statements from
  other recipe roles, and market preflight could block preview/PDF/print.
- After: known statements survive through preview, snapshot, every renderer and
  direct PDF; the shared print dialog is prefilled with that known text and a skip
  preserves it. When no statement is known, skipping omits the complete allergen
  row.
- Scope: `masterLabel.ts`, the shared print-missing-data dialog and controls,
  `LabelWorkspace.tsx`, `DraftLabelCard.tsx`, the six market renderers, direct PDF,
  label snapshot repository/RPC v3, navigation return handling, focused tests and
  the GEL-P0-033 owner-locked contract. Scanner, Mapper, Product Registry and
  Engine were not changed.
- Evidence on staging base `eee9de7e`: 28 focused files / 360 tests passed;
  `verify:staging` passed owner/protected-path guards, 22 contract files / 215
  tests, typecheck, lint with zero errors and production build.
- Merge/deployment evidence: PR #216 head `73186e957858b91de2877928144a818ed8296fab`
  merged as final staging SHA `5091cd866581f9d4993e7333c74e09328601cc02`;
  staging CI run `34060072184` passed all four jobs; canonical
  `staging.pinguinoai.com` returns HTTP 200 from READY deployment
  `dpl_6ZKwjNiZiLV7GQzT4iCzuHdJnuQq`.
- Migration evidence: staging Supabase project `tunabqqrwabacxjcxxkz` applied only
  `20260906192729_nonblocking_label_print_snapshots.sql`; RPC
  `production_save_label_snapshot_v3` is present in generated types and the
  remote migration ledger. Production was not touched.
- Required Owner QA after merge: mobile and web layout; `Drukuj → uzupełnij / pomiń
→ podgląd systemowy → drukarka / powrót`; partial allergen continuity and omission
  of all unknown values for EU, UK, US, Canada, AU/NZ and World; refresh/reopen of
  the saved batch snapshot. `OWNER ACCEPTED: NO`.

## Recovery provenance

- SOL-001–SOL-014: original Solver ledger and append-only owner checkpoints.
- SOL-015–SOL-024: PROVENANCE-001 audit checkpoint.
- SOL-025–SOL-033: canonical ordering frozen after BASIC-PRO follow-up tests.
- SOL-034: recovered from the GUIDE owner checkpoint and resolved on staging by
  PR #204 with Owner acceptance on 2026-09-06.
- SOL-035–SOL-038: recovered verbatim from the LABEL owner checkpoint.
- SOL-039–SOL-045: restored from the owner reconciliation checkpoint of 2026-09-06.
- SOL-046: appended from Owner QA 2026-09-06 for PRO Receptura.
- SOL-047 and SOL-047.1: appended from the Owner DESIGN checkpoint of
  2026-09-06; DESIGN remains the penultimate workstream stage.
- SOL-047.2, SOL-048, and SOL-049: appended from Scanner Owner QA 2026-09-06.
- SOL-050: appended from the Owner decision of 2026-09-06 for incomplete private
  products and voluntary verification.
- SOL-051: appended from the Owner finding of 2026-09-07 for the canonical
  Polish and English vanilla names.
- Search of repository files, all Git refs, retained attachments, and retained task
  checkpoints found no assigned main SOL ID above SOL-051. SOL-052 is therefore the
  next free ID at this checkpoint.

## Status history

| Date       | ID      | Previous status               | New status                    | Evidence                                                                                                                                                                                                                                                                                                                   |
| ---------- | ------- | ----------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-06 | SOL-020 | RETEST_REQUIRED               | RESOLVED_LATER                | Later CACAO binding and role audit.                                                                                                                                                                                                                                                                                        |
| 2026-09-06 | SOL-022 | TODO                          | RESOLVED_LATER                | PR #199 and served Label audit.                                                                                                                                                                                                                                                                                            |
| 2026-09-06 | SOL-023 | RETEST_REQUIRED               | RESOLVED_LATER                | Later CACAO E2E and binding audit.                                                                                                                                                                                                                                                                                         |
| 2026-09-06 | SOL-014 | TODO                          | RESOLVED                      | Incorrect report-only transition; PR #198 was still draft, unmerged, and undeployed. Retained here so the status history is not erased.                                                                                                                                                                                    |
| 2026-09-06 | SOL-014 | RESOLVED                      | RESOLVED_IN_PR_AWAITING_MERGE | Owner correction: PR #198 contains the technical repair, but staging does not.                                                                                                                                                                                                                                             |
| 2026-09-06 | SOL-034 | TODO                          | RESOLVED_ON_STAGING           | PR #204; merge SHA `6f71ac6a`; web PASS; mobile PASS; prawy podgląd dashboardu PASS; `OWNER ACCEPTED: YES`.                                                                                                                                                                                                                |
| 2026-09-06 | SOL-031 | TODO                          | RESOLVED_IN_PR_AWAITING_MERGE | PR #208; whole-recipe final line, non-blocking UNKNOWN, local Ustaw/Zmień persistence; staging `f6778265`; Owner QA pending.                                                                                                                                                                                               |
| 2026-09-06 | SOL-046 | TODO                          | RESOLVED_ON_STAGING           | Canonical `staging.pinguinoai.com`; staging SHA `f6778265b2bf8f302d446055417524c235eb1c84`; Owner QA potwierdził komunikat, zapis ceny i przeliczenie kosztu bez naruszenia matematyki; `OWNER ACCEPTED: YES`.                                                                                                             |
| 2026-09-06 | SOL-031 | RESOLVED_IN_PR_AWAITING_MERGE | RESOLVED_ON_STAGING           | PR #208 merged as `cc141bbec4e23ef7bd4df9824fe13075b6ded26f`; confirmed ancestor of staging `ba9931e425e14e0aa53ccc3179a447bbcbdc55dc`; merge CI `34036953949` PASS; current-staging CI `34038500307` PASS; staging deployment Ready; `OWNER QA PENDING`; `OWNER ACCEPTED: NO`.                                            |
| 2026-09-06 | SOL-031 | RESOLVED_ON_STAGING           | RESOLVED_IN_PR_AWAITING_MERGE | PR #216 extended the existing SOL-031 after #208; head `73186e957858b91de2877928144a818ed8296fab` on base `eee9de7ebd7abbc232fbc89bc45c10d7ed966fa6`; Owner QA pending.                                                                                                                                                    |
| 2026-09-06 | SOL-031 | RESOLVED_IN_PR_AWAITING_MERGE | RESOLVED_ON_STAGING           | PR #216 merged as final staging SHA `5091cd866581f9d4993e7333c74e09328601cc02`; staging CI `34060072184` PASS; canonical deployment `dpl_6ZKwjNiZiLV7GQzT4iCzuHdJnuQq` READY and HTTP 200; migration `20260906192729_nonblocking_label_print_snapshots.sql` recorded on staging; `OWNER QA PENDING`; `OWNER ACCEPTED: NO`. |

No other current status was changed during the 2026-09-06 ledger
reconciliation or the staging-ledger checkpoint.
