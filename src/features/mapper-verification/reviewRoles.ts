/**
 * Review capabilities (PURE) — CONSUMES the Account Access authorization result and layers
 * the NEW review-workflow roles on top. Admin and partner stay separate concepts (an Account
 * Access admin is trusted for review-admin tasks; a partner is NOT a reviewer). Authorization
 * is always by internal user id — never email, never client-claimed.
 */
import type { EffectiveAccess } from '@/access/accountAccess/contracts';
import type { ReviewCapabilities, ReviewRole } from './contracts';

/**
 * Resolve the effective review capabilities. `access` is the Account Access result for the
 * signed-in identity (or null when unavailable); `reviewRole` is the user's review-role grant
 * (server-resolved, e.g. from a review_roles row) — never taken from the client.
 *
 * Hierarchy (each level implies the ones below):
 *   review_admin / Account-Access admin → canAdminReview → canSeniorReview → canReview
 *   senior_reviewer                     → canSeniorReview → canReview
 *   reviewer                            → canReview
 */
export function resolveReviewCapabilities(
  access: EffectiveAccess | null,
  reviewRole: ReviewRole,
): ReviewCapabilities {
  const accountAdmin = access?.canAdmin === true;
  const canAdminReview = accountAdmin || reviewRole === 'review_admin';
  const canSeniorReview = canAdminReview || reviewRole === 'senior_reviewer';
  const canReview = canSeniorReview || reviewRole === 'reviewer';
  return { canReview, canSeniorReview, canAdminReview, role: reviewRole };
}
