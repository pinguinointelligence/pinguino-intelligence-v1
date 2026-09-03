/**
 * WORK WITH US — the four secondary lanes.
 *
 * Partner has its own copy in `cooperation.ts` and stays the dominant lane.
 * These four are the cards on the gateway and the pages behind them.
 *
 * WHAT THIS FILE MAY NOT SAY (owner rules, and they are not stylistic):
 *  * The supplier name is INTERNAL. It appears nowhere here, and nothing claims
 *    Gellatti manufactures equipment.
 *  * No machine model is named next to a photograph unless the photograph is
 *    proven to show that model. None currently is.
 *  * No invented franchise fee, ROI, territory, payback or CAPEX. Franchise is
 *    enquiry-led until the owner supplies commercial authority.
 *  * The trailer line is the owner's EXACT approved sentence. "FOB Germany" is
 *    banned; the safe wording names the location and defers the rest to a quote.
 *  * No specification is stated that a document does not support.
 */

export interface LaneCopy {
  readonly kicker: string;
  readonly title: string;
  /** One line on the gateway card: what this is. */
  readonly card: string;
  /** Who it is for — the second question a card must answer. */
  readonly forWhom: string;
  readonly cta: string;
  readonly href: string;
}

export interface LanePageCopy extends LaneCopy {
  readonly headline: string;
  readonly intro: string;
  readonly points: readonly { readonly title: string; readonly body: string }[];
  /** The honest closing note — what happens after the enquiry. */
  readonly next: string;
}

/** The gateway's four cards, in the owner's priority order after Partner. */
export const LANES = {
  machines: {
    kicker: 'Sprzęt profesjonalny',
    title: 'Maszyny i wyposażenie',
    card: 'Sprzęt do produkcji i ekspozycji gelato, dobierany przez Gellatti pod Twój lokal.',
    forWhom: 'Kawiarnie, lodziarnie, restauracje i hotele.',
    cta: 'Zapytaj o sprzęt',
    href: '/machines',
  },
  mobile: {
    kicker: 'Sprzedaż mobilna',
    title: 'Wózki mobilne',
    card: 'Mobilne punkty sprzedaży na eventy, catering i sezon.',
    forWhom: 'Firmy eventowe, catering, obiekty sezonowe.',
    cta: 'Zapytaj o wózek',
    href: '/mobile',
  },
  trailer: {
    kicker: 'Własny punkt',
    title: 'Przyczepa Gellatti',
    card: 'Kompletny mobilny punkt Gellatti — własny format sprzedaży, nie wózek.',
    forWhom: 'Osoby, które chcą prowadzić własny punkt Gellatti.',
    cta: 'Zapytaj o przyczepę',
    href: '/trailer',
  },
  franchise: {
    kicker: 'Lokal stacjonarny',
    title: 'Franczyza',
    card: 'Własna lodziarnia Gellatti — pełny lokal, nie wózek ani przyczepa.',
    forWhom: 'Osoby otwierające lodziarnię stacjonarną.',
    cta: 'Porozmawiajmy',
    href: '/franchise',
  },
} as const satisfies Record<string, LaneCopy>;

/**
 * Franchise is the only lane whose page was never given its own copy, so it
 * ran on the hero blurb alone. Everything here is sourced: the production
 * model, the four concepts (`franchiseConcepts.ts`), and what the app actually
 * does. Nothing states a fee, a package, a territory or a split of
 * responsibilities — that is commercial authority this file does not have, and
 * the rule at the top of this file forbids inventing it.
 */
