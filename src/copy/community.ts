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
    /** Direct-share own photograph (owner decision 2026-09-17). */
    readonly photoTitle: string;
    readonly photoFallbackNote: string;
    readonly photoTake: string;
    readonly photoChoose: string;
    readonly photoUploading: string;
    readonly photoAttached: string;
    readonly photoRemove: string;
    readonly photoFailed: string;
    readonly photoRetry: string;
    readonly photoSkip: string;
    readonly photoOptionsFailed: string;
    /** Recipient page: the photograph could not be loaded (a failure, not „no photo"). */
    readonly ownPhotoUnavailable: string;
    /** Recipient page: the server refused the photograph (revoked, expired, no access). */
    readonly ownPhotoRefused: string;
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
    readonly imageLabel: string;
    readonly imageRequired: string;
    /** Why „Opublikuj" is unavailable while no own photograph is attached. */
    readonly ownPhotoRequired: string;
    /** Shown only when the recipe version is confirmed saved. */
    readonly ownPhotoLaterSaved: string;
    readonly publishLater: string;
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
    sharedWithMe: 'Udostępnione',
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
    useThisRecipe: 'Zrób te lody',
    createMyVersion: 'Stwórz moją wersję',
    unlockThisRecipe: 'Odblokuj tę recepturę',
    revokeLink: 'Unieważnij link',
    copyLink: 'Kopiuj link',
    linkCopied: 'Link skopiowany do schowka.',
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
    photoTitle: 'Zdjęcie dla odbiorcy',
    photoFallbackNote:
      'Bez własnego zdjęcia odbiorca zobaczy zdjęcie Gellatti dla tego rodzaju lodów.',
    photoTake: 'Zrób zdjęcie',
    photoChoose: 'Wybierz z galerii',
    photoUploading: 'Dodaję zdjęcie…',
    photoAttached:
      'Zdjęcie dodane. Zobaczy je każdy, kto otworzy ten link — nie trafia do Community.',
    photoRemove: 'Usuń zdjęcie',
    photoFailed:
      'Nie udało się dodać zdjęcia. Do czasu dodania własnego odbiorca zobaczy zdjęcie Gellatti.',
    photoRetry: 'Spróbuj ponownie',
    photoSkip: 'Udostępnij bez zdjęcia',
    photoOptionsFailed: 'Nie udało się sprawdzić zdjęcia dla tego linku.',
    ownPhotoUnavailable: 'Nie udało się wczytać zdjęcia autora.',
    ownPhotoRefused: 'To zdjęcie nie jest już dostępne.',
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
    imageLabel: 'Zdjęcie',
    imageRequired: 'Wybierz zdjęcie receptury.',
    ownPhotoRequired: 'Aby opublikować w Community, dodaj własne zdjęcie gotowych lodów.',
    ownPhotoLaterSaved: 'Możesz zrobić to później — Twoja receptura pozostaje zapisana.',
    publishLater: 'Opublikuję później',
    needsCreatorProfile: 'Najpierw utwórz profil Twórcy.',
    published: 'Receptura jest już w Community.',
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
      'Prowizja dotyczy wyłącznie subskrypcji pozyskanych podczas aktywnego statusu Gellatti Partner. Popularność i udostępnienia receptur nie tworzą prawa do prowizji, a prowizje nie działają wstecz.',
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
    myRecipes: 'Moje receptury',
    sharedWithMe: 'Udostępnione',
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
    shareRecipe: 'Udostępnij recepturę',
    publishToCommunity: 'Opublikuj w Community',
    unpublish: 'Unpublish',
    useThisRecipe: 'Make this gelato',
    createMyVersion: 'Utwórz własną wersję',
    unlockThisRecipe: 'Odblokuj tę recepturę',
    revokeLink: 'Revoke link',
    copyLink: 'Copy link',
    linkCopied: 'Link copied',
    share: 'Share',
    removeFromReceived: 'Usuń z udostępnionych mi',
    report: 'Report',
    view: 'View',
    signIn: 'Sign in',
    createAccount: 'Utwórz konto',
  },
  windows: {
    trending: 'Trending',
    week: 'Ten tydzień',
    month: 'Ten miesiąc',
    allTime: 'Cały okres',
  },
  metrics: {
    made: 'Makes',
    makers: 'People made it',
    remixes: 'Remixes',
    verifiedRating: 'Verified rating',
    noRatingYet: 'Brak ocen.',
    uniqueUsers: 'Users',
    publicRecipes: 'Publiczne receptury',
    opens: 'Opens',
    uniqueOpens: 'Unique opens',
  },
  demo: {
    badge: 'Podgląd Gellatti',
    title: 'To receptura, którą ktoś Ci udostępnił',
    body: 'Widzisz skład i strukturę. Dokładne gramatury są dostępne w aktywnym planie Gellatti.',
    gramsHidden: 'Dokładne gramatury są dostępne w aktywnym planie.',
    whatYouGet: 'Po odblokowaniu otrzymasz',
  },
  share: {
    dialogTitle: 'Udostępnij recepturę',
    dialogBody:
      'Tworzymy bezpieczny link. Receptura nie trafia do Community ani do wyszukiwarek.',
    versionNote: (versionNumber) => `Ten link zawsze prowadzi do wersji ${versionNumber}.`,
    unlistedNote: 'Link niepubliczny — otworzą go tylko osoby, którym go wyślesz.',
    partnerNote:
      'Ten link jest powiązany z Twoim aktywnym statusem Gellatti Partner. Prowizja dotyczy tylko subskrypcji pozyskanych w czasie aktywnego statusu.',
    notFound: 'Nie znaleziono tej receptury.',
    revoked: 'Osoba, która wysłała ten link, wycofała go.',
    expired: 'Ten link wygasł.',
    openedByYou: 'Opened',
    photoTitle: 'Photo for the recipient',
    photoFallbackNote:
      'Without your own photo, the recipient sees the Gellatti photo for this kind of ice cream.',
    photoTake: 'Take a photo',
    photoChoose: 'Choose from gallery',
    photoUploading: 'Adding the photo…',
    photoAttached:
      'Photo added. Anyone who opens this link sees it — it is not posted to Community.',
    photoRemove: 'Remove photo',
    photoFailed:
      'The photo could not be added. Until you add your own, the recipient sees the Gellatti photo.',
    photoRetry: 'Try again',
    photoSkip: 'Share without a photo',
    photoOptionsFailed: 'The photo options for this link could not be loaded.',
    ownPhotoUnavailable: "The author's photo could not be loaded.",
    ownPhotoRefused: 'This photo is no longer available.',
  },
  publish: {
    dialogTitle: 'Opublikuj w Community',
    dialogBody:
      'Receptura staje się publiczna. Dokładne gramatury pozostają chronione i są widoczne tylko w aktywnym planie.',
    completionTitle: 'Pokaż wynik w Community',
    completionBody: 'Udana receptura? Udostępnij ją w Community.',
    privacyNote: 'Dokładne gramatury pozostają chronione zgodnie z Twoim planem.',
    creatorInviteTitle: 'Chcesz opublikować w Community?',
    creatorInviteBody:
      'Utworzenie profilu twórcy zajmuje chwilę. Potem wrócisz tutaj, aby dokończyć publikację.',
    createCreatorProfile: 'Utwórz profil',
    titleLabel: 'Title',
    descriptionLabel: 'Opis',
    categoryLabel: 'Category',
    slugLabel: 'Public address',
    imageLabel: 'Photo',
    imageRequired: 'Choose a recipe photo.',
    ownPhotoRequired: 'To publish in Community, add your own photo of the finished ice cream.',
    ownPhotoLaterSaved: 'You can do it later — your recipe stays saved.',
    publishLater: "I'll publish later",
    needsCreatorProfile: 'Najpierw utwórz profil twórcy.',
    published: 'Published',
  },
  creator: {
    claimTitle: 'Profil twórcy',
    handleLabel: 'Handle',
    displayNameLabel: 'Display name',
    bioLabel: 'O programie',
    countryLabel: 'Country',
    cityLabel: 'City',
    makePublic: 'Profil publiczny',
    handleTaken: 'Ta nazwa jest już zajęta.',
    handleReserved: 'Ta nazwa jest zarezerwowana.',
    handleInvalid: 'Tylko litery, cyfry, „-” i „_”.',
    handleTooShort: 'At least 3 characters.',
    handleTooLong: 'At most 30 characters.',
    verified: 'Verified',
    official: 'Official',
  },
  partner: {
    dashboardTitle: 'Gellatti Partner',
    notAPartner: 'Nie masz jeszcze statusu Gellatti Partner.',
    notActive: 'Twój status Gellatti Partner nie jest aktywny.',
    eligibilityNote:
      'Prowizja dotyczy wyłącznie subskrypcji pozyskanych podczas aktywnego statusu Gellatti Partner. Popularność i udostępnienia receptur nie tworzą prawa do prowizji, a prowizje nie działają wstecz.',
    pending: 'Pending',
    approved: 'Zatwierdzone',
    paid: 'Paid',
    reversed: 'Reversed',
    attributedSubscriptions: 'Attributed subscriptions',
    separateFromCreator: 'Creator statistics live in their own section.',
  },
  empty: {
    community: 'W Community nie ma jeszcze receptur.',
    top100: 'Ranking pojawi się, gdy zaczną powstawać receptury.',
    received: 'Nikt nie udostępnił Ci jeszcze receptury.',
    sent: 'Nie udostępniłeś jeszcze żadnej receptury.',
    creatorRecipes: 'Ten twórca nie ma jeszcze publicznych receptur.',
    firstCreator: 'Opublikuj pierwszą recepturę i utwórz profil twórcy Gellatti.',
  },
};

export type CommunityLanguage = 'pl' | 'en';

export const resolveCommunityCopy = (language: CommunityLanguage = 'pl'): CommunityCopy =>
  language === 'en' ? communityCopyEn : communityCopyPl;

/** The default the UI imports today. */
export const communityCopy: CommunityCopy = communityCopyPl;
