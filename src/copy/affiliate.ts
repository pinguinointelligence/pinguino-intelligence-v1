/**
 * GELLATTI AFFILIATE — public page + affiliate panel copy.
 *
 * Follows the `CommunityCopy` reference pattern (`src/copy/locale.ts` rule 3):
 * one interface is the contract, one complete object per locale implements it,
 * a resolver picks the object. A source test asserts identical key sets, so an
 * untranslated key fails the suite instead of leaking English into a Polish
 * screen.
 *
 * TERMINOLOGY (owner, 2026-09-02): the customer-facing name of this programme
 * is **Affiliate**. The internal database and service names stay `partner_*`
 * — that is stable canonical authority and renaming it would move money for no
 * product reason. So: "Affiliate" in every string here, `partner_*` in every
 * identifier the app sends to the server.
 *
 * FROZEN MEANING — three rules this module must never break:
 *
 *  1. NO EXACT RATE APPEARS HERE. Every euro figure the page shows is read at
 *     render time from `publicRateAuthority.ts`, which reads the ledger's own
 *     rate table. A number typed into this file would be a second rate source.
 *  2. NEVER "lifetime commission". The promise is precise: commission does not
 *     end at the first payment, and each qualifying PAID renewal of a customer
 *     still assigned to you accrues another one.
 *  3. ELITE CARRIES NO PUBLIC NUMBER. Individual terms, an invitation to talk,
 *     and nothing that could be read as a rate.
 */

export interface AffiliateCopy {
  readonly page: {
    readonly eyebrow: string;
    readonly title: string;
    readonly blurb: string;
    readonly contextLabel: string;
  };
  /** Section 1 — hero. */
  readonly hero: {
    readonly eyebrow: string;
    readonly titleLine1: string;
    readonly titleLine2: string;
    readonly lede: string;
    readonly points: readonly string[];
    readonly note: string;
  };
  /** Account-aware primary call to action. */
  readonly cta: {
    readonly signedOut: string;
    readonly signedIn: string;
    readonly pending: string;
    readonly moreInformation: string;
    readonly approved: string;
    readonly rejected: string;
    readonly secondary: string;
  };
  /** Honest account-state strip under the hero CTA. */
  readonly state: {
    readonly checking: string;
    readonly pendingTitle: string;
    readonly pendingBody: string;
    readonly moreInformationTitle: string;
    readonly moreInformationBody: string;
    readonly approvedTitle: string;
    readonly approvedBody: string;
    readonly rejectedTitle: string;
    readonly rejectedBody: string;
  };
  /** Section 2 — one referral can pay more than once. */
  readonly recurring: {
    readonly eyebrow: string;
    readonly title: string;
    readonly body: string;
    readonly steps: readonly { readonly title: string; readonly body: string }[];
    readonly honest: string;
  };
  /** Section 3 — rates + calculator. */
  /** The CUSTOMER's side of an Affiliate purchase — annual only. */
  readonly customerBenefit: {
    readonly figure: string;
    readonly figureUnit: string;
    readonly title: string;
    readonly bodyTemplate: string;
    readonly emphasis: string;
    readonly monthlyNote: string;
  };
  readonly rates: {
    readonly eyebrow: string;
    readonly title: string;
    readonly body: string;
    readonly perRenewal: string;
    readonly homeMonthly: string;
    readonly proMonthly: string;
    readonly homeAnnual: string;
    readonly proAnnual: string;
    readonly standardName: string;
    readonly standardBlurb: string;
    readonly goldName: string;
    /** Rendered with the canonical threshold interpolated — never hardcoded. */
    readonly goldBlurbTemplate: string;
    readonly goldBadgeTemplate: string;
    readonly eliteName: string;
    readonly eliteTerms: string;
    readonly eliteTalk: string;
    readonly eliteBody: string;
    readonly eliteCta: string;
    readonly starterPackLabel: string;
    readonly starterPackUnit: string;
  };
  readonly calculator: {
    readonly eyebrow: string;
    readonly title: string;
    readonly body: string;
    readonly modeLabel: string;
    readonly inputsLabel: string;
    readonly homeMonthlyLabel: string;
    readonly homeAnnualLabel: string;
    readonly proMonthlyLabel: string;
    readonly proAnnualLabel: string;
    readonly monthlyFromMonthly: string;
    readonly fromAnnualRenewals: string;
    readonly totalPerYear: string;
    readonly averagePerMonth: string;
    readonly starterPacksLabel: string;
    readonly fromStarterPacks: string;
    readonly assumption: string;
    readonly eliteState: string;
    readonly eliteCta: string;
    readonly reset: string;
  };
  /** Section 4 — for whom. */
  readonly audience: {
    readonly eyebrow: string;
    readonly title: string;
    readonly groups: readonly { readonly title: string; readonly body: string }[];
  };
  /** Section 5 — how it works. */
  readonly how: {
    readonly eyebrow: string;
    readonly title: string;
    readonly steps: readonly {
      readonly index: string;
      readonly title: string;
      readonly body: string;
    }[];
  };
  /** Section 6 — application. */
  readonly apply: {
    readonly eyebrow: string;
    readonly title: string;
    readonly body: string;
    readonly signedOutBody: string;
    readonly signInCta: string;
  };
  /** Affiliate panel additions (tier, rate, Gold progress). */
  readonly panel: {
    readonly tierLabel: string;
    readonly tierStandard: string;
    readonly tierGold: string;
    readonly tierElite: string;
    readonly yourRates: string;
    readonly yourRatesBody: string;
    readonly eliteRatesBody: string;
    readonly eliteRatesPending: string;
    readonly goldProgress: string;
    readonly goldProgressTemplate: string;
    readonly goldReached: string;
    readonly activePaying: string;
    readonly openPanel: string;
  };
}

