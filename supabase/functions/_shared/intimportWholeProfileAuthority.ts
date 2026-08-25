import {
  buildMapperKnowledge,
  findProfileMatch,
  fingerprintMapperRows,
  profileDonor,
  PROFILE_MATCH_FLOOR,
  type MapperKnowledgeRow,
  type ProfileMatchBasis,
  type ProfileMatchInput,
} from '../../../src/features/product-intelligence/mapperValueInference.ts';
import {
  assessProductConfidence,
  type ProductEvidenceInput,
  type ProductEvidenceField,
  type EvidenceSource,
} from '../../../src/features/product-intelligence/productEvidenceConfidence.ts';
import {
  resolveProductWorkingValues,
  type ProductReadiness,
  type SweetnessPath,
} from '../../../src/features/product-intelligence/productWorkingValues.ts';
import type { CardContribution } from '../../../src/features/product-intelligence/productSourceCard.ts';
import {
  WORKING_NUMERIC_FIELDS,
  type FieldBasis,
  type FieldTruthState,
  type WorkingNumericField,
} from '../../../src/features/product-intelligence/productFieldTruth.ts';
import {
  classifyCarbonation,
  type CarbonationEvidence,
  type CarbonationProfile,
} from '../../../src/data/products/carbonation.ts';
import {
  classifyProductSemantics,
  type ProductSemanticClassification,
  type ProductSemanticEvidence,
} from '../../../src/features/product-intelligence/productRecognition.ts';
import {
  assessProductProductionAccuracy,
  type ProductProductionAccuracyBehavior,
  type ProductProductionAccuracyAssessment,
} from '../../../src/features/product-intelligence/productProductionAccuracy.ts';
import { classifyProspectiveProductBehavior } from '../../../src/features/product-intelligence/productBehaviorAuthority.ts';

export const INTIMPORT_WHOLE_PROFILE_AUTHORITY = 'INTIMPORT_WHOLE_PROFILE_MATCH' as const;

export interface IntimportMapperAuthorityRow extends MapperKnowledgeRow {
  approved_for_base: boolean;
  approved_for_engines: boolean;
  verification_status: string;
}

export interface IntimportWholeProfileAuthority {
  authority: typeof INTIMPORT_WHOLE_PROFILE_AUTHORITY;
  validationMode: 'server_recomputed_whole_profile';
  mapperIngredientId: string;
  confidence: number;
  profileBasis: Exclude<ProfileMatchBasis, 'none'>;
  hardContradiction: false;
  rejected: null;
  mapperFingerprint: string;
  selectionFingerprint: string;
}

export interface IntimportWholeProfileProposalInput {
  proposedMapperIngredientId: string;
  matchInput: ProfileMatchInput;
  rows: readonly IntimportMapperAuthorityRow[];
}

export const PRODUCT_PROFILE_AUTHORITY = 'PRODUCT_PROFILE_V1' as const;
/** Historical export retained for callers while PR and PM converge on one authority. */
export const INTIMPORT_PRODUCT_PROFILE_AUTHORITY = PRODUCT_PROFILE_AUTHORITY;

export interface IntimportTrustedFieldTruth {
  value: number;
  state: FieldTruthState;
  basis: FieldBasis;
  confidence: number;
  mapperReferences: string[];
  algorithmVersion: string | null;
  mapperFingerprint: string | null;
}

export interface IntimportTrustedProductProfile {
  authority: typeof PRODUCT_PROFILE_AUTHORITY;
  validationMode: 'server_recomputed_product_profile';
  articleIdentity: 'PRODUCT_OWNED';
  origin: 'PR' | 'PM';
  productAccuracy: number;
  /** Previous metadata-oriented score retained only for before/after audit and
   * enrichment routing. It is never the customer-facing Product Accuracy. */
  legacyEvidenceAccuracy: number;
  productAccuracyAssessment: ProductProductionAccuracyAssessment;
  /** Exact, server-validated evidence used for the deterministic score. */
  evidence: ProductEvidenceInput;
  evidenceProvenance: Partial<Record<ProductEvidenceField, IntimportTrustedEvidenceProvenance>>;
  carbonation: CarbonationProfile;
  readiness: ProductReadiness;
  engineUsable: boolean;
  criticalReadiness: boolean;
  missingCritical: string[];
  missingEngineFields: WorkingNumericField[];
  /** Exact reason a numerically complete profile can still be withheld. */
  criticalPhysicsBlockers: string[];
  sweetnessPath: SweetnessPath;
  allergenEvidenceStatus: 'CONFIRMED' | 'USER_CONFIRMED' | 'NOT_CONFIRMED';
  ingredientsEvidenceStatus: 'CONFIRMED' | 'USER_CONFIRMED' | 'NOT_CONFIRMED';
  technicalComposition: Record<string, number>;
  fieldTruth: Partial<Record<WorkingNumericField, IntimportTrustedFieldTruth>>;
  estimatedFromMapperIds: string[];
  /** Exact server-selected profile used only as ProductBehavior evidence.
   * It is never written to product mapper identity or used as runtime physics. */
  profileReferenceMapperIngredientId: string | null;
  mapperSimilarity: number | null;
  mapperProfileBasis: Exclude<ProfileMatchBasis, 'none'> | null;
  mapperCandidatesBeforeFilter: string[];
  mapperCandidatesAfterFilter: string[];
  mapperRejectedCandidates: { ingredientId: string; reasonCodes: string[] }[];
  mapperFingerprint: string;
  recognition: ProductSemanticClassification | null;
}

