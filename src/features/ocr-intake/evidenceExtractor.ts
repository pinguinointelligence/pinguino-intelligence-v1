/**
 * Evidence extractor (spec §5) — PURE mapping from raw OCR results to the locked
 * per-field evidence contract. No OCR engine, no DB, no IO: RawOcrResult[] in,
 * ReviewedField[] out — one ReviewedField for EVERY IntakeFieldKey.
 *
 * Locked rules enforced here:
 *   • provenance is EXPLICIT and never collapsed into a confidence number:
 *     'explicit' for values read off the label (including trace markers and rows
 *     whose value was unreadable — the ROW is explicit, the value stays null),
 *     'absent' when nothing was detected (normalized null — NEVER zero).
 *     'calculated' / 'inferred' are RESERVED: this extractor never derives values
 *     (kcal is NOT computed from kJ — both are recorded separately as read).
 *   • sodium is its own field — never auto-converted to salt;
 *   • serving-only labels: nutrition candidates stay null with the serving warning;
 *   • contradictory readings become MULTIPLE candidates ('conflict_unresolved');
 *   • cross-image merge: the role-appropriate image (nutrition_table for nutrition,
 *     ingredients for ingredient text, barcode for EANs, …) wins candidate ORDERING,
 *     but conflicting values from other images STAY as additional candidates;
 *   • 'auto_accepted' only for high-confidence unambiguous single candidates;
 *     heuristics (product name, brand) and EANs always need human confirmation.
 */

import type {
  FieldEvidence,
  IntakeFieldKey,
  IntakeImageRole,
  RawOcrResult,
  ReviewedField,
} from './intakeContracts';
import {
  normalizeOcrLineText,
  parseLabelText,
  type ExtractedField,
  type LabelExtraction,
  type NutrientKey,
  type ParsedOcrLine,
} from './labelTextParser';

/* ── input shape ─────────────────────────────────────────────────────────── */

/** One recognized image: its RawOcrResult plus the image's declared role. */
export interface EvidenceSource {
  imageId: string;
  role: IntakeImageRole;
  result: RawOcrResult;
}

/* ── deterministic confidence + canonicalization rules ───────────────────── */

/** normalizationConfidence (0..100) from parser ambiguity — deterministic bands. */
const NORMALIZATION_CONFIDENCE = {
  cleanValue: 95, // unambiguous single reading, no warnings
  warnedValue: 65, // value read but the parser flagged something
  trace: 80, // "<0.1"/"traces" read clearly — normalized deliberately null
  rowNoValue: 30, // row located, value unreadable
  conflict: 20, // contradictory readings
} as const;

const AUTO_ACCEPT_EXTRACTION_MIN = 85;
const AUTO_ACCEPT_NORMALIZATION_MIN = 90;

/** Identity heuristics ALWAYS need a human, regardless of confidence. */
const ALWAYS_CONFIRM: ReadonlySet<IntakeFieldKey> = new Set(['product_name', 'brand', 'ean_code']);

/** Canonical string form for the ReviewedField<string> contract. */
const canonical = (value: string | number | boolean): string => String(value);

/* ── role priority (which image wins candidate ORDERING per field) ──────────── */

const NUTRITION_FIELDS: ReadonlySet<IntakeFieldKey> = new Set([
  'nutrition_basis',
  'energy_kcal',
  'energy_kj',
  'fat',
  'saturated_fat',
  'carbohydrate',
  'sugars',
  'protein',
  'salt',
  'sodium',
  'fibre',
]);
const INGREDIENT_FIELDS: ReadonlySet<IntakeFieldKey> = new Set([
  'ingredients_text',
  'allergens_text',
  'may_contain_text',
]);
const CLAIM_FIELDS: ReadonlySet<IntakeFieldKey> = new Set([
  'claim_vegan',
  'claim_vegetarian',
  'claim_gluten_free',
  'claim_lactose_free',
  'claims_other',
]);

const rolePriority = (fieldKey: IntakeFieldKey, role: IntakeImageRole): number => {
  const order: IntakeImageRole[] = NUTRITION_FIELDS.has(fieldKey)
    ? ['nutrition_table', 'back', 'other', 'ingredients', 'claims_allergens', 'front', 'barcode']
    : INGREDIENT_FIELDS.has(fieldKey)
      ? ['ingredients', 'back', 'other', 'claims_allergens', 'nutrition_table', 'front', 'barcode']
      : CLAIM_FIELDS.has(fieldKey)
        ? ['claims_allergens', 'front', 'back', 'other', 'ingredients', 'nutrition_table', 'barcode']
        : fieldKey === 'ean_code'
          ? ['barcode', 'back', 'other', 'front', 'nutrition_table', 'ingredients', 'claims_allergens']
          : ['front', 'back', 'other', 'ingredients', 'claims_allergens', 'nutrition_table', 'barcode'];
  const idx = order.indexOf(role);
  return idx === -1 ? order.length : idx;
};