export const affiliateCopyPl: AffiliateCopy = {
  page: {
    eyebrow: 'Gellatti',
    title: 'Gellatti Affiliate',
    blurb: 'Polecaj i zarabiaj na każdym odnowieniu.',
    contextLabel: 'Affiliate',
  },
  hero: {
    eyebrow: 'Program Affiliate',
    titleLine1: 'Polecaj i zarabiaj',
    titleLine2: 'na każdym odnowieniu.',
    lede: 'Dostajesz własny link i kod. Kto przyjdzie przez nie do Gellatti, zostaje z Tobą — a Ty otrzymujesz wynagrodzenie także za kolejne odnowienia.',
    points: [
      'Własny link i własny kod',
      'Twoi odbiorcy zostają z Tobą',
      'Wynagrodzenie także za odnowienia',
    ],
    note: 'Wynagrodzenie otrzymujesz za każdą opłaconą płatność.',
  },
  cta: {
    signedOut: 'Dołącz do Affiliate',
    signedIn: 'Zgłoś się',
    pending: 'Zobacz status zgłoszenia',
    moreInformation: 'Uzupełnij zgłoszenie',
    approved: 'Otwórz Panel Affiliate',
    rejected: 'Zobacz szczegóły',
    secondary: 'Jak to działa',
  },
  state: {
    checking: 'Sprawdzamy status Twojego konta…',
    pendingTitle: 'Zgłoszenie w toku',
    pendingBody:
      'Mamy Twoje zgłoszenie i wrócimy z odpowiedzią. Do tego czasu nie musisz nic robić.',
    moreInformationTitle: 'Potrzebujemy jeszcze kilku informacji',
    moreInformationBody:
      'Poprosiliśmy o uzupełnienie zgłoszenia. Otwórz je, dopisz brakujące dane i wyślij ponownie.',
    approvedTitle: 'Jesteś w programie Affiliate',
    approvedBody: 'Twój kod i link czekają w panelu razem z wynikami i prowizjami.',
    rejectedTitle: 'Tym razem bez zgody',
    rejectedBody: 'Możesz zgłosić się ponownie — powód decyzji znajdziesz w szczegółach.',
  },
  recurring: {
    eyebrow: 'Jak działa wynagrodzenie',
    title: 'Polecasz Gellatti. Twoi odbiorcy korzystają. Ty zarabiasz.',
    body: 'Wynagrodzenie nie kończy się na pierwszej płatności. Dopóki polecona osoba korzysta z Gellatti, każde opłacone odnowienie liczy się dla Ciebie.',
    steps: [
      { title: 'Ktoś korzysta z polecenia', body: 'Przychodzi przez Twój link albo podaje Twój kod.' },
      { title: 'Zostaje z Gellatti', body: 'Od pierwszej opłaconej płatności jest przypisany do Twojego polecenia.' },
      { title: 'Odnawia plan', body: 'Przedłuża subskrypcję na kolejny okres.' },
      { title: 'Ty znów otrzymujesz wynagrodzenie', body: 'Za to odnowienie i za każde następne.' },
    ],
    honest: 'Liczy się opłacona płatność — nieopłacona lub zwrócona nie daje wynagrodzenia.',
  },
  customerBenefit: {
    figure: '3',
    figureUnit: ' miesiące gratis',
    title: 'Daj swoim odbiorcom coś więcej.',
    bodyTemplate:
      'Każdy, kto wybierze roczny plan Gellatti z Twojego linku lub kodu, otrzyma {emphasis}.',
    emphasis: '3 dodatkowe miesiące bez opłat',
    monthlyNote: 'Korzyść dotyczy planów rocznych.',
  },
  rates: {
    eyebrow: 'Stawki',
    title: 'Standard, Gold i warunki indywidualne.',
    body: 'Konkretne kwoty w euro — za każdą opłaconą płatność i za każde odnowienie.',
    perRenewal: 'za udane odnowienie',
    homeMonthly: 'HOME miesięcznie',
    proMonthly: 'PRO miesięcznie',
    homeAnnual: 'HOME rocznie',
    proAnnual: 'PRO rocznie',
    standardName: 'Standard',
    standardBlurb: 'Poziom startowy. Działa od pierwszej poleconej osoby.',
    goldName: 'Gold',
    goldBlurbTemplate: 'Wyższe stawki, gdy Twoje polecenia utrzymają {threshold} aktywnych planów.',
    goldBadgeTemplate: 'od {threshold} aktywnych klientów',
    eliteName: 'Elite',
    eliteTerms: 'Dla największych partnerów',
    eliteTalk: 'Warunki ustalamy indywidualnie.',
    eliteBody: 'Warunki ustalamy indywidualnie.',
    eliteCta: 'Porozmawiajmy',
    starterPackLabel: 'Zestaw Startowy',
    starterPackUnit: 'za zestaw',
  },
  calculator: {
    eyebrow: 'Kalkulator',
    title: 'Policz swoją prowizję.',
    body: 'Wpisz, ile osób z Twojego polecenia spodziewasz się w każdym planie.',
    modeLabel: 'Poziom',
    inputsLabel: 'Polecone osoby',
    homeMonthlyLabel: 'HOME — plan miesięczny',
    homeAnnualLabel: 'HOME — plan roczny',
    proMonthlyLabel: 'PRO — plan miesięczny',
    proAnnualLabel: 'PRO — plan roczny',
    monthlyFromMonthly: 'Prowizja miesięczna z planów miesięcznych',
    fromAnnualRenewals: 'Prowizja z odnowień rocznych w ciągu roku',
    totalPerYear: 'Szacowana prowizja łącznie / rok',
    averagePerMonth: 'Średnio na miesiąc',
    starterPacksLabel: 'Zestawy Startowe — sprzedane',
    fromStarterPacks: 'Prowizja z Zestawów Startowych',
    assumption: 'To szacunek przy opłaconych planach i odnowieniach.',
    eliteState: 'Indywidualne warunki',
    eliteCta: 'Porozmawiajmy',
    reset: 'Wyczyść',
  },
  audience: {
    eyebrow: 'Dla kogo',
    title: 'Dla tych, którzy inspirują, uczą i polecają to, co działa.',
    groups: [
      {
        title: 'Twórcy i influencerzy',
        body: 'Pokazujesz rozwiązania, które inspirują, ułatwiają pracę albo pomagają tworzyć lepsze lody.',
      },
      {
        title: 'Profesjonaliści i edukatorzy',
        body: 'Pracujesz w branży lub uczysz innych? Polecaj narzędzie, które rozwiązuje realne problemy w codziennej pracy.',
      },
      {
        title: 'Media i społeczności',
        body: 'Prowadzisz grupę, newsletter, podcast lub portal? Dziel się Gellatti tam, gdzie Twoi odbiorcy szukają praktycznych odpowiedzi.',
      },
    ],
  },
  how: {
    eyebrow: 'Jak to działa',
    title: 'Polecasz Gellatti. Twoi odbiorcy korzystają. Ty zarabiasz.',
    steps: [
      {
        index: '01',
        title: 'Dołącz do programu',
        body: 'Krótki formularz. Sprawdzimy zgłoszenie.',
      },
      {
        index: '02',
        title: 'Odbierz swoje linki i kody',
        body: 'Twórz własne linki i kody dla różnych kampanii.',
      },
      {
        index: '03',
        title: 'Dziel się Gellatti',
        body: 'Twoi odbiorcy korzystają z dodatkowych korzyści, a Ty otrzymujesz prowizję za opłacone płatności.',
      },
    ],
  },
  apply: {
    eyebrow: 'Zgłoszenie',
    title: 'Dołącz do programu Affiliate.',
    body: 'Polecaj rozwiązanie, które naprawdę pomaga — i zarabiaj także przy odnowieniach.',
    signedOutBody: '',
    signInCta: 'Zgłoś się',
  },
  panel: {
    tierLabel: 'Twój poziom',
    tierStandard: 'Standard',
    tierGold: 'Gold',
    tierElite: 'Elite',
    yourRates: 'Twoje stawki',
    yourRatesBody: 'Kwota za każdą udaną płatność i każde udane odnowienie.',
    eliteRatesBody: 'Twoje indywidualne warunki Elite.',
    eliteRatesPending: 'Twoje indywidualne stawki nie są jeszcze ustawione. Odezwiemy się.',
    goldProgress: 'Postęp do Gold',
    goldProgressTemplate: '{current} / {threshold} aktywnych, płacących klientów',
    goldReached: 'Masz poziom Gold.',
    activePaying: 'Aktywni, płacący klienci',
    openPanel: 'Otwórz Panel Affiliate',
  },
};

