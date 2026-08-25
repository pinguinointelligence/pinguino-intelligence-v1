/**
 * INTIMPORT local intelligence — Mapper-first, zero paid calls.
 *
 * Runs AFTER the deterministic CSV parse and BEFORE any external enrichment.
 * It answers one question per product using only what Gellatti already knows:
 * exact canonical identity → Mapper family → local evidence → deterministic
 * confidence → route. Nothing here touches the network, an LLM, or the DB.
 *
 * The whole point is to shrink the "needs enrichment" pile before a single
 * paid call is made.
 */
import type { IntimportCandidate } from '@/data/products/intimport';
import {
  AUTO_IMPORT_FLOOR,
  assessProductConfidence,
  routeBeforeWeb,
  type EnrichmentRoute,
  type EvidenceSource,
  type ProductConfidenceAssessment,
  type ProductEvidenceField,
  type ProductEvidenceInput,
  type ProductKind,
} from './productEvidenceConfidence';
import {
  familySupportsInference,
  inferMapperFamily,
  type ProductFamilyMatch,
} from './mapperFamilyInference';
import { classifySourceAuthority, type SourceAuthorityAssessment } from './sourceAuthority';
import { buildResearchPlan, type ResearchPlan } from './researchPlan';
import {
  profileDonor,
  PROFILE_MATCH_FLOOR,
  type MapperKnowledge,
  type ProfileMatchInput,
} from './mapperValueInference';
import {
  resolveProductWorkingValues,
  type ProductWorkingValues,
  type ValueReadiness,
} from './productWorkingValues';
import type { CardContribution } from './productSourceCard';
import { WORKING_NUMERIC_FIELDS, type WorkingNumericField } from './productFieldTruth';
import type { ProductInsert } from '@/data/products/productRow';
import {
  classifyCarbonation,
  type CarbonationEvidence,
  type CarbonationProfile,
} from '@/data/products/carbonation';
import { productBehaviorModuleGate } from './productBehaviorAccess';
import type { ProductBehaviorSnapshot } from './contracts';
import {
  classifyProspectiveProductBehavior,
  type ProspectiveProductBehaviorAuthority,
} from './productBehaviorAuthority';
import {
  classifyProductSemantics,
  type ProductSemanticClassification,
  type ProductSemanticEvidence,
} from './productRecognition';
import {
  assessProductProductionAccuracy,
  productionAccuracyTruthFromWorkingFields,
  type ProductionAccuracyEvidenceProvenance,
  type ProductProductionAccuracyAssessment,
} from './productProductionAccuracy';

/** Canonical lookups the caller supplies. Kept injected so this stays pure. */
export interface IntimportCanonicalIndex {
  /** Existing canonical product id for any equivalent GTIN form. */
  byBarcode?: (lookupValues: readonly string[]) => string | null;
  /** Existing canonical product id for a deterministic identity key. */
  byIdentity?: (identityKey: string) => string | null;
}

/** Accepted post-research material used for one complete reassessment. The
 * provider response is converted to this only after the enrichment layer has
 * retained the stronger fact and pinned its source provenance. */
export interface IntimportReassessmentOverride {
  evidence: ProductEvidenceInput;
  sourceCard: CardContribution | null;
  evidenceProvenance: Partial<
    Record<ProductEvidenceField, ProductionAccuracyEvidenceProvenance>
  >;
  enrichmentEvidenceReceipts: readonly string[];
  semanticEvidenceReceipt?: string | null;
  carbonationEvidence?: readonly CarbonationEvidence[];
}

export type IntimportFinalResult =
  | 'READY'
  | 'REVIEW'
  | 'BLOCKED'
  | 'CONFLICT'
  | 'TOPPING_ONLY';

/** One final classifier for audits/UI. A semantic role is never itself proof
 * that ProductBehavior approved the role. */
export function classifyIntimportFinalResult(
  row: IntimportProductIntelligence,
): IntimportFinalResult {
  if (
    row.recognitionTrace.finalStatus === 'IDENTITY_CONFLICT' ||
    row.productionAccuracy.roleReadiness === 'CONFLICT'
  ) {
    return 'CONFLICT';
  }
  if (row.productionAccuracy.roleReadiness === 'BLOCKED') return 'BLOCKED';
  if (
    row.recognition.intendedUsageRole === 'TOPPING_ONLY' &&
    row.productBehaviorAuthority.toppingEligible === true &&
    row.productionAccuracy.roleReadiness === 'TOPPING_READY'
  ) {
    return 'TOPPING_ONLY';
  }
  if (
    row.productionAccuracy.roleReadiness === 'BASE_READY' &&
    row.productionAccuracy.productAccuracy >= AUTO_IMPORT_FLOOR
  ) {
    return 'READY';
  }
  return 'REVIEW';
}

