/**
 * How a scan result is presented (owner defect v1.4) — PURE, no React, no SDK.
 *
 * Two display defects the owner screenshot showed:
 *
 *  1. „Opakowanie: PESO NETO 250 g" — the raw OCR label was rendered AS the package value. The
 *     analyzer already returns the structured pair (`netQuantity: 250`, `unit: 'g'`) alongside the
 *     verbatim `netQuantityText`, and `product-scan-finalize` already persists the normalized
 *     `facts.packageSize = "250 g"` with `facts.netQuantityText` kept separately. Only the screen
 *     conflated them, so the fix is presentational and provenance is not lost: the normalized value
 *     is the value, the label text stays visible as evidence.
 *
 *  2. The completeness badge printed the internal overlay enum (`USABLE_FOR_OWNER`, `SCAN_DRAFT`)
 *     at the user. Those states are the save contract, not product language.
 */
import type { ProductScanOverlayState, ProductScanResult } from './contracts';

export interface PackageDisplay {
  /** The normalized quantity a user reads: `250 g`. `Brak danych` when nothing was detected. */
  value: string;
  /** The verbatim label text, when it says more than the normalized value. Null otherwise. */
  evidence: string | null;
}

const formatQuantity = (quantity: number): string =>
  Number.isInteger(quantity) ? String(quantity) : String(Number(quantity.toFixed(3)));

export function packageDisplay(pkg: ProductScanResult['package']): PackageDisplay {
  const raw = pkg.netQuantityText?.trim() || null;
  if (pkg.netQuantity === null || !Number.isFinite(pkg.netQuantity) || !pkg.unit) {
    // Nothing structured to show — the raw label is better than „Brak danych", still marked as label
    // text by the caller rather than presented as a confirmed quantity.
    return { value: raw ?? 'Brak danych', evidence: null };
  }
  const value = `${formatQuantity(pkg.netQuantity)} ${pkg.unit}`;
  return { value, evidence: raw && raw !== value ? raw : null };
}

/**
 * Full success vs partial analysis, in product language. „Partial" is never dressed up as complete:
 * a result that still has a required field open says so and the save button stays gated.
 */
export function scanCompletenessLabel(
  overlayState: ProductScanOverlayState,
  missingCriticalFields: readonly string[],
): string {
  if (overlayState === 'BLOCKED') return 'Zablokowane';
  if (missingCriticalFields.length > 0) {
    return missingCriticalFields.length === 1 &&
      missingCriticalFields[0] === 'allergen_confirmation'
      ? 'Wymaga potwierdzenia'
      : 'Analiza niepełna';
  }
  return overlayState === 'SCAN_DRAFT' ? 'Wymaga potwierdzenia' : 'Analiza kompletna';
}

/**
 * Why a finished scan still cannot be saved, in one sentence the owner can act on.
 *
 * „Analiza niepełna" on its own is the defect: the owner is told something is missing
 * and left to guess whether another photograph would fix it. Some blockers are not
 * photographable at all — a high-risk additive needs dose and behaviour authority, and
 * a disagreement between sources needs a decision, not a better picture.
 */
export function scanBlockerExplanation(missingCriticalFields: readonly string[]): string | null {
  const missing = new Set(missingCriticalFields);
  if (missing.has('high_risk_dosage_authority')) {
    return 'Skład zawiera dodatek o wysokim ryzyku technologicznym. Potrzebna jest autoryzacja dawki i zachowania — kolejne zdjęcie tego nie rozstrzygnie, produkt trafia do weryfikacji.';
  }
  if ([...missing].some((field) => field.startsWith('conflict_'))) {
    return 'Dane z etykiety i ze źródła zewnętrznego różnią się. Zachowaliśmy wartość z etykiety; rozbieżność czeka na weryfikację.';
  }
  if (missing.has('allergen_confirmation') && missing.size === 1) return null;
  return null;
}

