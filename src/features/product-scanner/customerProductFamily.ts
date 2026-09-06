import type {
  ProductArchetype,
  ProductIntendedUsageRole,
  ProductPhysicalForm,
  ProductSemanticClassification,
  ProductSemanticFamily,
} from '../product-intelligence/productRecognition';
import {
  dosageGovernsArchetype,
  mapperCategoriesForSemantics,
} from '../product-intelligence/productRecognition.ts';

export type CustomerProductFamilyChoice =
  | 'dairy'
  | 'fruit'
  | 'cocoa_chocolate'
  | 'nut_paste'
  | 'alcohol'
  | 'sweetener'
  | 'beverage'
  | 'technical'
  | 'other';

export const CUSTOMER_PRODUCT_FAMILY_CHOICES: readonly {
  id: CustomerProductFamilyChoice;
  label: string;
}[] = [
  { id: 'dairy', label: 'Mleczne' },
  { id: 'fruit', label: 'Owoce / puree' },
  { id: 'cocoa_chocolate', label: 'Czekolada / kakao' },
  { id: 'nut_paste', label: 'Orzechy / pasta' },
  { id: 'alcohol', label: 'Alkohol' },
  { id: 'sweetener', label: 'Syrop / słodzik' },
  { id: 'beverage', label: 'Napoje' },
  { id: 'technical', label: 'Produkt techniczny' },
  { id: 'other', label: 'Inne' },
] as const;

export interface CustomerFamilyResolution {
  status: 'RESOLVED' | 'CUSTOMER_CONFIRMATION_REQUIRED';
  family: ProductSemanticFamily | null;
  confidence: number;
}

/**
 * Family is the gate in front of Mapper completion. A known family may proceed
 * even when another semantic dimension still needs review; an unknown family
 * never silently opens a family-specific Mapper cohort.
 */
export function resolveCustomerProductFamily(
  classification: ProductSemanticClassification,
): CustomerFamilyResolution {
  const resolved =
    classification.ingredientFamily !== 'unknown' && classification.confidence >= 0.75;
  return {
    status: resolved ? 'RESOLVED' : 'CUSTOMER_CONFIRMATION_REQUIRED',
    family: resolved ? classification.ingredientFamily : null,
    confidence: classification.confidence,
  };
}

type FamilyDefaults = {
  family: ProductSemanticFamily;
  archetype: ProductArchetype | null;
  form: ProductPhysicalForm | null;
  role: ProductIntendedUsageRole | null;
};

const FAMILY_DEFAULTS: Readonly<Partial<Record<CustomerProductFamilyChoice, FamilyDefaults>>> = {
  dairy: {
    family: 'dairy_liquid',
    archetype: 'NORMAL_INGREDIENT',
    form: 'LIQUID',
    role: 'BASE_ONLY',
  },
  fruit: { family: 'fruit', archetype: 'FRUIT_PRODUCT', form: null, role: 'BASE_ONLY' },
  cocoa_chocolate: { family: 'chocolate', archetype: 'CHOCOLATE', form: null, role: 'BASE_ONLY' },
  nut_paste: { family: 'nut_paste', archetype: 'NUT_PASTE', form: 'PASTE', role: 'BASE_ONLY' },
  alcohol: { family: 'alcohol', archetype: 'NORMAL_INGREDIENT', form: 'LIQUID', role: 'BASE_ONLY' },
  sweetener: {
    family: 'other_sugar',
    archetype: 'NORMAL_INGREDIENT',
    form: null,
    role: 'BASE_ONLY',
  },
  beverage: {
    family: 'beverage',
    archetype: 'NORMAL_INGREDIENT',
    form: 'LIQUID',
    role: 'BASE_ONLY',
  },
  technical: {
    family: 'technical_additive',
    archetype: 'TECHNICAL_ADDITIVE',
    form: null,
    role: 'NEITHER_REVIEW',
  },
};

/**
 * Apply an explicit customer family only to unresolved dimensions. Exact
 * deterministic/model conclusions remain immutable. This is semantic input,
 * never permission to invent composition or bypass ProductBehavior.
 */
export function applyCustomerProductFamily(
  classification: ProductSemanticClassification,
  choice: CustomerProductFamilyChoice,
): ProductSemanticClassification {
  if (classification.ingredientFamily !== 'unknown') return classification;
  const defaults = FAMILY_DEFAULTS[choice];
  if (!defaults) return classification;
  const productArchetype =
    classification.productArchetype === 'UNKNOWN' && defaults.archetype
      ? defaults.archetype
      : classification.productArchetype;
  const physicalForm =
    classification.physicalForm === 'UNKNOWN' && defaults.form
      ? defaults.form
      : classification.physicalForm;
  const intendedUsageRole =
    classification.intendedUsageRole === 'NEITHER_REVIEW' && defaults.role
      ? defaults.role
      : classification.intendedUsageRole;
  // The customer's answer resolves whole dimensions (family, and through the
  // defaults archetype/form/role). The model flag must describe what is STILL
  // unknown afterwards — keeping the pre-answer codes left every confirmed
  // product "semantics unresolved" forever, which blocked ProductBehavior and
  // Engine readiness regardless of how complete its physics were.
  const modelReasonCodes = [
    ...(productArchetype === 'UNKNOWN' ? ['ARCHETYPE_UNKNOWN'] : []),
    ...(physicalForm === 'UNKNOWN' && productArchetype !== 'NORMAL_INGREDIENT'
      ? ['FORM_UNKNOWN']
      : []),
    ...(intendedUsageRole === 'NEITHER_REVIEW' ? ['ROLE_UNKNOWN'] : []),
    ...(classification.dosage.semantics === 'UNKNOWN' && dosageGovernsArchetype(productArchetype)
      ? ['DOSAGE_SEMANTICS_UNKNOWN']
      : []),
  ];
  return {
    ...classification,
    classificationSource: 'CUSTOMER_CONFIRMED',
    ingredientFamily: defaults.family,
    productArchetype,
    physicalForm,
    intendedUsageRole,
    // The confirmed kind opens exactly the Mapper categories that kind lives in;
    // an empty list here left the matcher with no candidate pool at all.
    compatibleMapperCategories: mapperCategoriesForSemantics(defaults.family, productArchetype),
    reasonCodes: [...classification.reasonCodes, `CUSTOMER_FAMILY_${choice.toUpperCase()}`],
    evidenceRefs: [...new Set([...classification.evidenceRefs, 'customerFamily'])],
    modelRequired: modelReasonCodes.length > 0,
    modelReasonCodes,
    confidence: Math.max(classification.confidence, 0.8),
  };
}
