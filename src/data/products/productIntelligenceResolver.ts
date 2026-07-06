/**
 * Pure ProductIntelligenceResolver (Mapper PI Slice 1) — the layer between the reference
 * matcher and the engine handoff that the READ-ONLY audit found missing.
 *
 * It classifies ONE product into exactly one resolver outcome:
 *
 *   • `reference_linked` — confirmed match; engine values link through the reference
 *     (existing behavior, delegated to resolveProductEngineValues / decideProductStatus).
 *     NOTE the documented exception: a red-flagged MATCHED product still resolves
 *     reference_linked (the human-confirmed mapping stands) but its confidence is downgraded
 *     and the flag reasons are surfaced in warnings.
 *   • `pi_calculated`   — engine values are directly calculable: either the product's OWN
 *     measured pac/pod (future lab/technical-sheet path — always wins), or CLASS-ANCHORED
 *     derivation: the product and its anchor reference(s) are the same chemistry class and an
 *     explicit, tested rule derives ephemeral pac/pod from calibrated anchors (owner rule
 *     amendment for this slice).
 *   • `pi_generated`    — a complete LABEL composition is staged as a profile, but engine
 *     values remain UNRESOLVED (never guessed) → NOT engine-ready, owner calibration required.
 *     NOTE: this resolver outcome is NOT the same thing as the products.status value
 *     `pi_generated` (which is the customer label for a confirmed reference-linked mapping).
 *     The disambiguation lives in `value_basis` + `recommended_status`.
 *   • `blocked`         — a hard-blocked chemistry class or no safe rule; exact reason carried.
 *
 * Safety contract (owner rule amendment encoded):
 *   - PURE: no DB, no service, no engine runtime, no IO, no npac. Deterministic.
 *   - Derived values are EPHEMERAL resolution output — never written to products, never
 *     written to mapper_basement, never persisted by this module (it cannot write at all).
 *   - PAC/POD is NEVER guessed from total sugars (or any single label field): `pi_calculated`
 *     values come only from calibrated same-class anchor references or the product's own
 *     measurement; `pi_generated` carries NO engine values at all.
 *   - Hard-blocked classes stay blocked: hydrolysed-lactose dairy (incl. deslactosada /
 *     lactofree spellings), high-intensity sweeteners + polyols (Spanish, English and E-number
 *     vocabulary), protein-fortified, composites/jams/blends, torrefacto, red-flagged products.
 *   - Class rules are guarded on BOTH sides: the PRODUCT must be exclusively its class (a
 *     yogurt/kefir/coffee that merely MENTIONS milk never takes the milk rule; powders,
 *     condensed and evaporated forms never interpolate as liquid milk) and ANCHORS must be
 *     same-class calibrated references (never lactose-free or powdered variants).
 */
import { conceptsFromName, normalizeTokens } from './productNameTiebreak';
import { milkFatLevelFromName } from './productMilkFatBand';
import { blocksAutoVerify, detectRedFlags, type RedFlagInput } from './productRedFlags';
import {
  resolveProductEngineValues,
  type ProductEngineInput,
  type ReferenceEngineValues,
} from './productEngineResolver';
import { decideProductStatus } from './productStatusDecision';
import {
  COMPOSITION_FIELDS,
  MIN_SHARED_COMPOSITION_FIELDS,
  normalizeName,
  toFiniteNumber,
} from './productMatcher';
import type { ProductStatus } from './productRow';

/* ── contract ──────────────────────────────────────────────────────────────── */

export type ResolverOutcome = 'reference_linked' | 'pi_calculated' | 'pi_generated' | 'blocked';

/** Where the resolution's values (if any) come from. */
export type ResolverValueBasis =
  | 'reference_linked'
  | 'product_measured'
  | 'class_derived'
  | 'label_derived'
  | 'none';

export type ResolverConfidence = 'high' | 'medium' | 'low';

export type ResolverBlockedClass =
  | 'lactose_free_dairy'
  | 'sweetener_or_polyol'
  | 'protein_fortified'
  | 'composite_or_blend'
  | 'red_flagged_label'
  | 'torrefacto_coffee'
  | 'no_safe_class_rule';

