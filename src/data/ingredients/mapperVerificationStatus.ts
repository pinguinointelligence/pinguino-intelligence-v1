/**
 * Frozen Mapper v1.0 verification vocabulary.
 *
 * Runtime eligibility must use these exact values. Prefix matching is forbidden:
 * a future status that merely begins with "Verified" has not been reviewed and
 * must fail closed until it is explicitly added to this authority.
 */
export const MAPPER_VERIFICATION_STATUSES = [
  'Blocked',
  'Blocked / Exact Composition Required',
  'Estimated',
  'Estimated / GC50 global reference',
  'Estimated / GC50 reference model',
  'Estimated / Needs Label Review',
  'Estimated / Owner-approved Engine model',
  'Estimated / PI Calculated',
  'Estimated / Source-based global reference',
  'Legacy reference / Exact identity or TDS review',
  'PI Calculated / Global DE Reference',
  'PI Calculated / Global Reference',
  'PI Calculated / Needs Label Review',
  'Superseded Duplicate',
  'Vegan verified / allergen label review required',
  'Vegan verified / cross-contamination noted',
  'Vegan/dairy-free verified / allergen label review required',
  'Verified',
  'Verified / Basis Check Needed',
  'Verified / Exact Product Specification / PI Calculated',
  'Verified / Global Reference',
  'Verified / Official Food Composition',
  'Verified / Official Product Label / PI Calculated',
  'Verified / PI Calculated',
  'Verified / Public Label',
  'Verified / Public Label / PI Calculated',
] as const;

export type MapperVerificationStatus = (typeof MAPPER_VERIFICATION_STATUSES)[number];

/** Exact statuses admitted by the previously accepted Home verified-only view. */
export const MAPPER_HOME_VERIFIED_STATUSES = [
  'Verified',
  'Verified / Basis Check Needed',
  'Verified / Exact Product Specification / PI Calculated',
  'Verified / Global Reference',
  'Verified / Official Food Composition',
  'Verified / Official Product Label / PI Calculated',
  'Verified / PI Calculated',
  'Verified / Public Label',
  'Verified / Public Label / PI Calculated',
] as const satisfies readonly MapperVerificationStatus[];

const homeVerifiedStatuses = new Set<string>(MAPPER_HOME_VERIFIED_STATUSES);

export function isMapperHomeVerifiedStatus(
  status: string | null | undefined,
): status is (typeof MAPPER_HOME_VERIFIED_STATUSES)[number] {
  return typeof status === 'string' && homeVerifiedStatuses.has(status.trim());
}