export const affiliateCopyEn: AffiliateCopy = {
  page: {
    eyebrow: 'Gellatti',
    title: 'Gellatti Affiliate',
    blurb: 'Recommend and earn on every renewal.',
    contextLabel: 'Affiliate',
  },
  hero: {
    eyebrow: 'Affiliate programme',
    titleLine1: 'Recommend Gellatti.',
    titleLine2: 'Earn on every renewal.',
    lede: 'You get your own link and your own code. A customer who arrives through them is assigned to you — and commission does not end at the first payment.',
    points: [
      'Your own link and code',
      'An assigned customer stays yours',
      'Further commission from successful renewals',
    ],
    note: 'Every qualifying paid payment accrues commission.',
  },
  cta: {
    signedOut: 'Join Affiliate',
    signedIn: 'Apply',
    pending: 'See application status',
    moreInformation: 'Complete your application',
    approved: 'Open Affiliate Panel',
    rejected: 'See details',
    secondary: 'How it works',
  },
  state: {
    checking: 'Checking your account status…',
    pendingTitle: 'Application in progress',
    pendingBody:
      'We have your application and will come back with an answer. Nothing to do until then.',
    moreInformationTitle: 'We need a few more details',
    moreInformationBody:
      'We asked you to complete the application. Open it, add what is missing and send it again.',
    approvedTitle: 'You are in the Affiliate programme',
    approvedBody:
      'Your code and link are waiting in the panel, together with results and commission.',
    rejectedTitle: 'Not this time',
    rejectedBody: 'You can apply again — the reason for the decision is in the details.',
  },
  recurring: {
    eyebrow: 'How commission is counted',
    title: 'One recommendation can pay more than once.',
    body: 'Commission does not end at the first payment. While a customer stays assigned to you, every qualifying paid renewal accrues another one.',
    steps: [
      { title: 'The customer buys', body: 'They arrive through your link or enter your code.' },
      { title: 'They are assigned', body: 'The assignment is recorded on the first paid payment.' },
      { title: 'They renew', body: 'The next period is paid for.' },
      { title: 'Another commission', body: 'We accrue it for that renewal.' },
    ],
    honest: 'A failed, refunded or unpaid payment creates no commission.',
  },
  customerBenefit: {
    figure: '15',
    figureUnit: ' months',
    title: 'The customer gains too.',
    bodyTemplate: 'Anyone who buys an annual plan through your link or code gets {emphasis}. The price does not change.',
    emphasis: '15 months for the price of 12',
    monthlyNote: 'Monthly plans do not carry the bonus.',
  },
  rates: {
    eyebrow: 'Rates',
    title: 'Standard, Gold and individual terms.',
    body: 'Rates are fixed amounts in euro, per successful payment and per successful renewal.',
    perRenewal: 'per successful renewal',
    homeMonthly: 'HOME monthly',
    proMonthly: 'PRO monthly',
    homeAnnual: 'HOME annual',
    proAnnual: 'PRO annual',
    standardName: 'Standard',
    standardBlurb: 'The starting level. It applies from your first assigned customer.',
    goldName: 'Gold',
    goldBlurbTemplate: 'Higher rates from {threshold} active, paying referred customers.',
    goldBadgeTemplate: 'from {threshold} active customers',
    eliteName: 'Elite',
    eliteTerms: 'For the largest partners',
    eliteTalk: 'Terms are agreed individually.',
    eliteBody: 'Terms are agreed individually.',
    eliteCta: "Let's talk",
    starterPackLabel: 'Starter Pack',
    starterPackUnit: 'per pack',
  },
  calculator: {
    eyebrow: 'Calculator',
    title: 'Work out your commission.',
    body: 'Enter how many active customers assigned to you you expect on each plan.',
    modeLabel: 'Level',
    inputsLabel: 'Active customers',
    homeMonthlyLabel: 'HOME — monthly plan',
    homeAnnualLabel: 'HOME — annual plan',
    proMonthlyLabel: 'PRO — monthly plan',
    proAnnualLabel: 'PRO — annual plan',
    monthlyFromMonthly: 'Monthly commission from monthly plans',
    fromAnnualRenewals: 'Commission from annual renewals over one year',
    totalPerYear: 'Estimated total commission / year',
    averagePerMonth: 'Average per month',
    starterPacksLabel: 'Starter Packs — sold',
    fromStarterPacks: 'Commission from Starter Packs',
    assumption: 'The estimate assumes successful qualifying payments and renewals.',
    eliteState: 'Individual terms',
    eliteCta: "Let's talk",
    reset: 'Clear',
  },
  audience: {
    eyebrow: 'Who it is for',
    title: 'For people with someone to recommend it to.',
    groups: [
      {
        title: 'Creators',
        body: 'You run a channel, a profile or a newsletter about food, ice cream or cooking.',
      },
      {
        title: 'Professionals',
        body: 'You teach, advise, or work with gelaterias and patisseries.',
      },
      {
        title: 'Communities and media',
        body: 'You have a group, a forum or a publication that trusts your recommendations.',
      },
    ],
  },
  how: {
    eyebrow: 'Getting started',
    title: 'You recommend Gellatti. Your audience gains. You earn.',
    steps: [
      {
        index: '01',
        title: 'Apply',
        body: 'A short application: who you are and where you recommend.',
      },
      {
        index: '02',
        title: 'Get your link and code',
        body: 'Once approved they wait for you in the Affiliate Panel.',
      },
      {
        index: '03',
        title: 'Recommend and earn',
        body: 'Results, assigned customers and commission are visible as they happen.',
      },
    ],
  },
  apply: {
    eyebrow: 'Application',
    title: 'Join the Affiliate programme.',
    body: 'Tell us where you recommend and who you speak to. We answer every application.',
    signedOutBody:
      'You apply from your Gellatti account — that way the code and the commission belong to you from the start.',
    signInCta: 'Apply',
  },
  panel: {
    tierLabel: 'Your level',
    tierStandard: 'Standard',
    tierGold: 'Gold',
    tierElite: 'Elite',
    yourRates: 'Your rates',
    yourRatesBody: 'The amount for each successful payment and each successful renewal.',
    eliteRatesBody: 'Your individual Elite terms.',
    eliteRatesPending: 'Your individual rates are not set yet. We will be in touch.',
    goldProgress: 'Progress to Gold',
    goldProgressTemplate: '{current} / {threshold} active, paying customers',
    goldReached: 'You are at Gold level.',
    activePaying: 'Active, paying customers',
    openPanel: 'Open Affiliate Panel',
  },
};

export type AffiliateLanguage = 'pl' | 'en';

export const resolveAffiliateCopy = (language: AffiliateLanguage = 'pl'): AffiliateCopy =>
  language === 'en' ? affiliateCopyEn : affiliateCopyPl;

/** Polish is the shipped reference language. */
export const affiliateCopy: AffiliateCopy = affiliateCopyPl;

/** Fill `{token}` placeholders in a copy template. */
export const fillTemplate = (
  template: string,
  values: Readonly<Record<string, string | number>>,
): string =>
  template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