export interface IntimportProductIntelligence {
  rowIndex: number;
  sourceProductId: string | null;
  displayName: string | null;
  kind: ProductKind;
  /** One semantic authority shared by donor filtering and ProductBehavior. */
  recognition: ProductSemanticClassification;
  recognitionEvidence: ProductSemanticEvidence;
  /** Server ledger receipt for a model-filled semantic result, when used. */
  semanticEvidenceReceipt: string | null;
  family: ProductFamilyMatch | null;
  /** True only when the family evidence was strong enough to count. */
  familyApplied: boolean;
  exactCanonicalMatch: boolean;
  existingProductId: string | null;
  assessment: ProductConfidenceAssessment;
  /** Customer-facing production usefulness score. `assessment` above remains
   * only the legacy evidence/enrichment router for before/after audit. */
  productionAccuracy: ProductProductionAccuracyAssessment;
  /** How strong the row's own declared source actually is (§9). */
  sourceAuthority: SourceAuthorityAssessment;
  /**
   * The MINIMAL public identity an external provider needs. Deliberately not the
   * whole 36-field row: only what is required to find the product is ever
   * allowed to leave the system.
   */
  researchIdentity: {
    sourceProductId: string | null;
    brand: string | null;
    manufacturer: string | null;
    name: string | null;
    variant: string | null;
    barcode: string | null;
    netQuantity: string | null;
    knownSourceUrl: string | null;
    /** The owner's technical/specification document — previously never sent. */
    technicalPdfUrl: string | null;
  };
  /** Ordered sources to try, strongest first. Official evidence leads (§4). */
  researchPlan: ResearchPlan;
  /** The exact evidence this assessment was computed from. Enrichment merges
   * new facts into THIS, so the caller never rebuilds it and cannot drift. */
  evidence: ProductEvidenceInput;
  /** Same exact-evidence carbonation profile used by Scanner and runtime. */
  carbonation: CarbonationProfile;
  /** Server-owned research ledger keys. Empty before explicit enrichment. */
  enrichmentEvidenceReceipts: string[];
  route: EnrichmentRoute;
  /** Fields worth asking the outside world about — nothing else may be searched. */
  enrichmentTargets: ProductEvidenceField[];
  /** The parsed row's own insert, carried so the import handoff needs no re-parse. */
  insert: ProductInsert;
  /**
   * The product's real numeric state, once Mapper knowledge has been applied.
   * Null only when the caller supplied no Mapper — the layer never invents one.
   */
  workingValues: ProductWorkingValues | null;
  /** Read-only, pre-ingest projection of the same semantic authority the
   * server will recompute and freeze on the product version. */
  productBehaviorAuthority: ProspectiveProductBehaviorAuthority;
  /** Exact public inputs used by the frozen whole-profile matcher. */
  profileMatchInput: ProfileMatchInput;
  /** Concise, machine-readable decision facts. Never model chain-of-thought. */
  recognitionTrace: {
    semanticClassificationSource: string;
    semanticConfidence: number;
    mapperCandidatesBeforeFilter: string[];
    mapperCandidatesAfterFilter: string[];
    selectedMapperDonor: string | null;
    mapperSimilarity: number | null;
    rejectedMapperCandidates: { ingredientId: string; reasonCodes: string[] }[];
    dosageInterpretation: ProductSemanticClassification['dosage'];
    finalRole: ProductSemanticClassification['intendedUsageRole'];
    finalStatus: 'ENGINE_READY' | 'REVIEW' | 'BLOCKED' | 'IDENTITY_CONFLICT';
    finalReasonCodes: string[];
  };
}

function productKind(recognition: ProductSemanticClassification): ProductKind {
  return recognition.isTechnicalProduct ? 'technical' : 'normal_food';
}

const labelledTechnicalValue = (value: string | null | undefined, label: string): string | null => {
  const source = value?.trim() ?? '';
  if (!source) return null;
  const match = source.match(new RegExp(`(?:^|\\|)\\s*${label}\\s*:\\s*([^|]+)`, 'i'));
  return match?.[1]?.trim() || null;
};

/** Exact source evidence used by both the local pass and server recomputation. */
export function semanticEvidenceFromIntimportCandidate(
  candidate: IntimportCandidate,
): ProductSemanticEvidence {
  const technical = candidate.source['Technical Parameters'];
  const nutrition = [
    ['basis', candidate.source['Nutrition Basis']],
    ['kcal', candidate.source['Energy kcal']],
    ['fat_g', candidate.source['Fat g']],
    ['saturated_fat_g', candidate.source['Saturated Fat g']],
    ['carbohydrate_g', candidate.source['Carbohydrates g']],
    ['sugars_g', candidate.source['Sugars g']],
    ['protein_g', candidate.source['Protein g']],
    ['salt_g', candidate.source['Salt g']],
  ].flatMap(([label, value]) => (value ? [`${label}:${value}`] : []));
  return {
    name: candidate.displayName,
    brand: candidate.source.Brand,
    manufacturer: candidate.source.Manufacturer,
    manufacturerCode: labelledTechnicalValue(technical, 'Kod producenta'),
    gtin: candidate.ean,
    productType: candidate.source['Product Type'],
    category: candidate.sourceCategory,
    subcategory: candidate.sourceSubcategory,
    variant: candidate.source['Variant Original'] ?? candidate.source['Variant English'],
    ingredients:
      candidate.source['Ingredients Original'] ?? candidate.source['Ingredients English'],
    nutrition: nutrition.length > 0 ? nutrition.join(' | ') : null,
    description: labelledTechnicalValue(technical, 'Opis') ?? candidate.source.Notes,
    dosage: candidate.source['Professional Dosage'],
    technicalParameters: technical,
    sourceUrls: [
      candidate.source['Primary Source URL'],
      candidate.source['Technical PDF URL'],
    ].filter((url): url is string => !!url && !['not_found', 'not_applicable'].includes(url)),
  };
}

/**
 * Map one parsed INTIMPORT row onto canonical evidence. INTIMPORT's own cells
 * are `source_file` evidence — strong, because the owner curated them, but never
 * as strong as a direct label reading or an exact Mapper identity.
 */
