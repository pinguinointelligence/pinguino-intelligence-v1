/**
 * Product Recognition V2.
 *
 * This layer answers semantic questions only: what the article is, which role
 * it is intended for, whether it is genuinely technical, and what a declared
 * dosage means. It never generates chemistry and never mutates Mapper data.
 *
 * Deterministic rules resolve exact evidence first. Ambiguous evidence is
 * explicitly marked for the server-side semantic classifier; UNKNOWN remains a
 * valid result. The same classification is then used to narrow every Mapper
 * candidate universe before numeric similarity is considered.
 */
import { foldLatin, inferMapperFamily, type ProductFamilyId } from './mapperFamilyInference.ts';

export const PRODUCT_RECOGNITION_VERSION = 'PRODUCT_RECOGNITION_V2' as const;
/** Bumps the exact-evidence cache without changing the persisted V2 authority contract. */
export const PRODUCT_RECOGNITION_CACHE_REVISION =
  'BEVERAGE_FAMILY_CONFECTIONERY_INCLUSION_V2' as const;

export type ProductArchetype =
  | 'NORMAL_INGREDIENT'
  | 'COCOA_POWDER'
  | 'WHOLE_NUT'
  | 'DRIED_MIX'
  | 'SAVORY_SPREAD'
  | 'BAKERY_MIX'
  | 'NUT_PASTE'
  | 'FRUIT_PRODUCT'
  | 'CHOCOLATE'
  | 'TEA'
  | 'COFFEE'
  | 'CONFECTIONERY'
  | 'FLAVOR_PASTE'
  | 'FLAVOR_CONCENTRATE'
  | 'VARIEGATO'
  | 'TOPPING'
  | 'INCLUSION'
  | 'COATING'
  | 'BASE_MIX'
  | 'STABILIZER'
  | 'EMULSIFIER'
  | 'INTEGRATOR'
  | 'TECHNICAL_ADDITIVE'
  | 'UNKNOWN';

export type ProductSemanticFamily =
  | ProductFamilyId
  | 'tea'
  | 'coffee'
  | 'cocoa'
  | 'nut'
  | 'savory_spread'
  | 'bakery_mix'
  | 'confectionery'
  | 'variegato'
  | 'topping'
  | 'inclusion'
  | 'coating'
  | 'technical_additive'
  | 'unknown';

export type ProductPhysicalForm =
  | 'SOLID'
  | 'DRY'
  | 'POWDER'
  | 'PASTE'
  | 'PUREE'
  | 'LIQUID'
  | 'SAUCE'
  | 'COATING'
  | 'UNKNOWN';

export type ProductIntendedUsageRole =
  | 'BASE_ONLY'
  | 'TOPPING_ONLY'
  | 'BASE_AND_TOPPING'
  | 'NEITHER_REVIEW';

export type ProductFlavorDomain =
  | 'CHOCOLATE_WHITE'
  | 'CHOCOLATE_DARK'
  | 'CHOCOLATE_GENERAL'
  | 'MILK_CREAM'
  | 'ALCOHOL'
  | 'PISTACHIO'
  | 'HAZELNUT'
  | 'COCONUT'
  | 'TEA'
  | 'COFFEE'
  | 'FRUIT'
  | 'NEUTRAL'
  | 'UNKNOWN';

export type ProductDosageBasis =
  | 'WATER'
  | 'MILK'
  | 'LIQUID_MIX'
  | 'FINISHED_MIX'
  | 'PRODUCT'
  | 'UNKNOWN';

export type ProductDosageUnit =
  | 'G_PER_L'
  | 'G_PER_KG'
  | 'G_PER_10_KG'
  | 'ML_PER_L'
  | 'PERCENT'
  | 'AS_DESIRED'
  | 'UNKNOWN';

export type ProductDosageNormalizationBasis =
  | 'GELLATTI_BASE_1000G'
  | 'GELLATTI_1ML_1G_NORMALIZATION'
  | 'SOURCE_G_PER_KG_1000G'
  | 'SOURCE_G_PER_10_KG_10000G'
  | 'SOURCE_PERCENT';

export interface ProductDosageInterpretation {
  semantics: 'FIXED' | 'AS_DESIRED' | 'NONE' | 'UNKNOWN';
  value: number | null;
  /** Upper source value when the manufacturer stated a range. */
  valueMax: number | null;
  unit: ProductDosageUnit;
  basis: ProductDosageBasis;
  /** Gellatti working percentage; never an automatic recipe dose or permission gate. */
  normalizedMassPercent: number | null;
  normalizedMassPercentMax: number | null;
  normalizationBasis: ProductDosageNormalizationBasis | null;
  /** Retained for backward-compatible traces; no density subsystem is consulted. */
  densityResolved: boolean;
  evidence: string | null;
  reasonCodes: string[];
}

export interface ProductSemanticEvidence {
  name: string | null;
  brand: string | null;
  manufacturer: string | null;
  manufacturerCode: string | null;
  gtin: string | null;
  productType: string | null;
  category: string | null;
  subcategory: string | null;
  variant: string | null;
  ingredients: string | null;
  nutrition: string | null;
  description: string | null;
  dosage: string | null;
  technicalParameters: string | null;
  sourceUrls: readonly string[];
}

const semanticText = (value: string | null | undefined, limit: number): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed.slice(0, limit);
};

/**
 * One bounded representation for browser, Edge cache and catalog-submit.
 * Classification and receipt fingerprints therefore describe the exact same
 * bytes even when a source document contains very long free text.
 */
export function canonicalizeProductSemanticEvidence(
  input: ProductSemanticEvidence,
): ProductSemanticEvidence {
  return {
    name: semanticText(input.name, 200),
    brand: semanticText(input.brand, 120),
    manufacturer: semanticText(input.manufacturer, 160),
    manufacturerCode: semanticText(input.manufacturerCode, 100),
    gtin: semanticText(input.gtin, 20),
    productType: semanticText(input.productType, 80),
    category: semanticText(input.category, 160),
    subcategory: semanticText(input.subcategory, 160),
    variant: semanticText(input.variant, 160),
    ingredients: semanticText(input.ingredients, 2_000),
    nutrition: semanticText(input.nutrition, 1_000),
    description: semanticText(input.description, 2_000),
    dosage: semanticText(input.dosage, 240),
    technicalParameters: semanticText(input.technicalParameters, 2_000),
    sourceUrls: input.sourceUrls
      .filter((url): url is string => typeof url === 'string' && url.trim() !== '')
      .slice(0, 8)
      .map((url) => url.slice(0, 400)),
  };
}

export interface ProductSemanticClassification {
  authority: typeof PRODUCT_RECOGNITION_VERSION;
  classificationSource:
    | 'DETERMINISTIC'
    | 'SERVER_MODEL'
    | 'CUSTOMER_CONFIRMED'
    | 'OWNER_CONFIRMED'
    | 'REVIEW_REQUIRED';
  productArchetype: ProductArchetype;
  ingredientFamily: ProductSemanticFamily;
  physicalForm: ProductPhysicalForm;
  intendedUsageRole: ProductIntendedUsageRole;
  flavorDomain: ProductFlavorDomain;
  isProfessionalProduct: boolean;
  isTechnicalProduct: boolean;
  isDosageDependent: boolean;
  dosage: ProductDosageInterpretation;
  manufacturerCategory: string | null;
  manufacturerSubcategory: string | null;
  compatibleMapperCategories: string[];
  forbiddenMapperCategories: string[];
  confidence: number;
  reasonCodes: string[];
  evidenceRefs: string[];
  modelRequired: boolean;
  modelReasonCodes: string[];
  evidenceFingerprint: string;
}

