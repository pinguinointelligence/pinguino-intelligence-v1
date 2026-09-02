export type ExecutableRecipeLibrary = 'lost_legendary' | 'fantasy';
export type ExecutableRecipeTemplateStatus =
  | 'OWNER_REVIEW_EDITABLE'
  | 'BLOCKED_EXACT_PRODUCT_DATA';

export type ExecutableRecipeProductionStatus = 'PRODUCTION_READY' | 'PRODUCTION_BLOCKED';
export type ExecutableRecipeLabelStatus = 'LABEL_READY' | 'LABEL_BLOCKED';

export interface ExecutableRecipeLineSeed {
  lineId: string;
  mapperIngredientId: string | null;
  requiredProductForm: string | null;
  /** Null means that an exact product dose/conversion has not been supplied.
   * It is never projected to Engine as zero. */
  grams: number | null;
  /** Null when an unresolved required product has no approved dose or
   * equivalence. A dose from another product form must never be reused. */
  ownerSeedGrams: number | null;
  role: 'standard' | 'main';
  /** Explicit relative share within a multi-Main group. Null never means
   * "infer from current grams"; unresolved groups use the global equal split. */
  mainRatioWeight: number | null;
  processScope: 'BASE_FORMULATION' | 'POST_PROCESS_ADDON';
  note: string;
}

export interface ExecutableRecipeTemplate {
  id: string;
  version: 1;
  library: ExecutableRecipeLibrary;
  category: 'najpopularniejsze' | 'polska';
  country: string | null;
  displayName: string;
  trademarkReviewRequired: boolean;
  publicationStage: 'owner_review';
  status: ExecutableRecipeTemplateStatus;
  productionStatus: ExecutableRecipeProductionStatus;
  labelStatus: ExecutableRecipeLabelStatus;
  blockers: readonly string[];
  productionBlockers: readonly string[];
  labelBlockers: readonly string[];
  profile: 'milk_gelato';
  servingModeId: 'temp_minus_11';
  targetTemperatureC: -11;
  formulationStrategy: 'optimal';
  baseTargetGrams: 1000;
  /** Null until the current process authority publishes an exact versioned process. */
  processId: string | null;
  technicalScore: number | null;
  baseCostPerKg: number | null;
  knownAllergens: readonly string[];
  finalAllergensComplete: boolean;
  removedOwnerSeedLines?: readonly {
    mapperIngredientId: string;
    ownerSeedGrams: number;
    reason: string;
  }[];
  base: readonly ExecutableRecipeLineSeed[];
  toppings: readonly ExecutableRecipeLineSeed[];
}

const core = {
  milk: 'PI-ING-000236',
  cream: 'PI-ING-000180',
  smp: 'PI-ING-000270',
  sucrose: 'PI-ING-000514',
  dextrose: 'PI-ING-000494',
  inulin: 'PI-ING-000456',
  tara: 'PI-ING-000492',
  salt: 'PI-ING-000458',
} as const;

const baseLine = (
  templateId: string,
  order: number,
  mapperIngredientId: string,
  grams: number,
  note: string,
  role: ExecutableRecipeLineSeed['role'] = 'standard',
  ownerSeedGrams = grams,
  mainRatioWeight: number | null = null,
): ExecutableRecipeLineSeed => ({
  lineId: `${templateId}-base-${order}`,
  mapperIngredientId,
  requiredProductForm: null,
  grams,
  ownerSeedGrams,
  role,
  mainRatioWeight,
  processScope: 'BASE_FORMULATION',
  note,
});

const toppingLine = (
  templateId: string,
  order: number,
  mapperIngredientId: string | null,
  grams: number,
  note: string,
  requiredProductForm: string | null = null,
): ExecutableRecipeLineSeed => ({
  lineId: `${templateId}-topping-${order}`,
  mapperIngredientId,
  requiredProductForm,
  grams,
  ownerSeedGrams: grams,
  role: 'standard',
  mainRatioWeight: null,
  processScope: 'POST_PROCESS_ADDON',
  note,
});

