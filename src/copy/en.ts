/**
 * Kanoniczne polskie copy interfejsu. Struktura kluczy jest gotowa do późniejszej lokalizacji.
 * Komponenty korzystają z tego źródła zamiast powielać komunikaty.
 */
export const copy = {
  brand: {
    name: 'GELLATTI',
    sub: 'FRIENDLY LAB',
    full: 'GELLATTI',
  },
  /** PI status vocabulary (Masterplan §12.7 — full engine set + UI chip states). */
  status: {
    ideal: 'Idealnie',
    good: 'Dobrze',
    risky: 'Wymaga uwagi',
    tooSoft: 'Za miękkie',
    tooHard: 'Za twarde',
    tooSweet: 'Za słodkie',
    tooWeak: 'Za mało intensywne',
    tooExpensive: 'Za drogie',
    premium: 'Premium',
    needsCorrection: 'Do poprawy',
    locked: 'Zablokowane',
    pro: 'Pro',
    // Customer-facing tier chip — never "Demo" (Phase 6C rebrand).
    demo: 'Bezpłatny podgląd',
  },
  /** Ingredient confidence levels (Masterplan §16). */
  confidence: {
    verified: 'Potwierdzone',
    veryHigh: 'Bardzo wysoka pewność',
    high: 'Wysoka pewność',
    estimated: 'Oszacowane',
    needsVerification: 'Wymaga potwierdzenia',
  },
  /** Gating + upgrade teaser catalog (Masterplan §6, §10). */
  gate: {
    proLabel: 'Gellatti Pro',
    unlockCta: 'Poznaj Gellatti Pro',
    prompts: {
      exactGrams: 'Dokładne gramatury korekty są dostępne w Gellatti Pro.',
      exactAmount: 'Gellatti Pro obliczy dokładną ilość do dodania',
      labelExport: 'Eksport etykiety jest dostępny w Gellatti Pro',
    },
  },
  landing: {
    eyebrow: 'Twoje przyjazne laboratorium gelato',
    headline: 'Od pomysłu do gotowej partii.',
    subline:
      'Gellatti łączy sprawdzone obliczenia z jasnymi podpowiedziami. Smak, struktura, temperatura serwowania, koszt i produkcja spotykają się w jednym miejscu.',
    ctaPrimary: 'Wypróbuj bezpłatnie',
    ctaSecondary: 'Poznaj cztery tryby',
    pillars: [
      {
        title: 'Powtarzalne obliczenia',
        body: 'Ta sama receptura daje ten sam wynik. Gellatti wyjaśnia liczby i pomaga podjąć decyzję, ale ich nie zgaduje.',
      },
      {
        title: 'Czytelny monitor receptury',
        body: 'Struktura, słodycz, stabilność mrożenia i koszt — wszystko widać podczas pracy nad recepturą.',
      },
      {
        title: 'Dokładne korekty',
        body: 'Gellatti Pro pokazuje konkretną zmianę w gramach i prowadzi do lepszego wyniku — także podczas produkcji.',
      },
    ],
    modesEyebrow: 'Tryby produktu',
    modesHeadline: 'Cztery sposoby na zbalansowaną recepturę.',
    modes: [
      {
        name: 'ECO',
        body: 'Stabilny wynik i kontrola kosztu — dla hoteli, bufetów i większej produkcji.',
      },
      {
        name: 'CLASSIC',
        body: 'Zbalansowane gelato do codziennej sprzedaży: dobry smak, koszt i pewna struktura.',
      },
      {
        name: 'PREMIUM',
        body: 'Wyższa intensywność smaku. Receptura wspiera główny składnik, zamiast z nim konkurować.',
      },
      {
        name: 'SIGNATURE',
        body: 'Wyrazisty autorski smak i stabilna receptura, która może nosić Twoje nazwisko.',
      },
    ],
  },
  /** AI-first Home (Step 6A) — the clean white first screen. */
  home: {
    eyebrow: 'GELLATTI',
    prompt: 'Co dziś przygotujemy?',
    placeholder: 'Opisz swój pomysł na smak…',
    voiceHint: 'Rozmowa głosowa pojawi się wkrótce',
    submit: 'Dalej',
    restart: 'Zacznij od nowa',
  },
  /** Top-left hamburger menu. */
  menu: {
    title: 'GELLATTI',
    newRecipe: 'Nowa receptura',
    advancedStudio: 'Studio Pro',
    soon: 'Wkrótce',
    items: {
      myRecipes: 'Moje receptury',
      production: 'Produkcja',
      saved: 'Zapisane',
    },
    activeEngine: 'Wybrana temperatura',
    account: 'Konto',
    signIn: 'Zaloguj się',
    signOut: 'Wyloguj się',
    signedInAs: 'Zalogowano',
    authUnavailable: 'Logowanie jest chwilowo niedostępne',
  },
  /**
   * Top navigation — the premium black shell + Tesla-style mega menus (Phase 6C).
   * Eight centered top-level items; each menu has its own size/layout (see navConfig).
   * Customer-facing — never "Demo": use "Free Preview" / "PI Preview" / "Unlock PI Pro".
   */
  nav: {
    skipToContent: 'Przejdź do treści',
    openMenu: 'Otwórz menu',
    closeMenu: 'Zamknij menu',
    account: 'Konto',
    signIn: 'Zaloguj się',
    signOut: 'Wyloguj się',
    previewTier: 'Bezpłatny podgląd',
    previewExperience: 'Podgląd receptury',
    unlockPro: 'Poznaj Gellatti Pro',
    comingSoon: 'Wkrótce',
    learnMore: 'Dowiedz się więcej',
    engineLabel: 'Temperatura −11°C',
    /** Top-level labels — order is the source of truth in navConfig. */
    items: {
      start: 'Początek',
      calculator: 'Kalkulator receptury',
      recipes: 'Receptury',
      label: 'Etykiety',
      api: 'Integracje',
      work: 'Współpraca',
      subscription: 'Plan',
      ingredient: 'Dodaj składnik',
    },
    start: {
      blurb: 'Wróć do swojego miejsca pracy',
      talk: 'Wróć do rozmowy',
      new: 'Nowa receptura',
      continue: 'Kontynuuj ostatnią recepturę',
      how: 'Jak działa podgląd',
    },
    calculator: {
      title: 'Kalkulator receptury',
      blurb: 'Buduj i balansuj recepturę na sprawdzonych obliczeniach.',
      manual: 'Kalkulator ręczny',
      studio: 'Studio Pro',
      builder: 'Kreator składnika',
      panel: 'Monitor receptury',
      rescue: 'Korekta produkcji',
      engineNote: 'Wybrana temperatura',
    },
    recipes: {
      title: 'Receptury',
      blurb: 'Zacznij od zbalansowanej bazy.',
      mine: 'Moje receptury',
      pinguino: 'Receptury Gellatti',
      featured: 'Polecane receptury',
      recent: 'Ostatnio dodane',
      gelato: 'Gelato',
      sorbet: 'Sorbet',
      vegan: 'Wegańskiej',
      protein: 'Protein',
      startFrom: 'Zacznij od receptury',
      browse: 'Przeglądaj',
      categories: 'Kategorie',
      note: 'Polecane receptury Gellatti i Twoje zapisane prace, gotowe dla temperatury −11°C.',
      discovery: {
        eyebrow: 'BIBLIOTEKA SMAKU',
        question: 'Co chcesz zrobić?',
        intro:
          'Wybierz wyjątkowy kierunek albo zacznij od składnika. Do edytora przejdziesz bez katalogowego labiryntu',
        lostTitle: 'Lost & Legendary',
        lostBody:
          'Udokumentowane smaki regionalne i zanikające — tylko wtedy, gdy da się je odtworzyć uczciwie.',
        naturalTitle: 'Natural Icons',
        naturalBody: 'Nowoczesne smaki premium oparte na prawdziwych, jakościowych składnikach.',
        inspirationTitle: 'Znajdź inspirację',
        inspirationBody:
          '2 500 Kierunków smakowych zebranych w czytelne rodziny — nie gotowe receptury.',
        countries: 'Wybierz kraj',
        ingredient: 'Zacznij od składnika',
        recommended: 'Polecane',
        search: 'Szukaj smaku lub składnika',
        back: 'Wróć do wyboru',
        use: 'Użyj jako inspiracji',
        openRecipe: 'Przejdź do receptury',
        original: 'Oryginał',
        adaptation: 'Adaptacja Gellatti',
        showMore: 'Pokaż więcej inspiracji',
        showLess: 'Pokaż mniej',
        noPublished:
          'Ta kolekcja przechodzi jeszcze weryfikację, testy kuchenne i ocenę sensoryczną. Pokażemy ją dopiero po zatwierdzeniu.',
        developmentPreview: 'Podgląd kuratorski — niezweryfikowane produkcyjnie',
        directions: 'Wybierz kierunek',
        families: 'Rodziny składników',
        countriesEmpty: 'Żaden kraj nie przeszedł jeszcze pełnej bramki publikacji.',
      },
    },
    label: {
      title: 'Etykiety',
      blurb: 'Przygotuj etykietę z danych receptury i partii.',
      nutrition: 'Wartości odżywcze',
      production: 'Etykieta partii',
      statement: 'Wykaz składników',
      allergen: 'Informacje o alergenach',
      export: 'Eksportuj lub drukuj',
      note: 'Przygotuj deklarację odżywczą, wykaz składników i dane partii. Przed publikacją sprawdź wszystkie informacje wymagane na Twoim rynku.',
      /** Standalone label page (Labels & Exports) — reads a fixed sample recipe. */
      sampleHeading: 'Przykładowa receptura',
      sampleNote:
        'Poniższe wartości pokazują zbalansowaną recepturę dla −11°C. Zbuduj własną recepturę, aby przygotować jej etykietę.',
      declarationTitle: 'Deklaracja odżywcza',
      statementNote: 'Składniki w kolejności malejącej według masy (EU QUID).',
      notAvailable: 'Niedostępne',
      downloadCsv: 'Pobierz CSV',
      print: 'Drukuj etykietę',
      csvFilename: 'gellatti-przykladowa-etykieta.csv',
      allergenNote:
        'Alergeny nie są uzupełniane automatycznie. Przed publikacją sprawdź je na etykietach wszystkich użytych produktów.',
    },
    api: {
      title: 'Integracje',
      blurb: 'Połącz Gellatti z własnymi narzędziami.',
      overview: 'Przegląd integracji',
      shops: 'Dla lodziarni',
      machines: 'Dla producentów maszyn',
      partner: 'Dostęp partnerski',
      docs: 'Dokumentacja',
      status: 'Stan integracji',
      note: 'Integracje dla lodziarni, maszyn i partnerów. Dokumentacja pojawi się wraz z uruchomieniem dostępu.',
    },
    work: {
      title: 'Współpracuj z nami',
      blurb: 'Cztery sposoby współpracy z Gellatti.',
      includedLabel: 'Co obejmuje',
      forWhomLabel: 'Dla kogo',
      cta: 'Porozmawiaj z Gellatti',
      ctaHref: 'mailto:pinguinointelligence@gmail.com',
      offers: {
        app: {
          title: 'Sama aplikacja',
          body: 'Gellatti dla Twojego zespołu — receptury, balans i korekty.',
          included:
            'Projektowanie receptur, monitor parametrów, jasne podpowiedzi, koszt i wartości odżywcze.',
          forWhom: 'Lodziarnie i twórcy receptur, którzy chcą pełnego środowiska pracy.',
        },
        machinesApp: {
          title: 'Maszyny + aplikacja',
          body: 'Maszyny produkcyjne połączone z aplikacją — od receptury do gotowej partii.',
          included: 'Wszystko z planu aplikacji oraz połączone maszyny produkcyjne.',
          forWhom: 'Pracownie, które chcą połączyć receptury z produkcją na maszynach.',
        },
        machineMixtures: {
          title: 'Maszyna + gotowe mieszanki',
          body: 'Maszyna i gotowe mieszanki opracowane przez Gellatti.',
          included: 'Maszyna produkcyjna i gotowe mieszanki opracowane przez Gellatti.',
          forWhom: 'Nowe lodziarnie i pracownie, które chcą zacząć od sprawdzonych produktów.',
        },
        ingredients: {
          title: 'Składniki i mieszanki',
          body: 'Sprawdzone składniki i mieszanki dla powtarzalnych rezultatów.',
          included: 'Wybrane składniki i mieszanki o kontrolowanym, powtarzalnym składzie.',
          forWhom: 'Więksi producenci i sieci, które potrzebują stałego standardu.',
        },
      },
    },
    subscription: {
      title: 'Plan',
      blurb: 'Zacznij bezpłatnie i rozwijaj pracę z Gellatti Pro.',
      free: 'Bezpłatny podgląd',
      pro: 'Gellatti Pro',
      team: 'Plan dla pracowni / zespołu',
      manage: 'Zarządzaj płatnościami',
      change: 'Zmień lub anuluj plan',
      freeTagline: 'Poznaj Gellatti bez opłat.',
      proTagline: 'Pełne narzędzia do receptur i produkcji.',
      freeCta: 'Wypróbuj bezpłatnie',
      comingSoonNote: 'Płatności i zakup planu pojawią się w kolejnej wersji.',
      whatUnlocks: 'Gellatti Pro otwiera pełne środowisko pracy.',
      futureLabel: 'W planach',
      freeFeatures: [
        'Podgląd kierunku zmian',
        'Wskaźniki profilu tylko do odczytu',
        'Bez dokładnych gramatur',
        'Bez pełnej biblioteki składników',
        'Bez dokładnych korekt',
      ],
      proFeatures: [
        'Dokładne gramatury',
        'Pełny kalkulator',
        'Pełny monitor receptury',
        'Pełna biblioteka składników',
        'Dokładne korekty',
        'Zapisane receptury',
        'Ratowanie produkcji (wkrótce)',
      ],
    },
    ingredient: {
      title: 'Dodaj składnik',
      blurb: 'Dodaj własny składnik z opisu lub zdjęcia etykiety',
      describe: 'Opisz produkt',
      photo: 'Dodaj zdjęcie etykiety',
      camera: 'Zrób zdjęcie',
      review: 'Sprawdź odczytane dane',
      add: 'Dodaj do składników',
      note: 'Dodaj własny składnik z opisu lub zdjęcia etykiety. Skanowanie i odczyt danych są dostępne w Gellatti Pro',
    },
  },
  /** Reusable placeholder surface for not-yet-built nav destinations (Phase 6C, Slice 1). */
  comingSoon: {
    eyebrow: 'Wkrótce',
    headline: 'Już nad tym pracujemy.',
    body: 'Ta część Gellatti jest jeszcze w przygotowaniu. Wróć później — pokażemy ją, gdy będzie gotowa.',
    back: 'Wróć na start',
  },
  /** Auth modal (Phase 2A). */
  auth: {
    titleSignIn: 'Zaloguj się do Gellatti',
    titleSignUp: 'Utwórz konto Gellatti',
    email: 'E-mail',
    password: 'Hasło',
    submitSignIn: 'Zaloguj się',
    submitSignUp: 'Utwórz konto',
    busy: 'Chwileczkę…',
    toSignUp: 'Nie masz konta? Utwórz je',
    toSignIn: 'Masz już konto? Zaloguj się',
    checkEmail: 'Jeszcze jeden krok: otwórz wiadomość i potwierdź adres e-mail.',
    unavailable: 'Logowanie jest chwilowo niedostępne.',
    close: 'Zamknij',
    orDivider: 'Lub',
    continueWithGoogle: 'Kontynuuj z Google',
    googleRedirecting: 'Łączymy z Google…',
    googleCancelled: 'Logowanie przez Google zostało anulowane. Niczego nie zmieniliśmy.',
    googleFailed: 'Nie udało się dokończyć logowania przez Google. Spróbuj ponownie.',
  },
  /** Saved recipes + My Recipes (Phase 2A.2). */
  /** Canonical application shell + navigation (one source of truth, Polish). */
  shell: {
    brand: 'GELLATTI',
    /** The approved destination lockup descriptor (Gellatti V2.1 §5). */
    workspace: 'Gellatti Workspace',
    openMenu: 'Otwórz menu',
    closeMenu: 'Zamknij menu',
    menuTitle: 'Menu',
    back: 'Powrót',
    groups: {
      product: 'GELLATTI',
      ecosystem: 'Ekosystem',
      account: 'Konto',
    },
    items: {
      tryPinguino: 'Wypróbuj Gellatti',
      howItWorks: 'Jak to działa',
      shop: 'Sklep',
      plans: 'Plany',
      homeWorkspace: 'Gellatti Home',
      proWorkspace: 'Gellatti Pro',
      recipes: 'Receptury',
      production: 'Produkcja',
      labels: 'Ustawienia etykiety',
      products: 'Produkty',
      machine: 'Maszyna',
      workWithUs: 'Współpraca',
      franchise: 'Franchise',
    },
    account: {
      settings: 'Konto i ustawienia',
      signIn: 'Zaloguj się',
      signOut: 'Wyloguj się',
      signedInAs: 'Zalogowano',
      unavailable: 'Logowanie jest chwilowo niedostępne.',
      planPro: 'Plan Pro',
      planHome: 'Plan Home',
      planNone: 'Plan podstawowy',
    },
  },
  recipes: {
    save: 'Zapisz recepturę',
    saveAs: 'Zapisz jako nową',
    saveTitle: 'Zapisz recepturę',
    nameLabel: 'Nazwa receptury',
    namePlaceholder: 'Np. Baza mleczna',
    descriptionLabel: 'Notatka (opcjonalnie)',
    saving: 'Zapisywanie…',
    cancel: 'Anuluj',
    signInToSave: 'Zaloguj się, aby zapisać',
    signInCta: 'Zaloguj się',
    title: 'Moje receptury',
    empty: 'Nie masz jeszcze zapisanych receptur. Utwórz pierwszą i zapisz ją w Gellatti Pro.',
    signInToView: 'Zaloguj się, aby zobaczyć swoje receptury.',
    unavailable: 'Zapis nie jest dostępny w tej wersji aplikacji.',
    open: 'Otwórz',
    delete: 'Usuń',
    confirmDelete: 'Usunąć tę recepturę? Tej operacji nie można cofnąć.',
    loading: 'Ładowanie…',
    back: 'Powrót',
    columns: {
      product: 'Typ',
      serving: 'Tryb',
      engine: 'Temperatura',
      batch: 'Ilość',
      updated: 'Zaktualizowano',
      /** The inline immutable-version selector — navigation only, never a restore. */
      version: 'Wersja',
    },
    /** WERSJA selector + the workbench notice for an opened historical version (owner v1.4). */
    versionSelector: {
      current: 'Aktualna',
      trigger: (name: string, version: number) =>
        `Wersja receptury ${name}: v${version}. Wybierz wersję do otwarcia`,
      list: (name: string) => `Wersje receptury ${name}`,
      openFailed: (version: number) =>
        `Nie udało się otworzyć wersji v${version}. Spróbuj ponownie — nie otwieramy w zamian innej wersji.`,
      historyUnavailable: 'Historia wersji jest chwilowo niedostępna. Spróbuj ponownie za chwilę.',
      openFailedGeneric: 'Nie udało się otworzyć tej receptury.',
    },
    historicalVersion: {
      heading: (version: number, date: string | null) =>
        `Wersja v${version}${date ? ` · ${date}` : ''}`,
      body: (latest: number) =>
        `— podgląd historii. Najnowsza wersja to v${latest}. Zapis utworzy nową wersję; tej wersji nie nadpisze.`,
      restore: 'Przywróć tę wersję',
      restoring: 'Przywracam…',
      restoreFailed: 'Nie udało się przywrócić wersji.',
    },
    /** Canonical save dialog (S2 repair) — ONE flow: create v1 / append next version / save as new. */
    dialog: {
      createTitle: 'Zapisz recepturę',
      versionTitle: 'Zapisz nową wersję',
      nameLabel: 'Nazwa receptury',
      namePlaceholder: 'Np. Baza mleczna',
      firstNoteLabel: 'Notatka do pierwszej wersji (opcjonalnie)',
      changeNoteLabel: 'Opis zmian (opcjonalnie)',
      createButton: 'Zapisz recepturę',
      versionButton: (v: number) => `Zapisz nową wersję (v${v})`,
      saveAsNew: 'Zapisz jako nową recepturę',
      /** Owner v1.4 §9: saving while a historical snapshot is open appends, never overwrites. */
      historicalSaveNote: (viewing: number, next: number) =>
        `Pracujesz na wersji v${viewing}. Zapis nie nadpisze jej — utworzy nową wersję v${next}.`,
      saving: 'Zapisywanie…',
      cancel: 'Anuluj',
      linkedLine: (name: string, v: number) => `Receptura: ${name} · najnowsza wersja v${v}`,
      unavailable: 'Zapis nie jest dostępny w tej wersji aplikacji.',
      signIn: 'Zaloguj się, aby zapisać.',
      demoCannotSave: 'Ten plan nie może zapisywać receptur.',
    },
  },
  /** PRO CORE — real recipe-version / production / cost surfaces (orchestrator integration). */
  proCore: {
    title: 'Historia wersji',
    blurb:
      'Każdy zapis tworzy nową wersję. Przywrócenie starszej wersji również tworzy nową wersję — historia nie jest nadpisywana.',
    devPersona: 'Persona (dev):',
    backendUnavailable:
      'Historia wersji wymaga skonfigurowanego zaplecza. Niedostępna w tej wersji aplikacji.',
    localMode:
      'Tryb lokalny — wersje są trzymane tylko w pamięci i nie są trwałe (odświeżenie je czyści).',
    /** Shown when no recipe is open — versions are per-recipe, never a global list (S2 UX). */
    openToSeeVersions: 'Otwórz recepturę z „Moje receptury”, aby zobaczyć jej historię wersji',
    currentRecipe: 'Receptura:',
    restoreLabel: 'Przywróć',
    historyHeading: 'Historia wersji',
    archived: 'zarchiwizowana',
    fromVersion: 'Z',
    // legacy keys (no longer surfaced; the save flow moved to the top-right canonical dialog)
    demoCannotSave: 'Ten plan nie może zapisywać receptur.',
    saveDraftAsRecipe: 'Zapisz bieżący szkic jako recepturę',
    saveNewVersion: 'Zapisz nową wersję',
    restoreV1: 'Przywróć v1 → nowa wersja',
    recipesHeading: 'Receptury',
    noRecipes: 'Brak zapisanych receptur.',
    selectRecipe: 'Wybierz recepturę, aby zobaczyć jej wersje',
    draftTitlePrefix: 'Szkic receptury',
  },
  /** Gellatti Pro workspace (/pro) — kanoniczne polskie copy. */
  proWorkspace: {
    eyebrow: 'Gellatti Pro',
    title: 'Przestrzeń profesjonalna',
    openWorkspace: 'Otwórz Gellatti Pro →',
    back: 'Powrót',
    tabs: {
      recipe: 'Receptura',
      monitor: 'Monitor',
      versions: 'Wersje',
      production: 'Produkcja',
      history: 'Historia',
      costs: 'Koszty',
      exports: 'Eksporty',
      settings: 'Ustawienia',
      machine: 'Maszyna',
      tools: 'Narzędzia zaawansowane',
    },
    gate: {
      title: 'Gellatti Pro',
      message:
        'Edytowalne receptury, wersjonowanie, produkcja, koszty i eksporty są dostępne w Gellatti Pro.',
      cta: 'Poznaj Gellatti Pro',
    },
    monitorNote:
      'Aktywny panel Monitor Pro jest w zakładce Receptura (prawa kolumna). Osobna szuflada Monitora pojawi się w kolejnym etapie.',
    /** Owner P0 UX repair (2026-07-24) — truthful note after the /pro/recipe restructure
     * (the Monitor lives in the workbar drawer + the secondary section). ADDITIVE key. */
    monitorNoteDrawer:
      'Monitor otworzysz z zakładki Receptura. Pełne moduły są dostępne w sekcji „Analiza ' +
      'i moduły dodatkowe”.',
    soon: {
      production: 'Plan, wykonanie i odchylenia produkcji pojawią się w kolejnym etapie.',
      history: 'Historia produkcji pojawi się w kolejnym etapie.',
      costs: 'Koszty składników i zapisane wyceny partii pojawią się w kolejnym etapie.',
      exports: 'Eksporty receptur i kosztów (zależne od uprawnień) pojawią się w kolejnym etapie.',
    },
    backend: {
      label: 'Zapis danych',
      durable: 'Aktywny',
      localDev: 'Tylko na tym urządzeniu',
      unavailable: 'Chwilowo niedostępny',
    },
    settings: {
      access: 'Dostęp',
      account: 'Konto',
      signedOut: 'Niezalogowano',
    },
    machineNote:
      'Klasa profesjonalna pojawi się w kolejnym etapie. Na razie zarządzaj zapisaną maszyną tutaj.',
    openMachine: 'Otwórz ustawienia maszyny',
    devPersona: 'Persona (dev):',
  },
  productPicker: {
    otherContextSection: 'DOSTĘPNE W INNYM ZAKRESIE',
    contextual: {
      TOPPING: {
        badge: 'Topping',
        available: 'Ten produkt jest dostępny jako topping.',
        route: 'Przejdź do toppingów →',
        question: 'Uważasz, że powinien działać też jako składnik?',
        submitted: 'Dzięki — sprawdzimy to jeszcze raz.',
        unchanged: 'Na razie produkt pozostaje dostępny jako topping.',
      },
      INGREDIENT: {
        badge: 'Składnik',
        available: 'Ten produkt jest dostępny jako składnik receptury.',
        route: 'Przejdź do składników →',
        question: 'Uważasz, że powinien działać też jako topping?',
        submitted: 'Dzięki — sprawdzimy, czy ten produkt może działać również jako topping.',
        unchanged: 'Na razie pozostaje dostępny jako składnik.',
      },
      request: 'Poproś o ponowną analizę',
      existing: 'Prośba o ponowną analizę została już wysłana.',
      failed: 'Nie udało się wysłać prośby. Spróbuj ponownie.',
      openIngredientManually: 'Otwórz „Dodaj składnik”, aby użyć tego produktu w recepturze',
      openToppingManually: 'Otwórz „Dodaj topping”, aby użyć tego produktu po produkcji',
    },
  },
  /** Gellatti Pro sticky top workbar — primary actions always visible. */
  proWorkbar: {
    nameLabel: 'Nazwa receptury',
    namePlaceholder: 'Np. Pistachio Dream',
    saveNew: 'Zapisz recepturę',
    saveVersion: (v: number) => `Zapisz nową wersję (v${v})`,
    addNote: 'Dodaj notatkę',
    noteLabel: 'Notatka do wersji (opcjonalnie)',
    monitor: 'Monitor',
    recalc: 'Przelicz recepturę',
    emptyNameError: 'Podaj nazwę receptury.',
    more: 'Więcej opcji',
    rename: 'Zmień nazwę',
    saveAsNew: 'Zapisz jako nową recepturę',
    archive: 'Archiwizuj recepturę',
    confirm: 'Zapisz',
    cancel: 'Anuluj',
    restoredFrom: (v: number) => `Przywrócono z v${v}`,
    pendingRecalc: 'Zmiany oczekują na przeliczenie',
    status: {
      newUnsaved: 'Niezapisane',
      saving: 'Zapisywanie…',
      clean: 'Zapisane',
      dirty: 'Niezapisane',
      error: 'Błąd zapisu — spróbuj ponownie',
    },
    blocked: {
      signin: 'Zaloguj się, aby zapisać',
      unavailable: 'Zapis niedostępny w tej wersji',
      plan: 'Ten plan nie zapisuje receptur',
    },
    /** The workbar-level recalculation panel: Przelicz z PI → Podgląd → Zastosuj/Anuluj → Cofnij. */
    recalcPanel: {
      title: 'Podgląd przeliczenia',
      close: 'Zamknij',
      applied: 'Zmiany są w recepturze roboczej. Zapisz, aby je zachować.',
      undo: 'Cofnij',
    },
  },
  /** ONE-SCREEN Pro workbench (owner architecture, 2026-07-24) — ADDITIVE copy only.
   * The /pro/recipe editor is a single-viewport workspace: compact settings line,
   * ingredient editor left, LIVE Monitor PI right, compact action bar, red review
   * zone below the fold. PL copy. */
  proWorkbench: {
    profile: {
      tabs: {
        recipe: 'Profil',
        monitor: 'Monitor',
        production: 'Produkcja',
        history: 'Historia',
      },
      title: 'Profil receptury',
      axesTitle: 'Osie jakości',
      axisControlPending: 'Sterowanie kierunkiem osi pojawi się wkrótce.',
      tutorialTitle: 'Jak poprawić dopasowanie',
      settingsTitle: 'Ustawienia',
      actualBatch: 'Aktualna partia',
      nutritionTitle: 'Kalorie',
      costTitle: 'Koszt',
      per100g: 'Na 100 g',
      totalBatchCost: 'Koszt partii',
      unavailable: 'Brak danych',
      productionPending: 'Widok produkcji pojawi się wkrótce.',
      historyPending: 'Historia tej receptury pojawi się po pierwszym zapisie.',
    },
    settings: {
      machineLink: 'Maszyna',
      advanced: 'Więcej ustawień',
      batchUnit: 'g',
    },
    actionBar: {
      previewReady: 'Podgląd przeliczenia gotowy.',
      openPreview: 'Otwórz podgląd',
      total: 'Masa partii',
      idleHint: 'Zmiany przeliczają się na bieżąco w Monitorze.',
    },
    reviewZone: {
      title: 'Dodatkowe narzędzia',
      note: 'Znajdziesz tu narzędzia, których nie potrzebujesz przy każdej recepturze.',
      tableTitle: 'Dostępne moduły',
      columns: {
        name: 'Moduł',
        purpose: 'Funkcja',
        route: 'Miejsce',
        recommendation: 'Podpowiedź',
        decision: 'Status',
      },
      pending: 'OCZEKUJE',
    },
  },
  /** Monitor receptury — warstwa podsumowania i szczegółów. */
  monitorPi: {
    panelTitle: 'Monitor receptury',
    liveNote: 'Wynik na żywo — przelicza się przy każdej zmianie receptury.',
    summary: {
      scoreName: 'Dopasowanie receptury',
      axesTitle: 'Osie jakości',
      servingLabel: 'Temperatura serwowania',
      assessmentNative: 'Ocena natywna — wskaźniki oceniane według zatwierdzonych zakresów.',
      assessmentProvisional: 'Ocena częściowa / prowizoryczna',
      provisionalSource: {
        category:
          'Źródło: zakresy zastępcze profilu (kalibracja naukowa tego profilu jest w toku).',
        temperature: 'Źródło: najbliższa skalibrowana cela temperatury.',
        estimated: 'Źródło: zakresy szacunkowe (status „szacowane”).',
      },
      provisionalReason:
        'Część wskaźników nie ma natywnie zatwierdzonego zakresu dla tego profilu i tej temperatury.',
      insufficient: 'Brak wystarczających danych do oceny.',
      insufficientHint: 'Dodaj składniki i gramatury, aby zobaczyć pełny Monitor.',
      violatedHeading: 'Wskaźniki poza zatwierdzonym zakresem',
      withinBands: 'Wszystkie oceniane wskaźniki mieszczą się w zatwierdzonych zakresach.',
      primaryOk: 'Bieżąca receptura nie wymaga uwagi.',
    },
    sections: {
      detailsTitle: 'Moduły szczegółowe',
      score: 'Dopasowanie receptury — karta oceny',
      nutrition: 'Wartości odżywcze i koszty',
      corrections: 'Korekty receptury',
      advancedTitle: 'Zaawansowane / diagnostyka',
    },
    stabilization: {
      provenanceNone:
        'Receptura nie zawiera osobnego stabilizatora — stabilizację niosą składniki bazowe.',
      provenanceAssessed: (count: number) =>
        `Dozowanie stabilizatorów ocenione według zatwierdzonych okien dozowania (${count} poz.).`,
      provenanceUnapproved:
        'Stabilizator bez zatwierdzonego okna dozowania — ocena dozowania niedostępna.',
    },
  },
  /** PINGÜINO Pro — professional machine + serving-mode selector (S4). PL copy; connects EXISTING
   * approved serving modes + Home machine registry to the Pro workflow (no Engine/math change). */
  proMachine: {
    heading: 'Maszyna i tryb serwowania',
    intro: 'Wybór dotyczy bieżącej receptury.',
    professional: {
      title: 'Maszyna profesjonalna',
      body: 'Pełna kontrola temperatury serwowania, partii i parametrów receptury.',
      chooseServing: 'Wybierz temperaturę serwowania',
    },
    serving: {
      fresh: 'Świeże',
      minus11: '−11°C',
      minus12: '−12°C',
      minus13: '−13°C',
    },
    home: {
      heading: 'Maszyny domowe',
      setDefault: 'Ustaw również jako domyślną',
      recommended: (g: number) => `Zalecany wsad: ${g} g`,
      userSetsBatch: 'Wsad ustalasz samodzielnie.',
      savedDefault: 'Domyślna maszyna została zapisana.',
    },
    other: {
      heading: 'Inne urządzenia',
      needsReview: 'W trakcie weryfikacji pojemności — brak zalecanego wsadu.',
    },
    batch: { label: 'Wielkość partii', unit: 'g' },
    professionalLabel: 'Maszyna profesjonalna',
    selected: 'Wybrano',
    change: 'Zmień',
  },
  /** Gellatti Pro subscription / billing. */
  billing: {
    proActive: 'Gellatti Pro jest aktywne',
    upgrade: 'Poznaj Gellatti Pro',
    comingSoon: 'Wkrótce',
  },
  /** Guided conversation copy. */
  chat: {
    productQuestion: 'Jaki produkt przygotowujesz?',
    servingQuestion: 'Jak będzie serwowany?',
    servingPreviewNote: 'Podgląd korzysta teraz z temperatury −11°C.',
    batchQuestion: 'Jak duża ma być partia?',
    batchDefault: 'Zostaw 1000 g',
    batchScale: 'Przelicz',
    batchUnit: 'g',
    summaryEyebrow: 'Podgląd receptury',
    heroLabel: 'Główny smak',
    heroFallback: 'Twój pomysł',
    productLabel: 'Produkt',
    servingLabel: 'Serwowanie',
    batchLabel: 'Partia',
    processLabel: 'Jak Gellatti buduje recepturę',
    process: [
      'Dobieramy bazę do wybranego produktu.',
      'Balansujemy słodycz i stabilność mrożenia dla −11°C.',
      'Chronimy główny smak i dopasowujemy do niego pozostałe składniki.',
    ],
    demoNote:
      'To kierunek receptury. Dokładne gramy, skalowanie i korekty są dostępne w Gellatti Pro.',
    unlockCta: 'Poznaj dokładną recepturę w Gellatti Pro',
    hintsLabel: 'Co widzi Gellatti przy −11°C',
    balanced: 'Receptura jest zbalansowana dla −11°C, a główny smak pozostaje na pierwszym planie.',
    areas: {
      sweetness: 'Słodycz',
      freezing_stability: 'Stabilność mrożenia',
      texture: 'Tekstura i struktura',
      alcohol: 'Alkohol',
      main_ingredient: 'Główny składnik',
      profile_fit: 'Dopasowanie profilu',
    },
    directions: {
      improve: 'Popraw',
      rebalance: 'Zbalansuj',
      protect: 'Chroń',
      reduce_risk: 'Zmniejsz ryzyko',
    },
    confidence: { high: 'Wysoka', medium: 'Średnia', low: 'Niska', tradeoff: 'Kompromis' },
    productHints: {
      gelato: ['Baza mleczna — balansujemy tłuszcz, laktozę i białko dla kremowej struktury.'],
      sorbet: [
        'Owoc pozostaje na pierwszym planie.',
        'Balansujemy wodę i cukier, aby sorbet łatwo się porcjował.',
      ],
      granita: ['Celowo lodowa i krystaliczna — nie kremowa.'],
      vegan: ['Bez składników odzwierzęcych — struktura i balans pochodzą z roślin.'],
      protein: ['Podnosimy białko, jednocześnie chroniąc strukturę.'],
    },
  },
  /** Product directions (recipe profiles, not engines). */
  productTypes: {
    gelato: { label: 'Gelato', tagline: 'Klasyczna, kremowa baza mleczna.' },
    sorbet: { label: 'Sorbet', tagline: 'Bez nabiału, z owocem na pierwszym planie.' },
    granita: { label: 'Granita', tagline: 'Świadomie lodowa i krystaliczna.' },
    vegan: { label: 'Wegańskie', tagline: 'Bez składników pochodzenia zwierzęcego.' },
    protein: { label: 'Proteinowe', tagline: 'Więcej białka przy zachowanej teksturze.' },
  },
  /** Serving / production profiles (preferences, not engines).
   * AUDIT #19 + SPEC §11.2 (owner decision, Slice C): −18°C is a STORAGE
   * temperature — it moved to `storageProfiles` below and is never offered
   * in a serving picker. */
  servingProfiles: {
    fresh: { label: 'Świeże' },
    'display-minus-11': { label: '−11°C' },
    'display-minus-12': { label: '−12°C' },
    'display-minus-13': { label: '−13°C' },
  },
  /** Storage temperatures (SPEC §11.2 „Przechowywanie”) — a separate concept:
   * informational labels only (legacy saved rows may still reference the id). */
  storageProfiles: {
    'storage-minus-18': { label: 'Przechowywanie −18°C (zamrażarka)' },
  },
  studio: {
    eyebrow: 'Gellatti Pro',
    // engineTag REMOVED (owner P0 repair): the engine label is DERIVED from the resolved route
    // (engineRouteLabel over servingModeId + target_temperature_c) — never a hardcoded string.
    back: 'Wróć na stronę główną',
    /** Owner/QA diagnostic — the real resolved state reaching the Engine (Pro-gated, staging). */
    diagnostic: {
      title: 'Diagnostyka (QA właściciela)',
      visibleType: 'Typ widoczny',
      internalProfile: 'Profil wewnętrzny',
      detected: 'Wykryte klasyfikacje',
      class: { chocolate: 'Czekolada', fruit: 'Owoce', nut: 'Orzechy', alcohol: 'Alkohol' },
      qualityTier: 'Poziom jakości',
      servingMode: 'Tryb serwowania',
      internalTemp: 'Temperatura wewnętrzna',
      bandCell: 'Cela TARGET_BANDS',
      fallbackFlag: 'Zakres zastępczy profilu/temperatury',
      batch: 'Partia',
      ingredientCount: 'Liczba składników',
      unresolved: 'Nieuzupełnione składniki',
      activeLocks: 'Aktywne blokady',
      engineVersion: 'Wersja obliczeń',
      configVersion: 'CONFIG_VERSION',
      optimizerResult: 'Wynik optymalizatora',
      verifyResult: 'Weryfikacja ograniczeń',
      /* Owner P0 (formulation runtime) — screenshot-ready diagnostics. */
      dataSource: 'Źródło danych',
      dataSourceDraft: 'bieżący szkic (niezapisany)',
      formulationMode: 'Tryb formulacji',
      templateId: 'Wzorzec formulacji',
      missingRoles: 'Brakujące role',
      addedByPi: 'Dodane przez Gellatti',
      excluded: 'Wykluczone składniki',
      rejectionCode: 'Kod odrzucenia',
      notRun: 'Nie uruchomiono',
      optimizer: { hasProposals: 'Są propozycje', noProposal: 'Brak propozycji' },
      verify: {
        idle: 'Brak zastosowania',
        previewStaged: 'Podgląd przygotowany',
        blocked: 'Zablokowano (verify)',
      },
      yes: 'Tak',
      no: 'Nie',
      none: '—',
      /* Owner P0 NIGHTLY (Agent A, A9) — formulation QA rows. ADD-only keys. */
      bandSource: 'Źródło zakresów',
      bandSourceNative: 'Natywne (zatwierdzone)',
      bandSourceCategoryFallback: 'Zakres zastępczy profilu (tymczasowy)',
      bandSourceTemperatureFallback: 'Zakres zastępczy temperatury (tymczasowy)',
      roleTrace: 'Ślad ról (rola→wynik)',
      solverRuns: 'Lokalne obliczenia (uruchomienia)',
      fallbackInvoked: 'Użyto zakresu zastępczego',
      finalClassification: 'Klasyfikacja końcowa',
      classificationPreview: 'Podgląd przygotowany',
      // Owner addendum item 3 (2026-07-25): the solver proves a LOCAL fixed
      // point, never a global optimum — the label says "found", not "best".
      classificationBestSafe: 'Najlepszy znaleziony bezpieczny wynik',
      classificationIdle: 'Nie uruchomiono',
      hardViolations: 'Twarde naruszenia (natywne zakresy)',
      softViolations: 'Miękkie naruszenia (zakresy prowizoryczne)',
      /* Owner P0 NIGHTLY (live-state/opt/stabilizer agent) — ADD-only keys. */
      iterationCount: 'Iteracje optymalizatora',
      iterationCapReached: 'Osiągnięto limit',
      iterationTrajectory: 'Trajektoria naruszeń (rundy)',
      iterationStop: 'Kod zatrzymania optymalizatora',
      stabilizerDosage: 'Dawka stabilizatora',
      stabilizerDosageProvenance: 'Dawka stabilizatora — pochodzenie',
      stabilizerWithinWindow: 'W oknie',
      stabilizerBelowWindow: 'PONIŻEJ okna',
      stabilizerAboveWindow: 'POWYŻEJ okna',
      stabilizerNoWindow: 'Brak zatwierdzonego okna dawkowania',
      stabilizerSeedUnresolved:
        'Seed wzorca (template-controlled) — wzorzec reference_derived; dawka nierozstrzygnięta naukowo dla tego profilu',
      stabilizerSeedApproved: 'Seed wzorca (template-controlled, zatwierdzony wzorzec)',
      stabilizerUserDraft: 'Wartość bieżącego szkicu użytkownika',
      monitorRevision: 'Rewizja Monitora i obliczeń',
      formulationRevision: 'Rewizja formulacji',
      identityTable: 'Tożsamość i stan linii',
      identityLine: 'Linia',
      identityCanonical: 'Kanoniczne ID',
      identityProduct: 'ID produktu',
      identitySource: 'Źródło',
      identityVisible: 'Widoczne g',
      identityEffective: 'Efektywne g',
      identityEngine: 'Obliczenia · g',
      identityRevision: 'Rewizja',
    },
    /** Collapsed „Narzędzia zaawansowane" section — the secondary QA/diagnostic tools. */
    advancedTools: {
      title: 'Narzędzia zaawansowane',
      note:
        'Asystent, przewodnik, podgląd optymalizacji i przepływy produkcyjne (IF9/IF10). ' +
        'Tylko podgląd — żadne z tych narzędzi nie zmienia receptury.',
    },
    /** The explicit optimization-preview block on the canonical Pro recipe surface (PL). */
    optimization: {
      title: 'Podgląd optymalizacji',
      note:
        'To tylko podgląd — nic nie jest zapisywane ani stosowane automatycznie. Obliczenia uwzględniają ' +
        'temperaturę serwowania; dodatkowe porównanie pozostaje dostępne.',
      proOnly: 'Dokładne gramatury są dostępne w Gellatti Pro.',
      run: 'Podgląd optymalizacji',
    },
    /** Owner P0 UX repair (2026-07-24) — the ONE calm SECONDARY section under the primary
     * recipe path on /pro/recipe: analysis modules collapsed by default, red-marked
     * modules awaiting the owner's review. ADDITIVE keys only. */
    secondary: {
      title: 'Analiza i moduły dodatkowe',
      note:
        'Moduły domyślnie zwinięte — receptura powstaje wyżej. ' +
        'Oznaczenia wymagające uwagi prowadzą do odpowiedniego miejsca.',
      modules: {
        score: 'Dopasowanie receptury',
        monitor: 'Monitor receptury — pełne moduły',
        nutrition: 'Wartości odżywcze i koszt',
        corrections: 'Korekty receptury',
      },
      reviewMarked: {
        studioTools: 'Narzędzia partii i blokad (Studio)',
        studioToolsNote:
          'Przeskalowanie partii, wykonalność blokad i historia zmian — dawne narzędzia Studio.',
        assistant: 'Asystent receptury',
        flowGuide: 'Przewodnik przepływu',
        optimization: 'Podgląd optymalizacji',
        optimizationNote: 'Tylko podgląd — nie zmienia receptury.',
        branchPreviews: 'Ratunek partii · Braki magazynowe (IF9/IF10)',
        branchPreviewsNote: 'Przepływy produkcyjne — tylko podgląd, nic nie zapisują.',
        ownerDiagnostic: 'Diagnostyka QA',
        ownerDiagnosticNote:
          'Szczegóły techniczne wejścia obliczeń — tylko dla uprawnionych sesji QA.',
      },
    },
    /** Locked Free Preview panels (Phase 6C Slice 2B) — decorative, no exact values. */
    locked: {
      chip: 'Podgląd receptury',
      note: 'Dokładne wartości są dostępne w Gellatti Pro.',
      cta: 'Poznaj Gellatti Pro: dokładne gramy, pełny kalkulator i korekty produkcji.',
    },
    presets: {
      label: 'Przykładowe scenariusze',
      items: {
        'milk-base': {
          label: 'Baza mleczna',
          blurb: 'Klasyczna baza z czytelnym podglądem parametrów.',
        },
        'raspberry-premium': {
          label: 'Malina Premium',
          blurb: 'Balansujemy recepturę wokół owocu, nie przeciwko niemu.',
        },
        'actual-batch-rescue': {
          label: 'Korekta partii',
          blurb: 'Za dużo składnika? Skoryguj partię przez dodawanie, bez odejmowania.',
        },
        'jim-beam': {
          label: 'Jim Beam',
          blurb:
            'Alkohol zmienia mrożenie — pokażemy ograniczenia, których nie da się bezpiecznie ominąć.',
        },
        'pistachio-high-fat': {
          label: 'Pistacja o wysokiej zawartości tłuszczu',
          blurb: 'Chronimy intensywną pastę pistacjową i dopasowujemy resztę receptury.',
        },
      },
    },
    internalToggle: {
      label: 'Podgląd wewnętrzny',
      note: 'Tryb testowy — nie zmienia planu konta.',
      demo: 'Podgląd',
      pro: 'Pro · test',
    },
    goal: {
      title: 'Cel receptury',
      /** Owner P0: exactly FOUR visible product types; internal categories route silently. */
      productTypeLabel: 'Typ produktu',
      productTypes: {
        gelato: 'Gelato',
        sorbet: 'Sorbet',
        vegan: 'Wegańskie',
        protein: 'Proteinowe',
      },
      proteinUnsupported:
        'Profil proteinowy nie jest jeszcze naukowo kompletny. Receptura pozostaje w ostatnim ' +
        'obsługiwanym profilu — nic nie zostało zmienione.',
      /** ONE canonical quality tier (owner-approved): Eco/Classic/Premium/Signature. */
      modeLabel: 'Poziom jakości',
      modes: {
        eco: { name: 'ECO', body: 'Najniższy koszt, stabilna technologia.' },
        classic: { name: 'CLASSIC', body: 'Zbalansowany smak, koszt i struktura.' },
        premium: { name: 'PREMIUM', body: 'Mocniejszy składnik główny, lepsza konsystencja.' },
        signature: { name: 'SIGNATURE', body: 'Maksymalny odczuwalny smak, zachowana stabilność.' },
      },
      modeFocus: { eco: 'Koszt', classic: 'Balans', premium: 'Konsystencja', signature: 'Smak' },
      /** INTERNAL Engine classifications (diagnostic only — never a primary selector). */
      categories: {
        milk_gelato: 'Mleczne',
        fruit_gelato: 'Owocowe',
        nut_gelato: 'Orzechowe',
        chocolate_gelato: 'Czekoladowe',
        alcohol_gelato: 'Alkoholowe',
        sorbet: 'sorbet',
        vegan_gelato: 'Wegańskie',
        custom: 'Własne',
      },
      /** Serving mode — Świeże/−11/−12/−13 (ONE state drives workbar/Engine/Monitor/solver). */
      servingLabel: 'Tryb serwowania',
      /** SPEC §11.2 exact label — serving is a separate concept from
       * production/extraction and storage (AUDIT #5, owner decision Slice C). */
      temperatureLabel: 'Temperatura serwowania',
      temperatureHelp: 'Niższa temperatura serwowania = twardsza konsystencja w witrynie.',
      batchLabel: 'Wielkość partii',
      /** Advanced, EXPLICIT goal tuning — never a silent override of the quality tier. */
      advancedLabel: 'Ustawienia zaawansowane',
      advancedNote:
        'Doprecyzowują cele w ramach wybranego poziomu jakości — nigdy go nie nadpisują.',
      machineLabel: 'Pojemność maszyny',
      machineNone: 'Bez limitu',
      machineHelp: 'Opcjonalnie — ostrzeże, gdy partia się nie zmieści.',
      flavorLabel: 'Intensywność smaku',
      flavorOptions: {
        light: 'Lekka',
        balanced: 'Zbalansowana',
        strong: 'Mocna',
        maximum: 'Maksymalna',
      },
      costLabel: 'Priorytet kosztowy',
      /** 'premium' cost goal is labelled distinctly so it can never read as the PREMIUM tier. */
      costOptions: { low: 'Niski koszt', balanced: 'Zrównoważony', premium: 'Bez kompromisów' },
    },
    overall: {
      /** ACCEPTANCE ADDENDUM (2), owner decision 2026-07-24 — the public
       * headline integer is TECHNICAL recipe-fit („Dopasowanie techniczne");
       * flavor/cost are separate labeled dimensions below, never blended in.
       * Supersedes the §15.1 „Dopasowanie receptury" headline. */
      eyebrow: 'Dopasowanie techniczne',
      modeSuffix: 'Tryb',
      empty: 'Dodaj składniki, aby ocenić recepturę.',
      /* Owner P0 (score truthfulness) — assessment coverage, never a hidden gap. */
      coverage: (assessed: number, total: number) => `Oceniono ${assessed} z ${total} obszarów.`,
      partialNote: 'Ocena częściowa / prowizoryczna dla tego profilu.',
      /* ACCEPTANCE ADDENDUM (2) — the separate commercial/subjective dimensions. */
      dimensionsHeading: 'Wymiary dodatkowe (poza oceną techniczną)',
      flavorDimension: 'Profil smakowy (subiektywny)',
      costDimension: 'Koszt (komercyjny)',
      costNoData: 'Brak danych kosztowych',
    },
    builder: {
      title: 'Składniki',
      addLabel: 'Dodaj składnik',
      searchLabel: 'Szukaj składników',
      searchPlaceholder: 'Szukaj składnika, kategorii, marki lub ID…',
      resultsLabel: 'Wyniki',
      liveSearchHint:
        'Wpisz nazwę składnika, kategorię lub ID — przeszukamy aktualny katalog Gellatti.',
      searching: 'Szukam w katalogu Gellatti…',
      searchError: 'Nie udało się przeszukać katalogu. Sprawdź połączenie i spróbuj ponownie.',
      moreResults: 'Pokaż więcej wyników',
      needsData:
        'Składnik został wybrany, ale wymaga uzupełnienia danych przed dokładnym przeliczeniem.',
      duplicateNotice: (count: number) =>
        count === 1
          ? 'Receptura zawiera 1 zduplikowany wiersz składnika (pozostałość po wcześniejszym przeliczeniu).'
          : `Receptura zawiera ${count} zduplikowane wiersze składników (pozostałość po wcześniejszym przeliczeniu).`,
      mergeDuplicates: 'Scal zduplikowane składniki',
      noMatches: 'Nie znaleziono składnika w katalogu. Spróbuj innej nazwy, formy lub kategorii.',
      /** Honest empty-state exit (AUDIT #2 dead-end rule): a no-results search
       * always offers a way back to the full list. */
      clearSearch: 'Wyczyść wyszukiwanie',
      resultUnitOne: 'Składnik',
      resultUnitMany: 'Składników',
      resultFoundSuffix: 'Znaleziono',
      loadingLibrary: 'Ładowanie biblioteki składników…',
      fallbackNote: 'Biblioteka jest chwilowo niedostępna — pokazujemy składniki przykładowe.',
      planned: 'Planowane',
      actual: 'Rzeczywiste',
      share: 'Udział',
      lock: 'Blokada',
      mark_main: 'Ustaw jako główny',
      main_short: 'Główny',
      remove: 'Usuń',
      /** Owner FINAL CLOSURE C2 (ADD-only keys) — the EXPLICIT „unavailable"
       * action: the ONLY way an ingredient becomes excluded. „Usuń" merely
       * removes the row from the current recipe. */
      markUnavailable: 'Niedostępny',
      markUnavailableTitle:
        'Oznacz jako niedostępny — Gellatti usunie składnik z receptury i nie doda go ponownie bez Twojej decyzji.',
      unit: 'g',
      batchTotal: 'Suma partii',
      target: 'Cel',
      ingredientGroups: {
        sugar: 'Cukry',
        dairy: 'Nabiał',
        fat: 'Tłuszcze',
        fruit: 'Owoce',
        nut_paste: 'Pasty orzechowe',
        chocolate_cocoa: 'Czekolada i kakao',
        stabilizer: 'Stabilizatory',
        flavor: 'Aromaty',
        alcohol: 'Alkohol',
        water: 'Woda',
        egg: 'Jaja',
        other: 'Inne',
      },
      empty: 'Dodaj składniki, aby zacząć — Monitor zaktualizuje się automatycznie.',
      lockTypes: {
        unlocked: 'Odblokowany',
        grams: 'Zablokowany · gramy',
        percent: 'Zablokowany · %',
        main: 'Składnik główny',
        already_added: 'Już dodany',
        required: 'Wymagany',
      },
      ingredientTable: {
        columns: {
          ingredient: 'Składnik',
          percent: '%',
          quantity: 'Ilość',
          price: 'Cena/kg',
        },
        role: {
          heading: 'Rola składnika',
          main: 'Główny',
          standard: 'Standardowy',
          addition: 'Dodatek',
          mainHint: 'Definiuje smak i tożsamość produktu.',
          additionHint: 'Dodatek po procesie lub wokół gotowej bazy.',
          additionReadiness: 'Dostępne po przygotowaniu bazy',
        },
        recipe: {
          heading: 'Receptura',
          requiredOn: 'Składnik wymagany ✓',
          requiredOff: 'Oznacz jako wymagany',
          requiredHint: 'Składnik wymagany dla tej receptury.',
          unavailable: 'Oznacz jako niedostępny',
          available: 'Oznacz jako dostępny',
          unavailableStatus: 'NIEDOSTĘPNY',
          findSubstitute: 'Znajdź zamiennik',
        },
        data: {
          heading: 'Dane',
          open: 'Dane składnika',
          myPrice: 'Moja cena · W PRZYGOTOWANIU',
          estimatedHint: 'Część danych składnika jest szacowana.',
          missingAmountHint:
            'Brak zweryfikowanej ilości. Ustaw ilość odpowiednią dla swojej receptury.',
          source: 'Źródło',
          status: 'Status',
          confidence: 'Pewność',
          id: 'ID',
          verified: 'Zweryfikowane',
          estimated: 'Częściowo szacowane',
          // Informational product facts. Never a warning, never a gate.
          process: 'Obróbka',
          recommendedDosage: 'Zalecane dawkowanie producenta',
          noInformation: 'Brak informacji',
        },
        remove: {
          heading: 'Usuń',
          action: 'Usuń z receptury',
        },
        percentReadiness: 'Blokada procentowa',
        requiredDialog: {
          title: 'Ten składnik jest wymagany',
          body: 'Usunięcie tego składnika może uniemożliwić przygotowanie tej receptury.',
          substituteAvailable: 'Możesz zastąpić ten składnik.',
          noSubstitute: 'Brak odpowiedniego zamiennika',
          noSubstituteBody:
            'Bez tego składnika Gellatti nie może teraz utworzyć poprawnej wersji tej receptury.',
          keep: 'Zostaw składnik',
          removeInfeasible: 'Usuń i oznacz recepturę jako niewykonalną',
          confirmTitle: 'Potwierdź niewykonalność receptury',
          confirmBody:
            'Składnik zostanie usunięty, a przeliczenie pozostanie zablokowane do czasu uzupełnienia wymaganej roli.',
          confirm: 'Tak, usuń składnik',
        },
        substituteDialog: {
          title: (name: string) => `Zamiennik dla: ${name}`,
          intro: 'Zweryfikowane kandydaty o tej samej roli technologicznej:',
          pending: 'WYSZUKIWANIE',
          pendingBody: 'Brak bezpiecznego zamiennika dla bieżącego profilu i znanych ograniczeń.',
          direct: 'Zamiennik bezpośredni',
          reformulation: 'Wymaga reformulacji',
          use: 'Przygotuj podgląd',
          mainConfirmation:
            'Rozumiem, że zamiana składnika Głównego zmienia tożsamość smaku receptury.',
          cancel: 'Anuluj',
        },
        infeasible: {
          title: 'RECEPTURA NIEWYKONALNA',
          body: 'Brakuje wymaganego składnika. Przeliczenie pozostaje zablokowane, dopóki nie uzupełnisz tej roli.',
        },
      },
    },
    pi: {
      title: 'Wskaźniki receptury',
      note: 'Wartości aktualizują się przy każdej zmianie.',
      calibration: 'Kalibracja',
      groups: {
        freezing: 'Mrożenie i struktura',
        balance: 'Balans',
        risk: 'Ryzyko',
      },
      fallbackCategory:
        'Zakresy oszacowano z kalibracji gelato mlecznego — ta kategoria czeka na własną kalibrację.',
      fallbackTemperature: 'Zakresy pochodzą z najbliższej skalibrowanej temperatury.',
      fallbackEstimated:
        'Co najmniej jeden zakres jest oszacowany i wymaga potwierdzenia kalibracji.',
      indicators: {
        pod: 'Słodycz · POD',
        npac: 'Stabilność mrożenia · NPAC',
        ice_fraction: 'Struktura · udział lodu',
        water: 'Bilans wody',
        total_solids: 'Sucha masa',
        fat: 'Bilans tłuszczu',
        aerating_protein: 'Białko napowietrzające',
        protein_in_solids: 'Białko w suchej masie',
        lactose: 'Laktoza',
        lactose_sandiness_risk: 'Ryzyko piaszczystości',
        alcohol: 'Alkohol',
      },
    },
    warnings: {
      alcohol_above_safe_range: 'Alkohol przekracza stabilny zakres dla tego gelato.',
      machine_capacity_exceeded: 'Partia przekracza pojemność maszyny.',
      batch_mass_mismatch: 'Masa partii różni się od celu.',
      composition_invalid: 'Dane jednego ze składników są niespójne.',
      low_confidence_ingredient: 'Część wartości składników jest oszacowana, nie potwierdzona.',
      cost_incomplete: 'Koszt jest niepełny — brakuje cen części składników.',
    },
    metrics: {
      title: 'Wartości odżywcze · koszt',
      nutritionTitle: 'Na 100 g',
      kcal: 'Energia',
      fat: 'Tłuszcz',
      saturated: 'W tym nasycone',
      carbs: 'Węglowodany',
      sugars: 'W tym cukry',
      protein: 'Białko',
      salt: 'Sól',
      fiber: 'Błonnik',
      alcohol: 'Alkohol',
      unavailable: 'Dodaj składniki, aby zobaczyć wartości',
      costTitle: 'Koszt',
      costPerKg: 'Na kg',
      serving60: 'Na 60 g',
      serving70: 'Na 70 g',
      serving80: 'Na 80 g',
      costIncomplete: 'Dodaj ceny składników, aby obliczyć pełny koszt',
      /** Owner P0 UX repair (2026-07-24): the HONEST empty state when no ingredient
       * prices exist — never a blank box (ADDITIVE key). */
      costEmpty: 'Brak cen składników — dodaj ceny, aby zobaczyć koszt.',
      /** Monitor completeness (Agent M): the BATCH cost row — the engine's already-computed
       * `costs.total_cost` was never presented; „koszt partii" is part of the owner's
       * B1 parity inventory. ADDITIVE key. */
      costBatch: 'Koszt partii',
      scoreTitle: 'Ocena',
      technical: 'Technika',
      flavor: 'Smak',
      cost: 'Koszt',
      overall: 'Łącznie',
      scoreUnavailable: '—',
    },
    corrections: {
      title: 'Korekty',
      none: 'Receptura jest zbalansowana — korekta nie jest potrzebna.',
      incompleteRecipe: 'Receptura jest niekompletna — dodaj składniki i gramatury, aby ją ocenić.',
      demoPreviewNote: 'Podgląd receptury — dokładne gramy są ukryte.',
      demoDirections: {
        add: 'Dodaj składnik balansujący',
        reduce: 'Zmniejsz ilość składnika',
        rebalance: 'Zbalansuj mieszankę',
      },
      demoArea: 'Sugerowany obszar',
      add: 'Dodaj',
      reduce: 'Zmniejsz',
      before: 'Teraz',
      after: 'Po zmianie',
      confidenceLabel: 'Pewność',
      tradeoffTitle: 'Kompromis',
      impossibleTitle: 'Nie można w pełni zbalansować',
      blocking: {
        locked_ingredient:
          'Główna przyczyna to zablokowany składnik. Odblokuj go, aby zastosować korektę.',
        already_added:
          'Tego składnika nie można już zmniejszyć. Zbalansuj recepturę przez dodawanie.',
        main_ingredient_floor: 'Ta korekta obniżyłaby główny składnik poniżej chronionego minimum.',
        machine_capacity: 'Korekta przekroczyłaby pojemność maszyny.',
        no_candidate: 'Przy obecnych składnikach nie ma bezpiecznej korekty.',
      },
      confidence: { high: 'Wysoka', medium: 'Średnia', low: 'Niska', tradeoff: 'Kompromis' },
    },
  },
  /**
   * Product catalog intake — the unified CSV upload UI (Mapper Slice D5C4). ONE flow
   * for every source (generic / Mercadona / Colin); the selector only stamps
   * source_type, there is no separate Colin system. Customer-facing — never "Demo".
   */
  productsImport: {
    eyebrow: 'Katalog produktów',
    title: 'Importuj katalog produktów',
    blurb: 'Wgraj plik CSV lub wklej dane, a następnie sprawdź produkty przed importem.',
    sourceLabel: 'Źródło katalogu',
    sources: {
      generic: 'Katalog ogólny',
      mercadona: 'Katalog Mercadona',
      colin: 'Katalog wewnętrzny',
      intimport: 'INTIMPORT',
    },
    inputLabel: 'Wgraj plik produktów',
    pastePlaceholder: 'Wklej wiersze CSV — pierwsza linia to nagłówek…',
    fileLabel: 'Wybierz plik',
    parse: 'Analizuj plik',
    import: 'Importuj produkty',
    signIn: 'Zaloguj się, aby importować',
    signInNote: 'Analiza jest otwarta — zaloguj się, aby zapisać produkty do katalogu.',
    unavailable: 'Import jest niedostępny w tej wersji.',
    previewLabel: 'Plik źródłowy',
    warningsLabel: 'Ostrzeżenia',
    skippedLabel: 'Pominięte wiersze',
    resultLabel: 'Import',
    rowResultsLabel: 'Wiersze',
    emptyPreview: 'Wgraj plik .xlsx lub .csv, a następnie kliknij „Analizuj plik\u201d.',
    noWarnings: 'Brak ostrzeżeń.',
    noSkipped: 'Brak pominiętych wierszy.',
    codesCreated: 'Nadane kody produktów',
    importError: 'Import nie mógł się zakończyć.',
    counts: {
      total: 'Wiersze',
      valid: 'Poprawne',
      warnings: 'Ostrzeżenia',
      skipped: 'Pominięte',
      created: 'Nowe produkty',
      existing: 'Ponownie użyte',
      inBatch: 'Duplikaty w pliku',
      failed: 'Błędy',
    },
    outcomes: {
      created: 'Utworzony',
      existing: 'Ponownie użyty',
      in_batch_duplicate: 'Duplikat w pliku',
      skipped: 'Pominięty',
      failed: 'Błąd',
    },
  },
  notFound: {
    code: '404',
    headline: 'Ta strona nie istnieje.',
    back: 'Wróć na stronę główną',
  },
  /** 404 — PL-unified copy (Masterpiece Phase 6). NEW namespace: the legacy `notFound`
   * keys above are preserved untouched (parallel-safety copy rule). */
  notFoundV2: {
    headline: 'Ta strona nie istnieje.',
  },
  footer: {
    line: 'GELLATTI — przyjazne laboratorium gelato.',
  },
} as const;
