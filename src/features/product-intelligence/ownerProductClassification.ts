import {
  classifyProductSemantics,
  type ProductArchetype,
  type ProductFlavorDomain,
  type ProductPhysicalForm,
  type ProductSemanticClassification,
  type ProductSemanticEvidence,
  type ProductSemanticFamily,
} from './productRecognition.ts';

export type OwnerProductRoleCode = 'S' | 'T' | 'O';

export interface OwnerProductClassification {
  authority: 'OWNER_SEMANTIC_CLASSIFICATION_V1';
  sourceProductId: string;
  roleCode: OwnerProductRoleCode;
  usageRole: 'BASE_ONLY' | 'TOPPING_ONLY' | 'BASE_AND_TOPPING';
  wholeProductGroup: string;
  semanticFamily: string;
  physicalForm: string;
  materialKey: string;
  donorGroup: string;
  guesserAllowed: boolean;
  guesserScope: string | null;
  donorMatchRule: string | null;
  confidence: number;
  basis: string | null;
  sourceUrl: string | null;
  reviewRequired: boolean;
}

const ROLE_BY_CODE = {
  S: 'BASE_ONLY',
  T: 'TOPPING_ONLY',
  O: 'BASE_AND_TOPPING',
} as const;

const text = (value: unknown, max = 240): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

/** Strictly validate the owner-authored workbook row before it can influence
 * Recognition. The S/T/O code and the expanded role must agree. */
export function parseOwnerProductClassification(value: unknown): OwnerProductClassification | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const sourceProductId = text(raw.sourceProductId ?? raw.source_product_id, 120);
  const roleCode = text(raw.roleCode ?? raw.owner_role_code, 1) as OwnerProductRoleCode | null;
  const usageRole = text(raw.usageRole ?? raw.usage_role, 40);
  const wholeProductGroup = text(raw.wholeProductGroup ?? raw.whole_product_group, 120);
  const semanticFamily = text(raw.semanticFamily ?? raw.semantic_family, 160);
  const physicalForm = text(raw.physicalForm ?? raw.physical_form, 120);
  const materialKey = text(raw.materialKey ?? raw.material_key, 160);
  const donorGroup = text(raw.donorGroup ?? raw.donor_group, 240);
  const canonicalInput = raw.authority === 'OWNER_SEMANTIC_CLASSIFICATION_V1';
  const confidenceValue = Number(raw.confidence ?? raw.classification_confidence_pct);
  const guesserAllowed = raw.guesserAllowed ?? raw.codex_guesser_allowed;
  const reviewRequired = raw.reviewRequired ?? raw.semantic_review_required;
  if (
    !sourceProductId ||
    !roleCode ||
    !(roleCode in ROLE_BY_CODE) ||
    usageRole !== ROLE_BY_CODE[roleCode] ||
    !wholeProductGroup ||
    !semanticFamily ||
    !physicalForm ||
    !materialKey ||
    !donorGroup ||
    typeof guesserAllowed !== 'boolean' ||
    typeof reviewRequired !== 'boolean' ||
    !Number.isFinite(confidenceValue) ||
    confidenceValue < 0 ||
    confidenceValue > (canonicalInput ? 1 : 100)
  ) {
    return null;
  }
  return {
    authority: 'OWNER_SEMANTIC_CLASSIFICATION_V1',
    sourceProductId,
    roleCode,
    usageRole,
    wholeProductGroup,
    semanticFamily,
    physicalForm,
    materialKey,
    donorGroup,
    guesserAllowed,
    guesserScope: text(raw.guesserScope ?? raw.guesser_scope, 300),
    donorMatchRule: text(raw.donorMatchRule ?? raw.donor_match_rule, 500),
    confidence: canonicalInput ? confidenceValue : confidenceValue / 100,
    basis: text(raw.basis ?? raw.classification_basis, 1_000),
    sourceUrl: text(raw.sourceUrl ?? raw.classification_source_url, 500),
    reviewRequired,
  };
}