export interface IntimportTrustedEvidenceProvenance {
  source: EvidenceSource;
  sourceUrl: string | null;
  sourceDomain: string | null;
  sourceTitle: string | null;
  sourceAuthorityClass: string | null;
  retrievedAt: string | null;
  evidenceReceipt: string | null;
}

export interface IntimportProductProfileProposalInput {
  origin?: 'PR' | 'PM';
  /** Untrusted client hint retained only for diagnostics/backward compatibility.
   * The server always recomputes the donor and never rejects the product merely
   * because this hint differs. */
  proposedMapperIngredientId: string | null;
  matchInput: ProfileMatchInput;
  declared: Partial<Record<WorkingNumericField, number | null>>;
  declaredBasis?: Partial<Record<WorkingNumericField, 'product_declared' | 'user_confirmed'>>;
  /** Exact source-card facts rebuilt by the server from validated enrichment
   * ledger receipts. Never accepted directly from a browser proposal. */
  sourceCard?: CardContribution | null;
  evidence: ProductEvidenceInput;
  /** Exact public evidence. When present the server recomputes Recognition V2;
   * no submitted semantic verdict is trusted. */
  recognitionEvidence?: ProductSemanticEvidence | null;
  /** Server-ledger validated model result. Browser values never enter here. */
  trustedRecognition?: ProductSemanticClassification | null;
  /** Supplied only by the server after ledger/source validation. */
  evidenceProvenance?: Partial<Record<ProductEvidenceField, IntimportTrustedEvidenceProvenance>>;
  /** Server-derived exact assertions only. Browser product names never enter. */
  carbonationEvidence?: readonly CarbonationEvidence[];
  /** Deliberately ignored. It exists only so callers/tests can prove that a
   * browser-supplied final profile has no authority at this boundary. */
  proposedTechnicalComposition?: Record<string, unknown>;
  rows: readonly IntimportMapperAuthorityRow[];
}

const TECHNICAL_KEYS: Readonly<Record<WorkingNumericField, string>> = Object.freeze({
  water_percent: 'water',
  total_solids_percent: 'totalSolids',
  fat_percent: 'fat',
  saturated_fat_percent: 'saturatedFat',
  protein_percent: 'protein',
  carbohydrate_percent: 'carbohydrate',
  total_sugars_percent: 'sugars',
  sucrose_percent: 'sucrose',
  dextrose_percent: 'dextrose',
  glucose_percent: 'glucose',
  fructose_percent: 'fructose',
  lactose_percent: 'lactose',
  polyol_percent: 'polyols',
  fiber_percent: 'fibre',
  salt_percent: 'salt',
  alcohol_percent: 'alcohol',
  kcal_per_100g: 'energyKcal',
  pod_value: 'podValue',
  pac_value: 'pacValue',
  sweetness_factor: 'sweetnessFactor',
  freezing_factor: 'freezingFactor',
});

/** The immutable Mapper vocabulary is prefix-governed, not case-exact. */
export function isBindableIntimportMapperTarget(row: IntimportMapperAuthorityRow): boolean {
  return (
    row.is_active !== false &&
    row.approved_for_base === true &&
    row.approved_for_engines === true &&
    row.verification_status.trim().toLowerCase().startsWith('verified')
  );
}

/**
 * Recompute the frozen whole-profile decision from public import facts.
 *
 * The proposal contains only an ID. Its confidence, contradiction verdict and
 * selected donor all come from this calculation, so a browser cannot promote a
 * random target by attaching READY/confidence flags to the request.
 */