export type ResolverRuleId =
  | 'reference_link'
  | 'product_measured'
  | 'milk_fat_series_v1'
  | 'greek_yogurt_fat_variant_v1'
  | 'plain_yogurt_class_anchor_v1'
  | 'kefir_fermented_dairy_v1'
  | 'nut_species_label_v1';

/** Ephemeral class-derived engine values — consumed at handoff time only, never persisted. */
export interface ClassDerivedValues {
  pac_value: number;
  pod_value: number;
  method: 'linear_fat_interpolation' | 'class_anchor_adoption';
}

export interface ProductIntelligenceResolution {
  outcome: ResolverOutcome;
  value_basis: ResolverValueBasis;
  /** ADVISORY only — persistence goes through the existing gated status service, never here. */
  recommended_status: ProductStatus;
  /** true only when pac AND pod are available (linked, own-measured, or class-derived). */
  engine_ready: boolean;
  confidence: ResolverConfidence | null;
  rule_id: ResolverRuleId | null;
  basis_reference_ids: string[];
  derived: ClassDerivedValues | null;
  /** Snapshot of the label inputs the rule read — provenance for review surfaces. */
  provenance_inputs: Record<string, number | string | null>;
  warnings: string[];
  blocked_reason: string | null;
  blocked_class: ResolverBlockedClass | null;
}

/** Product shape the resolver reads (structural subset of ProductRow). */
export interface ResolverProductInput extends RedFlagInput, ProductEngineInput {
  product_category?: string | null;
  fat_percent?: number | string | null;
  carbohydrate_percent?: number | string | null;
  protein_percent?: number | string | null;
  salt_percent?: number | string | null;
}

/** Reference shape the resolver reads (structural subset of the basement IngredientRow). */
export interface ResolverReferenceInput extends ReferenceEngineValues {
  ingredient_name_internal?: string | null;
  fat_percent?: number | string | null;
  carbohydrate_percent?: number | string | null;
  total_sugars_percent?: number | string | null;
  protein_percent?: number | string | null;
  salt_percent?: number | string | null;
}

export interface ResolverInput {
  product: ResolverProductInput;
  /** Same-class candidate references the caller pooled (e.g. the matcher's candidate ids, resolved). */
  candidateReferences?: ReadonlyArray<ResolverReferenceInput>;
  /** The row looked up by matched_basement_id, when the product is matched. */
  matchedReference?: ResolverReferenceInput | null;
}

/* ── thresholds (deterministic; named so tests pin them) ───────────────────── */

/** Max mean abs composition distance (pp) for a same-class anchor to be adopted. */
export const SAME_CLASS_ANCHOR_MAX_MEAN_PP = 1.0;
/** Kefir is cross-culture fermented dairy — a tighter anchor distance is required. */
export const KEFIR_ANCHOR_MAX_MEAN_PP = 0.75;
/** Minimum calibrated anchors for the milk fat-series interpolation rule. */
export const MILK_SERIES_MIN_ANCHORS = 2;
/** Max pp of label fat OUTSIDE the anchor fat range before extrapolation is refused. */
export const MILK_SERIES_MAX_EXTRAPOLATION_PP = 1.5;
/** Minimum present label fields (of the 5 matcher composition fields) to stage a label profile. */
export const MIN_LABEL_FIELDS_FOR_GENERATION = 4;

/* ── pure helpers ──────────────────────────────────────────────────────────── */

const productName = (p: ResolverProductInput): string =>
  (p.product_name_display ?? '').trim() !== '' ? (p.product_name_display as string) : (p.product_name_internal ?? '');

const refName = (r: ResolverReferenceInput): string =>
  (r.ingredient_name_display ?? '').trim() !== ''
    ? (r.ingredient_name_display as string)
    : (r.ingredient_name_internal ?? '');

const hasAnyToken = (tokens: string[], set: ReadonlySet<string>): boolean => tokens.some((t) => set.has(t));

