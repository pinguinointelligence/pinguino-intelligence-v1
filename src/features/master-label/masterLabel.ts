import {
  buildNutritionDeclaration,
  type LabelNutritionPer100g,
  type NutritionDeclaration,
} from '@/data/label/nutritionLabel';
import {
  productionLotCodeForRun,
  type ProductionCompletionSnapshot,
} from '@/features/production-workspace/productionSession';
import {
  buildRecipeBehaviorAuthority,
  recipeBehaviorModuleGate,
} from '@/features/product-intelligence';
import { marketProfile, type MarketProfileCode, type MasterLabelFieldId } from './marketProfiles';
import {
  assessCanadaFop,
  defaultRegulatoryNutrition,
  regulatoryNutritionReadiness,
  type RegulatoryNutritionInputs,
} from './regulatoryNutrition';
import {
  DEFAULT_PRINTER_SETTINGS,
  normalizePrinterSettings,
  printerGeometryIssues,
  type LabelPrinterSettings,
} from './printerProfiles';

export type LabelLanguageTag = string;

export interface MultilingualText {
  [languageTag: LabelLanguageTag]: string;
}

export interface FacilityDefaults {
  operatorName: string;
  facilityName: string;
  address: string;
  countryCode: string;
  contact: string;
  registrationIds: string[];
}

export interface IngredientAllergenEvidence {
  canonicalIngredientId: string;
  status: 'verified' | 'unknown' | 'missing';
  allergens: string[];
  mayContain: string[];
  sourceRevision: string | null;
}

export interface MasterLabelIngredient {
  lineId: string;
  canonicalIngredientId: string | null;
  names: MultilingualText;
  actualGrams: number;
  percent: number;
  allergenEvidenceStatus: IngredientAllergenEvidence['status'];
  allergenSourceRevision: string | null;
  sourceIngredientsText: string | null;
  sourceAllergensText: string | null;
}

export interface MasterLabelData {
  schemaVersion: 1;
  masterLabelId: string;
  sourceCompletionSessionId: string;
  sourceCompletedAt: string;
  purpose: 'retail_consumer' | 'internal_production' | 'display_gelateria';
  packagingContext: 'prepacked' | 'ppds' | 'loose_non_prepacked';
  market: MarketProfileCode;
  marketProfileVersion: string;
  uiLanguage: string;
  labelLanguages: string[];
  productName: MultilingualText;
  legalProductName: MultilingualText;
  businessName: string;
  /** Private owner-scoped storage path, never inline image bytes. */
  logoPath: string | null;
  ingredients: MasterLabelIngredient[];
  allergens: {
    status: 'complete' | 'incomplete';
    declared: string[];
    mayContain: string[];
    labelStatements: string[];
    reviewedByUser: boolean;
  };
  nutritionSource: LabelNutritionPer100g | null;
  nutritionDeclaration: NutritionDeclaration | null;
  regulatoryNutrition: RegulatoryNutritionInputs;
  netQuantityG: number | null;
  servingQuantityG: number | null;
  productionDate: string;
  productionDateReviewed: boolean;
  dateMark: {
    kind: 'unresolved' | 'best_before' | 'use_by';
    date: string | null;
    basis: 'none' | 'manual' | 'validated_rule';
    reviewedByUser: boolean;
  };
  storageInstructions: MultilingualText;
  useInstructions: MultilingualText;
  operator: FacilityDefaults;
  lotCode: string;
  origin: MultilingualText;
  customerNote: MultilingualText;
  enabledOptionalFields: MasterLabelFieldId[];
  format: 'rectangle' | 'round';
  size: { widthMm: number; heightMm: number };
  copies: number;
  systemPrinter: 'system';
  printer: LabelPrinterSettings;
  regulatoryReview: {
    translations: boolean;
    ingredientOrderAndQuid: boolean;
    marketSpecific: boolean;
  };
  preflightAcknowledged: boolean;
}