/* ── evidence building blocks ────────────────────────────────────────────── */

/** Locate the parser's (normalized) source line back in the raw OCR result. */
const findLineIndex = (result: RawOcrResult, sourceLine: string | null): number | null => {
  if (sourceLine === null || sourceLine === '') return null;
  const idx = result.lines.findIndex((l) => normalizeOcrLineText(l.text) === sourceLine);
  return idx === -1 ? null : idx;
};

const ABSENT_EVIDENCE: FieldEvidence = {
  extractedRaw: null,
  normalized: null,
  evidence: null,
  extractionConfidence: null,
  normalizationConfidence: null,
  provenance: 'absent',
  warnings: [],
};

/** Map one parser ExtractedField to a FieldEvidence candidate (string-canonical). */
function evidenceFromField(
  imageId: string,
  result: RawOcrResult,
  field: ExtractedField<string | number | boolean>,
): FieldEvidence {
  if (field.detection === 'absent') return { ...ABSENT_EVIDENCE };
  const sourceText = field.sourceLines[0] ?? null;
  const normalizationConfidence =
    field.detection === 'value'
      ? field.warnings.length === 0
        ? NORMALIZATION_CONFIDENCE.cleanValue
        : NORMALIZATION_CONFIDENCE.warnedValue
      : field.detection === 'trace'
        ? NORMALIZATION_CONFIDENCE.trace
        : field.detection === 'conflict'
          ? NORMALIZATION_CONFIDENCE.conflict
          : NORMALIZATION_CONFIDENCE.rowNoValue;
  return {
    extractedRaw: sourceText,
    normalized: field.value === null ? null : canonical(field.value),
    evidence: sourceText !== null ? { imageId, lineIndex: findLineIndex(result, sourceText), sourceText } : null,
    extractionConfidence: field.ocrConfidence,
    normalizationConfidence,
    provenance: 'explicit',
    warnings: [...field.warnings],
  };
}

/* ── per-image candidate extraction ──────────────────────────────────────── */

interface PerImage {
  imageId: string;
  role: IntakeImageRole;
  /** input order — the tiebreak after role priority. */
  order: number;
  result: RawOcrResult;
  extraction: LabelExtraction;
}

const NUTRIENT_FIELD_MAP: ReadonlyArray<[IntakeFieldKey, NutrientKey]> = [
  ['fat', 'fat'],
  ['saturated_fat', 'saturatedFat'],
  ['carbohydrate', 'carbohydrates'],
  ['sugars', 'sugars'],
  ['protein', 'protein'],
  ['salt', 'salt'],
  ['sodium', 'sodium'],
  ['fibre', 'fibre'],
];

/** Candidates one image contributes to one field (absent → contributes none). */
function candidatesFor(fieldKey: IntakeFieldKey, img: PerImage): FieldEvidence[] {
  const { extraction: x, imageId, result } = img;
  const single = (field: ExtractedField<string | number | boolean>): FieldEvidence[] =>
    field.detection === 'absent' ? [] : [evidenceFromField(imageId, result, field)];

  switch (fieldKey) {
    case 'product_name':
      return single(x.productName);
    case 'brand':
      return single(x.brand);
    case 'package_size':
      return single(x.packageSize);
    case 'package_unit':
      return single(x.packageUnit);
    case 'ean_code':
      return x.eanCandidates.map((c) => ({
        extractedRaw: c.raw,
        normalized: c.normalized,
        evidence:
          c.sourceLine !== null
            ? { imageId, lineIndex: findLineIndex(result, c.sourceLine), sourceText: c.sourceLine }
            : null,
        extractionConfidence: c.ocrConfidence,
        normalizationConfidence:
          c.normalized !== null ? NORMALIZATION_CONFIDENCE.cleanValue : NORMALIZATION_CONFIDENCE.rowNoValue,
        provenance: 'explicit',
        warnings: [...c.warnings],
      }));
    case 'country':
    case 'supplier':
    case 'category':
    case 'subcategory':
    case 'claims_other':
      return []; // the parser never reads these — they stay absent (never invented)
    case 'nutrition_basis':
      return single(x.basisDetail);
    case 'energy_kcal':
      return single(x.energyKcal);
    case 'energy_kj':
      return single(x.energyKj);
    case 'ingredients_text':
      return single(x.ingredientsText);
    case 'allergens_text':
      return single(x.allergens);
    case 'may_contain_text':
      return single(x.mayContain);
    case 'claim_vegan':
      return single(x.claimVegan);
    case 'claim_vegetarian':
      return single(x.claimVegetarian);
    case 'claim_gluten_free':
      return single(x.claimGlutenFree);
    case 'claim_lactose_free':
      return single(x.claimLactoseFree);
    default: {
      // nutrient rows — a same-basis conflict expands into one candidate per reading
      const mapping = NUTRIENT_FIELD_MAP.find(([key]) => key === fieldKey);
      if (!mapping) return [];
      const field = x[mapping[1]];
      if (field.detection === 'conflict') {
        return x.nutrientCandidates[mapping[1]]
          .filter((c) => c.kind === 'value' && c.value !== null && field.sourceLines.includes(c.sourceLine))
          .map((c) => ({
            extractedRaw: c.sourceLine,
            normalized: canonical(c.value as number),
            evidence: { imageId, lineIndex: findLineIndex(result, c.sourceLine), sourceText: c.sourceLine },
            extractionConfidence: c.ocrConfidence,
            normalizationConfidence: NORMALIZATION_CONFIDENCE.conflict,
            provenance: 'explicit',
            warnings: [...c.warnings, ...field.warnings.filter((w) => w.includes('contradictory'))],
          }));
      }
      return single(field);
    }
  }
}

