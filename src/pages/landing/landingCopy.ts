/**
 * PINGÜINO public landing — Polish copy (UIUX master spec §6, Slice A).
 *
 * The single source of every VISIBLE string on the `/` landing page. Honesty
 * rules carried from the product: no invented prices, no fabricated performance
 * numbers, no capabilities the product does not have. The Monitor example block
 * is the spec-mandated §6.2 sample (vanilla, 9/10) and is labelled as an example.
 *
 * Presentational data only — no logic, no IO.
 */

export const landingCopy = {
  brand: {
    name: 'PINGÜINO',
    sub: 'INTELLIGENCE',
  },

  nav: {
    cta: 'Stwórz recepturę',
  },

  /* ---------------------------------------------------------------- Hero -- */
  // Verbatim direction from spec §6.1.
  hero: {
    eyebrow: 'Inteligentne receptury lodów',
    headline: 'Idealna receptura. Dopasowana do Twojej maszyny lub temperatury.',
    subline: 'Wybierz smak, urządzenie lub temperaturę i ilość. PINGÜINO zajmie się resztą.',
    ctaPrimary: 'Stwórz recepturę',
    ctaSecondary: 'Zobacz, jak działa',
  },

  /* ------------------------------------------------- Monitor preview (§6.2) -- */
  /**
   * Static, honest preview of the Recipe Monitor — the spec's own example values
   * (vanilla, 9/10). The interactive demo is a LATER slice (F); this block is a
   * styled preview labelled as an example, never a fake app.
   */
  monitor: {
    label: 'Monitor receptury',
    exampleTag: 'Przykład · Wanilia',
    score: '9/10',
    verdict: 'Świetnie dopasowana',
    rows: [
      { name: 'Struktura', value: 'w optymalnym zakresie', golden: true },
      { name: 'Słodycz', value: 'zbalansowana', golden: false },
      { name: 'Kremowość', value: 'bardzo dobra', golden: false },
      { name: 'Dopasowanie do urządzenia', value: 'gotowe', golden: false },
    ],
    plansNote: 'Uproszczony Monitor znajdziesz w planie Home, pełny — w Pro.',
  },

  /* -------------------------------------------------------- Jak to działa -- */
  how: {
    label: 'Jak to działa',
    title: 'Trzy kroki do receptury',
    steps: [
      {
        title: 'Wybierz',
        body: 'Smak, urządzenie lub temperaturę podania i ilość — własnymi słowami, bez formularzy technicznych.',
      },
      {
        title: 'PINGÜINO dopasowuje',
        body: 'Deterministyczny silnik oblicza recepturę i sprawdza jej balans. Te same dane zawsze dają ten sam wynik — bez zgadywania.',
      },
      {
        title: 'Przygotuj',
        body: 'Dostajesz przejrzystą recepturę dopasowaną do sposobu przygotowania — w domu albo w pracowni.',
      },
    ],
  },

  /* ------------------------------------------------------------- Home / Pro -- */
  homeSection: {
    label: 'Home',
    title: 'W domu — bez tabel technologicznych',
    body: 'Mówisz, jakie lody chcesz przygotować, a system dobiera parametry za Ciebie.',
    bullets: [
      'Kilka prostych decyzji do receptury.',
      'Profile urządzeń domowych, np. Ninja CREAMi — właściwą ilość ustawiamy automatycznie.',
      'Zrozumiały podgląd receptury zamiast surowych parametrów.',
    ],
  },
  proSection: {
    label: 'Pro',
    title: 'W pracowni — temperatura pod kontrolą',
    body: 'Profesjonalista wybiera temperaturę serwowania, a nie model maszyny.',
    bullets: [
      'Temperatury serwowania: −11°C, −12°C, −13°C oraz produkcja świeża.',
      'Pełniejsze dane receptury i propozycje korekt.',
      'Zaawansowane Studio dla pracy nad recepturą.',
    ],
  },

  /* -------------------------------------------------- Bezpieczna przewaga -- */
  advantage: {
    label: 'Bezpieczna przewaga',
    title: 'Optymalizacja z blokadami składników',
    body: 'Zablokuj składnik, którego ilość ma pozostać dokładnie taka, jaką ustaliłeś — PINGÜINO dopasuje pozostałe składniki w bezpiecznym zakresie.',
    bullets: [
      'Blokada zachowuje dokładną gramaturę składnika — bez cichych zmian.',
      'Pozostałe składniki dopasowują się tak, aby receptura trzymała balans.',
      'Jeżeli przy Twoich blokadach nie da się osiągnąć optimum, mówimy o tym wprost i wskazujemy wyjście.',
    ],
  },

  /* -------------------------------------------------------------- Plany -- */
  plans: {
    label: 'Plany',
    title: 'Home czy Pro?',
    lead: 'Ta sama wiedza technologiczna — inna głębokość informacji.',
    home: {
      name: 'Home',
      tagline: 'Proste receptury w domu',
      bullets: [
        'Prosty przepływ: smak, urządzenie lub temperatura, ilość',
        'Profile urządzeń domowych (np. Ninja)',
        'Zrozumiały podgląd receptury',
      ],
    },
    pro: {
      name: 'Pro',
      tagline: 'Pełna kontrola w pracowni',
      bullets: [
        'Wybór temperatury serwowania',
        'Pełniejsze dane techniczne i korekty',
        'Zaawansowane Studio',
      ],
    },
    cta: 'Zobacz szczegóły planów',
    note: 'Szczegóły planów znajdziesz na stronie subskrypcji.',
  },

  /* ---------------------------------------------------------------- FAQ -- */
  faq: {
    label: 'FAQ',
    title: 'Częste pytania',
    items: [
      {
        q: 'Czy muszę znać się na technologii lodów?',
        a: 'Nie. Opisujesz, co chcesz przygotować, a system dobiera parametry za Ciebie. Szczegóły techniczne są dostępne dla ciekawych, ale nigdy wymagane.',
      },
      {
        q: 'Skąd PINGÜINO wie, ile czego dodać?',
        a: 'Receptury oblicza deterministyczny silnik — te same dane wejściowe zawsze dają ten sam wynik. Żadnych zgadywanych wartości.',
      },
      {
        q: 'Czy działa z urządzeniami domowymi, np. Ninja CREAMi?',
        a: 'Tak. Tryby Ninja mają przygotowane profile, a właściwą ilość ustawiamy automatycznie.',
      },
      {
        q: 'Czym różni się Home od Pro?',
        a: 'Home dostaje proste decyzje i zrozumiały podgląd receptury. Pro wybiera temperaturę serwowania i widzi pełniejsze dane techniczne. Silnik jest ten sam.',
      },
      {
        q: 'Czy zobaczę dokładne gramatury?',
        a: 'W bezpłatnym podglądzie pokazujemy strukturę receptury bez dokładnych gramatur. Pełne ilości są częścią planów Home i Pro.',
      },
      {
        q: 'Czy mogę zdecydować, że jakiś składnik ma zostać bez zmian?',
        a: 'Tak — zablokuj składnik, a PINGÜINO dopasuje pozostałe. Jeżeli przy Twoich blokadach nie da się osiągnąć optymalnego balansu, usłyszysz to wprost.',
      },
    ],
  },

  /* ----------------------------------------------------------- Final CTA -- */
  finalCta: {
    title: 'Zacznij od pierwszej receptury',
    body: 'Opisz swoje lody własnymi słowami — resztą zajmie się PINGÜINO.',
    cta: 'Stwórz recepturę',
  },

  /* -------------------------------------------------------------- Footer -- */
  footer: {
    tagline: 'Precyzyjne receptury lodów — od pomysłu do przygotowania.',
    links: [
      { label: 'Stwórz recepturę', to: '/start' },
      { label: 'Plany', to: '/subscription' },
      { label: 'Studio', to: '/studio' },
    ],
  },
} as const;

export type LandingCopy = typeof landingCopy;