function evidenceFields(
  candidate: IntimportCandidate,
  family: ProductFamilyMatch | null,
  familyApplied: boolean,
  exactCanonicalMatch: boolean,
  sourceAuthority: SourceAuthorityAssessment,
): Partial<Record<ProductEvidenceField, EvidenceSource>> {
  // The row's own cells are only as strong as the source they were curated from.
  // A `Primary Source URL` plus a `Checked At` proves the owner looked something
  // up — never that the page was the manufacturer's (§9).
  const file: EvidenceSource = exactCanonicalMatch
    ? 'mapper_exact'
    : sourceAuthority.evidenceSource;
  const s = candidate.source;
  const fields: Partial<Record<ProductEvidenceField, EvidenceSource>> = {};
  const put = (field: ProductEvidenceField, present: unknown, source: EvidenceSource = file) => {
    if (present) fields[field] = source;
  };

  put('identity', candidate.displayName);
  put('brand', s.Brand);
  put('manufacturer', s.Manufacturer);
  put('variant', s['Variant Original'] ?? s['Variant English']);
  put('netQuantity', s['Net Quantity Value'] && s['Net Quantity Unit']);
  put('packageCount', s['Package Count']);
  put('ingredients', s['Ingredients Original'] ?? s['Ingredients English']);
  put('allergens', s.Allergens);
  put('description', labelledTechnicalValue(s['Technical Parameters'], 'Opis') ?? s.Notes);
  put('countryOfOrigin', s['Country of Origin']);
  put('dosage', s['Professional Dosage']);
  put('technicalParameters', s['Technical Parameters']);
  put('technicalSource', s['Technical PDF URL'] ?? s['Primary Source URL']);
  // A checksum-valid GTIN is registry-grade identity evidence.
  if (candidate.ean) fields.barcode = 'barcode_registry';

  // Nutrition only counts when it is on a basis the product model can use.
  if (candidate.nutritionBasis === 'per_100g') {
    put('nutritionBasis', s['Nutrition Basis']);
    put('energyKcal', s['Energy kcal']);
    put('fat', s['Fat g']);
    put('saturatedFat', s['Saturated Fat g']);
    put('carbohydrate', s['Carbohydrates g']);
    put('sugars', s['Sugars g']);
    put('fiber', s['Fibre g']);
    put('protein', s['Protein g']);
    put('salt', s['Salt g']);
  } else if (candidate.nutritionBasis === 'per_100ml') {
    put('nutritionBasis', s['Nutrition Basis']);
  }

  // A strong family match can SUPPLEMENT missing evidence — never replace it, and
  // always stamped `mapper_family` so it can never read as verification.
  if (familyApplied && family) {
    if (!fields.identity) fields.identity = 'mapper_family';
    if (!fields.variant) fields.variant = 'mapper_family';
  }
  return fields;
}

/**
 * Fields the outside world could realistically resolve, in usefulness order —
 * scoped by product kind. Researching a dosage or a technical parameter for a
 * packet of biscuits is wasted money and a nonsense question; researching label
 * nutrition for a professional paste is not what makes it usable.
 */
const SEARCHABLE_BY_KIND: Readonly<Record<ProductKind, readonly ProductEvidenceField[]>> =
  Object.freeze({
    normal_food: [
      'brand',
      'variant',
      'description',
      'claims',
      'ingredients',
      'nutritionBasis',
      'energyKcal',
      'fat',
      'saturatedFat',
      'carbohydrate',
      'sugars',
      'fiber',
      'protein',
      'salt',
      'allergens',
      'barcode',
      'manufacturer',
      'netQuantity',
      'packageCount',
      'countryOfOrigin',
    ],
    technical: [
      'brand',
      'variant',
      'description',
      'claims',
      'dosage',
      'technicalParameters',
      'technicalSource',
      'ingredients',
      'nutritionBasis',
      'fat',
      'saturatedFat',
      'carbohydrate',
      'sugars',
      'fiber',
      'protein',
      'salt',
      'allergens',
      'manufacturer',
      'barcode',
      'netQuantity',
      'packageCount',
      'countryOfOrigin',
      'energyKcal',
    ],
  });

/**
 * Only missing fields that MATERIALLY affect readiness are worth a call.
 * A missing optional Notes/origin never justifies spending money.
 */
function enrichmentTargets(
  kind: ProductKind,
  assessment: ProductConfidenceAssessment,
  fields: Partial<Record<ProductEvidenceField, EvidenceSource>>,
): ProductEvidenceField[] {
  const missingCritical = new Set<ProductEvidenceField>(assessment.missingCritical);
  return SEARCHABLE_BY_KIND[kind].filter((field) => {
    if (fields[field]) return false;
    // Critical gaps always justify a targeted lookup; the rest are ordered so the
    // most useful missing field is asked for first within the per-product cap.
    return missingCritical.has(field) || true;
  });
}

/**
 * Assess ONE parsed INTIMPORT row with local knowledge only.
 * Deterministic: the same row and the same index always produce the same result.
 */
/**
 * Read the product's own declared numbers.
 *
 * Per-100 ml is NOT per-100 g and never becomes it here: without a density this
 * layer cannot convert, and converting on an assumed density would manufacture
 * a measurement. Those declarations are dropped, and the Mapper fills the gap
 * as an honest estimate instead.
 */
function declaredNumericValues(
  candidate: IntimportCandidate,
): Partial<Record<WorkingNumericField, number | null>> {
  if (candidate.nutritionBasis !== 'per_100g') return {};
  const declared: Partial<Record<WorkingNumericField, number | null>> = {};
  for (const field of WORKING_NUMERIC_FIELDS) {
    const value = (candidate.insert as ProductInsert as Record<string, unknown>)[field];
    if (typeof value === 'number' && Number.isFinite(value)) declared[field] = value;
  }
  return declared;
}