const MILK_NAME_TOKENS = new Set(['milk', 'leche']);
const YOGURT_TOKENS = new Set(['yogur', 'yogurt', 'yoghurt', 'yogures']);
const GREEK_TOKENS = new Set(['griego', 'griega', 'greek']);
const KEFIR_TOKENS = new Set(['kefir']);
const POWDER_TOKENS = new Set(['powder', 'powdered', 'polvo']);
const NON_LIQUID_MILK_TOKENS = new Set(['condensada', 'condensado', 'condensed', 'evaporada', 'evaporado', 'evaporated']);
const ALMOND_TOKENS = new Set(['almendra', 'almendras', 'almond', 'almonds']);
const TORREFACTO_TOKENS = new Set(['torrefacto']);
const COMPOSITE_TOKENS = new Set(['mermelada', 'confitura', 'jam', 'marmalade']);
/** Multi-word composite phrases checked on the normalized name ("cacao … a la taza"). */
const COMPOSITE_PHRASES = ['a la taza'];

/** Hydrolysed-lactose spellings — SUBSTRING screened on the normalized name so joined and
 * derived forms ("sinlactosa", "deslactosada", "Lactofree") cannot slip past token matching.
 * ("lactobacilos" does not contain any of these stems — no false positive.) */
const LACTOSE_NAME_SUBSTRINGS = ['lactosa', 'lactose', 'lactofree'];

/** Resolver-local hard-block vocabulary the shared red-flag detector does not cover yet:
 * English polyol/high-intensity spellings, protein spellings, and E-number sweetener codes.
 * (Kept local so this slice does not change the shared detector's live behavior.) */
const EXTRA_SWEETENER_TOKENS = new Set([
  'erythritol',
  'xylitol',
  'mannitol',
  'polyol',
  'polyols',
  'sucralose',
  'aspartame',
  'saccharin',
  'acesulfame',
  'sweetener',
  'sweeteners',
]);
const EXTRA_PROTEIN_TOKENS = new Set(['protein', 'proteins', 'prote']);
/** E9xx additive codes (sweetener range) as standalone tokens, e.g. "e968", "e 955". */
const E_NUMBER_SWEETENER = /(^|[^a-z0-9])e\s?9[5-6]\d($|[^0-9])/;

/** Mean abs per-field composition distance over the matcher's 5 fields (pp). */
function compositionDistance(
  product: ResolverProductInput,
  reference: ResolverReferenceInput,
): { shared: number; mean: number | null } {
  let shared = 0;
  let sum = 0;
  for (const field of COMPOSITION_FIELDS) {
    const pv = toFiniteNumber((product as Record<string, unknown>)[field]);
    const bv = toFiniteNumber((reference as Record<string, unknown>)[field]);
    if (pv === null || bv === null) continue;
    shared += 1;
    sum += Math.abs(pv - bv);
  }
  return { shared, mean: shared > 0 ? sum / shared : null };
}

/** The label composition snapshot carried as provenance. */
function labelSnapshot(product: ResolverProductInput): Record<string, number | string | null> {
  const snapshot: Record<string, number | string | null> = {
    product_name: productName(product) || null,
    product_category: product.product_category ?? null,
  };
  for (const field of COMPOSITION_FIELDS) {
    snapshot[field] = toFiniteNumber((product as Record<string, unknown>)[field]);
  }
  return snapshot;
}

function blocked(
  blocked_class: ResolverBlockedClass,
  blocked_reason: string,
  product: ResolverProductInput,
  warnings: string[] = [],
): ProductIntelligenceResolution {
  return {
    outcome: 'blocked',
    value_basis: 'none',
    recommended_status: 'draft',
    engine_ready: false,
    confidence: null,
    rule_id: null,
    basis_reference_ids: [],
    derived: null,
    provenance_inputs: labelSnapshot(product),
    warnings,
    blocked_reason,
    blocked_class,
  };
}

/** Piecewise-linear interpolation of y over (x, y) anchors; linear extrapolation outside the
 * range. Anchors sharing the same x are deduped (first kept) so no zero-width segment exists. */
function interpolateLinear(anchors: ReadonlyArray<{ x: number; y: number }>, x: number): number {
  const seen = new Set<number>();
  const sorted = [...anchors]
    .sort((a, b) => a.x - b.x)
    .filter((a) => {
      if (seen.has(a.x)) return false;
      seen.add(a.x);
      return true;
    });
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const segment = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
    a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x);
  if (sorted.length === 1) return first.y;
  if (x <= first.x) return segment(first, sorted[1]!);
  if (x >= last.x) return segment(sorted[sorted.length - 2]!, last);
  for (let i = 0; i < sorted.length - 1; i += 1) {
    if (x >= sorted[i]!.x && x <= sorted[i + 1]!.x) return segment(sorted[i]!, sorted[i + 1]!);
  }
  return last.y;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/* ── class rules ───────────────────────────────────────────────────────────── */