export interface BuildMasterLabelInput {
  masterLabelId: string;
  snapshot: ProductionCompletionSnapshot;
  market: MarketProfileCode;
  uiLanguage: string;
  labelLanguages: string[];
  facilityDefaults?: Partial<FacilityDefaults>;
  businessName?: string;
  logoPath?: string | null;
  enabledOptionalFields?: MasterLabelFieldId[];
  presentation?: Partial<Pick<MasterLabelData, 'format' | 'size' | 'copies'>>;
  printer?: Partial<LabelPrinterSettings>;
}

export function normalizeEnabledOptionalFields(
  market: MarketProfileCode,
  fields: readonly MasterLabelFieldId[],
): MasterLabelFieldId[] {
  const allowed = marketProfile(market).optionalFields;
  return [...new Set(fields.filter((field) => allowed.includes(field)))];
}

const isInternalNoAllergenDeclaration = (value: string): boolean =>
  ['none_declared', 'none declared'].includes(value.trim().toLowerCase());

const emptyFacility = (): FacilityDefaults => ({
  operatorName: '',
  facilityName: '',
  address: '',
  countryCode: '',
  contact: '',
  registrationIds: [],
});

function translated(value: string, languages: readonly string[]): MultilingualText {
  return Object.fromEntries(languages.map((language) => [language, value]));
}

