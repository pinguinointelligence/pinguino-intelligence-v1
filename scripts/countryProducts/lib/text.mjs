// Deterministic text helpers for the country-product layer. Nothing here
// guesses a value: every parser returns null when the source text does not
// state the quantity explicitly.

import { createHash } from 'node:crypto';

const FOLD = new Map([
  ['ł', 'l'],
  ['Ł', 'L'],
  ['ø', 'o'],
  ['Ø', 'O'],
  ['æ', 'ae'],
  ['Æ', 'AE'],
  ['œ', 'oe'],
  ['Œ', 'OE'],
  ['ß', 'ss'],
  ['đ', 'd'],
  ['Đ', 'D'],
  ['ð', 'd'],
  ['þ', 'th'],
  ['ı', 'i'],
]);

/** Trimmed string, or null for empty / non-string-like input. */
export function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\r\n/g, '\n').trim();
  return text.length > 0 ? text : null;
}

/** Lower-case ASCII fold used only for comparison keys, never for display. */
export function foldForComparison(value) {
  const text = cleanText(value);
  if (!text) return '';
  return [...text.normalize('NFKD')]
    .map((character) => FOLD.get(character) ?? character)
    .join('')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Upper-case ASCII slug for keys: letters, digits and single dashes. */
export function keySlug(value) {
  const folded = foldForComparison(value);
  return folded ? folded.toUpperCase().replace(/ /g, '-') : '';
}

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function shortHash(value, length = 10) {
  return sha256Hex(String(value)).slice(0, length).toUpperCase();
}

/** Every http(s) URL in a free-text cell, in order of appearance. */
export function extractUrls(value) {
  const text = cleanText(value);
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s|<>"'`]+/g) ?? [];
  return matches.map((url) => url.replace(/[.,;:]+$/, ''));
}

/** "US · Stany Zjednoczone" → "US". */
export function iso2FromCountryCell(value) {
  const text = cleanText(value);
  if (!text) return null;
  const match = /^([A-Z]{2})\s*·/.exec(text);
  return match ? match[1] : null;
}

/** Newline / " | " separated list cell → trimmed non-empty parts. */
export function splitLines(value) {
  const text = cleanText(value);
  if (!text) return [];
  return text
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Code-like tokens in an SKU / article / offer-id cell: tokens that contain at
 * least one digit and are at least three characters long. The first token is
 * the cell's primary code. Free-text statements such as "Brak publicznego
 * kodu; identyfikacja ofertą/TDS" therefore yield no token at all.
 */
export function codeTokens(value) {
  const text = cleanText(value);
  if (!text) return [];
  const tokens = text
    .split(/[\s;,()/]+/)
    .map((token) => token.replace(/^[.:#=]+|[.:#=]+$/g, ''))
    .filter((token) => token.length >= 3 && /\d/.test(token));
  const unique = [];
  for (const token of tokens) {
    const normalized = token.toUpperCase();
    if (!unique.includes(normalized)) unique.push(normalized);
  }
  return unique;
}

const UNKNOWN_PACKAGE = /niepubliczn|inferred|sold by weight|B2B\s*[—-]/i;
const METRIC = /(\d+(?:[.,]\d+)?)\s*(kg|ml|cl|g|l)\b/i;
const IMPERIAL = /(\d+(?:[.,]\d+)?)\s*(fl\.?\s*oz|oz|lb|pint)\b/i;
const MULTIPACK = /^(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|ml|cl|g|l)\b/i;

const roundQuantity = (value) => Math.round(value * 1e6) / 1e6;
const toNumber = (text) => Number(String(text).replace(',', '.'));

function metricNormalized(quantity, unit) {
  switch (unit) {
    case 'kg':
      return { quantity: roundQuantity(quantity * 1000), unit: 'g' };
    case 'g':
      return { quantity: roundQuantity(quantity), unit: 'g' };
    case 'l':
      return { quantity: roundQuantity(quantity * 1000), unit: 'ml' };
    case 'cl':
      return { quantity: roundQuantity(quantity * 10), unit: 'ml' };
    case 'ml':
      return { quantity: roundQuantity(quantity), unit: 'ml' };
    default:
      return null;
  }
}

/** Unit-independent compact slug: 20 cl and 200 ml both give "200ML", 1 L gives "1L". */
function compactMetricSlug(normalizedQuantity, normalizedUnit) {
  if (normalizedUnit === 'g') {
    return normalizedQuantity >= 1000
      ? `${String(roundQuantity(normalizedQuantity / 1000))}KG`
      : `${String(normalizedQuantity)}G`;
  }
  return normalizedQuantity >= 1000
    ? `${String(roundQuantity(normalizedQuantity / 1000))}L`
    : `${String(normalizedQuantity)}ML`;
}

/**
 * Parses the stated pack size. Metric wins over imperial when both appear
 * (e.g. "12 oz (340 g)"); a leading "N × size" is a multipack. Imperial-only
 * sizes are kept in their unit — no conversion factor is applied. The slug is
 * built from the normalized metric size, so the same pack written as "20 cl"
 * and "200 ml" compares equal.
 */
export function parsePackage(value) {
  const text = cleanText(value);
  const empty = {
    text,
    stated: false,
    quantity: null,
    unit: null,
    multipackCount: null,
    normalizedQuantity: null,
    normalizedUnit: null,
    slug: 'PACK-UNKNOWN',
  };
  if (!text || UNKNOWN_PACKAGE.test(text)) return empty;

  const multipack = MULTIPACK.exec(text);
  if (multipack) {
    const count = Number(multipack[1]);
    const each = roundQuantity(toNumber(multipack[2]));
    const unit = multipack[3].toLowerCase();
    const eachNormalized = metricNormalized(each, unit);
    return {
      text,
      stated: true,
      quantity: each,
      unit,
      multipackCount: count,
      normalizedQuantity: roundQuantity(eachNormalized.quantity * count),
      normalizedUnit: eachNormalized.unit,
      slug: `${count}X${compactMetricSlug(eachNormalized.quantity, eachNormalized.unit)}`,
    };
  }

  const metric = METRIC.exec(text);
  if (metric) {
    const quantity = roundQuantity(toNumber(metric[1]));
    const unit = metric[2].toLowerCase();
    const normalized = metricNormalized(quantity, unit);
    return {
      text,
      stated: true,
      quantity,
      unit,
      multipackCount: null,
      normalizedQuantity: normalized.quantity,
      normalizedUnit: normalized.unit,
      slug: compactMetricSlug(normalized.quantity, normalized.unit),
    };
  }

  const imperial = IMPERIAL.exec(text);
  if (imperial) {
    const quantity = roundQuantity(toNumber(imperial[1]));
    const unit = imperial[2].toLowerCase().replace(/\s+/g, ' ');
    return {
      text,
      stated: true,
      quantity,
      unit,
      multipackCount: null,
      normalizedQuantity: null,
      normalizedUnit: null,
      slug: `${String(quantity)}${unit.toUpperCase().replace(/[^A-Z]/g, '')}`,
    };
  }
  return empty;
}

/** Stable, locale-independent string comparison for sorting. */
export function compareText(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined))].sort(
    compareText,
  );
}