interface AnchorPick {
  reference: ResolverReferenceInput;
  id: string;
  pac: number;
  pod: number;
  distance: { shared: number; mean: number | null };
}

/** True when the reference name marks a variant that must never anchor a class rule:
 * lactose-free spellings (hydrolysed sugars) and powdered forms. */
function isForbiddenAnchorName(name: string): boolean {
  const normalized = normalizeName(name);
  if (LACTOSE_NAME_SUBSTRINGS.some((s) => normalized.includes(s))) return true;
  return hasAnyToken(normalizeTokens(name), POWDER_TOKENS);
}

/** Candidates that carry an id + calibrated pac AND pod and are not forbidden variants. */
function calibratedAnchors(candidates: ReadonlyArray<ResolverReferenceInput>): AnchorPick[] {
  const anchors: AnchorPick[] = [];
  for (const reference of candidates) {
    const id = (reference.ingredient_id ?? '').trim();
    const pac = toFiniteNumber(reference.pac_value);
    const pod = toFiniteNumber(reference.pod_value);
    if (id === '' || pac === null || pod === null) continue;
    if (isForbiddenAnchorName(refName(reference))) continue;
    anchors.push({ reference, id, pac, pod, distance: { shared: 0, mean: null } });
  }
  return anchors;
}

/**
 * R1 — milk fat series: interpolate pac/pod along calibrated LIQUID milk anchors by label fat.
 * Product-side guards: the name must denote PLAIN liquid milk and nothing else — any other
 * name concept (yogurt/kefir/greek/coffee/cream/condensed/…) or a powdered/condensed/evaporated
 * form falls through / blocks; the label composition must sit within the same-class distance of
 * the anchor family; extrapolation beyond a small fat margin is refused, as are non-positive
 * derived values.
 */
