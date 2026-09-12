/**
 * Customer copy for the official Gellatti Recipe Library.
 *
 * Display maps are keyed by the raw source value (the repository's `*Pl`
 * convention): the imported contract values stay verbatim in the data and
 * only their presentation lives here. A raw source code never reaches the
 * customer.
 */
import type {
  OfficialProductType,
  OfficialRecipeSourceStatus,
  OfficialRecipeStage,
} from '@/data/recipes/official/officialRecipeTypes';
import type { OfficialRecipeReadinessState } from '@/data/recipes/official/officialRecipeReadiness';

export const officialRecipeCopy = {
  eyebrow: 'Receptury Gellatti',
  collectionsTitle: 'Oficjalne kolekcje',
  collectionsBody:
    'Receptury Gellatti w pięciu kolekcjach. Każda jest bazą 1000 g — Twoja wersja powstaje jako kopia robocza.',
  recipeCount: (count: number) =>
    count === 1
      ? '1 receptura'
      : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)
        ? `${count} receptury`
        : `${count} receptur`,
  backToCollections: 'Wszystkie kolekcje',
  backToCollection: (name: string) => `Wróć do: ${name}`,
  number: (photoId: string, number: number) => `#${String(number).padStart(3, '0')} · ${photoId}`,
  ingredientsTitle: 'Skład receptury',
  ingredientHeader: 'Składnik',
  stageHeader: 'Etap',
  gramsHeader: 'g / 1000 g',
  total: 'Razem',
  gramsHidden: 'Gramatury zobaczysz po zalogowaniu w Gellatti HOME lub PRO.',
  canonicalLoading: 'Wczytujemy aktualne dane składnika…',
  canonicalUnavailable: 'Aktualne dane składnika są chwilowo niedostępne.',
  unresolvedLine: 'Składnik czeka na potwierdzenie — nie zastępujemy go podobnym produktem.',
  dynamicMainLine: 'Owoc (Main) wybierasz sam — baza przelicza się do Twojego wyboru.',
  genericLabelOnly: 'Nazwa ogólna — dokładny produkt pozostaje w danych Gellatti.',
  marketProduct: (name: string, country: string) => `W Twoim kraju (${country}): ${name}`,
  marketProductMissing: (country: string) =>
    `Brak potwierdzonego produktu w Twoim kraju (${country}) — składnik Gellatti bez zmian.`,
  statusTitle: 'Stan receptury',
  sourceRecipe: 'Receptura źródłowa',
  sourceRecipeValue: '1000 g · oryginał pozostaje bez zmian',
  engineRow: 'Silnik Gellatti',
  productionRow: 'Produkcja',
  productionValue: 'Instrukcja procesu w przygotowaniu',
  ingredientsRow: 'Składniki',
  ingredientsComplete: 'Wszystkie mają tożsamość Gellatti',
  ingredientsPending: (count: number) =>
    count === 1
      ? '1 składnik czeka na potwierdzenie'
      : `${count} składniki czekają na potwierdzenie`,
  readinessRow: 'Gotowość',
  readinessLabel: {
    READY: 'Gotowa — możesz zrobić te lody',
    DYNAMIC_MAIN: 'Szablon — najpierw wybierasz owoc',
    REVIEW_REQUIRED: 'Składnik do potwierdzenia',
    PRODUCT_BLOCKED: 'Czeka na dokładny produkt',
    INTERNAL_SUBRECIPE: 'Składnik Gellatti w przygotowaniu',
    OTHER_EXPLICIT_BLOCKER: 'Składnik niedostępny',
  } satisfies Record<OfficialRecipeReadinessState, string>,
  cardReadiness: {
    READY: null,
    DYNAMIC_MAIN: 'Szablon — wybierasz owoc',
    REVIEW_REQUIRED: 'Składnik do potwierdzenia',
    PRODUCT_BLOCKED: 'Czeka na produkt',
    INTERNAL_SUBRECIPE: 'Składnik Gellatti w przygotowaniu',
    OTHER_EXPLICIT_BLOCKER: 'Składnik niedostępny',
  } satisfies Record<OfficialRecipeReadinessState, string | null>,
  /** Why the main action is disabled; `labels` are the lines behind the recipe's state. */
  readinessReason: (state: OfficialRecipeReadinessState, labels: readonly string[]) => {
    const list = labels.join(', ');
    switch (state) {
      case 'DYNAMIC_MAIN':
        return 'To szablon: najpierw wybierasz owoc, a bazę przeliczamy do niego. Otwieranie szablonów przygotowujemy.';
      case 'REVIEW_REQUIRED':
        return `Czekamy na potwierdzenie składnika: ${list}. Nie zastępujemy go podobnym produktem.`;
      case 'PRODUCT_BLOCKED':
        return `Czekamy na dokładny produkt: ${list}. Nie zastępujemy go podobnym produktem.`;
      case 'INTERNAL_SUBRECIPE':
        return `Część receptury (${list}) przygotowujemy jako składnik własny Gellatti.`;
      case 'OTHER_EXPLICIT_BLOCKER':
        return `Składnik ${list} jest teraz niedostępny w katalogu Gellatti — receptury nie otworzymy do pracy.`;
      case 'READY':
        return '';
    }
  },
  processNoticeTitle: 'Uwagi procesowe',
  degassingTitle: 'Napój gazowany',
  use: 'Zrób te lody',
  useHint: 'Otworzymy tę recepturę jako Twoją kopię roboczą — oryginał Gellatti się nie zmieni.',
  useDemo: 'Zaloguj się, aby zrobić te lody — receptura otworzy się jako Twoja kopia robocza.',
  cardDegassing: 'Wymaga odgazowania',
  handoffReady: (name: string) =>
    `Otwarto oficjalną recepturę „${name}” jako Twoją kopię roboczą — oryginał Gellatti pozostaje bez zmian.`,
  handoffMarket: (matched: number, total: number, country: string) =>
    `Produkty z Twojego kraju (${country}): ${matched} z ${total} składników. Pozostałe to składniki Gellatti.`,
  handoffMarketUnavailable:
    'Nie udało się sprawdzić produktów z Twojego kraju — użyto składników Gellatti.',
  handoffLoading: 'Otwieramy recepturę Gellatti…',
  errors: {
    recipeNotFound: 'Nie znaleźliśmy tej receptury Gellatti.',
    unsavedChanges:
      'Bieżąca receptura ma niezapisane zmiany. Potwierdź ich odrzucenie przed otwarciem receptury Gellatti.',
    ingredientUnavailable: (label: string) =>
      `Składnik „${label}” jest chwilowo niedostępny. Receptura nie została otwarta.`,
    behaviorUnavailable: (label: string) =>
      `Nie udało się potwierdzić aktualnych danych składnika „${label}”. Spróbuj ponownie.`,
    massMismatch: 'Receptura nie zgadza się z masą źródłową 1000 g i nie została otwarta.',
    generic: 'Nie udało się otworzyć receptury Gellatti.',
  },
} as const;

