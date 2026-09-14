/**
 * GELLATTI recipe packs 01 + 02.
 *
 * This is a deliberately small, reviewable overlay on the immutable 177-row
 * workbook import. It replaces the current library binding for #039 and adds
 * eight records. The imported workbook and historical recipe snapshots remain
 * unchanged.
 */
import { OFFICIAL_RECIPE_SOURCE } from './officialRecipeLibrary.generated';
import type {
  OfficialCollectionId,
  OfficialProductType,
  OfficialRecipe,
  OfficialRecipeLine,
  OfficialRecipeLineScope,
} from './officialRecipeTypes';

export const OFFICIAL_RECIPE_PACK_01_SHA256 =
  '3aaf67b17f91739c158393eeecc01dc2aceb40e7af36131e99f6080f14ddfa51';
export const OFFICIAL_RECIPE_PACK_02_SHA256 =
  '9e265967238636eebf7369e46c18d2cd1d89e255ac8ce9695729dfcb92bec9b2';
export const OFFICIAL_RECIPE_PACK_01_02_SHA256 =
  'fb2d6ec0d0421c476cdf0ffc340bd478551ee6823c3ea649a71d552e7baa8a0f';

const sourcePackage = {
  id: 'GELLATTI_RECIPE_PACK_01_02',
  sha256: OFFICIAL_RECIPE_PACK_01_02_SHA256,
} as const;

type LineSeed = Readonly<{
  label: string;
  grams: number;
  scope?: OfficialRecipeLineScope;
  pi?: string;
  unresolved?: true;
  stage?: OfficialRecipeLine['stage'];
}>;

const lines = (seeds: readonly LineSeed[]): readonly OfficialRecipeLine[] =>
  seeds.map((seed, index) => ({
    line: index + 1,
    sourceRow: null,
    label: seed.label,
    stage: seed.stage ?? (seed.scope === 'TOPPING' ? 'LATE ADD' : 'MIX'),
    grams: seed.grams,
    identity: seed.unresolved
      ? { kind: 'unresolved', sourceIdStatus: 'BRAK' as const }
      : { kind: 'mapped', mapperIngredientId: seed.pi! },
    scope: seed.scope ?? 'MAIN',
    ...(seed.unresolved ? { unresolvedRequirement: 'physical_product' as const } : {}),
    marketAudit: 'required',
    processWarning: null,
    publicLabelOnly: false,
    note: null,
  }));

type RecipeSeed = Readonly<{
  recipeId: string;
  recipeVersion?: number;
  number: number;
  name: string;
  collection: OfficialCollectionId;
  subcategory: string;
  origin: string | null;
  continent: string | null;
  productType: OfficialProductType;
  photoStatus?: OfficialRecipe['photoStatus'];
  sourceTotalGrams?: number;
  degassingRequired?: boolean;
  processNotice?: string | null;
  description: string;
  instructions: readonly string[];
  toolNotice?: string;
  searchAliases?: readonly string[];
  baseRecipeReference?: OfficialRecipe['baseRecipeReference'];
  lines: readonly OfficialRecipeLine[];
}>;

const recipe = (seed: RecipeSeed): OfficialRecipe => ({
  recipeId: seed.recipeId,
  recipeVersion: seed.recipeVersion ?? 1,
  number: seed.number,
  photoId: `GEL-${String(seed.number).padStart(3, '0')}`,
  photoStatus: seed.photoStatus ?? 'pending',
  name: seed.name,
  description: seed.description,
  instructions: seed.instructions,
  ...(seed.toolNotice ? { toolNotice: seed.toolNotice } : {}),
  ...(seed.searchAliases ? { searchAliases: seed.searchAliases } : {}),
  ...(seed.baseRecipeReference ? { baseRecipeReference: seed.baseRecipeReference } : {}),
  sourcePackage,
  collection: seed.collection,
  subcategory: seed.subcategory,
  origin: seed.origin,
  continent: seed.continent,
  productType: seed.productType,
  sourceStatus: 'NEW_TO_ENGINE',
  sourceTotalGrams: seed.sourceTotalGrams ?? 1000,
  degassingRequired: seed.degassingRequired ?? false,
  processNotice: seed.processNotice ?? null,
  sourceRow: null,
  lines: seed.lines,
});

