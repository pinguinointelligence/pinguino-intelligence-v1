/**
 * Cooperation copy — Work with us, the Partner/Creator application, and the
 * Franchise inquiry.
 *
 * Follows the `CommunityCopy` reference pattern from `src/copy/community.ts`
 * (see `src/copy/locale.ts` rule 3): one interface is the key contract, one
 * complete object per locale implements it, a resolver picks the object. A
 * source test asserts both objects carry identical key sets, so an
 * untranslated key fails the suite instead of leaking into a Polish screen.
 *
 * No revenue promise, no commission figure and no audience claim appears
 * anywhere here: commercial terms are not configured for public display, and
 * the product does not invent them.
 */

export interface CooperationCopy {
  readonly page: {
    readonly eyebrow: string;
    readonly title: string;
    readonly blurb: string;
    readonly contextLabel: string;
  };
  readonly partner: {
    readonly kicker: string;
    readonly headline: string;
    readonly body: string;
    readonly cta: string;
    readonly whatYouShareTitle: string;
    readonly whatYouShare: readonly string[];
    readonly howTitle: string;
    readonly how: readonly { readonly step: string; readonly title: string; readonly body: string }[];
    readonly attributionTitle: string;
    readonly attributionBody: string;
  };
  readonly form: {
    readonly title: string;
    readonly blurb: string;
    readonly signInFirst: string;
    readonly signInCta: string;
    readonly displayName: string;
    readonly displayNamePlaceholder: string;
    readonly account: string;
    readonly primaryLink: string;
    readonly primaryLinkPlaceholder: string;
    readonly otherLinks: string;
    readonly otherLinksPlaceholder: string;
    readonly platforms: string;
    readonly audience: string;
    readonly audiencePlaceholder: string;
    readonly country: string;
    readonly countryPlaceholder: string;
    readonly note: string;
    readonly notePlaceholder: string;
    readonly submit: string;
    readonly submitting: string;
    readonly seeCommunity: string;
    readonly afterSubmit: string;
    readonly error: string;
  };
  readonly state: {
    readonly loading: string;
    readonly pendingTitle: string;
    readonly pendingBody: string;
    readonly informationBody: string;
    readonly rejectedBody: string;
    readonly activeTitle: string;
    readonly activeBody: string;
    readonly activeCta: string;
  };
  readonly secondary: {
    readonly title: string;
    readonly blurb: string;
    readonly includedLabel: string;
    readonly forWhomLabel: string;
    readonly cta: string;
    readonly franchiseTitle: string;
    readonly franchiseBody: string;
    readonly franchiseCta: string;
  };
  readonly franchise: {
    readonly formTitle: string;
    readonly formBlurb: string;
    readonly conceptLabel: string;
    readonly nameLabel: string;
    readonly emailLabel: string;
    readonly phoneLabel: string;
    readonly cityLabel: string;
    readonly countryLabel: string;
    readonly noteLabel: string;
    readonly notePlaceholder: string;
    readonly submit: string;
    readonly submitting: string;
    readonly successTitle: string;
    readonly successBody: string;
    readonly error: string;
  };
}