export const FRANCHISE_PAGE: LanePageCopy = {
  ...LANES.franchise,
  headline: 'Lodziarnia, w której lody powstają na miejscu',
  intro:
    'Gellatti nie jest mrożonym produktem z centralnej fabryki. Gelato powstaje w lokalu, w małych partiach, według receptur prowadzonych w aplikacji. Format dobieramy do miejsca — pełny lokal, przyczepa, wózek albo punkt.',
  points: [
    {
      title: 'Świeże, robione u Ciebie',
      body: 'Produkcja idzie na miejscu i w małych partiach — tyle, ile schodzi. Gość dostaje lody zrobione w tym lokalu, a nie przywiezione.',
    },
    {
      title: 'Aplikacja prowadzi produkcję',
      body: 'Receptury, profil maszyny, przeliczanie partii, etykiety i historia produkcji są w Gellatti. Powtarzalność nie zależy od pamięci jednej osoby.',
    },
    {
      title: 'Format pod miejsce, nie odwrotnie',
      body: 'Zaczynamy od tego, czym dysponujesz i gdzie sprzedajesz. Dopiero z tego wychodzi, który z czterech formatów ma sens.',
    },
    {
      title: 'Warunki ustalamy w rozmowie',
      body: 'Zakres współpracy i koszty zależą od miejsca i skali. Mówimy o nich przy konkretnym projekcie, a nie jako obietnicę na stronie.',
    },
  ],
  next: 'Napisz, jaki format i jakie miejsce masz na myśli. Odzywamy się, wspólnie sprawdzamy, czy to się spina, i dopiero wtedy rozmawiamy o warunkach.',
};

export const MACHINES_PAGE: LanePageCopy = {
  ...LANES.machines,
  headline: 'Sprzęt, który dobieramy do Twojego lokalu',
  intro:
    'Nie sprzedajemy katalogu. Pytamy, gdzie sprzedajesz, ile smaków chcesz mieć i ile masz miejsca — i na tej podstawie proponujemy konkretne rozwiązanie wraz z wyceną.',
  points: [
    {
      title: 'Dobór pod miejsce',
      body: 'Lada, blat, zaplecze albo punkt mobilny. Rozwiązanie zależy od tego, czym dysponujesz, a nie od tego, co akurat mamy.',
    },
    {
      title: 'Produkcja i ekspozycja',
      body: 'Sprzęt do przygotowania gelato i do jego pokazania gościom. Oba elementy dobieramy razem, bo razem pracują.',
    },
    {
      title: 'Wycena zamiast cennika',
      body: 'Transport, podatki i montaż zależą od kraju i lokalu. Podajemy je w wycenie, a nie jako obietnicę na stronie.',
    },
  ],
  next: 'Napisz, co chcesz uruchomić. Wracamy z propozycją sprzętu i wyceną — bez zamówienia online.',
};

export const MOBILE_PAGE: LanePageCopy = {
  ...LANES.mobile,
  headline: 'Gellatti tam, gdzie są Twoi goście',
  intro:
    'Mobilny punkt sprzedaży, który dojeżdża na miejsce: wesela, eventy firmowe, festiwale, sezon w kurorcie. Wózek dobieramy do skali i sposobu obsługi.',
  points: [
    {
      title: 'Eventy i wesela',
      body: 'Punkt, który wygląda dobrze na zdjęciach i obsługuje kolejkę bez zaplecza.',
    },
    {
      title: 'Sezon i catering',
      body: 'Powtarzalna obsługa przez cały sezon, w jednym lub kilku miejscach.',
    },
    {
      title: 'Konfiguracja pod obsługę',
      body: 'Liczba smaków, zasilanie i sposób wydawania zależą od tego, jak pracujesz. Ustalamy to przed wyceną.',
    },
  ],
  next: 'Powiedz, gdzie i jak często chcesz sprzedawać. Dobierzemy wózek i przygotujemy wycenę.',
};

export const TRAILER_PAGE: LanePageCopy = {
  ...LANES.trailer,
  headline: 'Twój własny mobilny punkt Gellatti',
  intro:
    'Przyczepa to osobny format — kompletny punkt sprzedaży, który przewozisz i rozstawiasz tam, gdzie jest ruch. To nie jest większy wózek.',
  points: [
    {
      title: 'Kompletny punkt',
      body: 'Ekspozycja, zaplecze i miejsce pracy w jednym. Rozstawiasz i sprzedajesz.',
    },
    {
      title: 'Konfiguracja pod projekt',
      body: 'Maszynę, wyposażenie i branding dobieramy do tego, co chcesz sprzedawać i gdzie.',
    },
    {
      title: 'Mobilność',
      body: 'Punkt jedzie tam, gdzie akurat są ludzie — sezon, festiwal, wydarzenie.',
    },
  ],
  // The owner's EXACT approved sentence. "FOB Germany" is banned; this wording
  // names the location and leaves everything variable to the quote.
  next: 'Przyczepa bazowa od €10,000. Lokalizacja: Niemcy. Maszyna, wyposażenie, branding, transport i podatki dobieramy do projektu.',
};
