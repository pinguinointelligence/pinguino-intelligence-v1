import { foldLatin } from './mapperFamilyInference.ts';

export interface ExpectedProductIdentity {
  name: string | null;
  brand: string | null;
  variant: string | null;
  barcode: string | null;
  netQuantity: string | null;
  sourceProductId: string | null;
  knownSourceUrl: string | null;
}

export interface ObservedProductIdentity {
  productName: string | null;
  brand: string | null;
  variant: string | null;
  barcode: string | null;
  netQuantity: string | null;
  sourceProductId: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
}

export interface ExactProductIdentityProof {
  accepted: boolean;
  matchedDimensions: string[];
  reasonCodes: string[];
}

const normalized = (value: string | null | undefined): string =>
  foldLatin(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const compactGtin = (value: string | null | undefined): string =>
  (value ?? '').replace(/\D/g, '').replace(/^0+(?=\d{8,14}$)/, '');

const quantity = (value: string | null | undefined): { value: number; unit: string } | null => {
  const text = foldLatin(value)
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim();
  const match = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/);
  if (!match) return null;
  let parsed = Number(match[1]!.replace(',', '.'));
  let unit = match[2]!;
  if (unit === 'kg') {
    parsed *= 1_000;
    unit = 'g';
  } else if (unit === 'l') {
    parsed *= 1_000;
    unit = 'ml';
  }
  return Number.isFinite(parsed) ? { value: parsed, unit } : null;
};

const STOP_WORDS = new Set([
  'a', 'and', 'do', 'i', 'in', 'na', 'of', 'oraz', 'the', 'w', 'with', 'z', 'ze',
]);
const tokens = (value: string | null | undefined): Set<string> =>
  new Set(
    normalized(value)
      .split(' ')
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
  );

const nameAgreement = (expected: string | null, observed: string | null): boolean => {
  const left = tokens(expected);
  const right = tokens(observed);
  if (left.size === 0 || right.size === 0) return false;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const expectedCoverage = intersection / left.size;
  const observedCoverage = intersection / right.size;
  return expectedCoverage >= 0.55 && observedCoverage >= 0.55;
};

/**
 * Proves that a source item block describes the same commercial SKU before any
 * fact from that block can enter the product evidence set. A shared domain or a
 * generic manufacturer page is context only and can never prove item identity.
 */
export function proveExactProductIdentity(
  expected: ExpectedProductIdentity,
  observed: ObservedProductIdentity,
): ExactProductIdentityProof {
  const matchedDimensions: string[] = [];
  const reasonCodes: string[] = [];
  const expectedBarcode = compactGtin(expected.barcode);
  const observedBarcode = compactGtin(observed.barcode);

  if (expectedBarcode && observedBarcode) {
    if (expectedBarcode !== observedBarcode) {
      return { accepted: false, matchedDimensions, reasonCodes: ['EXACT_PRODUCT_BARCODE_MISMATCH'] };
    }
    matchedDimensions.push('barcode');
  }

  if (expected.sourceProductId && observed.sourceProductId) {
    if (normalized(expected.sourceProductId) !== normalized(observed.sourceProductId)) {
      reasonCodes.push('EXACT_PRODUCT_SOURCE_ID_MISMATCH');
    } else {
      matchedDimensions.push('sourceProductId');
    }
  }

  if (expected.brand && observed.brand) {
    if (normalized(expected.brand) !== normalized(observed.brand)) {
      reasonCodes.push('EXACT_PRODUCT_BRAND_MISMATCH');
    } else {
      matchedDimensions.push('brand');
    }
  }

  if (expected.name && observed.productName) {
    if (!nameAgreement(expected.name, observed.productName)) {
      reasonCodes.push('EXACT_PRODUCT_NAME_MISMATCH');
    } else {
      matchedDimensions.push('name');
    }
  }

  if (expected.variant && observed.variant) {
    if (!nameAgreement(expected.variant, observed.variant)) {
      reasonCodes.push('EXACT_PRODUCT_VARIANT_MISMATCH');
    } else {
      matchedDimensions.push('variant');
    }
  }

  const expectedQuantity = quantity(expected.netQuantity);
  const observedQuantity = quantity(observed.netQuantity);
  if (expectedQuantity && observedQuantity) {
    if (
      expectedQuantity.unit !== observedQuantity.unit ||
      Math.abs(expectedQuantity.value - observedQuantity.value) > 0.01
    ) {
      reasonCodes.push('EXACT_PRODUCT_NET_QUANTITY_MISMATCH');
    } else {
      matchedDimensions.push('netQuantity');
    }
  }

  const hardMismatch = reasonCodes.some((reason) => reason.endsWith('_MISMATCH'));
  const exactBarcode = matchedDimensions.includes('barcode');
  const exactSourceId = matchedDimensions.includes('sourceProductId');
  const descriptiveIdentity =
    matchedDimensions.includes('name') &&
    (!expected.brand || matchedDimensions.includes('brand')) &&
    (!expected.variant || matchedDimensions.includes('variant')) &&
    (!expectedQuantity || !observedQuantity || matchedDimensions.includes('netQuantity'));
  const accepted = !hardMismatch && (exactBarcode || exactSourceId || descriptiveIdentity);

  if (!accepted && reasonCodes.length === 0) reasonCodes.push('EXACT_PRODUCT_IDENTITY_UNPROVEN');
  if (accepted) reasonCodes.push('EXACT_PRODUCT_IDENTITY_PROVEN');
  return { accepted, matchedDimensions, reasonCodes };
}
