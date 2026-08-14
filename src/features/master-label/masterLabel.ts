import {
  buildNutritionDeclaration,
  type LabelNutritionPer100g,
  type NutritionDeclaration,
} from '@/data/label/nutritionLabel';
import type { ProductionCompletionSnapshot } from '@/features/production-workspace/productionSession';
import { buildRecipeBehaviorAuthority, recipeBehaviorModuleGate } from '@/features/product-intelligence';
import {
  marketProfile,
  type MarketProfileCode,
  type MasterLabelFieldId,
} from './marketProfiles';

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
  market: MarketProfileCode;
  marketProfileVersion: string;
  uiLanguage: string;
  labelLanguages: string[];
  productName: MultilingualText;
  legalProductName: MultilingualText;
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
  preflightAcknowledged: boolean;
}

export interface BuildMasterLabelInput {
  masterLabelId: string;
  snapshot: ProductionCompletionSnapshot;
  market: MarketProfileCode;
  uiLanguage: string;
  labelLanguages: string[];
  facilityDefaults?: Partial<FacilityDefaults>;
}

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
    throw new Error(`master_label_behavior_authority_required:${behaviorGate.blockedLineIds.join(',')}`);
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
      existing.declared = [...new Set([...existing.declared, ...(frozenAllergens?.declared ?? [])])];
      existing.mayContain = [...new Set([...existing.mayContain, ...(frozenAllergens?.mayContain ?? [])])];
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
      const embeddedEvidenceStatus: IngredientAllergenEvidence['status'] = item.labelEvidenceVerified
        ? 'verified'
        : 'missing';
      const declarationName = item.sourceIngredientsText
        ? `${item.name} (${item.sourceIngredientsText})`
        : item.name;
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
  const allergenComplete = ingredients.length > 0
    && ingredients.every((item) => item.allergenEvidenceStatus === 'verified');
  const declared = [...new Set([...declarationLines.values()].flatMap((item) => item.declared))].sort();
  const mayContain = [...new Set([...declarationLines.values()].flatMap((item) => item.mayContain))].sort();
  const labelStatements = [...new Set(
    ingredients.map((item) => item.sourceAllergensText?.trim()).filter((item): item is string => Boolean(item)),
  )];
  const facility = { ...emptyFacility(), ...input.facilityDefaults };
  const completedDate = snapshot.productionCompletedAt.slice(0, 10);

  return {
    schemaVersion: 1,
    masterLabelId: input.masterLabelId,
    sourceCompletionSessionId: snapshot.sessionId,
    sourceCompletedAt: snapshot.productionCompletedAt,
    market: input.market,
    marketProfileVersion: profile.version,
    uiLanguage: input.uiLanguage,
    labelLanguages: languages,
    productName: translated(snapshot.source.recipeName, languages),
    legalProductName: translated('', languages),
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
    // Batch mass is not package net quantity. Never fabricate this field.
    netQuantityG: null,
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
    lotCode: '',
    origin: translated('', languages),
    customerNote: translated(snapshot.customerLabelNote, languages),
    enabledOptionalFields: snapshot.customerLabelNote ? ['customer_note'] : [],
    format: 'rectangle',
    size: { widthMm: 90, heightMm: 60 },
    copies: 1,
    systemPrinter: 'system',
    preflightAcknowledged: false,
  };
}

export interface LabelPreflightItem {
  field: MasterLabelFieldId | 'profile' | 'acknowledgement';
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
  const ready = (label: string): LabelPreflightItem => ({ field, status: 'ready', label, message: 'Gotowe' });
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
      return data.ingredients.length > 0 && data.ingredients.every((item) => item.canonicalIngredientId)
        ? ready('Składniki')
        : missing('Składniki', 'Brakuje składników lub canonical ID.');
    case 'allergens':
      return data.allergens.status === 'complete' && data.allergens.reviewedByUser
        ? ready('Alergeny')
        : missing('Alergeny', 'WYMAGA WERYFIKACJI — dane są niepełne lub niepotwierdzone.');
    case 'nutrition':
      return data.nutritionDeclaration ? ready('Nutrition') : missing('Nutrition', 'Brak obliczeń Nutrition.');
    case 'net_quantity':
      return data.netQuantityG !== null && data.netQuantityG > 0
        ? ready('Masa netto')
        : missing('Masa netto', 'Podaj masę opakowania; masa partii nie jest masą netto opakowania.');
    case 'operator':
      return data.operator.operatorName.trim() && data.operator.address.trim()
        ? ready('Operator')
        : missing('Operator', 'Uzupełnij nazwę i adres operatora.');
    case 'storage':
      return hasEveryLanguage(data.storageInstructions, data.labelLanguages)
        ? ready('Przechowywanie')
        : missing('Przechowywanie', 'Uzupełnij instrukcję w każdym języku etykiety.');
    case 'date_mark':
      return data.dateMark.kind !== 'unresolved' && data.dateMark.date && data.dateMark.reviewedByUser
        ? ready('Data trwałości')
        : missing('Data trwałości', 'WYMAGA POTWIERDZENIA — PINGÜINO nie wylicza trwałości bez podstawy.');
    case 'lot':
      return data.lotCode.trim() ? ready('LOT') : missing('LOT', 'Uzupełnij identyfikator partii.');
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
  const required = profile.requiredFields.map((field) => fieldReadiness(data, field));
  const items: LabelPreflightItem[] = [
    {
      field: 'profile',
      status:
        profile.status === 'VERIFIED'
          ? 'ready'
          : profile.status === 'RESEARCH_REQUIRED'
            ? 'research'
            : 'review',
      label: `Profil ${profile.label}`,
      message:
        profile.status === 'VERIFIED'
          ? 'Profil regulacyjny zweryfikowany.'
          : profile.status === 'RESEARCH_REQUIRED'
          ? 'Profil wymaga weryfikacji.'
          : profile.rendererLimitation,
    },
    ...required,
    {
      field: 'acknowledgement',
      status: data.preflightAcknowledged ? 'ready' : 'review',
      label: 'Kontrola użytkownika',
      message: data.preflightAcknowledged
        ? 'Dane sprawdzone przed wydrukiem.'
        : 'Zaznacz: Sprawdziłem dane etykiety przed wydrukiem.',
    },
  ];
  const missingCount = required.filter((item) => item.status === 'missing').length;
  const reviewCount = items.filter((item) => item.status === 'review' || item.status === 'research').length;
  const regulatoryProfileVerified = profile.status === 'VERIFIED';
  return {
    items,
    missingCount,
    reviewCount,
    readyForSystemPrint:
      missingCount === 0 && data.preflightAcknowledged && regulatoryProfileVerified,
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

export function addOptionalField(data: MasterLabelData, field: MasterLabelFieldId): MasterLabelData {
  if (data.enabledOptionalFields.includes(field)) return data;
  return { ...data, enabledOptionalFields: [...data.enabledOptionalFields, field] };
}
