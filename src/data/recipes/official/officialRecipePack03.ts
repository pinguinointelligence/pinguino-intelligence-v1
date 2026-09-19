/**
 * GELLATTI recipe package 03.
 *
 * A reviewable overlay on the immutable workbook baseline and packages 01/02.
 * It moves the existing #164 binding without changing its formula and adds the
 * five owner-approved canonical records #186–190.
 */
import { OFFICIAL_RECIPE_SOURCE } from './officialRecipeLibrary.generated';
import type {
  OfficialCollectionId,
  OfficialProductType,
  OfficialRecipe,
  OfficialRecipeLine,
  OfficialRecipeLineScope,
} from './officialRecipeTypes';

/** SHA-256 of `officialRecipePack03HashInput()` (canonical data, provenance omitted). */
export const OFFICIAL_RECIPE_PACK_03_SHA256 =
  '6042a298bfac06a254c5e16ac778d29c55cdcc8bb18f4eb43d09173b0e60492f';

const sourcePackage = {
  id: 'GELLATTI_RECIPE_PACK_03',
  sha256: OFFICIAL_RECIPE_PACK_03_SHA256,
} as const;

type LineSeed = Readonly<{
  label: string;
  grams: number;
  pi?: string;
  unresolved?: true;
  scope?: OfficialRecipeLineScope;
  stage?: OfficialRecipeLine['stage'];
  sourceRow?: number;
  processWarning?: string;
  note?: string;
  publicLabelOnly?: boolean;
}>;

const lines = (seeds: readonly LineSeed[]): readonly OfficialRecipeLine[] =>
  seeds.map((seed, index) => ({
    line: index + 1,
    sourceRow: seed.sourceRow ?? null,
    label: seed.label,
    stage: seed.stage ?? (seed.scope === 'TOPPING' ? 'LATE ADD' : 'MIX'),
    grams: seed.grams,
    identity: seed.unresolved
      ? { kind: 'unresolved', sourceIdStatus: 'BRAK' as const }
      : { kind: 'mapped', mapperIngredientId: seed.pi! },
    scope: seed.scope ?? 'MAIN',
    ...(seed.unresolved ? { unresolvedRequirement: 'physical_product' as const } : {}),
    marketAudit: 'required',
    processWarning: seed.processWarning ?? null,
    publicLabelOnly: seed.publicLabelOnly ?? false,
    note: seed.note ?? null,
  }));

type RecipeSeed = Readonly<{
  recipeId: string;
  number: number;
  name: string;
  collection: OfficialCollectionId;
  subcategory: string;
  origin: string | null;
  continent: string | null;
  productType: OfficialProductType;
  description: string;
  instructions: readonly string[];
  processNotice: string;
  degassingRequired?: boolean;
  photoStatus?: OfficialRecipe['photoStatus'];
  searchAliases?: readonly string[];
  sourceRow?: number;
  lines: readonly OfficialRecipeLine[];
}>;

const recipe = (seed: RecipeSeed): OfficialRecipe => ({
  recipeId: seed.recipeId,
  recipeVersion: 1,
  number: seed.number,
  photoId: `GEL-${String(seed.number).padStart(3, '0')}`,
  photoStatus: seed.photoStatus ?? 'pending',
  name: seed.name,
  description: seed.description,
  instructions: seed.instructions,
  ...(seed.searchAliases ? { searchAliases: seed.searchAliases } : {}),
  sourcePackage,
  collection: seed.collection,
  subcategory: seed.subcategory,
  origin: seed.origin,
  continent: seed.continent,
  productType: seed.productType,
  sourceStatus: 'NEW_TO_ENGINE',
  sourceTotalGrams: 1000,
  degassingRequired: seed.degassingRequired ?? false,
  processNotice: seed.processNotice,
  sourceRow: seed.sourceRow ?? null,
  lines: seed.lines,
});

