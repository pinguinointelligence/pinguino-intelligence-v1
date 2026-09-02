import type { ProductScanResult } from './contracts';

export type LiveScanFieldKey =
  | 'barcode'
  | 'product_name'
  | 'brand'
  | 'net_quantity'
  | 'nutrition'
  | 'ingredients'
  | 'allergens';

export type LiveScanFieldStatus =
  | 'MISSING'
  | 'SEARCHING'
  | 'FOUND'
  | 'USER_CONFIRMED_NOT_ON_LABEL'
  | 'CONFLICT';

export type LiveScanFieldSource = 'camera' | 'catalog' | 'ean_lookup' | 'vision' | null;

export interface LiveScanField {
  key: LiveScanFieldKey;
  status: LiveScanFieldStatus;
  value: string | null;
  source: LiveScanFieldSource;
}

export type LiveFieldState = Record<LiveScanFieldKey, LiveScanField>;

export const LIVE_FIELD_ORDER: readonly LiveScanFieldKey[] = [
  'barcode',
  'product_name',
  'brand',
  'net_quantity',
  'nutrition',
  'ingredients',
  'allergens',
];

export const LIVE_FIELD_LABEL: Readonly<Record<LiveScanFieldKey, string>> = Object.freeze({
  barcode: 'Kod',
  product_name: 'Nazwa',
  brand: 'Marka',
  net_quantity: 'Ilość',
  nutrition: 'Wartości odżywcze',
  ingredients: 'Składniki',
  allergens: 'Alergeny',
});

const newField = (key: LiveScanFieldKey): LiveScanField => ({
  key,
  status: 'MISSING',
  value: null,
  source: null,
});

export function createLiveFieldState(): LiveFieldState {
  return Object.fromEntries(LIVE_FIELD_ORDER.map((key) => [key, newField(key)])) as LiveFieldState;
}

const copy = (fields: LiveFieldState): LiveFieldState =>
  Object.fromEntries(LIVE_FIELD_ORDER.map((key) => [key, { ...fields[key] }])) as LiveFieldState;

function found(
  next: LiveFieldState,
  key: LiveScanFieldKey,
  value: string | null,
  source: Exclude<LiveScanFieldSource, null>,
) {
  next[key] = { key, status: 'FOUND', value, source };
}

export function markLiveFieldsSearching(fields: LiveFieldState): LiveFieldState {
  const next = copy(fields);
  for (const key of LIVE_FIELD_ORDER) {
    if (next[key].status === 'MISSING') next[key].status = 'SEARCHING';
  }
  return next;
}

export function applyLocalBarcode(fields: LiveFieldState, barcode: string): LiveFieldState {
  const next = copy(fields);
  found(next, 'barcode', barcode, 'camera');
  return next;
}

export function applyExactProduct(
  fields: LiveFieldState,
  product: { displayName: string; brand: string | null; barcode: string | null },
): LiveFieldState {
  const next = copy(fields);
  for (const key of LIVE_FIELD_ORDER) found(next, key, null, 'catalog');
  found(next, 'product_name', product.displayName, 'catalog');
  found(next, 'brand', product.brand ?? 'Produkt bez marki', 'catalog');
  if (product.barcode) found(next, 'barcode', product.barcode, 'catalog');
  return next;
}

const missingKind = (missing: ReadonlySet<string>, prefix: string) =>
  [...missing].some((field) => field === prefix || field.startsWith(prefix));

const conflictFor = (missing: ReadonlySet<string>, field: LiveScanFieldKey): boolean => {
  const prefixes: Record<LiveScanFieldKey, string[]> = {
    barcode: ['conflict_barcodes'],
    product_name: ['conflict_identity.displayName', 'conflict_identity.originalName'],
    brand: ['conflict_identity.brand'],
    net_quantity: ['conflict_package'],
    nutrition: ['conflict_nutrition'],
    ingredients: ['conflict_ingredientsText'],
    allergens: ['conflict_allergensText'],
  };
  return prefixes[field].some((prefix) => missingKind(missing, prefix));
};

