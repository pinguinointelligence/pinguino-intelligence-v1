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
import type { FieldEvidence, IntakeFieldKey, ReviewedField } from './intakeContracts';

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

/* ── bridge into the shared intake contract (multi-image session world) ──────
 * The single-image review state above predates intakeContracts.ts. The bridge below
 * converts it LOSSLESSLY (except where documented) into the LOCKED ReviewedField
 * shape so a legacy single-image review can enter the session/dedup/save pipeline.
 * The v1 behavior and audit stay exactly as they are — this is additive only. */

/**
 * ReviewFieldKey → contract IntakeFieldKey. `storageInstructions` has NO contract
 * field (deliberate: storage vocabulary is a Mapper concern) — it maps to null and
 * stays available in the v1 extracted_json audit; it is never silently dropped from
 * that audit, only absent from the contract field list.
 */
export const REVIEW_TO_INTAKE_FIELD_KEY: Record<ReviewFieldKey, IntakeFieldKey | null> = {
  productName: 'product_name',
  brand: 'brand',
  eanCode: 'ean_code',
  netQuantity: 'package_size',
  energyKj: 'energy_kj',
  energyKcal: 'energy_kcal',
  fat: 'fat',
  saturatedFat: 'saturated_fat',
  carbohydrates: 'carbohydrate',
  sugars: 'sugars',
  protein: 'protein',
  salt: 'salt',
  ingredientsText: 'ingredients_text',
  allergens: 'allergens_text',
  mayContain: 'may_contain_text',
  storageInstructions: null,
};

const toEvidence = (field: ReviewField, imageId: string): FieldEvidence => ({
  extractedRaw: field.extractedValue,
  normalized: field.extractedValue,
  evidence: {
    imageId,
    lineIndex: null, // the v1 parser tracked source lines as text, not indexes
    sourceText: field.sourceLines.length > 0 ? field.sourceLines.join(' | ') : null,
  },
  extractionConfidence: field.ocrConfidence,
  normalizationConfidence: null,
  provenance: 'explicit',
  warnings: field.warnings,
});

/** One v1 field → the contract ReviewedField (same review resolution semantics). */
function toReviewedField(field: ReviewField, fieldKey: IntakeFieldKey, imageId: string): ReviewedField {
  const hasExtraction = field.extractedValue !== '';
  const candidates = hasExtraction ? [toEvidence(field, imageId)] : [];
  if (field.edited) {
    const edited = field.editedValue.trim();
    // an edit that cleared the value is the human saying "no value" → marked_unknown
    if (edited === '') {
      return { fieldKey, candidates, chosenCandidate: null, editedValue: null, reviewStatus: 'marked_unknown' };
    }
    return { fieldKey, candidates, chosenCandidate: null, editedValue: edited, reviewStatus: 'edited' };
  }
  if (field.confirmed) {
    return {
      fieldKey,
      candidates,
      chosenCandidate: hasExtraction ? 0 : null,
      editedValue: null,
      reviewStatus: 'confirmed',
    };
  }
  if (field.requiresConfirmation) {
    return { fieldKey, candidates, chosenCandidate: null, editedValue: null, reviewStatus: 'needs_confirmation' };
  }
  return {
    fieldKey,
    candidates,
    chosenCandidate: hasExtraction ? 0 : null,
    editedValue: null,
    reviewStatus: 'auto_accepted',
  };
}

/** The session-world `nutrition_basis` field derived from the v1 basis + override. */
function basisReviewedField(state: OcrReviewState): ReviewedField {
  const detected = state.detectedBasis;
  const candidates: FieldEvidence[] =
    detected === 'unknown'
      ? []
      : [
          {
            extractedRaw: detected,
            normalized: detected,
            evidence: null, // the v1 parser derives the basis from headings, not one line
            extractionConfidence: null,
            normalizationConfidence: null,
            provenance: 'explicit',
            warnings: [],
          },
        ];
  if (state.basisOverride !== null) {
    return {
      fieldKey: 'nutrition_basis',
      candidates,
      chosenCandidate: null,
      editedValue: state.basisOverride,
      reviewStatus: 'edited',
    };
  }
  return {
    fieldKey: 'nutrition_basis',
    candidates,
    chosenCandidate: candidates.length === 1 ? 0 : null,
    editedValue: null,
    reviewStatus: 'auto_accepted',
  };
}

/**
 * Convert a v1 single-image review state into the LOCKED contract ReviewedField list
 * (plus the derived `nutrition_basis` field), attributing every candidate's evidence
 * to the given imageId. Pure; the v1 state is not modified and its own draft path
 * (buildDraftCandidate) keeps working unchanged.
 */
export function toReviewedFields(state: OcrReviewState, imageId: string): ReviewedField[] {
  const fields: ReviewedField[] = [];
  for (const field of state.fields) {
    const fieldKey = REVIEW_TO_INTAKE_FIELD_KEY[field.key];
    if (fieldKey === null) continue; // storageInstructions — documented above
    fields.push(toReviewedField(field, fieldKey, imageId));
  }
  fields.push(basisReviewedField(state));
  return fields;
}