export interface MapperSemanticCandidate {
  ingredientId: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  gtin?: string | null;
}

export interface MapperSemanticCompatibility {
  compatible: boolean;
  reasonCodes: string[];
  candidate: ProductSemanticClassification;
}

export interface ProductSemanticModelOutput {
  productArchetype: ProductArchetype;
  ingredientFamily: ProductSemanticFamily;
  physicalForm: ProductPhysicalForm;
  intendedUsageRole: ProductIntendedUsageRole;
  flavorDomain: ProductFlavorDomain;
  professional: boolean;
  technical: boolean;
  dosageDependent: boolean;
  dosage: {
    semantics: ProductDosageInterpretation['semantics'];
    value: number | null;
    unit: ProductDosageUnit;
    basis: ProductDosageBasis;
  };
  compatibleMapperCategories: string[];
  forbiddenMapperCategories: string[];
  confidence: number;
  reasonCodes: string[];
  evidenceRefs: string[];
}

const PRODUCT_ARCHETYPES: readonly ProductArchetype[] = [
  'NORMAL_INGREDIENT',
  'COCOA_POWDER',
  'WHOLE_NUT',
  'DRIED_MIX',
  'SAVORY_SPREAD',
  'BAKERY_MIX',
  'NUT_PASTE',
  'FRUIT_PRODUCT',
  'CHOCOLATE',
  'TEA',
  'COFFEE',
  'CONFECTIONERY',
  'FLAVOR_PASTE',
  'FLAVOR_CONCENTRATE',
  'VARIEGATO',
  'TOPPING',
  'INCLUSION',
  'COATING',
  'BASE_MIX',
  'STABILIZER',
  'EMULSIFIER',
  'INTEGRATOR',
  'TECHNICAL_ADDITIVE',
  'UNKNOWN',
];
const SEMANTIC_FAMILIES: readonly ProductSemanticFamily[] = [
  'plant_protein_isolate',
  'dairy_protein',
  'coconut_fat',
  'cocoa_butter',
  'liquid_vegetable_oil',
  'nut_paste',
  'sugar_sucrose',
  'glucose_dextrose',
  'other_sugar',
  'stabilizer_hydrocolloid',
  'emulsifier',
  'fibre_inulin',
  'starch',
  'beverage',
  'plant_beverage',
  'dairy_liquid',
  'fruit',
  'chocolate',
  'flavor_paste',
  'base_mix',
  'alcohol',
  'tea',
  'coffee',
  'cocoa',
  'nut',
  'savory_spread',
  'bakery_mix',
  'confectionery',
  'variegato',
  'topping',
  'inclusion',
  'coating',
  'technical_additive',
  'unknown',
];
const PHYSICAL_FORMS: readonly ProductPhysicalForm[] = [
  'SOLID',
  'DRY',
  'POWDER',
  'PASTE',
  'PUREE',
  'LIQUID',
  'SAUCE',
  'COATING',
  'UNKNOWN',
];
const USAGE_ROLES: readonly ProductIntendedUsageRole[] = [
  'BASE_ONLY',
  'TOPPING_ONLY',
  'BASE_AND_TOPPING',
  'NEITHER_REVIEW',
];
const FLAVOR_DOMAINS: readonly ProductFlavorDomain[] = [
  'CHOCOLATE_WHITE',
  'CHOCOLATE_DARK',
  'CHOCOLATE_GENERAL',
  'MILK_CREAM',
  'ALCOHOL',
  'PISTACHIO',
  'HAZELNUT',
  'COCONUT',
  'TEA',
  'COFFEE',
  'FRUIT',
  'NEUTRAL',
  'UNKNOWN',
];
const DOSAGE_SEMANTICS: readonly ProductDosageInterpretation['semantics'][] = [
  'FIXED',
  'AS_DESIRED',
  'NONE',
  'UNKNOWN',
];
const DOSAGE_UNITS: readonly ProductDosageUnit[] = [
  'G_PER_L',
  'G_PER_KG',
  'G_PER_10_KG',
  'ML_PER_L',
  'PERCENT',
  'AS_DESIRED',
  'UNKNOWN',
];
const DOSAGE_BASES: readonly ProductDosageBasis[] = [
  'WATER',
  'MILK',
  'LIQUID_MIX',
  'FINISHED_MIX',
  'PRODUCT',
  'UNKNOWN',
];

/** Strict schema passed unchanged to the existing server Responses wrapper. */
export const PRODUCT_RECOGNITION_MODEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'productArchetype',
    'ingredientFamily',
    'physicalForm',
    'intendedUsageRole',
    'flavorDomain',
    'professional',
    'technical',
    'dosageDependent',
    'dosage',
    'compatibleMapperCategories',
    'forbiddenMapperCategories',
    'confidence',
    'reasonCodes',
    'evidenceRefs',
  ],
  properties: {
    productArchetype: { type: 'string', enum: PRODUCT_ARCHETYPES },
    ingredientFamily: { type: 'string', enum: SEMANTIC_FAMILIES },
    physicalForm: { type: 'string', enum: PHYSICAL_FORMS },
    intendedUsageRole: { type: 'string', enum: USAGE_ROLES },
    flavorDomain: { type: 'string', enum: FLAVOR_DOMAINS },
    professional: { type: 'boolean' },
    technical: { type: 'boolean' },
    dosageDependent: { type: 'boolean' },
    dosage: {
      type: 'object',
      additionalProperties: false,
      required: ['semantics', 'value', 'unit', 'basis'],
      properties: {
        semantics: { type: 'string', enum: DOSAGE_SEMANTICS },
        value: { type: ['number', 'null'] },
        unit: { type: 'string', enum: DOSAGE_UNITS },
        basis: { type: 'string', enum: DOSAGE_BASES },
      },
    },
    compatibleMapperCategories: { type: 'array', maxItems: 16, items: { type: 'string' } },
    forbiddenMapperCategories: { type: 'array', maxItems: 16, items: { type: 'string' } },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reasonCodes: { type: 'array', maxItems: 24, items: { type: 'string' } },
    evidenceRefs: { type: 'array', maxItems: 16, items: { type: 'string' } },
  },
} as const;

const normalized = (value: string | null | undefined): string =>
  foldLatin(value)
    .replace(/[^a-z0-9%/.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const meaningful = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || ['not_found', 'not_applicable', 'unknown'].includes(trimmed.toLowerCase())) {
    return null;
  }
  return trimmed;
};

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const evidenceFingerprint = (value: ProductSemanticEvidence): string => {
  const serialized = stableJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `recognition-v2-${hash.toString(16).padStart(8, '0')}`;
};

const dosageBasis = (text: string): ProductDosageBasis => {
  if (/\b(water|woda|wody|acqua)\b/.test(text)) return 'WATER';
  if (/\b(milk|mleko|mleka|latte)\b/.test(text)) return 'MILK';
  if (/\b(liquid mix|mieszank[ai] plyn|fase liquida)\b/.test(text)) return 'LIQUID_MIX';
  if (/\b(finished mix|gotow[a-z]* mieszank[a-z]*|miscela finita|mix finale)\b/.test(text)) {
    return 'FINISHED_MIX';
  }
  if (/\b(product|produktu|prodotto)\b/.test(text)) return 'PRODUCT';
  return 'UNKNOWN';
};

