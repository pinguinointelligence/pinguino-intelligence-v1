/**
 * Pure GATED activation PLANNER for PI Calculated (class-derived) products.
 *
 * This is the "live-wiring preview": it builds — for OWNER-APPROVED product codes only — exactly
 * what the future activation slice would need, WITHOUT executing anything:
 *   • the `class_derived` EngineIngredient that would slot into
 *     productEngineLibrary / prepareProductEngineIngredient (composition borrowed from the
 *     representative same-class anchor; pac/pod are the resolver's class-derived values),
 *   • the Studio provenance label,
 *   • the guarded status-update PLAN (target `pi_calculated` via `setProductLifecycleStatus`),
 *   • the `review_notes` provenance string (rule_id + basis refs + confidence + warnings),
 *   • proof that the product row's own pac/pod stay NULL.
 *
 * Safety contract:
 *   - PURE: no DB, no service, no engine runtime, no IO, no npac. Deterministic. Writes nothing.
 *   - GATED: a plan is `approved` ONLY when the product code is in the explicit allowlist
 *     `APPROVED_PI_CALCULATED_CODES`, which is EMPTY by default — so NOTHING is ever marked for
 *     activation until an owner populates it (in the real, separately-gated activation slice).
 *   - NON-MUTATING: the class-derived pac/pod live ONLY on the ephemeral EngineIngredient built
 *     here; `product_pac_after` / `product_pod_after` are always null — the product row is never
 *     written, and `mapper_basement` is never touched.
 */
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { EngineIngredient } from '@/engine';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { ProductRow } from './productRow';
import { matchProduct, toFiniteNumber } from './productMatcher';
import {
  resolveProductIntelligence,
  type ProductIntelligenceResolution,
  type ResolverConfidence,
  type ResolverReferenceInput,
  type ResolverRuleId,
} from './productIntelligenceResolver';

/**
 * OWNER-APPROVED PI Calculated product codes — the explicit activation gate.
 * EMPTY by default: no product is approved until the owner ticks the checklist in
 * docs/mapper/PI_CALCULATED_OWNER_REVIEW.md and the real activation slice populates this list.
 * Populating it here alone still does NOTHING live — it only flips `approved` in the preview.
 */
export const APPROVED_PI_CALCULATED_CODES: readonly string[] = [];

/** The single Studio provenance label for a class-derived PI Calculated product. */
export const CLASS_DERIVED_PROVENANCE_LABEL =
  'PI Calculated · class-derived · not independently measured';

export interface ClassDerivedStatusUpdatePlan {
  /** the products.id to update, when a full ProductRow is available. */
  product_id: string;
  /** the ONLY status this plan ever targets. */
  target_status: 'pi_calculated';
  /** the ONLY service the real slice may call to persist it. */
  service: 'setProductLifecycleStatus';
  /** the provenance string written into products.review_notes (no other column). */
  review_notes: string;
  /** reviewer attribution for the audit (a fixed activation actor, not a uuid). */
  reviewed_by: 'pi-calculated-activation';
}

export interface ClassDerivedActivationPlan {
  product_code: string;
  product_name: string | null;
  /** true ONLY when the code is in APPROVED_PI_CALCULATED_CODES (empty by default). */
  approved: boolean;
  rule_id: ResolverRuleId | null;
  confidence: ResolverConfidence | null;
  /** the pac/pod-basis references (the resolver's basis_reference_ids). */
  pacpod_basis_reference_ids: string[];
  /** the single reference whose COMPOSITION is borrowed (nearest-fat anchor). */
  composition_basis_reference_id: string;
  /** the ephemeral class-derived engine values (never written to the product). */
  derived_pac: number;
  derived_pod: number;
  /** the EngineIngredient the class_derived branch would produce at handoff. */
  engine_ingredient: EngineIngredient;
  provenance_label: string;
  status_update: ClassDerivedStatusUpdatePlan;
  /** PROOF: the product row's own engine columns stay NULL. Always null by construction. */
  product_pac_after: null;
  product_pod_after: null;
  warnings: string[];
}