export function validateIntimportWholeProfileProposal(
  input: IntimportWholeProfileProposalInput,
): IntimportWholeProfileAuthority | null {
  const proposedId = input.proposedMapperIngredientId.trim();
  if (!proposedId) return null;

  const mapperFingerprint = fingerprintMapperRows(input.rows);
  const knowledge = buildMapperKnowledge(input.rows, mapperFingerprint);
  const match = findProfileMatch(input.matchInput, knowledge);
  if (match.confidence < PROFILE_MATCH_FLOOR || match.rejected !== null || match.basis === 'none') {
    return null;
  }

  const selected = profileDonor(match);
  if (!selected || selected.ingredient_id !== proposedId) return null;
  const target = input.rows.find((row) => row.ingredient_id === selected.ingredient_id);
  if (!target || !isBindableIntimportMapperTarget(target)) return null;

  return {
    authority: INTIMPORT_WHOLE_PROFILE_AUTHORITY,
    validationMode: 'server_recomputed_whole_profile',
    mapperIngredientId: selected.ingredient_id,
    confidence: match.confidence,
    profileBasis: match.basis,
    hardContradiction: false,
    rejected: null,
    mapperFingerprint,
    selectionFingerprint: [
      mapperFingerprint,
      selected.ingredient_id,
      match.basis,
      match.confidence.toFixed(4),
    ].join(':'),
  };
}

/**
 * Rebuild the imported article's own immutable technical profile.
 *
 * The submitted final composition is never read. Source declarations enter as
 * VERIFIED facts, the immutable Mapper may fill only gaps, and both the
 * admission verdict and displayed Product Accuracy are recomputed with the
 * existing shared policies. A Mapper id is retained as estimate provenance;
 * it never becomes this article's runtime identity.
 */