function intimportCarbonationEvidence(
  candidate: IntimportCandidate,
  sourceAuthority: SourceAuthorityAssessment,
): CarbonationEvidence[] {
  const source = candidate.source;
  const sourceUrl = source['Primary Source URL'] ?? source['Technical PDF URL'] ?? null;
  const common = {
    sourceUrl,
    sourceDomain: sourceAuthority.domain,
    sourceAuthorityClass: sourceAuthority.authority,
    evidenceReceipt: null,
    retrievedAt: source['Checked At'] ?? null,
  };
  const evidence: CarbonationEvidence[] = [];
  const labelAssertion = source['Ingredients Original'] ?? source['Ingredients English'];
  if (labelAssertion?.trim()) {
    evidence.push({
      ...common,
      source: 'EXACT_LABEL',
      assertion: labelAssertion,
      assertionPath: source['Ingredients Original']
        ? 'Ingredients Original'
        : 'Ingredients English',
    });
  }
  const technicalAssertion = source['Technical Parameters'];
  if (technicalAssertion?.trim()) {
    const exactSource =
      sourceAuthority.authority === 'AUTHORITATIVE_RETAILER'
        ? 'EXACT_AUTHORITATIVE_RETAILER'
        : sourceAuthority.authority === 'STRUCTURED_PRODUCT_DATABASE'
          ? 'EXACT_EAN_PRODUCT'
          : sourceAuthority.authority.startsWith('OFFICIAL_')
            ? 'EXACT_MANUFACTURER'
            : null;
    if (exactSource) {
      evidence.push({
        ...common,
        source: exactSource,
        assertion: technicalAssertion,
        assertionPath: 'Technical Parameters',
      });
    }
  }
  return evidence;
}

/**
 * Preserve the source authority INTIMPORT already established when the same
 * evidence is handed to the shared PR/PM Product Accuracy scorer. Evidence and
 * authority remain independent: a retailer field is credited only when its
 * actual URL was classified as a trusted retailer, while owner-provided or
 * unknown retailer URLs continue to fail closed.
 */
function intimportProductionAccuracyProvenance(
  evidence: ProductEvidenceInput,
  sourceAuthority: SourceAuthorityAssessment,
  sourceUrl: string | null,
): Partial<Record<ProductEvidenceField, ProductionAccuracyEvidenceProvenance>> {
  return Object.fromEntries(
    Object.entries(evidence.fields).map(([field, source]) => {
      const localSource = source as EvidenceSource;
      const sourceAuthorityClass =
        localSource === 'barcode_registry'
          ? 'CHECKSUM_VALIDATED_GTIN'
          : localSource === 'mapper_family'
            ? 'MAPPER_FAMILY_INFERENCE'
            : localSource === 'mapper_exact'
              ? 'EXACT_CANONICAL_MATCH'
              : localSource === sourceAuthority.evidenceSource
                ? sourceAuthority.authority
                : null;
      return [
        field,
        {
          source: localSource,
          sourceUrl: localSource === sourceAuthority.evidenceSource ? sourceUrl : null,
          sourceAuthorityClass,
        },
      ];
    }),
  );
}