export function buildMasterLabelData(input: BuildMasterLabelInput): MasterLabelData {
  const { snapshot } = input;
  const behaviorAuthority = buildRecipeBehaviorAuthority({
    items: snapshot.finalActualInput.items,
    toppings: snapshot.productComposition.toppings,
    snapshots: snapshot.productComposition.behaviorSnapshots ?? {},
  });
  const behaviorGate = recipeBehaviorModuleGate(behaviorAuthority, 'MASTER_LABEL');
  if (!behaviorGate.ready) {
    throw new Error(
      `master_label_behavior_authority_required:${behaviorGate.blockedLineIds.join(',')}`,
    );
  }
  const profile = marketProfile(input.market);
  const languages = input.labelLanguages.length > 0 ? [...new Set(input.labelLanguages)] : ['pl'];
  const total = snapshot.finalProduct.finalMassG;
  // Legal declaration order is mass-descending and independent of the manual
  // Base/Topping UI order. The same canonical product may validly exist once
  // in each scope, but it is one ingredient in the final product declaration.
  const declarationLines = new Map<
    string,
    {
      lineId: string;
      canonicalId: string | null;
      name: string;
      grams: number;
      sourceIngredientsText: string | null;
      sourceAllergensText: string | null;
      labelEvidenceVerified: boolean;
      allergenSourceRevision: string | null;
      declared: string[];
      mayContain: string[];
    }
  >();
  for (const item of snapshot.finalProduct.items.filter((row) => row.effective_grams > 0)) {
    const canonicalId = item.ingredient.canonical_ingredient_id ?? item.ingredient.id ?? null;
    const frozenAllergens = behaviorAuthority.snapshots[item.id]?.sharedFacts?.allergens ?? null;
    const key = canonicalId ? `canonical:${canonicalId}` : `line:${item.id}`;
    const existing = declarationLines.get(key);
    if (existing) {
      existing.grams += item.effective_grams;
      existing.lineId = `${existing.lineId}+${item.id}`;
      existing.sourceIngredientsText ??= frozenAllergens?.ingredientsText ?? null;
      existing.sourceAllergensText ??= frozenAllergens?.allergensText ?? null;
      existing.labelEvidenceVerified ||= frozenAllergens !== null;
      existing.allergenSourceRevision ??= frozenAllergens?.evidenceVersion ?? null;
      existing.declared = [
        ...new Set([...existing.declared, ...(frozenAllergens?.declared ?? [])]),
      ];
      existing.mayContain = [
        ...new Set([...existing.mayContain, ...(frozenAllergens?.mayContain ?? [])]),
      ];
    } else {
      declarationLines.set(key, {
        lineId: item.id,
        canonicalId,
        name: item.ingredient.name,
        grams: item.effective_grams,
        sourceIngredientsText: frozenAllergens?.ingredientsText ?? null,
        sourceAllergensText: frozenAllergens?.allergensText ?? null,
        labelEvidenceVerified: frozenAllergens !== null,
        allergenSourceRevision: frozenAllergens?.evidenceVersion ?? null,
        declared: [...(frozenAllergens?.declared ?? [])],
        mayContain: [...(frozenAllergens?.mayContain ?? [])],
      });
    }
  }
  const ingredients: MasterLabelIngredient[] = [...declarationLines.values()]
    .sort((a, b) => b.grams - a.grams)
    .map((item) => {
      const canonicalId = item.canonicalId;
      const embeddedEvidenceStatus: IngredientAllergenEvidence['status'] =
        item.labelEvidenceVerified ? 'verified' : 'missing';
      const declarationName = item.sourceIngredientsText?.trim() || item.name;
      return {
        lineId: item.lineId,
        canonicalIngredientId: canonicalId,
        names: translated(declarationName, languages),
        actualGrams: item.grams,
        percent: total > 0 ? (item.grams / total) * 100 : 0,
        allergenEvidenceStatus: embeddedEvidenceStatus,
        allergenSourceRevision: item.allergenSourceRevision,
        sourceIngredientsText: item.sourceIngredientsText,
        sourceAllergensText: item.sourceAllergensText,
      };
    });
  const allergenComplete =
    ingredients.length > 0 &&
    ingredients.every((item) => item.allergenEvidenceStatus === 'verified');
  const declared = [
    ...new Set([...declarationLines.values()].flatMap((item) => item.declared)),
  ].sort();
  const mayContain = [
    ...new Set([...declarationLines.values()].flatMap((item) => item.mayContain)),
  ].sort();
  const labelStatements = [
    ...new Set(
      ingredients
        .map((item) => item.sourceAllergensText?.trim())
        .filter((item): item is string => Boolean(item) && !isInternalNoAllergenDeclaration(item!)),
    ),
  ];
  const facility = { ...emptyFacility(), ...input.facilityDefaults };
  const completedDate = snapshot.productionCompletedAt.slice(0, 10);

  return {
    schemaVersion: 1,
    masterLabelId: input.masterLabelId,
    sourceCompletionSessionId: snapshot.sessionId,
    sourceCompletedAt: snapshot.productionCompletedAt,
    purpose: 'retail_consumer',
    packagingContext: 'prepacked',
    market: input.market,
    marketProfileVersion: profile.version,
    uiLanguage: input.uiLanguage,
    labelLanguages: languages,
    productName: translated(snapshot.source.recipeName, languages),
    legalProductName: translated('', languages),
    businessName: input.businessName ?? '',
    logoPath: input.logoPath ?? null,
    ingredients,
    allergens: {
      status: allergenComplete ? 'complete' : 'incomplete',
      declared,
      mayContain,
      labelStatements,
      reviewedByUser: false,
    },
    nutritionSource:
      snapshot.finalProduct.labelNutritionPer100g ?? snapshot.finalProduct.nutritionPer100g,
    nutritionDeclaration: buildNutritionDeclaration(
      snapshot.finalProduct.labelNutritionPer100g ?? snapshot.finalProduct.nutritionPer100g,
    ),
    regulatoryNutrition: defaultRegulatoryNutrition(
      snapshot.finalProduct.labelNutritionPer100g ?? snapshot.finalProduct.nutritionPer100g,
      languages,
    ),
    // Owner closeout: a run label starts from the ACTUAL completed product,
    // including toppings and any Rescue scale-up. The operator can still edit
    // this when the physical batch is split into smaller consumer packages.
    netQuantityG: snapshot.actualFinalMassG,
    servingQuantityG: null,
    productionDate: completedDate,
    productionDateReviewed: false,
    dateMark: {
      kind: 'unresolved',
      date: null,
      basis: 'none',
      reviewedByUser: false,
    },
    storageInstructions: translated('', languages),
    useInstructions: translated('', languages),
    operator: facility,
    lotCode:
      snapshot.lotCode ??
      productionLotCodeForRun(snapshot.sessionId, snapshot.productionCompletedAt),
    origin: translated('', languages),
    customerNote: translated(snapshot.customerLabelNote, languages),
    enabledOptionalFields: normalizeEnabledOptionalFields(
      input.market,
      input.enabledOptionalFields ?? (snapshot.customerLabelNote ? ['customer_note'] : []),
    ),
    format: input.presentation?.format ?? 'rectangle',
    size: input.presentation?.size ?? { widthMm: 90, heightMm: 60 },
    copies: input.presentation?.copies ?? 1,
    systemPrinter: 'system',
    printer: normalizePrinterSettings({
      ...DEFAULT_PRINTER_SETTINGS,
      ...input.printer,
      widthMm: input.presentation?.size?.widthMm ?? 90,
      heightMm: input.presentation?.size?.heightMm ?? 60,
      copies: input.presentation?.copies ?? 1,
    }),
    regulatoryReview: {
      translations: false,
      ingredientOrderAndQuid: false,
      marketSpecific: false,
    },
    preflightAcknowledged: false,
  };
}