const ownerArchetype = (family: string, base: ProductArchetype): ProductArchetype => {
  if (/COCOA_POWDER/.test(family)) return 'COCOA_POWDER';
  if (/COFFEE/.test(family)) return 'COFFEE';
  if (/\bTEA\b/.test(family)) return 'TEA';
  if (/CAKE_MIX|BAKERY_MIX/.test(family)) return 'BAKERY_MIX';
  if (/HARDENING_COATING|\bCOATING\b/.test(family)) return 'COATING';
  if (/VARIEGATO/.test(family)) return 'VARIEGATO';
  if (/FLAVOR_PASTE/.test(family)) return 'FLAVOR_PASTE';
  if (/INCLUSION/.test(family)) return 'INCLUSION';
  if (/CONFECTIONERY|BREAKFAST_CEREAL|WAFER/.test(family)) return 'CONFECTIONERY';
  if (/NUT_SPREAD|NUT_PASTE/.test(family)) return 'NUT_PASTE';
  if (/STABILIZER/.test(family)) return 'STABILIZER';
  if (/EMULSIFIER/.test(family)) return 'EMULSIFIER';
  if (/GELATO_BASE|COMPLETE_MIX|GRANITA_MIX/.test(family)) return 'BASE_MIX';
  if (/YOGURT|CREAM|BUTTER/.test(family)) return 'NORMAL_INGREDIENT';
  return base === 'UNKNOWN' ? 'NORMAL_INGREDIENT' : base;
};

const ownerFamily = (
  family: string,
  archetype: ProductArchetype,
  base: ProductSemanticFamily,
): ProductSemanticFamily => {
  if (/COCOA/.test(family)) return 'cocoa';
  if (/COFFEE/.test(family)) return 'coffee';
  if (/\bTEA\b/.test(family)) return 'tea';
  if (/YOGURT|CREAM|BUTTER/.test(family)) return 'dairy_liquid';
  if (/NUT_SPREAD|NUT_PASTE/.test(family)) return 'nut_paste';
  if (/HARDENING_COATING|\bCOATING\b/.test(family)) return 'coating';
  if (/VARIEGATO/.test(family)) return 'variegato';
  if (/FLAVOR_PASTE/.test(family)) return 'flavor_paste';
  if (/CAKE_MIX|BAKERY_MIX/.test(family)) return 'bakery_mix';
  if (/CONFECTIONERY|BREAKFAST_CEREAL|WAFER/.test(family)) return 'confectionery';
  if (/INCLUSION/.test(family)) return 'inclusion';
  if (/STABILIZER/.test(family)) return 'stabilizer_hydrocolloid';
  if (/EMULSIFIER/.test(family)) return 'emulsifier';
  if (/GELATO_BASE|COMPLETE_MIX|GRANITA_MIX/.test(family)) return 'base_mix';
  if (base !== 'unknown') return base;
  if (archetype === 'CONFECTIONERY') return 'confectionery';
  return 'unknown';
};

const ownerForm = (form: string, base: ProductPhysicalForm): ProductPhysicalForm => {
  if (/COATING/.test(form)) return 'COATING';
  if (/PASTE/.test(form)) return 'PASTE';
  if (/LIQUID/.test(form)) return 'LIQUID';
  if (/VISCOUS|SAUCE/.test(form)) return 'SAUCE';
  if (/PUREE/.test(form)) return 'PUREE';
  if (/GROUND_DRY/.test(form)) return 'DRY';
  if (/DRY_MIX|POWDER|CONCENTRATE/.test(form)) return 'POWDER';
  if (/SOLID|SEMISOLID|PIECES/.test(form)) return 'SOLID';
  return base;
};

const ownerFlavor = (key: string, base: ProductFlavorDomain): ProductFlavorDomain => {
  if (/CHOCOLATE_DARK/.test(key)) return 'CHOCOLATE_DARK';
  if (/CHOCOLATE_WHITE/.test(key)) return 'CHOCOLATE_WHITE';
  if (/CHOCOLATE|COCOA/.test(key)) return 'CHOCOLATE_GENERAL';
  if (/COFFEE/.test(key)) return 'COFFEE';
  if (/COCONUT/.test(key)) return 'COCONUT';
  if (/PISTACHIO/.test(key)) return 'PISTACHIO';
  if (/HAZELNUT/.test(key)) return 'HAZELNUT';
  if (/ALCOHOL|RUM|WHISK/.test(key)) return 'ALCOHOL';
  if (/KIWI|LIME|LEMON|ORANGE|PEAR|PINEAPPLE|APRICOT|STRAWBERRY|FRUIT/.test(key)) {
    return 'FRUIT';
  }
  if (/NEUTRAL/.test(key)) return 'NEUTRAL';
  return base;
};