export const cooperationCopyPl: CooperationCopy = {
  page: {
    eyebrow: 'Ekosystem Gellatti',
    title: 'Twórz z Gellatti',
    blurb: 'Najpierw twórcy i partnerzy. Reszta kierunków współpracy jest niżej.',
    contextLabel: 'Współpraca',
  },
  partner: {
    kicker: 'Partnerzy i twórcy',
    headline: 'Rób lody, które ludzie chcą powtórzyć',
    body:
      'Gellatti liczy recepturę za Ciebie — słodycz, strukturę, temperaturę podania i maszynę. ' +
      'Ty zajmujesz się smakiem i treścią. Twoje receptury możesz publikować w Community, ' +
      'a Twoja publiczność otwiera Gellatti przez Twój link i kod.',
    cta: 'Wyślij zgłoszenie',
    whatYouShareTitle: 'Co możesz pokazać',
    whatYouShare: [
      'Recepturę, którą naprawdę zrobiłeś — z gramaturą i wynikiem.',
      'Produkcję krok po kroku i gotową etykietę.',
      'Wersje receptury: co zmieniłeś i dlaczego wyszło lepiej.',
      'Swój profil twórcy i publiczne receptury w Community.',
    ],
    howTitle: 'Jak to działa',
    how: [
      { step: '01', title: 'Zgłoszenie', body: 'Krótki formularz i link do Twoich treści.' },
      { step: '02', title: 'Decyzja', body: 'Gellatti sprawdza zgłoszenie i odpowiada w aplikacji.' },
      { step: '03', title: 'Kod i link', body: 'Po zatwierdzeniu dostajesz własny kod i link partnerski.' },
      { step: '04', title: 'Panel Partner', body: 'Widzisz kliknięcia, przypisania i rozliczenia.' },
    ],
    attributionTitle: 'Przypisanie',
    attributionBody:
      'Każde wejście przez Twój link lub kod zostaje przypisane do Twojego konta. ' +
      'Warunki rozliczeń widzisz w panelu Partner — nie obiecujemy ich tutaj.',
  },
  form: {
    title: 'Zgłoszenie partnerskie',
    blurb: 'Kilka pól. Resztę ustalimy w rozmowie.',
    signInFirst:
      'Zgłoszenie łączymy z Twoim kontem Gellatti — dzięki temu po zatwierdzeniu tryb Partner ' +
      'włącza się od razu, obok Twojego obecnego planu.',
    signInCta: 'Zaloguj się',
    displayName: 'Nazwa twórcy',
    displayNamePlaceholder: 'Jak podpisujesz swoje treści',
    account: 'Konto Gellatti',
    primaryLink: 'Główny link',
    primaryLinkPlaceholder: 'https://instagram.com/twoj-profil',
    otherLinks: 'Inne linki',
    otherLinksPlaceholder: 'Oddziel przecinkami',
    platforms: 'Platformy',
    audience: 'Publiczność',
    audiencePlaceholder: 'Np. 12 tys. obserwujących, tematyka deserowa',
    country: 'Kraj',
    countryPlaceholder: 'Polska',
    note: 'Co chcesz robić z Gellatti',
    notePlaceholder: 'Krótko: jaki materiał planujesz i dla kogo.',
    submit: 'Wyślij zgłoszenie',
    submitting: 'Wysyłam…',
    seeCommunity: 'Zobacz Community',
    afterSubmit: 'Po wysłaniu zobaczysz status zgłoszenia tutaj i w powiadomieniach.',
    error: 'Nie udało się wysłać zgłoszenia. Sprawdź nazwę i główny link, a potem spróbuj ponownie.',
  },
  state: {
    loading: 'Sprawdzam status zgłoszenia…',
    pendingTitle: 'Zgłoszenie wysłane',
    pendingBody: 'Odezwiemy się w aplikacji. Do tego czasu Twoje konto działa bez zmian.',
    informationBody: 'Potrzebujemy jeszcze kilku informacji. Sprawdź powiadomienia.',
    rejectedBody: 'Poprzednie zgłoszenie zostało rozpatrzone odmownie. Możesz wysłać nowe.',
    activeTitle: 'Tryb Partner jest aktywny',
    activeBody: 'Twój kod i link partnerski czekają w panelu Partner.',
    activeCta: 'Otwórz panel Partner',
  },
  secondary: {
    title: 'Pozostałe kierunki',
    blurb: 'Dla lodziarni i pracowni, które chcą pracować z Gellatti na maszynach.',
    includedLabel: 'Co obejmuje',
    forWhomLabel: 'Dla kogo',
    cta: 'Porozmawiaj z Gellatti',
    franchiseTitle: 'Franchise',
    franchiseBody: 'Lokal albo foodtruck — osobna ścieżka biznesowa z własnym zapytaniem.',
    franchiseCta: 'Zobacz Franchise',
  },
  franchise: {
    formTitle: 'Zapytanie o Franchise',
    formBlurb: 'Napisz, który format Cię interesuje. Odpowiemy na podany adres.',
    conceptLabel: 'Format',
    nameLabel: 'Imię i nazwisko',
    emailLabel: 'E-mail',
    phoneLabel: 'Telefon',
    cityLabel: 'Miasto',
    countryLabel: 'Kraj',
    noteLabel: 'Twoje pytanie',
    notePlaceholder: 'Np. lokalizacja, termin, doświadczenie w gastronomii.',
    submit: 'Wyślij zapytanie',
    submitting: 'Wysyłam…',
    successTitle: 'Zapytanie wysłane',
    successBody: 'Odezwiemy się na podany adres e-mail.',
    error: 'Nie udało się wysłać zapytania. Sprawdź e-mail i spróbuj ponownie.',
  },
};