export function assessIntimportProduct(
  candidate: IntimportCandidate,
  index: IntimportCanonicalIndex = {},
  mapper: MapperKnowledge | null = null,
  recognitionOverride: ProductSemanticClassification | null = null,
  recognitionEvidenceOverride: ProductSemanticEvidence | null = null,
  reassessmentOverride: IntimportReassessmentOverride | null = null,
): IntimportProductIntelligence {
  const recognitionEvidence =
    recognitionEvidenceOverride ?? semanticEvidenceFromIntimportCandidate(candidate);
  const deterministicRecognition = classifyProductSemantics(recognitionEvidence);
  const recognition =
    recognitionOverride?.evidenceFingerprint === deterministicRecognition.evidenceFingerprint
      ? recognitionOverride
      : deterministicRecognition;
  const family = inferMapperFamily({
    name: candidate.displayName,
    variant: candidate.source['Variant Original'] ?? candidate.source['Variant English'],
    sourceCategory: candidate.sourceCategory,
    sourceSubcategory: candidate.sourceSubcategory,
  });
  const familyApplied = familySupportsInference(family);

  const lookupValues = candidate.ean ? [candidate.ean] : [];
  const existingByBarcode =
    lookupValues.length > 0 && index.byBarcode ? index.byBarcode(lookupValues) : null;
  const existingProductId = existingByBarcode ?? candidate.existingProductId ?? null;
  const exactCanonicalMatch = existingProductId !== null;

  const kind = productKind(recognition);
  const sourceAuthority = classifySourceAuthority({
    url: candidate.source['Primary Source URL'] ?? candidate.source['Technical PDF URL'],
    brand: candidate.source.Brand,
    manufacturer: candidate.source.Manufacturer,
    ownerProvided: true,
  });
  const baseFields = evidenceFields(
    candidate,
    family,
    familyApplied,
    exactCanonicalMatch,
    sourceAuthority,
  );

  const conflicts =
    candidate.state === 'REVIEW_REQUIRED' && candidate.duplicateOfRow !== null
      ? [`ambiguous identity vs row ${candidate.duplicateOfRow}`]
      : [];

  const evidence: ProductEvidenceInput = reassessmentOverride
    ? {
        ...reassessmentOverride.evidence,
        kind,
        fields: { ...reassessmentOverride.evidence.fields },
        materialConflicts: [...reassessmentOverride.evidence.materialConflicts],
      }
    : {
        kind,
        fields: baseFields,
        validatedBarcode: candidate.ean !== null,
        exactCanonicalMatch,
        mapperFamilyMatch: familyApplied,
        materialConflicts: conflicts,
      };

  const assessment = assessProductConfidence(evidence);
  const route = routeBeforeWeb(assessment, { exactCanonicalMatch });
  const targets =
    route === 'EXISTING' || route === 'READY_LOCAL'
      ? []
      : enrichmentTargets(kind, assessment, evidence.fields);
  const researchPlan = buildResearchPlan({
    brand: candidate.source.Brand,
    manufacturer: candidate.source.Manufacturer,
    name: candidate.displayName,
    variant: candidate.source['Variant Original'] ?? candidate.source['Variant English'],
    barcode: candidate.ean,
    netQuantity: typeof candidate.insert.package_size === 'string'
      ? candidate.insert.package_size
      : [candidate.source['Net Quantity Value'], candidate.source['Net Quantity Unit']]
          .filter(Boolean)
          .join(' ') || null,
    knownSourceUrl: candidate.source['Primary Source URL'],
    technicalPdfUrl: candidate.source['Technical PDF URL'],
    missingFields: targets,
  });

  const workingValues = mapper
    ? resolveProductWorkingValues(
        {
          declared: declaredNumericValues(candidate),
          // The declaration is only as strong as the source it was curated from,
          // which the confidence assessment has already judged (§9).
          declaredConfidence: assessment.confidence / 100,
          sourceCard: reassessmentOverride?.sourceCard ?? null,
          identity: {
            name: candidate.displayName,
            variant: candidate.source['Variant Original'] ?? candidate.source['Variant English'],
            brand: candidate.source.Brand,
            category: candidate.sourceCategory,
            subcategory: candidate.sourceSubcategory,
            barcode: candidate.ean,
            semantic: recognition,
          },
          technical: kind === 'technical',
          // INTIMPORT never resolves a manufacturer's dosage authority. The
          // resulting flag is reported so the owner can SEE that the dosage is
          // unproven; it withholds nothing.
          technicalAuthority: false,
        },
        mapper,
      )
    : null;
  const verifiedWorkingMacros = workingValues
    ? Object.fromEntries(
        (
          [
            'fat_percent',
            'protein_percent',
            'carbohydrate_percent',
            'total_sugars_percent',
            'fiber_percent',
            'salt_percent',
          ] as const
        ).flatMap((field) => {
          const truth = workingValues.fields[field];
          return truth.value !== null && truth.provenance.state === 'VERIFIED'
            ? [[field, truth.value]]
            : [];
        }),
      )
    : {};
  const profileMatchInput: ProfileMatchInput = {
    name: candidate.displayName,
    variant: candidate.source['Variant Original'] ?? candidate.source['Variant English'],
    brand: candidate.source.Brand,
    category: candidate.sourceCategory,
    subcategory: candidate.sourceSubcategory,
    barcode: candidate.ean,
    knownMacros: verifiedWorkingMacros,
    technical: kind === 'technical',
    semantic: recognition,
  };
  const carbonation = classifyCarbonation([
    ...intimportCarbonationEvidence(candidate, sourceAuthority),
    ...(reassessmentOverride?.carbonationEvidence ?? []),
  ]);
  const productBehaviorAuthority = classifyProspectiveProductBehavior({
    kind,
    engineUsable: workingValues?.engineReady === true,
    profileMatch: workingValues?.profileMatch ?? null,
    recognition,
    criticalPhysicsBlockers: workingValues?.criticalPhysicsBlockers ?? [],
  });
  const productionAccuracy = assessProductProductionAccuracy({
    evidence,
    evidenceProvenance: {
      ...intimportProductionAccuracyProvenance(
        evidence,
        sourceAuthority,
        candidate.source['Primary Source URL'] ?? candidate.source['Technical PDF URL'],
      ),
      ...(reassessmentOverride?.evidenceProvenance ?? {}),
    },
    fieldTruth: workingValues ? productionAccuracyTruthFromWorkingFields(workingValues.fields) : {},
    mapperWholeProfileSimilarity: workingValues?.profileMatch?.confidence ?? null,
    recognition,
    engineUsable: workingValues?.engineReady === true,
    criticalPhysicsBlockers: workingValues?.criticalPhysicsBlockers ?? ['PRODUCT_ENGINE_NOT_READY'],
    sweetnessPath: workingValues?.sweetnessPath ?? {
      kind: 'unresolved',
      resolved: false,
      reason: 'brak profilu roboczego',
    },
    behavior: productBehaviorAuthority,
  });

  const profileMatch = workingValues?.profileMatch ?? null;
  const selectedMapperDonor = profileMatch ? profileDonor(profileMatch) : null;
  const finalStatus: IntimportProductIntelligence['recognitionTrace']['finalStatus'] =
    candidate.state === 'REVIEW_REQUIRED' && candidate.duplicateOfRow !== null
      ? 'IDENTITY_CONFLICT'
      : !workingValues?.engineReady
        ? 'REVIEW'
        : productBehaviorAuthority.classificationOutcome === 'blocked'
          ? 'BLOCKED'
          : productBehaviorAuthority.classificationOutcome === 'classified'
            ? 'ENGINE_READY'
            : 'REVIEW';

  return {
    rowIndex: candidate.rowIndex,
    sourceProductId: candidate.sourceProductId,
    displayName: candidate.displayName,
    kind,
    recognition,
    recognitionEvidence,
    semanticEvidenceReceipt: reassessmentOverride?.semanticEvidenceReceipt ?? null,
    family,
    familyApplied,
    exactCanonicalMatch,
    existingProductId,
    assessment,
    productionAccuracy,
    sourceAuthority,
    researchIdentity: {
      sourceProductId: candidate.sourceProductId,
      brand: candidate.source.Brand,
      manufacturer: candidate.source.Manufacturer,
      name: candidate.displayName,
      variant: candidate.source['Variant Original'] ?? candidate.source['Variant English'],
      barcode: candidate.ean,
      netQuantity: typeof candidate.insert.package_size === 'string'
        ? candidate.insert.package_size
        : [candidate.source['Net Quantity Value'], candidate.source['Net Quantity Unit']]
            .filter(Boolean)
            .join(' ') || null,
      knownSourceUrl: candidate.source['Primary Source URL'],
      technicalPdfUrl: candidate.source['Technical PDF URL'],
    },
    researchPlan,
    evidence,
    carbonation,
    enrichmentEvidenceReceipts: [...(reassessmentOverride?.enrichmentEvidenceReceipts ?? [])],
    route,
    enrichmentTargets: targets,
    insert: candidate.insert,
    workingValues,
    productBehaviorAuthority,
    profileMatchInput,
    recognitionTrace: {
      semanticClassificationSource: recognition.classificationSource,
      semanticConfidence: recognition.confidence,
      mapperCandidatesBeforeFilter: profileMatch?.candidatesBeforeFilter ?? [],
      mapperCandidatesAfterFilter: profileMatch?.candidatesAfterFilter ?? [],
      selectedMapperDonor: selectedMapperDonor?.ingredient_id ?? null,
      mapperSimilarity: profileMatch?.confidence ?? null,
      rejectedMapperCandidates: profileMatch?.rejectedCandidates ?? [],
      dosageInterpretation: recognition.dosage,
      finalRole: recognition.intendedUsageRole,
      finalStatus,
      finalReasonCodes: [
        ...recognition.reasonCodes,
        ...productBehaviorAuthority.classificationReasonCodes,
        ...(profileMatch?.rejected ? [profileMatch.rejected] : []),
      ],
    },
  };
}