export type ClassDerivedActivationResult =
  | { planned: true; plan: ClassDerivedActivationPlan }
  | { planned: false; reason: string };

/** Format the provenance line written into products.review_notes (and nowhere else). */
export function formatClassDerivedReviewNotes(args: {
  rule_id: ResolverRuleId | null;
  confidence: ResolverConfidence | null;
  composition_basis_reference_id: string;
  pacpod_basis_reference_ids: string[];
  derived_pac: number;
  derived_pod: number;
  warnings: string[];
}): string {
  const parts = [
    'PI Calculated (class-derived)',
    `rule=${args.rule_id ?? 'unknown'}`,
    `confidence=${args.confidence ?? 'unknown'}`,
    `composition_basis=${args.composition_basis_reference_id}`,
    `pacpod_basis=${args.pacpod_basis_reference_ids.join('/') || 'none'}`,
    `pac=${args.derived_pac} pod=${args.derived_pod} (ephemeral — not written to product)`,
  ];
  if (args.warnings.length > 0) parts.push(`warnings: ${args.warnings.join(' | ')}`);
  return parts.join(' · ');
}

/**
 * Build the class_derived EngineIngredient — the exact branch that would slot into
 * prepareProductEngineIngredient. Composition is borrowed from the representative same-class
 * anchor; pac/pod are OVERRIDDEN with the class-derived values; identity is the product's; the
 * ingredient is unverified + external-sourced (never claims independent measurement).
 */
export function buildClassDerivedEngineIngredient(args: {
  product: { product_code: string; product_name_display?: string | null };
  compositionBasis: IngredientRow;
  derived: { pac_value: number; pod_value: number };
}): EngineIngredient {
  const base = ingredientRowToEngineIngredient(args.compositionBasis);
  return {
    ...base,
    id: args.product.product_code.trim() || base.id,
    name: (args.product.product_name_display && args.product.product_name_display.trim()) || base.name,
    pac_value: args.derived.pac_value,
    pod_value: args.derived.pod_value,
    source_type: 'external_db',
    is_verified: false,
    confidence_score: 0,
  };
}

/** Pick the composition-basis anchor: the basis reference whose fat is nearest the product's. */
function pickCompositionBasis(
  product: ProductRow,
  basisReferences: IngredientRow[],
): IngredientRow | null {
  if (basisReferences.length === 0) return null;
  const productFat = toFiniteNumber(product.fat_percent);
  if (productFat === null) return basisReferences[0]!;
  return basisReferences.reduce((best, ref) => {
    const bestFat = toFiniteNumber(best.fat_percent);
    const refFat = toFiniteNumber(ref.fat_percent);
    if (refFat === null) return best;
    if (bestFat === null) return ref;
    return Math.abs(refFat - productFat) < Math.abs(bestFat - productFat) ? ref : best;
  }, basisReferences[0]!);
}

/**
 * Plan the class-derived activation for ONE product. Returns `{ planned: false }` unless the
 * resolution is a class-derived PI Calculated with usable derived values and resolvable basis
 * references. `approved` reflects the allowlist gate (empty by default → false). Writes nothing.
 */
