/**
 * Pure, presentational-support helpers for the intake UI panels (no React,
 * no side effects) — split from the component files so fast refresh stays
 * clean and the logic is directly unit-testable.
 */
import type {
  AcceptedMime,
  BatchIntake,
  BatchItemOutcome,
  BatchSummary,
  FieldEvidence,
  IntakeFieldKey,
  ReviewedField,
} from '../intakeContracts';
import { ocrCopy } from '../ocrCopy';

/* ── image format gate (MultiImagePanel) ──────────────────────────────────── */

/** Picker accept-list: contract mimes + HEIC/HEIF (accepted, then honestly rejected). */
export const IMAGE_PICKER_ACCEPT =
  'image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif';

const ACCEPTED: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Honest format gate for a picked file. Returns null when the file is an
 * accepted contract mime; otherwise the exact user-facing rejection message
 * (HEIC/HEIF gets the dedicated "cannot decode" explanation).
 */
export function describeUnsupportedFile(name: string, mime: string | null): string | null {
  const lowerName = name.toLowerCase();
  const lowerMime = (mime ?? '').toLowerCase();
  if (ACCEPTED.includes(lowerMime)) return null;
  if (
    lowerMime === 'image/heic' ||
    lowerMime === 'image/heif' ||
    lowerName.endsWith('.heic') ||
    lowerName.endsWith('.heif')
  ) {
    return ocrCopy.images.heicRejected;
  }
  return ocrCopy.images.unsupportedType;
}

/** True when the (already accepted) mime is one of the contract mimes. */
export function isAcceptedMime(mime: string): mime is AcceptedMime {
  return ACCEPTED.includes(mime.toLowerCase());
}

/* ── EAN/GTIN checksum (BarcodeEntry) ─────────────────────────────────────── */

/** Digits only — everything else (spaces, dashes, letters) is ignored. */
export function normalizeEan(input: string): string {
  return input.replace(/[^0-9]/g, '');
}

export type EanChecksumState = 'empty' | 'incomplete' | 'valid' | 'invalid';

/**
 * GS1 check-digit verification for GTIN-8/12/13/14. Weights alternate 3,1,…
 * from the digit immediately left of the check digit.
 */
export function eanChecksumState(digits: string): EanChecksumState {
  if (digits.length === 0) return 'empty';
  if (![8, 12, 13, 14].includes(digits.length)) return 'incomplete';
  const body = digits.slice(0, -1).split('').reverse();
  const sum = body.reduce(
    (acc, char, index) => acc + Number(char) * (index % 2 === 0 ? 3 : 1),
    0,
  );
  const expected = (10 - (sum % 10)) % 10;
  return expected === Number(digits.at(-1)) ? 'valid' : 'invalid';
}

/* ── field grouping + display resolution (EvidenceReviewPanel) ────────────── */

export const FIELD_GROUPS: ReadonlyArray<{
  group: keyof typeof ocrCopy.evidence.groups;
  fields: readonly IntakeFieldKey[];
}> = [
  {
    group: 'identity',
    fields: [
      'product_name',
      'brand',
      'package_size',
      'package_unit',
      'ean_code',
      'country',
      'supplier',
      'category',
      'subcategory',
    ],
  },
  {
    group: 'nutrition',
    fields: [
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
    ],
  },
  {
    group: 'ingredients',
    fields: ['ingredients_text', 'allergens_text', 'may_contain_text'],
  },
  {
    group: 'claims',
    fields: ['claim_vegan', 'claim_vegetarian', 'claim_gluten_free', 'claim_lactose_free', 'claims_other'],
  },
];

export type FieldDisplay =
  | { kind: 'value'; value: string; candidate: FieldEvidence | null }
  | { kind: 'conflict' }
  | { kind: 'unknown' }
  | { kind: 'missing' };

/**
 * Which value (if any) a reviewed field currently shows. Absent evidence and
 * unresolved data yield 'missing' — never a numeric default, never 0.
 */
export function resolveFieldDisplay(field: ReviewedField): FieldDisplay {
  if (field.reviewStatus === 'marked_unknown') return { kind: 'unknown' };
  if (field.editedValue !== null) return { kind: 'value', value: field.editedValue, candidate: null };
  const chosen =
    field.chosenCandidate !== null
      ? field.candidates[field.chosenCandidate]
      : field.candidates.length === 1
        ? field.candidates[0]
        : null;
  if (chosen === null || chosen === undefined) {
    return field.candidates.length > 1 ? { kind: 'conflict' } : { kind: 'missing' };
  }
  if (chosen.provenance === 'absent') return { kind: 'missing' };
  const value = chosen.normalized ?? chosen.extractedRaw;
  return value === null ? { kind: 'missing' } : { kind: 'value', value, candidate: chosen };
}

/* ── batch summary (BatchQueuePanel) ──────────────────────────────────────── */

/** Derive the summary from the outcomes record — the single source of truth. */
export function summarizeBatch(batch: BatchIntake): BatchSummary {
  const counts: Record<BatchItemOutcome, number> = {
    saved: 0,
    duplicate: 0,
    needs_review: 0,
    failed: 0,
    pending: 0,
  };
  for (const sessionId of batch.sessionIds) {
    counts[batch.outcomes[sessionId] ?? 'pending'] += 1;
  }
  return {
    processed: counts.saved + counts.duplicate + counts.needs_review + counts.failed,
    saved: counts.saved,
    duplicate: counts.duplicate,
    needsReview: counts.needs_review,
    failed: counts.failed,
    pending: counts.pending,
  };
}
