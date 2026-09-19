/**
 * Direct, keyless OpenFoodFacts lookup adapter for the Scanner's exact-GTIN path.
 *
 * This module is deliberately pure. The Edge function owns the bounded GET; this code accepts
 * the returned JSON only when OFF's own `code` is exactly the scanned EAN and turns the fields
 * that are actually present into the same provenance-bearing facts used by existing research.
 */

export type OpenFoodFactsLookupOutcome =
  | 'found'
  | 'not_found'
  | 'barcode_mismatch'
  | 'invalid_response';

export interface OpenFoodFactsExactLookupResult {
  outcome: OpenFoodFactsLookupOutcome;
  returnedBarcode: string | null;
  facts: Record<string, unknown>[];
  acquiredFields: string[];
}

const OFF_ORIGIN = 'https://world.openfoodfacts.org';

const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const digitsOnly = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\D/g, '') : '';

const textValue = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const firstText = (...values: unknown[]): string | null => {
  for (const value of values) {
    const text = textValue(value);
    if (text) return text;
  }
  return null;
};

const firstLocalizedText = (product: Record<string, unknown>, prefix: string): string | null => {
  const preferred = firstText(product[prefix], product[`${prefix}_en`]);
  if (preferred) return preferred;
  for (const key of Object.keys(product).sort()) {
    if (key.startsWith(`${prefix}_`)) {
      const value = textValue(product[key]);
      if (value) return value;
    }
  }
  return null;
};

const finiteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const tagText = (value: unknown): string | null => {
  if (!Array.isArray(value)) return null;
  const tags = value.flatMap((entry) => {
    if (typeof entry !== 'string' || entry.trim() === '') return [];
    const label = entry
      .replace(/^[a-z]{2}:/i, '')
      .replace(/-/g, ' ')
      .trim();
    return label ? [label] : [];
  });
  return tags.length > 0 ? tags.join(', ') : null;
};

export function openFoodFactsApiUrl(ean: string): string {
  return `${OFF_ORIGIN}/api/v2/product/${encodeURIComponent(digitsOnly(ean))}.json`;
}

/**
 * Convert one OFF API response into Scanner lookup facts. No fact survives a barcode mismatch.
 */
export function openFoodFactsFactsForExactEan(
  json: unknown,
  scannedEan: string,
  retrievedAt: string,
): OpenFoodFactsExactLookupResult {
  const root = objectValue(json);
  const expectedBarcode = digitsOnly(scannedEan);
  const returnedBarcode = digitsOnly(root.code) || null;
  const found = root.status === 1 || root.status === '1';

  if (!found) {
    return {
      outcome: 'not_found',
      returnedBarcode,
      facts: [],
      acquiredFields: [],
    };
  }
  if (!expectedBarcode || returnedBarcode !== expectedBarcode) {
    return {
      outcome: 'barcode_mismatch',
      returnedBarcode,
      facts: [],
      acquiredFields: [],
    };
  }

  const product = objectValue(root.product);
  if (Object.keys(product).length === 0) {
    return {
      outcome: 'invalid_response',
      returnedBarcode,
      facts: [],
      acquiredFields: [],
    };
  }

  const productName =
    firstLocalizedText(product, 'product_name') ?? firstLocalizedText(product, 'generic_name');
  const brand = firstText(product.brands);
  const sourceConfidence = productName && brand ? 0.9 : productName ? 0.6 : 0.3;
  const sourceUrl = openFoodFactsApiUrl(expectedBarcode);
  const sourceTitle = [productName, brand].filter(Boolean).join(' · ') || `GTIN ${expectedBarcode}`;
  const facts: Record<string, unknown>[] = [];

  const addFact = (field: string, value: string | null) => {
    if (!value) return;
    facts.push({
      field,
      value,
      sourceUrl,
      sourceDomain: 'world.openfoodfacts.org',
      sourceTitle,
      sourceAuthorityClass: 'STRUCTURED_PRODUCT_DATABASE',
      evidenceSource: 'barcode_registry',
      sourceStatedEan: returnedBarcode,
      sourceEanConfirmationMethod: 'url',
      sourceEanConfirmedAt: retrievedAt,
      sourceReceiptId: `off:${expectedBarcode}:${retrievedAt}`,
      sourceConfidence,
      retrievedAt,
    });
  };

  addFact('productName', productName);
  addFact('brand', brand);
  addFact('productCategory', firstText(product.categories) ?? tagText(product.categories_tags));
  addFact('ingredients', firstLocalizedText(product, 'ingredients_text'));
  addFact('allergens', firstText(product.allergens) ?? tagText(product.allergens_tags));
  addFact('netQuantity', firstText(product.quantity));
  addFact('countryOfOrigin', firstText(product.origins) ?? tagText(product.origins_tags));

  const nutriments = objectValue(product.nutriments);
  const nutritionFields: ReadonlyArray<readonly [string, string, string]> = [
    ['energyKj', 'energy-kj_100g', 'kJ'],
    ['energyKcal', 'energy-kcal_100g', 'kcal'],
    ['fat', 'fat_100g', 'g'],
    ['saturatedFat', 'saturated-fat_100g', 'g'],
    ['carbohydrate', 'carbohydrates_100g', 'g'],
    ['sugars', 'sugars_100g', 'g'],
    ['fiber', 'fiber_100g', 'g'],
    ['protein', 'proteins_100g', 'g'],
    ['salt', 'salt_100g', 'g'],
  ];
  const hasNutrition = nutritionFields.some(([, key]) => finiteNumber(nutriments[key]) !== null);
  if (hasNutrition) {
    const declaredBasis = String(product.nutrition_data_per ?? '').toLowerCase();
    addFact('nutritionBasis', declaredBasis === '100ml' ? 'per 100 ml' : 'per 100 g');
    for (const [field, key, unit] of nutritionFields) {
      const value = finiteNumber(nutriments[key]);
      if (value !== null) addFact(field, `${value} ${unit}`);
    }
  }

  return {
    outcome: 'found',
    returnedBarcode,
    facts,
    acquiredFields: [...new Set(facts.map((fact) => String(fact.field)))],
  };
}
