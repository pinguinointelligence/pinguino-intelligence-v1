/**
 * Ingredient Resolution — the ENGINE-READINESS GATE (pure).
 *
 * After a customer picks (or scans/adds) a product for a requirement line, this gate
 * decides whether the line may be marked RESOLVED for exact calculation. It composes the
 * EXISTING, reused product intelligence — it invents nothing:
 *
 *   • `resolveProductEngineValues` (own-measured pac/pod win, else a confirmed reference
 *     link; unknown stays null — never guessed);
 *   • `decideProductStatus` (the customer status policy: red flags block, PI Verified is
 *     never auto-granted).
 *
 * "Ready for exact" is the conservative AND: engine values are resolvable AND there are no
 * blocking red flags. Anything else (needs-review, missing pac/pod, red-flagged) keeps the
 * line UNRESOLVED and surfaces the single honest Polish message.
 */
import {
  resolveProductEngineValues,
  type ProductEngineInput,
  type ReferenceEngineValues,
  type EngineValueProvenance,
} from '@/data/products/productEngineResolver';
import { decideProductStatus, type StatusDecision } from '@/data/products/productStatusDecision';
import type { RedFlagInput } from '@/data/products/productRedFlags';
import { NOT_ENGINE_READY_MESSAGE } from './contracts';

/** The fields the gate reads off a product (a structural subset of ProductRow). */
export interface ReadinessProductInput extends ProductEngineInput, RedFlagInput {}

export interface ProductReadiness {
  /** true ONLY when engine values are resolvable AND no red flag blocks the product. */
  readyForExact: boolean;
  pac_value: number | null;
  pod_value: number | null;
  provenance: EngineValueProvenance;
  /** true unless the product carried its OWN measured values (UI must warn). */
  not_independently_measured: boolean;
  /** the EXISTING status policy decision (customer_label, blockers, red flags). */
  decision: StatusDecision;
  /** the single honest Polish message when NOT ready, else null. */
  message: string | null;
  /** internal (never customer-facing) reasons the product is not exact-ready. */
  blockers: string[];
}

/**
 * Evaluate one picked product's readiness for exact calculation. `reference` is the matched
 * `mapper_basement` row the caller looked up by the product's `matched_basement_id` (or null).
 * Pure; writes nothing; never mutates the product or the reference.
 */
export function evaluateProductReadiness(
  product: ReadinessProductInput,
  reference: ReferenceEngineValues | null,
): ProductReadiness {
  const resolution = resolveProductEngineValues(product, reference);
  const decision = decideProductStatus({ ...product, reference });
  const hasRedFlag = decision.red_flags.length > 0;
  const readyForExact = resolution.resolvable && !hasRedFlag;

  const blockers: string[] = [];
  if (!resolution.resolvable) blockers.push(resolution.reason);
  if (hasRedFlag) blockers.push(...decision.blockers);

  return {
    readyForExact,
    pac_value: resolution.pac_value,
    pod_value: resolution.pod_value,
    provenance: resolution.provenance,
    not_independently_measured: resolution.not_independently_measured,
    decision,
    message: readyForExact ? null : NOT_ENGINE_READY_MESSAGE,
    blockers,
  };
}
