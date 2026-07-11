/**
 * Pure helpers over the LOCKED `ReviewedField` contract shape (intakeContracts.ts).
 * Shared by the session state machine, the duplicate check, and the save flow so all
 * three resolve a reviewed field to a value with ONE set of rules:
 *
 *   • only chosen / edited / confirmed / auto-accepted values resolve — an unresolved
 *     field (needs_confirmation / conflict_unresolved) NEVER contributes a value;
 *   • marked_unknown resolves to null — a human said "unknown" and that is honest;
 *   • a resolved candidate contributes its deterministic `normalized` value first and
 *     falls back to the verbatim `extractedRaw` — it NEVER invents anything;
 *   • no IO, no services, no engine — pure functions over contract types.
 */
import type { FieldReviewStatus, IntakeFieldKey, ReviewedField } from '../intakeContracts';

/** Review statuses that still block `ready_to_save` (spec §9 gate). */
export const BLOCKING_REVIEW_STATUSES: readonly FieldReviewStatus[] = [
  'needs_confirmation',
  'conflict_unresolved',
];

export function isBlockingStatus(status: FieldReviewStatus): boolean {
  return BLOCKING_REVIEW_STATUSES.includes(status);
}

/** Field keys that still block the ready_to_save gate, in field order. */
export function blockingFieldKeys(fields: readonly ReviewedField[]): IntakeFieldKey[] {
  return fields.filter((f) => isBlockingStatus(f.reviewStatus)).map((f) => f.fieldKey);
}

/** The candidate a resolved field points at (chosen index, else a lone candidate). */
function resolvedCandidate(field: ReviewedField): ReviewedField['candidates'][number] | null {
  if (field.chosenCandidate !== null) return field.candidates[field.chosenCandidate] ?? null;
  if (field.candidates.length === 1) return field.candidates[0] ?? null;
  return null;
}

/**
 * Resolve one reviewed field to its final value (or null). Honesty rules:
 * edited → the human's value; marked_unknown → null; confirmed/auto_accepted → the
 * chosen (or lone) candidate's normalized value, falling back to its verbatim
 * extractedRaw; unresolved (needs_confirmation / conflict_unresolved) → null.
 * A blank/whitespace result is null — never an empty-string "value".
 */
export function resolvedFieldValue(field: ReviewedField): string | null {
  switch (field.reviewStatus) {
    case 'marked_unknown':
      return null;
    case 'needs_confirmation':
    case 'conflict_unresolved':
      return null;
    case 'edited': {
      const edited = field.editedValue?.trim() ?? '';
      return edited === '' ? null : edited;
    }
    case 'confirmed':
    case 'auto_accepted': {
      if (field.editedValue !== null) {
        const edited = field.editedValue.trim();
        return edited === '' ? null : edited;
      }
      const candidate = resolvedCandidate(field);
      if (!candidate) return null;
      const value = candidate.normalized ?? candidate.extractedRaw;
      const trimmed = value?.trim() ?? '';
      return trimmed === '' ? null : trimmed;
    }
  }
}

/** Find one field by key (null when the extraction produced no such field). */
export function findField(
  fields: readonly ReviewedField[],
  key: IntakeFieldKey,
): ReviewedField | null {
  return fields.find((f) => f.fieldKey === key) ?? null;
}

/** Resolve a field by key directly from a field list (null when absent/unresolved). */
export function resolvedValueOf(
  fields: readonly ReviewedField[],
  key: IntakeFieldKey,
): string | null {
  const field = findField(fields, key);
  return field ? resolvedFieldValue(field) : null;
}
