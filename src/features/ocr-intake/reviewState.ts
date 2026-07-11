/**
 * OCR review state — PURE, deterministic model of the human review step between real
 * OCR extraction and the EXISTING local product-intake draft contract.
 *
 *   extraction (labelTextParser) → review fields (edit + explicit confirmation)
 *   → ProductIntakeCandidate (the SAME contract the table import uses, via
 *     mapRowToProductInsert) with source_type 'label_scan'.
 *
 * Boundaries:
 *   • no OCR engine import, no DB, no service, no IO — pure state transitions;
 *   • the draft is LOCAL ONLY — building it never saves anything. Persisting a
 *     candidate is the existing import service's job and stays user-triggered;
 *   • never sets product status, verification, PAC/POD or any engine value;
 *   • numeric fields map into per-100 columns ONLY when the (possibly human-corrected)
 *     basis is per-100 g / per-100 ml — serving-only or unknown basis never maps.
 */

import { mapRowToProductInsert, type ProductIntakeCandidate } from '@/data/products/productTableParser';
import type { ConfidenceBand, LabelExtraction, NutritionBasis } from './labelTextParser';

/** Mirrors the exact pinned engine version in package.json (asserted by test). */
export const OCR_ENGINE_INFO = { name: 'tesseract.js', version: '7.0.0', langs: ['eng', 'spa'] } as const;

export type ReviewFieldKey =
  | 'productName'
  | 'brand'
  | 'eanCode'
  | 'netQuantity'
  | 'energyKj'
  | 'energyKcal'
  | 'fat'
  | 'saturatedFat'
  | 'carbohydrates'
  | 'sugars'
  | 'protein'
  | 'salt'
  | 'ingredientsText'
  | 'allergens'
  | 'mayContain'
  | 'storageInstructions';

export interface ReviewField {
  key: ReviewFieldKey;
  kind: 'text' | 'number';
  /** what OCR+parser extracted ('' when nothing was found). */
  extractedValue: string;
  /** current (editable) value shown to the human. */
  editedValue: string;
  ocrConfidence: number | null;
  band: ConfidenceBand | null;
  sourceLines: string[];
  warnings: string[];
  requiresConfirmation: boolean;
  confirmed: boolean;
  edited: boolean;
}

export interface OcrReviewState {
  fields: ReviewField[];
  /** basis detected by the parser. */
  detectedBasis: NutritionBasis;
  /** human correction of the basis (null = keep detected). */
  basisOverride: NutritionBasis | null;
  languageHint: LabelExtraction['languageHint'];
  rawText: string;
  overallConfidence: number | null;
  globalWarnings: string[];
}

/** identity fields ALWAYS need explicit human confirmation, however confident OCR was. */
const ALWAYS_CONFIRM: readonly ReviewFieldKey[] = ['productName', 'brand', 'eanCode'];

const NUMBER_KEYS: readonly ReviewFieldKey[] = [
  'energyKj',
  'energyKcal',
  'fat',
  'saturatedFat',
  'carbohydrates',
  'sugars',
  'protein',
  'salt',
];

const fieldOrder: readonly ReviewFieldKey[] = [
  'productName',
  'brand',
  'eanCode',
  'netQuantity',
  'energyKj',
  'energyKcal',
  'fat',
  'saturatedFat',
  'carbohydrates',
  'sugars',
  'protein',
  'salt',
  'ingredientsText',
  'allergens',
  'mayContain',
  'storageInstructions',
] as const;

export function buildReviewState(
  extraction: LabelExtraction,
  rawText: string,
  overallConfidence: number | null = null,
): OcrReviewState {
  const fields: ReviewField[] = fieldOrder.map((key) => {
    const source = extraction[key];
    const value = source.value === null ? '' : String(source.value);
    return {
      key,
      kind: NUMBER_KEYS.includes(key) ? 'number' : 'text',
      extractedValue: value,
      editedValue: value,
      ocrConfidence: source.ocrConfidence,
      band: source.band,
      sourceLines: source.sourceLines,
      warnings: source.warnings,
      requiresConfirmation: source.needsReview || ALWAYS_CONFIRM.includes(key),
      confirmed: false,
      edited: false,
    };
  });
  return {
    fields,
    detectedBasis: extraction.basis,
    basisOverride: null,
    languageHint: extraction.languageHint,
    rawText,
    overallConfidence,
    globalWarnings: extraction.warnings,
  };
}

const replaceField = (state: OcrReviewState, key: ReviewFieldKey, patch: Partial<ReviewField>): OcrReviewState => ({
  ...state,
  fields: state.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)),
});

