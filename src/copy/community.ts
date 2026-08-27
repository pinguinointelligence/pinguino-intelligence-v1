/**
 * Community / Creator / Sharing / Partner copy (§63).
 *
 * The feature hardcodes NO strings in components. `CommunityCopy` is the key
 * contract; `communityCopyPl` and `communityCopyEn` are two complete
 * implementations of it, so adding a third language is a new object and not a
 * hunt through JSX. A source test asserts both objects have identical key sets
 * — an untranslated key is a test failure, never a Polish word in an English UI.
 *
 * Polish is the default because the product ships Polish-first; nothing here
 * assumes it is the only language.
 */

export interface CommunityCopy {
  readonly nav: {
    readonly myRecipes: string;
    readonly sharedWithMe: string;
    readonly community: string;
    readonly top100: string;
    readonly received: string;
    readonly sentByMe: string;
  };
  readonly roles: {
    readonly creator: string;
    readonly partner: string;
    readonly createdBy: string;
    readonly sharedBy: string;
    readonly basedOn: string;
  };
  readonly actions: {
    readonly shareRecipe: string;
    readonly publishToCommunity: string;
    readonly unpublish: string;
    readonly useThisRecipe: string;
    readonly createMyVersion: string;
    readonly unlockThisRecipe: string;
    readonly revokeLink: string;
    readonly copyLink: string;
    readonly linkCopied: string;
    readonly share: string;
    readonly removeFromReceived: string;
    readonly report: string;
    readonly view: string;
    readonly signIn: string;
    readonly createAccount: string;
  };
  readonly windows: {
    readonly trending: string;
    readonly week: string;
    readonly month: string;
    readonly allTime: string;
  };
  readonly metrics: {
    readonly made: string;
    readonly makers: string;
    readonly remixes: string;
    readonly verifiedRating: string;
    readonly noRatingYet: string;
    readonly uniqueUsers: string;
    readonly publicRecipes: string;
    readonly opens: string;
    readonly uniqueOpens: string;
  };
  readonly demo: {
    readonly badge: string;
    readonly title: string;
    readonly body: string;
    readonly gramsHidden: string;
    readonly whatYouGet: string;
  };
  readonly share: {
    readonly dialogTitle: string;
    readonly dialogBody: string;
    readonly versionNote: (versionNumber: number) => string;
    readonly unlistedNote: string;
    readonly partnerNote: string;
    readonly notFound: string;
    readonly revoked: string;
    readonly expired: string;
    readonly openedByYou: string;
  };
  readonly publish: {
    readonly dialogTitle: string;
    readonly dialogBody: string;
    readonly completionTitle: string;
    readonly completionBody: string;
    readonly privacyNote: string;
    readonly creatorInviteTitle: string;
    readonly creatorInviteBody: string;
    readonly createCreatorProfile: string;
    readonly titleLabel: string;
    readonly descriptionLabel: string;
    readonly categoryLabel: string;
    readonly slugLabel: string;
    readonly needsCreatorProfile: string;
    readonly published: string;
  };
  readonly creator: {
    readonly claimTitle: string;
    readonly handleLabel: string;
    readonly displayNameLabel: string;
    readonly bioLabel: string;
    readonly countryLabel: string;
    readonly cityLabel: string;
    readonly makePublic: string;
    readonly handleTaken: string;
    readonly handleReserved: string;
    readonly handleInvalid: string;
    readonly handleTooShort: string;
    readonly handleTooLong: string;
    readonly verified: string;
    readonly official: string;
  };
  readonly partner: {
    readonly dashboardTitle: string;
    readonly notAPartner: string;
    readonly notActive: string;
    readonly eligibilityNote: string;
    readonly pending: string;
    readonly approved: string;
    readonly paid: string;
    readonly reversed: string;
    readonly attributedSubscriptions: string;
    readonly separateFromCreator: string;
  };
  readonly empty: {
    readonly community: string;
    readonly top100: string;
    readonly received: string;
    readonly sent: string;
    readonly creatorRecipes: string;
    readonly firstCreator: string;
  };
}

