/**
 * Pure engine-handoff resolver for PRODUCTS (read-only).
 *
 * A "matched" product is *mapping confirmed*, NOT engine-ready: its own pac_value/pod_value
 * stay NULL (we have no independent measurement of the product). This resolver computes the
 * engine values a product WOULD use at recipe handoff by LINKING THROUGH its
 * matched_basement_id to the locked reference ingredient — without ever copying anything
 * onto the product row.
 *
 *   - PURE: no DB, no service, no engine, no IO. The caller supplies the product + the
 *     already-looked-up matched reference row (or null). Deterministic.
 *   - NON-MUTATING: returns a resolution object; never writes the product or the reference
 *     base. No npac_value. NEVER computes pac/pod from total_sugars (that would be a guess).
 *   - HONEST PROVENANCE: a reference-linked result is explicitly marked
 *     `not_independently_measured` so UI + engine handoff can warn that the values come from
 *     the matched reference, not a lab measurement of THIS product. If a product ever carries
 *     its OWN measured pac/pod (future technical-sheet / lab path), those win.
 *   - GATED: only a `mapper_status === 'matched'` product resolves via the reference link —
 *     needs_review / ambiguous / rejected / unmapped never hand off (Mapper must confirm first).
 */
import { toFiniteNumber } from '@/data/products/productMatcher';

export type EngineValueProvenance = 'product_measured' | 'reference_linked' | 'unresolved';

export interface ProductEngineResolution {
  /** true when pac AND pod are available (own measurement or a confirmed reference link). */
  resolvable: boolean;
  pac_value: number | null;
  pod_value: number | null;
  provenance: EngineValueProvenance;
  /** The reference id the values were linked from, if any. */
  basement_id: string | null;
  /** true unless the product carried its OWN measured values — UI must warn on this. */
  not_independently_measured: boolean;
  reason: string;
}

/** Minimal product shape the resolver reads (a structural subset of ProductRow). */
export interface ProductEngineInput {
  pac_value?: number | string | null;
  pod_value?: number | string | null;
  mapper_status?: string | null;
  matched_basement_id?: string | null;
}

/** Minimal reference shape (a structural subset of the matched mapper_basement IngredientRow). */
export interface ReferenceEngineValues {
  ingredient_id?: string | null;
  ingredient_name_display?: string | null;
  pac_value?: number | string | null;
  pod_value?: number | string | null;
}

function unresolved(reason: string): ProductEngineResolution {
  return {
    resolvable: false,
    pac_value: null,
    pod_value: null,
    provenance: 'unresolved',
    basement_id: null,
    not_independently_measured: true,
    reason,
  };
}

/**
 * Resolve the engine pac/pod for one product at handoff time. `reference` is the row the
 * caller looked up by `product.matched_basement_id` (or null if not matched / not found).
 * Returns an honest, non-mutating resolution — the product row is never changed.
 */
export function resolveProductEngineValues(
  product: ProductEngineInput,
  reference: ReferenceEngineValues | null,
): ProductEngineResolution {
  // 1. A product's OWN measured values always win (future lab / technical-sheet path).
  const ownPac = toFiniteNumber(product.pac_value);
  const ownPod = toFiniteNumber(product.pod_value);
  if (ownPac !== null && ownPod !== null) {
    return {
      resolvable: true,
      pac_value: ownPac,
      pod_value: ownPod,
      provenance: 'product_measured',
      basement_id: null,
      not_independently_measured: false,
      reason: 'Product carries its own measured pac/pod.',
    };
  }

  // 2. Otherwise only a CONFIRMED match may hand off via the reference link.
  if (product.mapper_status !== 'matched') {
    return unresolved(
      `Not engine-ready: mapper_status is "${product.mapper_status ?? 'null'}" — Mapper must confirm a match first.`,
    );
  }
  if (!product.matched_basement_id) {
    return unresolved('Matched but no matched_basement_id — cannot link engine values.');
  }
  if (!reference) {
    return unresolved(`Reference ${product.matched_basement_id} not found in the engine-approved base.`);
  }
  const refPac = toFiniteNumber(reference.pac_value);
  const refPod = toFiniteNumber(reference.pod_value);
  if (refPac === null || refPod === null) {
    return unresolved(`Reference ${product.matched_basement_id} lacks pac/pod — cannot link engine values.`);
  }

  const name = reference.ingredient_name_display ? ` (${reference.ingredient_name_display})` : '';
  return {
    resolvable: true,
    pac_value: refPac,
    pod_value: refPod,
    provenance: 'reference_linked',
    basement_id: product.matched_basement_id,
    not_independently_measured: true,
    reason: `Engine values linked from reference ${product.matched_basement_id}${name}; NOT an independent measurement of this product.`,
  };
}