/* ── merge + review status ───────────────────────────────────────────────── */

const dedupeKey = (c: FieldEvidence): string =>
  c.normalized !== null ? `n:${c.normalized}` : `r:${c.extractedRaw ?? ''}`;

function reviewStatusFor(fieldKey: IntakeFieldKey, candidates: FieldEvidence[]): ReviewedField['reviewStatus'] {
  const real = candidates.filter((c) => c.provenance !== 'absent');
  const distinctValues = new Set(real.map((c) => c.normalized).filter((v): v is string => v !== null));
  if (distinctValues.size > 1) return 'conflict_unresolved';
  if (real.length === 1) {
    const only = real[0];
    if (
      only &&
      !ALWAYS_CONFIRM.has(fieldKey) &&
      only.normalized !== null &&
      only.warnings.length === 0 &&
      only.extractionConfidence !== null &&
      only.extractionConfidence >= AUTO_ACCEPT_EXTRACTION_MIN &&
      only.normalizationConfidence !== null &&
      only.normalizationConfidence >= AUTO_ACCEPT_NORMALIZATION_MIN
    ) {
      return 'auto_accepted';
    }
  }
  return 'needs_confirmation';
}

/** Every field the contract knows — output covers ALL of them, detected or not. */
export const ALL_INTAKE_FIELD_KEYS: readonly IntakeFieldKey[] = [
  'product_name',
  'brand',
  'package_size',
  'package_unit',
  'ean_code',
  'country',
  'supplier',
  'category',
  'subcategory',
  'nutrition_basis',
  'energy_kcal',
  'energy_kj',
  'fat',
  'saturated_fat',
  'carbohydrate',
  'sugars',
  'protein',
  'salt',
  'sodium',
  'fibre',
  'ingredients_text',
  'allergens_text',
  'may_contain_text',
  'claim_vegan',
  'claim_vegetarian',
  'claim_gluten_free',
  'claim_lactose_free',
  'claims_other',
] as const;

/**
 * Extract per-field evidence from every recognized image and merge across images.
 * Pure and deterministic: same inputs → same ReviewedField[] (all 28 field keys).
 */
export function extractEvidence(sources: readonly EvidenceSource[]): ReviewedField[] {
  const perImage: PerImage[] = sources.map((s, order) => ({
    imageId: s.imageId,
    role: s.role,
    order,
    result: s.result,
    extraction: parseLabelText(
      s.result.lines.map((l): ParsedOcrLine => ({ text: l.text, confidence: l.confidence })),
    ),
  }));

  return ALL_INTAKE_FIELD_KEYS.map((fieldKey): ReviewedField => {
    // candidate ordering: the role-appropriate image first, then input order
    const ordered = [...perImage].sort(
      (a, b) => rolePriority(fieldKey, a.role) - rolePriority(fieldKey, b.role) || a.order - b.order,
    );
    const merged: FieldEvidence[] = [];
    const seen = new Set<string>();
    for (const img of ordered) {
      for (const candidate of candidatesFor(fieldKey, img)) {
        const key = dedupeKey(candidate);
        if (seen.has(key)) continue; // identical reading from another image — kept once
        seen.add(key);
        merged.push(candidate);
      }
    }
    if (merged.length === 0) merged.push({ ...ABSENT_EVIDENCE });
    const reviewStatus = reviewStatusFor(fieldKey, merged);
    return {
      fieldKey,
      candidates: merged,
      chosenCandidate: reviewStatus === 'auto_accepted' ? 0 : null,
      editedValue: null,
      reviewStatus,
    };
  });
}