/** Polish — the shipping default. */
export const communityCopyPl: CommunityCopy = {
  nav: {
    myRecipes: 'Moje receptury',
    sharedWithMe: 'Udostępnione mi',
    community: 'Community',
    top100: 'TOP 100',
    received: 'Otrzymane',
    sentByMe: 'Wysłane przeze mnie',
  },
  roles: {
    creator: 'Twórca',
    partner: 'Gellatti Partner',
    createdBy: 'Autor',
    sharedBy: 'Udostępnione przez',
    basedOn: 'Na podstawie',
  },
  actions: {
    shareRecipe: 'Udostępnij recepturę',
    publishToCommunity: 'Opublikuj w Community',
    unpublish: 'Wycofaj publikację',
    useThisRecipe: 'Użyj tej receptury',
    createMyVersion: 'Stwórz moją wersję',
    unlockThisRecipe: 'Odblokuj tę recepturę',
    revokeLink: 'Unieważnij link',
    copyLink: 'Kopiuj link',
    linkCopied: 'Gotowe. Link czeka w schowku.',
    share: 'Udostępnij',
    removeFromReceived: 'Usuń z otrzymanych',
    report: 'Zgłoś',
    view: 'Zobacz',
    signIn: 'Zaloguj się',
    createAccount: 'Załóż konto',
  },
  windows: {
    trending: 'Na czasie',
    week: 'Ten tydzień',
    month: 'Ten miesiąc',
    allTime: 'Wszechczasów',
  },
  metrics: {
    made: 'Wykonań',
    makers: 'Osób zrobiło',
    remixes: 'Wersji',
    verifiedRating: 'Ocena zweryfikowana',
    noRatingYet: 'Brak ocen',
    uniqueUsers: 'Użytkowników',
    publicRecipes: 'Receptur publicznych',
    opens: 'Otwarć',
    uniqueOpens: 'Unikalnych otwarć',
  },
  demo: {
    badge: 'Podgląd Gellatti',
    title: 'To jest prawdziwa receptura, którą Ci wysłano',
    body: 'Widzisz jej skład i strukturę. Dokładne gramatury odblokujesz w Gellatti.',
    gramsHidden: 'Dokładne gramatury dostępne po wykupieniu planu',
    whatYouGet: 'Po odblokowaniu otrzymasz',
  },
  share: {
    dialogTitle: 'Udostępnij recepturę',
    dialogBody:
      'Tworzymy bezpieczny, niepubliczny link. Receptura nie trafi do Community ani do wyszukiwarek.',
    versionNote: (versionNumber) =>
      `Link wskazuje wersję ${versionNumber} i zawsze będzie ją pokazywał.`,
    unlistedNote: 'Link niepubliczny — dostępny tylko dla osób, którym go wyślesz.',
    partnerNote:
      'Ten link jest powiązany z Twoim aktywnym statusem Gellatti Partner. Prowizja przysługuje wyłącznie za subskrypcje pozyskane w czasie aktywnego statusu.',
    notFound: 'Nie możemy otworzyć tej receptury. Sprawdź link i spróbuj ponownie.',
    revoked: 'Ten link został wyłączony. Poproś o nowy, jeśli nadal potrzebujesz dostępu.',
    expired: 'Ten link wygasł. Poproś o nowy.',
    openedByYou: 'Otwarto',
  },
  publish: {
    dialogTitle: 'Opublikuj w Community',
    dialogBody:
      'Twoja receptura stanie się publiczna. Dokładne gramatury pozostają chronione — widzą je tylko osoby z aktywnym planem.',
    completionTitle: 'Pokaż swój wynik w Community',
    completionBody: 'Świetna partia? Udostępnij recepturę i pokaż ją innym.',
    privacyNote: 'Dokładne gramatury pozostają chronione zgodnie z Twoim planem.',
    creatorInviteTitle: 'Chcesz publikować w Community?',
    creatorInviteBody:
      'Utworzenie profilu Twórcy zajmie chwilę. Potem wrócisz tutaj i dokończysz publikację.',
    createCreatorProfile: 'Utwórz profil',
    titleLabel: 'Tytuł',
    descriptionLabel: 'Opis',
    categoryLabel: 'Kategoria',
    slugLabel: 'Adres publiczny',
    needsCreatorProfile: 'Najpierw utwórz profil Twórcy.',
    published: 'Gotowe. Receptura jest już w Community.',
  },
  creator: {
    claimTitle: 'Profil Twórcy',
    handleLabel: 'Nazwa użytkownika',
    displayNameLabel: 'Nazwa wyświetlana',
    bioLabel: 'O mnie',
    countryLabel: 'Kraj',
    cityLabel: 'Miasto',
    makePublic: 'Profil publiczny',
    handleTaken: 'Ta nazwa jest już zajęta.',
    handleReserved: 'Ta nazwa jest zarezerwowana.',
    handleInvalid: 'Dozwolone są litery, cyfry, „-" i „_".',
    handleTooShort: 'Minimum 3 znaki.',
    handleTooLong: 'Maksimum 30 znaków.',
    verified: 'Zweryfikowany',
    official: 'Oficjalny',
  },
  partner: {
    dashboardTitle: 'Gellatti Partner',
    notAPartner: 'Nie masz jeszcze statusu Gellatti Partner.',
    notActive: 'Twój status Gellatti Partner nie jest aktywny.',
    eligibilityNote:
      'Prowizja przysługuje wyłącznie za subskrypcje pozyskane w czasie aktywnego statusu Gellatti Partner. Popularność receptur ani udostępnienia same w sobie nie tworzą prawa do wynagrodzenia, a prowizje nie działają wstecz.',
    pending: 'Oczekujące',
    approved: 'Zatwierdzone',
    paid: 'Wypłacone',
    reversed: 'Cofnięte',
    attributedSubscriptions: 'Przypisane subskrypcje',
    separateFromCreator: 'Statystyki Twórcy znajdziesz w osobnej sekcji.',
  },
  empty: {
    community: 'Tu pojawią się pierwsze opublikowane receptury.',
    top100: 'Ranking ruszy, gdy pojawią się pierwsze wykonania.',
    received: 'Nie masz jeszcze udostępnionych receptur.',
    sent: 'Nie masz jeszcze wysłanych receptur.',
    creatorRecipes: 'Na tym profilu nie ma jeszcze publicznych receptur.',
    firstCreator:
      'Opublikuj swoją pierwszą recepturę i zostań jednym z pierwszych Twórców Gellatti.',
  },
};

