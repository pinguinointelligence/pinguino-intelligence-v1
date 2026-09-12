import type {
  IntimportMapperAuthorityRow,
  IntimportProductProfileProposalInput,
  IntimportTrustedProductProfile,
} from './intimportWholeProfileAuthority.ts';
import {
  finalizeProductProductionAccuracy,
  validateIntimportProductProfileProposal,
} from './intimportWholeProfileAuthority.ts';
import {
  supportsStandaloneToppingSemanticAuthority,
  validateProductBehaviorAuthority,
  type MapperProductBehaviorAuthorityRow,
  type TrustedProductBehaviorAuthority,
} from '../../../src/features/product-intelligence/productBehaviorAuthority.ts';
import { classifyProductSemantics } from '../../../src/features/product-intelligence/productRecognition.ts';

export const SHARED_PRODUCT_ONBOARDING_AUTHORITY = 'SHARED_PR_ING_ONBOARDING_V1' as const;

export type SharedProductOnboardingSource =
  | 'SCANNER'
  | 'RECIPE_LIBRARY_IMPORT'
  | 'MANUAL_IMPORT'
  | 'ADMIN_IMPORT'
  | 'FUTURE_IMPORT'
  | 'REVALIDATION';

export interface SharedProductOnboardingResult {
  authority: typeof SHARED_PRODUCT_ONBOARDING_AUTHORITY;
  source: SharedProductOnboardingSource;
  profile: IntimportTrustedProductProfile;
  behavior: TrustedProductBehaviorAuthority;
}

type SharedProductOnboardingProposal = Omit<IntimportProductProfileProposalInput, 'rows'>;

/**
 * A strong exact TOPPING_ONLY product owns its role semantics and has no Mapper
 * donor by design. Recompute the deterministic verdict before taking this fast
 * path: a submitted recognition object can only be reused when its fingerprint
 * matches that server recomputation. A false result merely keeps the ordinary
 * full Mapper path; it can never relax BASE, SUBSTITUTE or ambiguity gates.
 */
export function usesStandaloneToppingOnboardingAuthority(
  proposal: SharedProductOnboardingProposal,
): boolean {
  if (!proposal.recognitionEvidence) return false;
  const deterministic = classifyProductSemantics(proposal.recognitionEvidence);
  const recognition =
    proposal.trustedRecognition?.authority === 'PRODUCT_RECOGNITION_V2' &&
    proposal.trustedRecognition.evidenceFingerprint === deterministic.evidenceFingerprint
      ? proposal.trustedRecognition
      : deterministic;
  return supportsStandaloneToppingSemanticAuthority({
    recognition,
    evidence: proposal.evidence,
  });
}

/**
 * The one server-owned PR/PM onboarding boundary.
 *
 * Source adapters may gather different evidence, but none of them gets its own
 * classification or readiness rules. Every exact product is rebuilt through
 * PRODUCT_PROFILE_V1, then classified through PRODUCT_BEHAVIOR_V1, and the
 * customer-facing accuracy is frozen against that same role-specific verdict.
 */
export function validateSharedProductOnboarding(input: {
  source: SharedProductOnboardingSource;
  proposal: SharedProductOnboardingProposal;
  mapperRows: readonly IntimportMapperAuthorityRow[];
  behaviorRows: readonly MapperProductBehaviorAuthorityRow[];
}): SharedProductOnboardingResult | null {
  const standaloneTopping = usesStandaloneToppingOnboardingAuthority(input.proposal);
  const profile = validateIntimportProductProfileProposal({
    ...input.proposal,
    // No Mapper row is consulted or lent to an exact standalone topping. This
    // also keeps the edge worker from building three 2.5k-row inference indexes
    // for an authority whose persisted referenceMapperIngredientId is null.
    rows: standaloneTopping ? [] : input.mapperRows,
  });
  if (!profile) return null;

  const behavior = validateProductBehaviorAuthority({
    productProfile: profile,
    behaviorRows: standaloneTopping ? [] : input.behaviorRows,
  });
  return {
    authority: SHARED_PRODUCT_ONBOARDING_AUTHORITY,
    source: input.source,
    profile: finalizeProductProductionAccuracy(profile, behavior),
    behavior,
  };
}