function milkFatSeriesRule(
  product: ResolverProductInput,
  candidates: ReadonlyArray<ResolverReferenceInput>,
): ProductIntelligenceResolution | null {
  const name = productName(product);
  if (milkFatLevelFromName(name) === null) return null;

  // Exclusively a milk: any other recognized concept means a different class mentions its milk.
  const foreignConcepts = [...conceptsFromName(name)].filter((c) => c !== 'milk');
  if (foreignConcepts.length > 0) return null;

  const tokens = normalizeTokens(name);
  if (hasAnyToken(tokens, POWDER_TOKENS) || hasAnyToken(tokens, NON_LIQUID_MILK_TOKENS)) {
    return blocked(
      'no_safe_class_rule',
      'Powdered / condensed / evaporated milk is a different form than the liquid-milk anchor series — never interpolated; owner calibration required.',
      product,
    );
  }

  const labelFat = toFiniteNumber(product.fat_percent);
  if (labelFat === null) {
    return blocked('no_safe_class_rule', 'Milk fat-series rule needs the label fat_percent — it is missing.', product);
  }

  // Anchors are milk-NAMED liquid refs (powder/lactose already excluded) that ALSO sit within
  // the same-class composition distance of THIS product — so a far milk-named ref (condensed /
  // evaporated / a drink blend) can never pollute the interpolation set, no matter how the
  // caller pooled candidates. Fat differs across the series, so proximity is measured over the
  // 5 fields where a fat gap alone (1 of 5) stays well under the 1.0 pp mean threshold.
  const anchors = calibratedAnchors(candidates)
    .map((a) => ({ ...a, fat: toFiniteNumber(a.reference.fat_percent), distance: compositionDistance(product, a.reference) }))
    .filter((a): a is AnchorPick & { fat: number } => {
      if (a.fat === null) return false;
      if (!hasAnyToken(normalizeTokens(refName(a.reference)), MILK_NAME_TOKENS)) return false;
      return a.distance.shared >= MIN_SHARED_COMPOSITION_FIELDS && (a.distance.mean ?? Infinity) <= SAME_CLASS_ANCHOR_MAX_MEAN_PP;
    });
  const distinctFats = new Set(anchors.map((a) => a.fat));
  if (anchors.length < MILK_SERIES_MIN_ANCHORS || distinctFats.size < MILK_SERIES_MIN_ANCHORS) {
    return blocked(
      'no_safe_class_rule',
      `Milk fat-series rule refused: fewer than ${MILK_SERIES_MIN_ANCHORS} calibrated liquid-milk anchors within ${SAME_CLASS_ANCHOR_MAX_MEAN_PP} pp on ≥${MIN_SHARED_COMPOSITION_FIELDS} shared fields (found ${distinctFats.size} with distinct fat) — not the liquid-milk class, owner calibration required.`,
      product,
    );
  }

  const fats = anchors.map((a) => a.fat);
  const minFat = Math.min(...fats);
  const maxFat = Math.max(...fats);
  const outsideRange = labelFat < minFat || labelFat > maxFat;
  const beyondMargin = labelFat < minFat - MILK_SERIES_MAX_EXTRAPOLATION_PP || labelFat > maxFat + MILK_SERIES_MAX_EXTRAPOLATION_PP;
  if (beyondMargin) {
    return blocked(
      'no_safe_class_rule',
      `Label fat ${labelFat} is more than ${MILK_SERIES_MAX_EXTRAPOLATION_PP} pp outside the calibrated anchor fat range ${minFat}–${maxFat} — extrapolation refused.`,
      product,
    );
  }
  const pac = round2(interpolateLinear(anchors.map((a) => ({ x: a.fat, y: a.pac })), labelFat));
  const pod = round2(interpolateLinear(anchors.map((a) => ({ x: a.fat, y: a.pod })), labelFat));
  if (pac <= 0 || pod <= 0) {
    return blocked(
      'no_safe_class_rule',
      `Interpolated engine values are not physically plausible (pac ${pac}, pod ${pod}) — refused.`,
      product,
    );
  }

  const warnings = [
    `Class-derived engine values: linear pac/pod interpolation over the calibrated milk fat series (${anchors.length} anchors, fat ${minFat}–${maxFat}).`,
    'Ephemeral values — never written to the product; owner may add a dedicated basement reference later.',
  ];
  if (outsideRange) {
    warnings.push(
      `Label fat ${labelFat} lies OUTSIDE the anchor fat range ${minFat}–${maxFat} — values are extrapolated (within the ${MILK_SERIES_MAX_EXTRAPOLATION_PP} pp margin); confidence reduced.`,
    );
  }

  return {
    outcome: 'pi_calculated',
    value_basis: 'class_derived',
    recommended_status: 'pi_calculated',
    engine_ready: true,
    confidence: outsideRange ? 'low' : 'medium',
    rule_id: 'milk_fat_series_v1',
    basis_reference_ids: anchors.map((a) => a.id),
    derived: { pac_value: pac, pod_value: pod, method: 'linear_fat_interpolation' },
    provenance_inputs: labelSnapshot(product),
    warnings,
    blocked_reason: null,
    blocked_class: null,
  };
}

