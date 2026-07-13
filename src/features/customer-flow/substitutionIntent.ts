/**
 * Customer substitution intent CONTRACT (Agent B) — a contract only, pure.
 *
 * Captures what a customer asks about an ingredient line:
 *  - "I don't have this"            → `i_dont_have_this`
 *  - "replace this with <X>"        → `replace_with` (+ requestedSubstituteName)
 *  - "why is this here?"            → `why_is_this_here` (an explanation ask)
 *
 * This module ONLY builds the intent. It performs NO recalculation and NO
 * substitution validation. At integration time the intent is mapped onto the
 * canonical engine (via the public `@/engine` barrel) and the existing verified-
 * substitute logic (`validateVerifiedSubstitute`) — neither of which is invoked
 * or imported here, keeping this layer pure and dependency-light.
 */

export type SubstitutionReason = 'i_dont_have_this' | 'replace_with' | 'why_is_this_here';

export const CUSTOMER_SUBSTITUTION_CONTRACT_VERSION = '1.0.0' as const;

export interface CustomerSubstitutionIntent {
  /** The recipe line the request targets. */
  lineId: string;
  ingredientName: string;
  reason: SubstitutionReason;
  /** The substitute the customer named — only meaningful for `replace_with`. */
  requestedSubstituteName?: string;
  contractVersion: typeof CUSTOMER_SUBSTITUTION_CONTRACT_VERSION;
}

export interface BuildSubstitutionIntentArgs {
  lineId: string;
  ingredientName: string;
  reason: SubstitutionReason;
  requestedSubstituteName?: string;
}

/**
 * Build a deterministic substitution intent. A `replace_with` reason keeps the
 * requested substitute name; the other reasons drop it (they carry no target).
 * Pure — no engine call, no validation, no mutation.
 */
export function buildSubstitutionIntent(
  args: BuildSubstitutionIntentArgs,
): CustomerSubstitutionIntent {
  const keepTarget =
    args.reason === 'replace_with' &&
    typeof args.requestedSubstituteName === 'string' &&
    args.requestedSubstituteName.trim() !== '';

  return {
    lineId: args.lineId,
    ingredientName: args.ingredientName,
    reason: args.reason,
    ...(keepTarget ? { requestedSubstituteName: args.requestedSubstituteName!.trim() } : {}),
    contractVersion: CUSTOMER_SUBSTITUTION_CONTRACT_VERSION,
  };
}