const dosageNumber = (value: string): number | null => {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizedPercent = (value: number | null, divisor: number): number | null =>
  value === null ? null : Math.round((value / divisor) * 1_000_000) / 1_000_000;

/**
 * Parse the manufacturer's dosage literally and derive only the accepted
 * Gellatti working percentage. Raw wording remains the source of truth and the
 * derived percentage is informational — it never becomes an automatic dose.
 */
export function parseProductDosage(value: string | null | undefined): ProductDosageInterpretation {
  const raw = meaningful(value);
  if (!raw) {
    return {
      semantics: 'NONE',
      value: null,
      valueMax: null,
      unit: 'UNKNOWN',
      basis: 'UNKNOWN',
      normalizedMassPercent: null,
      normalizedMassPercentMax: null,
      normalizationBasis: null,
      densityResolved: false,
      evidence: null,
      reasonCodes: ['DOSAGE_NOT_STATED'],
    };
  }
  const text = normalized(raw);
  const dosageSyntax = foldLatin(raw)
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9%/.,-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/\b(q\s*\.?\s*b\s*\.?|quanto basta|as desired|to taste|wedlug uznania)\b/.test(text)) {
    return {
      semantics: 'AS_DESIRED',
      value: null,
      valueMax: null,
      unit: 'AS_DESIRED',
      basis: 'UNKNOWN',
      normalizedMassPercent: null,
      normalizedMassPercentMax: null,
      normalizationBasis: null,
      densityResolved: false,
      evidence: raw,
      reasonCodes: ['DOSAGE_AS_DESIRED'],
    };
  }
  const range = dosageSyntax.match(
    /(\d+(?:[.,]\d+)?)\s*(?:-|to|do)\s*(\d+(?:[.,]\d+)?)\s*g\s*\/\s*(10\s*kg|kg|l)\b/,
  );
  const fixed = dosageSyntax.match(/(\d+(?:[.,]\d+)?)\s*g\s*\/\s*(10\s*kg|kg|l)\b/);
  if (fixed) {
    const parsed = dosageNumber(range?.[1] ?? fixed[1]!);
    const parsedMax = range ? dosageNumber(range[2]!) : null;
    const denominator = (range?.[3] ?? fixed[2]!).replace(/\s+/g, '');
    const unit: ProductDosageUnit =
      denominator === 'l' ? 'G_PER_L' : denominator === '10kg' ? 'G_PER_10_KG' : 'G_PER_KG';
    const divisor = unit === 'G_PER_10_KG' ? 100 : 10;
    const normalizationBasis: ProductDosageNormalizationBasis =
      unit === 'G_PER_L'
        ? 'GELLATTI_BASE_1000G'
        : unit === 'G_PER_10_KG'
          ? 'SOURCE_G_PER_10_KG_10000G'
          : 'SOURCE_G_PER_KG_1000G';
    return {
      semantics: 'FIXED',
      value: parsed,
      valueMax: parsedMax,
      unit,
      basis: dosageBasis(text),
      normalizedMassPercent: normalizedPercent(parsed, divisor),
      normalizedMassPercentMax: normalizedPercent(parsedMax, divisor),
      normalizationBasis,
      densityResolved: false,
      evidence: raw,
      reasonCodes:
        unit === 'G_PER_L'
          ? ['DOSAGE_G_PER_L_NORMALIZED_GELLATTI_BASE_1000G']
          : unit === 'G_PER_10_KG'
            ? ['DOSAGE_G_PER_10_KG_NORMALIZED']
            : ['DOSAGE_G_PER_KG_NORMALIZED'],
    };
  }
  const milliliters = dosageSyntax.match(/(\d+(?:[.,]\d+)?)\s*ml\s*\/\s*l\b/);
  if (milliliters) {
    /* OWNER RULE (2026-08-25, frozen): 1 ml = 1 g and 1 L of Gellatti base is
       1000 g, so ml/L normalises exactly like g/L — 20 ml/L is 2%. This branch
       previously held out for a density that Gellatti has decided not to model,
       leaving every ml/L dosage permanently unnormalised and in review. The raw
       `value` and `unit: 'ML_PER_L'` are still preserved beside the normalised
       percentage, so the manufacturer's own declaration is never lost. */
    const parsedMl = dosageNumber(milliliters[1]!);
    return {
      semantics: 'FIXED',
      value: parsedMl,
      valueMax: null,
      unit: 'ML_PER_L',
      basis: dosageBasis(text),
      normalizedMassPercent: normalizedPercent(parsedMl, 10),
      normalizedMassPercentMax: null,
      normalizationBasis: 'GELLATTI_1ML_1G_NORMALIZATION',
      densityResolved: true,
      evidence: raw,
      reasonCodes: ['DOSAGE_ML_PER_L_NORMALIZED_GELLATTI_1ML_1G'],
    };
  }
  const percent = dosageSyntax.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (percent) {
    const parsed = dosageNumber(percent[1]!);
    return {
      semantics: 'FIXED',
      value: parsed,
      valueMax: null,
      unit: 'PERCENT',
      basis: dosageBasis(text),
      normalizedMassPercent: parsed,
      normalizedMassPercentMax: null,
      normalizationBasis: 'SOURCE_PERCENT',
      densityResolved: false,
      evidence: raw,
      reasonCodes: ['DOSAGE_PERCENT_EXACT'],
    };
  }
  return {
    semantics: 'UNKNOWN',
    value: null,
    valueMax: null,
    unit: 'UNKNOWN',
    basis: 'UNKNOWN',
    normalizedMassPercent: null,
    normalizedMassPercentMax: null,
    normalizationBasis: null,
    densityResolved: false,
    evidence: raw,
    reasonCodes: ['DOSAGE_SEMANTICS_UNRESOLVED'],
  };
}

