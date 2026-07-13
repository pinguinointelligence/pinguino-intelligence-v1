/**
 * Natural-language batch parser (Agent B) — pure and deterministic.
 *
 * Extracts a MASS batch size in grams from free text such as
 * "Zrób 5 kg wanilii" (→ 5000 g) or "500 g" (→ 500 g). Decimal comma is
 * supported ("1,5 kg" → 1500 g).
 *
 * HONESTY RULE: a stated VOLUME (l / ml) is NEVER converted to grams — that
 * would silently equate volume with mass without a density/validated contract.
 * A volume is reported separately as `volumeStatedMl` and `grams` stays null.
 */

/** Mass units → grams multiplier. */
const MASS_UNIT_TO_GRAMS: Readonly<Record<string, number>> = {
  kg: 1000,
  kilo: 1000,
  kilogram: 1000,
  kilograms: 1000,
  dag: 10,
  dkg: 10,
  g: 1,
  gram: 1,
  grams: 1,
  gramy: 1,
  gramow: 1,
  'gramów': 1,
};

/** Volume units → millilitres multiplier (reported, never turned into grams). */
const VOLUME_UNIT_TO_ML: Readonly<Record<string, number>> = {
  ml: 1,
  mililitr: 1,
  mililitry: 1,
  milliliter: 1,
  milliliters: 1,
  millilitre: 1,
  millilitres: 1,
  l: 1000,
  litr: 1000,
  litry: 1000,
  liter: 1000,
  liters: 1000,
  litre: 1000,
  litres: 1000,
};

export interface BatchTextParse {
  /** Positive integer grams when a MASS was stated, else null. */
  grams: number | null;
  /** Millilitres when a VOLUME was stated (never converted to grams), else null. */
  volumeStatedMl: number | null;
  /** The matched substring (for honest UI echo), else null. */
  matchedText: string | null;
}

const toNumber = (raw: string): number => Number(raw.replace(',', '.'));

// Mass first: number + mass unit. Longer units are listed before shorter so the
// alternation prefers "kg" over "g" etc. (regex alternation is leftmost, so order
// matters for overlapping prefixes).
const MASS_RE = /(\d+(?:[.,]\d+)?)\s*(kilograms|kilogram|kilo|kg|gramy|gramow|gramów|grams|gram|dkg|dag|g)\b/;
const VOLUME_RE =
  /(\d+(?:[.,]\d+)?)\s*(milliliters|millilitres|milliliter|millilitre|mililitry|mililitr|ml|liters|litres|liter|litre|litry|litr|l)\b/;

/**
 * Parse the first batch quantity from free text. Pure — same text always yields
 * the same parse. Returns grams for a stated mass; a stated volume is reported
 * but never converted; nothing found → all null.
 */
export function parseBatchFromText(text: string | null | undefined): BatchTextParse {
  const empty: BatchTextParse = { grams: null, volumeStatedMl: null, matchedText: null };
  if (typeof text !== 'string' || text.trim() === '') return empty;

  const lower = text.toLowerCase();

  const mass = MASS_RE.exec(lower);
  if (mass) {
    const value = toNumber(mass[1]!);
    const factor = MASS_UNIT_TO_GRAMS[mass[2]!];
    if (factor !== undefined && Number.isFinite(value) && value > 0) {
      return { grams: Math.round(value * factor), volumeStatedMl: null, matchedText: mass[0]! };
    }
  }

  const volume = VOLUME_RE.exec(lower);
  if (volume) {
    const value = toNumber(volume[1]!);
    const factor = VOLUME_UNIT_TO_ML[volume[2]!];
    if (factor !== undefined && Number.isFinite(value) && value > 0) {
      return { grams: null, volumeStatedMl: Math.round(value * factor), matchedText: volume[0]! };
    }
  }

  return empty;
}