const vanilla = OFFICIAL_RECIPE_SOURCE.find((candidate) => candidate.number === 15);
if (!vanilla || vanilla.recipeId !== 'classic-vanilla' || vanilla.sourceTotalGrams !== 1000) {
  throw new Error('GELLATTI pack 01/02 requires the immutable #015 classic-vanilla v1 baseline.');
}

const vanillaServingLines = (): readonly OfficialRecipeLine[] =>
  vanilla.lines.map((line, index) => ({
    ...line,
    line: index + 1,
    sourceRow: null,
    grams: Number((line.grams * 0.12).toFixed(6)),
    stage: 'MIX',
    scope: 'MAIN',
    note: 'Rozwinięcie 120 g z immutable receptury classic-vanilla v1.',
  }));

export const GELLATTI_PACK_01_02_REPLACEMENT_039: OfficialRecipe = recipe({
  recipeId: 'classic-crema-di-buontalenti',
  recipeVersion: 2,
  number: 39,
  name: 'Crema di Buontalenti',
  collection: 'classics',
  subcategory: 'Dessert & Parlour',
  origin: 'Florence, Italy',
  continent: 'Europe',
  productType: 'Standard Gelato',
  photoStatus: 'available',
  description:
    'Bogaty krem mleczno-śmietankowy z żółtkami, inspirowany florenckim Buontalenti. Wyraźnie kremowy, bez dodatkowych sosów i posypek.',
  instructions: [
    'Połącz mleko, śmietankę, cukry, mleko w proszku i żółtka.',
    'Zastosuj istniejący właściwy proces dla bazy mleczno-jajecznej.',
    'Schłodź i przygotuj do mrożenia w wybranej maszynie.',
  ],
  lines: lines([
    { pi: 'PI-ING-000236', label: 'Mleko 3,5%', grams: 330 },
    { pi: 'PI-ING-002196', label: 'Śmietanka 35%', grams: 400 },
    { pi: 'PI-ING-001646', label: 'Żółtka', grams: 80 },
    { pi: 'PI-ING-000514', label: 'Cukier — sacharoza', grams: 150 },
    { pi: 'PI-ING-000494', label: 'Dekstroza monohydrat', grams: 25 },
    { pi: 'PI-ING-000270', label: 'Odtłuszczone mleko w proszku', grams: 15 },
  ]),
});

