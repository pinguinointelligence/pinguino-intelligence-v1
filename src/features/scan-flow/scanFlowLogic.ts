/**
 * Pure rules of the shared scan flow (no React, no network):
 *   - a typed code becomes the same `ConfirmedScan` contract a camera read produces (provenance kept);
 *   - a resolved exact product becomes the shape the recipe picker already consumes;
 *   - the authority's list of missing critical facts becomes the MINIMAL set of plain customer fields
 *     (name, brand, ingredients, allergens, nutrition per 100 g/ml, declared contents) — never a
 *     technical parameter — and the customer's answers become the finalize confirmations.
 */
import type { ConfirmedScan } from '@/scan-contract/confirmedScan';
import type { ExactCandidate, FinalizeInput } from '@/scan-import-v2';
import type { ScanExactProduct } from '@/services/productScanner';

export type ResolvedScanProductLike = ScanExactProduct & { barcode: string | null };

export function manualConfirmedScan(input: string, now = Date.now()): ConfirmedScan | null {
  const digits = input.replace(/\D/g, '');
  const symbology =
    digits.length === 13
      ? 'EAN-13'
      : digits.length === 12
        ? 'UPC-A'
        : digits.length === 8
          ? 'EAN-8'
          : null;
  if (!symbology) return null;
  return {
    symbology,
    value: digits,
    rawValue: input.trim(),
    // a code typed by the customer is a confirmed value, not a single unverified read: the identity
    // contract requires two agreeing reads, and the QA harness records a typed code the same way
    confirmation: { lane: 'consensus', agreeingFrames: 2, sources: ['manual'] },
    evidence: { moduleNative: null, fill: null, mixedFormats: false },
    timing: { firstSeenAt: now, completedAt: now },
    provenance: { trackId: 'manual', harnessBuild: null },
  };
}

function statusOf(product: ExactCandidate): ScanExactProduct['status'] {
  if (product.entityKind === 'pi_base') return 'pi_base';
  const s = product.evidence?.['status'];
  if (s === 'verified' || s === 'blocked' || s === 'manual_unverified') return s;
  return 'manual_unverified';
}

export function toResolvedScanProduct(
  product: ExactCandidate,
  engineReady: boolean,
  barcode: string | null,
): ResolvedScanProductLike {
  return {
    id: product.productId,
    productCode: product.productCode,
    displayName: product.displayName,
    brand: product.brand,
    entityKind: product.entityKind === 'pi_base' ? 'pi_base' : 'commercial_product',
    status: statusOf(product),
    engineReady,
    barcode,
  };
}

export interface PlainField {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'number' | 'select' | 'checkbox';
  required: boolean;
  unit?: string;
  options?: readonly { value: string; label: string }[];
}

const NUTRITION: Record<string, { key: string; label: string }> = {
  energykcal: { key: 'energyKcal', label: 'Energia' },
  energykj: { key: 'energyKj', label: 'Energia (kJ)' },
  fat: { key: 'fat', label: 'Tłuszcz' },
  saturatedfat: { key: 'saturatedFat', label: 'w tym kwasy nasycone' },
  carbohydrate: { key: 'carbohydrate', label: 'Węglowodany' },
  sugars: { key: 'sugars', label: 'w tym cukry' },
  protein: { key: 'protein', label: 'Białko' },
  salt: { key: 'salt', label: 'Sól' },
  fibre: { key: 'fibre', label: 'Błonnik' },
};

const DECLARATIONS: readonly { test: RegExp; key: string; label: string }[] = [
  { test: /alcohol|abv/i, key: 'alcoholAbv', label: 'Zawartość alkoholu' },
  { test: /cocoa_?butter/i, key: 'cocoaButterPercent', label: 'Masło kakaowe' },
  { test: /cocoa/i, key: 'cocoaSolidsPercent', label: 'Zawartość kakao' },
  { test: /fruit/i, key: 'fruitContentPercent', label: 'Zawartość owoców' },
  { test: /brix/i, key: 'brix', label: 'Brix' },
];