const archetypeOf = (
  identity: string,
  category: string,
  subcategory: string,
  description: string,
  ingredients: string,
  inferredFamily: ProductFamilyId | null,
): ProductArchetype => {
  const taxonomy = `${category} ${subcategory}`;
  const all = `${identity} ${taxonomy} ${description}`;
  // Product identity beats a retail container or a flavour adjective. A cake
  // mix described as chocolate is still a bakery mix, never chocolate.
  if (
    /\b(babeczk|muffin|cake mix|ciasto w proszku|mieszank[a-z]* do (?:ciast|wypiek)|krem do tort|proszek do pieczenia|drozdze instant|smietan fix)\w*/.test(
      identity,
    ) ||
    (/\bbaking\b/.test(taxonomy) && /\b(babeczk|muffin|cake|ciast|wypiek)\w*/.test(identity))
  ) {
    return 'BAKERY_MIX';
  }
  if (/\b(hummus|humus)\b/.test(identity)) return 'SAVORY_SPREAD';
  // Pure cocoa is intentionally identity-first. Mapper descriptions such as
  // "NUTELLA · Cocoa Powder" cannot enter this family merely through a noisy
  // subcategory suffix. A directly declared one-product cocoa ingredient may
  // supply the missing form wording when the front name is simply "Cacao
  // Puro"; this is package evidence, not a product-specific override.
  if (
    /^(?:cacao|cacau|cocoa|kakao)\b/.test(identity) &&
    /(?:\b(?:powder|polvo|poudre|pulver|proszek|magro|desgrasad|defatted|odtluszcz|alkaliz|amaro)\w*|\bpo\b)/.test(
      `${identity} ${ingredients}`,
    )
  ) {
    return 'COCOA_POWDER';
  }
  // Post-process roles precede generic chocolate/paste words. A chocolate
  // rippling sauce is a variegato, not a generic chocolate ingredient.
  if (/\b(variegat|rippl|layering|przeklad|marmoriz)\w*/.test(all)) return 'VARIEGATO';
  if (/\b(topping|polew[a-z]* do dekor|sos do dekor)\b/.test(all)) return 'TOPPING';
  if (/\b(coating|shell|copertura|stracciatell|polewa|otulina)\b/.test(all)) return 'COATING';
  if (
    /\b(inclusion|inclusioni|wkladk|croccante|crunch|crisp inclusion)\b/.test(all) &&
    !/\b(gumm(?:y|i)\w*|fruit gum\w*|candy\w*|candies\w*|zelk\w*)\b/.test(all)
  )
    return 'INCLUSION';
  if (
    /\b(stabiliz|stabilizz|neutro|hydrocolloid)\w*/.test(all) ||
    inferredFamily === 'stabilizer_hydrocolloid'
  ) {
    return 'STABILIZER';
  }
  if (/\b(emulsif|emulgator|emulsionante)\w*/.test(all) || inferredFamily === 'emulsifier') {
    return 'EMULSIFIER';
  }
  if (/\b(integrator|integratore|integra (fibre|frutta|latte))\b/.test(all)) return 'INTEGRATOR';
  if (/\b(technical additive|dodatek techniczny|special process mix)\b/.test(all)) {
    return 'TECHNICAL_ADDITIVE';
  }
  if (
    /\b(base mix|ice cream base|gelato base|baza |bazy |baz[ay] specjal|dozowanie|speedy|semifreddo|granita system)\b/.test(
      all,
    ) ||
    inferredFamily === 'base_mix'
  ) {
    return 'BASE_MIX';
  }
  // "Bakery & sweets" / "Słodycze" are retailer containers, not product
  // identities. They may narrow a search, but cannot turn chewing gum, salt or
  // any other unrelated article into a confectionery inclusion. Require a real
  // product-class signal from the identity/description, or a specific (not
  // catch-all) subcategory. An unsupported/ambiguous identity then remains
  // REVIEW_REQUIRED and is routed to the existing semantic classifier.
  const confectioneryIdentity = `${identity} ${description}`;
  const specificConfectionerySubcategory = subcategory.replace(
    /\b(?:bakery|sweets|slodycz\w*|biezac\w*|katalog\w*|online)\b/g,
    ' ',
  );
  // Some retail names are opaque brand variants (for example a coined flavour
  // name) even though the exact label makes the article type unambiguous. A
  // glucose-syrup + sugar + gelatine declaration is a high-specificity gummy/
  // marshmallow confectionery signature. It is safe semantic evidence, not a
  // chemistry inference: no ingredient amount or Engine value is fabricated.
  // Broad single ingredient mentions remain deliberately insufficient.
  const gummyConfectioneryIngredients =
    /\b(glucose syrup|glukosesirup|syrop glukozowy|jarabe de glucosa|sciroppo di glucosio)\b/.test(
      ingredients,
    ) &&
    /\b(sugar|zucker|cukier|azucar|zucchero)\b/.test(ingredients) &&
    /\b(gelatin|gelatine|gelatina|zelatyn\w*)\b/.test(ingredients);
  if (
    /\b(baton\w*|wafer\w*|wafel\w*|cookie\w*|biscuit\w*|brownie\w*|herbatnik\w*|ciastk\w*|praline bar|gumm(?:y|i)\w*|fruit gum\w*|candy\w*|candies\w*|zelk\w*)\b/.test(
      confectioneryIdentity,
    ) ||
    /\b(baton\w*|wafer\w*|wafel\w*|cookie\w*|biscuit\w*|brownie\w*|herbatnik\w*|ciastk\w*|praline|gumm(?:y|i)\w*|fruit gum\w*|candy\w*|candies\w*|zelk\w*)\b/.test(
      specificConfectionerySubcategory,
    ) ||
    gummyConfectioneryIngredients
  ) {
    return 'CONFECTIONERY';
  }
  if (/\b(flavo(u)?r concentrate|koncentrat smak|aroma concentrat)\b/.test(all)) {
    return 'FLAVOR_CONCENTRATE';
  }
  if (
    /\b(flavo(u)?r paste|pasta smak|gelato paste|paste do lod)\b/.test(all) ||
    inferredFamily === 'flavor_paste'
  ) {
    return 'FLAVOR_PASTE';
  }
  if (
    /\b(mieszank[a-z]* bakali|trail mix|mixed nuts|nut mix)\w*/.test(identity) ||
    (/\bmieszank\w*/.test(identity) && /\bbakali\w*/.test(taxonomy))
  ) {
    return 'DRIED_MIX';
  }
  // A directly named whole nut must not inherit the generic "nut_paste"
  // family from its retail category. Post-process/inclusion identities have
  // already been resolved above, and explicit paste/cream words remain paste.
  if (
    !/\b(paste|pasta|krem|cream|puree)\w*/.test(identity) &&
    /\b(orzech|migdal|almond|cashew|pistach|hazelnut|walnut|macadam|pecan|brazil nut|peanut)\w*/.test(
      identity,
    ) &&
    (/^(?:orzech|migdal|almond|cashew|pistach|hazelnut|walnut|macadam|pecan|brazil nut|peanut)\w*/.test(
      identity,
    ) ||
      /^(?:nut|nuts)\b|\bnuts pastes\b|\borzechy i migdaly\b/.test(taxonomy))
  ) {
    return 'WHOLE_NUT';
  }
  // A retailer category such as "Coffee, tea & spices" is only a container.
  // Identity/subcategory/description must identify the actual coffee or tea;
  // otherwise spices and salts would silently become tea.
  const beverageIdentity = `${identity} ${subcategory} ${description}`;
  if (/\b(coffee|caffe|kaw(?:a|y|ie|owy|owa|owe)|espresso)\b/.test(beverageIdentity)) {
    return 'COFFEE';
  }
  if (/\b(tea|herbata|herbaty|herbacian\w*|te verde|te nero|matcha)\b/.test(beverageIdentity)) {
    return 'TEA';
  }
  if (inferredFamily === 'nut_paste') return 'NUT_PASTE';
  if (inferredFamily === 'fruit') return 'FRUIT_PRODUCT';
  if (
    inferredFamily === 'chocolate' ||
    inferredFamily === 'cocoa_butter' ||
    /\b(choco|czekolad|cocoa|kakao)\w*/.test(all)
  ) {
    return 'CHOCOLATE';
  }
  if (inferredFamily) return 'NORMAL_INGREDIENT';
  return 'UNKNOWN';
};

