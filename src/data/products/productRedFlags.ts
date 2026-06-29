/**
 * Pure product RED-FLAG detector (Mapper safety slice). Scans a product's TEXT + a few
 * structural composition signals and returns INTERNAL flags that mean "this product must
 * not auto-verify — a human must review it". It is intentionally conservative and pure:
 *
 *   - PURE: no DB, no service, no engine, no IO, no network. A deterministic lookup over
 *     the product's own text fields. Same input → same flags.
 *   - INTERNAL ONLY: flags + reasons are for the review workflow, never customer-facing
 *     copy. They carry no confidence percentage and set no status — detection only.
 *   - HONEST: it never mutates the product and never decides a status; callers decide.
 *
 * The flags map the team rule "products with sweeteners / polyols / protein desserts /
 * hidden formulas / incomplete OCR / claim-vs-composition conflicts must not auto-verify".
 * Keyword matching is accent- and case-insensitive (Spanish labels: azúcar, proteína…).
 */
import { toFiniteNumber } from '@/data/products/productMatcher';

export type RedFlagCode =
  | 'sugar_free_claim'
  | 'sweetener_or_polyol'
  | 'protein_fortified'
  | 'proprietary_blend'
  | 'incomplete_text'
  | 'claim_composition_conflict';

export interface RedFlag {
  code: RedFlagCode;
  /** Internal explanation (never shown to customers). */
  reason: string;
  /** The matched keyword(s) / structural signal that triggered the flag (internal). */
  evidence: string;
}

/** The product fields the detector reads (a structural subset of ProductRow). */
export interface RedFlagInput {
  product_name_display?: string | null;
  product_name_internal?: string | null;
  detected_text?: string | null;
  allergens?: string | null;
  polyol_percent?: number | string | null;
  total_sugars_percent?: number | string | null;
  source_type?: string | null;
}

/** lowercase + strip diacritics, so "azúcar" matches the accent-free keyword "azucar". */
function norm(s: string | null | undefined): string {
  if (!s) return '';
  // strip Unicode combining diacritical marks (U+0300–U+036F)
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Strong sugar-free claims (NOT "sin azúcares añadidos", which permits natural sugars). */
const STRONG_SUGAR_FREE = ['sin azucar', 'sin azucares', '0% azucar', '0 % azucar', '0% azucares', 'cero azucar', 'sugar free', 'sugarfree'];
/** "no added sugar" style claims — permits naturally-present sugars (lactose, fruit). */
const NO_ADDED_SUGAR = ['sin azucares anadidos', 'sin azucar anadido', '0% azucares anadidos', 'no added sugar', 'without added sugar'];
const POLYOLS = ['maltitol', 'eritritol', 'sorbitol', 'xilitol', 'isomalt', 'lactitol', 'manitol', 'polialcohol', 'poliol'];
const HIGH_INTENSITY = ['edulcorante', 'sucralosa', 'stevia', 'esteviol', 'aspartamo', 'acesulfamo k', 'acesulfamo', 'sacarina', 'ciclamato', 'taumatina'];
const PROTEIN = ['proteina', 'proteinas', 'high protein', 'whey'];
const PROPRIETARY = ['aroma', 'aromas', 'saborizante', 'preparado alimenticio', 'preparado para', 'base para'];
const TRUNCATION = ['...', '…', '[?]', '???'];

/** Keywords (already normalized) found in the haystack, in declaration order. */
function found(haystack: string, keywords: readonly string[]): string[] {
  return keywords.filter((k) => haystack.includes(k));
}

/**
 * Detect internal red flags for one product. Returns every flag that applies (empty array
 * = clean). Never throws on missing fields. Callers MUST treat a non-empty result as
 * "block auto-verify" (see blocksAutoVerify).
 */
export function detectRedFlags(input: RedFlagInput): RedFlag[] {
  const flags: RedFlag[] = [];
  const text = [input.product_name_display, input.product_name_internal, input.detected_text, input.allergens]
    .map(norm)
    .join(' · ');

  const strongClaim = found(text, STRONG_SUGAR_FREE);
  const noAddedClaim = found(text, NO_ADDED_SUGAR);
  if (strongClaim.length > 0 || noAddedClaim.length > 0) {
    flags.push({
      code: 'sugar_free_claim',
      reason: 'Sugar-free / no-added-sugar claim — engine sugar spectrum cannot be trusted from the label alone.',
      evidence: [...strongClaim, ...noAddedClaim].join(', '),
    });
  }

  const polyols = found(text, POLYOLS);
  const intensity = found(text, HIGH_INTENSITY);
  const structuralPolyol = (toFiniteNumber(input.polyol_percent) ?? 0) > 0;
  if (polyols.length > 0 || intensity.length > 0 || structuralPolyol) {
    const ev = [...polyols, ...intensity];
    if (structuralPolyol) ev.push('polyol_percent>0');
    flags.push({
      code: 'sweetener_or_polyol',
      reason: 'Polyol / high-intensity sweetener present — POD/PAC differ sharply from sugar and need a verified source.',
      evidence: ev.join(', '),
    });
  }

  const protein = found(text, PROTEIN);
  if (protein.length > 0) {
    flags.push({
      code: 'protein_fortified',
      reason: 'Protein-fortified product (e.g. protein dessert/drink) — a generic dairy/composition match is unreliable.',
      evidence: protein.join(', '),
    });
  }

  const proprietary = found(text, PROPRIETARY);
  if (proprietary.length > 0) {
    flags.push({
      code: 'proprietary_blend',
      reason: 'Flavouring / proprietary preparation — the real formula is hidden behind an aroma/blend.',
      evidence: proprietary.join(', '),
    });
  }

  const truncation = TRUNCATION.filter((t) => (input.detected_text ?? '').includes(t));
  const scanSource = input.source_type === 'label_scan' || input.source_type === 'barcode_ean';
  const blankText = norm(input.detected_text) === '';
  if (truncation.length > 0 || (scanSource && blankText)) {
    flags.push({
      code: 'incomplete_text',
      reason: 'Incomplete / truncated extracted text — the ingredient list could not be fully captured.',
      evidence: truncation.length > 0 ? `truncation marker ${truncation.join(' ')}` : `${input.source_type} with no detected_text`,
    });
  }

  // Claim-vs-composition conflict: a STRONG sugar-free claim while the label still reports
  // meaningful total sugars (≥5 g/100g). "No added sugar" is excluded — natural sugars are allowed.
  // "no added sugar" permits naturally-present sugars, so it can never conflict on its own.
  // (A strong phrase like "sin azucares" is also a substring of "sin azucares anadidos", so
  // we additionally require that NO no-added phrase is present before calling it a conflict.)
  const totalSugars = toFiniteNumber(input.total_sugars_percent);
  if (strongClaim.length > 0 && noAddedClaim.length === 0 && totalSugars !== null && totalSugars >= 5) {
    flags.push({
      code: 'claim_composition_conflict',
      reason: `Strong sugar-free claim but total_sugars = ${totalSugars} g/100g — claim conflicts with composition.`,
      evidence: `${strongClaim.join(', ')} vs total_sugars ${totalSugars}`,
    });
  }

  return flags;
}

/** Any red flag means the product must NOT auto-verify — a human must review it. */
export function blocksAutoVerify(flags: readonly RedFlag[]): boolean {
  return flags.length > 0;
}
