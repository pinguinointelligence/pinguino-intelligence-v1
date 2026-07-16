PINGÜINO Intelligence
Kompletny Master Prompt dla Claude — UI/UX, Home, Pro, maszyny, Monitor, Constraint Solver i deployment
Wersja 1.0 • 16 lipca 2026
Dokument zastępuje wszystkie wcześniejsze, skrócone części i szkice. Należy przekazać Claude cały plik jako jedną nadrzędną specyfikację.
Cel dokumentu
Nie jest to opis koncepcyjny ani lista luźnych pomysłów. To gotowy prompt wykonawczy: Claude ma przeanalizować aktualną aplikację i repozytorium, zaprojektować właściwe rozwiązanie, wdrożyć je w istniejącej architekturze, uruchomić pełne testy i — po spełnieniu bramek jakości — opublikować zmiany online.
Jak używać tego dokumentu
Przekaż Claude cały dokument bez skracania. Wszystkie wymagania są częścią jednego zadania. Claude nie ma kończyć pracy na audycie, makietach ani ogólnym planie. Powinien przejść przez audyt, implementację, testy, deployment i raport końcowy, o ile nie wystąpi realna blokada bezpieczeństwa lub brak dostępu.
Repozytorium, działająca aplikacja i rzeczywiste dane w kodzie są źródłem prawdy dla stanu obecnego.
Niniejszy dokument jest źródłem prawdy dla docelowego doświadczenia użytkownika i wymaganych zachowań.
Nie wolno zmieniać matematyki kanonicznego silnika tylko po to, aby dopasować UI.
Nie wolno kopiować wyglądu ani układu MyGelato. PINGÜINO ma mieć własny język produktu.
Wartości maszyn i pojemności muszą być przechowywane z regionem, źródłem i statusem weryfikacji.
Deployment ma nastąpić dopiero po przejściu wszystkich testów i produkcyjnym smoke teście.
Spis zakresu
1. Rola Claude i zasady wykonania
16. Sterowanie preferencjami: słodycz, miękkość, kremowość, pełnia
2. Kontekst produktu i wymagania nienaruszalne
17. Blokowanie gramatury składników
3. Pełny audyt obecnej aplikacji i pinguinoai.com
18. Constraint Solver i przypadki bez rozwiązania
4. Docelowa architektura Demo / Home / Pro / Franchise
19. Preview / Apply / Save / Production
5. Zasada „kilka decyzji do receptury”
20. Historia, porównania, Undo, Explain i Confidence
6. Redesign strony startowej i podstron publicznych
21. Design System, czytelność, animacje i accessibility
7. Nowy App Shell, nawigacja i ikona Monitora
22. Plany, uprawnienia i ochrona własności intelektualnej
8. Jednorazowy onboarding maszyn Home
23. Dane, API, migracje i kompatybilność
9. Katalog maszyn, technologie i pojemności
24. Analityka produktowa
10. Profile technologiczne i mapowanie do istniejących trybów
25. Testy i bramki jakości
11. Doświadczenie Pro i wybór temperatury
26. Deployment online, rollback i raport końcowy
12. Przebudowa Recipe Builder / Studio
27. Definition of Done
13. Uproszczony Monitor Home
Aneks A. Zweryfikowane dane startowe maszyn
14. Pełny, modułowy Monitor Pro
Aneks B. Oficjalne źródła danych
15. Ocena 1–10 i Złoty Zakres
MASTER PROMPT — rozpoczęcie instrukcji dla Claude
Instrukcja nadrzędna
Pracujesz na istniejącym produkcie PINGÜINO Intelligence. Nie buduj odizolowanego prototypu. Masz przeanalizować aktualny kod i produkcję, następnie przebudować istniejące doświadczenie w sposób opisany poniżej. Zachowaj funkcje i dane użytkowników. Złożoność silnika ma pozostać pod spodem; użytkownik ma odczuwać prostotę, pewność i jakość.
1. Rola Claude i zasady wykonania
Działasz jednocześnie jako senior product designer, UX architect, frontend engineer, backend engineer, QA lead i release engineer. Nie ograniczaj się do kosmetycznej zmiany kolorów. Przeprojektuj hierarchię informacji, przepływy użytkowników, stany komponentów i architekturę prezentacyjną, ale zachowaj kanoniczny silnik oraz istniejące bezpieczne mechanizmy dostępu.
1.1. Obowiązkowa kolejność pracy
1. Otwórz i uruchom aktualne repozytorium lokalnie.
2. Sprawdź produkcyjną wersję pinguinoai.com na desktopie i mobile.
3. Zmapuj routing, design system, plany, engine modes, Profile, Studio, Optimizer, Monitor i miejsca użycia temperatur.
4. Zapisz krótki audyt problemów oraz plan implementacji w repozytorium lub raporcie roboczym.
5. Wdrażaj zmiany w małych, logicznych częściach, ale doprowadź całość do spójnego końca.
6. Uruchom testy po każdej większej części i napraw regresje na bieżąco.
7. Po przejściu wszystkich bramek wykonaj production build, deployment i smoke test.
8. Na końcu dostarcz raport ze zmianami, migracjami, testami, commitem i adresem wdrożenia.
1.2. Zasady decyzyjne
Nie pytaj o potwierdzenie przy każdej drobnej decyzji. Podejmuj rozsądne, udokumentowane decyzje zgodne z tą specyfikacją.
Nie udawaj wykonania. Jeśli nie masz dostępu do deploymentu, sekretów albo produkcyjnej bazy, zatrzymaj się w deployment-ready safe pause i dokładnie opisz blokadę.
Nie usuwaj istniejącej funkcji tylko dlatego, że zaśmieca ekran. Przenieś ją do Monitora, sekcji Expert, drawer, ustawień albo progresywnego ujawniania.
Nie dodawaj niekontrolowanego LLM do matematyki receptur. „AI” jest językiem produktu, ale wynik ma pochodzić z deterministycznego engine, solvera i zatwierdzonych reguł.
Nie wprowadzaj matematycznych korekt maszyn bez dowodów i testów fizycznych. Przygotuj wersjonowaną konfigurację, neutralne wartości domyślne i feature flags.
2. Kontekst produktu i wymagania nienaruszalne
PINGÜINO Intelligence jest zaawansowaną platformą do projektowania i optymalizacji receptur gelato, sorbetów, wariantów wegańskich i innych produktów mrożonych. Produkt ma dwa główne doświadczenia: Home dla użytkownika domowego oraz Pro dla profesjonalisty. Ta sama wiedza technologiczna jest prezentowana na zupełnie różnych poziomach złożoności.
2.1. Kanoniczne tryby i silnik
Kanonicznym punktem odniesienia pozostaje Base Engine −11°C.
Widoczne, zatwierdzone tryby użytkownika to: −11°C, −12°C, −13°C, Świeże, Ninja Gelato oraz Ninja Swirl.
Nazwa „Ninja 2” jest niedozwolona. Wszędzie ma zostać zastąpiona przez „Ninja Swirl”.
Świeże korzysta z istniejącej komórki −11°C zgodnie z aktualną architekturą.
Nie zmieniaj Base Engine, Temperature Regulator ani zatwierdzonych target bands bez osobnej, udokumentowanej przyczyny i testów.
Nie przywracaj zdeprecjonowanego NPAC, jeżeli aktualny engine działa na PAC/POD i aktualnych wskaźnikach.
Warstwa urządzeń Home jest konfiguracją wyboru profilu, pojemności, UX i przyszłych modyfikatorów — nie nowym silnikiem dla każdego modelu.
2.2. Obszary poza zakresem, których nie wolno przypadkowo naruszyć
Account Access, autoryzacja, sesje, pojedyncza aktywna sesja i zarządzanie urządzeniami.
Stripe, billing, ceny konfigurowalne przez admina oraz centralny entitlement resolver.
Mapper, mapper_basement, import produktów, identyfikacja i deduplikacja produktów.
Istniejące receptury, zapisy, audyt, historia oraz dane użytkowników.
Franchise access i jego specyficzne uprawnienia.
Produkcja Supabase i migracje niezwiązane z tym zakresem, chyba że nowa funkcja wymaga bezpiecznego rozszerzenia.
2.3. Filozofia produktu
PINGÜINO ma wyglądać jak premium consumer product, ale zachowywać moc profesjonalnego systemu.
Home nie ma czytać tabel technologicznych. Pro nie ma być pozbawiony danych. Oba doświadczenia mają korzystać z jednego silnika i jednego spójnego języka marki, ale z różną głębokością informacji.
Apple zamiast Excela: prostota na powierzchni, zaawansowanie pod spodem.
Jedno jasne pytanie na ekranie, jedna główna decyzja i jeden następny krok.
Użytkownik ma działać, a nie studiować instrukcję.
Najważniejszy przycisk ma być wyraźnie podświetlony; jeżeli wszystko świeci, nic nie jest ważne.
Efekt WOW ma wynikać z szybkości, płynności, precyzyjnej typografii i inteligentnej informacji zwrotnej, nie z neonów i przeładowania.
3. Pełny audyt obecnej aplikacji i pinguinoai.com
Przed implementacją wykonaj rzeczywisty audyt. Publiczny HTML może nie pokazywać całej aplikacji, dlatego oceń produkcję w przeglądarce, kod, routing i uruchomioną aplikację lokalną.
3.1. Ekrany i moduły do sprawdzenia
Landing page, hero, sekcje marketingowe, pricing, FAQ i footer.
Login, rejestracja, magic link, onboarding oraz wszystkie puste i błędne stany.
Home, Pro, Studio, Designer, Assistant Shell, Optimizer, Preview i Recipe Result.
Products, import, profile, account, billing, support i ustawienia.
Wszystkie miejsca wyświetlające temperatury, tryby maszyn, pojemność albo batch.
Wszystkie miejsca z −18°C i inne miejsca mieszające temperaturę serwowania z przechowywaniem.
Aktualny prawy panel, wskaźniki, bary, suwaki, karty i wszelkie istniejące elementy podobne do Monitora.
Desktop, tablet i mobile oraz nawigację klawiaturą.
3.2. Problemy, których należy aktywnie szukać
Za słaby kontrast, mały tekst, długie linie i ściany tekstu.
Elementy klikalne wyglądające jak zwykły tekst.
Selected states różniące się tylko minimalnie od niewybranych.
Kilka konkurujących primary CTA na jednym ekranie.
Za dużo kart, ramek, etykiet i drobnych parametrów naraz.
Techniczne pojęcia wymagane od Home, mimo że system może wybrać je automatycznie.
Pytanie Pro o model maszyny, mimo że profesjonalista powinien wybierać temperaturę produktu.
Niespójne nazwy, zwłaszcza temperatury, Ninja modes, produkcja, storage i serving.
Układ przypominający MyGelato: długa tabela, ciemny panel, czerwono-zielono-czerwone paski.
Brak oczywistego następnego kroku lub brak informacji, co system ustawił automatycznie.
3.3. Wynik audytu
Przygotuj zwięzłą tabelę: ekran, problem, ryzyko, proponowana zmiana, priorytet. Nie zatrzymuj pracy po audycie. Audyt ma prowadzić bezpośrednio do implementacji.
4. Docelowa architektura Demo / Home / Pro / Franchise
Plan / tryb
Główna decyzja
Monitor
Dane techniczne
Urządzenia Home
Demo / Free
Produkt i intencja; bez pełnych gramów
Bezpieczny teaser 1–10
Ukryte
Może zobaczyć demo wyboru
Home
Maszyna zapisana raz, potem smak i ilość
Uproszczony: 4 cechy + statusy
Ukryte
Główna metoda konfiguracji
Pro
Temperatura serwowania, produkt i ilość
Pełny, modułowy i konfigurowalny
Dostępne progresywnie
Opcjonalny tryb testowy
Franchise
Zgodnie z istniejącymi uprawnieniami
Zależnie od entitlement
Bez regresji
Zgodnie z polityką konta
4.1. Home
Home wybiera maszynę tylko przy pierwszym użyciu albo po świadomej zmianie w profilu.
Home nie wybiera temperatury, PAC, POD, target bands ani engine.
Maszyna określa technologię, pojemność roboczą, domyślny batch i właściwy istniejący tryb.
Kolejne receptury zaczynają się od smaku/produktu i ilości.
Home otrzymuje uproszczony Monitor i sterowanie preferencjami bez surowych parametrów.
4.2. Pro
Pro domyślnie wybiera temperaturę serwowania: −11°C, −12°C albo −13°C; Świeże tylko zgodnie z obecną logiką produktu.
Pro nie musi wybierać modelu maszyny.
Pro może opcjonalnie uruchomić profil maszyny Home do testu na Ninja, kompresorze lub misie chłodzonej.
Pełny Monitor Pro pokazuje wszystkie potrzebne parametry, ale pogrupowane i zwijane.
Profesjonalista może dostosować widok, przypinać wskaźniki i zapisać układ.
5. Zasada „kilka decyzji do receptury”
Sformułowanie „trzy kliknięcia” jest kierunkiem projektowym, a nie sztucznym limitem technicznym. Usuń każde pytanie, na które system zna odpowiedź z profilu, maszyny, produktu lub poprzedniego wyboru.
5.1. Home — pierwsze użycie
Wybór maszyny → krótka automatyczna konfiguracja → wybór produktu/smaku → ilość → receptura
5.2. Home — kolejne użycie
Produkt/smak → ilość → receptura
5.3. Pro
Temperatura → produkt/smak → ilość → receptura
5.4. Reguły interakcji
Jeśli model maszyny jednoznacznie definiuje pojemność, nie pytaj o nią ponownie.
Jeśli użytkownik ma domyślny batch, ustaw go automatycznie i pozwól zmienić w tym samym ekranie.
Nie twórz dziesięcioetapowego steppera. Maksymalnie 3 główne kroki widoczne dla użytkownika.
Pokaż małe podsumowanie wyboru i przycisk „Zmień”, zamiast ponownie otwierać cały proces.
Sticky primary CTA na mobile; na desktopie primary CTA zawsze widoczne bez szukania.
6. Redesign strony startowej i podstron publicznych
Landing page ma w ciągu kilku sekund odpowiedzieć: czym jest PINGÜINO, dla kogo, jak szybko daje efekt i dlaczego jest lepsze od zwykłego kalkulatora lub książki z przepisami.
6.1. Hero
Preferowany kierunek nagłówka
Idealna receptura. Dopasowana do Twojej maszyny lub temperatury.
Podtytuł: „Wybierz smak, urządzenie lub temperaturę i ilość. PINGÜINO zajmie się resztą.”
Primary CTA: „Stwórz recepturę”.
Secondary CTA: „Zobacz, jak działa”.
Po prawej lub poniżej: interaktywny podgląd Recipe Monitora.
Nie umieszczaj w hero długiej listy technologicznych funkcji.
Hero musi być czytelny także na telefonie bez poziomego przewijania.
6.2. Demo Monitora na landing page
Pokaż przykładową wanilię albo truskawkę. Demo ma wyglądać jak działający produkt, ale nie może ujawniać matematyki ani pełnych gramatur.
Dopasowanie receptury: 9/10.
Struktura: w optymalnym zakresie.
Słodycz: zbalansowana.
Kremowość: bardzo dobra.
Dopasowanie do urządzenia: gotowe.
Jedna bezpieczna mikrointerakcja, np. „bardziej kremowe”, po której demo płynnie aktualizuje wynik.
Informacja: uproszczony Monitor dostępny w Home, pełny Monitor w Pro.
6.3. Pozostałe sekcje landing page
1. Jak to działa: Wybierz → PINGÜINO dopasowuje → Przygotuj.
2. Home: wybór maszyny tylko raz, proste receptury i pojemność automatyczna.
3. Pro: kontrola temperatury, pełny Monitor, moduły techniczne i korekty.
4. Bezpieczne pokazanie przewagi: optymalizacja z blokadami składników.
5. Plan comparison bez ścian tekstu.
6. FAQ napisane prostym językiem.
7. Końcowe CTA oraz lekki, uporządkowany footer.
6.4. Redesign wszystkich podstron publicznych
Ujednolić pricing, login, register, forgot password, support, privacy i wszelkie publiczne ekrany. Mają korzystać z tej samej typografii, tokenów, przycisków, spacingu, radiusów, focus states i loading states.
7. Nowy App Shell, nawigacja i ikona Monitora
Monitor ma być jednym z charakterystycznych elementów PINGÜINO. Nie stosuj klasycznego hamburgera jako metafory Monitora.
7.1. Ikona Monitora
Ma przypominać mały ekran, inteligentny panel lub prosty monitor.
W stanie zamkniętym może pokazywać mały badge „9/10”, ale nie może dominować nad CTA.
Na desktopie otwiera prawy drawer lub floating panel, zachowując kontekst receptury.
Na mobile otwiera duży bottom sheet lub pełnoekranowy panel z łatwym zamknięciem.
Ikona ma posiadać czytelną etykietę dla screen readera: „Otwórz Monitor receptury”.
7.2. Górny pasek
Na ekranach receptury pokazuj tylko elementy potrzebne w danym kontekście: nazwę produktu, wybrany tryb/maszynę, Monitor, zapis i menu konta. Zaawansowane funkcje nie powinny tworzyć kilkunastu ikon.
7.3. Pasek kontekstu Home
Twoja maszyna: Ninja CREAMi Deluxe · pojemnik 706 ml    [Zmień]
Nie pokazuj w tym pasku nazwy engine, kodu technologii ani temperatury wybranej automatycznie.
8. Jednorazowy onboarding maszyn Home
Onboarding maszyny jest obowiązkowy tylko dla użytkownika Home bez zapisanej konfiguracji. Po zapisaniu nie wraca przy każdym tworzeniu receptury.
8.1. Pierwszy ekran
Nagłówek
Jakiej maszyny używasz?
Podtekst: „Wybierz urządzenie, a PINGÜINO automatycznie dopasuje sposób przygotowania i właściwą ilość.”
8.2. Lista startowa
Nie pokazuj od razu dziesiątek modeli. Pokaż najważniejsze rodziny jako czytelne kafelki i pole wyszukiwania. Model doprecyzuj tylko wtedy, gdy wpływa na pojemność lub technologię.
Ninja CREAMi.
Ninja CREAMi Deluxe.
Ninja CREAMi Scoop & Swirl.
Moulinex Freezi.
Sage / Breville Smart Scoop.
Magimix Gelato Expert.
Cuisinart ICE-100.
KitchenAid Ice Cream Maker.
Cuisinart z misą chłodzoną.
Nie widzę mojej maszyny.
8.3. „Nie widzę mojej maszyny”
Nie pytaj użytkownika o słowa „re-spin”, „kompresor” ani „frozen bowl”. Pytaj o zachowanie urządzenia.
Odpowiedź użytkownika
Opis pomocniczy
Mapowanie wewnętrzne
Najpierw zamrażam całą mieszankę
Maszyna później rozdrabnia zamrożony blok.
respin
Maszyna sama chłodzi mieszankę
Wlewam płynną bazę, a urządzenie ją chłodzi i miesza.
compressor
Najpierw zamrażam tylko misę
Zamrożona misa chłodzi mieszankę podczas mieszania.
frozen_bowl
Maszyna wydaje miękkie lody z dozownika
Płynna baza jest chłodzona i wydawana jako soft.
continuous_soft_serve — tylko gdy wspierane
Ninja Swirl musi być sklasyfikowany jako respin_soft, nie jako profesjonalna continuous soft serve machine.
8.4. Dane dodatkowe dla nieznanej maszyny
Marka i model — opcjonalnie.
Pojemność pojemnika lub misy.
Czy istnieje linia MAX FILL.
Maksymalna ilość mieszanki podana w instrukcji.
Jednostka ml / l; przechowuj wewnętrznie w ml.
Jeżeli użytkownik zna tylko pojemność całkowitą, zastosuj konserwatywny, oznaczony fallback i pozwól edytować.
8.5. Animacja automatycznej konfiguracji
Po wyborze pokaż krótkie przejście trwające około 1–2 sekund. Nie udawaj długiej analizy.
Rozpoznano urządzenie ✓Ustawiono właściwą ilość ✓Dopasowano sposób przygotowania ✓Przygotowano Studio ✓
Następnie automatycznie przejdź do właściwego miejsca tworzenia receptury.
8.6. Zapis w profilu
Zapisz machineProfileId, region, resolved technology, capacity, default batch, working capacity, wybrany tryb i datę ustawienia.
Dla custom machine zapisz dane użytkownika oraz źródło typu „user_declared”.
Dodaj Profile → Moja maszyna → Zmień maszynę.
Starsze konta Home bez maszyny zobaczą onboarding przy kolejnym wejściu do Home, ale nie stracą danych ani dostępu do konta.
9. Katalog maszyn, technologie i pojemności
Katalog ma być wersjonowaną warstwą danych. Nie wpisuj pojemności przypadkowo w komponentach. Każdy rekord musi mieć rynek, źródło, datę weryfikacji i status.
9.1. Rozróżnij pojemności
Pojemność fizyczna pojemnika lub misy.
Maksymalna ilość płynnej mieszanki.
Zalecana pojemność robocza.
Minimalny sensowny batch.
Maksymalny batch.
Domyślny batch.
Pojemność gotowego produktu, jeśli producent podaje ją osobno.
MAX FILL jako specjalną regułę, nie tylko liczbę.
9.2. Produkcyjny model danych
type MachineTechnology =  | 'respin'  | 'respin_soft'  | 'compressor'  | 'frozen_bowl'  | 'continuous_soft_serve';type MachineSpecificationStatus =  | 'verified'  | 'provisional'  | 'needs_review'  | 'conflicting_sources';type MachineCapacity = {  vesselCapacityMl: number | null;  maximumLiquidMixMl: number | null;  workingCapacityMl: number | null;  minimumBatchMl: number | null;  maximumBatchMl: number | null;  defaultBatchMl: number | null;  finishedProductCapacityMl?: number | null;  maxFillDefinedByManufacturer: boolean;};type HomeMachineProfile = {  id: string;  brand: string;  family: string;  modelCodes: string[];  market: string;  technology: MachineTechnology;  resolvedVisibleMode:    | 'fresh'    | 'ninja_gelato'    | 'ninja_swirl';  capacity: MachineCapacity;  requiresPreFreeze: boolean;  preFreezeTarget: 'mixture' | 'bowl' | 'none';  servingStyle: 'scoop' | 'soft' | 'both';  specificationSourceUrl?: string;  specificationVerifiedAt?: string;  specificationStatus: MachineSpecificationStatus;  active: boolean;};
Dostosuj nazwy do istniejącej architektury zamiast tworzyć niepotrzebny równoległy system.
9.3. Reguła regionu i sprzecznych źródeł
Ta sama rodzina urządzenia może mieć inne pojemniki w EU, UK i US. Oficjalne strony mogą też zawierać niespójne dane pomiędzy stroną produktu i stroną akcesoriów. Nie wybieraj arbitralnie jednej liczby. Rekord musi wskazywać model i rynek; sprzeczność oznacz jako conflicting_sources i rozstrzygnij instrukcją konkretnego modelu przed aktywacją.
10. Profile technologiczne i mapowanie do istniejących trybów
Technologia
Przykład
Tryb widoczny / mapowanie
Status recepturowy
respin
Ninja CREAMi / Deluxe
Ninja Gelato
Istniejący tryb; walidować per model
respin_soft
Ninja Scoop & Swirl
Ninja Swirl
Istniejący tryb
compressor
Freezi, Sage, Magimix, ICE-100
Świeże
Korzysta z istniejącej komórki −11°C
frozen_bowl
KitchenAid, ICE-21, ICE-30
Świeże jako neutralna baza
Profil pojemności/UX; modyfikatory dopiero po testach
continuous_soft_serve
Taylor, Carpigiani Soft itd.
Pro / future
Nie mieszać z Home respin_soft
10.1. Zasada testowalności
Nie twórz osobnego engine dla każdego modelu.
Nie koduj arbitralnych zmian dekstrozy, tłuszczu, stabilizatora lub suchej masy w UI.
Przyszłe modyfikatory maszyn muszą być konfigurowalne, wersjonowane, odwracalne i objęte feature flag.
Domyślnie brak zweryfikowanego modyfikatora oznacza neutralne zachowanie istniejącego trybu.
Zapisuj configVersion w recepturze, aby można było odtworzyć wynik.
11. Doświadczenie Pro i wybór temperatury
Profesjonalista nie musi informować PINGÜINO, jaką ma maszynę. Główną kontrolą jest temperatura serwowania produktu.
11.1. Główny wybór Pro
−11°C.
−12°C.
−13°C.
Świeże, jeżeli pasuje do istniejącego zatwierdzonego use case.
Własna temperatura tylko w przyszłości i tylko jeżeli engine rzeczywiście ją wspiera.
11.2. −18°C
Przejrzyj każde wystąpienie −18°C. Jeżeli jest to temperatura przechowywania, hartowania albo zamrażarki, nie pokazuj jej obok temperatury serwowania. Użyj oddzielnych etykiet: „Temperatura serwowania”, „Produkcja / ekstrakcja” i „Przechowywanie”.
11.3. Urządzenia Home w Pro
Dodaj dyskretną opcję „Dopasuj do urządzenia domowego” lub „Tryb urządzenia”. Po aktywacji otwiera się ten sam katalog maszyn Home. Nie może być to domyślny pierwszy krok Pro.
12. Przebudowa Recipe Builder / Studio
Recipe Builder ma być głównym miejscem pracy. Użytkownik powinien widzieć składniki, gramatury, status blokady oraz prosty wynik. Zaawansowane dane otwiera Monitor.
12.1. Układ desktop
Główna kolumna: składniki i gramatury.
Górny pasek: produkt, tryb/maszyna, batch, Monitor, Save.
Prawy obszar: uproszczony podgląd lub Assistant, ale bez dublowania pełnego Monitora.
Monitor otwiera się w drawer i nie powoduje utraty scroll position ani edycji.
12.2. Układ mobile
Jedna kolumna.
Sticky CTA „Dopasuj recepturę” lub „Przelicz”.
Monitor jako bottom sheet.
Gramatura i lock dostępne dużymi targetami dotykowymi.
Brak poziomego scrolla tabeli.
12.3. Rząd składnika
[Nazwa składnika]   [gramatura] g   [AI / kłódka]   [menu]
Kliknięcie nazwy otwiera szczegóły produktu. Kliknięcie gramatury edytuje wartość. Kliknięcie kłódki zmienia stan ograniczenia. Menu zawiera usunięcie, zamianę i — w Pro — zakres min/max.
12.4. Główne CTA
Home powinien mieć jedną akcję: „Dopasuj recepturę”. Tworzy ona Preview zmian, nie modyfikuje cicho receptury. Pro może rozróżniać „Przelicz” (analiza bez zmian) i „Optymalizuj” (propozycja zmian), jeśli audyt potwierdzi, że użytkownik rozumie różnicę. Nie zmuszaj Home do wyboru między technicznymi akcjami.
13. Uproszczony Monitor Home
Home Monitor jest konsumencki i zrozumiały bez znajomości technologii. Nie jest miniaturą Pro Monitora z ukrytymi wierszami; zaprojektuj osobne doświadczenie.
13.1. Zawartość
Dopasowanie receptury: jedna ocena 1–10.
Słodycz.
Miękkość.
Kremowość.
Pełnia.
Stabilność jako status, niekoniecznie suwak.
Dopasowanie do zapisanej maszyny i pojemności.
Krótka informacja o tym, czy receptura dobrze zniesie ponowne zamrożenie, jeśli dotyczy.
13.2. Czego Home nie widzi
PAC, POD, dawne NPAC.
Ice fraction i freezing point.
Target bands i dokładne granice.
Szczegółowe cukry, laktoza, MSNF, woda, tłuszcz i ciała stałe.
Wagi scoringu oraz dokładny sposób przejścia z parametrów do oceny.
13.3. Przykład
MONITOR RECEPTURY9/10Świetnie dopasowanaSłodycz       Mniej  [−]  ●●●○○  [+]  WięcejMiękkość      Twardsze [−] ●●●○○ [+] Bardziej miękkieKremowość     Lżejsze [−] ●●●●○ [+] Bardziej kremowePełnia        Lekka [−] ●●●○○ [+] Pełniejsza✓ Dopasowana do Ninja CREAMi Deluxe✓ Właściwa ilość dla pojemnika✓ Dobra struktura po przygotowaniu
14. Pełny, modułowy Monitor Pro
Pro ma dostęp do wszystkich danych potrzebnych technologowi, ale informacje muszą być logicznie pogrupowane. Nie buduj jednej długiej tabeli z dwudziestoma równorzędnymi paskami.
14.1. Widok główny
Dopasowanie receptury 1–10.
Temperatura serwowania.
Status: gotowa / wymaga korekty / test rekomendowany.
Sześć kart podsumowania: Struktura, Miękkość, Słodycz, Kremowość, Pełnia, Stabilność.
Każda karta ma status i możliwość rozwinięcia.
14.2. Moduły rozwijane
1. Zachowanie w temperaturze: miękkość w serwowaniu, poziom zamrożenia, początek zamarzania, temperatura połowy zamrożenia.
2. Cukry i słodycz: odczuwalna słodycz, siła przeciwzamrożeniowa, cukry ogółem, sacharoza, dekstroza/glukoza, fruktoza, laktoza.
3. Woda i faza mrożona: woda, przewidywana ilość wody zamrożonej, woda wymagająca stabilizacji.
4. Tłuszcze i kremowość: tłuszcz ogółem, tłuszcz mleczny, wpływ na mouthfeel.
5. Białka i struktura: białko, składniki mleczne, ryzyko słabej struktury.
6. Ciała stałe i pełnia: total solids, fiber, cocoa/fruit solids, milk solids.
7. Stabilizacja: stabilizator, emulsja, ryzyko wydzielania wody i zachowanie podczas przechowywania.
8. Składniki specjalne: alkohol, sól, kakao, owoce, dodatki funkcjonalne.
9. Tryb Expert: oryginalne skróty techniczne i wartości, tylko gdy potrzebne.
14.3. Dostosuj widok
Pro może włączać/wyłączać moduły.
Może przypiąć wybrane parametry do Overview.
Może zmienić kolejność przypiętych elementów.
Układ zapisuje się per użytkownik.
Reset przywraca domyślne, bezpieczne ustawienie.
14.4. Przyjazne nazwy prezentacyjne
Termin techniczny / wewnętrzny
Nazwa prezentacyjna
Tooltip / Expert
PAC
Siła przeciwzamrożeniowa
PAC
POD
Odczuwalna słodycz
POD
Plasticity
Miękkość w serwowaniu
Plasticity
Ice fraction
Poziom zamrożenia
Ice fraction
Freezing point
Początek zamarzania
Freezing point
50% frozen water
Temperatura połowy zamrożenia
50% frozen water
Total solids
Ciała stałe / pełnia
Total solids
MSNF
Sucha masa mleczna beztłuszczowa
MSNF
Lactose sandiness risk
Ryzyko krystalizacji laktozy
Lactose risk
Water requiring stabilization
Woda wymagająca stabilizacji
Stabilization water
15. Ocena 1–10 i Złoty Zakres
15.1. Punkty zamiast procentu „poprawności”
Główny wynik publiczny ma być liczbą całkowitą 1–10. Nie pokazuj „94% poprawności”, ponieważ wygląda to jak obiektywny certyfikat laboratoryjny i zachęca do reverse engineeringu. Nazwa: „Dopasowanie receptury”.
Wynik
Komunikat
10/10
Wyjątkowo dobrze dopasowana
9/10
Świetnie dopasowana
8/10
Bardzo dobrze dopasowana
7/10
Dobrze dopasowana
6/10
Blisko optimum
5/10
Wymaga korekty
3–4/10
Wyraźnie niezbalansowana
1–2/10
Wymaga przebudowy
Brak danych
Brak wystarczających danych do oceny
Nie pokazuj dziesiętnych typu 8,7/10. Engine może liczyć z pełną precyzją; zaokrąglenie dotyczy wyłącznie warstwy prezentacyjnej.
15.2. Zasady mapowania
Nie zakładaj, że obecny score ma skalę 0–100. Najpierw sprawdź aktualną implementację.
Zbuduj jeden adapter normalizujący wynik do 1–10, objęty testami.
Mapowanie musi być monotoniczne, stabilne i nie może wpływać na decyzje engine.
Nie wysyłaj do klienta dodatkowej precyzji, jeżeli UI jej nie używa.
10/10 nie oznacza laboratoryjnej gwarancji. Wyjaśnij to w tooltipie.
15.3. Złoty Zakres
Nie używaj czerwony–zielony–czerwony jak MyGelato. PINGÜINO ma neutralną skalę z eleganckim złotym przedziałem optimum.
ZA MAŁO     BLISKO     [ ZŁOTY ZAKRES ]     BLISKO     ZA DUŻO───────────────╺━━━━━━━●━━━━━━━╸────────────────
Szary: neutralny / brak oceny.
Chłodny akcent: poprawny i informacyjny.
Złoty: optimum.
Bursztyn: odchylenie wymagające uwagi.
Czerwony: realny, istotny problem.
Każdy stan ma tekst, nie opiera się tylko na kolorze.
Optimum jest zakresem, nie jednym magicznym punktem.
16. Sterowanie preferencjami Home
Home może świadomie zmienić charakter receptury, ale posługuje się efektem sensorycznym, a nie parametrami technicznymi.
16.1. Cztery główne preferencje
Cecha
Lewy kierunek
Prawy kierunek
Znaczenie
Słodycz
Mniej słodkie
Bardziej słodkie
Odczuwalna słodycz, nie sama ilość sacharozy
Miękkość
Twardsze
Bardziej miękkie
Zachowanie po przygotowaniu i w serwowaniu
Kremowość
Lżejsze
Bardziej kremowe
Gładkość i odczucie kremowe
Pełnia
Lekka / delikatna
Pełniejsza
Body i mouthfeel wynikające z wielu składowych
16.2. Kontrola
Użyj przycisków minus i plus oraz pięciu dyskretnych pozycji.
Środek jest domyślnym wariantem zbalansowanym.
Parametry nie pokazują osobnej „oceny jakości” 1–10, ponieważ preferencja może świadomie odchodzić od środka.
Po zmianie pokazuj opis: mniej słodka, bardziej miękka, bardzo kremowa, pełniejsza.
Zmiana tworzy Preview, nie zapisuje automatycznie.
16.3. Pełnia
Pełnia jest przyjaznym agregatem prezentacyjnym. Może interpretować wpływ ciał stałych, tłuszczu, białka, błonnika i suchej masy mlecznej, ale nie zastępuje tych obliczeń w Pro. Użytkownik Home widzi „Lekka ↔ Pełna”; Pro może rozwinąć techniczne składowe.
17. Blokowanie gramatury składników
To jedna z kluczowych funkcji produktu. Użytkownik musi móc powiedzieć: „mam dokładnie tyle tego składnika i PINGÜINO nie może go zmienić”. Solver dopasowuje wszystkie pozostałe składniki do najlepszego możliwego wyniku.
17.1. Home — dwa proste stany
Stan
Ikona
Zachowanie
AI może zmieniać
Otwarta kłódka / AI
Składnik może zostać zmieniony przy Dopasuj recepturę.
Gramatura zablokowana
Zamknięta kłódka
Dokładna liczba gramów pozostaje nienaruszona.
17.2. Dokładne zachowanie kłódki
1. Użytkownik wpisuje gramaturę składnika.
2. Kliknięcie kłódki blokuje dokładną wartość w gramach.
3. Każde kolejne przeliczenie lub optymalizacja musi zachować tę wartość bez zmiany, nawet o 0,1 g, z uwzględnieniem precyzji systemu.
4. Ponowne kliknięcie kłódki odblokowuje składnik.
5. Po odblokowaniu użytkownik może dowolnie zmienić gramaturę ręcznie.
6. Po naciśnięciu „Dopasuj recepturę” AI/solver może ponownie zmienić ten odblokowany składnik.
7. UI musi jasno pokazywać, które wartości są chronione.
17.3. Pro — opcjonalny zakres
Pro może dodatkowo ustawić tryb Range: minimalna i maksymalna gramatura. Solver może poruszać się wyłącznie w tym przedziale. Nie komplikuj tym głównego Home flow.
Truskawki: 450 g   [zakres 400–500 g]   ↔
17.4. Batch i blokada
Domyślnie blokada oznacza absolutną gramaturę, nie procent receptury.
Zmiana całego batchu nie może cicho przeskalować zablokowanego składnika.
Solver dopasowuje resztę; jeżeli to niemożliwe, pokazuje konflikt.
W Pro można później dodać osobną, świadomą akcję „skaluj blokady proporcjonalnie”, ale nie może być domyślna.
18. Constraint Solver i przypadki bez rozwiązania
Solver ma maksymalizować jakość i Dopasowanie receptury, respektując twarde ograniczenia. Nie jest to swobodna generacja tekstowa. Wynik musi być deterministyczny, audytowalny i testowalny.
18.1. Hierarchia ograniczeń
1. Bezpieczeństwo i walidacja danych2. Zablokowane gramatury3. Zakresy min–max4. Batch i ograniczenia maszyny5. Cel produktu i temperatura6. Preferencje użytkownika7. Minimalizacja wielkości zmian
18.2. Brak złotego środka
Jeśli przy obecnych blokadach nie da się osiągnąć Złotego Zakresu, nie pokazuj ogólnego błędu. Wykonaj analizę wykonalności i wskaż konkretną przyczynę.
Nie można osiągnąć optymalnego balansu przy obecnych blokadach.Truskawki są zablokowane na 700 g.Aby wejść w optymalny zakres, ustaw maksymalnie 612 g.[Ustaw 612 g i przelicz] [Odblokuj] [Zmień zakres] [Pozostaw bez zmian]
18.3. Zasady rekomendacji minimalnej / maksymalnej gramatury
Podawaj dokładne „co najmniej xxx g” lub „maksymalnie xxx g” wyłącznie wtedy, gdy solver rzeczywiście wyliczył granicę wykonalności.
Nie zgaduj liczb na podstawie heurystyki prezentacyjnej.
Jeżeli pojedyncza zmiana nie wystarcza, pokaż najmniejszy zestaw koniecznych zmian.
Jeżeli istnieje wiele rozwiązań, preferuj najmniejszą zmianę i najmniejsze naruszenie intencji użytkownika.
Pozwól pozostawić recepturę poza optimum, ale pokaż uczciwy status i konsekwencję.
Zapisuj powód konfliktu i propozycję w historii optymalizacji.
18.4. Konflikty wielu blokad
Jeżeli kilka zablokowanych składników wspólnie uniemożliwia rozwiązanie, nie obwiniaj przypadkowo jednego. Pokaż grupę konfliktową i możliwe ścieżki: odblokuj jeden z nich, zmień zakres, zwiększ batch albo zaakceptuj wynik poza optimum.
18.5. Bezpieczny fallback
Jeżeli solver nie potrafi wiarygodnie znaleźć granicy, pokaż: „Przy obecnych blokadach nie znaleziono rozwiązania w optymalnym zakresie. Odblokuj jeden z zaznaczonych składników lub zmień batch.” Nie wolno przedstawiać fałszywej precyzji.
19. Preview / Apply / Save / Production
Te cztery stany muszą być jednoznacznie rozdzielone. Obecny system ma już ważną zasadę save-vs-apply i nie wolno jej rozmyć.
Stan
Znaczenie
Czy zmienia recepturę?
Preview
Pokazuje propozycję i wpływ na Monitor.
Nie
Apply
Przenosi zaakceptowane zmiany do bieżącej wersji roboczej.
Tak, w pamięci roboczej
Save
Tworzy zapisaną wersję / rewizję.
Tak, trwały zapis
Production
Świadome oznaczenie lub użycie produkcyjne.
Osobna, jawna akcja
19.1. Preview zmian
PINGÜINO proponuje:Śmietanka       120 g → 138 g     +18 gSacharoza        82 g → 74 g       −8 gDekstroza        60 g → 70 g      +10 gMleko           600 g              bez zmian · zablokowaneTruskawki       450 g              bez zmian · zablokowaneDopasowanie: 7/10 → 9/10[Zastosuj zmiany] [Anuluj]
19.2. Zasady
Suwaki Home i Pro tworzą preview.
Nie zapisuj przy każdym ruchu suwaka.
Nie uruchamiaj inventory write ani production write podczas preview.
Anulowanie przywraca dokładnie poprzedni stan.
Apply ma być odwracalne przez Undo do czasu Save.
Save tworzy nową rewizję, nie nadpisuje cicho historii.
20. Historia, porównania, Undo, Explain i Confidence
20.1. Historia receptury
Każdy Save tworzy nową rewizję: v1, v2, v3 itd.
Nie usuwaj poprzednich wersji przy optymalizacji.
Zapisuj autora, czas, przyczynę, maszynę/temperaturę, configVersion i summary zmian.
Użytkownik może przywrócić wersję; przywrócenie tworzy nową rewizję, nie niszczy historii.
20.2. Compare
Porównanie dwóch wersji pokazuje różnice gramatur, statusów lock/range, batchu, trybu, Monitora i głównych parametrów. Nie zasypuj Home technicznymi metrykami; Home widzi prostą listę zmian, Pro pełne moduły.
20.3. Undo i branches
Undo dla ostatniego Apply.
Restore dowolnej zapisanej wersji.
Branches mogą być funkcją Pro: np. „bardziej kremowa”, „mniej słodka”, „test Ninja”.
Nie wdrażaj branchingu kosztem podstawowego flow; jeśli wymaga dużego ryzyka, przygotuj architekturę i feature flag.
20.4. Explain — „Dlaczego?”
Każda optymalizacja ma ludzkie wyjaśnienie bez wzorów i bez target bands.
Dlaczego?Zmniejszono sacharozę o 8 g, ponieważ receptura była zbyt słodka.Dodano 10 g dekstrozy, aby utrzymać miękkość po zamrożeniu.Nie zmieniono mleka ani truskawek, ponieważ ich gramatury są zablokowane.
20.5. Dopasowanie a pewność danych
Nie mieszaj tych pojęć.
Wskaźnik
Co oznacza
Kto widzi
Dopasowanie receptury 1–10
Jak dobrze wynik odpowiada produktowi, trybowi i założeniom.
Home i Pro
Pewność danych 1–10 / status
Jak kompletne i zweryfikowane są dane składników i profilu.
Głównie Pro
Gotowość produkcyjna
Czy receptura jest gotowa, wymaga testu czy jest eksperymentalna.
Pro
Pewność może uwzględniać statusy Verified / PI Calculated / PI Generated / Manual Adjusted / PI Verified, ale nie może udawać wyniku laboratoryjnego.
21. Design System, czytelność, animacje i accessibility
21.1. Kierunek wizualny
Jasny, premium interfejs. Nie dark-first.
Dużo białej przestrzeni, ale bez marnowania powierzchni na desktopie.
Mniej ramek; hierarchia przez typografię, spacing i subtelne tło.
Złoto tylko dla optimum, nie dla wszystkiego premium i nie jako jedyny znak planu Pro.
Jedna rodzina ikon, jeden system radiusów i cieni.
Brak wizualnego podobieństwa do MyGelato.
21.2. Hierarchia przycisków
Typ
Zastosowanie
Wygląd
Primary
Dalej, Dopasuj, Zastosuj, Zapisz
Najwyższy kontrast; subtelne podświetlenie tylko gdy to następny krok
Selected card
Wybrana maszyna, temperatura, preferencja
Wyraźne tło, ramka, check; nie tylko 2% różnicy koloru
Secondary
Akcja alternatywna
Spokojna ramka / neutralne tło
Tertiary
Zmień, Pomiń, Dowiedz się więcej
Czytelny link tekstowy
Disabled
Nie można kontynuować
Jednoznacznie nieaktywna, ale tekst nadal czytelny
21.3. Typografia
Wyraźny H1, H2, body i helper text.
Nie używaj mikroskopijnych etykiet.
Ogranicz szerokość akapitów.
Krótki tekst w kartach i przyciskach.
Odpowiedni line-height i kontrast WCAG.
Nie nadużywaj uppercase.
21.4. Animacje
Płynne przejścia kroków i selected state.
Krótka konfiguracja maszyny.
Płynna aktualizacja Monitora.
Subtelny golden settle po wejściu w optimum.
Skeleton zamiast pustych ekranów.
Bez ciągłego pulsowania, parallaxu i animacji opóźniających pracę.
Obsłuż prefers-reduced-motion.
21.5. Accessibility
Pełna nawigacja klawiaturą.
Logiczny focus order i widoczne focus states.
Semantyczne przyciski zamiast klikalnych divów.
ARIA labels dla ikon, kłódek i Monitora.
ARIA live dla krótkiej konfiguracji i wyniku solvera.
Minimum touch target na mobile.
Nie polegaj wyłącznie na kolorze.
Screen reader musi usłyszeć zarówno „9 na 10”, jak i opis słowny.
22. Plany, uprawnienia i ochrona własności intelektualnej
22.1. Entitlements
Demo: projektowanie zgodnie z obecną polityką bez ujawniania pełnych gramów; bezpieczny teaser Monitora.
Home: dopasowanie do maszyny, automatyczna pojemność, uproszczony Monitor, limity planu Home.
Pro: pełny Monitor, suwaki, moduły, urządzenia Home jako opcja, zaawansowane porównania.
Franchise: zachowaj istniejące specyficzne uprawnienia.
Nie koduj planów w przypadkowych warunkach UI. Korzystaj z centralnego entitlement resolver.
22.2. Ochrona engine
Nie wysyłaj do browsera danych, których UI nie potrzebuje.
Dla Demo i Home zwracaj bezpieczne agregaty i statusy.
Nie umieszczaj tajnych stałych, wag scoringu i pełnych target bands w frontend bundle.
Jeżeli to możliwe, generuj Monitor payload po stronie serwera.
Pro może widzieć rzeczywiste dane kompozycji, ale nie wewnętrzne wagi solvera.
Nie kopiuj nazw, układu ani wizualizacji MyGelato.
23. Dane, API, migracje i kompatybilność
23.1. Nowe encje lub rozszerzenia
MachineProfile / MachineSpecification.
UserMachinePreference.
RecipeIngredientConstraint.
RecipeMonitorSafePayload.
RecipeRevision / OptimizationRun / ChangeExplanation.
UserMonitorLayout dla Pro.
Feature flags i configVersion dla profili maszyn.
23.2. Przykładowy constraint model
type IngredientConstraint =  | { mode: 'ai' }  | { mode: 'locked'; grams: number }  | { mode: 'range'; minGrams: number; maxGrams: number };type ConstraintConflict = {  ingredientIds: string[];  reasonCode: string;  message: string;  suggestedAction:    | { type: 'set_max'; ingredientId: string; grams: number }    | { type: 'set_min'; ingredientId: string; grams: number }    | { type: 'unlock'; ingredientId: string }    | { type: 'change_batch'; minimumBatchGrams?: number }    | { type: 'multiple_changes'; changes: unknown[] };};
23.3. API zachowania
Analyze: liczy stan i Monitor bez zmiany receptury.
Optimize Preview: zwraca propozycję, konflikty i wyjaśnienia bez trwałego zapisu.
Apply: stosuje wybrany preview z kontrolą wersji.
Save Revision: tworzy nową wersję.
Machine Profile: pobiera aktywny katalog i zapisuje wybór użytkownika.
Monitor: zwraca payload zgodny z entitlement i nie ujawnia niepotrzebnych pól.
23.4. Migracje
Migracje addytywne, bez usuwania danych.
Nullable fallback dla starszych kont.
RLS i constraints dla nowych tabel.
Nie ustawiaj istniejącym użytkownikom losowej maszyny.
Zapisane receptury pozostają odtwarzalne.
Przygotuj rollback albo bezpieczną procedurę wycofania.
Nie stosuj migracji produkcyjnej, jeżeli środowisko lub backup nie są potwierdzone.
24. Analityka produktowa
Jeżeli projekt ma analytics, dodaj zdarzenia bez wysyłania pełnych receptur i tajnych danych.
home_machine_onboarding_started
home_machine_selected
custom_machine_started / completed
machine_profile_saved / changed
recipe_monitor_opened
home_preference_changed
ingredient_locked / unlocked
optimization_preview_created
constraint_conflict_shown
suggested_fix_applied
optimization_applied
recipe_revision_saved
pro_temperature_selected
home_recipe_completed / pro_recipe_completed
25. Testy i bramki jakości
25.1. Testy jednostkowe
Mapowanie modeli do technologii i istniejących trybów.
Pojemność zależna od modelu i regionu.
Adapter score → 1–10 i zaokrąglenie wyłącznie w UI.
Lock zachowuje dokładną gramaturę.
Unlock ponownie pozwala solverowi zmienić składnik.
Range respektuje min i max.
Batch nie skaluje cicho locked grams.
Konflikt zwraca wiarygodną sugestię min/max albo uczciwy brak rozwiązania.
Home payload nie zawiera chronionych parametrów.
Statusy score i confidence.
25.2. Testy integracyjne
Zapis i odczyt maszyny w profilu.
Pomijanie onboardingu przy kolejnym wejściu.
Zmiana maszyny z Profile.
Custom machine dla respin, compressor i frozen bowl.
Home nie widzi temperatur ani engine.
Pro nie jest pytany o maszynę.
Pro może opcjonalnie włączyć profil Home.
Preview nie zapisuje; Apply i Save działają osobno.
Historia wersji i restore.
Entitlements Demo/Home/Pro/Franchise.
Brak regresji Account Access i Billing bridge.
25.3. E2E
Nowy użytkownik Home: wybór maszyny → konfiguracja → receptura.
Powracający Home: bez onboardingu.
Home: lock dwóch składników → dopasowanie reszty.
Home: niemożliwe optimum → komunikat z konkretną akcją.
Home: odblokowanie składnika → AI może go zmienić w kolejnym preview.
Pro: temperatura → produkt → Monitor → Optimize → Apply → Save.
Monitor desktop i mobile.
Landing demo.
Pricing i paywall.
Login, logout i odtworzenie sesji.
Responsive mobile/tablet/desktop.
25.4. Obowiązkowe gates
TypeScript clean.
Lint clean.
Wszystkie testy istniejące i nowe przechodzą.
Production build przechodzi.
Migracje zwalidowane.
Accessibility acceptance.
Local browser acceptance.
Brak utraty istniejących receptur.
Brak ujawnienia chronionych danych w network payload i bundle.
Produkcja po deployment przechodzi smoke test.
26. Deployment online, rollback i raport końcowy
26.1. Deployment
1. Wykonaj finalny production build.
2. Przygotuj czytelny commit lub serię logicznych commitów.
3. Push do właściwej gałęzi zgodnie z workflow repozytorium.
4. Zastosuj bezpieczne migracje, jeżeli są wymagane i środowisko jest potwierdzone.
5. Wdróż na aktualne środowisko obsługujące pinguinoai.com.
6. Poczekaj na zakończenie deploymentu i sprawdź produkcyjne logi.
7. Wykonaj smoke test landing, login, Home onboarding, Recipe Builder, Pro, Monitor, Profile i mobile.
8. Jeżeli wystąpi krytyczna regresja, wykonaj rollback.
26.2. Kiedy nie wdrażać
Nie przechodzą testy lub build.
Migracja może uszkodzić dane.
Brakuje sekretów lub dostępu.
Nie rozwiązano sprzecznych specyfikacji maszyny, a dane miałyby być pokazane jako pewne.
Frontend ujawnia target bands lub tajne stałe.
Nie da się przeprowadzić smoke testu.
26.3. Safe pause
W przypadku blokady przygotuj deployment-ready commit, raport z dokładnym powodem, instrukcję dokończenia i listę rzeczy, których nie udało się potwierdzić. Nie twierdź, że produkcja została wdrożona, jeżeli nie została.
26.4. Raport końcowy
1. Streszczenie audytu.
2. Lista zmienionych ekranów i przepływów.
3. Opis Home, Pro i obu Monitorów.
4. Lista aktywnych maszyn i pojemności ze statusem źródeł.
5. Opis lock/range/solver oraz przypadków bez rozwiązania.
6. Zmiany w danych, API i migracjach.
7. Wyniki TypeScript, lint, testów i build.
8. Commit hash i deployment URL.
9. Wynik smoke testu produkcji.
10. Pozostałe ryzyka i funkcje pozostawione za feature flag.
27. Definition of Done
☐ Nowy Home rozumie pierwszy ekran bez instrukcji.
☐ Home wybiera maszynę tylko raz i ustawienie zapisuje się w profilu.
☐ Maszyna automatycznie ustawia technologię, pojemność roboczą, default batch i właściwy istniejący tryb.
☐ Home może zmienić maszynę w Profile → Moja maszyna.
☐ „Nie widzę mojej maszyny” działa prostym językiem procesu.
☐ Pro domyślnie wybiera temperaturę, a nie model maszyny.
☐ Pro opcjonalnie korzysta z urządzeń Home.
☐ −18°C nie jest mylone z temperaturą serwowania.
☐ Główne flow wymaga minimum decyzji.
☐ Landing page natychmiast pokazuje wartość i demo Monitora.
☐ UI jest spójne na landing, auth, Home, Pro, Studio, Profile i pricing.
☐ Najważniejszy CTA jest zawsze oczywisty.
☐ Monitor ma własną ikonę ekranu, nie klasyczny hamburger.
☐ Home Monitor pokazuje 1–10 oraz Słodycz, Miękkość, Kremowość i Pełnię.
☐ Pro Monitor jest pełny, modułowy i konfigurowalny.
☐ Wygląd nie przypomina MyGelato.
☐ Złoty Zakres jest własnym, czytelnym wzorcem PINGÜINO.
☐ Ocena 1–10 jest zaokrąglana tylko w UI.
☐ Home nie otrzymuje surowych target bands ani matematyki.
☐ Kłódka zamraża dokładną gramaturę składnika.
☐ Ponowne kliknięcie odblokowuje i pozwala AI zmienić składnik przy kolejnym dopasowaniu.
☐ Pro może ustawić zakres min–max.
☐ Solver zawsze respektuje lock i range.
☐ Przy braku optimum system pokazuje konkretną, wyliczoną rekomendację albo uczciwą informację o braku rozwiązania.
☐ Preview, Apply, Save i Production są rozdzielone.
☐ Historia, Undo, Compare i Explain działają bez utraty danych.
☐ Istniejący Base Engine i regulatory nie zostały przypadkowo zmienione.
☐ Istniejące plany, access, billing, mapper i franchise nie mają regresji.
☐ TypeScript, lint, testy i build przechodzą.
☐ Produkcja została wdrożona i sprawdzona albo istnieje uczciwy deployment-ready safe pause.
Aneks A. Zweryfikowane dane startowe maszyn
Poniższe dane są punktem startowym do seedowania katalogu, ale Claude ma je ponownie potwierdzić w oficjalnej instrukcji konkretnego modelu i regionu przed oznaczeniem jako verified. Nie zastępują modelu źródłowego i statusu weryfikacji.
Maszyna / region
Technologia
Oficjalna pojemność / limit
Uwagi produkcyjne
Ninja CREAMi NC302EU (EU/ES)
respin
2 × 473 ml według strony produktu
Używaj MAX FILL; oficjalne strony akcesoriów podają również 450 ml — rozstrzygnąć per pojemnik/model.
Ninja CREAMi Deluxe NC502EU (EU/ES)
respin
2 × 706 ml według katalogu/strony produktu
Oficjalna strona akcesoriów podaje 680 ml — oznacz conflicting_sources do rozstrzygnięcia instrukcją.
Ninja CREAMi Scoop & Swirl NC7 (EU/ES)
respin_soft
480 ml według oficjalnego katalogu
Nie klasyfikować jako continuous soft serve.
Moulinex Freezi MJ803AF0 (ES)
compressor
do 1,0 l lodów; 1,4 l napoju mrożonego
Przechowuj capacity per product program.
Magimix Gelato Expert
compressor
1,0 l lodów; 1,3 l sorbetu/granity; misy fizyczne 2 l
Nie mylić pojemności misy z working capacity.
Cuisinart ICE100E (EU)
compressor
1,5 l gotowego deseru według producenta
Zweryfikować maximum liquid mix w instrukcji.
Cuisinart ICE21E (EU)
frozen_bowl
1,4 l
Misa wymaga pre-freeze.
Cuisinart ICE30BCE (EU)
frozen_bowl
2,0 l
Misa wymaga około 12 h pre-freeze.
KitchenAid 5KSMICM (UK/EU)
frozen_bowl
1,9 l gotowych lodów z maks. 1,4 l płynnej mieszanki
Working liquid mix = maks. 1,4 l; pre-freeze misy min. 16 h.
Sage/Breville Smart Scoop BCI600
compressor
Pojemność wymaga potwierdzenia w instrukcji konkretnego rynku
Technologia self-cooling potwierdzona; nie zgaduj batchu.
Aneks B. Oficjalne źródła danych
W promptach i kodzie używaj oficjalnych stron lub instrukcji producentów jako źródła prawdy. Adresy są podane jako materiał roboczy; zweryfikuj ich aktualność w dniu implementacji.
PINGÜINO Intelligence: https://www.pinguinoai.com/
Ninja CREAMi NC302EU: https://ninjakitchen.es/productos/ninja-creami-nc302eu-zidNC302EU
Ninja CREAMi katalog i porównanie pojemności: https://ninjakitchen.es/catalogo-ninja/heladeras-ninja/
Ninja CREAMi Deluxe akcesorium 680 ml: https://ninjakitchen.es/productos/tarrinas-con-tapa-2-unidades-para-creami-deluxe-nc5-zidXSKPNTLD2EUUK
Moulinex Freezi MJ803AF0: https://www.moulinex.es/p/heladera-freezi-prepara-helados-y-bebidas-heladas-al-momento-5-programas-automaticos-silenciosa-8-raciones-blanca/8010001501
Magimix Gelato Expert: https://www.magimix.com/en/gelato-expert/112-gelato-expert-5018399116801.html
Cuisinart ICE100E: https://www.cuisinart.eu/fr_FR/cuisinart-ice-cream-gelato-professional-ICE100E.html
Cuisinart ICE21E: https://www.cuisinart.eu/fr_FR/cuisinart-cool-scoops-sorbeti%C3%A8re-ICE21E.html
Cuisinart ICE30BCE: https://www.cuisinart.eu/fr_FR/cuisinart-sorbeti%C3%A8re-deluxe-2l-ICE30BCE.html
KitchenAid 5KSMICM: https://www.kitchenaid.co.uk/mixer-attachments/859711690400/ice-cream-maker-5ksmicm-white
Sage Smart Scoop BCI600: https://www.sageappliances.com/en-gb/product/bci600
Koniec MASTER PROMPT
Ostateczna instrukcja dla Claude
Nie kończ na koncepcji. Przeanalizuj aktualny produkt, wdroż rozwiązanie w istniejącym repozytorium, zabezpiecz engine i dane, uruchom wszystkie testy, wykonaj deployment oraz produkcyjny smoke test. Jeśli prawdziwa blokada uniemożliwia deployment, pozostaw deployment-ready safe pause i podaj dokładne, weryfikowalne informacje.