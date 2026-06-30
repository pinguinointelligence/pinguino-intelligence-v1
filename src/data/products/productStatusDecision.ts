/**
 * Pure product STATUS-DECISION module. Given a product's mapping state, red flags, and the
 * engine-value resolution (reference-linked vs own-measured), it RECOMMENDS a customer-facing
 * lifecycle status — without writing anything. It is the policy that turns Mapper signals into
 * the team's customer statuses (Verified / PI Calculated / PI Generated / Manual Adjusted / PI
 * Verified) honestly.
 *
 *   - PURE: composes detectRedFlags + resolveProductEngineValues (both pure). No DB, no
 *     service, no engine runtime, no IO. Deterministic. No npac_value.
 *   - HONEST: never manufactures confidence; red flags BLOCK PI Verified and PI Calculated
 *     auto-verify; reference-linked (not independently measured) pac/pod is at most
 *     PI Generated / Manual Adjusted, never auto PI Verified.
 *   - CUSTOMER-SAFE: returns a customer label (no "Mapper", no internal %) plus separate
 *     internal flags + blockers for the review workflow.
 *
 * NOTE: `Verified` is the customer label for a locked `mapper_basement` REFERENCE item, not a
 * product in `products`; this module (which decides for PR-ING products) never emits it.
 */
import { blocksAutoVerify, detectRedFlags, type RedFlag, type RedFlagInput } from './productRedFlags';
import { resolveProductEngineValues, type ProductEngineInput, type ReferenceEngineValues } from './productEngineResolver';
import type { ProductStatus } from './productRow';

export type CustomerStatusLabel = 'PI Calculated' | 'PI Generated' | 'Manual Adjusted' | 'PI Verified';

/** products.status enum value → customer-facing label. draft/rejected are internal (null). */
const CUSTOMER_LABEL: Record<ProductStatus, CustomerStatusLabel | null> = {
  draft: null,
  pi_calculated: 'PI Calculated',
  pi_generated: 'PI Generated',
  manual_adjusted: 'Manual Adjusted',
  pi_verified: 'PI Verified',
  rejected: null,
};

/**
 * The clean, customer-safe label for a product status — the single source of truth used by
 * any product-facing surface. Never the word "Mapper", never an internal confidence percentage;
 * draft/rejected (internal-only) return null so they are not shown to customers.
 */
export function formatProductStatusLabel(status: ProductStatus): CustomerStatusLabel | null {
  return CUSTOMER_LABEL[status] ?? null;
}

export interface StatusDecisionInput extends RedFlagInput, ProductEngineInput {
  /** the matched basement reference (looked up by the caller), for engine-value resolution. */
  reference?: ReferenceEngineValues | null;
  /** an admin manually corrected this product's profile. */
  manuallyAdjusted?: boolean;
  /** an explicit reviewer sign-off for PI Verified (manual-approval path). `independent_provenance`
   * attests reliable lab/technical-sheet/producer data — REQUIRED to PI Verify a reference-linked
   * product (a bare reason cannot elevate borrowed values). */
  reviewerApproval?: { verified_by: string; basis: string; independent_provenance?: boolean } | null;
}

export interface StatusDecision {
  recommended_status: ProductStatus;
  /** customer-facing label, or null when the state is internal-only (draft/rejected). */
  customer_label: CustomerStatusLabel | null;
  reasons: string[];
  /** why a HIGHER status is not available (e.g. red flags, reference-linked only). */
  blockers: string[];
  /** calm customer-facing warnings (no internal codes, no "Mapper", no percentages). */
  customer_warning_flags: string[];
  /** internal-only signals (red-flag codes, provenance) — never shown to customers. */
  internal_flags: string[];
  red_flags: RedFlag[];
}

const REFERENCE_LINKED_WARNING =
  'Profile values are linked from a reference ingredient, not an independent measurement of this product.';
const PENDING_VERIFICATION_WARNING =
  'Pending verification — this product needs manual review before it can be verified.';

function decide(
  recommended_status: ProductStatus,
  parts: Partial<Omit<StatusDecision, 'recommended_status' | 'customer_label'>>,
): StatusDecision {
  return {
    recommended_status,
    customer_label: CUSTOMER_LABEL[recommended_status],
    reasons: parts.reasons ?? [],
    blockers: parts.blockers ?? [],
    customer_warning_flags: parts.customer_warning_flags ?? [],
    internal_flags: parts.internal_flags ?? [],
    red_flags: parts.red_flags ?? [],
  };
}

