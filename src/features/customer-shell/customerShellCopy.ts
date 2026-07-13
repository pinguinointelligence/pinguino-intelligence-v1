/**
 * PINGÜINO Customer Shell — Polish copy (CustomerShellV1).
 *
 * The single source of every VISIBLE string for the `/customer-v1` surface.
 * The pure customer-flow core (Agent B) speaks in copy KEYS such as
 * `customer_flow.product_type.gelato`; those keys are mapped to Polish text here
 * so the presentation layer never hardcodes user-facing prose inline.
 *
 * Presentational data only — no logic, no IO, no engine access. Plain const.
 */

export const customerShellCopy = {
  /* ---------------------------------------------------------------- Home -- */
  home: {
    headline: 'Co dzisiaj robimy?',
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
    addLabel: 'Dodaj smak',
    addPlaceholder: 'np. bazylia',
    addButton: 'Dodaj',
    empty: 'Nie wykryliśmy jeszcze żadnego smaku — możesz dodać go poniżej.',
  },

  /* ------------------------------------------------------------- Product type -- */
  productType: {
    label: 'Rodzaj',
    title: 'Jaki to rodzaj?',
    lead: 'Wybierz bazę. Czekolada nie jest osobnym wyborem — prowadzimy ją wewnętrznie.',
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
    capacityVerified: 'Zweryfikowana pojemność',
    capacityNominal: 'Pojemność nominalna',
    capacityUserDefined: 'Ilość ustalasz samodzielnie',
    unitGrams: 'g',
    unitMl: 'ml',
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

  /* --------------------------------------------------- Device capacity confirm -- */
  capacity: {
    label: 'Pojemność',
    title: 'Ile mieści to urządzenie?',
    lead: 'Podano tylko objętość w ml, a jej nie zamieniamy po cichu na gramy. Podaj wagę wsadu w gramach — zapytamy tylko raz.',
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
    change: 'Zmień ilość',
    source: {
      user: 'wybrana przez Ciebie',
      text: 'rozpoznana z Twojego zdania',
      device_verified: 'z pojemności urządzenia',
      device_confirmed: 'potwierdzona pojemność urządzenia',
      device_unverified: 'oczekuje na potwierdzenie',
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
    matchLabels: {
      closest_idea: 'Najbliższy pomysł',
      similar_flavor_profile: 'Podobny profil smakowy',
      matches_device: 'Pasuje do urządzenia',
      vegan_version: 'Wersja wegańska',
      similar_base: 'Podobna baza',
    },
    photoMissingAlt: 'Brak zdjęcia receptury',
  },

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
    batchLabel: 'Ilość',
    ingredientsTitle: 'Składniki',
    deviceNone: 'nie wybrano',
    servingNone: 'nie wybrano',
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
    chocolateRouting: 'Wewnętrzny profil: chocolate_gelato',
    chocolateRoutingNote:
      'Wykryto czekoladę — widoczny rodzaj pozostaje Gelato, a profil prowadzimy wewnętrznie.',
    batchSource: 'Źródło ilości',
    batchGrams: 'Ilość (g)',
    servingProfile: 'Profil podania',
    sourceRecipe: 'Receptura źródłowa',
    notesTitle: 'Uwagi przepływu',
    /** Structured note codes → friendly Polish (never fabricated user text). */
    notes: {
      'customer_flow.protein_unsupported': 'Baza proteinowa nie jest jeszcze wspierana.',
      'customer_flow.chocolate_routed_internally': 'Czekolada prowadzona wewnętrznie (widoczne: Gelato).',
      'customer_flow.chocolate_sorbet_kept_as_sorbet': 'Czekolada przy sorbecie — pozostaje sorbetem.',
      'customer_flow.batch_recognized_from_text': 'Ilość rozpoznana z Twojego zdania.',
      'customer_flow.batch_volume_needs_density': 'Podano objętość — bez gęstości nie przeliczamy jej na gramy.',
      'customer_flow.batch_from_verified_device': 'Ilość ustawiona z zweryfikowanej pojemności urządzenia.',
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
