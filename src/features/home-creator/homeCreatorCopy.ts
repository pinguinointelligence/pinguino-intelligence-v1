/**
 * GELLATTI HOME CREATOR — copy (§17, §102).
 *
 * Follows the established `CommunityCopy` pattern exactly: one `interface` is the key
 * contract, one COMPLETE object per locale implements it, and a resolver picks one.
 * A source test asserts identical key sets, so an untranslated key fails the build
 * instead of leaking an English word onto a Polish screen.
 *
 * §102: no raw contract value is translated here. Profiles, roles, statuses and
 * machine identities stay byte-exact and reach the screen through display maps.
 * Polish is the reference locale (`src/copy/locale.ts`) and is what staging serves.
 */
import { REFERENCE_LOCALE, resolveLocaleResource, type AppLocale } from '@/copy/locale';
import { officialRecipeCopy } from '@/copy/officialRecipeLibrary';

/** The library's own Polish plural („1 receptura · 3 receptury · 76 receptur”). */
const officialRecipeCountPl = officialRecipeCopy.recipeCount;

export interface HomeCreatorCopy {
  readonly switch: {
    readonly home: string;
    readonly pro: string;
    readonly ariaLabel: string;
  };
  readonly intent: {
    readonly headline: string;
    readonly question: string;
    readonly placeholder: string;
    readonly inputLabel: string;
    readonly addByVoice: string;
    readonly addByScan: string;
    /** §30 — AI Vision v1 recognises FRUIT and says so; it promises nothing else. */
    readonly addByVision: string;
    readonly sendIdea: string;
    /** §27 — desktop tooltips for the four controls that live inside the field. */
    readonly voiceTooltip: string;
    readonly scanTooltip: string;
    readonly visionTooltip: string;
    readonly sendTooltip: string;
    readonly listening: string;
    readonly voiceUnavailable: string;
    readonly chipsLabel: string;
    /** What the composer asks once at least one idea chip exists (OWNER FROZEN). */
    readonly anythingElse: string;
    readonly removeChip: string;
    readonly cta: string;
    readonly emptyHint: string;
    readonly resolving: string;
  };
  /** §30–§31 — the full-screen fruit camera. Fruit only, and it says so. */
  readonly vision: {
    readonly prompt: string;
    readonly thinking: string;
    readonly unsure: string;
    readonly cameraUnavailable: string;
    readonly shutter: string;
    readonly close: string;
    readonly switchCamera: string;
  };
  readonly identity: {
    readonly whichProduct: string;
    readonly whichProductHint: string;
    readonly searchIngredient: string;
    readonly whatIsThis: string;
    readonly notFound: string;
  };
  /**
   * DESIGN V3.0 VI/IX: where a HOME recipe starts — two modes, the customer's idea or the
   * recipes. Community is one of the collections inside „Receptury”, not a third mode.
   */
  readonly sources: {
    readonly label: string;
    readonly own: string;
    readonly library: string;
  };
  /** DESIGN V3.0 IX — „Receptury”: collections, their carousels and the flavour search. */
  readonly library: {
    readonly collectionsLabel: string;
    readonly backToCollections: string;
    readonly backToCollectionsLabel: string;
    readonly searchPlaceholder: string;
    readonly searchLabel: string;
    readonly clearSearch: string;
    readonly resultsTitle: string;
    /** „truskawka · 5 receptur · 1 z Community”. */
    readonly resultsSummary: (word: string, officialCount: number, community: boolean) => string;
    readonly searching: string;
    readonly searchUnavailable: string;
    readonly noneTitle: string;
    readonly noneBody: (word: string) => string;
    readonly noneAction: string;
    readonly recipeCount: (count: number) => string;
    readonly communityName: string;
    readonly communityTileLine: string;
    readonly communityLine: string;
    readonly communityLoading: string;
    readonly communityEmpty: string;
    readonly communityUnavailable: string;
    readonly carouselLabel: (name: string) => string;
    readonly resultsCarouselLabel: (word: string) => string;
    /** Shown above „Rozpocznij recepturę” once a card is chosen. */
    readonly chosen: string;
  };
  readonly match: {
    readonly title: string;
    readonly subtitle: string;
    readonly continueCreating: string;
    readonly useThis: string;
    readonly close: string;
    readonly couldNotOpen: string;
    readonly gellattiSection: string;
    readonly communitySection: string;
    readonly alsoIncludes: string;
    readonly rank: string;
    readonly createMyOwn: string;
    readonly createMyOwnHint: string;
    readonly adopted: string;
    readonly basedOnOriginal: string;
    /** The form of the same flavour this suggestion uses („Puree truskawkowe”). */
    readonly usedForm: string;
    /** Card tail when the extra ingredients do not fit the short line. */
    readonly alsoIncludesMore: (count: number) => string;
    /** Said on a Community card when the search was bounded — it is a match, not THE match. */
    readonly searchIncomplete: string;
    readonly viewOriginal: string;
    readonly byGellatti: string;
    /** DESIGN V3.0 VIII — the suggestions layer shown while the idea is recognised. */
    readonly suggestionsTitle: string;
    readonly suggestionsSubtitle: string;
    readonly suggestionsCarousel: (idea: string) => string;
    readonly createOwnShort: string;
    readonly skip: string;
    readonly choose: string;
    readonly chooseFirst: string;
    readonly communityEyebrow: string;
    readonly rankShort: (rank: number) => string;
    readonly previousCards: string;
    readonly nextCards: string;
  };
  readonly profile: {
    readonly question: string;
    readonly gelato: string;
    readonly sorbet: string;
    readonly protein: string;
    readonly vegan: string;
    readonly gelatoHint: string;
    readonly sorbetHint: string;
    readonly proteinHint: string;
    readonly veganHint: string;
  };
  readonly machine: {
    readonly question: string;
    readonly savedLabel: string;
    readonly change: string;
    readonly otherMachine: string;
    readonly otherMachineHint: string;
    readonly capacityQuestion: string;
    readonly containers: string;
    readonly container: string;
    readonly amount: string;
    readonly amountManual: string;
    /** Applies the typed exact amount — NOT the stage's „Gotowe” (served flow walk 2026-09-18:
     * two „Gotowe” buttons one under the other). */
    readonly amountManualApply: string;
    readonly capacityGuidance: string;
    readonly done: string;
  };
  readonly recipe: {
    readonly nameLabel: string;
    readonly namePlaceholder: string;
    readonly score: string;
    readonly crown: string;
    readonly topping: string;
    readonly addIngredient: string;
    readonly addTopping: string;
    readonly anythingElse: string;
    readonly rowMenu: string;
    readonly remove: string;
    /** HOME row actions. Replacement is an explicit manual-selection workflow. */
    readonly changeAmount: string;
    readonly unlockLabel: string;
    readonly removeIngredient: string;
    readonly doneAmount: string;
    readonly findSubstitute: string;
    readonly dontHaveThis: string;
    readonly howToUse: string;
    readonly asIngredient: string;
    readonly asTopping: string;
    readonly save: string;
    readonly saved: string;
    readonly shareWithCommunity: string;
    readonly letsMakeIt: string;
    readonly recalculate: string;
    /** Opens the best safe correction CORE staged for the customer's consent. */
    readonly seeProposal: string;
    /** The first build left a question in the review dialog and the customer closed it. */
    readonly firstBuildNotApplied: string;
    /** The automatic recalculation left a question and the customer closed it. */
    readonly changesNotRecalculated: string;
    readonly maskedGrams: string;
    readonly maskedGramsLabel: string;
    /** What HOME says when product authority cannot be confirmed (OWNER FROZEN). */
    readonly unresolvedProduct: string;
    /** The mask WITHOUT a unit — the gram control appends its own suffix. */
    readonly maskedGramsValue: string;
    readonly askAmountTitle: string;
    readonly askAmountConfirm: string;
    readonly askAmountCancel: string;
    readonly askAmountInvalid: string;
    readonly askAmountRecommended: string;
    readonly gramsFieldLabel: string;
    readonly lockLabel: string;
    readonly grams: string;
  };
  /**
   * OWNER BUGFIX 2026-09-11 (#287): „Przelicz i popraw" that changes nothing still explains
   * itself — never a card with only „Wróć". The reason itself comes from the canonical
   * message sources (`homeRecalcRefusal`); these are the HOME-only parts.
   */
  readonly recalcRefusal: {
    /** Only when the result carries no reason at all. */
    readonly fallback: string;
    /** The next step every refusal offers (fail-closed: the recipe was not written). */
    readonly next: string;
    /** Leads the HOME trait words a safe recipe could not be moved closer to. */
    readonly notImproved: string;
    /**
     * CORE's Main authority refused the priority group itself: the approved amounts of
     * these products exclude each other in one Base (served 2026-09-18: strawberries +
     * kiwi in a dairy gelato). Names come from the recipe lines the refusal lists.
     */
    readonly priorityGroupExcludes: (names: readonly string[]) => string;
    /** The next step for that refusal — the only change that helps. */
    readonly priorityGroupNext: string;
  };
  readonly sweetness: {
    readonly label: string;
    readonly less: string;
    readonly balanced: string;
    readonly sweeter: string;
  };
  /**
   * DESIGN V3.0 — the HOME recipe screen (corrections IV, VI, XI, XII, XIII): the header
   * with Reset, the name panel, the rows, the ingredient panel, the sweetness layer and
   * the bottom actions. Words only; every action behind them is an existing HOME door.
   */
  readonly recipeScreen: {
    readonly reset: string;
    readonly resetTitle: string;
    readonly resetBody: string;
    readonly resetConfirm: string;
    readonly resetKeep: string;
    readonly nameEdit: string;
    readonly nameTitle: string;
    readonly nameHint: string;
    readonly nameCancel: string;
    readonly nameDone: string;
    readonly openRow: string;
    readonly lockedAmount: string;
    readonly enterAmount: string;
    readonly amountCta: string;
    readonly inProduction: string;
    readonly backToProduction: string;
    readonly addIngredientShort: string;
    readonly addToppingShort: string;
    readonly addIngredientSubtitle: string;
    readonly addToppingSubtitle: string;
    readonly save: string;
    readonly share: string;
    readonly community: string;
    readonly panelLabel: string;
    readonly tagIngredient: string;
    readonly tagTopping: string;
    readonly info: string;
    readonly category: string;
    readonly fullData: string;
    readonly fullDataProcess: string;
    readonly sweetnessDefault: string;
    readonly sweetnessFrame: string;
    readonly sweetnessStepLess: string;
    readonly sweetnessStepBalanced: string;
    readonly sweetnessStepSweeter: string;
    readonly sweetnessDone: string;
  };
  readonly preparation: {
    readonly title: string;
    readonly addedTooMuch: string;
    readonly scaleQuestion: string;
    readonly toppingStage: string;
    readonly done: string;
  };
  readonly draft: {
    readonly continueTitle: string;
    readonly continueCta: string;
    readonly newIdea: string;
    readonly replaceTitle: string;
    readonly replaceBody: string;
    readonly cancel: string;
    readonly startNew: string;
  };
  readonly paywall: {
    readonly title: string;
    readonly body: string;
    readonly choosePlan: string;
    readonly homePlan: string;
    readonly proPlan: string;
    readonly proOnlyTitle: string;
    readonly proOnlyBody: string;
    readonly signIn: string;
  };
  readonly nav: {
    readonly back: string;
    readonly signIn: string;
    readonly account: string;
  };
  readonly account: {
    readonly defaultExperienceLabel: string;
    readonly defaultExperienceHint: string;
    readonly defaultExperiencePro: string;
    readonly defaultExperienceHome: string;
  };
}