/** A human edit is explicit input — it also counts as confirmation of that field. */
export function editField(state: OcrReviewState, key: ReviewFieldKey, value: string): OcrReviewState {
  return replaceField(state, key, { editedValue: value, edited: true, confirmed: true });
}

export function confirmField(state: OcrReviewState, key: ReviewFieldKey): OcrReviewState {
  return replaceField(state, key, { confirmed: true });
}

/** Human correction of the nutrition basis (e.g. parser saw none, label says per 100 g). */
export function setBasisOverride(state: OcrReviewState, basis: NutritionBasis | null): OcrReviewState {
  return { ...state, basisOverride: basis };
}

export const effectiveBasis = (state: OcrReviewState): NutritionBasis => state.basisOverride ?? state.detectedBasis;

/** Fields still blocking confirmation (flagged but not yet confirmed/edited). */
export function unconfirmedRequiredFields(state: OcrReviewState): ReviewFieldKey[] {
  return state.fields.filter((f) => f.requiresConfirmation && !f.confirmed).map((f) => f.key);
}

export function canConfirmReview(state: OcrReviewState): boolean {
  return unconfirmedRequiredFields(state).length === 0;
}

export type DraftBuildResult =
  | { ok: true; candidate: ProductIntakeCandidate }
  | { ok: false; reason: string };

const fieldValue = (state: OcrReviewState, key: ReviewFieldKey): string => {
  const field = state.fields.find((f) => f.key === key);
  return field ? field.editedValue.trim() : '';
};

/**
 * Build the EXISTING local product-intake draft (ProductIntakeCandidate) from a fully
 * confirmed review. Uses the SAME mapRowToProductInsert contract as the table import —
 * one intake pipeline, one honesty policy (blank → NULL, never 0; codes stay strings).
 * LOCAL ONLY: nothing here (or anywhere in this feature) performs a write.
 */
export function buildDraftCandidate(state: OcrReviewState): DraftBuildResult {
  if (!canConfirmReview(state)) {
    return { ok: false, reason: 'confirm every flagged field before building the draft' };
  }

  const basis = effectiveBasis(state);
  const mapNumbers = basis === 'per_100g' || basis === 'per_100ml';

  // Reuse the canonical header→ProductInsert mapping (the established intake contract).
  const row: Record<string, string> = {
    product_name: fieldValue(state, 'productName'),
    brand: fieldValue(state, 'brand'),
    ean: fieldValue(state, 'eanCode'),
    package_size: fieldValue(state, 'netQuantity'),
    allergens: fieldValue(state, 'allergens'),
  };
  if (mapNumbers) {
    row.kcal_per_100g = fieldValue(state, 'energyKcal');
    row.fat = fieldValue(state, 'fat');
    row.saturated_fat = fieldValue(state, 'saturatedFat');
    row.carbohydrate = fieldValue(state, 'carbohydrates');
    row.sugars = fieldValue(state, 'sugars');
    row.protein = fieldValue(state, 'protein');
    row.salt = fieldValue(state, 'salt');
  }

  const candidate = mapRowToProductInsert(row, 'generic', 0);

  // label-scan specifics on top of the shared mapping
  candidate.insert.source_type = 'label_scan';
  candidate.insert.detected_text = state.rawText.trim() === '' ? null : state.rawText;
  candidate.insert.extracted_json = {
    schema: 'pinguino.ocr_label_extraction.v1',
    engine: OCR_ENGINE_INFO,
    basis,
    detectedBasis: state.detectedBasis,
    languageHint: state.languageHint,
    overallConfidence: state.overallConfidence,
    fields: Object.fromEntries(
      state.fields.map((f) => [
        f.key,
        {
          extracted: f.extractedValue === '' ? null : f.extractedValue,
          final: f.editedValue.trim() === '' ? null : f.editedValue.trim(),
          ocrConfidence: f.ocrConfidence,
          band: f.band,
          edited: f.edited,
          confirmed: f.confirmed,
          warnings: f.warnings,
        },
      ]),
    ),
    globalWarnings: state.globalWarnings,
  };

  if (!mapNumbers) {
    candidate.warnings.push(
      `nutrition basis is "${basis}" — numeric per-100 fields were NOT mapped (never converted or guessed)`,
    );
    if (candidate.status === 'valid') candidate.status = 'warning';
  }
  if (basis === 'per_100ml') {
    candidate.warnings.push('values are per 100 ml — density NOT applied; verify against per-100 g expectations');
    if (candidate.status === 'valid') candidate.status = 'warning';
  }

  return { ok: true, candidate };
}
