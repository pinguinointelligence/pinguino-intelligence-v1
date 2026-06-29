/**
 * Pure INTERNAL confidence-scoring module for products. Produces a set of 0..1 component
 * scores + an overall score + a hard `blocks_auto_verify` gate. These are INTERNAL ONLY —
 * never shown to customers as percentages (the `internal_only` marker makes that explicit).
 *
 *   - PURE: composes detectRedFlags + resolveProductEngineValues + mapDatasetCategory (all
 *     pure). No DB, no service, no engine runtime, no IO. Deterministic. No npac_value.
 *   - HONEST: unknown data scores LOW, never fake-high. Reference-linked pac/pod scores
 *     lower than an independent measurement. Red flags add a risk penalty AND block
 *     auto-verify outright.
 */
import { mapDatasetCategory } from '@/data/ingredients/categoryMapping';
import { blocksAutoVerify, detectRedFlags, type RedFlagInput } from './productRedFlags';
import { resolveProductEngineValues, type ProductEngineInput, type ReferenceEngineValues } from './productEngineResolver';
import { toFiniteNumber } from './productMatcher';

export interface ConfidenceInput extends RedFlagInput, ProductEngineInput {
  brand?: string | null;
  ean_code?: string | null;
  barcode?: string | null;
  product_category?: string | null;
  fat_percent?: number | string | null;
  saturated_fat_percent?: number | string | null;
  milk_fat_percent?: number | string | null;
  carbohydrate_percent?: number | string | null;
  protein_percent?: number | string | null;
  salt_percent?: number | string | null;
  sucrose_percent?: number | string | null;
  dextrose_percent?: number | string | null;
  glucose_percent?: number | string | null;
  fructose_percent?: number | string | null;
  lactose_percent?: number | string | null;
  match_confidence?: string | null;
  /** the matched basement reference (looked up by caller), for pac/pod resolution. */
  reference?: ReferenceEngineValues | null;
}

export interface ConfidenceScore {
  identity_confidence: number;
  category_confidence: number;
  nutrition_confidence: number;
  ingredient_text_confidence: number;
  sugar_profile_confidence: number;
  fat_profile_confidence: number;
  similarity_confidence: number;
  source_confidence: number;
  pac_pod_confidence: number;
  risk_penalty: number;
  overall_confidence_score: number;
  /** Any red flag → auto-verify is blocked regardless of the numeric score. */
  blocks_auto_verify: boolean;
  /** These scores are INTERNAL — never render them as customer-facing percentages. */
  internal_only: true;
  notes: string[];
}

const hasNum = (v: unknown): boolean => toFiniteNumber(v) !== null;
const hasStr = (v: string | null | undefined): boolean => !!v && v.trim() !== '';
const clamp = (n: number): number => Math.max(0, Math.min(1, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;
const fracPresent = (values: unknown[]): number => values.filter(hasNum).length / values.length;

const SOURCE_SCORE: Record<string, number> = {
  mercadona: 0.7,
  colin_catalog: 0.7,
  catalog_import: 0.6,
  manual: 0.6,
  api: 0.5,
  barcode_ean: 0.5,
  label_scan: 0.4,
  customer_upload: 0.4,
};

const SIMILARITY_SCORE: Record<string, number> = {
  exact: 1, high: 0.8, medium: 0.6, low: 0.3, needs_review: 0.1, rejected: 0,
};

/**
 * Score one product's INTERNAL confidence. Pure; writes nothing. Weights sum to 1; the
 * overall score is the weighted component mean minus the red-flag risk penalty, clamped.
 */
export function scoreProductConfidence(input: ConfidenceInput): ConfidenceScore {
  const notes: string[] = [];

  const identity_confidence = clamp(
    (hasStr(input.product_name_display) || hasStr(input.product_name_internal) ? 0.4 : 0) +
      (hasStr(input.brand) ? 0.3 : 0) +
      (hasStr(input.ean_code) || hasStr(input.barcode) ? 0.3 : 0),
  );

  let category_confidence = 0;
  if (hasStr(input.product_category)) {
    const m = mapDatasetCategory(input.product_category as string);
    category_confidence = m.exact ? 1 : 0.5;
  }

  const nutrition_confidence = fracPresent([
    input.fat_percent, input.carbohydrate_percent, input.total_sugars_percent, input.protein_percent, input.salt_percent,
  ]);

  const ingredient_text_confidence = hasStr(input.detected_text)
    ? clamp((input.detected_text as string).trim().length / 40)
    : 0;

  // Sugar-type breakdown is what POD/PAC actually need; EU labels rarely carry it.
  const sugarBreakdown = fracPresent([
    input.sucrose_percent, input.dextrose_percent, input.glucose_percent, input.fructose_percent, input.lactose_percent,
  ]);
  const sugar_profile_confidence = sugarBreakdown > 0 ? sugarBreakdown : hasNum(input.total_sugars_percent) ? 0.2 : 0;
  if (sugar_profile_confidence <= 0.2) notes.push('No sugar-type breakdown — POD/PAC cannot be computed directly.');

  const fat_profile_confidence = clamp(
    (hasNum(input.fat_percent) ? 0.4 : 0) + (hasNum(input.saturated_fat_percent) ? 0.3 : 0) + (hasNum(input.milk_fat_percent) ? 0.3 : 0),
  );

  const similarity_confidence = input.match_confidence ? (SIMILARITY_SCORE[input.match_confidence] ?? 0.1) : 0.1;

  const source_confidence = input.source_type ? (SOURCE_SCORE[input.source_type] ?? 0.3) : 0.3;

  const resolution = resolveProductEngineValues(input, input.reference ?? null);
  let pac_pod_confidence = 0;
  if (resolution.provenance === 'product_measured') pac_pod_confidence = 1;
  else if (resolution.provenance === 'reference_linked' && resolution.resolvable) {
    pac_pod_confidence = 0.5;
    notes.push('pac/pod are reference-linked, not independently measured.');
  } else notes.push('pac/pod unresolved — product is not engine-ready.');

  const redFlags = detectRedFlags(input);
  const blocks_auto_verify = blocksAutoVerify(redFlags);
  const risk_penalty = round2(Math.min(0.6, 0.2 * redFlags.length));
  if (redFlags.length > 0) notes.push(`Red flags: ${redFlags.map((f) => f.code).join(', ')}.`);

  const weighted =
    0.1 * identity_confidence +
    0.1 * category_confidence +
    0.2 * nutrition_confidence +
    0.05 * ingredient_text_confidence +
    0.1 * sugar_profile_confidence +
    0.1 * fat_profile_confidence +
    0.15 * similarity_confidence +
    0.1 * source_confidence +
    0.1 * pac_pod_confidence;

  return {
    identity_confidence: round2(identity_confidence),
    category_confidence: round2(category_confidence),
    nutrition_confidence: round2(nutrition_confidence),
    ingredient_text_confidence: round2(ingredient_text_confidence),
    sugar_profile_confidence: round2(sugar_profile_confidence),
    fat_profile_confidence: round2(fat_profile_confidence),
    similarity_confidence: round2(similarity_confidence),
    source_confidence: round2(source_confidence),
    pac_pod_confidence: round2(pac_pod_confidence),
    risk_penalty,
    overall_confidence_score: round2(clamp(weighted - risk_penalty)),
    blocks_auto_verify,
    internal_only: true,
    notes,
  };
}