export interface IntimportLocalSummary {
  products: number;
  existingExact: number;
  readyLocalNoWeb: number;
  webRecommended: number;
  webRequired: number;
  reviewRequired: number;
  /** Parser-level ambiguous identities retained for an owner decision. */
  identityConflicts: number;
  familyMatches: number;
  /** Upper bound on external calls if the owner enriches everything under 90%. */
  estimatedMaxExternalCalls: number;
  /**
   * Numeric readiness, reported SEPARATELY from the informational
   * dosage-authority flag: a professional product may have a complete
   * composition and an unproven dosage, and neither says anything about
   * the other.
   */
  valueReadiness: Record<ValueReadiness, number> | null;
  /** Products the Mapper gave at least one working field to. */
  mapperContributed: number;
  /** Products whose own declared values contradict each other. */
  selfContradictory: number;
}

/** Products that will never be searched, because local evidence already suffices. */
const NO_WEB_ROUTES = new Set<EnrichmentRoute>(['EXISTING', 'READY_LOCAL']);

/**
 * Run local intelligence over a whole parsed file. Pure and free: this is what
 * the owner sees BEFORE deciding whether to spend anything.
 */
export function runIntimportLocalIntelligence(
  candidates: readonly IntimportCandidate[],
  index: IntimportCanonicalIndex = {},
  mapper: MapperKnowledge | null = null,
  recognitionOverrides: ReadonlyMap<number, ProductSemanticClassification> = new Map(),
  recognitionEvidenceOverrides: ReadonlyMap<number, ProductSemanticEvidence> = new Map(),
  reassessmentOverrides: ReadonlyMap<number, IntimportReassessmentOverride> = new Map(),
): { rows: IntimportProductIntelligence[]; summary: IntimportLocalSummary } {
  // INVALID rows have no usable identity and are not products to research.
  const rows = candidates
    .filter((candidate) => candidate.state !== 'INVALID' && candidate.state !== 'DUPLICATE')
    .map((candidate) =>
      assessIntimportProduct(
        candidate,
        index,
        mapper,
        recognitionOverrides.get(candidate.rowIndex) ?? null,
        recognitionEvidenceOverrides.get(candidate.rowIndex) ?? null,
        reassessmentOverrides.get(candidate.rowIndex) ?? null,
      ),
    );

  const count = (route: EnrichmentRoute) => rows.filter((row) => row.route === route).length;
  const enrichable = rows.filter((row) => !NO_WEB_ROUTES.has(row.route));

  return {
    rows,
    summary: {
      products: rows.length,
      existingExact: count('EXISTING'),
      readyLocalNoWeb: count('READY_LOCAL'),
      webRecommended: count('WEB_RECOMMENDED'),
      webRequired: count('WEB_REQUIRED'),
      reviewRequired: count('REVIEW_REQUIRED'),
      identityConflicts: candidates.filter(
        (candidate) => candidate.state === 'REVIEW_REQUIRED' && candidate.duplicateOfRow !== null,
      ).length,
      familyMatches: rows.filter((row) => row.familyApplied).length,
      // Every unresolved product gets its bounded ordered source plan. This is
      // an estimate of source steps, not an artificial three-field ceiling.
      estimatedMaxExternalCalls: enrichable.reduce(
        (sum, row) => sum + row.researchPlan.steps.length,
        0,
      ),
      valueReadiness: mapper
        ? rows.reduce(
            (counts, row) => {
              const state = row.workingValues?.valueReadiness;
              if (state) counts[state] += 1;
              return counts;
            },
            { READY: 0, ESTIMATED_READY: 0, REVIEW: 0 } as Record<ValueReadiness, number>,
          )
        : null,
      mapperContributed: rows.filter((row) => (row.workingValues?.mapperTiersUsed.length ?? 0) > 0)
        .length,
      selfContradictory: rows.filter((row) => row.workingValues?.contradictedByDeclaration).length,
    },
  };
}

/* ── import handoff ────────────────────────────────────────────────────────── */

/** What a row may do once it is in the catalogue. Readiness gates USE, not existence.
 *
 * There is no `TECHNICAL_AUTHORITY_REQUIRED` state: its only cause was a missing
 * manufacturer dosage, which is informational (owner decision, 2026-08-23). The
 * fact itself survives as `workingValues.technicalAuthorityRequired`. */