export const cooperationCopyEn: CooperationCopy = {
  page: {
    eyebrow: 'Gellatti ecosystem',
    title: 'Create with Gellatti',
    blurb: 'Creators and partners first. Other cooperation routes are below.',
    contextLabel: 'Cooperation',
  },
  partner: {
    kicker: 'Partners and creators',
    headline: 'Make ice cream people want to remake',
    body:
      'Gellatti works out the recipe — sweetness, texture, serving temperature and machine. ' +
      'You bring the flavour and the content. Publish your recipes to Community, and your ' +
      'audience opens Gellatti through your link and code.',
    cta: 'Send an application',
    whatYouShareTitle: 'What you can show',
    whatYouShare: [
      'A recipe you actually made — grams and result included.',
      'Production step by step and the finished label.',
      'Recipe versions: what you changed and why it came out better.',
      'Your creator profile and public recipes in Community.',
    ],
    howTitle: 'How it works',
    how: [
      { step: '01', title: 'Application', body: 'A short form and a link to your work.' },
      { step: '02', title: 'Decision', body: 'Gellatti reviews it and answers in the app.' },
      { step: '03', title: 'Code and link', body: 'Once approved you get your own partner code and link.' },
      { step: '04', title: 'Partner panel', body: 'See clicks, attributions and settlements.' },
    ],
    attributionTitle: 'Attribution',
    attributionBody:
      'Every visit through your link or code is attributed to your account. ' +
      'Settlement terms live in the Partner panel — we do not promise them here.',
  },
  form: {
    title: 'Partner application',
    blurb: 'A few fields. We sort out the rest in conversation.',
    signInFirst:
      'The application is tied to your Gellatti account, so once approved the Partner mode ' +
      'switches on immediately, alongside your current plan.',
    signInCta: 'Sign in',
    displayName: 'Creator name',
    displayNamePlaceholder: 'How you sign your work',
    account: 'Gellatti account',
    primaryLink: 'Main link',
    primaryLinkPlaceholder: 'https://instagram.com/your-profile',
    otherLinks: 'Other links',
    otherLinksPlaceholder: 'Separate with commas',
    platforms: 'Platforms',
    audience: 'Audience',
    audiencePlaceholder: 'e.g. 12k followers, dessert content',
    country: 'Country',
    countryPlaceholder: 'Poland',
    note: 'What you want to do with Gellatti',
    notePlaceholder: 'Briefly: what you plan to make, and for whom.',
    submit: 'Send application',
    submitting: 'Sending…',
    seeCommunity: 'See Community',
    afterSubmit: 'After sending, the status appears here and in your notifications.',
    error: 'The application could not be sent. Check the name and main link, then try again.',
  },
  state: {
    loading: 'Checking your application status…',
    pendingTitle: 'Application sent',
    pendingBody: 'We will answer in the app. Your account keeps working unchanged.',
    informationBody: 'We need a little more information. Check your notifications.',
    rejectedBody: 'The previous application was declined. You can send a new one.',
    activeTitle: 'Partner mode is active',
    activeBody: 'Your code and partner link are waiting in the Partner panel.',
    activeCta: 'Open the Partner panel',
  },
  secondary: {
    title: 'Other routes',
    blurb: 'For gelaterias and labs that want to work with Gellatti on machines.',
    includedLabel: 'What it includes',
    forWhomLabel: 'Who it is for',
    cta: 'Talk to Gellatti',
    franchiseTitle: 'Franchise',
    franchiseBody: 'A location or a foodtruck — a separate business route with its own inquiry.',
    franchiseCta: 'See Franchise',
  },
  franchise: {
    formTitle: 'Franchise inquiry',
    formBlurb: 'Tell us which format interests you. We answer at the address you give.',
    conceptLabel: 'Format',
    nameLabel: 'Full name',
    emailLabel: 'Email',
    phoneLabel: 'Phone',
    cityLabel: 'City',
    countryLabel: 'Country',
    noteLabel: 'Your question',
    notePlaceholder: 'e.g. location, timing, hospitality experience.',
    submit: 'Send inquiry',
    submitting: 'Sending…',
    successTitle: 'Inquiry sent',
    successBody: 'We will answer at the email address you gave.',
    error: 'The inquiry could not be sent. Check the email address and try again.',
  },
};

export type CooperationLanguage = 'pl' | 'en';

export const resolveCooperationCopy = (language: CooperationLanguage = 'pl'): CooperationCopy =>
  language === 'en' ? cooperationCopyEn : cooperationCopyPl;

/** Polish is the shipped reference language. */
export const cooperationCopy: CooperationCopy = cooperationCopyPl;