const unresolvedBaseLine = (
  templateId: string,
  order: number,
  requiredProductForm: string,
  note: string,
): ExecutableRecipeLineSeed => ({
  lineId: `${templateId}-base-${order}`,
  mapperIngredientId: null,
  requiredProductForm,
  grams: null,
  ownerSeedGrams: null,
  role: 'standard',
  mainRatioWeight: null,
  processScope: 'BASE_FORMULATION',
  note,
});

const id = {
  poland: 'lost-pl-smietankowe-z-zoltkami-v1',
  rocero: 'fantasy-rocero-v1',
  raphaello: 'fantasy-raphaello-v1',
  kidi: 'fantasy-kidi-bueno-v1',
  oreyo: 'fantasy-oreyo-v1',
  knickers: 'fantasy-knickers-v1',
} as const;

export const EXECUTABLE_RECIPE_TEMPLATES: readonly ExecutableRecipeTemplate[] = [
  {
    id: id.poland,
    version: 1,
    library: 'lost_legendary',
    category: 'polska',
    country: 'Polska',
    displayName: 'Śmietankowe na żółtkach',
    trademarkReviewRequired: false,
    publicationStage: 'owner_review',
    status: 'BLOCKED_EXACT_PRODUCT_DATA',
    productionStatus: 'PRODUCTION_BLOCKED',
    labelStatus: 'LABEL_BLOCKED',
    blockers: [
      'Brak dokładnego produktu Starter Pack: żółtko jaja w proszku z dawkowaniem i równoważnością świeżego żółtka.',
    ],
    productionBlockers: [
      'Brak wersjonowanego produktu żółtka w proszku, przeliczenia wody i zatwierdzonego procesu.',
    ],
    labelBlockers: [
      'Brak etykiety/specyfikacji produktu żółtka w proszku i finalnego przeliczenia receptury.',
    ],
    profile: 'milk_gelato',
    servingModeId: 'temp_minus_11',
    targetTemperatureC: -11,
    formulationStrategy: 'optimal',
    baseTargetGrams: 1000,
    processId: null,
    technicalScore: null,
    baseCostPerKg: null,
    knownAllergens: ['milk', 'egg'],
    finalAllergensComplete: false,
    base: [
      baseLine(id.poland, 1, core.milk, 555, 'Mleko 3,5%', 'standard', 550),
      baseLine(id.poland, 2, core.cream, 180, 'Śmietanka 30%'),
      unresolvedBaseLine(
        id.poland,
        3,
        'egg_yolk_powder_starter_pack',
        'Żółtko jaja w proszku Starter Pack; dawka i korekta wody oczekują na dokładną równoważność.',
      ),
      baseLine(id.poland, 4, core.smp, 30, 'Odtłuszczone mleko w proszku', 'standard', 35),
      baseLine(id.poland, 5, core.sucrose, 90, 'Sacharoza'),
      baseLine(id.poland, 6, core.dextrose, 50, 'Dekstroza'),
      baseLine(id.poland, 7, core.inulin, 13, 'Inulina'),
      baseLine(id.poland, 8, core.tara, 2, 'Guma tara'),
    ],
    toppings: [],
  },
  {
    id: id.rocero,
    version: 1,
    library: 'fantasy',
    category: 'najpopularniejsze',
    country: null,
    displayName: 'Rocero',
    trademarkReviewRequired: true,
    publicationStage: 'owner_review',
    status: 'OWNER_REVIEW_EDITABLE',
    productionStatus: 'PRODUCTION_BLOCKED',
    labelStatus: 'LABEL_BLOCKED',
    blockers: [],
    productionBlockers: [
      'Pasta z orzechów laskowych PI-ING-000419 ma MAIN_BLOCKED_POLICY.',
      'PI-ING-000829 nie jest udowodnioną własną kruszonką waflową; wymagany jest wersjonowany subprodukt Topping.',
      'Czekolada mleczna PI-ING-000118 nie ma udowodnionego zakresu post-process coating.',
    ],
    labelBlockers: [
      'Brak finalnych etykiet i deklaracji alergenów dla kruszonki waflowej, prażonych orzechów i polewy czekoladowej.',
    ],
    profile: 'milk_gelato',
    servingModeId: 'temp_minus_11',
    targetTemperatureC: -11,
    formulationStrategy: 'optimal',
    baseTargetGrams: 1000,
    processId: null,
    technicalScore: 89.16666666666667,
    baseCostPerKg: null,
    knownAllergens: ['milk', 'soy', 'hazelnut'],
    finalAllergensComplete: false,
    base: [
      baseLine(id.rocero, 1, core.milk, 573, 'Mleko 3,5%', 'standard', 533),
      baseLine(id.rocero, 2, core.cream, 80, 'Śmietanka 30%'),
      baseLine(id.rocero, 3, core.smp, 29, 'Odtłuszczone mleko w proszku', 'standard', 30),
      baseLine(id.rocero, 4, core.sucrose, 64, 'Sacharoza', 'standard', 70),
      baseLine(id.rocero, 5, core.dextrose, 40, 'Dekstroza', 'standard', 45),
      baseLine(id.rocero, 6, core.inulin, 50, 'Inulina'),
      baseLine(id.rocero, 7, 'PI-ING-000419', 83, 'Pasta z orzechów laskowych 100%', 'main', 100),
      baseLine(id.rocero, 8, 'PI-ING-000118', 74, 'Czekolada mleczna 33%', 'standard', 80),
      baseLine(id.rocero, 9, 'PI-ING-001579', 5, 'Odtłuszczone kakao 12%', 'standard', 10),
      baseLine(id.rocero, 10, core.tara, 2, 'Guma tara'),
    ],
    toppings: [
      toppingLine(id.rocero, 1, null, 45, 'Wafel', 'own_wafer_crumble'),
      toppingLine(id.rocero, 2, null, 25, 'Kawałki orzechów laskowych', 'roasted_hazelnut_pieces'),
      toppingLine(id.rocero, 3, null, 30, 'Czekolada mleczna', 'milk_chocolate_coating_or_ripple'),
    ],
  },
  {
    id: id.raphaello,
    version: 1,
    library: 'fantasy',
    category: 'najpopularniejsze',
    country: null,
    displayName: 'Raphaello',
    trademarkReviewRequired: true,
    publicationStage: 'owner_review',
    status: 'OWNER_REVIEW_EDITABLE',
    productionStatus: 'PRODUCTION_BLOCKED',
    labelStatus: 'LABEL_BLOCKED',
    blockers: [],
    productionBlockers: [
      'Pasty kokosowa PI-ING-000151 i migdałowa PI-ING-001512 mają MAIN_BLOCKED_POLICY.',
      'PI-ING-000829 nie jest udowodnioną własną lekką kruszonką waflową.',
      'Brak udowodnionego procesu prażenia dla Toppingu migdałowego.',
    ],
    labelBlockers: [
      'Brak finalnych etykiet i deklaracji alergenów dla wafla oraz prażonych migdałów; wiórki kokosowe wymagają dowodu producenta.',
    ],
    profile: 'milk_gelato',
    servingModeId: 'temp_minus_11',
    targetTemperatureC: -11,
    formulationStrategy: 'optimal',
    baseTargetGrams: 1000,
    processId: null,
    technicalScore: 89.16666666666667,
    baseCostPerKg: null,
    knownAllergens: ['milk', 'soy', 'almond'],
    finalAllergensComplete: false,
    base: [
      baseLine(id.raphaello, 1, core.milk, 574, 'Mleko 3,5%', 'standard', 520),
      baseLine(id.raphaello, 2, core.cream, 90, 'Śmietanka 30%', 'standard', 100),
      baseLine(id.raphaello, 3, core.smp, 25, 'Odtłuszczone mleko w proszku'),
      baseLine(id.raphaello, 4, core.sucrose, 80, 'Sacharoza'),
      baseLine(id.raphaello, 5, core.dextrose, 44, 'Dekstroza', 'standard', 45),
      baseLine(id.raphaello, 6, core.inulin, 45, 'Inulina'),
      baseLine(id.raphaello, 7, 'PI-ING-000151', 60, 'Pasta kokosowa 100%', 'main', 70, 2),
      baseLine(id.raphaello, 8, 'PI-ING-001512', 30, 'Pasta migdałowa 100%', 'main', 40, 1),
      baseLine(id.raphaello, 9, 'PI-ING-000142', 50, 'Biała czekolada', 'standard', 73),
      baseLine(id.raphaello, 10, core.tara, 2, 'Guma tara'),
    ],
    toppings: [
      toppingLine(id.raphaello, 1, 'PI-ING-000146', 50, 'Wiórki kokosowe'),
      toppingLine(id.raphaello, 2, null, 30, 'Lekki wafel', 'own_light_wafer_crumble'),
      toppingLine(id.raphaello, 3, null, 20, 'Prażone migdały', 'roasted_almond_pieces'),
    ],
  },
  {
    id: id.kidi,
    version: 1,
    library: 'fantasy',
    category: 'najpopularniejsze',
    country: null,
    displayName: 'Kidi Bueno',
    trademarkReviewRequired: true,
    publicationStage: 'owner_review',
    status: 'OWNER_REVIEW_EDITABLE',
    productionStatus: 'PRODUCTION_BLOCKED',
    labelStatus: 'LABEL_BLOCKED',
    blockers: [],
    productionBlockers: [
      'Pasta z orzechów laskowych PI-ING-000419 ma MAIN_BLOCKED_POLICY.',
      'PI-ING-000829 nie jest udowodnioną własną cienką kruszonką waflową.',
      'Czekolada mleczna PI-ING-000118 nie ma udowodnionego zakresu post-process coating.',
    ],
    labelBlockers: [
      'Brak finalnych etykiet i deklaracji alergenów dla wafla, prażonych orzechów i polewy czekoladowej.',
    ],
    profile: 'milk_gelato',
    servingModeId: 'temp_minus_11',
    targetTemperatureC: -11,
    formulationStrategy: 'optimal',
    baseTargetGrams: 1000,
    processId: null,
    technicalScore: 89.16666666666667,
    baseCostPerKg: 3.6696,
    knownAllergens: ['milk', 'soy', 'hazelnut'],
    finalAllergensComplete: false,
    base: [
      baseLine(id.kidi, 1, core.milk, 559, 'Mleko 3,5%', 'standard', 540),
      baseLine(id.kidi, 2, core.cream, 100, 'Śmietanka 30%'),
      baseLine(id.kidi, 3, core.smp, 30, 'Odtłuszczone mleko w proszku'),
      baseLine(id.kidi, 4, core.sucrose, 75, 'Sacharoza'),
      baseLine(id.kidi, 5, core.dextrose, 36, 'Dekstroza', 'standard', 45),
      baseLine(id.kidi, 6, core.inulin, 45, 'Inulina'),
      baseLine(id.kidi, 7, 'PI-ING-000419', 79, 'Pasta z orzechów laskowych 100%', 'main', 80),
      baseLine(id.kidi, 8, 'PI-ING-000118', 58, 'Czekolada mleczna 33%', 'standard', 60),
      baseLine(id.kidi, 9, 'PI-ING-000142', 16, 'Biała czekolada', 'standard', 23),
      baseLine(id.kidi, 10, core.tara, 2, 'Guma tara'),
    ],
    toppings: [
      toppingLine(id.kidi, 1, null, 50, 'Cienki wafel', 'own_thin_wafer_crumble'),
      toppingLine(id.kidi, 2, null, 20, 'Kawałki orzechów laskowych', 'roasted_hazelnut_pieces'),
      toppingLine(id.kidi, 3, null, 20, 'Czekolada mleczna', 'milk_chocolate_coating_or_ripple'),
    ],
  },
  {
    id: id.oreyo,
    version: 1,
    library: 'fantasy',
    category: 'najpopularniejsze',
    country: null,
    displayName: 'Oreyo',
    trademarkReviewRequired: true,
    publicationStage: 'owner_review',
    status: 'OWNER_REVIEW_EDITABLE',
    productionStatus: 'PRODUCTION_BLOCKED',
    labelStatus: 'LABEL_BLOCKED',
    blockers: [],
    productionBlockers: [
      'Brak wersjonowanego wewnętrznego subproduktu: ciemna kruszonka kakaowa.',
      'Brak wersjonowanego wewnętrznego subproduktu: ripple waniliowo-śmietankowy.',
      'Kakao PI-ING-001579 i wanilia PI-ING-001705 nie mają kompletnej polityki Main/process dla milk_gelato.',
    ],
    labelBlockers: [
      'Brak finalnych etykiet kruszonki kakaowej i ripple waniliowo-śmietankowego oraz dowodów alergenowych kakao i wanilii.',
    ],
    profile: 'milk_gelato',
    servingModeId: 'temp_minus_11',
    targetTemperatureC: -11,
    formulationStrategy: 'optimal',
    baseTargetGrams: 1000,
    processId: null,
    technicalScore: 97.5,
    baseCostPerKg: null,
    knownAllergens: ['milk'],
    finalAllergensComplete: false,
    base: [
      baseLine(id.oreyo, 1, core.milk, 622, 'Mleko 3,5%', 'standard', 623),
      baseLine(id.oreyo, 2, core.cream, 120, 'Śmietanka 30%'),
      baseLine(id.oreyo, 3, core.smp, 30, 'Odtłuszczone mleko w proszku'),
      baseLine(id.oreyo, 4, core.sucrose, 85, 'Sacharoza'),
      baseLine(id.oreyo, 5, core.dextrose, 45, 'Dekstroza'),
      baseLine(id.oreyo, 6, core.inulin, 50, 'Inulina'),
      baseLine(id.oreyo, 7, 'PI-ING-001579', 40, 'Odtłuszczone kakao 12%', 'main'),
      baseLine(id.oreyo, 8, 'PI-ING-001705', 5, 'Pasta waniliowa'),
      baseLine(id.oreyo, 9, core.salt, 1, 'Sól', 'standard', 0),
      baseLine(id.oreyo, 10, core.tara, 2, 'Guma tara'),
    ],
    toppings: [
      toppingLine(id.oreyo, 1, null, 70, 'Ciemna kruszonka kakaowa', 'own_dark_cocoa_cookie_crumble'),
      toppingLine(id.oreyo, 2, null, 30, 'Ripple waniliowo-śmietankowy', 'own_vanilla_cream_ripple'),
    ],
  },
  {
    id: id.knickers,
    version: 1,
    library: 'fantasy',
    category: 'najpopularniejsze',
    country: null,
    displayName: 'Knickers',
    trademarkReviewRequired: true,
    publicationStage: 'owner_review',
    status: 'OWNER_REVIEW_EDITABLE',
    productionStatus: 'PRODUCTION_BLOCKED',
    labelStatus: 'LABEL_BLOCKED',
    blockers: [],
    productionBlockers: [
      'Pasta z orzeszków ziemnych PI-ING-000437 ma MAIN_BLOCKED_POLICY.',
      'Brak udowodnionego procesu prażenia dla Toppingu orzeszków ziemnych.',
      'Czekolada mleczna PI-ING-000118 nie ma udowodnionego zakresu post-process coating.',
    ],
    labelBlockers: [
      'Brak finalnych etykiet i deklaracji alergenów dla prażonych orzeszków oraz czekoladowej polewy/kawałków.',
    ],
    profile: 'milk_gelato',
    servingModeId: 'temp_minus_11',
    targetTemperatureC: -11,
    formulationStrategy: 'optimal',
    baseTargetGrams: 1000,
    processId: null,
    technicalScore: 88.33333333333333,
    baseCostPerKg: 3.5903,
    knownAllergens: ['milk', 'soy', 'peanut', 'gluten_wheat', 'egg'],
    finalAllergensComplete: false,
    removedOwnerSeedLines: [{
      mapperIngredientId: core.dextrose,
      ownerSeedGrams: 40,
      reason: 'Usunięte przez najmniejszą korektę Engine; masa została przeniesiona do mleka.',
    }],
    base: [
      baseLine(id.knickers, 1, core.milk, 541, 'Mleko 3,5%', 'standard', 499),
      baseLine(id.knickers, 2, core.cream, 90, 'Śmietanka 30%'),
      baseLine(id.knickers, 3, core.smp, 25, 'Odtłuszczone mleko w proszku'),
      baseLine(id.knickers, 4, core.sucrose, 58, 'Sacharoza', 'standard', 60),
      baseLine(id.knickers, 6, core.inulin, 45, 'Inulina'),
      baseLine(id.knickers, 7, 'PI-ING-000437', 100, 'Pasta z orzeszków ziemnych 100%', 'main'),
      baseLine(id.knickers, 8, 'PI-ING-000308', 80, 'Karmel'),
      baseLine(id.knickers, 9, 'PI-ING-000118', 58, 'Czekolada mleczna 33%'),
      baseLine(id.knickers, 10, core.salt, 1, 'Sól'),
      baseLine(id.knickers, 11, core.tara, 2, 'Guma tara'),
    ],
    toppings: [
      toppingLine(id.knickers, 1, null, 35, 'Prażone orzeszki ziemne', 'roasted_peanut_pieces'),
      toppingLine(id.knickers, 2, 'PI-ING-000309', 55, 'Ripple karmelowe'),
      toppingLine(id.knickers, 3, null, 30, 'Czekolada mleczna', 'milk_chocolate_coating_or_pieces'),
    ],
  },
] as const;

