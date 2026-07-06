/**
 * Pure batch SIMULATION of the ProductIntelligenceResolver over a product set (preview only).
 *
 * For each product it pools same-class candidate references exactly the way a real integration
 * would — through the deterministic `matchProduct` matcher (its composition/EAN/name candidate
 * pool) — then runs the pure `resolveProductIntelligence`. It produces one flat row per product
 * plus outcome summary counts, so a DEV surface can SHOW what the resolver WOULD resolve before
 * any status persistence or live Studio use.
 *
 *   - PURE: no DB, no service, no engine runtime, no IO, no npac. Deterministic.
 *   - NON-MUTATING: reads products + references; changes nothing. Class-derived pac/pod are the
 *     resolver's EPHEMERAL values — surfaced for preview, never written anywhere.
 *   - HONEST: the product's CURRENT mapper_status / lifecycle status are reported unchanged
 *     alongside the (advisory) resolver outcome; the simulation never implies a status change.
 */
import { matchProduct } from './productMatcher';
import {
  resolveProductIntelligence,
  type ProductIntelligenceResolution,
  type ResolverConfidence,
  type ResolverOutcome,
  type ResolverRuleId,
  type ResolverValueBasis,
  type ResolverBlockedClass,
  type ResolverReferenceInput,
} from './productIntelligenceResolver';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { ProductRow, ProductStatus } from './productRow';

export interface ProductIntelligenceSimulationRow {
  product_code: string;
  product_name: string | null;
  product_category: string | null;
  /** CURRENT mapper state — reported unchanged (the simulation never persists). */
  current_mapper_status: string | null;
  current_status: ProductStatus;
  // resolver output (preview)
  outcome: ResolverOutcome;
  value_basis: ResolverValueBasis;
  rule_id: ResolverRuleId | null;
  confidence: ResolverConfidence | null;
  engine_ready: boolean;
  /** ADVISORY only — never persisted by the simulation. */
  recommended_status: ProductStatus;
  basis_reference_ids: string[];
  /** the resolver's EPHEMERAL class-derived values (preview only), or null. */
  derived_pac: number | null;
  derived_pod: number | null;
  warnings: string[];
  blocked_reason: string | null;
  blocked_class: ResolverBlockedClass | null;
  /** size of the candidate pool the matcher surfaced for this product. */
  candidate_count: number;
  /** short, human-facing guidance derived from the outcome. */
  next_action: string;
}

export interface ProductIntelligenceSimulationSummary {
  total: number;
  reference_linked: number;
  pi_calculated: number;
  pi_generated: number;
  blocked: number;
  engine_ready: number;
  /** pi_calculated products that are NOT already a confirmed match — the newly-resolvable set. */
  newly_pi_calculated: number;
  /** pi_generated (label-staged) products that are NOT already matched. */
  label_staged: number;
}

export interface ProductIntelligenceSimulationResult {
  rows: ProductIntelligenceSimulationRow[];
  summary: ProductIntelligenceSimulationSummary;
}

function nextAction(r: ProductIntelligenceResolution, matched: boolean): string {
  switch (r.outcome) {
    case 'reference_linked':
      return r.engine_ready
        ? 'Keep current mapping — reference-linked, engine-ready (no change).'
        : 'Matched, but the reference lacks pac/pod — review the reference.';
    case 'pi_calculated':
      return r.value_basis === 'product_measured'
        ? 'Own measured pac/pod — directly calculable; confirm mapping/status separately.'
        : 'PI Calculated candidate — review class-derived values before any activation (preview only).';
    case 'pi_generated':
      return 'Label staged only — owner calibration (reference proposal) still required for pac/pod.';
    case 'blocked':
    default:
      return r.blocked_class === 'no_safe_class_rule'
        ? `No safe class rule${matched ? '' : ''} — owner decision / reference proposal required.`
        : `Blocked (${r.blocked_class}) — owner calibration / proposal path; stays parked.`;
  }
}

/** Resolve the candidate ids the matcher surfaces for a product into reference rows. */
function candidateReferencesFor(
  product: ProductRow,
  basement: readonly IngredientRow[],
  referenceById: ReadonlyMap<string, IngredientRow>,
): ResolverReferenceInput[] {
  const match = matchProduct(product, basement);
  const ids = new Set<string>(match.candidate_ids ?? []);
  if (match.matched_basement_id) ids.add(match.matched_basement_id);
  if (product.matched_basement_id) ids.add(product.matched_basement_id);
  const refs: ResolverReferenceInput[] = [];
  for (const id of ids) {
    const ref = referenceById.get(id);
    if (ref) refs.push(ref);
  }
  return refs;
}

/**
 * Run the resolver over every product. Pure; writes nothing; never mutates inputs.
 */
export function simulateProductIntelligence(args: {
  products: readonly ProductRow[];
  basement: readonly IngredientRow[];
}): ProductIntelligenceSimulationResult {
  const referenceById = new Map(args.basement.map((r) => [r.ingredient_id, r]));

  const rows: ProductIntelligenceSimulationRow[] = args.products
    .slice()
    .sort((a, b) => a.product_code.localeCompare(b.product_code))
    .map((product) => {
      const matchedReference = product.matched_basement_id
        ? (referenceById.get(product.matched_basement_id) ?? null)
        : null;
      const candidateReferences = candidateReferencesFor(product, args.basement, referenceById);
      const resolution = resolveProductIntelligence({ product, candidateReferences, matchedReference });
      const isMatched = product.mapper_status === 'matched' && !!product.matched_basement_id;

      return {
        product_code: product.product_code,
        product_name: product.product_name_display,
        product_category: product.product_category,
        current_mapper_status: product.mapper_status,
        current_status: product.status,
        outcome: resolution.outcome,
        value_basis: resolution.value_basis,
        rule_id: resolution.rule_id,
        confidence: resolution.confidence,
        engine_ready: resolution.engine_ready,
        recommended_status: resolution.recommended_status,
        basis_reference_ids: resolution.basis_reference_ids,
        derived_pac: resolution.derived?.pac_value ?? null,
        derived_pod: resolution.derived?.pod_value ?? null,
        warnings: resolution.warnings,
        blocked_reason: resolution.blocked_reason,
        blocked_class: resolution.blocked_class,
        candidate_count: candidateReferences.length,
        next_action: nextAction(resolution, isMatched),
      };
    });

  const summary: ProductIntelligenceSimulationSummary = {
    total: rows.length,
    reference_linked: rows.filter((r) => r.outcome === 'reference_linked').length,
    pi_calculated: rows.filter((r) => r.outcome === 'pi_calculated').length,
    pi_generated: rows.filter((r) => r.outcome === 'pi_generated').length,
    blocked: rows.filter((r) => r.outcome === 'blocked').length,
    engine_ready: rows.filter((r) => r.engine_ready).length,
    newly_pi_calculated: rows.filter((r) => r.outcome === 'pi_calculated' && r.current_mapper_status !== 'matched').length,
    label_staged: rows.filter((r) => r.outcome === 'pi_generated' && r.current_mapper_status !== 'matched').length,
  };

  return { rows, summary };
}