/** Shared shape of the same-class adopt rules (yogurt / greek / kefir). */
function adoptClassAnchor(args: {
  product: ResolverProductInput;
  candidates: ReadonlyArray<ResolverReferenceInput>;
  ruleId: ResolverRuleId;
  anchorNameTokens: ReadonlySet<string>;
  /** Anchors must ALSO carry one of these tokens (e.g. greek anchors must be yogurts). */
  anchorMustAlsoHaveTokens?: ReadonlySet<string>;
  excludeAnchorTokens?: ReadonlySet<string>;
  maxMeanPp: number;
  confidence: ResolverConfidence;
  buildExtraWarnings?: (best: AnchorPick) => string[];
  noAnchorReason: string;
}): ProductIntelligenceResolution {
  const { product, candidates } = args;
  const anchors = calibratedAnchors(candidates)
    .filter((a) => {
      const tokens = normalizeTokens(refName(a.reference));
      if (!hasAnyToken(tokens, args.anchorNameTokens)) return false;
      if (args.anchorMustAlsoHaveTokens && !hasAnyToken(tokens, args.anchorMustAlsoHaveTokens)) return false;
      if (args.excludeAnchorTokens && hasAnyToken(tokens, args.excludeAnchorTokens)) return false;
      return true;
    })
    .map((a) => ({ ...a, distance: compositionDistance(product, a.reference) }))
    .filter((a) => a.distance.shared >= MIN_SHARED_COMPOSITION_FIELDS && a.distance.mean !== null)
    .sort((a, b) => (a.distance.mean ?? Infinity) - (b.distance.mean ?? Infinity));

  const best = anchors[0];
  if (!best || (best.distance.mean ?? Infinity) > args.maxMeanPp) {
    const detail = best
      ? `nearest same-class anchor ${best.id} is ${round2(best.distance.mean ?? 0)} pp away (max ${args.maxMeanPp}).`
      : args.noAnchorReason;
    return blocked('no_safe_class_rule', `${args.ruleId}: ${detail}`, product);
  }

  return {
    outcome: 'pi_calculated',
    value_basis: 'class_derived',
    recommended_status: 'pi_calculated',
    engine_ready: true,
    confidence: args.confidence,
    rule_id: args.ruleId,
    basis_reference_ids: [best.id],
    derived: { pac_value: best.pac, pod_value: best.pod, method: 'class_anchor_adoption' },
    provenance_inputs: labelSnapshot(product),
    warnings: [
      `Class-derived engine values adopted from same-class anchor ${best.id} (${refName(best.reference)}), mean composition distance ${round2(best.distance.mean ?? 0)} pp.`,
      'Ephemeral values — never written to the product; never PI Verified without independent provenance.',
      ...(args.buildExtraWarnings ? args.buildExtraWarnings(best) : []),
    ],
    blocked_reason: null,
    blocked_class: null,
  };
}

/** R6 — species-exact nut label staging (composition only; engine values stay unresolved). */
function nutSpeciesLabelRule(product: ResolverProductInput): ProductIntelligenceResolution {
  const snapshot = labelSnapshot(product);
  const presentFields = COMPOSITION_FIELDS.filter((f) => typeof snapshot[f] === 'number').length;
  if (presentFields < MIN_LABEL_FIELDS_FOR_GENERATION) {
    return blocked(
      'no_safe_class_rule',
      `Label profile needs at least ${MIN_LABEL_FIELDS_FOR_GENERATION} of ${COMPOSITION_FIELDS.length} composition fields — found ${presentFields}.`,
      product,
    );
  }
  return {
    outcome: 'pi_generated',
    value_basis: 'label_derived',
    recommended_status: 'draft',
    engine_ready: false,
    confidence: 'low',
    rule_id: 'nut_species_label_v1',
    basis_reference_ids: [],
    derived: null,
    provenance_inputs: snapshot,
    warnings: [
      'Label composition staged as a profile — species-exact only; values are NEVER adopted from another nut species.',
      'NOT engine-ready: pac/pod remain unresolved and are never guessed from total sugars — owner calibration (reference proposal) required.',
    ],
    blocked_reason: null,
    blocked_class: null,
  };
}

/* ── resolver ──────────────────────────────────────────────────────────────── */

/**
 * Resolve one product's Product-Intelligence outcome. Pure; writes nothing anywhere.
 * The caller supplies candidate references (already pooled) and the matched reference row.
 */