export interface LabelPreflightItem {
  field:
    | MasterLabelFieldId
    | 'profile'
    | 'languages'
    | 'market_nutrition'
    | 'canada_fop'
    | 'geometry'
    | 'printer'
    | 'regulatory_review'
    | 'acknowledgement';
  status: 'ready' | 'missing' | 'review' | 'research';
  label: string;
  message: string;
}

export interface LabelPreflight {
  items: LabelPreflightItem[];
  missingCount: number;
  reviewCount: number;
  readyForSystemPrint: boolean;
  regulatoryProfileVerified: boolean;
}

const hasEveryLanguage = (value: MultilingualText, languages: readonly string[]): boolean =>
  languages.every((language) => (value[language] ?? '').trim().length > 0);

function fieldReadiness(data: MasterLabelData, field: MasterLabelFieldId): LabelPreflightItem {
  const ready = (label: string): LabelPreflightItem => ({
    field,
    status: 'ready',
    label,
    message: 'Gotowe',
  });
  const missing = (label: string, message: string): LabelPreflightItem => ({
    field,
    status: 'missing',
    label,
    message,
  });
  switch (field) {
    case 'product_name':
      return hasEveryLanguage(data.productName, data.labelLanguages)
        ? ready('Nazwa produktu')
        : missing('Nazwa produktu', 'Uzupełnij nazwę w każdym języku etykiety.');
    case 'legal_product_name':
      return hasEveryLanguage(data.legalProductName, data.labelLanguages)
        ? ready('Nazwa prawna')
        : missing('Nazwa prawna', 'Wymaga wyboru właściwej nazwy prawnej produktu.');
    case 'ingredients':
      return data.ingredients.length > 0 &&
        data.ingredients.every((item) => item.canonicalIngredientId)
        ? ready('Składniki')
        : missing('Składniki', 'Brakuje składników lub canonical ID.');
    case 'allergens':
      return data.allergens.status === 'complete' && data.allergens.reviewedByUser
        ? ready('Alergeny')
        : missing('Alergeny', 'WYMAGA WERYFIKACJI — dane są niepełne lub niepotwierdzone.');
    case 'nutrition':
      return data.nutritionDeclaration
        ? ready('Nutrition')
        : missing('Nutrition', 'Brak obliczeń Nutrition.');
    case 'net_quantity':
      return data.netQuantityG !== null && data.netQuantityG > 0
        ? ready('Masa netto')
        : missing(
            'Masa netto',
            'Podaj masę opakowania; masa partii nie jest masą netto opakowania.',
          );
    case 'operator':
      return data.operator.operatorName.trim() && data.operator.address.trim()
        ? ready('Operator')
        : missing('Operator', 'Uzupełnij nazwę i adres operatora.');
    case 'storage':
      return hasEveryLanguage(data.storageInstructions, data.labelLanguages)
        ? ready('Przechowywanie')
        : missing('Przechowywanie', 'Uzupełnij instrukcję w każdym języku etykiety.');
    case 'date_mark':
      return data.dateMark.kind !== 'unresolved' &&
        data.dateMark.date &&
        data.dateMark.reviewedByUser
        ? ready('Data trwałości')
        : missing(
            'Data trwałości',
            'WYMAGA POTWIERDZENIA — PINGÜINO nie wylicza trwałości bez podstawy.',
          );
    case 'lot':
      return data.lotCode.trim() ? ready('LOT') : missing('LOT', 'Uzupełnij identyfikator partii.');
    case 'logo':
      return data.logoPath
        ? ready('Logo')
        : missing('Logo', 'Pole opcjonalne nie jest uzupełnione.');
    case 'origin':
      return hasEveryLanguage(data.origin, data.labelLanguages)
        ? ready('Pochodzenie')
        : missing('Pochodzenie', 'Pole opcjonalne nie jest uzupełnione.');
    case 'customer_note':
      return hasEveryLanguage(data.customerNote, data.labelLanguages)
        ? ready('Notatka dla klienta')
        : missing('Notatka dla klienta', 'Pole opcjonalne nie jest uzupełnione.');
  }
}

