import type { NutritionPer100g } from '@/engine';
import { buildNutritionDeclaration, type NutritionDeclaration } from '@/data/label/nutritionLabel';
import type { ProductionCompletionSnapshot } from '@/features/production-workspace/productionSession';
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
    reviewedByUser: boolean;
  };
  nutritionSource: NutritionPer100g | null;
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
  allergenEvidenceByCanonicalId?: Readonly<Record<string, IngredientAllergenEvidence>>;
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
  const profile = marketProfile(input.market);
  const languages = input.labelLanguages.length > 0 ? [...new Set(input.labelLanguages)] : ['pl'];
  const total = snapshot.finalResult.total_batch_g;
  const evidence = input.allergenEvidenceByCanonicalId ?? {};
  const ingredients: MasterLabelIngredient[] = snapshot.finalResult.items
    .filter((item) => item.effective_grams > 0)
    .slice()
    .sort((a, b) => b.effective_grams - a.effective_grams)
    .map((item) => {
      const canonicalId = item.ingredient.canonical_ingredient_id ?? item.ingredient.id ?? null;
      const allergenEvidence = canonicalId ? evidence[canonicalId] : undefined;
      return {
        lineId: item.id,
        canonicalIngredientId: canonicalId,
        names: translated(item.ingredient.name, languages),
        actualGrams: item.effective_grams,
        percent: total > 0 ? (item.effective_grams / total) * 100 : 0,
        allergenEvidenceStatus: allergenEvidence?.status ?? 'missing',
        allergenSourceRevision: allergenEvidence?.sourceRevision ?? null,
      };
    });
  const allEvidence = ingredients.map((ingredient) =>
    ingredient.canonicalIngredientId ? evidence[ingredient.canonicalIngredientId] : undefined,
  );
  const allergenComplete =
    ingredients.length > 0 && allEvidence.every((item) => item?.status === 'verified');
  const declared = [...new Set(allEvidence.flatMap((item) => item?.allergens ?? []))].sort();
  const mayContain = [...new Set(allEvidence.flatMap((item) => item?.mayContain ?? []))].sort();
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
      reviewedByUser: false,
    },
    nutritionSource: snapshot.finalResult.nutrition_per_100g,
    nutritionDeclaration: buildNutritionDeclaration(snapshot.finalResult.nutrition_per_100g),
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
      status: profile.status === 'RESEARCH_REQUIRED' ? 'research' : 'review',
      label: `Profil ${profile.label}`,
      message:
        profile.status === 'RESEARCH_REQUIRED'
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
  return {
    items,
    missingCount,
    reviewCount,
    readyForSystemPrint: missingCount === 0 && data.preflightAcknowledged,
    regulatoryProfileVerified: profile.status === 'VERIFIED',
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