const homeCreatorCopyPl: HomeCreatorCopy = {
  switch: { home: 'HOME', pro: 'PRO', ariaLabel: 'Wybór widoku: HOME albo PRO' },
  intent: {
    headline: 'Stwórz własne lody. Jak profesjonalista.',
    question: 'Jakie lody dziś robimy?',
    placeholder: 'Wpisz składnik lub smak…',
    inputLabel: 'Opisz swój pomysł na lody',
    addByVoice: 'Powiedz',
    addByScan: 'Zeskanuj',
    addByVision: 'Rozpoznaj owoc',
    sendIdea: 'Dodaj',
    voiceTooltip: 'Powiedz, co chcesz zrobić',
    scanTooltip: 'Zeskanuj produkt',
    visionTooltip: 'Rozpoznaj owoc ze zdjęcia',
    sendTooltip: 'Dodaj',
    listening: 'Słucham…',
    voiceUnavailable: 'Ta przeglądarka nie obsługuje mowy. Napisz albo zeskanuj.',
    chipsLabel: 'Twój pomysł',
    anythingElse: 'Coś jeszcze dodajemy?',
    removeChip: 'Usuń',
    cta: 'Rozpocznij recepturę',
    emptyHint: 'Dodaj przynajmniej jeden składnik albo smak.',
    resolving: 'Sprawdzam produkty…',
  },
  vision: {
    prompt: 'Zrób zdjęcie owocu, który chcesz dodać',
    thinking: 'Sprawdzam, co to za owoc…',
    unsure: 'Nie udało się pewnie rozpoznać owocu. Spróbuj ponownie.',
    cameraUnavailable: 'Nie mamy dostępu do aparatu. Sprawdź uprawnienia w przeglądarce.',
    shutter: 'Zrób zdjęcie',
    close: 'Zamknij',
    switchCamera: 'Przełącz aparat',
  },
  identity: {
    whichProduct: 'Który to produkt?',
    whichProductHint: 'Wybierz ten, którego naprawdę użyjesz.',
    searchIngredient: 'Szukaj składnika',
    whatIsThis: 'Co to jest?',
    notFound: 'Nie rozpoznaję tego jeszcze.',
  },
  sources: {
    label: 'Od czego zaczynasz',
    own: 'Twój pomysł',
    library: 'Receptury',
  },
  library: {
    collectionsLabel: 'Kolekcje',
    backToCollections: 'Kolekcje',
    backToCollectionsLabel: 'Wszystkie kolekcje',
    searchPlaceholder: 'Smak lub składnik, np. truskawka',
    searchLabel: 'Szukaj receptur po smaku lub składniku',
    clearSearch: 'Wyczyść',
    resultsTitle: 'Zobacz, co możesz zrobić',
    resultsSummary: (word, officialCount, community) =>
      [word, officialRecipeCountPl(officialCount), community ? '1 z Community' : null]
        .filter(Boolean)
        .join(' · '),
    searching: 'Szukam receptur…',
    searchUnavailable: 'Nie udało się teraz sprawdzić receptur. Spróbuj ponownie za chwilę.',
    noneTitle: 'Nie mamy jeszcze takich receptur.',
    noneBody: (word) => `Zacznij od własnego pomysłu z „${word}”.`,
    noneAction: 'Twój pomysł',
    recipeCount: (count) => officialRecipeCountPl(count),
    communityName: 'Community',
    communityTileLine: 'Od społeczności',
    communityLine: 'Top 100',
    communityLoading: 'Wczytuję Community…',
    communityEmpty: 'W Community nie ma jeszcze receptur.',
    communityUnavailable: 'Nie udało się teraz wczytać Community.',
    carouselLabel: (name) => `Receptury · ${name}`,
    resultsCarouselLabel: (word) => `Receptury: ${word}`,
    chosen: 'Wybrana:',
  },
  match: {
    title: 'Znaleźliśmy podobne receptury',
    subtitle: 'Możesz zacząć od jednej z nich albo tworzyć dalej po swojemu.',
    continueCreating: 'Tworzę własną recepturę',
    useThis: 'Zobacz tę recepturę',
    close: 'Zamknij',
    couldNotOpen: 'Nie udało się otworzyć tej receptury. Możesz tworzyć dalej po swojemu.',
    gellattiSection: 'Receptury Gellatti',
    communitySection: 'Z Community',
    alsoIncludes: 'Zawiera też:',
    rank: 'Miejsce',
    createMyOwn: 'Stwórz własną',
    createMyOwnHint: 'Zaczniesz od zera — będziesz autorem oryginału.',
    adopted: 'Wybrano recepturę',
    basedOnOriginal: 'Na podstawie oryginalnej receptury:',
    usedForm: 'Używa postaci:',
    alsoIncludesMore: (count: number) => `+${count} więcej`,
    searchIncomplete: 'Mogą pasować też inne receptury.',
    viewOriginal: 'Zobacz oryginał',
    byGellatti: 'Gellatti',
    suggestionsTitle: 'Znaleźliśmy pasujące receptury.',
    suggestionsSubtitle: 'Chcesz z którejś skorzystać?',
    suggestionsCarousel: (idea) => `Receptury do „${idea}”`,
    createOwnShort: 'Tworzę swoją',
    skip: 'Pomiń',
    choose: 'Wybierz',
    chooseFirst: 'Najpierw wybierz recepturę.',
    communityEyebrow: 'Community · Top 100',
    rankShort: (rank) => `miejsce ${rank}`,
    previousCards: 'Poprzednie receptury',
    nextCards: 'Następne receptury',
  },
  profile: {
    question: 'Jak chcesz je zrobić?',
    gelato: 'Gelato',
    sorbet: 'Sorbet',
    protein: 'Proteinowe',
    vegan: 'Wegańskie',
    gelatoHint: 'Kremowe, na mleku.',
    sorbetHint: 'Owocowe, bez mleka.',
    proteinHint: 'Z dodatkiem białka.',
    veganHint: 'Całkowicie roślinne.',
  },
  machine: {
    question: 'Wybierz swoją maszynę',
    savedLabel: 'Twoja maszyna',
    change: 'Zmień',
    otherMachine: 'Inna maszyna',
    otherMachineHint: 'Podasz tylko pojemność.',
    capacityQuestion: 'Ile mieści Twój pojemnik?',
    containers: 'pojemniki',
    container: 'pojemnik',
    amount: 'Ilość',
    amountManual: 'Wpisz dokładną ilość',
    amountManualApply: 'Ustaw',
    capacityGuidance: 'To wystarczy na',
    done: 'Gotowe',
  },
  recipe: {
    nameLabel: 'Nazwa receptury',
    namePlaceholder: 'Nazwij swoje lody',
    score: 'Ocena',
    crown: 'Główny',
    topping: 'Topping',
    addIngredient: 'Dodaj składnik',
    addTopping: 'Dodaj topping',
    anythingElse: 'Chcesz dodać coś jeszcze?',
    rowMenu: 'Więcej',
    remove: 'Usuń',
    changeAmount: 'Zmień ilość',
    unlockLabel: 'Odblokuj ilość',
    removeIngredient: 'Usuń składnik',
    doneAmount: 'Gotowe',
    findSubstitute: 'Zamień produkt',
    dontHaveThis: 'Nie mam tego składnika',
    howToUse: 'Jak chcesz tego użyć?',
    asIngredient: 'Jako składnik',
    asTopping: 'Jako topping',
    save: 'Zapisz recepturę',
    saved: 'Zapisano',
    shareWithCommunity: 'Pokaż w Community',
    // DESIGN V3.0 (decision 1): „Zaczynamy” replaces „Zróbmy to” on the HOME recipe screen.
    letsMakeIt: 'Zaczynamy',
    recalculate: 'Przelicz i popraw',
    seeProposal: 'Zobacz propozycję',
    firstBuildNotApplied:
      'Receptura nie została jeszcze przygotowana. Naciśnij „Zamień pomysł w recepturę”, aby wrócić do propozycji.',
    changesNotRecalculated:
      'Ostatnie zmiany nie są jeszcze przeliczone — pozostałe ilości nie zostały do nich dopasowane.',
    maskedGrams: '••• g',
    maskedGramsLabel: 'Gramatura ukryta — dostępna w planie HOME lub PRO',
    unresolvedProduct: 'Nie możemy teraz potwierdzić danych jednego ze składników.',
    maskedGramsValue: '•••',
    askAmountTitle: 'Ile chcesz dodać',
    askAmountConfirm: 'Dodaj',
    askAmountCancel: 'Usuń',
    askAmountInvalid: 'Podaj ilość większą od zera.',
    askAmountRecommended: 'Zalecane dawkowanie producenta',
    gramsFieldLabel: 'ilość w g',
    lockLabel: 'Zablokuj ilość',
    grams: 'g',
  },
  recalcRefusal: {
    fallback: 'Nie udało się teraz przygotować propozycji.',
    next: 'Twoja receptura się nie zmieniła. Możesz zmienić składniki lub ich ilości i przeliczyć ponownie.',
    notImproved: 'Nie udało się bezpiecznie poprawić:',
    priorityGroupExcludes: (names) =>
      `${names.join(' i ')} nie zmieszczą się razem w tej recepturze — zatwierdzone ilości tych składników wykluczają się nawzajem.`,
    priorityGroupNext:
      'Twoja receptura się nie zmieniła. Usuń jeden z tych składników albo wybierz inny.',
  },
  sweetness: {
    label: 'Słodycz',
    less: 'Mniej słodkie',
    balanced: 'W sam raz',
    sweeter: 'Słodsze',
  },
  recipeScreen: {
    reset: 'Reset',
    resetTitle: 'Reset receptury?',
    resetBody:
      'Twój pomysł i niezapisane zmiany w recepturze zostaną usunięte. Zapisane receptury i Community zostają bez zmian.',
    resetConfirm: 'Reset',
    resetKeep: 'Wróć',
    nameEdit: 'Nazwa receptury — wpisz lub zmień',
    nameTitle: 'Nazwa receptury',
    nameHint: 'Nazwa zostaje w tej pracy.',
    nameCancel: 'Anuluj',
    nameDone: 'Gotowe',
    openRow: 'otwórz panel składnika',
    lockedAmount: 'ilość zablokowana',
    enterAmount: 'Wpisz ilość',
    amountCta: 'Ilość',
    inProduction: 'Ta partia jest w produkcji — składniki są zablokowane.',
    backToProduction: 'Wróć do produkcji',
    addIngredientShort: 'Składnik',
    addToppingShort: 'Topping',
    addIngredientSubtitle: 'Do bazy lodowej',
    addToppingSubtitle: 'Po produkcji · nie zmienia bilansu bazy',
    save: 'Zapisz',
    share: 'Udostępnij',
    community: 'Community',
    panelLabel: 'Edycja składnika',
    tagIngredient: 'Składnik',
    tagTopping: 'Topping',
    info: 'Dane składnika',
    category: 'Kategoria',
    fullData: 'Pełne dane składnika',
    fullDataProcess: 'Obróbka',
    sweetnessDefault: 'Domyślnie: Optymalne',
    sweetnessFrame: 'Dostosuj recepturę',
    sweetnessStepLess: '−1',
    sweetnessStepBalanced: 'Optymalne',
    sweetnessStepSweeter: '+1',
    sweetnessDone: 'Gotowe',
  },
  preparation: {
    title: 'Robimy lody',
    addedTooMuch: 'Wsypałem za dużo',
    scaleQuestion: 'Ile pokazuje teraz waga?',
    toppingStage: 'Na koniec dodaj topping.',
    done: 'Gotowe!',
  },
  draft: {
    continueTitle: 'Dokończ swoją recepturę',
    continueCta: 'Kontynuuj',
    newIdea: 'Nowy pomysł',
    replaceTitle: 'Zacząć nową recepturę?',
    replaceBody: 'Twoja obecna robocza receptura zostanie zastąpiona.',
    cancel: 'Anuluj',
    startNew: 'Zacznij nową',
  },
  paywall: {
    title: 'Odblokuj pełną recepturę',
    body: 'Zobacz dokładne gramatury, zapisuj receptury i rób lody krok po kroku.',
    choosePlan: 'Wybierz plan',
    homePlan: 'HOME',
    proPlan: 'PRO',
    proOnlyTitle: 'To jest funkcja PRO',
    proOnlyBody: 'Ta część Gellatti jest dostępna w planie PRO.',
    signIn: 'Mam już konto',
  },
  nav: { back: 'Wróć', signIn: 'Zaloguj się', account: 'Konto' },
  account: {
    defaultExperienceLabel: 'Widok po zalogowaniu',
    defaultExperienceHint: 'Od którego widoku zaczynasz pracę.',
    defaultExperiencePro: 'PRO',
    defaultExperienceHome: 'HOME',
  },
};

