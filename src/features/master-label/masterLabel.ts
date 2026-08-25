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
import {
  marketProfile,
  type MarketProfileCode,
  type MasterLabelFieldId,
  type PrintReadiness,
} from './marketProfiles';
import {
  assessLabelGeometry,
  PRACTICAL_LABEL_SIZES,
  smallestValidLabelSize,
} from './labelGeometry';
import { marketAllergenDeclarationIssues, unresolvedMarketAllergens } from './allergenTaxonomy';
import { normalizeConfirmedGtin } from './machineCodes';
import { isEuMemberStateCode, responsibleBusinessDetails } from './businessAuthority';
import {
  assessCanadaFop,
  defaultRegulatoryNutrition,
  regulatoryNutritionReadiness,
  resolveUsFormatFamily,
  usServingAndFormatIssues,
  canadaNftFormatIssues,
  type RegulatoryNutritionInputs,
} from './regulatoryNutrition';
import {
  DEFAULT_PRINTER_SETTINGS,
  PRINTER_PROFILES,
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
  website?: string;
  operatorRole?:
    | 'producer'
    | 'manufacturer'
    | 'packer'
    | 'distributor'
    | 'importer'
    | 'dealer'
    | 'supplier';
  importerName?: string;
  importerAddress?: string;
  importerCountryCode?: string;
  distributorName?: string;
  distributorAddress?: string;
  distributorCountryCode?: string;
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
  compound?: {
    displayName: MultilingualText;
    components: Array<{ names: MultilingualText; actualGrams: number | null }>;
    componentsDeclared: boolean;
  } | null;
  quid?: {
    required: boolean;
    percentage: number | null;
    reason: string;
    reviewedByUser: boolean;
  };
}

export type PackageQuantityUnit = 'g' | 'kg' | 'ml' | 'l' | 'oz' | 'fl_oz';

export interface LabelPackageQuantity {
  value: number;
  unit: PackageQuantityUnit;
  netWeightG: number | null;
  netVolumeMl: number | null;
  source: 'selected_fill' | 'measured_fill' | 'legacy_snapshot';
  confirmedAt: string | null;
}

export interface ShelfLifeAuthority {
  policyId: string | null;
  authority: string;
  method: 'none' | 'manual_date' | 'validated_rule';
  shelfLifeDays: number | null;
  reviewedByUser: boolean;
}

export interface LabelJurisdictionContext {
  /** Destination Member State authority for language and national overlays; not a new profile. */
  euDestinationCountryCode: string;
  ukRegion: 'GB' | 'NI' | 'unresolved';
  auNzCountry: 'AU' | 'NZ' | 'unresolved';
  usSaleContext: 'interstate_retail' | 'food_service' | 'unresolved';
}