const compatibleCategories = (
  family: ProductSemanticFamily,
  archetype: ProductArchetype,
  base: readonly string[],
): string[] => {
  const byArchetype: Partial<Record<ProductArchetype, string[]>> = {
    BASE_MIX: ['base_mix'],
    COATING: ['coating', 'chocolate'],
    VARIEGATO: ['variegato', 'flavor_paste'],
    FLAVOR_PASTE: ['flavor_paste'],
    CONFECTIONERY: ['inclusion', 'bakery_inclusion', 'confectionery_inclusion'],
    INCLUSION: ['inclusion', 'bakery_inclusion', 'confectionery_inclusion'],
    BAKERY_MIX: [],
    COFFEE: ['coffee_tea'],
  };
  const byFamily: Partial<Record<ProductSemanticFamily, string[]>> = {
    dairy_liquid: ['dairy'],
    nut_paste: ['nut', 'flavor_paste'],
    cocoa: ['cocoa', 'chocolate'],
    coffee: ['coffee_tea'],
  };
  return [...new Set(byArchetype[archetype] ?? byFamily[family] ?? base)];
};

/** Project the owner's richer taxonomy onto the canonical Recognition V2
 * vocabulary. The raw owner fields remain attached separately; this projection
 * cannot broaden S/T/O and never invents numeric/product evidence. */
export function applyOwnerProductClassification(
  evidence: ProductSemanticEvidence,
  owner: OwnerProductClassification,
  starting?: ProductSemanticClassification,
): ProductSemanticClassification {
  const base = starting ?? classifyProductSemantics(evidence);
  const productArchetype = ownerArchetype(owner.semanticFamily, base.productArchetype);
  const ingredientFamily = ownerFamily(
    owner.semanticFamily,
    productArchetype,
    base.ingredientFamily,
  );
  const physicalForm = ownerForm(owner.physicalForm, base.physicalForm);
  const modelReasonCodes = owner.reviewRequired ? ['OWNER_SEMANTIC_REVIEW_REQUIRED'] : [];
  return {
    ...base,
    classificationSource: owner.reviewRequired ? 'REVIEW_REQUIRED' : 'OWNER_CONFIRMED',
    productArchetype,
    ingredientFamily,
    physicalForm,
    intendedUsageRole: owner.usageRole,
    flavorDomain: ownerFlavor(owner.materialKey, base.flavorDomain),
    isProfessionalProduct:
      base.isProfessionalProduct || owner.wholeProductGroup === 'PROFESSIONAL_GELATO',
    compatibleMapperCategories: compatibleCategories(
      ingredientFamily,
      productArchetype,
      base.compatibleMapperCategories,
    ),
    confidence: owner.confidence,
    reasonCodes: [
      ...base.reasonCodes.filter((code) => !code.startsWith('ROLE_')),
      'OWNER_SEMANTIC_CLASSIFICATION',
      `OWNER_ROLE_${owner.roleCode}`,
      `OWNER_GROUP_${owner.wholeProductGroup}`,
      `OWNER_FAMILY_${owner.semanticFamily}`,
      `OWNER_FORM_${owner.physicalForm}`,
      `OWNER_MATERIAL_${owner.materialKey}`,
    ],
    evidenceRefs: [
      ...new Set([
        ...base.evidenceRefs,
        'ownerClassification.usageRole',
        'ownerClassification.semanticFamily',
        'ownerClassification.physicalForm',
        'ownerClassification.materialKey',
        'ownerClassification.donorGroup',
      ]),
    ],
    modelRequired: owner.reviewRequired,
    modelReasonCodes,
  };
}