const STAGE_LABELS: Readonly<Record<OfficialRecipeStage, string>> = {
  MIX: 'Mieszanka',
  'LATE ADD': 'Dodaj na końcu',
  SWIRL: 'Przekładanie',
  'CHOCOLATE THIRD': 'Część czekoladowa',
  'VANILLA THIRD': 'Część waniliowa',
  'STRAWBERRY THIRD': 'Część truskawkowa',
};

const PRODUCT_TYPE_LABELS: Readonly<Record<OfficialProductType, string>> = {
  'Standard Gelato': 'Gelato',
  'Chocolate Gelato': 'Gelato czekoladowe',
  Sorbet: 'Sorbet',
  'Vegan Gelato': 'Gelato wegańskie',
  'Cocktail Sorbet': 'Sorbet koktajlowy',
  'Spirit Gelato': 'Gelato z alkoholem',
  'Heritage Gelato / Sorbet': 'Receptura tradycyjna',
  'Technical Base': 'Baza techniczna',
};

const SOURCE_STATUS_LABELS: Readonly<Record<OfficialRecipeSourceStatus, string>> = {
  NEW_TO_ENGINE: 'Nowa receptura — silnik sprawdzi ją po otwarciu',
  ENGINE_BASE_VALID_BLOCKED: 'Baza sprawdzona — czeka na dane składników',
  CORRECTION_TO_ENGINE: 'Korekta receptury — do potwierdzenia w silniku',
  VERIFIED_EXISTING: 'Zweryfikowana baza techniczna',
  SCAFFOLD_RECALC_BY_MAIN: 'Szablon przeliczany po wyborze owocu (Main)',
};

export const officialStageLabelPl = (stage: OfficialRecipeStage): string => STAGE_LABELS[stage];
export const officialProductTypeLabelPl = (type: OfficialProductType): string =>
  PRODUCT_TYPE_LABELS[type];
export const officialSourceStatusLabelPl = (status: OfficialRecipeSourceStatus): string =>
  SOURCE_STATUS_LABELS[status];
