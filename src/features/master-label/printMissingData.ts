import { buildNutritionDeclaration } from '@/data/label/nutritionLabel';
import {
  buildLabelPreflight,
  labelAllergenStatement,
  type MasterLabelData,
  type MultilingualText,
} from './masterLabel';
import { marketProfile } from './marketProfiles';

export interface PrintMissingField {
  id: string;
  label: string;
  kind: 'text' | 'number' | 'date' | 'select';
  value: string;
  help?: string;
  unit?: string;
  reason: string;
  source: string;
  skippable: true;
  options?: readonly { value: string; label: string }[];
}

export type PrintMissingValues = Readonly<Record<string, string>>;
export type PrintMissingErrors = Readonly<Record<string, string>>;

const field = (
  value: Omit<PrintMissingField, 'reason' | 'source' | 'skippable'> &
    Partial<Pick<PrintMissingField, 'reason' | 'source'>>,
): PrintMissingField => ({
  ...value,
  reason: value.reason ?? 'To pole jest wymagane przez aktywny renderer rynku.',
  source: value.source ?? 'Brak wiarygodnej wartości w aktualnym drafcie etykiety.',
  skippable: true,
});

const hasText = (value: string | null | undefined): boolean => Boolean(value?.trim());

const addNumber = (
  fields: PrintMissingField[],
  id: string,
  label: string,
  value: number | null | undefined,
) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    fields.push(field({ id, label, kind: 'number', value: '' }));
  }
};

const addLanguageText = (
  fields: PrintMissingField[],
  prefix: string,
  label: string,
  value: MultilingualText | undefined,
  languages: readonly string[],
) => {
  for (const language of languages) {
    if (!hasText(value?.[language])) {
      fields.push(
        field({
          id: `${prefix}:${language}`,
          label: `${label} · ${language.toUpperCase()}`,
          kind: 'text',
          value: '',
        }),
      );
    }
  }
};