const semanticFamilyOf = (
  archetype: ProductArchetype,
  inferredFamily: ProductFamilyId | null,
): ProductSemanticFamily => {
  if (archetype === 'COCOA_POWDER') return 'cocoa';
  if (archetype === 'WHOLE_NUT') return 'nut';
  if (archetype === 'DRIED_MIX') return 'inclusion';
  if (archetype === 'SAVORY_SPREAD') return 'savory_spread';
  if (archetype === 'BAKERY_MIX') return 'bakery_mix';
  if (archetype === 'TEA') return 'tea';
  if (archetype === 'COFFEE') return 'coffee';
  if (archetype === 'CONFECTIONERY') return 'confectionery';
  if (archetype === 'VARIEGATO') return 'variegato';
  if (archetype === 'TOPPING') return 'topping';
  if (archetype === 'INCLUSION') return 'inclusion';
  if (archetype === 'COATING') return 'coating';
  if (archetype === 'TECHNICAL_ADDITIVE') return 'technical_additive';
  // "Milk chocolate" is chocolate: the dairy word in its name describes the
  // variety, not the kind. The archetype already resolved it; only cocoa butter
  // keeps its own (chocolate-family) fat identity.
  if (archetype === 'CHOCOLATE')
    return inferredFamily === 'cocoa_butter' ? 'cocoa_butter' : 'chocolate';
  return inferredFamily ?? 'unknown';
};

const formOf = (
  identity: string,
  category: string,
  subcategory: string,
  description: string,
  archetype: ProductArchetype,
): ProductPhysicalForm => {
  const all = `${identity} ${category} ${subcategory} ${description}`;
  if (archetype === 'COCOA_POWDER' || archetype === 'BAKERY_MIX') return 'POWDER';
  if (archetype === 'WHOLE_NUT' || archetype === 'DRIED_MIX') return 'DRY';
  if (archetype === 'SAVORY_SPREAD') return 'PASTE';
  if (
    /\b(rippling sauce|sauce|sos|variegat)\w*/.test(all) ||
    archetype === 'VARIEGATO' ||
    archetype === 'TOPPING'
  )
    return 'SAUCE';
  if (/\b(puree|puree|pulp|przecier)\w*/.test(all)) return 'PUREE';
  if (/\b(paste|pasta|krem)\w*/.test(all)) return 'PASTE';
  if (
    /\b(liquid|plyn|syrup|syrop|beverage|drink|bebida|boisson|napoj|getrank|getraenk|refresco|soda|lemonade|limonade|tonic|isotonic|electrolyte)\w*/.test(
      all,
    )
  ) {
    return 'LIQUID';
  }
  if (/\b(coating|shell|copertura|polewa|otulina)\w*/.test(all)) return 'COATING';
  if (/(?:\b(?:powder|polvo|poudre|pulver|proszek|polvere|liofiliz)\w*|\bpo\b)/.test(all)) {
    return 'POWDER';
  }
  if (/\b(dry tea|dried leaves|suszon[a-z]* lisc|herbata sucha|lisciasta)\b/.test(all))
    return 'DRY';
  if (
    /\b(baton\w*|bar\b|wafer\w*|wafel\w*|cookie\w*|biscuit\w*|brownie\w*|ciastk\w*|chocolate tablet\w*|tabliczk\w*)/.test(
      all,
    ) ||
    archetype === 'CONFECTIONERY'
  )
    return 'SOLID';
  if (archetype === 'STABILIZER' || archetype === 'EMULSIFIER' || archetype === 'BASE_MIX') {
    return /\b(liquid|plyn)\b/.test(all) ? 'LIQUID' : 'POWDER';
  }
  if (archetype === 'TEA') return 'DRY';
  if (archetype === 'COFFEE') return 'DRY';
  // A chocolate article whose identity or description names the solid article
  // (tablet, bar, couverture, callets, chunks…) is SOLID. A chocolate with no
  // form cue at all stays UNKNOWN for the model, as the owner's gate requires.
  if (
    archetype === 'CHOCOLATE' &&
    /\b(tablet\w*|tableta\w*|tabliczk\w*|tafel\w*|bar|bars|barra\w*|riegel|couverture|kuwertur\w*|callets|drops|chunks|block\w*|pieces|pastilles)\b/.test(
      all,
    )
  )
    return 'SOLID';
  return 'UNKNOWN';
};

const flavorDomainOf = (text: string, archetype: ProductArchetype): ProductFlavorDomain => {
  if (/\b(white chocolate|bial[a-z]* czekolad|cioccolato bianco)\b/.test(text))
    return 'CHOCOLATE_WHITE';
  if (/\b(dark chocolate|gorzka czekolad|czekolad[a-z]* ciemn|fondente)\b/.test(text))
    return 'CHOCOLATE_DARK';
  if (/\b(alcohol|alcol|liqueur|likier|rum|whisky|vodka|wodka)\w*/.test(text)) return 'ALCOHOL';
  if (/\b(milk cream|milk creamy|mleczn|smietank|panna|latte)\w*/.test(text)) return 'MILK_CREAM';
  if (/\b(pistach|pistacj)\w*/.test(text)) return 'PISTACHIO';
  if (/\b(hazelnut|nocciol|orzech laskow)\w*/.test(text)) return 'HAZELNUT';
  if (/\b(coconut|cocos|kokos)\w*/.test(text)) return 'COCONUT';
  if (
    archetype === 'COFFEE' ||
    /\b(coffee|caffe|kaw(?:a|y|ie|owy|owa|owe)|espresso)\b/.test(text)
  ) {
    return 'COFFEE';
  }
  if (archetype === 'TEA') return 'TEA';
  if (/\b(fruit|owoc|puree|pulp|przecier)\w*/.test(text)) return 'FRUIT';
  if (/\b(chocolate|choco|czekolad|cocoa|kakao)\w*/.test(text)) return 'CHOCOLATE_GENERAL';
  if (/\b(neutral|neutralny|neutro)\b/.test(text)) return 'NEUTRAL';
  return 'UNKNOWN';
};

const roleOf = (archetype: ProductArchetype, all: string): ProductIntendedUsageRole => {
  if (archetype === 'WHOLE_NUT') return 'BASE_AND_TOPPING';
  if (archetype === 'DRIED_MIX') return 'TOPPING_ONLY';
  if (archetype === 'SAVORY_SPREAD' || archetype === 'BAKERY_MIX') return 'NEITHER_REVIEW';
  if (['VARIEGATO', 'TOPPING', 'INCLUSION', 'COATING', 'CONFECTIONERY'].includes(archetype)) {
    if (/\b(also in base|rowniez do bazy|base and topping)\b/.test(all)) return 'BASE_AND_TOPPING';
    return 'TOPPING_ONLY';
  }
  if (/\b(base and topping|do bazy i dekor|base oraz topping)\b/.test(all))
    return 'BASE_AND_TOPPING';
  // q.b. is a dosage semantic, not a role. Without separate taxonomy or use
  // evidence an unknown product remains review, regardless of dosage wording.
  if (archetype === 'UNKNOWN') return 'NEITHER_REVIEW';
  return 'BASE_ONLY';
};

