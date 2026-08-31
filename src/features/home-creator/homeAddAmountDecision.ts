/**
 * §B — the zero-gram add flow, owner-locked 2026-08-31.
 *
 * PURE decision. It answers one question about a product the customer just picked:
 * may the existing Crown authority determine this amount, or must we ask?
 *
 *   Crown-capable      → add through the existing Crown flow. No manual grams means
 *                        Crown semantics; if the customer later sets grams, those become
 *                        the user-held amount and the Engine works around them.
 *   NOT Crown-capable  → ask „Ile chcesz dodać <product>?" BEFORE the line exists.
 *
 * A 0 g line is never created, no fake 1 g is persisted, no amount is invented and no
 * second solver is introduced: the customer's confirmed number is the only new input,
 * and the canonical Engine calculates around it exactly as it always has.
 *
 * The minimum-positive rule for a REAL line is unchanged — we simply stop creating the
 * invalid line first and then reporting it back as an error.
 */
import { resolveMainCapability } from '@/features/product-intelligence/mainCapability';
import { productRecommendedDosageInfo } from '@/features/product-intelligence/productDosageAuthority';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';

export type HomeAddAmountDecision =
  | { readonly kind: 'crown_decides' }
  | { readonly kind: 'ask_amount'; readonly recommendedDose: string | null }
  /**
   * No trustworthy current authority. Owner ruling, 2026-08-31: this must NOT become a
   * backdoor for creating a line with guessed semantics. We guess neither Crown nor
   * non-Crown — the canonical product-authority refusal applies and no line is created.
   */
  | { readonly kind: 'unresolved_authority' };

/**
 * `snapshotRequired` is deliberately true: without a resolved snapshot the capability
 * authority answers MAIN_UNKNOWN, and an unknown product must reach the refusal rather
 * than either flow.
 *
 * In practice the picker refuses first — it resolves ProductBehavior before `onAdd` and
 * never calls back for a product it cannot confirm — so `unresolved_authority` is the
 * belt-and-braces guard behind that, not the primary path.
 */
export function decideAddAmount(
  snapshot: ProductBehaviorSnapshot | null | undefined,
  presentDose: (snapshot: ProductBehaviorSnapshot | null | undefined) => string,
): HomeAddAmountDecision {
  const capability = resolveMainCapability({ snapshot, snapshotRequired: true });
  if (capability.state === 'MAIN_CAPABLE' || capability.state === 'MAIN_CAPABLE_UNCALIBRATED') {
    return { kind: 'crown_decides' };
  }
  // Only a product whose authority is CURRENT and says Crown cannot carry it may be
  // asked for a manual amount. Unknown is not a quiet synonym for non-Crown.
  if (capability.state !== 'MAIN_TECHNICAL_BLOCKED') {
    return { kind: 'unresolved_authority' };
  }
  // Show a range ONLY when the canonical dosage authority actually carries one. HOME
  // never invents a range, and never converts a percent into grams on its own.
  const hasCanonicalDose = productRecommendedDosageInfo(snapshot) !== null;
  return {
    kind: 'ask_amount',
    recommendedDose: hasCanonicalDose ? presentDose(snapshot) : null,
  };
}

/** A confirmed amount must be a real, positive number of grams. */
export function isConfirmableAmount(raw: string): boolean {
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) && value > 0;
}

export function confirmedGrams(raw: string): number {
  return Number(raw.replace(',', '.'));
}