/**
 * Only what the authority still misses, expressed as plain label fields. Codes it does not know how
 * to ask the customer for are dropped (the "request verification" path stays available for those).
 */
export function plainFieldsFor(
  missingCritical: readonly string[],
  options: { needIdentity?: boolean } = {},
): PlainField[] {
  const out = new Map<string, PlainField>();
  const add = (f: PlainField) => {
    if (!out.has(f.key)) out.set(f.key, f);
  };
  const codes = missingCritical.map((c) => c.toLowerCase());
  if (options.needIdentity || codes.some((c) => /product_identity|display_?name|identity/.test(c)))
    add({ key: 'displayName', label: 'Nazwa produktu (z etykiety)', kind: 'text', required: true });
  if (options.needIdentity || codes.some((c) => /brand/.test(c))) {
    add({ key: 'brand', label: 'Marka', kind: 'text', required: false });
    add({ key: 'unbranded', label: 'Produkt bez marki', kind: 'checkbox', required: false });
  }
  if (codes.some((c) => /ingredients/.test(c)))
    add({ key: 'ingredientsText', label: 'Skład (z etykiety)', kind: 'textarea', required: true });
  if (codes.some((c) => /allergen/.test(c)))
    add({
      key: 'allergensText',
      label: 'Alergeny (z etykiety, albo „brak”)',
      kind: 'text',
      required: true,
    });
  const nutritionCodes = codes.filter((c) => /^nutrition[_-]/.test(c));
  if (nutritionCodes.length > 0) {
    add({
      key: 'basis',
      label: 'Wartości podane na',
      kind: 'select',
      required: true,
      options: [
        { value: 'per_100g', label: '100 g' },
        { value: 'per_100ml', label: '100 ml' },
      ],
    });
    for (const code of nutritionCodes) {
      const name = code.replace(/^nutrition[_-]/, '').replace(/[_-]/g, '');
      if (name === 'basis') continue;
      const n = NUTRITION[name];
      if (n)
        add({
          key: n.key,
          label: n.label,
          kind: 'number',
          required: true,
          unit: n.key === 'energyKcal' ? 'kcal' : n.key === 'energyKj' ? 'kJ' : 'g',
        });
    }
  }
  for (const code of codes) {
    if (/^nutrition[_-]/.test(code)) continue;
    const d = DECLARATIONS.find((x) => x.test.test(code));
    if (d) add({ key: d.key, label: d.label, kind: 'number', required: true, unit: '%' });
  }
  return [...out.values()];
}

function num(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** The customer's answers → finalize confirmations (only the keys that were actually answered). */
export function confirmationsFromFields(
  values: Record<string, string | boolean | undefined>,
): NonNullable<FinalizeInput['confirmations']> {
  const productFields: Record<string, unknown> = {};
  const identity: Record<string, unknown> = {};
  const name = typeof values['displayName'] === 'string' ? values['displayName'].trim() : '';
  if (name) identity['displayName'] = name;
  if (values['unbranded'] === true) {
    identity['explicitlyUnbranded'] = true;
  } else if (typeof values['brand'] === 'string' && values['brand'].trim()) {
    identity['brand'] = values['brand'].trim();
  }
  if (Object.keys(identity).length > 0) productFields['identity'] = identity;
  for (const key of ['ingredientsText', 'allergensText']) {
    const v = values[key];
    if (typeof v === 'string' && v.trim()) productFields[key] = v.trim();
  }
  const nutrition: Record<string, unknown> = {};
  for (const { key } of Object.values(NUTRITION)) {
    const n = num(values[key]);
    if (n !== null) nutrition[key] = n;
  }
  if (Object.keys(nutrition).length > 0) {
    nutrition['basis'] = values['basis'] === 'per_100ml' ? 'per_100ml' : 'per_100g';
    productFields['nutrition'] = nutrition;
  }
  const declarations: Record<string, unknown> = {};
  for (const { key } of DECLARATIONS) {
    const n = num(values[key]);
    if (n !== null) declarations[key] = n;
  }
  if (Object.keys(declarations).length > 0) productFields['productionDeclarations'] = declarations;
  return { productFields };
}