export function buildLabelPreflight(data: MasterLabelData): LabelPreflight {
  const profile = marketProfile(data.market);
  const requiredFields =
    data.purpose === 'retail_consumer'
      ? profile.requiredFields
      : data.purpose === 'internal_production'
        ? (['product_name', 'ingredients', 'allergens', 'lot', 'storage'] as const)
        : (['product_name', 'allergens', 'operator'] as const);
  const required = requiredFields.map((field) => fieldReadiness(data, field));
  const requiredLanguages =
    profile.requiredLanguages.length > 0 ? profile.requiredLanguages : data.labelLanguages;
  const languagesReady =
    requiredLanguages.length > 0 &&
    requiredLanguages.every((language) => data.labelLanguages.includes(language));
  const nutritionReadiness = regulatoryNutritionReadiness(
    data.market,
    data.nutritionSource,
    data.regulatoryNutrition,
    requiredLanguages,
  );
  const canadaFop = assessCanadaFop(data.nutritionSource, data.regulatoryNutrition);
  const printerIssues = printerGeometryIssues(data.printer);
  const minimum = profile.minimumLabel;
  const geometryReady =
    data.size.widthMm >= minimum.widthMm && data.size.heightMm >= minimum.heightMm;
  const retail = data.purpose === 'retail_consumer';
  const items: LabelPreflightItem[] = [
    {
      field: 'profile',
      status: profile.status === 'VERIFIED' && profile.selectable ? 'ready' : 'research',
      label: `Profil ${profile.label}`,
      message:
        profile.status === 'VERIFIED'
          ? 'Profil regulacyjny zweryfikowany.'
          : 'Profil jest badawczy i niedostępny do wydruku.',
    },
    {
      field: 'languages',
      status:
        !retail || (languagesReady && data.regulatoryReview.translations) ? 'ready' : 'missing',
      label: 'Języki etykiety',
      message:
        !retail || (languagesReady && data.regulatoryReview.translations)
          ? 'Wymagane języki i tłumaczenia potwierdzone.'
          : `Wymagane języki: ${requiredLanguages.join(', ')}; potwierdź tłumaczenia.`,
    },
    ...required,
    {
      field: 'market_nutrition',
      status: !retail || nutritionReadiness.ready ? 'ready' : 'missing',
      label: `Nutrition · ${profile.nutritionFormat}`,
      message:
        !retail || nutritionReadiness.ready
          ? 'Kompletny zestaw danych dla układu rynku.'
          : nutritionReadiness.missing.join(' '),
    },
    ...(data.market === 'CA' && retail
      ? [
          {
            field: 'canada_fop' as const,
            status:
              canadaFop.state === 'unresolved' ||
              (canadaFop.state === 'required' && !data.regulatoryNutrition.canadaFopAssetId)
                ? ('missing' as const)
                : ('ready' as const),
            label: 'Canada FOP',
            message:
              canadaFop.state === 'required' && !data.regulatoryNutrition.canadaFopAssetId
                ? `Symbol wymagany (${canadaFop.highIn.join(', ')}), ale brak zatwierdzonego pliku graficznego Health Canada.`
                : canadaFop.state === 'required'
                  ? `Symbol wymagany: ${canadaFop.highIn.join(', ')}.`
                  : canadaFop.reason,
          },
        ]
      : []),
    {
      field: 'geometry',
      status: !retail || geometryReady ? 'ready' : 'missing',
      label: 'Rozmiar i minimalna czytelność',
      message:
        !retail || geometryReady
          ? `Format ${data.size.widthMm} × ${data.size.heightMm} mm; minimum x-height ${minimum.xHeightMm} mm.`
          : `Ta etykieta jest za mała dla wybranego rynku. Minimum profilu: ${minimum.widthMm} × ${minimum.heightMm} mm.`,
    },
    {
      field: 'printer',
      status: printerIssues.length === 0 ? 'ready' : 'missing',
      label: 'Profil drukarki',
      message: printerIssues.length === 0 ? 'Geometria drukarki zgodna.' : printerIssues.join(' '),
    },
    {
      field: 'regulatory_review',
      status:
        !retail ||
        (data.regulatoryReview.ingredientOrderAndQuid && data.regulatoryReview.marketSpecific)
          ? 'ready'
          : 'review',
      label: 'Kontrola rynku',
      message:
        !retail ||
        (data.regulatoryReview.ingredientOrderAndQuid && data.regulatoryReview.marketSpecific)
          ? 'Kolejność/QUID i wymagania rynku potwierdzone.'
          : 'Potwierdź kolejność składników/QUID oraz wymagania właściwe dla rynku.',
    },
    {
      field: 'acknowledgement',
      status: data.preflightAcknowledged ? 'ready' : 'review',
      label: 'Kontrola użytkownika',
      message: data.preflightAcknowledged
        ? 'Dane sprawdzone przed wydrukiem.'
        : 'Zaznacz: Sprawdziłem dane etykiety przed wydrukiem.',
    },
  ];
  const missingCount = items.filter((item) => item.status === 'missing').length;
  const reviewCount = items.filter(
    (item) => item.status === 'review' || item.status === 'research',
  ).length;
  const regulatoryProfileVerified = profile.status === 'VERIFIED' && profile.selectable;
  return {
    items,
    missingCount,
    reviewCount,
    readyForSystemPrint:
      missingCount === 0 &&
      reviewCount === 0 &&
      data.preflightAcknowledged &&
      regulatoryProfileVerified,
    regulatoryProfileVerified,
  };
}

export function requestFieldRemoval(
  data: MasterLabelData,
  field: MasterLabelFieldId,
): { data: MasterLabelData; warning: string | null } {
  const profile = marketProfile(data.market);
  if (profile.requiredFields.includes(field)) {
    return { data, warning: 'To pole jest wymagane dla wybranego rynku.' };
  }
  return {
    data: {
      ...data,
      enabledOptionalFields: data.enabledOptionalFields.filter((candidate) => candidate !== field),
    },
    warning: null,
  };
}

export function addOptionalField(
  data: MasterLabelData,
  field: MasterLabelFieldId,
): MasterLabelData {
  if (!marketProfile(data.market).optionalFields.includes(field)) return data;
  if (data.enabledOptionalFields.includes(field)) return data;
  return { ...data, enabledOptionalFields: [...data.enabledOptionalFields, field] };
}
