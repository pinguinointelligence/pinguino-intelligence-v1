import type {
  ProductArchetype,
  ProductIntendedUsageRole,
  ProductPhysicalForm,
  ProductSemanticClassification,
  ProductSemanticFamily,
} from '../product-intelligence/productRecognition';

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
    family: 'plant_beverage',
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
  /*
    A model reason code names a field the model could not resolve. The lines above resolve up to
    four of them from the family defaults — family, archetype, form, role — but only
    FAMILY_UNKNOWN used to be dropped, so a code went on claiming a field was unknown that had just
    been filled in. `modelRequired` is derived from this list, and it is a hard gate in BOTH
    productProductionAccuracy (PRODUCT_SEMANTICS_UNRESOLVED) and productBehaviorAuthority
    (unknown_requires_review). The customer answered, and the product stayed unresolved: that is the
    productBehavior 8 -> 4 the owner measured on Cola Zero (94.12 -> 90.0).

    A code is dropped only when its OWN field is no longer unknown, so a family whose defaults leave
    the form or the role open — `fruit`, `sweetener`, `technical` — still keeps its code and still
    requires the model. Nothing here changes the confidence arithmetic or either authority.
  */
  const resolvedByThisAnswer: Readonly<Record<string, boolean>> = {
    FAMILY_UNKNOWN: true,
    ARCHETYPE_UNKNOWN: productArchetype !== 'UNKNOWN',
    FORM_UNKNOWN: physicalForm !== 'UNKNOWN',
    ROLE_UNKNOWN: intendedUsageRole !== 'NEITHER_REVIEW',
  };
  const modelReasonCodes = classification.modelReasonCodes.filter(
    (reason) => resolvedByThisAnswer[reason] !== true,
  );
  return {
    ...classification,
    classificationSource: 'CUSTOMER_CONFIRMED',
    ingredientFamily: defaults.family,
    productArchetype,
    physicalForm,
    intendedUsageRole,
    compatibleMapperCategories: [],
    reasonCodes: [...classification.reasonCodes, `CUSTOMER_FAMILY_${choice.toUpperCase()}`],
    evidenceRefs: [...new Set([...classification.evidenceRefs, 'customerFamily'])],
    modelRequired: modelReasonCodes.length > 0,
    modelReasonCodes,
    confidence: Math.max(classification.confidence, 0.8),
  };
}