const BY_ID = new Map(EXECUTABLE_RECIPE_TEMPLATES.map((template) => [template.id, template]));

/** Source-free catalogue directions are not silently equated with an exact
 * Batch 1 formulation. A mapping may be added only after explicit identity
 * review; until then Pro receives the honest missing-template state. */
export const EXECUTABLE_INSPIRATION_TEMPLATE_BY_FLAVOR: Readonly<Record<string, string>> = {};

export function executableRecipeTemplateById(idToFind: string): ExecutableRecipeTemplate | null {
  const template = BY_ID.get(idToFind);
  return template ? structuredClone(template) : null;
}

export function executableTemplateIdForInspiration(flavorCode: string): string | null {
  return EXECUTABLE_INSPIRATION_TEMPLATE_BY_FLAVOR[flavorCode] ?? null;
}

export function executableRecipeStartHref(
  templateId: string,
  persona: 'demo' | 'home' | 'pro',
  returnTo = '/recipes',
): string {
  const params = new URLSearchParams({
    source: 'executable_template',
    libraryTemplate: templateId,
    returnTo,
  });
  return `${persona === 'pro' ? '/pro/recipe' : '/start'}?${params.toString()}`;
}

export function recipeTemplateBaseTotal(template: ExecutableRecipeTemplate): number | null {
  if (template.base.some((line) => line.grams === null)) return null;
  return template.base.reduce((total, line) => total + (line.grams ?? 0), 0);
}