export const GELLATTI_PACK_01_02_ADDITIONS: readonly OfficialRecipe[] = [
  recipe({
    recipeId: 'classic-plombir',
    number: 178,
    name: 'Plombir',
    collection: 'classics',
    subcategory: 'Regional Classic',
    origin: 'Eastern Europe',
    continent: 'Europe',
    productType: 'Standard Gelato',
    photoStatus: 'available',
    description:
      'Bogate lody mleczno-śmietankowe o gładkiej konsystencji i delikatnym aromacie waniliowym.',
    processNotice: 'Skrobia natywna wymaga właściwego procesu na gorąco.',
    instructions: [
      'Rozprowadź skrobię w części zimnego mleka odważonego z receptury.',
      'Pozostałe mleko połącz z cukrami i mlekiem w proszku.',
      'Połącz składniki i zastosuj właściwy proces na gorąco, uwzględniający aktywację skrobi natywnej.',
      'Śmietankę uwzględnij zgodnie z istniejącym procesem produkcyjnym tej bazy; nie jest wymagane jej ubijanie dla każdej maszyny.',
      'Schłodź i przygotuj mieszankę do mrożenia.',
    ],
    lines: lines([
      { pi: 'PI-ING-000201', label: 'Mleko 3,2%', grams: 430 },
      { pi: 'PI-ING-002196', label: 'Śmietanka 35%', grams: 350 },
      { pi: 'PI-ING-000270', label: 'Odtłuszczone mleko w proszku', grams: 45 },
      { pi: 'PI-ING-000514', label: 'Cukier — sacharoza', grams: 120 },
      { pi: 'PI-ING-000494', label: 'Dekstroza monohydrat', grams: 30 },
      { pi: 'PI-ING-001463', label: 'Skrobia kukurydziana natywna', grams: 15 },
      { pi: 'PI-ING-000516', label: 'Cukier waniliowy/wanilinowy', grams: 10 },
    ]),
  }),
  recipe({
    recipeId: 'classic-porter-ice-cream',
    number: 179,
    name: 'Porter Ice Cream',
    searchAliases: ['Lody porterowe'],
    collection: 'cocktails_spirits',
    subcategory: 'Dessert & Parlour',
    origin: null,
    continent: null,
    productType: 'Spirit Gelato',
    photoStatus: 'available',
    degassingRequired: true,
    description: 'Kremowe lody z porterem, ciemnosłodową nutą i dodatkiem brązowego cukru.',
    processNotice:
      'Zawiera alkohol. Porter odgazuj bez gotowania i dodaj do schłodzonej bazy; nie redukuj piwa.',
    instructions: [
      'Przygotuj bazę mleczno-jajeczną z mleka, śmietanki, żółtek, mleka w proszku i obu cukrów.',
      'Zastosuj właściwy istniejący proces dla tej bazy i schłodź ją.',
      'Odgazuj porter bez gotowania. Odważ 150 g przeznaczone do receptury.',
      'Połącz porter ze schłodzoną bazą i przygotuj do mrożenia.',
    ],
    lines: lines([
      { pi: 'PI-ING-000236', label: 'Mleko 3,5%', grams: 370 },
      { pi: 'PI-ING-002196', label: 'Śmietanka 35%', grams: 250 },
      { pi: 'PI-ING-001615', label: 'Dark Porter Type Beer', grams: 150 },
      { pi: 'PI-ING-001646', label: 'Żółtka', grams: 50 },
      { pi: 'PI-ING-000270', label: 'Odtłuszczone mleko w proszku', grams: 65 },
      { pi: 'PI-ING-000514', label: 'Cukier — sacharoza', grams: 80 },
      { pi: 'PI-ING-002144', label: 'Cukier brązowy', grams: 35 },
    ]),
  }),
  recipe({
    recipeId: 'classic-eiskaffee',
    number: 180,
    name: 'Eiskaffee',
    searchAliases: ['Lodowa kawa'],
    collection: 'classics',
    subcategory: 'Dessert & Parlour',
    origin: 'Germany',
    continent: 'Europe',
    productType: 'Standard Gelato',
    sourceTotalGrams: 120,
    baseRecipeReference: { recipeId: vanilla.recipeId, recipeVersion: 1, servingGrams: 120 },
    description:
      'Schłodzona kawa z lodami waniliowymi, bitą śmietaną i drobno startą ciemną czekoladą.',
    instructions: [
      'Przygotuj lody waniliowe według podłączonej receptury GELLATTI.',
      'Zaparz kawę i całkowicie ją ostudź, następnie schłodź.',
      'Ubij odważoną śmietankę.',
      'Do wysokiej szklanki włóż 120 g lodów waniliowych.',
      'Zalej 200 g zimnej kawy.',
      'Dodaj bitą śmietanę i posyp startą ciemną czekoladą.',
      'Podawaj od razu, z długą łyżeczką.',
    ],
    lines: [
      ...vanillaServingLines(),
      ...lines([
        {
          pi: 'PI-ING-002479',
          label: 'Kawa filtrowana, niesłodzona',
          grams: 200,
          scope: 'TOPPING',
        },
        { pi: 'PI-ING-002196', label: 'Śmietanka 35%, do ubicia', grams: 50, scope: 'TOPPING' },
        {
          pi: 'PI-ING-002453',
          label: 'Ciemna czekolada 70%, do starcia',
          grams: 3,
          scope: 'TOPPING',
        },
      ]).map((line, index) => ({ ...line, line: vanilla.lines.length + index + 1 })),
    ],
  }),
  recipe({
    recipeId: 'classic-spaghettieis',
    number: 181,
    name: 'Spaghettieis',
    searchAliases: ['Lody spaghetti', 'Spagettieis'],
    collection: 'classics',
    subcategory: 'Dessert & Parlour',
    origin: 'Germany',
    continent: 'Europe',
    productType: 'Standard Gelato',
    photoStatus: 'available',
    sourceTotalGrams: 120,
    baseRecipeReference: { recipeId: vanilla.recipeId, recipeVersion: 1, servingGrams: 120 },
    description:
      'Lody waniliowe wyciskane w kształt spaghetti, na bitej śmietanie, z sosem truskawkowym i startą białą czekoladą.',
    toolNotice:
      'Do wykonania lodowych nitek potrzebujesz praski do ziemniaków, praski do szpecli — Spätzlepresse — lub podobnej prasy spożywczej z okrągłymi otworami. Zwykły tłuczek do ziemniaków nie zastąpi praski.',
    instructions: [
      'Przygotuj lody waniliowe według podłączonej receptury GELLATTI.',
      'Czystą, suchą praskę schłodź w zamrażarce przez około 15–20 minut. Schłodź również talerz lub pucharek.',
      'Zblenduj truskawki z cukrem na gładki sos i schłodź.',
      'Ubij śmietankę bez dodatkowego cukru i połóż ją na środku talerza.',
      'Włóż zimne, ale możliwe do wyciśnięcia lody do praski. Przeciśnij bezpośrednio na śmietanę, tworząc nitki. Nie używaj nadmiernej siły do lodów zamrożonych na twardy blok.',
      'Polej sosem truskawkowym.',
      'Posyp drobno startą białą czekoladą.',
      'Podawaj natychmiast.',
    ],
    lines: [
      ...vanillaServingLines(),
      ...lines([
        { pi: 'PI-ING-002196', label: 'Śmietanka 35%, do ubicia', grams: 50, scope: 'TOPPING' },
        { pi: 'PI-ING-001553', label: 'Świeże truskawki', grams: 60, scope: 'TOPPING' },
        { pi: 'PI-ING-000514', label: 'Cukier — sacharoza do sosu', grams: 6, scope: 'TOPPING' },
        { pi: 'PI-ING-002466', label: 'Biała czekolada, do starcia', grams: 10, scope: 'TOPPING' },
      ]).map((line, index) => ({ ...line, line: vanilla.lines.length + index + 1 })),
    ],
  }),
  recipe({
    recipeId: 'icon-pistachio-white-chocolate-praline',
    number: 182,
    name: 'Pistachio White Chocolate Praline',
    collection: 'icons',
    subcategory: 'Confectionery Icon',
    origin: null,
    continent: null,
    productType: 'Standard Gelato',
    photoStatus: 'available',
    description:
      'Kremowe lody pistacjowe z białą czekoladą, jasnym kremem, pastą pralinową i lekko solonymi, chrupiącymi pistacjami.',
    processNotice: 'Stabilizatory wymagają właściwej hydratacji w istniejącym procesie na gorąco.',
    instructions: [
      'Odważ składniki MAIN. Stabilizatory dokładnie wymieszaj z częścią sacharozy już odważonej do receptury.',
      'Przygotuj mleczną mieszankę z cukrami i mlekiem w proszku.',
      'Połącz z pastą pistacjową i białą czekoladą, dokładnie zhomogenizuj.',
      'Zastosuj właściwy istniejący proces na gorąco, uwzględniający hydratację stabilizatorów. Schłodź i przygotuj do mrożenia.',
      'Pistacje przeznaczone do dodatku posiekaj i połącz z 0,5 g soli.',
      'Zmrożone lody przełóż jasnym kremem i pastą pralinową, dodając posiekane pistacje.',
      'Zachowaj widoczne pasma i kawałki. Nie blenduj dodatków w jednolitą bazę.',
    ],
    lines: lines([
      { pi: 'PI-ING-000236', label: 'Mleko 3,5%', grams: 612 },
      { pi: 'PI-ING-002196', label: 'Śmietanka 35%', grams: 60 },
      { pi: 'PI-ING-000624', label: 'Pasta pistacjowa 100%, prażona', grams: 85 },
      { pi: 'PI-ING-002466', label: 'Biała czekolada, 28% masła kakaowego', grams: 25 },
      { pi: 'PI-ING-000270', label: 'Odtłuszczone mleko w proszku', grams: 40 },
      { pi: 'PI-ING-000514', label: 'Sacharoza', grams: 115 },
      { pi: 'PI-ING-000494', label: 'Dekstroza monohydrat', grams: 60 },
      { pi: 'PI-ING-000475', label: 'Mączka chleba świętojańskiego / LBG', grams: 1 },
      { pi: 'PI-ING-000492', label: 'Guma tara', grams: 0.6 },
      { pi: 'PI-ING-000472', label: 'Guma guar', grams: 0.4 },
      { pi: 'PI-ING-000458', label: 'Sól', grams: 1 },
      {
        pi: 'PI-ING-000220',
        label: 'IRCA Joycream White, kod 01011063',
        grams: 50,
        scope: 'TOPPING',
        stage: 'SWIRL',
      },
      {
        pi: 'PI-ING-002437',
        label: 'Model praliny pistacjowej 50:50',
        grams: 40,
        scope: 'TOPPING',
        stage: 'SWIRL',
      },
      { pi: 'PI-ING-002404', label: 'Pistacje prażone, niesolone', grams: 25, scope: 'TOPPING' },
      { pi: 'PI-ING-000458', label: 'Sól do pistacjowego dodatku', grams: 0.5, scope: 'TOPPING' },
    ]),
  }),
  recipe({
    recipeId: 'icon-red-velvet-cheesecake-chunk',
    number: 183,
    name: 'Red Velvet Cheesecake Chunk',
    collection: 'icons',
    subcategory: 'Confectionery Icon',
    origin: null,
    continent: null,
    productType: 'Standard Gelato',
    photoStatus: 'available',
    description:
      'Delikatnie kwaskowe lody z serkiem śmietankowym, kawałkami ciasta Red Velvet i malinowym variegato.',
    processNotice: 'Stabilizatory wymagają właściwej hydratacji w istniejącym procesie na gorąco.',
    instructions: [
      'Przygotuj bazę mleczną z cukrami, mlekiem w proszku i stabilizatorami, korzystając z istniejącego właściwego procesu.',
      'Serek śmietankowy połącz z bazą i zhomogenizuj na etapie dopuszczonym przez aktualną instrukcję procesową.',
      'Schłodź mieszankę i przygotuj do mrożenia.',
      'Gotowe, całkowicie upieczone i wystudzone ciasto Red Velvet pokrój na małe kawałki.',
      'Po zmrożeniu bazy delikatnie wmieszaj kawałki ciasta.',
      'Przełóż malinowym variegato, pozostawiając wyraźne smugi.',
    ],
    lines: lines([
      { pi: 'PI-ING-000236', label: 'Mleko 3,5%', grams: 500 },
      { pi: 'PI-ING-002196', label: 'Śmietanka 35%', grams: 80 },
      { pi: 'PI-ING-002232', label: 'Cream cheese 21% tłuszczu', grams: 200 },
      { pi: 'PI-ING-000270', label: 'Odtłuszczone mleko w proszku', grams: 35 },
      { pi: 'PI-ING-000514', label: 'Sacharoza', grams: 110 },
      { pi: 'PI-ING-000494', label: 'Dekstroza monohydrat', grams: 65 },
      { pi: 'PI-ING-000516', label: 'Cukier waniliowy/wanilinowy', grams: 8 },
      { pi: 'PI-ING-000475', label: 'Mączka chleba świętojańskiego / LBG', grams: 1 },
      { pi: 'PI-ING-000492', label: 'Guma tara', grams: 0.6 },
      { pi: 'PI-ING-000472', label: 'Guma guar', grams: 0.4 },
      {
        label: 'Ciasto Red Velvet — upieczone, bez kremu i polewy',
        grams: 150,
        scope: 'TOPPING',
        unresolved: true,
      },
      {
        pi: 'PI-ING-001033',
        label: 'Giuso Amordifrutta Lampone, variegato malinowe',
        grams: 50,
        scope: 'TOPPING',
        stage: 'SWIRL',
      },
    ]),
  }),
  recipe({
    recipeId: 'icon-milky-hazelnut-chocolate-crunch',
    number: 184,
    name: 'Milky Hazelnut Chocolate Crunch',
    searchAliases: ['Kinder Schoko-Bons'],
    collection: 'icons',
    subcategory: 'Confectionery Icon',
    origin: null,
    continent: null,
    productType: 'Standard Gelato',
    photoStatus: 'available',
    description:
      'Wyraźnie mleczne lody z kawałkami Kinder Schoko-Bons, cienkimi płatkami mlecznej czekolady i chrupiącymi orzechami laskowymi.',
    processNotice: 'Stabilizatory wymagają właściwej hydratacji w istniejącym procesie na gorąco.',
    instructions: [
      'Przygotuj mleczną bazę z cukrami, mlekiem w proszku i stabilizatorami.',
      'Zastosuj właściwy istniejący proces, schłodź i przygotuj do mrożenia.',
      'Schoko-Bons odwiń i posiekaj na małe kawałki.',
      'Orzechy laskowe drobno posiekaj.',
      'Mleczną czekoladę przygotuj w formie cienkich płatków.',
      'Po zmrożeniu mlecznej bazy delikatnie wkomponuj wszystkie dodatki, zachowując kawałki cukierków i chrupiącą strukturę.',
    ],
    lines: lines([
      { pi: 'PI-ING-000236', label: 'Mleko 3,5%', grams: 610 },
      { pi: 'PI-ING-002196', label: 'Śmietanka 35%', grams: 160 },
      { pi: 'PI-ING-000270', label: 'Odtłuszczone mleko w proszku', grams: 60 },
      { pi: 'PI-ING-000514', label: 'Sacharoza', grams: 115 },
      { pi: 'PI-ING-000494', label: 'Dekstroza monohydrat', grams: 45 },
      { pi: 'PI-ING-000516', label: 'Cukier waniliowy/wanilinowy', grams: 8 },
      { pi: 'PI-ING-000475', label: 'Mączka chleba świętojańskiego / LBG', grams: 1 },
      { pi: 'PI-ING-000492', label: 'Guma tara', grams: 0.6 },
      { pi: 'PI-ING-000472', label: 'Guma guar', grams: 0.4 },
      {
        label: 'Kinder Schoko-Bons ORIGINAL — mleczna czekolada, posiekane',
        grams: 120,
        scope: 'TOPPING',
        unresolved: true,
      },
      {
        pi: 'PI-ING-002462',
        label: 'Mleczna czekolada, 35% składników kakaowych',
        grams: 40,
        scope: 'TOPPING',
      },
      {
        pi: 'PI-ING-002400',
        label: 'Orzechy laskowe prażone, niesolone, drobno posiekane',
        grams: 15,
        scope: 'TOPPING',
      },
    ]),
  }),
  recipe({
    recipeId: 'heritage-parmesan-ice-cream',
    number: 185,
    name: 'Parmesan Ice Cream',
    collection: 'lost_legendary',
    subcategory: 'Heritage',
    origin: 'Great Britain',
    continent: 'Europe',
    productType: 'Heritage Gelato / Sorbet',
    photoStatus: 'available',
    description:
      'Kremowe lody z dojrzewającym parmezanem, łączące mleczną słodycz z wytrawną, serową nutą. Współczesna interpretacja dawnych lodów parmezanowych.',
    instructions: [
      'Drobno zetrzyj parmezan.',
      'Przygotuj bazę mleczno-jajeczną z cukrami i mlekiem w proszku, korzystając z właściwego, istniejącego procesu dla takiej mieszanki.',
      'Połącz bazę z parmezanem i dokładnie zhomogenizuj.',
      'Schłodź i przygotuj do mrożenia zgodnie z instrukcją właściwej maszyny.',
    ],
    lines: lines([
      { pi: 'PI-ING-000236', label: 'Mleko 3,5%', grams: 400 },
      { pi: 'PI-ING-002196', label: 'Śmietanka 35%', grams: 250 },
      { pi: 'PI-ING-001666', label: 'Całe jajka, masa bez skorupek', grams: 100 },
      { pi: 'PI-ING-000514', label: 'Cukier — sacharoza', grams: 110 },
      { pi: 'PI-ING-000494', label: 'Dekstroza monohydrat', grams: 40 },
      { pi: 'PI-ING-001447', label: 'Parmezan', grams: 80 },
      { pi: 'PI-ING-000270', label: 'Odtłuszczone mleko w proszku', grams: 20 },
    ]),
  }),
] as const;