export type ImportedProductState =
  /** Every engine field measured. */
  | 'READY_VERIFIED'
  /** Engine-usable on values a compatible Mapper profile supplied. */
  | 'READY_ESTIMATED'
  /** Stored with whatever is known, but not fit to formulate with. */
  | 'REVIEW';

export interface IntimportImportRow {
  rowIndex: number;
  sourceProductId: string | null;
  displayName: string | null;
  /** The insert to persist, carrying resolved working values and provenance. */
  insert: ProductInsert;
  state: ImportedProductState;
  /** True only when the Engine may formulate with this product. */
  engineUsable: boolean;
}

export interface IntimportImportPlan {
  rows: IntimportImportRow[];
  byState: Record<ImportedProductState, number>;
  engineUsable: number;
}

function productionAccuracyOf(
  row: IntimportProductIntelligence,
): ProductProductionAccuracyAssessment {
  if (row.productionAccuracy) return row.productionAccuracy;
  const values = row.workingValues;
  const criticalPhysicsBlockers =
    values?.criticalPhysicsBlockers ??
    (values?.engineReady === true ? [] : ['PRODUCT_ENGINE_NOT_READY']);
  const behavior =
    row.productBehaviorAuthority ??
    classifyProspectiveProductBehavior({
      kind: row.evidence.kind,
      engineUsable: values?.engineReady === true,
      profileMatch: values?.profileMatch ?? null,
      recognition: row.recognition ?? null,
      criticalPhysicsBlockers,
    });
  return assessProductProductionAccuracy({
    evidence: row.evidence,
    fieldTruth: values ? productionAccuracyTruthFromWorkingFields(values.fields) : {},
    mapperWholeProfileSimilarity: values?.profileMatch?.confidence ?? null,
    recognition: row.recognition,
    engineUsable: values?.engineReady === true,
    criticalPhysicsBlockers,
    sweetnessPath: values?.sweetnessPath ?? {
      kind: 'unresolved',
      resolved: false,
      reason: 'brak profilu roboczego',
    },
    behavior,
  });
}

export interface IntimportReadinessSummary {
  sourceAnalyzed: number;
  workingProfileComplete: number;
  productAccuracyPass: number;
  criticalPhysicsResolved: number;
  /** Product-owned profile passed, before runtime ProductBehavior authority. */
  productProfileReady: number;
  productBehaviorAuthorityPass: number;
  engineReady: number;
  /** Profile/evidence still needs review. Disjoint from `blocked`. */
  review: number;
  /** Profile passed, but a later authority (normally ProductBehavior) blocks it. */
  blocked: number;
  other: number;
  carbonation: Record<'CARBONATED' | 'NON_CARBONATED' | 'UNKNOWN', number>;
}

/**
 * Prepare every valid row for the catalogue, and say what each may be used for.
 *
 * Readiness controls ENGINE USE, not whether a product may exist. A product the
 * owner imported is a product they have; refusing to store it because its water
 * is unknown loses the identity, the label evidence and the enrichment work
 * already done on it. So nothing is dropped here — a REVIEW row is written with
 * everything known about it and simply is not engine-usable, and a professional
 * product is written with its composition regardless of whether its dosage is
 * known — that is the manufacturer's instruction, not our permission.
 *
 * The resolved working values, estimates included, go into the SAME canonical
 * numeric fields a measured product uses, because that is what makes an
 * estimated product usable rather than merely annotated. Every field carries its
 * own provenance so nothing is flattened into a single READY flag.
 */
