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
  validateProductBehaviorAuthority,
  type MapperProductBehaviorAuthorityRow,
  type TrustedProductBehaviorAuthority,
} from '../../../src/features/product-intelligence/productBehaviorAuthority.ts';

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
  proposal: Omit<IntimportProductProfileProposalInput, 'rows'>;
  mapperRows: readonly IntimportMapperAuthorityRow[];
  behaviorRows: readonly MapperProductBehaviorAuthorityRow[];
}): SharedProductOnboardingResult | null {
  const profile = validateIntimportProductProfileProposal({
    ...input.proposal,
    rows: input.mapperRows,
  });
  if (!profile) return null;

  const behavior = validateProductBehaviorAuthority({
    productProfile: profile,
    behaviorRows: input.behaviorRows,
  });
  return {
    authority: SHARED_PRODUCT_ONBOARDING_AUTHORITY,
    source: input.source,
    profile: finalizeProductProductionAccuracy(profile, behavior),
    behavior,
  };
}