export type ProductCompletionField = {
  key: string;
  label: string;
  unit: string | null;
  input: 'number' | 'text' | 'textarea' | 'select';
  help: string;
};

const NUTRITION_COMPLETION: Readonly<Record<string, ProductCompletionField>> = Object.freeze({
  nutrition_energyKcal: {
    key: 'energyKcal', label: 'Energia', unit: 'kcal / 100 g', input: 'number',
    help: 'Przepisz wartość kcal z tabeli wartości odżywczych.',
  },
  nutrition_fat: {
    key: 'fat', label: 'Tłuszcz', unit: 'g / 100 g', input: 'number',
    help: 'Znajdziesz tę wartość w tabeli wartości odżywczych.',
  },
  nutrition_carbohydrate: {
    key: 'carbohydrate', label: 'Węglowodany', unit: 'g / 100 g', input: 'number',
    help: 'Przepisz wartość „węglowodany”.',
  },
  nutrition_protein: {
    key: 'protein', label: 'Białko', unit: 'g / 100 g', input: 'number',
    help: 'Znajdziesz tę wartość w tabeli wartości odżywczych.',
  },
  nutrition_salt: {
    key: 'salt', label: 'Sól', unit: 'g / 100 g', input: 'number',
    help: 'Przepisz sól, nie sód.',
  },
});

/** Only package-readable facts become inputs. Internal POD/PAC/Mapper fields
 * are deliberately absent: Product Intelligence derives them server-side. */
export function productCompletionFields(
  missingCriticalFields: readonly string[],
): ProductCompletionField[] {
  const result: ProductCompletionField[] = [];
  const missing = new Set(missingCriticalFields);
  for (const key of missingCriticalFields) {
    const nutrition = NUTRITION_COMPLETION[key];
    if (nutrition) result.push(nutrition);
  }
  if (missing.has('nutrition_basis')) {
    result.unshift({
      key: 'nutritionBasis', label: 'Podstawa tabeli', unit: null, input: 'select',
      help: 'Wybierz podstawę wydrukowaną nad tabelą wartości odżywczych.',
    });
  }
  if (missing.has('ingredientsText')) {
    result.push({
      key: 'ingredientsText', label: 'Skład produktu', unit: null, input: 'textarea',
      help: 'Przepisz wykaz składników z opakowania.',
    });
  }
  if (missing.has('allergen_confirmation')) {
    result.push({
      key: 'allergensText', label: 'Alergeny', unit: null, input: 'text',
      help: 'Przepisz deklarację alergenów z opakowania. Puste pole nie oznacza braku alergenów.',
    });
  }
  return result;
}

export function productCompletionReady(
  fields: readonly ProductCompletionField[],
  values: Readonly<Record<string, string>>,
  allergenAbsenceConfirmed = false,
): boolean {
  return fields.every((field) => {
    if (field.key === 'allergensText' && allergenAbsenceConfirmed) return true;
    const value = values[field.key]?.trim() ?? '';
    if (!value) return false;
    if (field.input !== 'number') return true;
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= (field.key === 'energyKcal' ? 1000 : 100);
  });
}

export function productCompletionPayload(values: Readonly<Record<string, string>>): {
  nutrition: Record<string, number>;
  nutritionBasis: 'per_100g' | 'per_100ml' | null;
  ingredientsText: string | null;
  allergensText: string | null;
} {
  const nutrition: Record<string, number> = {};
  for (const field of Object.values(NUTRITION_COMPLETION)) {
    const raw = values[field.key]?.trim();
    if (!raw) continue;
    const parsed = Number(raw.replace(',', '.'));
    if (Number.isFinite(parsed)) nutrition[field.key] = parsed;
  }
  return {
    nutrition,
    nutritionBasis:
      values.nutritionBasis === 'per_100g' || values.nutritionBasis === 'per_100ml'
        ? values.nutritionBasis
        : null,
    ingredientsText: values.ingredientsText?.trim() || null,
    allergensText: values.allergensText?.trim() || null,
  };
}