const mapperCategoriesFor = (
  family: ProductSemanticFamily,
  archetype: ProductArchetype,
): string[] => {
  if (archetype === 'COCOA_POWDER') return ['cocoa', 'chocolate'];
  if (archetype === 'WHOLE_NUT') return ['nut'];
  if (archetype === 'DRIED_MIX') return ['inclusion', 'bakery_inclusion'];
  if (archetype === 'SAVORY_SPREAD' || archetype === 'BAKERY_MIX') return [];
  if (archetype === 'VARIEGATO') return ['variegato', 'flavor_paste'];
  if (archetype === 'TOPPING') return ['topping', 'flavor_syrup', 'flavor_paste'];
  if (archetype === 'INCLUSION' || archetype === 'CONFECTIONERY')
    return ['inclusion', 'bakery_inclusion', 'confectionery_inclusion'];
  if (archetype === 'COATING') return ['coating', 'chocolate'];
  const map: Partial<Record<ProductSemanticFamily, string[]>> = {
    tea: ['coffee_tea'],
    coffee: ['coffee_tea'],
    nut_paste: ['nut', 'flavor_paste'],
    chocolate: ['chocolate', 'cocoa'],
    cocoa_butter: ['chocolate', 'cocoa', 'fat'],
    fruit: ['fruit'],
    base_mix: ['base_mix'],
    stabilizer_hydrocolloid: ['stabilizer'],
    emulsifier: ['emulsifier', 'stabilizer'],
    alcohol: ['alcohol'],
    beverage: ['beverage'],
    // Families whose Mapper home is unambiguous. Without these a product whose
    // NAME carries no Mapper vocabulary (a Spanish or German retail name) but
    // whose kind is known has no candidate pool at all — the matcher then
    // reports "no donor" although the Mapper holds dozens of verified rows of
    // exactly that kind. Mirrors the matcher's own ALLOWED_CATEGORIES.
    plant_beverage: ['beverage'],
    dairy_liquid: ['dairy', 'specialty'],
    dairy_protein: ['dairy', 'protein', 'specialty'],
    plant_protein_isolate: ['protein'],
    coconut_fat: ['coconut', 'fat'],
    liquid_vegetable_oil: ['fat', 'coconut'],
    sugar_sucrose: ['sweetener'],
    glucose_dextrose: ['sweetener'],
    other_sugar: ['sweetener'],
    starch: ['starch', 'fiber', 'base_mix'],
    fibre_inulin: ['fiber', 'stabilizer'],
    flavor_paste: ['flavor_paste', 'flavor_powder', 'flavor_syrup', 'flavor_concentrate'],
    inclusion: ['inclusion', 'bakery_inclusion', 'confectionery_inclusion'],
    confectionery: ['inclusion', 'bakery_inclusion', 'confectionery_inclusion'],
  };
  return map[family] ?? [];
};

/** The Mapper categories a resolved kind may draw candidates from (shared with the customer family gate). */
export const mapperCategoriesForSemantics = mapperCategoriesFor;

/** Archetypes whose identity includes how they are dosed. */
export const dosageGovernsArchetype = (archetype: ProductArchetype): boolean =>
  [
    'STABILIZER',
    'EMULSIFIER',
    'INTEGRATOR',
    'TECHNICAL_ADDITIVE',
    'BASE_MIX',
    'FLAVOR_CONCENTRATE',
  ].includes(archetype);

/** Deterministic first pass. It never calls a model and never fabricates missing fields. */
export function classifyProductSemantics(
  input: ProductSemanticEvidence,
): ProductSemanticClassification {
  input = canonicalizeProductSemanticEvidence(input);
  const name = normalized(input.name);
  const variant = normalized(input.variant);
  const category = normalized(input.category);
  const subcategory = normalized(input.subcategory);
  const description = normalized(`${input.description ?? ''} ${input.technicalParameters ?? ''}`);
  const ingredients = normalized(input.ingredients);
  const identity = `${name} ${variant}`.trim();
  const all = `${identity} ${category} ${subcategory} ${description}`.trim();
  const familyMatch = inferMapperFamily({
    name: meaningful(input.name),
    variant: meaningful(input.variant),
    ingredients: meaningful(input.ingredients),
    sourceCategory: meaningful(input.category),
    sourceSubcategory: meaningful(input.subcategory),
  });
  const inferredFamily = familyMatch?.family ?? null;
  const productArchetype = archetypeOf(
    identity,
    category,
    subcategory,
    description,
    ingredients,
    inferredFamily,
  );
  const ingredientFamily = semanticFamilyOf(productArchetype, inferredFamily);
  const physicalForm = formOf(identity, category, subcategory, description, productArchetype);
  const dosage = parseProductDosage(input.dosage);
  const intendedUsageRole = roleOf(productArchetype, all);
  const flavorDomain = flavorDomainOf(all, productArchetype);
  const productType = normalized(input.productType);
  const isProfessionalProduct =
    /\b(professional|technical)\b/.test(productType) ||
    /\bprofessional gelato products\b/.test(category);
  const technicalArchetype = [
    'STABILIZER',
    'EMULSIFIER',
    'INTEGRATOR',
    'TECHNICAL_ADDITIVE',
  ].includes(productArchetype);
  const dosageCriticalBase = productArchetype === 'BASE_MIX' && dosage.semantics === 'FIXED';
  const isTechnicalProduct = technicalArchetype || dosageCriticalBase;
  const isDosageDependent =
    technicalArchetype ||
    dosageCriticalBase ||
    (productArchetype === 'FLAVOR_CONCENTRATE' && dosage.semantics === 'FIXED');

  const modelReasonCodes: string[] = [];
  if (productArchetype === 'UNKNOWN') modelReasonCodes.push('ARCHETYPE_UNKNOWN');
  if (ingredientFamily === 'unknown') modelReasonCodes.push('FAMILY_UNKNOWN');
  if (physicalForm === 'UNKNOWN' && productArchetype !== 'NORMAL_INGREDIENT') {
    modelReasonCodes.push('FORM_UNKNOWN');
  }
  // Dosage wording is part of the identity only where dosage governs the article
  // (technical additives, base mixes, concentrates). On a consumer food a stray
  // web "dosage" string is noise, not an unresolved dimension: it must never
  // keep the product waiting for a model that has nothing to decide.
  if (dosage.semantics === 'UNKNOWN' && dosageGovernsArchetype(productArchetype)) {
    modelReasonCodes.push('DOSAGE_SEMANTICS_UNKNOWN');
  }
  const modelRequired = modelReasonCodes.length > 0;

  const reasonCodes = [
    `ARCHETYPE_${productArchetype}`,
    `ROLE_${intendedUsageRole}`,
    isProfessionalProduct ? 'PROFESSIONAL_CONTEXT_ONLY' : 'CONSUMER_OR_GENERAL_CONTEXT',
    isTechnicalProduct ? 'TRUE_TECHNICAL_OR_DOSAGE_CRITICAL' : 'NORMAL_PRODUCT',
    ...dosage.reasonCodes,
  ];
  const evidenceRefs = [
    meaningful(input.name) ? 'name' : null,
    meaningful(input.category) ? 'category' : null,
    meaningful(input.subcategory) ? 'subcategory' : null,
    meaningful(input.variant) ? 'variant' : null,
    meaningful(input.description) ? 'description' : null,
    meaningful(input.technicalParameters) ? 'technicalParameters' : null,
    meaningful(input.dosage) ? 'dosage' : null,
    meaningful(input.ingredients) ? 'ingredients' : null,
  ].filter((entry): entry is string => entry !== null);
  const resolvedDimensions = [
    productArchetype !== 'UNKNOWN',
    ingredientFamily !== 'unknown',
    physicalForm !== 'UNKNOWN',
    intendedUsageRole !== 'NEITHER_REVIEW',
  ].filter(Boolean).length;
  const confidence =
    Math.round(
      (0.5 + resolvedDimensions * 0.1 + (category ? 0.05 : 0) + (subcategory ? 0.05 : 0)) * 100,
    ) / 100;
  const compatibleMapperCategories = mapperCategoriesFor(ingredientFamily, productArchetype);

  return {
    authority: PRODUCT_RECOGNITION_VERSION,
    classificationSource: modelRequired ? 'REVIEW_REQUIRED' : 'DETERMINISTIC',
    productArchetype,
    ingredientFamily,
    physicalForm,
    intendedUsageRole,
    flavorDomain,
    isProfessionalProduct,
    isTechnicalProduct,
    isDosageDependent,
    dosage,
    manufacturerCategory: meaningful(input.category),
    manufacturerSubcategory: meaningful(input.subcategory),
    compatibleMapperCategories,
    forbiddenMapperCategories: [],
    confidence: Math.min(0.95, confidence),
    reasonCodes,
    evidenceRefs,
    modelRequired,
    modelReasonCodes,
    evidenceFingerprint: evidenceFingerprint(input),
  };
}