export function validateIntimportProductProfileProposal(
  input: IntimportProductProfileProposalInput,
): IntimportTrustedProductProfile | null {
  const mapperFingerprint = fingerprintMapperRows(input.rows);
  const deterministicRecognition = input.recognitionEvidence
    ? classifyProductSemantics(input.recognitionEvidence)
    : null;
  const recognition =
    input.trustedRecognition &&
    deterministicRecognition &&
    input.trustedRecognition.authority === 'PRODUCT_RECOGNITION_V2' &&
    input.trustedRecognition.evidenceFingerprint === deterministicRecognition.evidenceFingerprint
      ? input.trustedRecognition
      : deterministicRecognition;
  // Only verified, Engine-approved Mapper rows may contribute estimates. The
  // browser's proposed ID is deliberately ignored: the server recomputes the
  // donor from canonical facts, and a stale/wrong hint must degrade to the
  // server result (or REVIEW), never discard the commercial product itself.
  const knowledge = buildMapperKnowledge(
    input.rows.filter(isBindableIntimportMapperTarget),
    mapperFingerprint,
  );
  const evidenceAssessment = assessProductConfidence(input.evidence);
  const resolved = resolveProductWorkingValues(
    {
      declared: input.declared,
      declaredBasis: input.declaredBasis,
      declaredConfidence: evidenceAssessment.confidence / 100,
      sourceCard: input.sourceCard ?? null,
      identity: {
        name: input.matchInput.name,
        variant: input.matchInput.variant,
        brand: input.matchInput.brand,
        category: input.matchInput.category,
        subcategory: input.matchInput.subcategory,
        barcode: input.matchInput.barcode,
        semantic: recognition,
      },
      technical: recognition?.isTechnicalProduct ?? input.matchInput.technical === true,
      technicalAuthority: false,
    },
    knowledge,
  );

  const acceptedMatch =
    resolved.profileMatch &&
    resolved.profileMatch.confidence >= PROFILE_MATCH_FLOOR &&
    resolved.profileMatch.rejected === null &&
    resolved.profileMatch.basis !== 'none'
      ? resolved.profileMatch
      : null;
  const acceptedProfileReference = acceptedMatch ? profileDonor(acceptedMatch) : null;

  const technicalComposition: Record<string, number> = {};
  const fieldTruth: Partial<Record<WorkingNumericField, IntimportTrustedFieldTruth>> = {};
  for (const field of WORKING_NUMERIC_FIELDS) {
    const truth = resolved.fields[field];
    if (truth.value === null) continue;
    technicalComposition[TECHNICAL_KEYS[field]] = truth.value;
    fieldTruth[field] = {
      value: truth.value,
      state: truth.provenance.state,
      basis: truth.provenance.basis,
      confidence: truth.provenance.confidence,
      mapperReferences: [...truth.provenance.mapperReferences],
      algorithmVersion: truth.provenance.algorithmVersion,
      mapperFingerprint: truth.provenance.mapperFingerprint,
    };
  }
  const criticalPhysicsBlockers = [...resolved.criticalPhysicsBlockers];
  const prospectiveBehavior = classifyProspectiveProductBehavior({
    kind: input.evidence.kind,
    engineUsable: resolved.engineReady,
    profileMatch: resolved.profileMatch,
    recognition,
    criticalPhysicsBlockers,
  });
  const productAccuracyAssessment = assessProductProductionAccuracy({
    evidence: input.evidence,
    evidenceProvenance: input.evidenceProvenance,
    fieldTruth,
    mapperWholeProfileSimilarity: acceptedMatch?.confidence ?? null,
    recognition,
    engineUsable: resolved.engineReady,
    criticalPhysicsBlockers,
    sweetnessPath: resolved.sweetnessPath,
    behavior: prospectiveBehavior,
  });

  return {
    authority: PRODUCT_PROFILE_AUTHORITY,
    validationMode: 'server_recomputed_product_profile',
    articleIdentity: 'PRODUCT_OWNED',
    origin: input.origin ?? 'PR',
    productAccuracy: productAccuracyAssessment.productAccuracy,
    legacyEvidenceAccuracy: evidenceAssessment.confidence,
    productAccuracyAssessment,
    evidence: {
      ...input.evidence,
      fields: { ...input.evidence.fields },
      materialConflicts: [...input.evidence.materialConflicts],
    },
    evidenceProvenance: structuredClone(input.evidenceProvenance ?? {}),
    carbonation: classifyCarbonation(input.carbonationEvidence ?? []),
    readiness: resolved.readiness,
    // Historical contract: Product Accuracy routes enrichment/automatic import
    // handling, while Engine admission is decided by the resolved critical
    // physical profile. Do not fold the aggregate evidence score into physics.
    engineUsable: resolved.engineReady,
    criticalReadiness: evidenceAssessment.criticalReadiness,
    missingCritical: [...evidenceAssessment.missingCritical],
    missingEngineFields: [...resolved.missingEngineFields],
    criticalPhysicsBlockers,
    sweetnessPath: { ...resolved.sweetnessPath },
    allergenEvidenceStatus:
      input.evidence.fields.allergens === 'user_confirmed'
        ? 'USER_CONFIRMED'
        : input.evidence.fields.allergens
          ? 'CONFIRMED'
          : 'NOT_CONFIRMED',
    ingredientsEvidenceStatus:
      input.evidence.fields.ingredients === 'user_confirmed'
        ? 'USER_CONFIRMED'
        : input.evidence.fields.ingredients
          ? 'CONFIRMED'
          : 'NOT_CONFIRMED',
    technicalComposition,
    fieldTruth,
    estimatedFromMapperIds: [...resolved.mapperReferences],
    profileReferenceMapperIngredientId: acceptedProfileReference?.ingredient_id ?? null,
    mapperSimilarity: acceptedMatch?.confidence ?? null,
    mapperProfileBasis:
      acceptedMatch && acceptedMatch.basis !== 'none' ? acceptedMatch.basis : null,
    mapperCandidatesBeforeFilter: [...(resolved.profileMatch?.candidatesBeforeFilter ?? [])],
    mapperCandidatesAfterFilter: [...(resolved.profileMatch?.candidatesAfterFilter ?? [])],
    mapperRejectedCandidates: (resolved.profileMatch?.rejectedCandidates ?? []).map(
      (candidate) => ({
        ingredientId: candidate.ingredientId,
        reasonCodes: [...candidate.reasonCodes],
      }),
    ),
    mapperFingerprint,
    recognition,
  };
}

/** Freeze the customer-facing Product Accuracy against the exact ProductBehavior
 * authority that will be persisted. PR and PM both call this after the shared
 * server behavior validation; no origin-specific weights or gates exist. */
export function finalizeProductProductionAccuracy<T extends IntimportTrustedProductProfile>(
  profile: T,
  behavior: ProductProductionAccuracyBehavior,
): T {
  const productAccuracyAssessment = assessProductProductionAccuracy({
    evidence: profile.evidence,
    evidenceProvenance: profile.evidenceProvenance,
    fieldTruth: profile.fieldTruth,
    mapperWholeProfileSimilarity: profile.mapperSimilarity,
    recognition: profile.recognition,
    engineUsable: profile.engineUsable,
    criticalPhysicsBlockers: profile.criticalPhysicsBlockers,
    sweetnessPath: profile.sweetnessPath,
    behavior,
  });
  return {
    ...profile,
    productAccuracy: productAccuracyAssessment.productAccuracy,
    productAccuracyAssessment,
  };
}