const homeCreatorCopyEn: HomeCreatorCopy = {
  switch: { home: 'HOME', pro: 'PRO', ariaLabel: 'View selection: HOME or PRO' },
  intent: {
    headline: 'Create your own ice cream recipe. Like a pro.',
    question: 'What flavour are we making today?',
    placeholder: 'Type an ingredient or a flavour…',
    inputLabel: 'Describe your ice cream idea',
    addByVoice: 'Speak',
    addByScan: 'Scan',
    addByVision: 'Recognise fruit',
    sendIdea: 'Add',
    voiceTooltip: 'Say what you want to make',
    scanTooltip: 'Scan a product',
    visionTooltip: 'Recognise fruit from a photo',
    sendTooltip: 'Add',
    listening: 'Listening…',
    voiceUnavailable: 'This browser has no speech input. Type or scan instead.',
    chipsLabel: 'Your idea',
    anythingElse: 'Anything else to add?',
    removeChip: 'Remove',
    cta: 'Start the recipe',
    emptyHint: 'Add at least one ingredient or flavour.',
    resolving: 'Checking products…',
  },
  vision: {
    prompt: 'Take a photo of the fruit you want to add',
    thinking: 'Checking which fruit this is…',
    unsure: "We couldn't recognise the fruit with confidence. Please try again.",
    cameraUnavailable: 'We have no access to the camera. Check your browser permissions.',
    shutter: 'Take a photo',
    close: 'Close',
    switchCamera: 'Switch camera',
  },
  identity: {
    whichProduct: 'Which product is it?',
    whichProductHint: 'Pick the one you will actually use.',
    searchIngredient: 'Search ingredient',
    whatIsThis: 'What is this?',
    notFound: "I don't recognise this yet.",
  },
  sources: {
    label: 'Where you start',
    own: 'Your idea',
    library: 'Recipes',
  },
  library: {
    collectionsLabel: 'Collections',
    backToCollections: 'Collections',
    backToCollectionsLabel: 'All collections',
    searchPlaceholder: 'A flavour or ingredient, e.g. strawberry',
    searchLabel: 'Search recipes by flavour or ingredient',
    clearSearch: 'Clear',
    resultsTitle: 'See what you can make',
    resultsSummary: (word, officialCount, community) =>
      [
        word,
        `${officialCount} ${officialCount === 1 ? 'recipe' : 'recipes'}`,
        community ? '1 from Community' : null,
      ]
        .filter(Boolean)
        .join(' · '),
    searching: 'Looking for recipes…',
    searchUnavailable: "We couldn't check the recipes right now. Please try again in a moment.",
    noneTitle: "We don't have recipes like that yet.",
    noneBody: (word) => `Start from your own idea with “${word}”.`,
    noneAction: 'Your idea',
    recipeCount: (count) => `${count} ${count === 1 ? 'recipe' : 'recipes'}`,
    communityName: 'Community',
    communityTileLine: 'From the community',
    communityLine: 'Top 100',
    communityLoading: 'Loading Community…',
    communityEmpty: 'There are no Community recipes yet.',
    communityUnavailable: "We couldn't load Community right now.",
    carouselLabel: (name) => `Recipes · ${name}`,
    resultsCarouselLabel: (word) => `Recipes: ${word}`,
    chosen: 'Chosen:',
  },
  match: {
    title: 'We found similar recipes',
    subtitle: 'You can start from one of these, or keep creating your own.',
    continueCreating: 'Create my own recipe',
    useThis: 'See this recipe',
    close: 'Close',
    couldNotOpen: "We couldn't open that recipe. You can keep creating your own.",
    gellattiSection: 'Gellatti recipes',
    communitySection: 'From Community',
    alsoIncludes: 'Also includes:',
    rank: 'Rank',
    createMyOwn: 'Create my own',
    createMyOwnHint: "You'll start from scratch — and be the original author.",
    adopted: 'Recipe selected',
    basedOnOriginal: 'Based on original recipe by',
    usedForm: 'Uses the form:',
    alsoIncludesMore: (count: number) => `+${count} more`,
    searchIncomplete: 'Other recipes may match too.',
    viewOriginal: 'View original',
    byGellatti: 'Gellatti',
    suggestionsTitle: 'We found matching recipes.',
    suggestionsSubtitle: 'Would you like to use one of them?',
    suggestionsCarousel: (idea) => `Recipes for “${idea}”`,
    createOwnShort: 'I’ll make my own',
    skip: 'Skip',
    choose: 'Choose',
    chooseFirst: 'Choose a recipe first.',
    communityEyebrow: 'Community · Top 100',
    rankShort: (rank) => `rank ${rank}`,
    previousCards: 'Previous recipes',
    nextCards: 'Next recipes',
  },
  profile: {
    question: 'How do you want to make it?',
    gelato: 'Gelato',
    sorbet: 'Sorbet',
    protein: 'Protein',
    vegan: 'Vegan',
    gelatoHint: 'Creamy, milk based.',
    sorbetHint: 'Fruity, no milk.',
    proteinHint: 'With added protein.',
    veganHint: 'Fully plant based.',
  },
  machine: {
    question: 'Choose your machine',
    savedLabel: 'Your machine',
    change: 'Change',
    otherMachine: 'Other machine',
    otherMachineHint: "You'll only give the capacity.",
    capacityQuestion: 'How much does your container hold?',
    containers: 'containers',
    container: 'container',
    amount: 'Amount',
    amountManual: 'Enter an exact amount',
    amountManualApply: 'Set',
    capacityGuidance: 'That is enough for',
    done: 'Done',
  },
  recipe: {
    nameLabel: 'Recipe name',
    namePlaceholder: 'Name your ice cream',
    score: 'Score',
    crown: 'Main',
    topping: 'Topping',
    addIngredient: 'Add ingredient',
    addTopping: 'Add topping',
    anythingElse: 'Want to add anything else?',
    rowMenu: 'More',
    remove: 'Remove',
    changeAmount: 'Change amount',
    unlockLabel: 'Unlock the amount',
    removeIngredient: 'Remove ingredient',
    doneAmount: 'Done',
    findSubstitute: 'Replace product',
    dontHaveThis: "I don't have this ingredient",
    howToUse: 'How do you want to use it?',
    asIngredient: 'Ingredient',
    asTopping: 'Topping',
    save: 'Save recipe',
    saved: 'Saved',
    shareWithCommunity: 'Share with Community',
    letsMakeIt: "Let's start",
    recalculate: 'Recalculate and fix',
    seeProposal: 'See the proposal',
    firstBuildNotApplied:
      'The recipe has not been prepared yet. Press “Turn the idea into a recipe” to return to the proposal.',
    changesNotRecalculated:
      'Your latest changes are not recalculated yet — the other amounts have not been adjusted to them.',
    maskedGrams: '••• g',
    maskedGramsLabel: 'Amount hidden — available on the HOME or PRO plan',
    unresolvedProduct: "We can't confirm one of the ingredients right now.",
    maskedGramsValue: '•••',
    askAmountTitle: 'How much do you want to add',
    askAmountConfirm: 'Add',
    askAmountCancel: 'Remove',
    askAmountInvalid: 'Enter an amount greater than zero.',
    askAmountRecommended: "Manufacturer's recommended dose",
    gramsFieldLabel: 'amount in g',
    lockLabel: 'Lock the amount',
    grams: 'g',
  },
  recalcRefusal: {
    fallback: "We couldn't prepare a proposal right now.",
    next: "Your recipe hasn't changed. You can change the ingredients or their amounts and recalculate.",
    notImproved: 'Could not be improved safely:',
    priorityGroupExcludes: (names) =>
      `${names.join(' and ')} can't go together in this recipe — their approved amounts rule each other out.`,
    priorityGroupNext:
      "Your recipe hasn't changed. Remove one of these ingredients or choose another one.",
  },
  sweetness: {
    label: 'Sweetness',
    less: 'Less sweet',
    balanced: 'Balanced',
    sweeter: 'Sweeter',
  },
  recipeScreen: {
    reset: 'Reset',
    resetTitle: 'Reset the recipe?',
    resetBody:
      'Your idea and the unsaved changes in the recipe will be removed. Saved recipes and Community stay as they are.',
    resetConfirm: 'Reset',
    resetKeep: 'Back',
    nameEdit: 'Recipe name — type or change',
    nameTitle: 'Recipe name',
    nameHint: 'The name stays with this work.',
    nameCancel: 'Cancel',
    nameDone: 'Done',
    openRow: 'open the ingredient panel',
    lockedAmount: 'amount locked',
    enterAmount: 'Enter the amount',
    amountCta: 'Amount',
    inProduction: 'This batch is in production — the ingredients are locked.',
    backToProduction: 'Back to production',
    addIngredientShort: 'Ingredient',
    addToppingShort: 'Topping',
    addIngredientSubtitle: 'Into the ice cream base',
    addToppingSubtitle: 'After production · does not change the base balance',
    save: 'Save',
    share: 'Share',
    community: 'Community',
    panelLabel: 'Ingredient editing',
    tagIngredient: 'Ingredient',
    tagTopping: 'Topping',
    info: 'Ingredient data',
    category: 'Category',
    fullData: 'Full ingredient data',
    fullDataProcess: 'Processing',
    sweetnessDefault: 'Default: Optimal',
    sweetnessFrame: 'Adjust the recipe',
    sweetnessStepLess: '−1',
    sweetnessStepBalanced: 'Optimal',
    sweetnessStepSweeter: '+1',
    sweetnessDone: 'Done',
  },
  preparation: {
    title: "Let's make it",
    addedTooMuch: 'I added too much',
    scaleQuestion: 'How much does the scale show now?',
    toppingStage: 'Add your topping at the end.',
    done: 'Done!',
  },
  draft: {
    continueTitle: 'Continue your recipe',
    continueCta: 'Continue',
    newIdea: 'New idea',
    replaceTitle: 'Start a new recipe?',
    replaceBody: 'Your current draft will be replaced.',
    cancel: 'Cancel',
    startNew: 'Start new',
  },
  paywall: {
    title: 'Unlock the full recipe',
    body: 'See exact amounts, save recipes and make them step by step.',
    choosePlan: 'Choose a plan',
    homePlan: 'HOME',
    proPlan: 'PRO',
    proOnlyTitle: 'This is a PRO feature',
    proOnlyBody: 'This part of Gellatti is available on the PRO plan.',
    signIn: 'I already have an account',
  },
  nav: { back: 'Back', signIn: 'Sign in', account: 'Account' },
  account: {
    defaultExperienceLabel: 'Experience after login',
    defaultExperienceHint: 'Which view you start in.',
    defaultExperiencePro: 'PRO',
    defaultExperienceHome: 'HOME',
  },
};

export const HOME_CREATOR_COPY_BY_LOCALE: Readonly<Record<'pl' | 'en', HomeCreatorCopy>> =
  Object.freeze({ pl: homeCreatorCopyPl, en: homeCreatorCopyEn });

export const resolveHomeCreatorCopy = (locale: AppLocale = REFERENCE_LOCALE): HomeCreatorCopy =>
  resolveLocaleResource({ pl: homeCreatorCopyPl }, locale);

/** The default the UI imports today — Polish, the served reference locale. */
export const homeCreatorCopy: HomeCreatorCopy = homeCreatorCopyPl;