const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const enumValue = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
  typeof value === 'string' && allowed.includes(value as T) ? (value as T) : null;
const stringArray = (value: unknown, pattern: RegExp): string[] | null => {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || !pattern.test(entry))
  ) {
    return null;
  }
  return [...new Set(value as string[])];
};

/**
 * Validate and merge a semantic model result.
 *
 * Exact deterministic conclusions remain immutable. The model may fill only
 * UNKNOWN/REVIEW dimensions, and it may never introduce a dosage number that
 * the exact evidence parser did not already find.
 */
export function validateProductSemanticModelOutput(
  evidence: ProductSemanticEvidence,
  rawOutput: unknown,
): ProductSemanticClassification | null {
  evidence = canonicalizeProductSemanticEvidence(evidence);
  const base = classifyProductSemantics(evidence);
  const raw = objectValue(rawOutput);
  const productArchetype = enumValue(raw.productArchetype, PRODUCT_ARCHETYPES);
  const ingredientFamily = enumValue(raw.ingredientFamily, SEMANTIC_FAMILIES);
  const physicalForm = enumValue(raw.physicalForm, PHYSICAL_FORMS);
  const intendedUsageRole = enumValue(raw.intendedUsageRole, USAGE_ROLES);
  const flavorDomain = enumValue(raw.flavorDomain, FLAVOR_DOMAINS);
  const dosageRaw = objectValue(raw.dosage);
  const dosageSemantics = enumValue(dosageRaw.semantics, DOSAGE_SEMANTICS);
  const dosageUnit = enumValue(dosageRaw.unit, DOSAGE_UNITS);
  const dosageBasisValue = enumValue(dosageRaw.basis, DOSAGE_BASES);
  const dosageValue = dosageRaw.value;
  const reasonCodes = stringArray(raw.reasonCodes, /^[A-Z0-9_:-]{1,80}$/);
  const allowedEvidenceRefs = new Set([
    'name',
    'brand',
    'manufacturer',
    'manufacturerCode',
    'gtin',
    'productType',
    'category',
    'subcategory',
    'variant',
    'ingredients',
    'nutrition',
    'description',
    'dosage',
    'technicalParameters',
    'sourceUrls',
  ]);
  const evidenceRefs = stringArray(raw.evidenceRefs, /^[A-Za-z][A-Za-z0-9]*$/);
  const mapperCategoryPattern = /^[a-z0-9_ -]{1,80}$/i;
  const compatible = stringArray(raw.compatibleMapperCategories, mapperCategoryPattern);
  const forbidden = stringArray(raw.forbiddenMapperCategories, mapperCategoryPattern);
  if (
    !productArchetype ||
    !ingredientFamily ||
    !physicalForm ||
    !intendedUsageRole ||
    !flavorDomain ||
    !dosageSemantics ||
    !dosageUnit ||
    !dosageBasisValue ||
    typeof raw.professional !== 'boolean' ||
    typeof raw.technical !== 'boolean' ||
    typeof raw.dosageDependent !== 'boolean' ||
    typeof raw.confidence !== 'number' ||
    !Number.isFinite(raw.confidence) ||
    raw.confidence < 0 ||
    raw.confidence > 1 ||
    !reasonCodes ||
    !evidenceRefs ||
    evidenceRefs.some((ref) => {
      if (!allowedEvidenceRefs.has(ref)) return true;
      if (ref === 'sourceUrls') return evidence.sourceUrls.length === 0;
      return (
        meaningful(evidence[ref as keyof Omit<ProductSemanticEvidence, 'sourceUrls'>]) === null
      );
    }) ||
    !compatible ||
    !forbidden ||
    !(dosageValue === null || (typeof dosageValue === 'number' && Number.isFinite(dosageValue)))
  )
    return null;

  // A numeric dosage must already exist in the exact parser and be byte-value
  // equivalent. The classifier interprets a basis; it never creates a dose.
  if (dosageValue !== null && base.dosage.value !== dosageValue) return null;
  if (base.dosage.value !== null && dosageValue !== base.dosage.value) return null;
  if (base.dosage.unit !== 'UNKNOWN' && dosageUnit !== base.dosage.unit) return null;
  if (base.dosage.semantics !== 'UNKNOWN' && dosageSemantics !== base.dosage.semantics) return null;

  const finalArchetype =
    base.productArchetype === 'UNKNOWN' ? productArchetype : base.productArchetype;
  const finalFamily =
    base.ingredientFamily === 'unknown' ? ingredientFamily : base.ingredientFamily;
  const finalForm = base.physicalForm === 'UNKNOWN' ? physicalForm : base.physicalForm;
  const finalRole =
    base.intendedUsageRole === 'NEITHER_REVIEW' ? intendedUsageRole : base.intendedUsageRole;
  const finalFlavor = base.flavorDomain === 'UNKNOWN' ? flavorDomain : base.flavorDomain;
  const technicalArchetype = [
    'STABILIZER',
    'EMULSIFIER',
    'INTEGRATOR',
    'TECHNICAL_ADDITIVE',
  ].includes(finalArchetype);
  const exactTechnicalEvidence = evidenceRefs.some((ref) =>
    ['category', 'subcategory', 'description', 'technicalParameters', 'dosage'].includes(ref),
  );
  const modelTechnical =
    raw.technical === true &&
    exactTechnicalEvidence &&
    (technicalArchetype ||
      (finalArchetype === 'BASE_MIX' && base.dosage.semantics === 'FIXED') ||
      (finalArchetype === 'FLAVOR_CONCENTRATE' && base.dosage.semantics === 'FIXED'));
  const isTechnicalProduct = base.isTechnicalProduct || modelTechnical;
  const isDosageDependent =
    base.isDosageDependent ||
    (raw.dosageDependent === true && exactTechnicalEvidence && base.dosage.semantics === 'FIXED');
  const dosage: ProductDosageInterpretation = {
    ...base.dosage,
    basis: base.dosage.basis === 'UNKNOWN' ? dosageBasisValue : base.dosage.basis,
  };
  const modelReasonCodes = [
    ...(finalArchetype === 'UNKNOWN' ? ['ARCHETYPE_UNKNOWN'] : []),
    ...(finalFamily === 'unknown' ? ['FAMILY_UNKNOWN'] : []),
    ...(finalForm === 'UNKNOWN' ? ['FORM_UNKNOWN'] : []),
    ...(finalRole === 'NEITHER_REVIEW' ? ['ROLE_UNKNOWN'] : []),
    ...(dosage.semantics === 'UNKNOWN' && dosageGovernsArchetype(finalArchetype)
      ? ['DOSAGE_SEMANTICS_UNKNOWN']
      : []),
  ];

  return {
    ...base,
    classificationSource: 'SERVER_MODEL',
    productArchetype: finalArchetype,
    ingredientFamily: finalFamily,
    physicalForm: finalForm,
    intendedUsageRole: finalRole,
    flavorDomain: finalFlavor,
    // Market context is exact input data. A model cannot change it.
    isProfessionalProduct: base.isProfessionalProduct,
    isTechnicalProduct,
    isDosageDependent,
    dosage,
    compatibleMapperCategories: mapperCategoriesFor(finalFamily, finalArchetype),
    forbiddenMapperCategories: forbidden.map((entry) => normalized(entry).replace(/\s+/g, '_')),
    confidence: Math.round(Math.max(base.confidence, raw.confidence * 0.95) * 100) / 100,
    reasonCodes: [...base.reasonCodes, ...reasonCodes.map((code) => `MODEL_${code}`)],
    evidenceRefs: [...new Set([...base.evidenceRefs, ...evidenceRefs])],
    modelRequired: modelReasonCodes.length > 0,
    modelReasonCodes,
  };
}