export function planIntimportImport(
  rows: readonly IntimportProductIntelligence[],
): IntimportImportPlan {
  const planned: IntimportImportRow[] = [];
  const byState: Record<ImportedProductState, number> = {
    READY_VERIFIED: 0,
    READY_ESTIMATED: 0,
    REVIEW: 0,
  };

  for (const row of rows) {
    const values = row.workingValues;
    const productionAccuracy = productionAccuracyOf(row);
    // Composition decides. A professional product is not held back for missing
    // dosage or process — those are informational and carry no authority.
    // Engine admission remains owned by canonical physics/ProductBehavior. The
    // customer-facing Product Accuracy reports the same requirements and caps at
    // 84 when one is unresolved; it is explanatory, never a bypass permission.
    const state: ImportedProductState = !values
      ? 'REVIEW'
      : values.valueReadiness === 'READY'
        ? 'READY_VERIFIED'
        : values.valueReadiness === 'ESTIMATED_READY'
          ? 'READY_ESTIMATED'
          : 'REVIEW';

    const insert: ProductInsert = { ...row.insert };
    const declared = Object.fromEntries(
      WORKING_NUMERIC_FIELDS.flatMap((field) => {
        const value = (row.insert as Record<string, unknown>)[field];
        return typeof value === 'number' && Number.isFinite(value) ? [[field, value]] : [];
      }),
    );
    const provenance: Record<string, unknown> = {};

    if (values) {
      for (const field of WORKING_NUMERIC_FIELDS) {
        const truth = values.fields[field];
        if (truth.value === null) continue;
        // Whatever was resolved is persisted for EVERY state — a REVIEW row
        // keeps its evidence rather than being stored empty and re-derived.
        (insert as Record<string, unknown>)[field] = truth.value;
        provenance[field] = {
          state: truth.provenance.state,
          basis: truth.provenance.basis,
          confidence: truth.provenance.confidence,
          mapperReferences: truth.provenance.mapperReferences,
          algorithmVersion: truth.provenance.algorithmVersion,
          mapperFingerprint: truth.provenance.mapperFingerprint,
        };
      }
    }

    const existing = (insert.extracted_json ?? {}) as Record<string, unknown>;
    const acceptedProfile =
      values?.profileMatch &&
      values.profileMatch.confidence >= PROFILE_MATCH_FLOOR &&
      values.profileMatch.rejected === null
        ? values.profileMatch
        : null;
    const selectedProfile = acceptedProfile ? profileDonor(acceptedProfile) : null;
    (insert as Record<string, unknown>).extracted_json = {
      ...existing,
      productIntelligence: {
        version: 2,
        state,
        engineUsable: state === 'READY_VERIFIED' || state === 'READY_ESTIMATED',
        productAccuracy: productionAccuracy.productAccuracy,
        legacyEvidenceAccuracy: row.assessment.confidence,
        productAccuracyAssessment: productionAccuracy,
        criticalReadiness: productionAccuracy.criticalBlockers.length === 0,
        // Two independent facts, deliberately never folded together.
        compositionReadiness: values?.valueReadiness ?? 'REVIEW',
        // INFORMATIONAL ONLY (owner decision, 2026-08-23). Recorded for audit,
        // explanation, tooltips and diagnostics. It never independently blocks
        // selection, Base use, an Engine calculation, Preview, Apply or Save.
        technicalAuthorityRequired: values?.technicalAuthorityRequired ?? false,
        needsEnrichment: state === 'REVIEW',
        recognition: row.recognition,
        recognitionTrace: row.recognitionTrace,
        productBehaviorAuthority: row.productBehaviorAuthority,
        profileMatch: values?.profileMatch
          ? {
              confidence: values.profileMatch.confidence,
              basis: values.profileMatch.basis,
              references: values.profileMatch.references,
              selectedMapperIngredientId: selectedProfile?.ingredient_id ?? null,
            }
          : null,
        // This is source material, never an authorization. catalog-submit
        // rebuilds the complete product-owned profile and accuracy from these
        // declarations plus the immutable Mapper, ignoring the browser's final
        // technicalComposition entirely.
        intimportProductProfileProposal: {
          proposedMapperIngredientId: selectedProfile?.ingredient_id ?? null,
          matchInput: row.profileMatchInput,
          sourceProductId: row.sourceProductId,
          declared,
          evidence: row.evidence,
          recognitionEvidence: row.recognitionEvidence,
          semanticEvidenceReceipt: row.semanticEvidenceReceipt,
          enrichmentEvidenceReceipts: row.enrichmentEvidenceReceipts,
        },
        fields: provenance,
      },
      carbonation: row.carbonation,
    };

    byState[state] += 1;
    planned.push({
      rowIndex: row.rowIndex,
      sourceProductId: row.sourceProductId,
      displayName: row.displayName,
      insert,
      state,
      engineUsable: state === 'READY_VERIFIED' || state === 'READY_ESTIMATED',
    });
  }

  return {
    rows: planned,
    byState,
    engineUsable: planned.filter((entry) => entry.engineUsable).length,
  };
}

/**
 * One truthful readiness result for the import UI and read-only census.
 *
 * The existing product-profile planner owns composition/evidence admission and
 * the existing ProductBehavior module gate owns runtime authority. A fresh
 * source row has no immutable product version or server snapshot yet, so it is
 * fail-closed at the ProductBehavior stage rather than being called Engine-ready
 * merely because Mapper estimates completed its numeric profile.
 */
export function summarizeIntimportReadiness(
  rows: readonly IntimportProductIntelligence[],
  behaviorSnapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>> = {},
): IntimportReadinessSummary {
  const plan = planIntimportImport(rows);
  let productBehaviorAuthorityPass = 0;
  let engineReady = 0;
  let behaviorReview = 0;
  let behaviorBlocked = 0;
  for (const [index, planned] of plan.rows.entries()) {
    if (!planned.engineUsable) continue;
    const lineId = `intimport-source:${planned.sourceProductId ?? planned.rowIndex}`;
    const gate = productBehaviorModuleGate(behaviorSnapshots, 'BASE_RECIPE', [lineId]);
    const prospective = rows[index]?.productBehaviorAuthority;
    const accepted =
      gate.ready ||
      (prospective?.classificationOutcome === 'classified' &&
        (prospective.baseRecipeEligible === true || prospective.toppingEligible === true));
    if (accepted) {
      productBehaviorAuthorityPass += 1;
      engineReady += 1;
    } else if (prospective?.classificationOutcome === 'blocked') {
      behaviorBlocked += 1;
    } else {
      behaviorReview += 1;
    }
  }
  const review = plan.byState.REVIEW + behaviorReview;
  const blocked = behaviorBlocked;
  const carbonation = rows.reduce(
    (counts, row) => {
      counts[row.carbonation?.status ?? 'UNKNOWN'] += 1;
      return counts;
    },
    { CARBONATED: 0, NON_CARBONATED: 0, UNKNOWN: 0 },
  );
  return {
    sourceAnalyzed: rows.length,
    workingProfileComplete: rows.filter(
      (row) =>
        row.workingValues?.valueReadiness === 'READY' ||
        row.workingValues?.valueReadiness === 'ESTIMATED_READY',
    ).length,
    productAccuracyPass: rows.filter(
      (row) => productionAccuracyOf(row).productAccuracy >= AUTO_IMPORT_FLOOR,
    ).length,
    criticalPhysicsResolved: rows.filter((row) => row.workingValues?.engineReady === true).length,
    productProfileReady: plan.engineUsable,
    productBehaviorAuthorityPass,
    engineReady,
    review,
    blocked,
    other: Math.max(0, rows.length - review - blocked - engineReady),
    carbonation,
  };
}
