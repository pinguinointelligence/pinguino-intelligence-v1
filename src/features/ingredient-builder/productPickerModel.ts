import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';

export type ProductPickerVerificationStatus =
  | 'PINGÜINO VERIFIED'
  | 'VERIFIED CATALOG'
  | 'MANUAL / UNVERIFIED'
  | 'MAPPER BINDING REQUIRED'
  | 'PRODUCT DATA INCOMPLETE';

export interface ProductPickerVerificationView {
  status: ProductPickerVerificationStatus;
  reason: string | null;
}

export const isProductPickerSelectionCurrent = (input: {
  serverSearch: boolean;
  serverSettled: boolean;
  localOption: boolean;
}): boolean => !input.serverSearch || input.localOption || input.serverSettled;

const DEFECT_LABELS: Record<string, string> = {
  nutrition_basis_per_100ml_requires_density_for_gram_topping:
    'wartości odżywcze na 100 ml bez zweryfikowanej gęstości',
  ingredients_text: 'deklaracja składników',
  allergens_text: 'deklaracja alergenów',
  nutrition_energyKcal: 'wartość energetyczna',
  nutrition_fat: 'tłuszcz',
  nutrition_carbohydrate: 'węglowodany',
  nutrition_protein: 'białko',
  nutrition_salt: 'sól',
  net_quantity_unit: 'ilość netto i jednostka',
  market_of_sale: 'rynek sprzedaży',
};

const defectLabel = (value: string): string =>
  DEFECT_LABELS[value] ?? 'nieopisane pole danych';

/**
 * Truthful per-row verification projection. Search remains server-authoritative;
 * this helper only translates the returned, versioned binding facts into the
 * compact status vocabulary used by the existing picker.
 */
export function productPickerVerificationView(
  hit: CatalogProductSearchHit,
  scope: 'BASE_FORMULATION' | 'POST_PROCESS_ADDON' = 'BASE_FORMULATION',
): ProductPickerVerificationView {
  if (hit.entityKind === 'pi_base') {
    if (hit.currentVersionId === null || hit.currentVersionId === undefined) {
      return {
        status: 'PRODUCT DATA INCOMPLETE',
        reason: 'Brak warstwy: product version dla tej referencji Mapper.',
      };
    }
    if (!hit.mappedIngredientId) {
      return {
        status: 'MAPPER BINDING REQUIRED',
        reason: 'Brak warstwy: Mapper reference.',
      };
    }
    const usable = scope === 'BASE_FORMULATION' ? hit.usableInBase : hit.usableAsTopping;
    if (!usable) {
      const approvalMissing = hit.blockedReason?.includes('Brak zatwierdzenia') === true;
      const verificationMissing = hit.blockedReason?.includes('weryfikacji Mapper') === true;
      return {
        status: 'PRODUCT DATA INCOMPLETE',
        reason: approvalMissing
          ? `Referencja Mapper ${hit.mappedIngredientId} i wersja produktu istnieją, lecz brakuje zatwierdzenia approved_for_base / approved_for_engines.`
          : verificationMissing
            ? `Referencja Mapper ${hit.mappedIngredientId} i wersja produktu istnieją, lecz Mapper nie ma zatwierdzenia Verified do obliczeń Base.`
            : (hit.blockedReason ?? 'Referencja Mapper nie jest zatwierdzona w wybranym zakresie.'),
      };
    }
    return { status: 'PINGÜINO VERIFIED', reason: null };
  }

  if (hit.currentVersionId === null || hit.currentVersionId === undefined) {
    return {
      status: 'PRODUCT DATA INCOMPLETE',
      reason: 'Brak warstwy: product version. Produkt nie może wejść do PINGÜINO Base.',
    };
  }
  if (
    hit.status === 'blocked' ||
    (scope === 'POST_PROCESS_ADDON' &&
      (hit.missingFields.length > 0 || hit.invalidFields.length > 0))
  ) {
    const defects = [...hit.missingFields, ...hit.invalidFields].map(defectLabel);
    return {
      status: 'PRODUCT DATA INCOMPLETE',
      reason:
        hit.blockedReason ??
        (defects.length > 0
          ? `Brakujące dane produktu: ${defects.join(', ')}.`
          : 'Produkt wymaga uzupełnienia i ponownej weryfikacji.'),
    };
  }
  if (scope === 'POST_PROCESS_ADDON') {
    if (!hit.usableAsTopping) {
      return {
        status: 'PRODUCT DATA INCOMPLETE',
        reason: hit.blockedReason ?? 'Brak kompletnych danych produktu dla Topping.',
      };
    }
    return hit.status === 'verified'
      ? { status: 'VERIFIED CATALOG', reason: null }
      : { status: 'MANUAL / UNVERIFIED', reason: null };
  }
  if (!hit.mappedIngredientId) {
    return {
      status: 'MAPPER BINDING REQUIRED',
      reason:
        'Brak warstwy: Mapper reference. Wersja produktu i ProductBehavior istnieją, ale nie ma zatwierdzonego powiązania technicznego do Base.',
    };
  }
  if (!hit.usableInBase) {
    return {
      status: 'PRODUCT DATA INCOMPLETE',
      reason: hit.blockedReason ?? 'Brak warstwy: profile eligibility dla Base.',
    };
  }
  return hit.status === 'verified'
    ? { status: 'VERIFIED CATALOG', reason: null }
    : { status: 'MANUAL / UNVERIFIED', reason: null };
}

export function productPickerUnavailableReason(
  scope: 'BASE_FORMULATION' | 'POST_PROCESS_ADDON',
  hit: CatalogProductSearchHit,
): string {
  if (scope === 'BASE_FORMULATION') {
    const verification = productPickerVerificationView(hit);
    if (verification.reason) return verification.reason;
  }
  if (hit.blockedReason) return hit.blockedReason;
  if (hit.status === 'blocked') {
    const defects = [...hit.missingFields, ...hit.invalidFields].map(defectLabel);
    return defects.length > 0
      ? `Produkt wymaga uzupełnienia: ${defects.join(', ')}.`
      : 'Produkt wymaga uzupełnienia i ponownej weryfikacji.';
  }
  if (scope === 'BASE_FORMULATION') {
    return 'Brak zatwierdzonego mapowania do PINGÜINO Base dla tego produktu.';
  }
  if (hit.invalidFields.includes('nutrition_basis_per_100ml_requires_density_for_gram_topping')) {
    return 'Dane etykiety są podane na 100 ml. Dodaj zweryfikowaną gęstość, aby bezpiecznie przeliczyć topping na gramy.';
  }
  const defects = [...hit.missingFields, ...hit.invalidFields].map(defectLabel);
  return defects.length > 0
    ? `Topping wymaga pełnych danych etykiety: ${defects.join(', ')}.`
    : 'Topping wymaga wartości odżywczych na 100 g oraz deklaracji składników i alergenów.';
}