const wetForms = new Set<ProductPhysicalForm>(['PASTE', 'PUREE', 'LIQUID', 'SAUCE', 'COATING']);
const dryForms = new Set<ProductPhysicalForm>(['DRY', 'POWDER', 'SOLID']);
const formContradiction = (a: ProductPhysicalForm, b: ProductPhysicalForm): boolean =>
  a !== 'UNKNOWN' &&
  b !== 'UNKNOWN' &&
  ((wetForms.has(a) && dryForms.has(b)) || (dryForms.has(a) && wetForms.has(b)));

const compatibleFamilyGroups: readonly (readonly ProductSemanticFamily[])[] = [
  ['dairy_liquid', 'dairy_protein'],
  ['coconut_fat', 'liquid_vegetable_oil'],
  ['sugar_sucrose', 'other_sugar'],
  ['glucose_dextrose', 'other_sugar'],
  // Cocoa powder is the dry cocoa member of the chocolate family. Form and
  // role gates below still prevent a solid chocolate bar or wet coating from
  // borrowing a powder profile; this only removes the false family-level veto.
  ['chocolate', 'cocoa', 'cocoa_butter'],
  // A packaged confectionery/bakery article (brownie, cookie, bar) and a Mapper
  // "inclusion" row are the same kind of post-process solid: the Mapper's own
  // inclusion rows ARE the reference for such products. Form and role gates
  // still apply (a sauce cannot lend to a bar).
  ['confectionery', 'inclusion'],
];
const familyCompatible = (a: ProductSemanticFamily, b: ProductSemanticFamily): boolean =>
  a === 'unknown' ||
  b === 'unknown' ||
  a === b ||
  compatibleFamilyGroups.some((group) => group.includes(a) && group.includes(b));

const flavorContradiction = (a: ProductFlavorDomain, b: ProductFlavorDomain): boolean => {
  if (a === 'UNKNOWN' || b === 'UNKNOWN' || a === b) return false;
  if (a === 'CHOCOLATE_GENERAL' && b.startsWith('CHOCOLATE_')) return false;
  if (b === 'CHOCOLATE_GENERAL' && a.startsWith('CHOCOLATE_')) return false;
  const hardGroups: readonly (readonly ProductFlavorDomain[])[] = [
    ['CHOCOLATE_WHITE', 'CHOCOLATE_DARK'],
    ['MILK_CREAM', 'ALCOHOL'],
    ['PISTACHIO', 'HAZELNUT', 'COCONUT'],
  ];
  return hardGroups.some((group) => group.includes(a) && group.includes(b));
};

const roleContradiction = (a: ProductIntendedUsageRole, b: ProductIntendedUsageRole): boolean =>
  (a === 'BASE_ONLY' && b === 'TOPPING_ONLY') || (a === 'TOPPING_ONLY' && b === 'BASE_ONLY');

/** Generic semantic gate used by all Mapper tiers. No product-ID exceptions exist. */
export function evaluateMapperSemanticCompatibility(
  product: ProductSemanticClassification,
  candidate: MapperSemanticCandidate,
): MapperSemanticCompatibility {
  const candidateSemantic = classifyProductSemantics({
    name: candidate.name,
    brand: candidate.brand,
    manufacturer: candidate.brand,
    manufacturerCode: candidate.ingredientId,
    gtin: candidate.gtin ?? null,
    productType: 'mapper_reference',
    category: candidate.category,
    subcategory: candidate.subcategory,
    variant: null,
    ingredients: null,
    nutrition: null,
    description: null,
    dosage: null,
    technicalParameters: null,
    sourceUrls: [],
  });
  const reasonCodes: string[] = [];
  if (!familyCompatible(product.ingredientFamily, candidateSemantic.ingredientFamily)) {
    reasonCodes.push('SEMANTIC_FAMILY_CONTRADICTION');
  }
  if (formContradiction(product.physicalForm, candidateSemantic.physicalForm)) {
    reasonCodes.push('SEMANTIC_FORM_CONTRADICTION');
  }
  if (roleContradiction(product.intendedUsageRole, candidateSemantic.intendedUsageRole)) {
    reasonCodes.push('SEMANTIC_ROLE_CONTRADICTION');
  }
  if (flavorContradiction(product.flavorDomain, candidateSemantic.flavorDomain)) {
    reasonCodes.push('SEMANTIC_FLAVOR_DOMAIN_CONTRADICTION');
  }
  const category = normalized(candidate.category).replace(/\s+/g, '_');
  if (
    product.compatibleMapperCategories.length > 0 &&
    category &&
    !product.compatibleMapperCategories.some(
      (allowed) => category === allowed || category.startsWith(`${allowed}_`),
    )
  ) {
    reasonCodes.push('SEMANTIC_CATEGORY_CONTRADICTION');
  }
  if (
    category &&
    product.forbiddenMapperCategories.some(
      (forbidden) => category === forbidden || category.startsWith(`${forbidden}_`),
    )
  ) {
    reasonCodes.push('SEMANTIC_FORBIDDEN_CATEGORY');
  }
  return { compatible: reasonCodes.length === 0, reasonCodes, candidate: candidateSemantic };
}

export function filterSemanticMapperCandidates<T extends MapperSemanticCandidate>(
  product: ProductSemanticClassification | null | undefined,
  rows: readonly T[],
): {
  compatible: T[];
  rejected: { ingredientId: string; reasonCodes: string[] }[];
} {
  if (!product) return { compatible: [...rows], rejected: [] };
  const compatible: T[] = [];
  const rejected: { ingredientId: string; reasonCodes: string[] }[] = [];
  for (const row of rows) {
    const decision = evaluateMapperSemanticCompatibility(product, row);
    if (decision.compatible) compatible.push(row);
    else rejected.push({ ingredientId: row.ingredientId, reasonCodes: decision.reasonCodes });
  }
  return { compatible, rejected };
}