export function recipeTemplateToppingTotal(template: ExecutableRecipeTemplate): number {
  return template.toppings.reduce((total, line) => total + (line.grams ?? 0), 0);
}

/** Safe owner-review card projection. Branded Owner references are report-only
 * research data and never enter this client registry. */
export function executableRecipeCard(template: ExecutableRecipeTemplate) {
  return {
    id: template.id,
    version: template.version,
    library: template.library,
    category: template.category,
    country: template.country,
    displayName: template.displayName,
    status: template.status,
    blockers: [...template.blockers],
    baseGrams: recipeTemplateBaseTotal(template),
    toppingGrams: recipeTemplateToppingTotal(template),
    finalMassGrams: recipeTemplateBaseTotal(template) === null
      ? null
      : recipeTemplateBaseTotal(template)! + recipeTemplateToppingTotal(template),
    publicationStage: template.publicationStage,
    trademarkReviewRequired: template.trademarkReviewRequired,
    technicalScore: template.technicalScore,
    baseCostPerKg: template.baseCostPerKg,
    processId: template.processId,
    ownerReviewStatus: template.status,
    productionStatus: template.productionStatus,
    productionBlockers: [...template.productionBlockers],
    labelStatus: template.labelStatus,
    labelBlockers: [...template.labelBlockers],
    knownAllergens: [...template.knownAllergens],
    finalAllergensComplete: template.finalAllergensComplete,
  };
}
