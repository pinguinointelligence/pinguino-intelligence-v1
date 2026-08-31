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
    readonly listening: string;
    readonly voiceUnavailable: string;
    readonly chipsLabel: string;
    readonly removeChip: string;
    readonly cta: string;
    readonly emptyHint: string;
    readonly resolving: string;
  };
  readonly identity: {
    readonly whichProduct: string;
    readonly whichProductHint: string;
    readonly searchIngredient: string;
    readonly whatIsThis: string;
    readonly notFound: string;
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
    readonly viewOriginal: string;
    readonly byGellatti: string;
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
    readonly maskedGrams: string;
    readonly maskedGramsLabel: string;
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
  readonly sweetness: {
    readonly label: string;
    readonly less: string;
    readonly balanced: string;
    readonly sweeter: string;
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
    question: 'Jakie lody robimy dzisiaj?',
    placeholder: 'Napisz, co chcesz zrobić…',
    inputLabel: 'Opisz swój pomysł na lody',
    addByVoice: 'Powiedz',
    addByScan: 'Zeskanuj',
    listening: 'Słucham…',
    voiceUnavailable: 'Ta przeglądarka nie obsługuje mowy. Napisz albo zeskanuj.',
    chipsLabel: 'Twój pomysł',
    removeChip: 'Usuń',
    cta: 'Stwórz moją recepturę',
    emptyHint: 'Dodaj przynajmniej jeden składnik albo smak.',
    resolving: 'Sprawdzam produkty…',
  },
  identity: {
    whichProduct: 'Który to produkt?',
    whichProductHint: 'Wybierz ten, którego naprawdę użyjesz.',
    searchIngredient: 'Szukaj składnika',
    whatIsThis: 'Co to jest?',
    notFound: 'Nie rozpoznaję tego jeszcze.',
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
    viewOriginal: 'Zobacz oryginał',
    byGellatti: 'Gellatti',
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
    question: 'Na czym je zrobisz?',
    savedLabel: 'Twoja maszyna',
    change: 'Zmień',
    otherMachine: 'Inna maszyna',
    otherMachineHint: 'Podasz tylko pojemność.',
    capacityQuestion: 'Ile mieści Twój pojemnik?',
    containers: 'pojemniki',
    container: 'pojemnik',
    amount: 'Ilość',
    amountManual: 'Wpisz dokładną ilość',
    capacityGuidance: 'To wystarczy na',
    done: 'Gotowe',
  },
  recipe: {
    nameLabel: 'Nazwa receptury',
    namePlaceholder: 'Nazwij swoje lody',
    score: 'Ocena',
    crown: 'Główny',
    topping: 'Posypka',
    addIngredient: 'Dodaj składnik',
    addTopping: 'Dodaj posypkę',
    anythingElse: 'Chcesz dodać coś jeszcze?',
    rowMenu: 'Więcej',
    remove: 'Usuń',
    findSubstitute: 'Znajdź zamiennik',
    dontHaveThis: 'Nie mam tego składnika',
    howToUse: 'Jak chcesz tego użyć?',
    asIngredient: 'Jako składnik',
    asTopping: 'Jako posypka',
    save: 'Zapisz recepturę',
    saved: 'Zapisano',
    shareWithCommunity: 'Pokaż w Community',
    letsMakeIt: 'Zróbmy to',
    recalculate: 'Przelicz i popraw',
    maskedGrams: '••• g',
    maskedGramsLabel: 'Gramatura ukryta — dostępna w planie HOME lub PRO',
    maskedGramsValue: '•••',
    askAmountTitle: 'Ile chcesz dodać',
    askAmountConfirm: 'Dodaj',
    askAmountCancel: 'Anuluj',
    askAmountInvalid: 'Podaj ilość większą od zera.',
    askAmountRecommended: 'Zalecane dawkowanie producenta',
    gramsFieldLabel: 'ilość w g',
    lockLabel: 'Zablokuj ilość',
    grams: 'g',
  },
  sweetness: {
    label: 'Słodycz',
    less: 'Mniej słodkie',
    balanced: 'W sam raz',
    sweeter: 'Słodsze',
  },
  preparation: {
    title: 'Robimy lody',
    addedTooMuch: 'Wsypałem za dużo',
    scaleQuestion: 'Ile pokazuje teraz waga?',
    toppingStage: 'Na koniec dodaj posypkę.',
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
    placeholder: 'Tell us what you want to make…',
    inputLabel: 'Describe your ice cream idea',
    addByVoice: 'Speak',
    addByScan: 'Scan',
    listening: 'Listening…',
    voiceUnavailable: 'This browser has no speech input. Type or scan instead.',
    chipsLabel: 'Your idea',
    removeChip: 'Remove',
    cta: 'Create my recipe',
    emptyHint: 'Add at least one ingredient or flavour.',
    resolving: 'Checking products…',
  },
  identity: {
    whichProduct: 'Which product is it?',
    whichProductHint: 'Pick the one you will actually use.',
    searchIngredient: 'Search ingredient',
    whatIsThis: 'What is this?',
    notFound: "I don't recognise this yet.",
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
    viewOriginal: 'View original',
    byGellatti: 'Gellatti',
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
    question: 'What will you make it in?',
    savedLabel: 'Your machine',
    change: 'Change',
    otherMachine: 'Other machine',
    otherMachineHint: "You'll only give the capacity.",
    capacityQuestion: 'How much does your container hold?',
    containers: 'containers',
    container: 'container',
    amount: 'Amount',
    amountManual: 'Enter an exact amount',
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
    findSubstitute: 'Find substitute',
    dontHaveThis: "I don't have this ingredient",
    howToUse: 'How do you want to use it?',
    asIngredient: 'Ingredient',
    asTopping: 'Topping',
    save: 'Save recipe',
    saved: 'Saved',
    shareWithCommunity: 'Share with Community',
    letsMakeIt: "Let's make it",
    recalculate: 'Recalculate and fix',
    maskedGrams: '••• g',
    maskedGramsLabel: 'Amount hidden — available on the HOME or PRO plan',
    maskedGramsValue: '•••',
    askAmountTitle: 'How much do you want to add',
    askAmountConfirm: 'Add',
    askAmountCancel: 'Cancel',
    askAmountInvalid: 'Enter an amount greater than zero.',
    askAmountRecommended: "Manufacturer's recommended dose",
    gramsFieldLabel: 'amount in g',
    lockLabel: 'Lock the amount',
    grams: 'g',
  },
  sweetness: {
    label: 'Sweetness',
    less: 'Less sweet',
    balanced: 'Balanced',
    sweeter: 'Sweeter',
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
