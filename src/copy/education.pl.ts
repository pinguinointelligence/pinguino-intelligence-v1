export const educationCopy = {
  backToRecipe: '← Wróć do receptury',
  backToHub: '← Wiedza o recepturze',
  heading: 'CO WARTO WIEDZIEĆ O TEJ RECEPTURZE?',
  contextLabel: 'Najpierw to, co dotyczy Twojej receptury',
  entriesLabel: 'Wybierz jeden temat',
  entries: {
    ingredients: {
      title: 'Co robią składniki?',
      note: 'Zobacz, co każdy składnik wnosi do mieszanki.',
    },
    behavior: {
      title: 'Dlaczego lody zachowują się tak?',
      note: 'Zrozum wodę, cukry i miękkość bez trudnych wzorów.',
    },
    process: {
      title: 'Jak je przygotować?',
      note: 'Sprawdź proces mieszanki i sposób działania maszyny.',
    },
  },
  prompts: {
    fruit: {
      title: 'Dlaczego owoce zmieniają ilość wody?',
      note: 'Owoc wnosi jednocześnie wodę, naturalne cukry i błonnik.',
    },
    sugar: {
      title: 'Dlaczego cukry zmieniają miękkość?',
      note: 'Różne cukry inaczej wpływają na zamarzanie wody.',
    },
    stabilizer: {
      title: 'Po co jest stabilizator?',
      note: 'Mała ilość pomaga kontrolować wodę i kryształki lodu.',
    },
    inulin: {
      title: 'Po co jest inulina?',
      note: 'Dodaje ciała bez dużego zwiększania słodyczy',
    },
    micro: {
      title: 'Po co są inulina i stabilizator?',
      note: 'Oba występują w małej ilości, ale pełnią różne zadania.',
    },
    dairy: {
      title: 'Co mleko zmienia w recepturze?',
      note: 'Wnosi wodę, laktozę, białko i — zależnie od produktu — tłuszcz.',
    },
    temperature: {
      title: 'Dlaczego temperatura ma znaczenie?',
      note: 'Ta sama mieszanka zmienia twardość wraz z temperaturą serwowania.',
    },
    process: {
      title: 'Czy tę mieszankę trzeba podgrzać?',
      note: 'Decyzja zależy od składników i potwierdzonego procesu, nie od samej maszyny.',
    },
  },
  lesson: {
    next: 'Dalej →',
    previous: '← Wstecz',
    technical: 'Wersja techniczna',
    learnMore: 'Dowiedz się więcej',
  },
  knowledgeTour: {
    eyebrow: 'DLACZEGO TO DZIAŁA?',
    imageAltPrefix: 'Ilustracja edukacyjna:',
    navigation: {
      label: 'Nawigacja przewodnika',
      back: 'Wstecz',
      next: 'Dalej',
      restart: 'Od początku',
      progress: 'Postęp przewodnika',
      goToStep: 'Przejdź do kroku',
      step: 'Krok',
      of: 'z',
    },
    steps: {
      worlds: {
        title: 'Jakie lody robisz?',
        body: 'Każdy rodzaj lodów potrzebuje innego balansu składników.',
        voice: 'Najpierw wybierasz rodzaj lodów, potem dopasowujesz resztę.',
        annotations: [
          { id: 'gelato', title: 'Gelato', detail: 'Lody mleczne i kremowe' },
          { id: 'sorbet', title: 'Sorbet', detail: 'Owocowy, bez mleka' },
          { id: 'vegan', title: 'Vegan', detail: 'Kremowe, bez składników odzwierzęcych' },
          { id: 'protein', title: 'Protein', detail: 'Więcej białka i inna struktura' },
        ],
      },
      freezing: {
        title: 'Dlaczego lody nie są kostką lodu?',
        body: 'Za dużo zamarzniętej wody daje zbyt twarde lody. Za mało — zbyt miękkie. Szukamy właściwego balansu.',
        voice: 'Dobra konsystencja wynika z balansu całej receptury.',
        annotations: [
          { id: 'hard', title: 'Więcej lodu', detail: 'Zbyt twardo' },
          { id: 'balanced', title: 'Właściwy balans', detail: 'Gładko i stabilnie' },
          { id: 'soft', title: 'Mniej lodu', detail: 'Zbyt miękko' },
        ],
      },
      sugars: {
        title: 'Cukier robi dwie rzeczy',
        body: 'Nadaje słodycz i pomaga decydować, jak miękkie będą lody po zamrożeniu. Różne cukry nie działają tak samo.',
        voice: 'Podobna słodycz nie zawsze oznacza tę samą miękkość.',
        annotations: [
          { id: 'sucrose', title: 'Sacharoza', detail: 'Słodycz: średnia · miękkość: średnia' },
          { id: 'dextrose', title: 'Dekstroza', detail: 'Słodycz: niższa · miękkość: wysoka' },
          { id: 'fructose', title: 'Fruktoza', detail: 'Słodycz: wysoka · miękkość: wysoka' },
        ],
      },
      creaminess: {
        title: 'Skąd bierze się kremowość?',
        body: 'Kremowość tworzy zespół składników. Każdy wnosi do mieszanki coś innego.',
        voice: 'Pełna tekstura nie musi oznaczać większej słodyczy.',
        annotations: [
          { id: 'milk', title: 'Mleko', detail: 'Buduje płynną część bazy' },
          { id: 'cream', title: 'Śmietanka', detail: 'Daje gładsze, pełniejsze odczucie' },
          { id: 'milk-powder', title: 'Mleko w proszku', detail: 'Buduje pełniejszą strukturę' },
          { id: 'inulin', title: 'Inulina', detail: 'Dodaje ciała bez większej słodyczy' },
        ],
      },
      flavour: {
        title: 'Smak też zmienia strukturę',
        body: 'Smak to nie tylko aromat. Gellatti widzi, co wnosi składnik, i przelicza resztę mieszanki.',
        voice: 'Ten sam poziom smaku może wymagać zupełnie innego balansu.',
        annotations: [
          { id: 'strawberry', title: 'Truskawka', detail: 'Wnosi dużo wody' },
          { id: 'banana', title: 'Banan', detail: 'Daje naturalną gęstość' },
          { id: 'pistachio', title: 'Pistacja', detail: 'Wnosi tłuszcz i suchą masę' },
          { id: 'chocolate', title: 'Czekolada', detail: 'Szybko zmienia gęstość mieszanki' },
        ],
      },
      stabilizer: {
        title: 'Mały ochroniarz tekstury',
        body: 'Stabilizator wspiera kontrolę wody i ogranicza wzrost dużych kryształków lodu.',
        voice: 'Czasem naprawdę mała ilość robi dużą różnicę.',
        annotations: [
          {
            id: 'without',
            title: 'Bez stabilizatora',
            detail: 'Większe kryształki, bardziej szorstka tekstura',
          },
          { id: 'with', title: 'Ze stabilizatorem', detail: 'Drobniejsza, gładsza struktura' },
        ],
      },
      temperature: {
        title: 'Temperatura zmienia wszystko',
        body: 'Ta sama receptura zachowuje się inaczej w różnych warunkach podania. Gellatti liczy dla realnej temperatury.',
        voice: 'Miękkość przy −11°C nie będzie taka sama jak przy −13°C.',
        annotations: [
          { id: 'minus-11', title: '−11°C', detail: 'Bardziej miękko' },
          { id: 'minus-12', title: '−12°C', detail: 'Pośrodku' },
          { id: 'minus-13', title: '−13°C', detail: 'Bardziej twardo' },
        ],
      },
      homeEnding: {
        title: 'Różne maszyny, różne drogi do lodów',
        body: 'Domowe urządzenia różni moment zamrażania i sposób obróbki mieszanki.',
        voice: 'Ten sam cel może wymagać innego procesu przygotowania.',
        annotations: [
          {
            id: 'frozen-container',
            title: 'Zamrożony pojemnik',
            detail: 'Najpierw zamrażasz bazę, potem maszyna ją rozdrabnia i wygładza.',
          },
          {
            id: 'frozen-soft',
            title: 'Zamrożona baza do softu',
            detail: 'Zamrożoną bazę obrabiasz i podajesz w miękkiej formie.',
          },
          {
            id: 'compressor',
            title: 'Płynna mieszanka',
            detail: 'Maszyna sama ją chłodzi, mrozi i miesza.',
          },
          {
            id: 'frozen-bowl',
            title: 'Wstępnie zamrożona misa',
            detail: 'Zimna misa odbiera ciepło podczas mieszania.',
          },
        ],
      },
      proEnding: {
        title: 'Profesjonalna produkcja',
        body: 'Efekt zależy zarówno od procesu, jak i od warunków serwowania lub ekspozycji.',
        voice: 'Gellatti liczy dla realnej produkcji i warunków podania.',
        annotations: [
          { id: 'machine', title: 'Maszyna', detail: 'Proces mrożenia i napowietrzania' },
          { id: 'product', title: 'Gotowy produkt', detail: 'Struktura, którą chcesz uzyskać' },
          {
            id: 'serving',
            title: 'Warunki podania',
            detail: 'Temperatura serwowania lub ekspozycji',
          },
        ],
      },
    },
  },
  sugar: {
    title: 'Cukier nie tylko słodzi',
    intro: 'Cukier wpływa także na to, ile wody zamarza.',
    lessTitle: 'Mniejszy efekt przeciw zamarzaniu',
    lessSteps: ['Woda', 'Więcej lodu', 'Twardszy produkt'],
    moreTitle: 'Większy efekt przeciw zamarzaniu',
    moreSteps: ['Woda', 'Mniej lodu', 'Bardziej miękki produkt'],
    comparisonTitle: 'Różne cukry, różne zadania',
    comparisonLead:
      'Porównanie jest względne — pokazuje kierunek, nie recepturę ani ukryte zakresy.',
    rows: [
      { id: 'sucrose', name: 'Zwykły cukier (sacharoza)', sweetness: 2, softening: 2 },
      { id: 'dextrose', name: 'Dekstroza', sweetness: 1, softening: 3 },
      { id: 'fructose', name: 'Fruktoza', sweetness: 3, softening: 3 },
      { id: 'lactose', name: 'Laktoza', sweetness: 1, softening: 1 },
    ],
    scaleSweetness: 'Słodycz',
    scaleSoftening: 'Wpływ na miękkość',
    conclusion: 'Dlatego 100 g dekstrozy nie działa tak samo jak 100 g zwykłego cukru.',
    technicalCopy:
      'POD opisuje względną słodycz, a PAC wpływ na zamarzanie. Gellatti używa potwierdzonych danych składników, ale nie pokazuje chronionych zakresów ani reguł obliczeń.',
  },
  ingredient: {
    title: 'CO WNOSI TEN SKŁADNIK?',
    select: 'Dotknij składnika, a potem jednego efektu.',
    examples: {
      mango: {
        name: '🥭 Mango',
        effects: [
          {
            id: 'water',
            label: '💧 Woda ↑',
            steps: [
              'Więcej wody',
              'Potencjalnie więcej lodu',
              'Zmienia strukturę',
              'Gellatti pomaga skorygować pozostałe składniki',
            ],
          },
          {
            id: 'sugars',
            label: '🍬 Naturalne cukry ↑',
            steps: ['Zmieniają słodycz', 'Zmieniają zamarzanie'],
          },
          {
            id: 'fiber',
            label: '🌿 Błonnik ↑',
            steps: ['Wiąże część wody', 'Wpływa na odczucie pełni'],
          },
        ],
      },
      milk: {
        name: '🥛 Mleko',
        effects: [
          {
            id: 'water',
            label: '💧 Woda ↑',
            steps: ['Buduje płynną bazę', 'Część wody później zamarza'],
          },
          {
            id: 'lactose',
            label: '🍬 Laktoza ↑',
            steps: ['Dodaje mało słodyczy', 'Wpływa na zamarzanie'],
          },
          {
            id: 'protein',
            label: '◌ Białko ↑',
            steps: ['Wspiera strukturę', 'Wpływa na odczucie w ustach'],
          },
          {
            id: 'fat',
            label: '● Tłuszcz ↑',
            steps: ['Zależy od rodzaju mleka', 'Wspiera kremowe odczucie'],
          },
        ],
      },
      pistachio: {
        name: '◒ Pistacja',
        effects: [
          {
            id: 'fat',
            label: '● Tłuszcz ↑',
            steps: ['Wnosi tłuszcz roślinny', 'Zmienia kremowe odczucie'],
          },
          {
            id: 'protein',
            label: '◌ Białko ↑',
            steps: ['Dodaje części stałych', 'Wspiera strukturę'],
          },
          {
            id: 'solids',
            label: '◇ Ciała stałe ↑',
            steps: ['Mniej miejsca zajmuje woda', 'Mieszanka zyskuje pełnię'],
          },
          { id: 'fiber', label: '🌿 Błonnik ↑', steps: ['Wiąże część wody', 'Wpływa na teksturę'] },
        ],
      },
    },
  },
  micro: {
    title: 'Mało składnika, duży efekt',
    select: 'Wybierz jeden składnik',
    items: {
      inulin: {
        name: 'Inulina',
        lead: 'Dodaje ciała bez dużego zwiększania słodyczy',
        detail:
          'To błonnik, który wiąże część wody i wpływa na pełnię oraz odczucie w ustach. Efekt zależy od całej receptury.',
      },
      stabilizer: {
        name: 'Stabilizator',
        lead: 'Pomaga kontrolować wodę i kryształki lodu.',
        detail:
          'Może wspierać stabilną strukturę i ograniczać niekontrolowany wzrost kryształków. Dokładne działanie zależy od składnika lub mieszanki oraz procesu.',
      },
      salt: {
        name: 'Sól',
        lead: 'Podkreśla smak.',
        detail:
          'Niewielka ilość może zmienić odbiór smaku. To nie jest składnik do swobodnego zwiększania.',
      },
    },
    eNumberTitle: 'Co oznacza numer E?',
    eNumberLead:
      'Numer E jest identyfikatorem dodatku — sam numer nie oznacza, że składnik jest syntetyczny.',
    plantOrigin: 'Stabilizator pochodzenia roślinnego',
    futureFormula: 'FORMUŁA W PRZYGOTOWANIU',
    futureFormulaNote: 'Skład przyszłej mieszanki Gellatti nie jest jeszcze zatwierdzony.',
  },
  process: {
    entryAction: 'Zobacz sposób przygotowania',
    entryLoading: 'Sprawdzam potwierdzone dane procesu…',
    question: 'Czy tę mieszankę trzeba podgrzać?',
    statuses: {
      cold_process_ok: {
        title: 'Można przygotować na zimno',
        note: 'Zatwierdzone dane potwierdzają proces na zimno dla wszystkich składników tej receptury.',
      },
      heat_required_for_function: {
        title: 'Podgrzanie wymagane technologicznie',
        note: 'Co najmniej jeden składnik wymaga ciepła do prawidłowego działania.',
      },
      heat_required_for_safety: {
        title: 'Podgrzanie wymagane dla bezpieczeństwa',
        note: 'Zatwierdzony proces wymaga obróbki cieplnej ze względów bezpieczeństwa.',
      },
      heat_required_for_both: {
        title: 'Podgrzanie wymagane technologicznie i dla bezpieczeństwa',
        note: 'Ciepło jest wymagane zarówno dla działania składnika, jak i dla bezpieczeństwa procesu.',
      },
      unknown: {
        title: 'Brak informacji o obróbce',
        note: 'Dla co najmniej jednego składnika nie mamy informacji o obróbce. Sposób użycia produktu określa jego karta techniczna lub instrukcja producenta.',
      },
    },
    dataMissing: 'BRAK INFORMACJI',
    reasonLabels: {
      ingredient_function: 'Działanie składnika',
      food_safety: 'Bezpieczeństwo procesu',
      hydration: 'Hydratacja',
      raw_ingredient: 'Surowy składnik',
      process_requirement: 'Wymaganie procesu',
      missing_data: 'Brak danych',
    },
    coldSteps: ['Wymieszaj', 'Wlej', 'Uruchom maszynę', 'Serwuj zgodnie z typem urządzenia'],
    heatSteps: [
      'Przygotuj składniki',
      'Podgrzej zgodnie z procesem receptury',
      'Schłodź',
      'Przejdź do mrożenia',
    ],
    exactParametersMissing: 'Dokładny czas i temperatura nie są podane bez zatwierdzonego źródła.',
    confirmations: {
      cold: 'Potwierdzam proces na zimno',
      heat: 'Potwierdzam proces z podgrzaniem',
      unknown: 'Rozumiem — proces wymaga weryfikacji',
      accepted: 'Ścieżka procesu potwierdzona',
      required: 'Najpierw potwierdź decyzję procesu.',
    },
  },
  machine: {
    title: 'Jak działa Twoja maszyna?',
    unknownSelection: 'Wybierz maszynę w Profilu, aby zobaczyć jej właściwy proces',
    categories: {
      frozen_container: {
        title: 'Procesor z mrożonym pojemnikiem',
        steps: ['Przygotuj mix', 'Zamroź cały pojemnik', 'Urządzenie obrabia zamrożoną bazę'],
      },
      frozen_bowl: {
        title: 'Maszyna z mrożoną misą',
        steps: ['Zamroź misę', 'Wlej mieszankę', 'Uruchom'],
      },
      compressor: {
        title: 'Maszyna z kompresorem',
        steps: ['Przygotuj mix', 'Wlej', 'Maszyna sama chłodzi i mrozi'],
      },
      fresh_gelato: {
        title: 'Fresh Gelato',
        steps: [
          'Przygotuj właściwą mieszankę',
          'Wykonaj proces, jeśli jest wymagany',
          'Maszyna mrozi i miesza',
          'Utrzymuje gotowy produkt',
          'Serwujesz bezpośrednio',
        ],
      },
    },
    timingVerified: (hours: number) => `Wymagane wstępne mrożenie: minimum ${hours} h`,
    timingMissing: 'Czas przygotowania nie jest zweryfikowany dla tego modelu.',
    comparisonTitle: 'Trzy proste drogi',
    comparisonLabels: ['PROFESSIONAL CLASSIC', 'FRESH GELATO', 'Maszyna domowa'],
    classic: [
      'Przygotuj mix',
      'Proces, jeśli wymagany',
      'Frezer',
      'Pojemnik',
      'Przechowuj',
      'Serwuj',
    ],
    fresh: [
      'Przygotuj właściwy mix',
      'Proces, jeśli wymagany',
      'Maszyna',
      'Mroź / mieszaj / utrzymuj',
      'Serwuj',
    ],
    home: ['Proces zależy od typu maszyny'],
    timingQuestion: 'Kiedy chcesz jeść lody?',
    timingChoices: ['Teraz / dziś', 'Za kilka godzin', 'Jutro'],
    timingPending: 'W przygotowaniu',
    timingPendingNote: 'Rekomendacja poczeka na zweryfikowane czasy konkretnej maszyny.',
  },
} as const;

export type EducationCopy = typeof educationCopy;
