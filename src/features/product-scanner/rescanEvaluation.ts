/**
 * WHAT A REPEAT SCAN OF A KNOWN CODE OWES THE CUSTOMER — pure, no SDK, no Deno, no React.
 *
 * OWNER CONTRACT 2026-09-07:
 *   „Ponowny skan istniejącego PM nie może kończyć się natychmiastowym zwrotem starego PM. Musi
 *    ponownie ocenić produkt na aktualnym evidence i, jeśli spełnia warunki, awansować go do
 *    PR-ING bez duplikatu."
 *
 * `product-scan-analyze` answers a rescan from `exactProductForBarcode` and returns the stored
 * row with `visionCalls: 0, webCalls: 0, estimatedCostUsd: 0`. That path is CORRECT and stays —
 * it is what makes a rescan free, and a paid-call contract test pins it. What was missing is the
 * consequence: a product saved earlier with weaker evidence was handed back unchanged for ever,
 * because the evaluation that could promote it was never reached a second time.
 *
 * WHAT IS RE-RUN AND WHAT IS REUSED. The evidence is reused verbatim: the label photographs were
 * already read, the source lookup already happened, and both are frozen in the product's current
 * version. Re-acquiring them would spend a vision call and a web call to learn nothing. What is
 * re-run is the DERIVATION — recognition, the Mapper, the rescue pools, the behaviour
 * classification, the readiness assessment and the routing verdict — because those are what
 * improved since the product was saved, and every one of them is free. So a rescan re-evaluates
 * at exactly the cost of a rescan today: nothing.
 *
 * WHICH PRODUCTS. Only the caller's own private product. A shared PR is already the strongest
 * thing an EAN can be, and a Mapper reference (PI base) is not a customer product at all — for
 * both, a rescan has nothing to promote and must stay the instant answer it is now.
 */

/** `products.product_kind`, as the scanner sees it on an exact match. */
export type ExactProductKind =
  | 'customer_provisional'
  | 'commercial_product'
  | 'mapper_reference'
  | (string & {});

export interface RescanReevaluationPlan {
  /**
   * Re-seed this scan session from the product's stored evidence and let the normal finalize
   * authority re-derive the verdict. Never true for a product a rescan cannot improve.
   */
  reevaluate: boolean;
  /** Why, in one internal token. Diagnostics only — never customer copy. */
  reason:
    | 'private_product_may_be_promoted'
    | 'already_shared_registry_product'
    | 'mapper_reference_not_a_customer_product'
    | 'unknown_product_kind';
}

/**
 * `exactProductForBarcode` has already established that a `customer_provisional` row belongs to
 * the caller (an unlinked account never reaches the exact path at all), so the kind alone decides.
 */
export function rescanReevaluationPlan(input: {
  productKind: ExactProductKind | null | undefined;
}): RescanReevaluationPlan {
  switch (input.productKind) {
    case 'customer_provisional':
      return { reevaluate: true, reason: 'private_product_may_be_promoted' };
    case 'commercial_product':
      return { reevaluate: false, reason: 'already_shared_registry_product' };
    case 'mapper_reference':
      return { reevaluate: false, reason: 'mapper_reference_not_a_customer_product' };
    default:
      return { reevaluate: false, reason: 'unknown_product_kind' };
  }
}

/**
 * The keys `gellatti_upsert_customer_added_product_v1` ADDS to a scan result when it builds a
 * product version: `v_facts := p_scan_result || jsonb_build_object(...)`. Removing exactly these
 * turns a stored version's facts back into the scan result the session originally held, which is
 * what a re-seeded session must contain — `product-scan-finalize` compares the session's
 * `result_json` against what it passes to the routing RPC, so a session seeded with derived keys
 * would round-trip them into the next version and grow the row on every rescan.
 */
export const DERIVED_FACT_KEYS: readonly string[] = [
  'technicalComposition',
  'productAccuracy',
  'productAccuracyAssessment',
  'allergenEvidenceStatus',
  'ingredientsEvidenceStatus',
  'productIntelligence',
  'missingFields',
  'invalidFields',
];

/** The original scan result carried inside a stored product version's `facts`. */
export function scanResultFromStoredFacts(facts: unknown): Record<string, unknown> | null {
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) return null;
  const source = facts as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (DERIVED_FACT_KEYS.includes(key)) continue;
    result[key] = value;
  }
  // A version whose facts carry no scan evidence at all cannot re-seed anything; the caller must
  // fall back to the plain instant answer rather than seed an empty session.
  return Object.keys(result).length > 0 ? result : null;
}