const zabaione = OFFICIAL_RECIPE_SOURCE.find((candidate) => candidate.number === 164);
if (!zabaione || zabaione.recipeId !== 'lost-it-zabaione') {
  throw new Error('GELLATTI package 03 requires immutable #164 lost-it-zabaione v1.');
}

/** Only provenance, version and owner collection differ from immutable #164. */
export const GELLATTI_PACK_03_REPLACEMENT_164: OfficialRecipe = {
  ...zabaione,
  recipeVersion: 2,
  sourcePackage,
  collection: 'cocktails_spirits',
};

export const GELLATTI_PACK_03_ADDITIONS: readonly OfficialRecipe[] = [
  recipe({
    recipeId: 'heritage-irish-stout-brown-bread',
    number: 186,
    name: 'Irish Stout & Brown Bread',
    collection: 'lost_legendary',
    subcategory: 'Heritage',
    origin: 'Ireland',
    continent: 'Europe',
    productType: 'Heritage Gelato / Sorbet',
    degassingRequired: true,
    sourceRow: 190,
    description:
      'Kremowe lody mleczno-jajeczne z irlandzkim stoutem i karmelizowanymi kawałkami pełnoziarnistego brown bread.',
    processNotice:
      'Baza mleczno-jajeczna wymaga istniejącego kontrolowanego procesu cieplnego. Stout odgazować bez gotowania i dodać do schłodzonej bazy. Nie podstawiać PI-ING-001615 jako Guinnessa. Nie zastępować brown bread chałką PI-ING-000047. Brown bread dodać po zmrożeniu jako LATE ADD.',
    instructions: [
      'Przygotuj bazę z mleka, śmietanki, żółtek, mleka w proszku, cukrów, soli i gumy tara, korzystając z istniejącego właściwego procesu.',
      'Bazę całkowicie schłodź.',
      'Stout odgazuj bez podgrzewania i odważ dokładnie 80 g.',
      'Połącz stout ze schłodzoną bazą.',
      'Zmroź mieszankę.',
      'Po zmrożeniu dodaj 80 g gotowego karmelizowanego brown bread jako LATE ADD.',
    ],
    lines: lines([
      { pi: 'PI-ING-000236', label: 'Mleko 3,5%', grams: 372, sourceRow: 1564 },
      { pi: 'PI-ING-002196', label: 'Śmietanka 35%', grams: 200, sourceRow: 1565 },
      {
        pi: 'PI-ING-001646',
        label: 'Żółtka',
        grams: 60,
        sourceRow: 1566,
        processWarning: 'Baza mleczno-jajeczna — wymaga kontrolowanej obróbki cieplnej.',
      },
      {
        pi: 'PI-ING-000270',
        label: 'Odtłuszczone mleko w proszku',
        grams: 40,
        sourceRow: 1567,
      },
      { pi: 'PI-ING-002144', label: 'Cukier brązowy', grams: 80, sourceRow: 1568 },
      { pi: 'PI-ING-000514', label: 'Sacharoza', grams: 45, sourceRow: 1569 },
      {
        pi: 'PI-ING-000494',
        label: 'Dekstroza monohydrat',
        grams: 40,
        sourceRow: 1570,
      },
      {
        unresolved: true,
        label: 'Guinness / odpowiedni irlandzki stout',
        grams: 80,
        sourceRow: 1571,
        processWarning:
          'Stout odgazować przed użyciem; nie podstawiać PI-ING-001615 jako Guinnessa.',
        note: 'BRAK dokładnego PI-ING.',
      },
      {
        unresolved: true,
        label: 'Brown bread — karmelizowane pełnoziarniste pieczywo',
        grams: 80,
        sourceRow: 1572,
        scope: 'TOPPING',
        stage: 'LATE ADD',
        processWarning: 'BRAK dokładnego PI-ING. Nie zastępować chałką PI-ING-000047.',
      },
      { pi: 'PI-ING-000458', label: 'Sól', grams: 1, sourceRow: 1573 },
      {
        pi: 'PI-ING-000492',
        label: 'Guma tara',
        grams: 2,
        sourceRow: 1574,
        processWarning: 'Tara — składnik podlega obróbce cieplnej.',
      },
    ]),
  }),
  recipe({
    recipeId: 'heritage-cafayate-cabernet-sauvignon',
    number: 187,
    name: 'Cafayate Cabernet Sauvignon',
    collection: 'lost_legendary',
    subcategory: 'Heritage',
    origin: 'Cafayate, Salta / Argentina',
    continent: 'South America',
    productType: 'Heritage Gelato / Sorbet',
    sourceRow: 191,
    description:
      'Kremowe gelato mleczno-jajeczne z intensywną, całkowicie schłodzoną redukcją Cabernet Sauvignon z Cafayate.',
    processNotice:
      'Wino zredukować osobno do dokładnie 150 g. Redukcję całkowicie schłodzić przed połączeniem z bazą. PI-ING-000032 jest wyłącznie ogólnym profilem czerwonego wina i nie może zostać podstawiony jako exact Cafayate Cabernet Sauvignon.',
    instructions: [
      'Przygotuj osobno redukcję exact Cabernet Sauvignon z Cafayate.',
      'Zakończ redukcję przy dokładnie 150 g i całkowicie ją schłodź.',
      'Przygotuj bazę mleczno-jajeczną z pozostałych składników przy użyciu istniejącego właściwego procesu.',
      'Schłodzoną redukcję połącz ze schłodzoną bazą i zhomogenizuj.',
      'Przygotuj do mrożenia.',
    ],
    lines: lines([
      { pi: 'PI-ING-000236', label: 'Mleko 3,5%', grams: 350, sourceRow: 1575 },
      { pi: 'PI-ING-002196', label: 'Śmietanka 35%', grams: 250, sourceRow: 1576 },
      {
        pi: 'PI-ING-001646',
        label: 'Żółtka',
        grams: 60,
        sourceRow: 1577,
        processWarning: 'Baza mleczno-jajeczna — wymaga kontrolowanej obróbki cieplnej.',
      },
      {
        pi: 'PI-ING-000270',
        label: 'Odtłuszczone mleko w proszku',
        grams: 30,
        sourceRow: 1578,
      },
      { pi: 'PI-ING-000514', label: 'Sacharoza', grams: 85, sourceRow: 1579 },
      {
        pi: 'PI-ING-000494',
        label: 'Dekstroza monohydrat',
        grams: 45,
        sourceRow: 1580,
      },
      { pi: 'PI-ING-000456', label: 'Inulina', grams: 28, sourceRow: 1581 },
      {
        unresolved: true,
        label: 'Redukcja Cabernet Sauvignon z Cafayate',
        grams: 150,
        sourceRow: 1582,
        processWarning: 'Wino zredukować osobno i całkowicie schłodzić przed połączeniem z bazą.',
        note: 'BRAK dokładnego produktu. PI-ING-000032 istnieje wyłącznie jako ogólny profil czerwonego wina wytrawnego i nie jest tu podstawiony.',
      },
      {
        pi: 'PI-ING-000492',
        label: 'Guma tara',
        grams: 2,
        sourceRow: 1583,
        processWarning: 'Tara — składnik podlega obróbce cieplnej.',
      },
    ]),
  }),
  recipe({
    recipeId: 'heritage-vin-santo-cantucci',
    number: 188,
    name: 'Vin Santo & Cantucci',
    collection: 'lost_legendary',
    subcategory: 'Heritage',
    origin: 'Tuscany / Italy',
    continent: 'Europe',
    productType: 'Heritage Gelato / Sorbet',
    sourceRow: 192,
    description:
      'Toskańskie gelato z Vin Santo i chrupiącymi cantucci migdałowymi dodawanymi po zmrożeniu.',
    processNotice:
      'Vin Santo dodać do schłodzonej bazy zgodnie z istniejącym procesem dla alkoholu. Nie zastępować Vin Santo Marsalą ani ogólnym słodkim białym winem. Cantucci dodać po zmrożeniu jako LATE ADD.',
    instructions: [
      'Przygotuj bazę mleczno-jajeczną z mapped składników przy użyciu właściwego procesu.',
      'Bazę całkowicie schłodź.',
      'Dodaj dokładnie 80 g Vin Santo i zhomogenizuj.',
      'Zmroź mieszankę.',
      'Dodaj 50 g cantucci po zmrożeniu, zachowując widoczne chrupiące kawałki.',
    ],
    lines: lines([
      { pi: 'PI-ING-000236', label: 'Mleko 3,5%', grams: 500, sourceRow: 1584 },
      { pi: 'PI-ING-002196', label: 'Śmietanka 35%', grams: 120, sourceRow: 1585 },
      {
        pi: 'PI-ING-001646',
        label: 'Żółtka',
        grams: 50,
        sourceRow: 1586,
        processWarning: 'Baza mleczno-jajeczna — wymaga kontrolowanej obróbki cieplnej.',
      },
      {
        pi: 'PI-ING-000270',
        label: 'Odtłuszczone mleko w proszku',
        grams: 30,
        sourceRow: 1587,
      },
      { pi: 'PI-ING-000514', label: 'Sacharoza', grams: 45, sourceRow: 1588 },
      { pi: 'PI-ING-002144', label: 'Cukier brązowy', grams: 35, sourceRow: 1589 },
      {
        pi: 'PI-ING-000494',
        label: 'Dekstroza monohydrat',
        grams: 50,
        sourceRow: 1590,
      },
      { pi: 'PI-ING-000456', label: 'Inulina', grams: 38, sourceRow: 1591 },
      {
        unresolved: true,
        label: 'Vin Santo',
        grams: 80,
        sourceRow: 1592,
        processWarning:
          'Dodać zgodnie z procesem dla alkoholu; nie zastępować Marsalą ani ogólnym słodkim białym winem.',
        note: 'BRAK dokładnego PI-ING.',
      },
      {
        unresolved: true,
        label: 'Cantucci / cantuccini migdałowe',
        grams: 50,
        sourceRow: 1593,
        scope: 'TOPPING',
        stage: 'LATE ADD',
        processWarning: 'BRAK dokładnego PI-ING.',
      },
      {
        pi: 'PI-ING-000492',
        label: 'Guma tara',
        grams: 2,
        sourceRow: 1594,
        processWarning: 'Tara — składnik podlega obróbce cieplnej.',
        note: 'Dodatkowe źródło proporcji: https://www.lavialla.com/en-GB/recipes/875/gelato-con-cantucci-e-vin-santo-/',
      },
    ]),
  }),
  recipe({
    recipeId: 'spirit-baileys-eiskaffee',
    number: 189,
    name: 'Baileys Eiskaffee',
    searchAliases: ['Irish Cream Eiskaffee', 'Irish Cream Iced Coffee Gelato'],
    collection: 'cocktails_spirits',
    subcategory: 'Spirit Gelato',
    origin: 'Ireland / Germany',
    continent: 'Europe',
    productType: 'Spirit Gelato',
    photoStatus: 'available',
    description:
      'Kremowe gelato kawowe z likierem Irish Cream, espresso i wanilią, inspirowane niemieckim Eiskaffee.',
    processNotice:
      'Zawiera alkohol. Espresso musi być całkowicie ostudzone. Likier i espresso należy połączyć ze schłodzoną bazą, nie odparowywać alkoholu.',
    instructions: [
      'Połącz mleko, śmietankę, mleko w proszku, sacharozę, dekstrozę, inulinę i gumę tara.',
      'Zastosuj istniejący właściwy proces dla mlecznej bazy i całkowicie ją schłodź.',
      'Espresso całkowicie ostudź.',
      'Połącz schłodzoną bazę z espresso, likierem oraz pastą waniliową.',
      'Dokładnie zhomogenizuj i przygotuj do mrożenia.',
    ],
    lines: lines([
      { pi: 'PI-ING-000236', label: 'Mleko 3,5%', grams: 555 },
      { pi: 'PI-ING-000180', label: 'Śmietanka 30%', grams: 110 },
      { pi: 'PI-ING-000270', label: 'Odtłuszczone mleko w proszku', grams: 30 },
      { pi: 'PI-ING-000514', label: 'Sacharoza', grams: 60 },
      { pi: 'PI-ING-000494', label: 'Dekstroza', grams: 50 },
      { pi: 'PI-ING-000456', label: 'Inulina', grams: 43 },
      { pi: 'PI-ING-001591', label: 'Espresso', grams: 100 },
      {
        pi: 'PI-ING-000022',
        label: 'Irish cream / coffee cream liqueur',
        grams: 40,
        publicLabelOnly: true,
      },
      { pi: 'PI-ING-001705', label: 'Pasta waniliowa', grams: 10 },
      { pi: 'PI-ING-000492', label: 'Guma tara', grams: 2 },
    ]),
  }),
  recipe({
    recipeId: 'spirit-amaretto-eiskaffee',
    number: 190,
    name: 'Amaretto Eiskaffee',
    searchAliases: ['Disaronno Eiskaffee', 'Amaretto Iced Coffee Gelato'],
    collection: 'cocktails_spirits',
    subcategory: 'Spirit Gelato',
    origin: 'Italy / Germany',
    continent: 'Europe',
    productType: 'Spirit Gelato',
    photoStatus: 'available',
    description:
      'Kremowe gelato kawowo-waniliowe z espresso i Disaronno Originale, inspirowane włosko-niemieckim Eiskaffee.',
    processNotice:
      'Zawiera alkohol. Espresso musi być całkowicie ostudzone. Disaronno i espresso należy połączyć ze schłodzoną bazą, nie odparowywać alkoholu.',
    instructions: [
      'Połącz mleko, śmietankę, mleko w proszku, sacharozę, dekstrozę, inulinę i gumę tara.',
      'Zastosuj istniejący właściwy proces dla mlecznej bazy i całkowicie ją schłodź.',
      'Espresso całkowicie ostudź.',
      'Połącz schłodzoną bazę z espresso, Disaronno oraz pastą waniliową.',
      'Dokładnie zhomogenizuj i przygotuj do mrożenia.',
    ],
    lines: lines([
      { pi: 'PI-ING-000236', label: 'Mleko 3,5%', grams: 555 },
      { pi: 'PI-ING-000180', label: 'Śmietanka 30%', grams: 100 },
      { pi: 'PI-ING-000270', label: 'Odtłuszczone mleko w proszku', grams: 30 },
      { pi: 'PI-ING-000514', label: 'Sacharoza', grams: 60 },
      { pi: 'PI-ING-000494', label: 'Dekstroza', grams: 50 },
      { pi: 'PI-ING-000456', label: 'Inulina', grams: 43 },
      { pi: 'PI-ING-001591', label: 'Espresso', grams: 110 },
      {
        pi: 'PI-ING-001768',
        label: 'Disaronno Originale / Amaretto liqueur',
        grams: 40,
      },
      { pi: 'PI-ING-001705', label: 'Pasta waniliowa', grams: 10 },
      { pi: 'PI-ING-000492', label: 'Guma tara', grams: 2 },
    ]),
  }),
];

/**
 * Deterministic package payload used to verify provenance without hashing the
 * self-referential `sourcePackage.sha256` field.
 */
export function officialRecipePack03HashInput(): string {
  const withoutProvenance = (recipeValue: OfficialRecipe) =>
    Object.fromEntries(Object.entries(recipeValue).filter(([key]) => key !== 'sourcePackage'));
  return JSON.stringify({
    replacement: withoutProvenance(GELLATTI_PACK_03_REPLACEMENT_164),
    additions: GELLATTI_PACK_03_ADDITIONS.map(withoutProvenance),
  });
}
