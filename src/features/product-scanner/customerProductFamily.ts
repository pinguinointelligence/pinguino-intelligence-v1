import {
  mapperCategoriesFor,
  type ProductArchetype,
  type ProductIntendedUsageRole,
  type ProductPhysicalForm,
  type ProductSemanticClassification,
  type ProductSemanticFamily,
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
    A REASON CODE NAMES ONE FIELD, SO ONLY THAT FIELD MAY RETIRE IT.

    This used to strip 'FAMILY_UNKNOWN' and nothing else, so codes naming fields the merge had
    JUST resolved survived the merge that resolved them. On the owner's phone (staging,
    2026-09-07 18:08 UTC, EAN 7340222800464) the customer answered "beverage", the defaults set
    productArchetype NORMAL_INGREDIENT and physicalForm LIQUID — and the persisted recognition
    still carried ["ARCHETYPE_UNKNOWN", "FORM_UNKNOWN"], two statements that were no longer true.
    `modelRequired` is derived from that list and is a hard gate in BOTH
    productProductionAccuracy (PRODUCT_SEMANTICS_UNRESOLVED) and productBehaviorAuthority
    (unknown_requires_review), so the product was blocked and the customer was asked to
    photograph a label whose answer the flow was already holding.

    The rule is therefore per-field and has no exceptions: a code is dropped when ITS OWN field is
    no longer unknown after the merge, and any code this table does not name survives untouched —
    DOSAGE_SEMANTICS_UNKNOWN is a real uncertainty a family answer cannot settle, and a family
    whose defaults leave the form or the role open (fruit, sweetener, technical) still needs the
    model for exactly the dimension it left open.
  */
  const stillUnknownAfterMerge: Readonly<Record<string, boolean>> = {
    FAMILY_UNKNOWN: defaults.family === 'unknown',
    ARCHETYPE_UNKNOWN: productArchetype === 'UNKNOWN',
    FORM_UNKNOWN: physicalForm === 'UNKNOWN',
    ROLE_UNKNOWN: intendedUsageRole === 'NEITHER_REVIEW',
  };
  const modelReasonCodes = classification.modelReasonCodes.filter(
    (reason) => stillUnknownAfterMerge[reason] ?? true,
  );
  return {
    ...classification,
    classificationSource: 'CUSTOMER_CONFIRMED',
    ingredientFamily: defaults.family,
    productArchetype,
    physicalForm,
    intendedUsageRole,
    /*
      Recomputed from the RESOLVED identity, never carried over. The list is a function of family
      and archetype, and this merge changes both — carrying the old value forward kept the EMPTY
      list a family of 'unknown' produces, so a product the flow had just been told is a drink
      still reached the Mapper with no cohort to match against. The mapping itself is not
      duplicated here; it is the one in productRecognition.
    */
    compatibleMapperCategories: mapperCategoriesFor(defaults.family, productArchetype),
    reasonCodes: [...classification.reasonCodes, `CUSTOMER_FAMILY_${choice.toUpperCase()}`],
    evidenceRefs: [...new Set([...classification.evidenceRefs, 'customerFamily'])],
    modelRequired: modelReasonCodes.length > 0,
    modelReasonCodes,
    confidence: Math.max(classification.confidence, 0.8),
  };
}
