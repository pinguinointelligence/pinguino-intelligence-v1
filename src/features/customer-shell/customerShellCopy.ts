/**
 * PINGÜINO Customer Shell — Polish copy (CustomerShellV1).
 *
 * The single source of every VISIBLE string for the `/start` customer surface.
 * The pure customer-flow core (Agent B) speaks in copy KEYS such as
 * `customer_flow.product_type.gelato`; those keys are mapped to Polish text here
 * so the presentation layer never hardcodes user-facing prose inline.
 *
 * Presentational data only — no logic, no IO, no engine access. Plain const.
 */

export const customerShellCopy = {
  /* ------------------------------------------------------------------ Menu -- */
  menu: {
    brand: 'PINGÜINO',
    open: 'Otwórz menu',
    close: 'Zamknij menu',
    title: 'Menu',
    sectionMain: 'Nawigacja',
    sectionAccount: 'Konto',
    signIn: 'Zaloguj się',
    signOut: 'Wyloguj się',
    signedInAs: 'Zalogowano',
    authUnavailable: 'Logowanie jest chwilowo niedostępne.',
    classic: 'Wersja klasyczna',
    /** Keyed by CUSTOMER_MENU_ITEMS[].key — labels for the real routes only. */
    primary: {
      home: 'Strona główna',
      start: 'Stwórz recepturę',
      studio: 'Studio',
      recipes: 'Gotowe receptury',
      myRecipes: 'Moje receptury',
      machine: 'Moja maszyna',
      label: 'Etykiety',
      subscription: 'Subskrypcja / Plany',
    },
  },

  /* ---------------------------------------------------------------- Home -- */
  home: {
    headline: 'Jakie lody dziś robimy?',
    subhead: 'Opisz swoje lody własnymi słowami — resztą zajmiemy się razem.',
    placeholder: 'Powiedz lub napisz, jakie lody chcesz przygotować…',
    inputLabel: 'Twój pomysł na lody',
    next: 'Dalej',
    tryExample: 'Wypróbuj przykład',
    example: 'Wanilia z dodatkiem bazylii i mięty',
    restart: 'Zacznij od nowa',
  },

  /* ------------------------------------------------------------- Microphone -- */
  mic: {
    idle: 'Naciśnij i mów',
    listening: 'Słucham…',
    unavailable: 'Wpisywanie głosem niedostępne w tej przeglądarce',
    permissionDenied: 'Brak dostępu do mikrofonu',
  },

  /* ------------------------------------------------------------- Flavor chips -- */
  chips: {
    label: 'Wykryte smaki',
    title: 'Twoje smaki',
    lead: 'Usuń to, czego nie chcesz, albo dodaj własny smak.',
    /**
     * Owner hotfix §5: once a flavour is confirmed the step must NOT read like
     * a fresh request for one — it asks whether to add ANOTHER.
     */
    leadMore: 'Chcesz dodać jeszcze jeden smak?',
    addLabel: 'Dodaj smak',
    addPlaceholder: 'np. bazylia',
    addButton: 'Dodaj',
    empty: 'Nie wykryliśmy jeszcze żadnego smaku — możesz dodać go poniżej.',
  },

  /* ------------------------------------------------------------- Product type -- */
  productType: {
    label: 'Rodzaj',
    // Owner hotfix §6: the customer picks a KIND OF ICE CREAM, not a "base" —
    // „Jaki to rodzaj?” / „Wybierz bazę” was engineer language.
    title: 'Jaki rodzaj lodów chcesz przygotować?',
    lead: 'Wybierz rodzaj receptury.',
    /** Keyed by the copy KEYS emitted by productTypeQuestion(). */
    byKey: {
      'customer_flow.product_type.gelato': {
        label: 'Lody mleczne (gelato)',
        desc: 'Klasyczna baza na mleku i śmietanie.',
      },
      'customer_flow.product_type.sorbet': {
        label: 'Sorbet',
        desc: 'Baza na wodzie i owocach, bez mleka.',
      },
      'customer_flow.product_type.vegan': {
        label: 'Wegańskie',
        desc: 'Baza roślinna, bez składników odzwierzęcych.',
      },
      'customer_flow.product_type.protein': {
        label: 'Proteinowe',
        desc: 'Baza wzbogacona białkiem.',
      },
    } as Record<string, { label: string; desc: string }>,
    /** Short label keyed by the visible product type value (all four keys present). */
    short: {
      gelato: 'Gelato',
      sorbet: 'Sorbet',
      vegan: 'Wegańskie',
      protein: 'Proteinowe',
    },
    /**
     * Fuller, customer-facing label for the COMPACT recipe context line
     * (owner UX correction §4/§5 — „Gelato mleczne · 1330 g”). Never an engine
     * or „base” term — a kind of ice cream in plain Polish.
     */
    compact: {
      gelato: 'Gelato mleczne',
      sorbet: 'Sorbet',
      vegan: 'Lody wegańskie',
      protein: 'Lody proteinowe',
    },
  },

  /* ----------------------------------------------------- Protein honest gap -- */
  proteinGap: {
    label: 'Jeszcze nie teraz',
    title: 'Proteinowe nie jest jeszcze wspierane',
    body: 'Baza proteinowa nie ma jeszcze zweryfikowanego profilu, więc nie stworzymy z niej receptury. Nie podstawimy w zamian gelato po cichu — wybierz jedną z pozostałych baz poniżej.',
  },

  /* --------------------------------------------------------- Device / serving -- */
  device: {
    label: 'Urządzenie',
    title: 'Na czym przygotujesz lody?',
    lead: 'Wybór urządzenia pomaga ustalić wielkość porcji. Pojemności podane w ml nie przeliczamy po cichu na gramy.',
    massVerified: 'Zatwierdzona masa receptury',
    capacityNominal: 'Pojemność pojemnika',
    volumeNotMass: 'objętości nie przeliczamy na gramy',
    capacityUserDefined: 'Ilość ustalasz samodzielnie',
    unitGrams: 'g',
    unitMl: 'ml',
  },

  /* ------------------------------------------- Device names (id → label) -- */
  /**
   * Neutral, honest customer-facing device names keyed by the device preset id.
   * Mapped by id at the shell layer; the preset objects are never mutated.
   */
  deviceLabels: {
    'ninja-creami': 'Ninja CREAMi',
    'ninja-creami-scoop-swirl': 'Ninja CREAMi Scoop & Swirl',
    'ninja-creami-deluxe': 'Ninja CREAMi Deluxe',
    'professional-machine': 'Maszyna profesjonalna',
  } as Record<string, string>,

  /* -------------------------------------------- Ninja appliance preparation -- */
  /**
   * A Ninja is a home appliance: it freezes a fixed container and runs a fixed
   * program, so there is NO serving-temperature choice — we show an honest
   * preparation note instead of a fake temperature step.
   */
  devicePrep: {
    label: 'Przygotowanie',
    title: 'Jak powstaną lody?',
    ninja: 'Przygotowanie w urządzeniu Ninja — mrożenie w pojemniku i program urządzenia.',
    short: 'Program urządzenia Ninja',
  },

  serving: {
    label: 'Konsystencja',
    title: 'Jak podasz lody?',
    lead: 'Temperatura to informacja dodatkowa — pokazujemy ją pod przyjazną nazwą.',
    options: {
      soft11: { label: 'Miękkie', secondary: 'około −11°C' },
      scoop12: { label: 'Do gałek', secondary: 'około −12°C' },
      firm13: { label: 'Twardsze', secondary: 'około −13°C' },
      deep18: { label: 'Zamrażarka', secondary: 'około −18°C' },
      displayFresh: { label: 'Witryna / świeże', secondary: 'podanie na bieżąco' },
      custom: { label: 'Własne', secondary: 'ustawię samodzielnie' },
    },
  },

  /* ---------------------------------------------- Serving / machine modes (six) -- */
  modes: {
    label: 'Tryb',
    title: 'Jak przygotujesz lody?',
    // Consumer wording (audit #27): no "zatwierdzona masa wsadu" jargon in the
    // Home-facing lead — the honest fact (Ninja quantity is set automatically
    // from a tested recipe) stays, phrased in plain language.
    lead: 'Wybierz temperaturę podania albo tryb maszyny. W trybach Ninja właściwą ilość ustawiamy za Ciebie.',
    /** Keyed by ServingModeId. Direct temperatures + our fresh machine + two Ninja profiles. */
    options: {
      temp_minus_11: { label: '−11°C', secondary: 'Bardziej miękkie' },
      temp_minus_12: { label: '−12°C', secondary: 'Klasyczne do gałek' },
      temp_minus_13: { label: '−13°C', secondary: 'Bardziej zwarte' },
      fresh: { label: 'Świeże', secondary: 'Nasza maszyna · świeża produkcja' },
      ninja_gelato: { label: 'Ninja Gelato', secondary: 'Profil Ninja · bardziej zwarte' },
      ninja_swirl: { label: 'Ninja Swirl', secondary: 'Profil Ninja · bardziej miękkie' },
    },
  },

  /* --------------------------------------------------- Device capacity confirm -- */
  capacity: {
    label: 'Pojemność',
    title: 'Ile mieści to urządzenie?',
    lead: 'Podano tylko objętość w ml, a jej nie zamieniamy po cichu na gramy. Podaj wagę wsadu w gramach — zapytamy tylko raz.',
    officialCapacityLabel: 'Pojemność pojemnika',
    inputLabel: 'Waga wsadu (g)',
    inputPlaceholder: 'np. 700',
    confirm: 'Zatwierdź',
    hint: 'Podaj wartość w gramach.',
  },

  /* ------------------------------------------------------------------ Batch -- */
  batch: {
    label: 'Ilość',
    title: 'Jaką ilość przygotujesz?',
    lead: 'Wybierz gotową wielkość albo podaj własną.',
    legend: 'Wielkość partii',
    options: {
      oneKg: '1 kg',
      fiveKg: '5 kg',
      tenKg: '10 kg',
      custom: 'Własna',
    },
    customLabel: 'Własna ilość (g)',
    customPlaceholder: 'np. 2500',
    customConfirm: 'Ustaw',
    resolvedLabel: 'Ustalona ilość',
    selectedLabel: 'Wybrana ilość',
    change: 'Zmień ilość',
    source: {
      user: 'wybrana przez Ciebie',
      text: 'rozpoznana z Twojego zdania',
      mode_ninja: 'zatwierdzona masa trybu Ninja',
      none: 'jeszcze nieustalona',
    },
  },

  /* ------------------------------------------------------------- Recipe path -- */
  path: {
    label: 'Dalej',
    title: 'Jak chcesz działać?',
    lead: 'Obie drogi są równorzędne — wybierz, co wolisz.',
    newRecipe: 'Stwórz nową recepturę',
    readyRecipe: 'Pokaż pasujące gotowe receptury',
  },

  /* -------------------------------------------------------------- Ready list -- */
  ready: {
    label: 'Gotowe receptury',
    title: 'Najbliższe pomysły',
    lead: 'To najbliższe propozycje z katalogu. Nie pokazujemy zmyślonych procentów dopasowania — tylko uczciwą etykietę.',
    empty: 'Nie znaleźliśmy pasujących gotowych receptur. Spróbuj stworzyć nową.',
    view: 'Zobacz recepturę',
    useAsStart: 'Użyj jako punkt wyjścia',
    changeSelection: 'Zmień recepturę',
    /** Honest, generic descriptor for a catalogue card — invents no specifics. */
    cardMeta: 'Receptura poglądowa',
    matchLabels: {
      closest_idea: 'Najbliższy pomysł',
      similar_flavor_profile: 'Podobny profil smakowy',
      matches_device: 'Pasuje do urządzenia',
      vegan_version: 'Wersja wegańska',
      similar_base: 'Podobna baza',
    },
    photoMissingAlt: 'Zdjęcie wkrótce',
  },

  /* ------------------------------------- Catalogue names (id → title) -- */
  /**
   * Neutral, honest customer-facing titles for the illustrative example recipes,
   * keyed by the fixture catalogue-card id. The fixtures carry engineering titles
   * (e.g. "Vanilla (classic) — fixture") that must never reach the customer; we
   * map by id at the shell layer and never mutate the fixture objects.
   */
  catalogueTitles: {
    'cat-vanilla-classic': 'Wanilia (klasyczna)',
    'cat-chocolate-orange': 'Czekolada i pomarańcza',
    'cat-pistachio': 'Pistacja',
    'cat-raspberry-sorbet': 'Sorbet malinowy',
    'cat-mango-sorbet': 'Sorbet mango',
    'cat-lemon-sorbet': 'Sorbet cytrynowy',
    'cat-vegan-chocolate': 'Wegańska czekolada',
    'cat-hazelnut-comingsoon': 'Orzech laskowy (wkrótce)',
  } as Record<string, string>,

  /* ------------------------------------------------------------------ Result -- */
  result: {
    label: 'Podgląd',
    title: 'Podgląd receptury',
    fixtureNotice:
      'To podglądowa struktura składników, a nie wyliczona receptura. Nazwy są przykładowe, a dokładne ilości wyliczy silnik po odblokowaniu.',
    draftNotice: 'Utworzono edytowalny szkic roboczy na podstawie gotowej receptury — katalog pozostaje bez zmian.',
    typeLabel: 'Rodzaj',
    deviceLabel: 'Urządzenie',
    servingLabel: 'Podanie',
    modeLabel: 'Tryb',
    modeNone: 'nie wybrano',
    batchLabel: 'Ilość',
    ingredientsTitle: 'Składniki',
    deviceNone: 'nie wybrano',
    servingNone: 'nie wybrano',
    /** Compact locked stand-in label for Demo base lines (no gram number). */
    lockedInPlans: 'Ilość w Home i Pro',
    /** Honest right-side requirement labels for lines with no safe dose yet. */
    resolutionLabels: {
      needs_ingredient: 'wymaga wyboru składnika',
      needs_dose: 'wymaga potwierdzenia dawki',
    } as Record<string, string>,
    /** Friendly, TAPPABLE call-to-action per unresolved line kind. */
    resolutionCta: {
      needs_ingredient: 'Wybierz składnik',
      needs_dose: 'Ustal intensywność smaku',
    } as Record<string, string>,
    /** Friendly "almost ready" status — never claims a fully calculated recipe. */
    needsRefinementPrefix: 'Receptura jest prawie gotowa — doprecyzuj intensywność',
    needsRefinementNoun: {
      one: 'składnika',
      few: 'składników',
      many: 'składników',
    },
    fullyResolvedNote: 'Wszystkie składniki są wstępnie rozpisane.',
    /** Readable Polish names for base recipe lines, keyed by engine + structure id. */
    baseIngredientNames: {
      // real engine (demo/reference catalog) ids
      milk_3_5: 'Mleko 3,5%',
      cream_30: 'Śmietana 30%',
      smp: 'Mleko odtłuszczone w proszku',
      sucrose: 'Cukier (sacharoza)',
      dextrose: 'Dekstroza',
      tara_gum: 'Stabilizator (guma tara)',
      cocoa_2224: 'Kakao 22/24',
      dark_chocolate_70: 'Czekolada gorzka 70%',
      // structure-only (not-yet-calculated) ids
      milk: 'Mleko',
      cream: 'Śmietana',
      sugar: 'Cukier',
      stabilizer: 'Stabilizator',
      water: 'Woda',
      'plant-milk': 'Napój roślinny',
      'coconut-oil': 'Olej kokosowy',
    } as Record<string, string>,
    /** Result-state banners — honest about whether the engine calculated the card. */
    stateCalculated: 'Receptura wyliczona przez silnik PINGÜINO.',
    stateOutOfBand: 'Receptura wyliczona — część parametrów jest poza złotym zakresem. Dopasuj ją w Monitorze receptury poniżej.',
    // Track G: at a temperature where interactive tuning awaits approval, the
    // status must not point at tuning controls that honestly cannot run.
    stateOutOfBandNoTuning:
      'Receptura wyliczona — część parametrów jest poza złotym zakresem dla tej temperatury podawania.',
    stateStructureOnly:
      'To podglądowa struktura składników, a nie wyliczona receptura. Dokładne ilości wyliczy silnik, gdy uzupełnisz wymagane dane.',
    /**
     * Owner UX correction §11 — ONE unambiguous recipe status, never the old
     * double message („prawie gotowa” + „wyliczona przez silnik” at once).
     */
    status: {
      readyPreview: 'Receptura gotowa do podglądu',
      readyRecalc: 'Gotowa do przeliczenia',
      needsProductsPrefix: 'Wymaga wyboru',
      /** Plural of „produkt” (1 / 2–4 / 5+). */
      productNoun: { one: 'produktu', few: 'produktów', many: 'produktów' },
      /** Required-products guidance: „Wybierz konkretne produkty dla N składników, aby …”. */
      needsProductsGuidancePrefix: 'Wybierz konkretne produkty dla',
      needsProductsGuidanceSuffix: ', aby dokładnie przeliczyć recepturę.',
    },
  },

  /* -------------------------------------------------------- Flavor intensity -- */
  intensity: {
    rowCta: 'Ustal intensywność smaku',
    rowChosenPrefix: 'Intensywność',
    sheetTitle: 'Jak intensywny ma być ten smak?',
    sheetFlavorPrefix: 'Smak',
    options: {
      delicate: 'Delikatny',
      pronounced: 'Wyraźny',
      strong: 'Mocny',
    },
    advanced: 'Ustawienia zaawansowane',
    advancedNote:
      'Twój wybór zapisujemy jako preferencję smaku — nie zamieniamy go po cichu na gramy. Dokładną ilość wyliczymy dopiero, gdy pojawi się zweryfikowana reguła dla tego smaku, albo gdy podasz ilość ręcznie w planie Home lub Pro.',
    manualLabel: 'Ręczna ilość (g)',
    manualPlaceholder: 'np. 20',
    manualConfirm: 'Ustaw ręcznie',
    manualSetPrefix: 'Ustawiono ręcznie',
    close: 'Gotowe',
  },

  /* ---------------------------------------------------- Ingredient row actions -- */
  rowActions: {
    more: 'Więcej opcji',
    moreForPrefix: 'Opcje składnika',
    sheetTitlePrefix: 'Składnik',
    substitute: 'Zastąp składnik',
    dontHave: 'Nie mam tego składnika',
    change: 'Zmień',
    remove: 'Usuń',
    why: 'Po co jest ten składnik?',
    whyBody:
      'Ten składnik należy do bazowej struktury tej receptury. Dokładne proporcje wylicza silnik po odblokowaniu — tutaj pokazujemy tylko, z czego składa się przepis.',
    close: 'Zamknij',
  },

  /* ------------------------------------------- Ingredient resolution + picker -- */
  resolution: {
    sheetTitlePrefix: 'Składnik',
    close: 'Zamknij',
    back: 'Wróć',
    /** Right-side chip on a recipe row, by resolution state. */
    chipChoose: 'Wybierz produkt',
    chipNeedsData: 'Wymaga danych',
    chipResolvedPrefix: 'Wybrano',
    /** Bottom-sheet actions (exact wording). */
    actions: {
      choose_candidate: 'Wybierz konkretny produkt',
      search_catalogue: 'Wyszukaj w katalogu',
      scan_label: 'Skanuj etykietę',
      add_manually: 'Dodaj produkt ręcznie',
      dont_have: 'Nie mam tego składnika',
      substitute: 'Zastąp składnik',
      why: 'Po co jest ten składnik?',
    } as Record<string, string>,
    /** Fresh/culinary form step. */
    formTitle: 'W jakiej postaci masz ten składnik?',
    formLead: 'Wybierz postać — to preferencja technologiczna, nie ustalamy tu gramów.',
    /** Product picker. */
    pickerTitle: 'Wybierz konkretny produkt',
    searchLabel: 'Szukaj produktu',
    searchPlaceholder: 'Nazwa, marka lub kod EAN…',
    noResults: 'Brak pasujących produktów. Możesz dodać produkt ręcznie albo zeskanować etykietę.',
    badgeReady: 'Gotowy do przeliczenia',
    badgeNeedsData: 'Wymaga danych',
    packagePrefix: 'Opakowanie',
    eanPrefix: 'EAN',
    /** Honest note about the catalogue source (sample vs live). */
    sampleSourcePrefix: 'Katalog',
    /** Outcome after picking. */
    resolvedReady: 'Ten produkt ma wystarczające dane do dokładnego przeliczenia.',
    needsDataScan: 'Skanuj etykietę',
    needsDataManual: 'Uzupełnij dane ręcznie',
    needsDataOther: 'Wybierz inny produkt',
    /** Substitution / not-having. */
    substituteTitle: 'Zastąp składnik',
    substituteLabel: 'Czym zastąpić?',
    substitutePlaceholder: 'np. rum zamiast whisky',
    substituteConfirm: 'Zastąp',
    substituteRecorded: 'Zapisaliśmy propozycję zamiany. Silnik uwzględni ją przy przeliczeniu.',
    dontHaveRecorded: 'Zanotowaliśmy, że nie masz tego składnika — możesz go zastąpić albo pominąć.',
    /** Scan / manual add delegation (no live persistence in this environment). */
    intakeScanTitle: 'Skanowanie etykiety',
    intakeManualTitle: 'Ręczne dodanie produktu',
    intakeBackendNote:
      'Zapisywanie nowych produktów wymaga podłączonego, zatwierdzonego środowiska. Twoja receptura pozostaje bez zmian — nic nie zostało zapisane.',
    intakeDevLink: 'Otwórz dodawanie produktu (dev)',
    /** Explanation for "Po co jest ten składnik?". */
    whyBody:
      'Ten składnik realizuje smak, o który poprosiłeś. Wybór konkretnego produktu pozwala silnikowi policzyć recepturę dokładnie — bez zgadywania składu.',
  },

  /* ------------------------------------------------------------- Monitor PI -- */
  monitor: {
    /** §13.3 header — the customer-facing Monitor name (never an internal code). */
    label: 'Monitor receptury',
    title: 'Dostrój recepturę',
    lead: 'Wskaż kierunek — PI dopasuje recepturę w bezpiecznym, złotym zakresie. Używamy gotowych, sprawdzonych kroków, nie zgadujemy wartości.',
    recalc: 'Przelicz z PI',
    /** Shown when recalculation is allowed (all products resolved). */
    readyNote:
      'Kierunek zapisany. Dokładne przeliczenie z gramami uruchomisz w planie Home lub Pro — na recepturze wyliczonej przez silnik.',
    /** Shown in the Demo preview (qualitative only, no grams). */
    demoNote: 'W podglądzie pokazujemy kierunek zmian jakościowo, bez gramów.',
    /** Shown when there is no calculated recipe yet (structure_only). */
    needsCalculatedNote:
      'Monitor receptury dokładnie przeliczy recepturę, gdy karta będzie wyliczona przez silnik (uzupełnij wymagane dane).',
    przed: 'Przed',
    po: 'Po zmianie',
    apply: 'Zastosuj zmiany',
    undo: 'Cofnij',
    adjustmentsTitle: 'Proponowane zmiany ilości',
  },

  /* ---------------------------------------------------------------- Upgrade -- */
  upgrade: {
    caption: 'Odblokuj dokładne ilości',
    body: 'W podglądzie ukrywamy dokładne gramatury. Odblokuj je w wybranym planie.',
    chooseHome: 'Wybierz Home',
    seePro: 'Zobacz Pro',
  },

  /* -------------------------------------------------------- Technical details -- */
  tech: {
    summary: 'Dane techniczne',
    previewInternalRouting: 'Wewnętrzny profil produktu',
    userFacingType: 'Widoczny rodzaj',
    internalProfile: 'Profil wewnętrzny',
    engineCategory: 'Kategoria silnika',
    chocolateRouting: 'Czekolada (wewnętrzny profil)',
    chocolateRoutingNote:
      'Wykryto czekoladę — widoczny rodzaj pozostaje Gelato, a profil prowadzimy wewnętrznie.',
    batchSource: 'Źródło ilości',
    batchGrams: 'Ilość (g)',
    servingProfile: 'Profil podania',
    mode: 'Tryb',
    calcTemperature: 'Profil obliczeniowy',
    recipeStatus: 'Status receptury',
    sourceRecipe: 'Receptura źródłowa',
    advancedTitle: 'Zaawansowane (dev)',
    notesTitle: 'Uwagi przepływu',
    /** Readable Polish for the internal engine profile enums. */
    internalProfileLabels: {
      standard_gelato: 'Baza mleczna',
      chocolate_gelato: 'Czekolada (wewnętrzny profil)',
      sorbet: 'Sorbet',
      vegan_gelato: 'Wegańska',
    } as Record<string, string>,
    /** Readable Polish for the serving-profile enums (professional path only). */
    servingProfileLabels: {
      'display-minus-11': 'Miękkie (witryna)',
      'display-minus-12': 'Do gałek',
      'display-minus-13': 'Twardsze',
      'freezer-minus-18': 'Zamrażarka (−18°C)',
      'display-fresh': 'Witryna / świeże',
    } as Record<string, string>,
    /** Structured note codes → friendly Polish (never fabricated user text). */
    notes: {
      'customer_flow.protein_unsupported': 'Baza proteinowa nie jest jeszcze wspierana.',
      'customer_flow.chocolate_routed_internally': 'Czekolada prowadzona wewnętrznie (widoczne: Gelato).',
      'customer_flow.chocolate_sorbet_kept_as_sorbet': 'Czekolada przy sorbecie — pozostaje sorbetem.',
      'customer_flow.batch_recognized_from_text': 'Ilość rozpoznana z Twojego zdania.',
      'customer_flow.batch_from_ninja_mode': 'Ilość ustawiona z zatwierdzonej masy receptury dla trybu Ninja (nie przeliczamy ml na gramy).',
      'customer_flow.batch_volume_needs_density': 'Podano objętość — bez gęstości nie przeliczamy jej na gramy.',
      'customer_flow.batch_from_verified_device': 'Ilość ustawiona z zatwierdzonej masy receptury dla wybranego urządzenia (nie przeliczamy ml na gramy).',
      'customer_flow.device_capacity_confirmed': 'Pojemność urządzenia potwierdzona przez Ciebie.',
      'customer_flow.device_capacity_awaiting_confirmation': 'Pojemność urządzenia czeka na potwierdzenie.',
      'customer_flow.ready_recipe_working_draft_created': 'Utworzono edytowalny szkic roboczy.',
    } as Record<string, string>,
  },

  /* -------------------------------------------------------- Flavor Polish map -- */
  flavors: {
    vanilla: 'Wanilia',
    chocolate: 'Czekolada',
    cocoa: 'Kakao',
    gianduja: 'Gianduja',
    pistachio: 'Pistacja',
    raspberry: 'Malina',
    mango: 'Mango',
    lemon: 'Cytryna',
    orange: 'Pomarańcza',
    hazelnut: 'Orzech laskowy',
    strawberry: 'Truskawka',
    coffee: 'Kawa',
    basil: 'Bazylia',
    mint: 'Mięta',
    caramel: 'Karmel',
    coconut: 'Kokos',
    whisky: 'Whisky',
    whiskey: 'Whisky',
    rum: 'Rum',
    brandy: 'Brandy',
    liqueur: 'Likier',
    alcohol: 'Alkohol',
  } as Record<string, string>,

  /* ---------------------------------------------------- Ingredient name lists -- */
  ingredients: {
    milk: 'Mleko',
    cream: 'Śmietana 30%',
    plantMilk: 'Napój roślinny',
    coconutOil: 'Olej kokosowy',
    water: 'Woda',
    sugar: 'Cukier',
    dextrose: 'Dekstroza',
    stabilizer: 'PI Stabilizer',
    flavorSuffix: '(smak)',
  },

  /* ------------------------------------------------------------- Dev persona -- */
  persona: {
    label: 'Persona (dev)',
    demo: 'Demo',
    home: 'Home',
    pro: 'Pro',
  },
} as const;

export type CustomerShellCopy = typeof customerShellCopy;