/** English — key-complete, so a second locale is a data change, not a rewrite. */
export const communityCopyEn: CommunityCopy = {
  nav: {
    myRecipes: 'My recipes',
    sharedWithMe: 'Shared with me',
    community: 'Community',
    top100: 'TOP 100',
    received: 'Received',
    sentByMe: 'Sent by me',
  },
  roles: {
    creator: 'Creator',
    partner: 'Gellatti Partner',
    createdBy: 'Created by',
    sharedBy: 'Shared by',
    basedOn: 'Based on',
  },
  actions: {
    shareRecipe: 'Share recipe',
    publishToCommunity: 'Publish to Community',
    unpublish: 'Unpublish',
    useThisRecipe: 'Use this recipe',
    createMyVersion: 'Create my version',
    unlockThisRecipe: 'Unlock this recipe',
    revokeLink: 'Revoke link',
    copyLink: 'Copy link',
    linkCopied: 'Link copied',
    share: 'Share',
    removeFromReceived: 'Remove from received',
    report: 'Report',
    view: 'View',
    signIn: 'Sign in',
    createAccount: 'Create account',
  },
  windows: {
    trending: 'Trending',
    week: 'This week',
    month: 'This month',
    allTime: 'All time',
  },
  metrics: {
    made: 'Makes',
    makers: 'People made it',
    remixes: 'Remixes',
    verifiedRating: 'Verified rating',
    noRatingYet: 'No ratings yet',
    uniqueUsers: 'Users',
    publicRecipes: 'Public recipes',
    opens: 'Opens',
    uniqueOpens: 'Unique opens',
  },
  demo: {
    badge: 'Gellatti preview',
    title: 'This is the real recipe somebody sent you',
    body: 'You can see its composition and structure. Exact grams unlock in Gellatti.',
    gramsHidden: 'Exact grams available with an active plan',
    whatYouGet: 'After unlocking you get',
  },
  share: {
    dialogTitle: 'Share recipe',
    dialogBody:
      'We create a secure link. The recipe is NOT published to Community or to search engines.',
    versionNote: (versionNumber) => `This link points at version ${versionNumber} and always will.`,
    unlistedNote: 'Unlisted link — only people you send it to can open it.',
    partnerNote:
      'This link is bound to your active Gellatti Partner status. Commission applies only to subscriptions acquired while that status is active.',
    notFound: 'This recipe could not be found.',
    revoked: 'The person who sent this link has revoked it.',
    expired: 'This link has expired.',
    openedByYou: 'Opened',
  },
  publish: {
    dialogTitle: 'Publish to Community',
    dialogBody:
      'Your recipe becomes public. Exact grams stay protected — only people with an active plan see them.',
    completionTitle: 'Show your result in Community',
    completionBody: 'A great batch? Share the recipe and show it to others.',
    privacyNote: 'Exact grams remain protected according to your plan.',
    creatorInviteTitle: 'Want to publish in Community?',
    creatorInviteBody:
      'Creating a Creator profile takes a moment. Then you will return here to finish publishing.',
    createCreatorProfile: 'Create profile',
    titleLabel: 'Title',
    descriptionLabel: 'Description',
    categoryLabel: 'Category',
    slugLabel: 'Public address',
    needsCreatorProfile: 'Create a Creator profile first.',
    published: 'Published',
  },
  creator: {
    claimTitle: 'Creator profile',
    handleLabel: 'Handle',
    displayNameLabel: 'Display name',
    bioLabel: 'About',
    countryLabel: 'Country',
    cityLabel: 'City',
    makePublic: 'Public profile',
    handleTaken: 'That handle is already taken.',
    handleReserved: 'That handle is reserved.',
    handleInvalid: 'Letters, digits, “-” and “_” only.',
    handleTooShort: 'At least 3 characters.',
    handleTooLong: 'At most 30 characters.',
    verified: 'Verified',
    official: 'Official',
  },
  partner: {
    dashboardTitle: 'Gellatti Partner',
    notAPartner: 'You do not have Gellatti Partner status yet.',
    notActive: 'Your Gellatti Partner status is not active.',
    eligibilityNote:
      'Commission applies only to subscriptions acquired while Gellatti Partner status is active. Recipe popularity and sharing do not by themselves create a payment entitlement, and commissions are not retroactive.',
    pending: 'Pending',
    approved: 'Approved',
    paid: 'Paid',
    reversed: 'Reversed',
    attributedSubscriptions: 'Attributed subscriptions',
    separateFromCreator: 'Creator statistics live in their own section.',
  },
  empty: {
    community: 'No Community recipes yet.',
    top100: 'The ranking appears once recipes start being made.',
    received: 'Nobody has shared a recipe with you yet.',
    sent: 'You have not shared any recipe yet.',
    creatorRecipes: 'This creator has no public recipes yet.',
    firstCreator: 'Publish your first recipe and be one of the first Gellatti Creators.',
  },
};

export type CommunityLanguage = 'pl' | 'en';

export const resolveCommunityCopy = (language: CommunityLanguage = 'pl'): CommunityCopy =>
  language === 'en' ? communityCopyEn : communityCopyPl;

/** The default the UI imports today. */
export const communityCopy: CommunityCopy = communityCopyPl;
