import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';

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

export function productPickerUnavailableReason(
  scope: 'BASE_FORMULATION' | 'POST_PROCESS_ADDON',
  hit: CatalogProductSearchHit,
): string {
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