/**
 * Recommend a customer-facing lifecycle status for one product. Pure; writes nothing. The
 * caller decides whether/when to persist `recommended_status`.
 */
export function decideProductStatus(input: StatusDecisionInput): StatusDecision {
  const redFlags = detectRedFlags(input);
  const hasRedFlag = blocksAutoVerify(redFlags);
  const resolution = resolveProductEngineValues(input, input.reference ?? null);
  const internal_flags = [...redFlags.map((f) => f.code), `engine_provenance:${resolution.provenance}`];

  // Rejected mapping → no usable profile (internal state).
  if (input.mapper_status === 'rejected') {
    return decide('rejected', {
      reasons: ['Mapping was rejected — no usable product profile.'],
      internal_flags,
      red_flags: redFlags,
    });
  }

  // Not a confirmed match → not engine-ready; stays draft (internal).
  if (input.mapper_status !== 'matched') {
    return decide('draft', {
      reasons: [`No confirmed mapping (mapper_status=${input.mapper_status ?? 'null'}).`],
      blockers: ['A confirmed match is required before a customer status can be assigned.'],
      internal_flags,
      red_flags: redFlags,
    });
  }

  // Matched but the reference cannot supply engine values → not even a generated profile.
  if (!resolution.resolvable) {
    return decide('draft', {
      reasons: ['Matched, but engine values are not resolvable yet.'],
      blockers: [resolution.reason],
      internal_flags,
      red_flags: redFlags,
    });
  }

  const ownMeasured = resolution.provenance === 'product_measured';
  const customerWarnings: string[] = [];
  if (resolution.not_independently_measured) customerWarnings.push(REFERENCE_LINKED_WARNING);

  // Red flags ALWAYS block PI Verified and PI Calculated auto-verify.
  if (hasRedFlag) {
    customerWarnings.push(PENDING_VERIFICATION_WARNING);
    return decide(input.manuallyAdjusted ? 'manual_adjusted' : 'pi_generated', {
      reasons: ['Usable generated profile, but red flags require manual review.'],
      blockers: [`Red flags block PI Verified / PI Calculated auto-verify: ${redFlags.map((f) => f.code).join(', ')}.`],
      customer_warning_flags: customerWarnings,
      internal_flags,
      red_flags: redFlags,
    });
  }

  // Explicit reviewer sign-off (manual-approval path) → PI Verified, never for red-flag products.
  // A reference-linked product additionally requires an independent-provenance attestation: a
  // reviewer reason alone cannot elevate borrowed values to PI Verified.
  if (input.reviewerApproval) {
    const independentlyProvenanced = ownMeasured || input.reviewerApproval.independent_provenance === true;
    if (independentlyProvenanced) {
      return decide('pi_verified', {
        reasons: [
          `Reviewer approved (${input.reviewerApproval.verified_by}): ${input.reviewerApproval.basis}.` +
            (input.reviewerApproval.independent_provenance ? ' Independent provenance attested.' : ''),
        ],
        customer_warning_flags: customerWarnings,
        internal_flags,
        red_flags: redFlags,
      });
    }
    // reviewer reason given, but values are reference-linked and no independent provenance attested.
    return decide(input.manuallyAdjusted ? 'manual_adjusted' : 'pi_generated', {
      reasons: ['Reviewer reason recorded, but the profile is reference-linked only.'],
      blockers: ['PI Verified needs independent (lab / technical-sheet / producer) provenance — reference-linked values cannot be PI Verified on a reason alone.'],
      customer_warning_flags: customerWarnings,
      internal_flags,
      red_flags: redFlags,
    });
  }

  // Own measured pac/pod, no red flags → simple, directly calculable → PI Calculated.
  if (ownMeasured) {
    return decide(input.manuallyAdjusted ? 'manual_adjusted' : 'pi_calculated', {
      reasons: ['Product carries its own measured pac/pod; directly calculable.'],
      customer_warning_flags: customerWarnings,
      internal_flags,
      red_flags: redFlags,
    });
  }

  // Reference-linked engine values, no red flags, no reviewer approval → PI Generated
  // (or Manual Adjusted if an admin corrected it). NEVER auto PI Verified.
  return decide(input.manuallyAdjusted ? 'manual_adjusted' : 'pi_generated', {
    reasons: ['Usable profile generated from a reference-linked match.'],
    blockers: ['PI Verified needs independent (lab / technical-sheet) data or an explicit reviewer approval.'],
    customer_warning_flags: customerWarnings,
    internal_flags,
    red_flags: redFlags,
  });
}