export interface MasterLabelData {
  schemaVersion: 1;
  masterLabelId: string;
  sourceCompletionSessionId: string;
  sourceCompletedAt: string;
  sourceRecipeVersionId?: string | null;
  sourceRecipeVersionNumber?: number | null;
  actualBatchQuantityG?: number;
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
  /** Selected consumer-package fill. Never infer this from the batch size. */
  packageQuantity?: LabelPackageQuantity | null;
  shelfLifeAuthority?: ShelfLifeAuthority;
  /** Legacy projection for old snapshots and existing UI adapters. */
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
  shortDescription?: MultilingualText;
  qrCodeValue?: string | null;
  gtin?: string | null;
  internalArticleId?: string | null;
  alcoholByVolumePercent?: number | null;
  alcoholDeclarationReviewed?: boolean;
  alcoholDeclarationApplicability?:
    | 'unresolved'
    | 'not_applicable_non_beverage'
    | 'required_beverage_over_1_2';
  enabledOptionalFields: MasterLabelFieldId[];
  format: 'rectangle' | 'round';
  size: { widthMm: number; heightMm: number };
  copies: number;
  systemPrinter: 'system';
  printer: LabelPrinterSettings;
  layoutMode?: 'auto' | 'manual';
  availableDisplaySurfaceCm2?: number | null;
  jurisdictionContext?: LabelJurisdictionContext;
  regulatoryReview: {
    translations: boolean;
    ingredientOrderAndQuid: boolean;
    marketSpecific: boolean;
  };
  preflightAcknowledged: boolean;
  snapshotEvidence?: {
    printReadiness: Exclude<PrintReadiness, 'NOT_READY'>;
    rendererVersion: string;
    regulatoryProfileVersion: string;
    geometry: {
      widthMm: number;
      heightMm: number;
      baseFontPt: number;
      xHeightMm: number;
    };
    printer: LabelPrinterSettings;
    packageQuantity: LabelPackageQuantity;
  } | null;
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
  packageQuantity?: LabelPackageQuantity | null;
  shelfLifeAuthority?: ShelfLifeAuthority;
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

function euEnergyKjPer100g(snapshot: ProductionCompletionSnapshot): number | null {
  const total = snapshot.finalProduct.finalMassG;
  if (!(total > 0)) return null;
  let totalKj = 0;
  for (const item of snapshot.finalProduct.items) {
    if (!('composition' in item.ingredient)) return null;
    const composition = item.ingredient.composition;
    const carbohydrateExPolyol = Math.max(
      0,
      composition.carbohydrate_percent - composition.polyol_percent,
    );
    const kjPer100g =
      composition.fat_percent * 37 +
      composition.protein_percent * 17 +
      carbohydrateExPolyol * 17 +
      composition.polyol_percent * 10 +
      composition.fiber_percent * 8 +
      composition.alcohol_percent * 29;
    totalKj += (item.effective_grams * kjPer100g) / 100;
  }
  return (totalKj / total) * 100;
}

const emptyFacility = (): FacilityDefaults => ({
  operatorName: '',
  facilityName: '',
  address: '',
  countryCode: '',
  contact: '',
  registrationIds: [],
  website: '',
  operatorRole: 'producer',
  importerName: '',
  importerAddress: '',
  importerCountryCode: '',
  distributorName: '',
  distributorAddress: '',
  distributorCountryCode: '',
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
  const languages =
    input.labelLanguages.length > 0
      ? [...new Set(input.labelLanguages)]
      : [input.market === 'WORLD' ? 'en' : 'pl'];
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
  const nutrition =
    snapshot.finalProduct.labelNutritionPer100g ?? snapshot.finalProduct.nutritionPer100g;
  const marketEnergyKj = euEnergyKjPer100g(snapshot);
  const regulatoryNutrition = {
    ...defaultRegulatoryNutrition(nutrition, languages),
    energyKjPer100g: marketEnergyKj,
    energyAuthority:
      marketEnergyKj === null ? ('unresolved' as const) : ('market_factors' as const),
  };

  return {
    schemaVersion: 1,
    masterLabelId: input.masterLabelId,
    sourceCompletionSessionId: snapshot.sessionId,
    sourceCompletedAt: snapshot.productionCompletedAt,
    sourceRecipeVersionId: snapshot.source.recipeVersionId,
    sourceRecipeVersionNumber: snapshot.source.recipeVersionNumber,
    actualBatchQuantityG: snapshot.actualFinalMassG,
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
    nutritionSource: nutrition,
    nutritionDeclaration: buildNutritionDeclaration(nutrition),
    regulatoryNutrition,
    // Package fill is a separate operator choice. The completed batch mass is
    // evidence above, but is never silently reused as consumer net quantity.
    packageQuantity: input.packageQuantity ?? null,
    netQuantityG: input.packageQuantity?.netWeightG ?? null,
    servingQuantityG: null,
    productionDate: completedDate,
    productionDateReviewed: true,
    shelfLifeAuthority:
      input.shelfLifeAuthority ??
      ({
        policyId: null,
        authority: '',
        method: 'none',
        shelfLifeDays: null,
        reviewedByUser: false,
      } satisfies ShelfLifeAuthority),
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
    shortDescription: translated('', languages),
    qrCodeValue: null,
    gtin: null,
    internalArticleId: null,
    alcoholByVolumePercent: null,
    alcoholDeclarationReviewed: false,
    alcoholDeclarationApplicability: 'unresolved',
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
    layoutMode: 'auto',
    availableDisplaySurfaceCm2: null,
    jurisdictionContext: {
      euDestinationCountryCode: '',
      ukRegion: 'unresolved',
      auNzCountry: 'unresolved',
      usSaleContext: 'unresolved',
    },
    regulatoryReview: {
      translations: false,
      ingredientOrderAndQuid: false,
      marketSpecific: false,
    },
    preflightAcknowledged: false,
    snapshotEvidence: null,
  };
}

/**
 * Forward-hydrate immutable label snapshots written before newer print and
 * regulatory fields existed. The stored snapshot is never rewritten: missing
 * authority becomes an explicit fail-closed default in the runtime view.
 */
export function normalizeMasterLabelData(value: MasterLabelData): MasterLabelData {
  const legacy = value as Partial<MasterLabelData>;
  const legacyMarket = (legacy.market as string | undefined) ?? 'WORLD';
  const market: MarketProfileCode = ['EU', 'UK', 'US', 'CA', 'AU_NZ', 'WORLD'].includes(
    legacyMarket,
  )
    ? (legacyMarket as MarketProfileCode)
    : 'WORLD';
  const labelLanguages =
    legacy.labelLanguages && legacy.labelLanguages.length > 0
      ? legacy.labelLanguages
      : [market === 'WORLD' ? 'en' : 'pl'];
  const nutritionSource = legacy.nutritionSource ?? null;
  const regulatoryDefaults = defaultRegulatoryNutrition(nutritionSource, labelLanguages);
  const regulatoryNutrition = legacy.regulatoryNutrition as
    | Partial<RegulatoryNutritionInputs>
    | undefined;
  const size = legacy.size ?? { widthMm: 90, heightMm: 60 };
  const copies = legacy.copies ?? 1;
  return {
    ...value,
    market,
    marketProfileVersion:
      legacyMarket === market ? value.marketProfileVersion : marketProfile(market).version,
    purpose: legacy.purpose ?? 'retail_consumer',
    packagingContext: legacy.packagingContext ?? 'prepacked',
    labelLanguages,
    regulatoryNutrition: {
      ...regulatoryDefaults,
      ...regulatoryNutrition,
      servingDescription: {
        ...regulatoryDefaults.servingDescription,
        ...(regulatoryNutrition?.servingDescription ?? {}),
      },
    },
    servingQuantityG: legacy.servingQuantityG ?? null,
    packageQuantity:
      legacy.packageQuantity ??
      (legacy.netQuantityG && legacy.netQuantityG > 0
        ? {
            value: legacy.netQuantityG,
            unit: 'g',
            netWeightG: legacy.netQuantityG,
            netVolumeMl: null,
            source: 'legacy_snapshot',
            confirmedAt: null,
          }
        : null),
    actualBatchQuantityG: legacy.actualBatchQuantityG ?? legacy.netQuantityG ?? 0,
    productionDateReviewed: legacy.productionDateReviewed ?? true,
    shelfLifeAuthority: legacy.shelfLifeAuthority ?? {
      policyId: null,
      authority: '',
      method: legacy.dateMark?.basis === 'validated_rule' ? 'validated_rule' : 'none',
      shelfLifeDays: null,
      reviewedByUser: false,
    },
    shortDescription:
      legacy.shortDescription ?? Object.fromEntries(labelLanguages.map((x) => [x, ''])),
    qrCodeValue: legacy.qrCodeValue ?? null,
    gtin: legacy.gtin ?? null,
    internalArticleId: legacy.internalArticleId ?? null,
    alcoholByVolumePercent: legacy.alcoholByVolumePercent ?? null,
    alcoholDeclarationReviewed: legacy.alcoholDeclarationReviewed ?? false,
    alcoholDeclarationApplicability: legacy.alcoholDeclarationApplicability ?? 'unresolved',
    format: legacy.format ?? 'rectangle',
    size,
    copies,
    systemPrinter: 'system',
    printer: normalizePrinterSettings({
      ...DEFAULT_PRINTER_SETTINGS,
      ...(legacy.printer ?? {}),
      widthMm: legacy.printer?.widthMm ?? size.widthMm,
      heightMm: legacy.printer?.heightMm ?? size.heightMm,
      copies: legacy.printer?.copies ?? copies,
    }),
    layoutMode: legacy.layoutMode ?? 'auto',
    availableDisplaySurfaceCm2: legacy.availableDisplaySurfaceCm2 ?? null,
    jurisdictionContext: {
      euDestinationCountryCode: legacy.jurisdictionContext?.euDestinationCountryCode ?? '',
      ukRegion: legacy.jurisdictionContext?.ukRegion ?? 'unresolved',
      auNzCountry: legacy.jurisdictionContext?.auNzCountry ?? 'unresolved',
      usSaleContext: legacy.jurisdictionContext?.usSaleContext ?? 'unresolved',
    },
    regulatoryReview: {
      translations: legacy.regulatoryReview?.translations ?? false,
      ingredientOrderAndQuid: legacy.regulatoryReview?.ingredientOrderAndQuid ?? false,
      marketSpecific: legacy.regulatoryReview?.marketSpecific ?? false,
    },
    preflightAcknowledged: legacy.preflightAcknowledged ?? false,
    snapshotEvidence: legacy.snapshotEvidence ?? null,
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
    | 'jurisdiction_context'
    | 'alcohol_declaration'
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
  printReadiness: PrintReadiness;
  geometry: ReturnType<typeof assessLabelGeometry>;
}

const hasEveryLanguage = (value: MultilingualText, languages: readonly string[]): boolean =>
  languages.every((language) => (value[language] ?? '').trim().length > 0);

const ingredientIssueName = (value: MultilingualText, languages: readonly string[]): string =>
  languages.map((language) => value[language]?.trim()).find(Boolean) ??
  Object.values(value).find((text) => text?.trim()) ??
  'Składnik';

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
    case 'ingredients': {
      const issues = data.ingredients.flatMap((item) => {
        const lineIssues: string[] = [];
        if (!item.canonicalIngredientId) lineIssues.push('brak canonical ID');
        if (!hasEveryLanguage(item.names, data.labelLanguages)) {
          lineIssues.push('brak deklaracji we wszystkich językach');
        }
        if (item.compound) {
          if (!item.compound.componentsDeclared || item.compound.components.length === 0) {
            lineIssues.push('niepełny składnik złożony');
          } else if (
            !hasEveryLanguage(item.compound.displayName, data.labelLanguages) ||
            item.compound.components.some(
              (component) => !hasEveryLanguage(component.names, data.labelLanguages),
            )
          ) {
            lineIssues.push('brak tłumaczenia składnika złożonego lub jego komponentu');
          }
        }
        if (
          (data.market === 'EU' || data.market === 'UK' || data.market === 'AU_NZ') &&
          item.quid?.required &&
          (item.quid.percentage === null ||
            !Number.isFinite(item.quid.percentage) ||
            item.quid.percentage < 0 ||
            item.quid.percentage > 100 ||
            !item.quid.reviewedByUser)
        ) {
          lineIssues.push('QUID wymaga procentu i potwierdzenia');
        }
        return lineIssues.length > 0
          ? [`${ingredientIssueName(item.names, data.labelLanguages)}: ${lineIssues.join(', ')}`]
          : [];
      });
      return data.ingredients.length > 0 && issues.length === 0
        ? ready('Składniki')
        : missing(
            'Składniki',
            issues.length > 0
              ? issues.join('. ')
              : 'Brakuje składników z rzeczywistej partii Production.',
          );
    }
    case 'allergens':
      return data.allergens.status === 'complete' &&
        data.allergens.reviewedByUser &&
        unresolvedMarketAllergens(data.market, data.allergens.declared).length === 0 &&
        marketAllergenDeclarationIssues(data.market, data.allergens.declared).length === 0
        ? ready('Alergeny')
        : missing(
            'Alergeny',
            unresolvedMarketAllergens(data.market, data.allergens.declared).length > 0
              ? `Taksonomia rynku nie rozpoznaje: ${unresolvedMarketAllergens(data.market, data.allergens.declared).join(', ')}. Nie zgaduj mapowania.`
              : marketAllergenDeclarationIssues(data.market, data.allergens.declared).length > 0
                ? marketAllergenDeclarationIssues(data.market, data.allergens.declared).join(' ')
                : 'WYMAGA WERYFIKACJI — dane są niepełne lub niepotwierdzone.',
          );
    case 'nutrition':
      return data.nutritionDeclaration
        ? ready('Nutrition')
        : missing('Nutrition', 'Brak obliczeń Nutrition.');
    case 'net_quantity':
      return data.market === 'CA'
        ? data.packageQuantity?.source !== undefined &&
          (data.packageQuantity.netVolumeMl ?? 0) > 0 &&
          ['ml', 'mL', 'l', 'L'].includes(data.packageQuantity.unit)
          ? ready('Objętość netto')
          : missing(
              'Objętość netto',
              'Kanadyjskie ice cream/frozen dessert wymaga potwierdzonej objętości opakowania w mL lub L.',
            )
        : data.packageQuantity?.source !== undefined &&
            data.packageQuantity.value > 0 &&
            ((data.packageQuantity.netWeightG ?? 0) > 0 ||
              (data.packageQuantity.netVolumeMl ?? 0) > 0)
          ? ready('Masa netto')
          : missing(
              'Masa netto',
              'Wybierz i potwierdź ilość napełnienia opakowania; masa partii nie jest masą netto opakowania.',
            );
    case 'operator':
      return responsibleBusinessDetails(data).ready
        ? ready('Operator')
        : missing('Operator', responsibleBusinessDetails(data).reason);
    case 'storage':
      return hasEveryLanguage(data.storageInstructions, data.labelLanguages)
        ? ready('Przechowywanie')
        : missing('Przechowywanie', 'Uzupełnij instrukcję w każdym języku etykiety.');
    case 'production_date':
      return data.productionDate.trim() && data.productionDateReviewed
        ? ready('Data produkcji')
        : missing('Data produkcji', 'Brak potwierdzonej daty zakończenia Production Run.');
    case 'date_mark':
      return data.dateMark.kind !== 'unresolved' &&
        data.dateMark.date &&
        data.dateMark.reviewedByUser &&
        (data.dateMark.basis !== 'validated_rule' ||
          Boolean(
            data.shelfLifeAuthority?.reviewedByUser &&
            data.shelfLifeAuthority.authority.trim() &&
            data.shelfLifeAuthority.policyId,
          ))
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
    case 'short_description':
      return hasEveryLanguage(data.shortDescription ?? {}, data.labelLanguages)
        ? ready('Krótki opis')
        : missing('Krótki opis', 'Pole opcjonalne nie jest uzupełnione.');
    case 'qr_code':
      return data.qrCodeValue?.trim()
        ? ready('QR')
        : missing('QR', 'Podaj prawdziwą wartość kodu QR.');
    case 'lot_barcode':
      return data.lotCode.trim()
        ? ready('Kod kreskowy LOT')
        : missing('Kod kreskowy LOT', 'Brak LOT do zakodowania.');
    case 'gtin':
      return normalizeConfirmedGtin(data.gtin)
        ? ready('GTIN / EAN')
        : missing(
            'GTIN / EAN',
            'Podaj rzeczywisty GTIN/EAN o poprawnej długości i prawidłowej cyfrze kontrolnej.',
          );
    case 'website':
      return data.operator.website?.trim()
        ? ready('Website')
        : missing('Website', 'Uzupełnij stronę firmy w profilu.');
    case 'internal_article_id':
      return data.internalArticleId?.trim()
        ? ready('APP / article ID')
        : missing('APP / article ID', 'Pole opcjonalne nie jest uzupełnione.');
    case 'batch_id':
      return data.sourceCompletionSessionId.trim()
        ? ready('Batch ID')
        : missing('Batch ID', 'Brak identyfikatora Production Run.');
  }
}

export function packageQuantityForDisplay(data: MasterLabelData): string {
  const quantity = data.packageQuantity;
  if (!quantity || !Number.isFinite(quantity.value) || quantity.value <= 0) return '—';
  const value = Number.isInteger(quantity.value)
    ? quantity.value.toFixed(0)
    : quantity.value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  const displayUnit = quantity.unit === 'ml' ? 'mL' : quantity.unit === 'l' ? 'L' : quantity.unit;
  return `${value} ${displayUnit}`;
}

export function applyAutoLabelLayout(data: MasterLabelData): MasterLabelData {
  const printerProfile = PRINTER_PROFILES[data.printer.profileId];
  for (const size of PRACTICAL_LABEL_SIZES) {
    if (size.widthMm < printerProfile.minWidthMm || size.widthMm > printerProfile.maxWidthMm) {
      continue;
    }
    const candidate: MasterLabelData = {
      ...data,
      layoutMode: 'auto',
      size: { widthMm: size.widthMm, heightMm: size.heightMm },
      printer: normalizePrinterSettings({
        ...data.printer,
        widthMm: size.widthMm,
        heightMm: size.heightMm,
        formatMode: 'auto',
        presetId: size.id,
      }),
    };
    if (buildLabelPreflight(candidate).geometry.fits) return candidate;
  }
  return { ...data, layoutMode: 'auto' };
}

export function buildLabelPreflight(data: MasterLabelData): LabelPreflight {
  const profile = marketProfile(data.market);
  const baseRequiredFields =
    data.purpose === 'retail_consumer'
      ? profile.requiredFields
      : data.purpose === 'internal_production'
        ? (['product_name', 'ingredients', 'allergens', 'lot', 'storage'] as const)
        : (['product_name', 'allergens', 'operator'] as const);
  const requiredFields: readonly MasterLabelFieldId[] =
    data.purpose === 'retail_consumer' &&
    data.market === 'AU_NZ' &&
    data.jurisdictionContext?.auNzCountry === 'AU'
      ? [...baseRequiredFields, 'origin']
      : baseRequiredFields;
  const activeFields = [
    ...requiredFields,
    ...data.enabledOptionalFields.filter((field) => !requiredFields.includes(field)),
  ];
  const required = activeFields.map((field) => fieldReadiness(data, field));
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
  const usServingIssues =
    data.market === 'US'
      ? usServingAndFormatIssues(
          data.regulatoryNutrition,
          data.packageQuantity?.netWeightG ?? null,
          data.availableDisplaySurfaceCm2,
        )
      : [];
  const canadaNftIssues =
    data.market === 'CA'
      ? canadaNftFormatIssues(data.regulatoryNutrition, data.availableDisplaySurfaceCm2)
      : [];
  const canadaFop = assessCanadaFop(data.nutritionSource, data.regulatoryNutrition);
  const printerIssues = [
    ...printerGeometryIssues(data.printer),
    ...(Math.abs(data.printer.widthMm - data.size.widthMm) > 0.01 ||
    Math.abs(data.printer.heightMm - data.size.heightMm) > 0.01
      ? ['Format podglądu i format sterownika drukarki muszą mieć identyczne wymiary.']
      : []),
  ];
  const retail = data.purpose === 'retail_consumer';
  const labelText = (value: MultilingualText): string =>
    data.labelLanguages
      .map((language) => value[language]?.trim())
      .filter(Boolean)
      .join(' / ');
  const geometryInput = {
    market: data.market,
    widthMm: data.size.widthMm,
    heightMm: data.size.heightMm,
    marginMm: data.printer.marginMm,
    format: data.format,
    productName: labelText(data.productName),
    ingredientDeclarations: data.ingredients.map((ingredient) => labelText(ingredient.names)),
    allergenStatement: [...data.allergens.declared, ...data.allergens.mayContain].join(', '),
    businessText: [data.operator.operatorName, data.operator.address].filter(Boolean).join(', '),
    storageText: labelText(data.storageInstructions),
    languageCount: data.labelLanguages.length,
    nutritionRowCount:
      data.market === 'US' ? 15 : data.market === 'CA' ? 14 : data.market === 'AU_NZ' ? 7 : 8,
    packagingContext: data.packagingContext,
    availableDisplaySurfaceCm2: data.availableDisplaySurfaceCm2,
    canadaFopRequired: canadaFop.state === 'required',
    usDualColumn:
      data.market === 'US' &&
      resolveUsFormatFamily(data.regulatoryNutrition, data.packageQuantity?.netWeightG ?? null) ===
        'dual_column',
    optionalMachineCodeCount: ['qr_code', 'lot_barcode', 'gtin'].filter((field) =>
      data.enabledOptionalFields.includes(field as MasterLabelFieldId),
    ).length,
  } as const;
  const geometry = assessLabelGeometry(geometryInput);
  const suggestedSize = geometry.fits
    ? null
    : smallestValidLabelSize(
        {
          ...geometryInput,
          marginMm: geometryInput.marginMm,
        },
        216,
      );
  const canadaAssetPackageInstalled = Boolean(
    data.regulatoryNutrition.canadaFopAssetPackageVersion?.trim(),
  );
  const regulatoryProfileVerified =
    profile.status === 'REGULATORY_VERIFIED' ||
    (data.market === 'CA' && canadaAssetPackageInstalled);
  const profileReady = data.market === 'WORLD' || regulatoryProfileVerified;
  const contextReady =
    data.market === 'EU'
      ? isEuMemberStateCode(data.jurisdictionContext?.euDestinationCountryCode)
      : data.market === 'UK'
        ? data.jurisdictionContext?.ukRegion !== undefined &&
          data.jurisdictionContext.ukRegion !== 'unresolved'
        : data.market === 'AU_NZ'
          ? data.jurisdictionContext?.auNzCountry !== undefined &&
            data.jurisdictionContext.auNzCountry !== 'unresolved'
          : data.market === 'US'
            ? data.jurisdictionContext?.usSaleContext !== undefined &&
              data.jurisdictionContext.usSaleContext !== 'unresolved'
            : true;
  const items: LabelPreflightItem[] = [
    {
      field: 'profile',
      status: profileReady ? 'ready' : 'research',
      label: `Profil ${profile.label}`,
      message:
        data.market === 'WORLD'
          ? 'Uniwersalna etykieta informacyjna — bez profilu prawnego konkretnego kraju.'
          : regulatoryProfileVerified
            ? `Renderer regulacyjny ${profile.rendererVersion} jest aktywny.`
            : (profile.externalAssetRequirement ??
              'Profil nie ma kompletnej oficjalnej authority.'),
    },
    {
      field: 'languages',
      status:
        !retail ||
        (languagesReady && (data.market === 'WORLD' || data.regulatoryReview.translations))
          ? 'ready'
          : 'missing',
      label: 'Języki etykiety',
      message:
        !retail ||
        (languagesReady && (data.market === 'WORLD' || data.regulatoryReview.translations))
          ? 'Wymagane języki i tłumaczenia potwierdzone.'
          : `Wymagane języki: ${requiredLanguages.join(', ')}; potwierdź tłumaczenia.`,
    },
    ...required,
    ...(retail &&
    (data.market === 'EU' || data.market === 'UK') &&
    (data.nutritionSource?.alcohol_g ?? 0) > 0
      ? [
          {
            field: 'alcohol_declaration' as const,
            status:
              data.alcoholDeclarationApplicability === 'not_applicable_non_beverage' ||
              (data.alcoholDeclarationApplicability === 'required_beverage_over_1_2' &&
                data.alcoholDeclarationReviewed &&
                data.alcoholByVolumePercent !== null &&
                data.alcoholByVolumePercent !== undefined &&
                Number.isFinite(data.alcoholByVolumePercent) &&
                data.alcoholByVolumePercent > 1.2)
                ? ('ready' as const)
                : ('missing' as const),
            label: 'Rzeczywista zawartość alkoholu',
            message:
              data.alcoholDeclarationApplicability === 'not_applicable_non_beverage'
                ? 'Produkt potwierdzony jako żywność niebędąca napojem; unijna deklaracja % vol nie ma zastosowania.'
                : data.alcoholDeclarationReviewed && data.alcoholByVolumePercent !== null
                  ? `Potwierdzono ${data.alcoholByVolumePercent}% vol.`
                  : 'Produkt zawiera alkohol: rozstrzygnij beverage/non-beverage; dla napoju >1,2% podaj authority % vol. System nie przelicza ABV z gramów.',
          },
        ]
      : []),
    {
      field: 'market_nutrition',
      status:
        !retail ||
        (nutritionReadiness.ready && usServingIssues.length === 0 && canadaNftIssues.length === 0)
          ? 'ready'
          : 'missing',
      label: `Nutrition · ${profile.nutritionFormat}`,
      message:
        !retail ||
        (nutritionReadiness.ready && usServingIssues.length === 0 && canadaNftIssues.length === 0)
          ? 'Kompletny zestaw danych dla układu rynku.'
          : [...nutritionReadiness.missing, ...usServingIssues, ...canadaNftIssues].join(' '),
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
      field: 'jurisdiction_context',
      status: !retail || contextReady ? 'ready' : 'missing',
      label: 'Kontekst jurysdykcji i sprzedaży',
      message:
        !retail || contextReady
          ? 'Wybrano wymagany kontekst profilu.'
          : data.market === 'UK'
            ? 'Wybierz Great Britain albo Northern Ireland oraz właściwy kontekst prepacked/PPDS.'
            : data.market === 'EU'
              ? 'Podaj dwuliterowy kod docelowego państwa członkowskiego i potwierdź właściwe języki.'
              : data.market === 'AU_NZ'
                ? 'Wybierz Australię albo Nową Zelandię dla country-of-origin overlay.'
                : 'Potwierdź kontekst sprzedaży FDA.',
    },
    {
      field: 'geometry',
      status: !retail || geometry.fits ? 'ready' : 'missing',
      label: 'Rozmiar i minimalna czytelność',
      message:
        !retail || geometry.fits
          ? `${geometry.reason} Format ${data.size.widthMm} × ${data.size.heightMm} mm.`
          : `${geometry.reason}${suggestedSize ? ` Najmniejszy zweryfikowany preset dla tej treści: ${suggestedSize.widthMm} × ${suggestedSize.heightMm} mm.` : ''}`,
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
        data.market === 'WORLD' ||
        (data.regulatoryReview.ingredientOrderAndQuid && data.regulatoryReview.marketSpecific)
          ? 'ready'
          : 'review',
      label: 'Kontrola rynku',
      message:
        !retail ||
        data.market === 'WORLD' ||
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
  const baseReady =
    missingCount === 0 && reviewCount === 0 && data.preflightAcknowledged && profileReady;
  const printReadiness: PrintReadiness = baseReady
    ? data.market === 'WORLD'
      ? 'PRINT_READY_UNIVERSAL'
      : 'PRINT_READY_REGULATORY'
    : 'NOT_READY';
  return {
    items,
    missingCount,
    reviewCount,
    readyForSystemPrint: baseReady,
    regulatoryProfileVerified,
    printReadiness,
    geometry,
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