export function planClassDerivedActivation(args: {
  product: ProductRow;
  resolution: ProductIntelligenceResolution;
  referenceById: ReadonlyMap<string, IngredientRow>;
  approvedCodes?: ReadonlySet<string>;
}): ClassDerivedActivationResult {
  const { product, resolution } = args;
  if (resolution.outcome !== 'pi_calculated' || resolution.value_basis !== 'class_derived') {
    return { planned: false, reason: `not a class-derived PI Calculated (outcome=${resolution.outcome}, basis=${resolution.value_basis}).` };
  }
  if (!resolution.derived) {
    return { planned: false, reason: 'no derived pac/pod on the resolution.' };
  }
  const basisReferences = resolution.basis_reference_ids
    .map((id) => args.referenceById.get(id))
    .filter((r): r is IngredientRow => r !== undefined);
  const compositionBasis = pickCompositionBasis(product, basisReferences);
  if (!compositionBasis) {
    return { planned: false, reason: 'no basis reference row available to borrow composition from.' };
  }

  const approvedCodes = args.approvedCodes ?? new Set(APPROVED_PI_CALCULATED_CODES);
  const derived = { pac_value: resolution.derived.pac_value, pod_value: resolution.derived.pod_value };
  const review_notes = formatClassDerivedReviewNotes({
    rule_id: resolution.rule_id,
    confidence: resolution.confidence,
    composition_basis_reference_id: compositionBasis.ingredient_id,
    pacpod_basis_reference_ids: resolution.basis_reference_ids,
    derived_pac: derived.pac_value,
    derived_pod: derived.pod_value,
    warnings: resolution.warnings,
  });

  return {
    planned: true,
    plan: {
      product_code: product.product_code,
      product_name: product.product_name_display,
      approved: approvedCodes.has(product.product_code),
      rule_id: resolution.rule_id,
      confidence: resolution.confidence,
      pacpod_basis_reference_ids: resolution.basis_reference_ids,
      composition_basis_reference_id: compositionBasis.ingredient_id,
      derived_pac: derived.pac_value,
      derived_pod: derived.pod_value,
      engine_ingredient: buildClassDerivedEngineIngredient({ product, compositionBasis, derived }),
      provenance_label: CLASS_DERIVED_PROVENANCE_LABEL,
      status_update: {
        product_id: product.id,
        target_status: 'pi_calculated',
        service: 'setProductLifecycleStatus',
        review_notes,
        reviewed_by: 'pi-calculated-activation',
      },
      product_pac_after: null,
      product_pod_after: null,
      warnings: resolution.warnings,
    },
  };
}

export interface ClassDerivedActivationBatch {
  /** every class-derived PI Calculated candidate's plan (preview — regardless of approval). */
  plans: ClassDerivedActivationPlan[];
  /** the subset that is APPROVED (in the allowlist) — what the real slice would activate. */
  approvedPlans: ClassDerivedActivationPlan[];
  /** the approval allowlist actually applied (empty by default). */
  approvedCodes: string[];
}

/**
 * Batch: build class-derived activation plans for a product set. Pools candidate references
 * through the deterministic matcher (identical to the simulation), runs the resolver, and plans
 * every class-derived PI Calculated candidate. Pure; writes nothing. With the default empty
 * allowlist, `approvedPlans` is empty — nothing is marked for activation.
 */
export function planClassDerivedActivations(args: {
  products: readonly ProductRow[];
  basement: readonly IngredientRow[];
  approvedCodes?: ReadonlySet<string>;
}): ClassDerivedActivationBatch {
  const referenceById = new Map(args.basement.map((r) => [r.ingredient_id, r]));
  const approvedCodes = args.approvedCodes ?? new Set(APPROVED_PI_CALCULATED_CODES);

  const plans: ClassDerivedActivationPlan[] = [];
  for (const product of [...args.products].sort((a, b) => a.product_code.localeCompare(b.product_code))) {
    const match = matchProduct(product, args.basement);
    const ids = new Set<string>(match.candidate_ids ?? []);
    if (match.matched_basement_id) ids.add(match.matched_basement_id);
    if (product.matched_basement_id) ids.add(product.matched_basement_id);
    const candidateReferences: ResolverReferenceInput[] = [];
    for (const id of ids) {
      const ref = referenceById.get(id);
      if (ref) candidateReferences.push(ref);
    }
    const matchedReference = product.matched_basement_id
      ? (referenceById.get(product.matched_basement_id) ?? null)
      : null;
    const resolution = resolveProductIntelligence({ product, candidateReferences, matchedReference });
    const result = planClassDerivedActivation({ product, resolution, referenceById, approvedCodes });
    if (result.planned) plans.push(result.plan);
  }

  return {
    plans,
    approvedPlans: plans.filter((p) => p.approved),
    approvedCodes: [...approvedCodes],
  };
}