/** One market-neutral list of genuinely absent values that can be edited before print. */
export function printMissingFields(label: MasterLabelData): PrintMissingField[] {
  const fields: PrintMissingField[] = [];
  const requiredFields = marketProfile(label.market).requiredFields;
  const requires = (field: (typeof requiredFields)[number]) => requiredFields.includes(field);
  const knownAllergens = labelAllergenStatement(label) ?? '';
  if (requires('allergens') && label.allergens.status === 'incomplete') {
    fields.push(
      field({
        id: 'allergens',
        label: 'Alergeny',
        kind: 'text',
        value: knownAllergens,
        help: knownAllergens
          ? 'Zachowaliśmy znaną część deklaracji. Dla części składników nadal brakuje danych.'
          : 'Dla składników nie znaleziono końcowej deklaracji alergenów.',
        reason: 'Deklaracja alergenów jest wymagana przez aktywny renderer.',
        source: knownAllergens
          ? 'Znana część deklaracji z aktualnej receptury lub partii.'
          : 'Brak końcowej deklaracji w aktualnej recepturze lub partii.',
      }),
    );
  }

  if (requires('nutrition') && label.nutritionSource) {
    const saturated = label.nutritionSource.saturated_fat_g;
    const saturatedAuthority = label.saturatedFatAuthority;
    const hasSaturatedAuthority =
      saturatedAuthority?.status !== undefined &&
      saturatedAuthority.status !== 'missing' &&
      saturatedAuthority.sourceReferences.some((reference) => reference.trim().length > 0);
    if (
      saturated === null ||
      saturated === undefined ||
      !Number.isFinite(saturated) ||
      saturated <= 0 ||
      !hasSaturatedAuthority
    ) {
      fields.push(
        field({
          id: 'saturated_fat_g',
          label: 'Tłuszcze nasycone',
          kind: 'number',
          value: '',
          unit: 'g / 100 g',
          reason: 'Aktywny renderer wymaga tej wartości w tabeli żywieniowej.',
          source: 'Brak dodatniej, wiarygodnej wartości końcowej.',
        }),
      );
    }
    addNumber(fields, 'sugars_g', 'Cukry · g / 100 g', label.nutritionSource.sugars_g);
  }

  if (requires('product_name')) {
    addLanguageText(
      fields,
      'product_name',
      'Nazwa produktu',
      label.productName,
      label.labelLanguages,
    );
  }
  if (requires('legal_product_name')) {
    addLanguageText(
      fields,
      'legal_product_name',
      'Nazwa prawna produktu',
      label.legalProductName,
      label.labelLanguages,
    );
  }
  if (requires('storage')) {
    addLanguageText(
      fields,
      'storage',
      'Warunki przechowywania',
      label.storageInstructions,
      label.labelLanguages,
    );
  }

  if (requires('operator') && !hasText(label.operator.operatorName)) {
    fields.push(field({ id: 'operator_name', label: 'Nazwa operatora', kind: 'text', value: '' }));
  }
  if (requires('operator') && !hasText(label.operator.address)) {
    fields.push(
      field({ id: 'operator_address', label: 'Adres operatora', kind: 'text', value: '' }),
    );
  }
  if (requires('operator') && !hasText(label.operator.countryCode)) {
    fields.push(
      field({ id: 'operator_country', label: 'Kod kraju operatora', kind: 'text', value: '' }),
    );
  }

  if (requires('lot') && !hasText(label.lotCode)) {
    fields.push(field({ id: 'lot', label: 'LOT', kind: 'text', value: '' }));
  }
  if (requires('production_date') && !hasText(label.productionDate)) {
    fields.push(field({ id: 'production_date', label: 'Data produkcji', kind: 'date', value: '' }));
  }
  if (requires('date_mark') && !label.dateMark.date) {
    fields.push(field({ id: 'date_mark', label: 'Data trwałości', kind: 'date', value: '' }));
  }

  const packageQuantity = label.packageQuantity;
  if (requires('net_quantity')) {
    if (label.market === 'CA') {
      addNumber(
        fields,
        'net_volume_ml',
        'Objętość netto opakowania · mL',
        packageQuantity?.netVolumeMl,
      );
    } else {
      addNumber(fields, 'net_weight_g', 'Masa netto opakowania · g', packageQuantity?.netWeightG);
    }
  }

  const facts = label.regulatoryNutrition;
  if (label.market === 'EU' || label.market === 'UK' || label.market === 'AU_NZ') {
    addNumber(fields, 'energy_kj', 'Energia · kJ / 100 g', facts.energyKjPer100g);
  }
  if (label.market === 'US' || label.market === 'CA' || label.market === 'AU_NZ') {
    addNumber(fields, 'serving_quantity_g', 'Wielkość porcji · g', facts.servingQuantityG);
    addNumber(
      fields,
      'servings_per_container',
      'Liczba porcji w opakowaniu',
      facts.servingsPerContainer,
    );
    addLanguageText(
      fields,
      'serving_description',
      'Opis porcji',
      facts.servingDescription,
      label.labelLanguages,
    );
    addNumber(fields, 'sodium_mg', 'Sód · mg / 100 g', facts.sodiumMgPer100g);
  }
  if (label.market === 'US' || label.market === 'CA') {
    addNumber(fields, 'trans_fat_g', 'Tłuszcze trans · g / 100 g', facts.transFatGPer100g);
    addNumber(fields, 'cholesterol_mg', 'Cholesterol · mg / 100 g', facts.cholesterolMgPer100g);
    addNumber(fields, 'calcium_mg', 'Wapń · mg / 100 g', facts.calciumMgPer100g);
    addNumber(fields, 'iron_mg', 'Żelazo · mg / 100 g', facts.ironMgPer100g);
    addNumber(fields, 'potassium_mg', 'Potas · mg / 100 g', facts.potassiumMgPer100g);
  }
  if (label.market === 'US') {
    addNumber(fields, 'added_sugars_g', 'Cukry dodane · g / 100 g', facts.addedSugarsGPer100g);
    addNumber(fields, 'vitamin_d_mcg', 'Witamina D · µg / 100 g', facts.vitaminDMcgPer100g);
  }
  if (label.market === 'CA') {
    addNumber(fields, 'serving_volume_ml', 'Objętość porcji · mL', facts.servingVolumeMl);
  }

  if (label.market === 'AU_NZ') {
    addLanguageText(fields, 'origin', 'Pochodzenie', label.origin, ['en']);
  }
  if (label.market === 'EU' && !hasText(label.jurisdictionContext?.euDestinationCountryCode)) {
    fields.push(
      field({
        id: 'eu_destination',
        label: 'Kod kraju docelowego UE',
        kind: 'text',
        value: '',
      }),
    );
  }
  if (label.market === 'UK' && label.jurisdictionContext?.ukRegion === 'unresolved') {
    fields.push(
      field({
        id: 'uk_region',
        label: 'Rynek UK',
        kind: 'select',
        value: '',
        options: [
          { value: 'GB', label: 'Wielka Brytania' },
          { value: 'NI', label: 'Irlandia Północna' },
        ],
      }),
    );
  }
  if (label.market === 'US' && label.jurisdictionContext?.usSaleContext === 'unresolved') {
    fields.push(
      field({
        id: 'us_sale_context',
        label: 'Kontekst sprzedaży USA',
        kind: 'select',
        value: '',
        options: [
          { value: 'interstate_retail', label: 'Sprzedaż detaliczna' },
          { value: 'food_service', label: 'Food service' },
        ],
      }),
    );
  }
  if (
    label.alcoholDeclarationApplicability === 'required_beverage_over_1_2' &&
    (label.alcoholByVolumePercent === null || label.alcoholByVolumePercent === undefined)
  ) {
    addNumber(fields, 'alcohol_percent', 'Rzeczywista zawartość alkoholu · % vol', null);
  }

  return fields;
}