export function resolveProductIntelligence(input: ResolverInput): ProductIntelligenceResolution {
  const product = input.product;
  const candidates = input.candidateReferences ?? [];
  const name = productName(product);
  const tokens = normalizeTokens(name);
  const normalized = ` ${normalizeName(name)} `;
  const screenText = `${normalized} ${normalizeName(product.detected_text ?? '')}`;

  // 1. A confirmed match always resolves reference-linked (existing, unchanged mapping behavior).
  //    Red flags do NOT unlink a human-confirmed mapping, but they downgrade confidence and are
  //    surfaced; own-measured values are labelled with their true provenance.
  if (product.mapper_status === 'matched' && product.matched_basement_id) {
    const resolution = resolveProductEngineValues(product, input.matchedReference ?? null);
    const decision = decideProductStatus({ ...product, reference: input.matchedReference ?? null });
    const ownMeasured = resolution.provenance === 'product_measured';
    // Risk signals on a matched product: shared red flags PLUS the resolver's own hard-block
    // vocabulary (lactose spellings, extended sweetener/protein/E-number screens).
    const risks: string[] = detectRedFlags(product).map((f) => f.reason);
    if (LACTOSE_NAME_SUBSTRINGS.some((s) => normalized.includes(s))) {
      risks.push('Lactose-free / hydrolysed-lactose spelling in the name — engine sugar behavior differs from regular dairy.');
    }
    const matchedScreenTokens = normalizeTokens(screenText);
    if (hasAnyToken(matchedScreenTokens, EXTRA_SWEETENER_TOKENS) || E_NUMBER_SWEETENER.test(screenText)) {
      risks.push('Polyol / high-intensity sweetener vocabulary present.');
    }
    if (hasAnyToken(matchedScreenTokens, EXTRA_PROTEIN_TOKENS)) {
      risks.push('Protein-fortified vocabulary present.');
    }
    const confidence: ResolverConfidence = !resolution.resolvable ? 'low' : risks.length > 0 ? 'medium' : 'high';
    return {
      outcome: 'reference_linked',
      value_basis: ownMeasured ? 'product_measured' : 'reference_linked',
      recommended_status: decision.recommended_status,
      engine_ready: resolution.resolvable,
      confidence,
      rule_id: ownMeasured ? 'product_measured' : 'reference_link',
      basis_reference_ids: ownMeasured ? [] : resolution.basement_id ? [resolution.basement_id] : [product.matched_basement_id],
      derived: null,
      provenance_inputs: labelSnapshot(product),
      warnings: [
        resolution.resolvable ? resolution.reason : `Matched but not engine-ready: ${resolution.reason}`,
        ...risks.map((r) => `Risk signal (confidence downgraded, human-confirmed mapping stands): ${r}`),
      ],
      blocked_reason: null,
      blocked_class: null,
    };
  }

  // 1b. An UNMATCHED product carrying its OWN measured pac/pod (future lab / technical-sheet
  //     path) is directly calculable — measurement wins over any derivation and over the
  //     class screens (it is data, not a guess). Status stays draft until a mapping/status
  //     flow confirms it.
  const measuredPac = toFiniteNumber(product.pac_value);
  const measuredPod = toFiniteNumber(product.pod_value);
  if (measuredPac !== null && measuredPod !== null) {
    return {
      outcome: 'pi_calculated',
      value_basis: 'product_measured',
      recommended_status: 'draft',
      engine_ready: true,
      confidence: 'high',
      rule_id: 'product_measured',
      basis_reference_ids: [],
      derived: null,
      provenance_inputs: labelSnapshot(product),
      warnings: [
        'Product carries its own measured pac/pod — directly calculable; mapping/status confirmation still required before any customer status.',
      ],
      blocked_reason: null,
      blocked_class: null,
    };
  }

  // 2. Hard-blocked classes — safety screen BEFORE any derivation rule.
  if (LACTOSE_NAME_SUBSTRINGS.some((s) => normalized.includes(s))) {
    return blocked(
      'lactose_free_dairy',
      'Hydrolysed lactose (lactose-free dairy): glucose+galactose change freezing-point depression and sweetness while every compared label field stays identical — never class-derived, owner calibration required.',
      product,
    );
  }
  if (hasAnyToken(tokens, TORREFACTO_TOKENS)) {
    return blocked(
      'torrefacto_coffee',
      'Torrefacto roast (sugar-glazed coffee) changes the composition class — never class-derived.',
      product,
    );
  }
  if (hasAnyToken(tokens, COMPOSITE_TOKENS) || COMPOSITE_PHRASES.some((p) => normalized.includes(` ${p} `))) {
    return blocked(
      'composite_or_blend',
      'Composite / mixed product (jam, confitura, "a la taza"…): not a single reference ingredient — needs an owner decision or a dedicated composite reference.',
      product,
    );
  }
  // Resolver-local sweetener/protein vocabulary the shared detector does not cover (EN + E-numbers).
  const screenTokens = normalizeTokens(screenText);
  if (hasAnyToken(screenTokens, EXTRA_SWEETENER_TOKENS) || E_NUMBER_SWEETENER.test(screenText)) {
    return blocked(
      'sweetener_or_polyol',
      'Polyol / high-intensity sweetener vocabulary detected (extended EN/E-number screen) — hard-blocked from class-anchored derivation.',
      product,
    );
  }
  if (hasAnyToken(screenTokens, EXTRA_PROTEIN_TOKENS)) {
    return blocked(
      'protein_fortified',
      'Protein-fortified vocabulary detected (extended screen) — hard-blocked from class-anchored derivation.',
      product,
    );
  }
  const redFlags = detectRedFlags(product);
  if (blocksAutoVerify(redFlags)) {
    const codes = redFlags.map((f) => f.code);
    const blockedClass: ResolverBlockedClass = codes.includes('sweetener_or_polyol')
      ? 'sweetener_or_polyol'
      : codes.includes('protein_fortified')
        ? 'protein_fortified'
        : codes.includes('proprietary_blend')
          ? 'composite_or_blend'
          : 'red_flagged_label';
    return blocked(
      blockedClass,
      `Red-flagged product (${codes.join(', ')}) — hard-blocked from class-anchored derivation; human review / owner calibration required.`,
      product,
      redFlags.map((f) => f.reason),
    );
  }

  // 3. Safe class rules — fermented/cultured dairy FIRST so a yogurt/kefir that merely
  //    mentions its milk ("elaborado con leche entera") never takes the milk rule.
  if (hasAnyToken(tokens, KEFIR_TOKENS)) {
    return adoptClassAnchor({
      product,
      candidates,
      ruleId: 'kefir_fermented_dairy_v1',
      anchorNameTokens: new Set([...YOGURT_TOKENS, ...KEFIR_TOKENS]),
      maxMeanPp: KEFIR_ANCHOR_MAX_MEAN_PP,
      confidence: 'low',
      buildExtraWarnings: () => [
        'FERMENTATION WARNING: kefir grains ≠ yogurt cultures — the residual-sugar split differs; team confirmation of the fermentation profile is still wanted.',
      ],
      noAnchorReason: 'no calibrated fermented-dairy anchor available.',
    });
  }

  if (hasAnyToken(tokens, YOGURT_TOKENS) && hasAnyToken(tokens, GREEK_TOKENS)) {
    return adoptClassAnchor({
      product,
      candidates,
      ruleId: 'greek_yogurt_fat_variant_v1',
      anchorNameTokens: GREEK_TOKENS,
      anchorMustAlsoHaveTokens: YOGURT_TOKENS, // a greek-named non-yogurt is never an anchor
      maxMeanPp: SAME_CLASS_ANCHOR_MAX_MEAN_PP,
      confidence: 'medium',
      buildExtraWarnings: (best) => {
        const anchorFat = toFiniteNumber(best.reference.fat_percent);
        const labelFat = toFiniteNumber(product.fat_percent);
        const detail =
          anchorFat !== null && labelFat !== null
            ? `anchor fat ${anchorFat}% vs label fat ${labelFat}%`
            : 'anchor and label fat differ';
        return [
          `Fat-variant mismatch (${detail}) — composition fat differs from the anchor profile; the owner may add a dedicated basement fat-variant later.`,
        ];
      },
      noAnchorReason: 'no calibrated greek-yogurt anchor available.',
    });
  }

  if (hasAnyToken(tokens, YOGURT_TOKENS)) {
    return adoptClassAnchor({
      product,
      candidates,
      ruleId: 'plain_yogurt_class_anchor_v1',
      anchorNameTokens: YOGURT_TOKENS,
      excludeAnchorTokens: GREEK_TOKENS,
      maxMeanPp: SAME_CLASS_ANCHOR_MAX_MEAN_PP,
      confidence: 'medium',
      noAnchorReason: 'no calibrated same-class yogurt anchor available (milks/condensed milk are never yogurt anchors).',
    });
  }

  const milk = milkFatSeriesRule(product, candidates);
  if (milk !== null) return milk;

  if (hasAnyToken(tokens, ALMOND_TOKENS)) {
    return nutSpeciesLabelRule(product);
  }

  // 4. No safe rule → blocked with the exact reason.
  return blocked(
    'no_safe_class_rule',
    'No safe class-anchored rule applies to this product class — owner calibration / reference proposal required.',
    product,
  );
}
