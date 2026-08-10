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
      note: 'Dodaje ciała bez dużego zwiększania słodyczy.',
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
  sugar: {
    title: 'Cukier nie tylko słodzi.',
    intro: 'Cukier wpływa także na to, ile wody zamarza.',
    lessTitle: 'Mniejszy efekt przeciw zamarzaniu',
    lessSteps: ['woda', 'więcej lodu', 'twardszy produkt'],
    moreTitle: 'Większy efekt przeciw zamarzaniu',
    moreSteps: ['woda', 'mniej lodu', 'bardziej miękki produkt'],
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
      'POD opisuje względną słodycz, a PAC względny wpływ na zamarzanie. PINGÜINO używa danych składników w Engine, ale nie pokazuje tutaj chronionych zakresów ani reguł solvera.',
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
              'więcej wody',
              'potencjalnie więcej lodu',
              'zmienia strukturę',
              'PINGÜINO koryguje pozostałe składniki',
            ],
          },
          {
            id: 'sugars',
            label: '🍬 Naturalne cukry ↑',
            steps: ['zmieniają słodycz', 'zmieniają zamarzanie'],
          },
          {
            id: 'fiber',
            label: '🌿 Błonnik ↑',
            steps: ['wiąże część wody', 'wpływa na odczucie pełni'],
          },
        ],
      },
      milk: {
        name: '🥛 Mleko',
        effects: [
          {
            id: 'water',
            label: '💧 Woda ↑',
            steps: ['buduje płynną bazę', 'część wody później zamarza'],
          },
          {
            id: 'lactose',
            label: '🍬 Laktoza ↑',
            steps: ['dodaje mało słodyczy', 'wpływa na zamarzanie'],
          },
          {
            id: 'protein',
            label: '◌ Białko ↑',
            steps: ['wspiera strukturę', 'wpływa na odczucie w ustach'],
          },
          {
            id: 'fat',
            label: '● Tłuszcz ↑',
            steps: ['zależy od rodzaju mleka', 'wspiera kremowe odczucie'],
          },
        ],
      },
      pistachio: {
        name: '◒ Pistacja',
        effects: [
          {
            id: 'fat',
            label: '● Tłuszcz ↑',
            steps: ['wnosi tłuszcz roślinny', 'zmienia kremowe odczucie'],
          },
          {
            id: 'protein',
            label: '◌ Białko ↑',
            steps: ['dodaje części stałych', 'wspiera strukturę'],
          },
          {
            id: 'solids',
            label: '◇ Ciała stałe ↑',
            steps: ['mniej miejsca zajmuje woda', 'mieszanka zyskuje pełnię'],
          },
          { id: 'fiber', label: '🌿 Błonnik ↑', steps: ['wiąże część wody', 'wpływa na teksturę'] },
        ],
      },
    },
  },
  micro: {
    title: 'Mało składnika, duży efekt',
    select: 'Wybierz jeden składnik.',
    items: {
      inulin: {
        name: 'Inulina',
        lead: 'Dodaje ciała bez dużego zwiększania słodyczy.',
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
    futureFormulaNote: 'Skład przyszłej mieszanki PINGÜINO nie jest jeszcze zatwierdzony.',
  },
  process: {
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
        title: 'Nie można bezpiecznie potwierdzić procesu na zimno',
        note: 'Dla co najmniej jednego składnika brakuje wystarczających danych procesu.',
      },
    },
    dataMissing: 'NIEWYSTARCZAJĄCE DANE',
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
    unknownSelection: 'Wybierz maszynę w Profilu, aby zobaczyć jej właściwy proces.',
    categories: {
      frozen_container: {
        title: 'Procesor z mrożonym pojemnikiem',
        steps: ['przygotuj mix', 'zamroź cały pojemnik', 'urządzenie obrabia zamrożoną bazę'],
      },
      frozen_bowl: {
        title: 'Maszyna z mrożoną misą',
        steps: ['zamroź misę', 'wlej mieszankę', 'uruchom'],
      },
      compressor: {
        title: 'Maszyna z kompresorem',
        steps: ['przygotuj mix', 'wlej', 'maszyna sama chłodzi i mrozi'],
      },
      fresh_gelato: {
        title: 'Fresh Gelato',
        steps: [
          'przygotuj właściwą mieszankę',
          'wykonaj proces, jeśli jest wymagany',
          'maszyna mrozi i miesza',
          'utrzymuje gotowy produkt',
          'serwujesz bezpośrednio',
        ],
      },
    },
    timingVerified: (hours: number) => `Wymagane wstępne mrożenie: minimum ${hours} h`,
    timingMissing: 'Czas przygotowania nie jest zweryfikowany dla tego modelu.',
    comparisonTitle: 'Trzy proste drogi',
    comparisonLabels: ['PROFESSIONAL CLASSIC', 'FRESH GELATO', 'HOME MACHINE'],
    classic: [
      'przygotuj mix',
      'proces, jeśli wymagany',
      'frezer',
      'pojemnik',
      'przechowuj',
      'serwuj',
    ],
    fresh: [
      'przygotuj właściwy mix',
      'proces, jeśli wymagany',
      'maszyna',
      'mroź / mieszaj / utrzymuj',
      'serwuj',
    ],
    home: ['proces zależy od typu maszyny'],
    timingQuestion: 'Kiedy chcesz jeść lody?',
    timingChoices: ['Teraz / dziś', 'Za kilka godzin', 'Jutro'],
    timingPending: 'DO PODŁĄCZENIA',
    timingPendingNote: 'Rekomendacja poczeka na zweryfikowane czasy konkretnej maszyny.',
  },
} as const;

export type EducationCopy = typeof educationCopy;