/** Merge only facts actually present in the cumulative authoritative result. */
export function applyProductScanResult(
  fields: LiveFieldState,
  result: ProductScanResult,
  missingCriticalFields: readonly string[],
  source: 'vision' | 'ean_lookup' = 'vision',
): LiveFieldState {
  const next = copy(fields);
  const missing = new Set(missingCriticalFields);
  const name = result.identity.displayName ?? result.identity.originalName;
  if (name && !missing.has('product_identity')) found(next, 'product_name', name, source);
  if (
    (result.identity.brand || result.identity.explicitlyUnbranded) &&
    !missing.has('brand_or_unbranded')
  ) {
    found(next, 'brand', result.identity.brand ?? 'Produkt bez marki', source);
  }
  const pkg = result.package;
  if (pkg.netQuantity !== null && pkg.unit && !missing.has('net_quantity')) {
    found(next, 'net_quantity', `${pkg.netQuantity} ${pkg.unit}`, source);
  }
  const nutritionReady =
    result.nutrition.basis !== null &&
    ['energyKcal', 'fat', 'carbohydrate', 'protein', 'salt'].every(
      (key) => typeof result.nutrition[key as keyof typeof result.nutrition] === 'number',
    ) &&
    !missingKind(missing, 'nutrition_');
  if (nutritionReady) found(next, 'nutrition', 'Odczytano', source);
  if (result.ingredientsText && !missing.has('ingredientsText')) {
    found(next, 'ingredients', 'Odczytano', source);
  }
  if (
    (result.allergensText || result.mayContainAllergens.length > 0) &&
    !missing.has('allergen_confirmation')
  ) {
    found(next, 'allergens', 'Odczytano', source);
  }
  const resultBarcode = result.barcodes[0]?.value;
  if (resultBarcode) found(next, 'barcode', resultBarcode, source);
  for (const key of LIVE_FIELD_ORDER) {
    if (conflictFor(missing, key)) next[key] = { ...next[key], status: 'CONFLICT' };
  }
  return next;
}

export function confirmNotOnLabel(fields: LiveFieldState, key: LiveScanFieldKey): LiveFieldState {
  const next = copy(fields);
  if (next[key].status !== 'FOUND') {
    next[key] = {
      key,
      status: 'USER_CONFIRMED_NOT_ON_LABEL',
      value: null,
      source: 'camera',
    };
  }
  return next;
}

export function clearNotOnLabel(fields: LiveFieldState, key: LiveScanFieldKey): LiveFieldState {
  const next = copy(fields);
  if (next[key].status === 'USER_CONFIRMED_NOT_ON_LABEL') next[key] = newField(key);
  return next;
}

const ANALYSIS_FIELDS: Readonly<Record<LiveScanFieldKey, string>> = Object.freeze({
  barcode: 'barcode',
  product_name: 'product_identity',
  brand: 'brand_or_unbranded',
  net_quantity: 'net_quantity',
  nutrition: 'nutrition',
  ingredients: 'ingredientsText',
  allergens: 'allergensText',
});

export function missingFieldsForAnalysis(fields: LiveFieldState): string[] {
  return LIVE_FIELD_ORDER.filter((key) =>
    ['MISSING', 'SEARCHING', 'CONFLICT'].includes(fields[key].status),
  ).map((key) => ANALYSIS_FIELDS[key]);
}

const HINT: Readonly<Record<LiveScanFieldKey, string>> = Object.freeze({
  barcode: 'Obracaj produkt powoli',
  product_name: 'Pokaż przód opakowania',
  brand: 'Pokaż przód opakowania',
  net_quantity: 'Pokaż ilość na opakowaniu',
  nutrition: 'Pokaż tabelę wartości odżywczych',
  ingredients: 'Pokaż skład',
  allergens: 'Pokaż informację o alergenach',
});

export function nextLiveHint(fields: LiveFieldState): string {
  const missing = LIVE_FIELD_ORDER.find((key) =>
    ['MISSING', 'SEARCHING', 'CONFLICT'].includes(fields[key].status),
  );
  return missing ? HINT[missing] : 'Produkt gotowy ✓';
}

export type LiveScanCompletion =
  | 'COMPLETE'
  | 'COMPLETE_WITH_NOT_ON_LABEL_FIELDS'
  | 'NEEDS_ONE_SPECIFIC_FIELD';

export function liveScanCompletion(fields: LiveFieldState): LiveScanCompletion {
  const values = LIVE_FIELD_ORDER.map((key) => fields[key]);
  if (values.some((field) => !['FOUND', 'USER_CONFIRMED_NOT_ON_LABEL'].includes(field.status))) {
    return 'NEEDS_ONE_SPECIFIC_FIELD';
  }
  return values.some((field) => field.status === 'USER_CONFIRMED_NOT_ON_LABEL')
    ? 'COMPLETE_WITH_NOT_ON_LABEL_FIELDS'
    : 'COMPLETE';
}