const numberValue = (value: string): number | null => {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const setLanguageText = (
  current: MultilingualText | undefined,
  language: string,
  value: string,
): MultilingualText => ({ ...current, [language]: value });

/** Applies only fields the user actually edited and leaves every skipped value untouched. */
export function applyPrintMissingValues(
  label: MasterLabelData,
  values: Readonly<Record<string, string>>,
  dirtyFields: ReadonlySet<string>,
): MasterLabelData {
  let next = label;
  for (const id of dirtyFields) {
    const value = values[id]?.trim() ?? '';
    if (!value) continue;
    const numeric = numberValue(value);
    if (id === 'allergens') {
      next = {
        ...next,
        allergens: {
          ...next.allergens,
          status: 'complete',
          labelStatements: [value],
          reviewedByUser: true,
        },
      };
    } else if (
      id === 'saturated_fat_g' &&
      next.nutritionSource &&
      numeric !== null &&
      numeric > 0 &&
      numeric <= next.nutritionSource.fat_g
    ) {
      const nutritionSource = { ...next.nutritionSource, saturated_fat_g: numeric };
      next = {
        ...next,
        nutritionSource,
        nutritionDeclaration: buildNutritionDeclaration(nutritionSource),
        saturatedFatAuthority: {
          status: 'manual_final_value',
          sourceReferences: ['manual:label_saturated_fat'],
          missingIngredientNames: [],
        },
      };
    } else if (id === 'sugars_g' && next.nutritionSource && numeric !== null) {
      const nutritionSource = { ...next.nutritionSource, sugars_g: numeric };
      next = {
        ...next,
        nutritionSource,
        nutritionDeclaration: buildNutritionDeclaration(nutritionSource),
      };
    } else if (id.startsWith('product_name:')) {
      const language = id.slice('product_name:'.length);
      next = { ...next, productName: setLanguageText(next.productName, language, value) };
    } else if (id.startsWith('legal_product_name:')) {
      const language = id.slice('legal_product_name:'.length);
      next = {
        ...next,
        legalProductName: setLanguageText(next.legalProductName, language, value),
      };
    } else if (id.startsWith('storage:')) {
      const language = id.slice('storage:'.length);
      next = {
        ...next,
        storageInstructions: setLanguageText(next.storageInstructions, language, value),
      };
    } else if (id.startsWith('serving_description:')) {
      const language = id.slice('serving_description:'.length);
      next = {
        ...next,
        regulatoryNutrition: {
          ...next.regulatoryNutrition,
          servingDescription: setLanguageText(
            next.regulatoryNutrition.servingDescription,
            language,
            value,
          ),
        },
      };
    } else if (id.startsWith('origin:')) {
      const language = id.slice('origin:'.length);
      next = { ...next, origin: setLanguageText(next.origin, language, value) };
    } else if (id === 'operator_name') {
      next = { ...next, operator: { ...next.operator, operatorName: value } };
    } else if (id === 'operator_address') {
      next = { ...next, operator: { ...next.operator, address: value } };
    } else if (id === 'operator_country') {
      next = { ...next, operator: { ...next.operator, countryCode: value.toUpperCase() } };
    } else if (id === 'lot') {
      next = { ...next, lotCode: value };
    } else if (id === 'production_date') {
      next = { ...next, productionDate: value, productionDateReviewed: true };
    } else if (id === 'date_mark') {
      next = {
        ...next,
        dateMark: { kind: 'best_before', date: value, basis: 'manual', reviewedByUser: true },
      };
    } else if ((id === 'net_weight_g' || id === 'net_volume_ml') && numeric !== null) {
      const volume = id === 'net_volume_ml';
      next = {
        ...next,
        netQuantityG: volume ? next.netQuantityG : numeric,
        packageQuantity: {
          value: numeric,
          unit: volume ? 'ml' : 'g',
          netWeightG: volume ? (next.packageQuantity?.netWeightG ?? null) : numeric,
          netVolumeMl: volume ? numeric : (next.packageQuantity?.netVolumeMl ?? null),
          source: 'selected_fill',
          confirmedAt: new Date().toISOString(),
        },
      };
    } else if (id === 'eu_destination') {
      next = {
        ...next,
        jurisdictionContext: {
          euDestinationCountryCode: value.toUpperCase(),
          ukRegion: next.jurisdictionContext?.ukRegion ?? 'unresolved',
          auNzCountry: next.jurisdictionContext?.auNzCountry ?? 'unresolved',
          usSaleContext: next.jurisdictionContext?.usSaleContext ?? 'unresolved',
        },
      };
    } else if (id === 'uk_region' && (value === 'GB' || value === 'NI')) {
      next = {
        ...next,
        jurisdictionContext: {
          euDestinationCountryCode: next.jurisdictionContext?.euDestinationCountryCode ?? '',
          ukRegion: value,
          auNzCountry: next.jurisdictionContext?.auNzCountry ?? 'unresolved',
          usSaleContext: next.jurisdictionContext?.usSaleContext ?? 'unresolved',
        },
      };
    } else if (
      id === 'us_sale_context' &&
      (value === 'interstate_retail' || value === 'food_service')
    ) {
      next = {
        ...next,
        jurisdictionContext: {
          euDestinationCountryCode: next.jurisdictionContext?.euDestinationCountryCode ?? '',
          ukRegion: next.jurisdictionContext?.ukRegion ?? 'unresolved',
          auNzCountry: next.jurisdictionContext?.auNzCountry ?? 'unresolved',
          usSaleContext: value,
        },
      };
    } else if (id === 'alcohol_percent' && numeric !== null) {
      next = {
        ...next,
        alcoholByVolumePercent: numeric,
        alcoholDeclarationReviewed: true,
      };
    } else if (numeric !== null) {
      const factKeys: Record<string, keyof MasterLabelData['regulatoryNutrition']> = {
        energy_kj: 'energyKjPer100g',
        serving_quantity_g: 'servingQuantityG',
        servings_per_container: 'servingsPerContainer',
        serving_volume_ml: 'servingVolumeMl',
        sodium_mg: 'sodiumMgPer100g',
        trans_fat_g: 'transFatGPer100g',
        cholesterol_mg: 'cholesterolMgPer100g',
        calcium_mg: 'calciumMgPer100g',
        iron_mg: 'ironMgPer100g',
        potassium_mg: 'potassiumMgPer100g',
        added_sugars_g: 'addedSugarsGPer100g',
        vitamin_d_mcg: 'vitaminDMcgPer100g',
      };
      const key = factKeys[id];
      if (key) {
        next = {
          ...next,
          regulatoryNutrition: { ...next.regulatoryNutrition, [key]: numeric },
        };
      }
    }
  }
  return next;
}

export function saturatedFatValidationMessage(
  label: MasterLabelData,
  rawValue: string,
): string | null {
  if (!rawValue.trim()) return null;
  const saturated = numberValue(rawValue);
  const totalFat = label.nutritionSource?.fat_g;
  if (saturated === null)
    return 'Wpisz prawidłową wartość nie mniejszą niż 0 albo pozostaw pole puste.';
  if (
    totalFat !== null &&
    totalFat !== undefined &&
    Number.isFinite(totalFat) &&
    saturated > totalFat
  ) {
    return `Tłuszcze nasycone nie mogą być większe niż tłuszcz całkowity (${totalFat
      .toFixed(1)
      .replace('.', ',')} g). Popraw wartość albo pozostaw pole puste.`;
  }
  return null;
}

/** Snapshot boundary: an impossible manual value must never be silently persisted. */
export function assertSaturatedFatInvariant(label: MasterLabelData): void {
  const saturated = label.nutritionSource?.saturated_fat_g;
  if (saturated === null || saturated === undefined || saturated <= 0) return;
  const message = saturatedFatValidationMessage(label, String(saturated));
  if (message) throw new Error(message);
}

export function validatePrintMissingValues(
  label: MasterLabelData,
  values: PrintMissingValues,
  dirtyFields: ReadonlySet<string>,
): PrintMissingErrors {
  const errors: Record<string, string> = {};
  if (dirtyFields.has('saturated_fat_g')) {
    const error = saturatedFatValidationMessage(label, values.saturated_fat_g ?? '');
    if (error) errors.saturated_fat_g = error;
  }
  return errors;
}

/** Values that are absent, zero, non-finite or physiologically impossible never reach a renderer. */
export function sanitizeLabelForOutput(label: MasterLabelData): MasterLabelData {
  const nutrition = label.nutritionSource;
  if (!nutrition) return label;
  const saturated = nutrition.saturated_fat_g;
  const authority = label.saturatedFatAuthority;
  const printable =
    saturated !== null &&
    saturated !== undefined &&
    Number.isFinite(saturated) &&
    saturated > 0 &&
    saturated <= nutrition.fat_g &&
    authority?.status !== undefined &&
    authority.status !== 'missing' &&
    authority.sourceReferences.some((reference) => reference.trim().length > 0);
  if (printable) return label;
  const nutritionSource = { ...nutrition, saturated_fat_g: null };
  return {
    ...label,
    nutritionSource,
    nutritionDeclaration: buildNutritionDeclaration(nutritionSource),
  };
}

export function printReadinessForLabel(
  label: MasterLabelData,
): 'PRINT_READY_UNIVERSAL' | 'PRINT_READY_REGULATORY' {
  return buildLabelPreflight(sanitizeLabelForOutput(label)).printReadiness ===
    'PRINT_READY_REGULATORY'
    ? 'PRINT_READY_REGULATORY'
    : 'PRINT_READY_UNIVERSAL';
}

export function prepareLabelForOutput(label: MasterLabelData): MasterLabelData {
  const sanitized = sanitizeLabelForOutput(label);
  const informational = printReadinessForLabel(sanitized) !== 'PRINT_READY_REGULATORY';
  return informational && sanitized.purpose === 'retail_consumer'
    ? { ...sanitized, purpose: 'internal_production' }
    : sanitized;
}
