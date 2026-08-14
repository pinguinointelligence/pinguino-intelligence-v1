import type { IntakeFieldKey, ProductIntakeSession } from '../intakeContracts';
import { markFieldUnknown } from '../session/intakeSession';
import { resolveFieldDisplay } from './intakeUiSupport';

export const CUSTOMER_CORRECTION_FIELDS: ReadonlySet<IntakeFieldKey> = new Set([
  'product_name',
  'brand',
  'package_size',
  'package_unit',
  'ean_code',
]);

/**
 * The full 28-field evidence graph stays available to Owner diagnostics, while
 * the customer resolves only critical identity/package fields. Low-confidence
 * nutrition, claims and metadata remain honest unknowns and request the right
 * photo instead of recreating an expert evidence form.
 */
export function settleCustomerReview(session: ProductIntakeSession): ProductIntakeSession {
  let next = session;
  for (const field of session.fields) {
    if (field.reviewStatus !== 'needs_confirmation' && field.reviewStatus !== 'conflict_unresolved') {
      continue;
    }
    if (!CUSTOMER_CORRECTION_FIELDS.has(field.fieldKey)) {
      next = markFieldUnknown(next, field.fieldKey);
      continue;
    }
    const hasValue = field.candidates.some((candidate) => candidate.normalized !== null);
    if (hasValue) continue;
    next = markFieldUnknown(next, field.fieldKey);
  }
  return next;
}

export interface CustomerOcrMissingAction {
  code: 'front_photo' | 'barcode_photo' | 'nutrition_photo';
  label: string;
  blocksSave: boolean;
}

const hasValue = (session: ProductIntakeSession, key: IntakeFieldKey): boolean => {
  const field = session.fields.find((candidate) => candidate.fieldKey === key);
  if (!field) return false;
  const display = resolveFieldDisplay(field);
  return display.kind === 'value' && display.value.trim().length > 0;
};

/** Exact, customer-facing next actions. Missing optional label facts stay
 * unknown; only absent product identity prevents creating a usable candidate. */
export function customerOcrMissingActions(
  session: ProductIntakeSession,
  options: { explicitlyUnbranded?: boolean } = {},
): CustomerOcrMissingAction[] {
  const actions: CustomerOcrMissingAction[] = [];
  if (!hasValue(session, 'product_name') || (!hasValue(session, 'brand') && !options.explicitlyUnbranded)) {
    actions.push({
      code: 'front_photo',
      label: 'Dodaj zdjęcie przodu opakowania',
      blocksSave: true,
    });
  }
  if (!session.manualEan && !hasValue(session, 'ean_code')) {
    actions.push({
      code: 'barcode_photo',
      label: 'Dodaj zdjęcie kodu kreskowego',
      blocksSave: false,
    });
  }
  if (!hasValue(session, 'nutrition_basis')) {
    actions.push({
      code: 'nutrition_photo',
      label: 'Dodaj zdjęcie tabeli wartości odżywczych',
      blocksSave: false,
    });
  }
  return actions;
}
