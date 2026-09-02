/**
 * Source-card evidence — reading a real product page onto a real product.
 *
 * A retailer's card for the exact labelled product is stronger evidence than any
 * Mapper estimate: someone transcribed the actual pack. But it is only evidence
 * about the product it is actually a card FOR, so identity is gated before a
 * single number is taken. "Mleko 2%" and "mleko 3,9%" are different products,
 * and a source pack that lends one product's numbers to another is worse than no
 * pack at all.
 *
 * Authority is decided per product, never per domain. The same shop is
 * first-party for the labels it owns and a retailer for everything else it
 * stocks, so `private_label_card` and `retailer_card` are separate bases with
 * separate strength — and neither is ever described as the manufacturer.
 *
 * Pure and deterministic: no DB, no network, no AI, no clock.
 */
import { foldLatin } from './mapperFamilyInference.ts';
import {
  knownField,
  type FieldTruth,
  type WorkingNumericField,
} from './productFieldTruth.ts';

export type CardAuthority = 'OFFICIAL_PRIVATE_LABEL' | 'AUTHORITATIVE_RETAILER';

export type IdentityVerdict =
  /** The card and the row share a checksum-valid GTIN. */
  | 'EXACT_EAN_MATCH'
  /** Brand, product wording and pack size all agree. */
  | 'EXACT_IDENTITY_MATCH'
  /** Plausible, but something material is unconfirmed. Nothing is taken. */
  | 'AMBIGUOUS'
  /** The card is demonstrably a different product or variant. */
  | 'MISMATCH';

/** What the fetched card literally published. */
export interface SourceCardFacts {
  url: string;
  heading: string | null;
  /** The basis the card's own table header declared. */
  basis: 'per_100g' | 'per_100ml' | null;
  nutrition: Partial<Record<string, number>>;
  ingredients: string | null;
  allergens: string | null;
  /** GTIN printed on the card, when it publishes one. */
  barcode?: string | null;
}

/** The row the card is being matched against. */
export interface SourceCardSubject {
  brand: string | null;
  name: string | null;
  variant: string | null;
  netQuantityValue: string | null;
  netQuantityUnit: string | null;
  barcode: string | null;
}

export interface IdentityAssessment {
  verdict: IdentityVerdict;
  reasons: string[];
}

/** Confidence each authority may contribute at. Never equal to a manufacturer's. */
export const CARD_CONFIDENCE: Readonly<Record<CardAuthority, number>> = Object.freeze({
  OFFICIAL_PRIVATE_LABEL: 0.95,
  AUTHORITATIVE_RETAILER: 0.92,
});

const BASIS_OF: Readonly<Record<CardAuthority, 'private_label_card' | 'retailer_card'>> =
  Object.freeze({
    OFFICIAL_PRIVATE_LABEL: 'private_label_card',
    AUTHORITATIVE_RETAILER: 'retailer_card',
  });

const normalise = (value: string | null | undefined): string =>
  foldLatin(value).replace(/[^a-z0-9%,.]+/g, ' ').replace(/\s+/g, ' ').trim();

const words = (value: string): Set<string> =>
  new Set(normalise(value).split(' ').filter((token) => token.length >= 3));

/**
 * Numbers that name a VARIANT rather than a pack size — the "2" in "mleko 2%",
 * the "0,5" in "jogurt 0,5% tłuszczu". Two cards agreeing on everything but this
 * are two different products.
 */
const variantNumbers = (value: string): string[] =>
  [...normalise(value).matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)]
    .map((match) => match[1]?.replace(',', '.'))
    .filter((entry): entry is string => entry !== undefined);

const digitsOnly = (value: string | null | undefined): string => (value ?? '').replace(/\D+/g, '');

/**
 * Decide whether this card is about this product.
 *
 * The URL appearing in the row is NOT accepted as proof: the export records
 * where the owner looked, which is not the same as what the page turned out to
 * be. Brand, wording and pack size are checked against the card's own heading.
 */
export function assessCardIdentity(
  subject: SourceCardSubject,
  card: SourceCardFacts,
): IdentityAssessment {
  const reasons: string[] = [];
  const heading = card.heading ?? '';
  if (!heading.trim()) {
    return { verdict: 'AMBIGUOUS', reasons: ['karta nie podała nazwy produktu'] };
  }

  const subjectBarcode = digitsOnly(subject.barcode);
  const cardBarcode = digitsOnly(card.barcode);
  if (subjectBarcode && cardBarcode) {
    if (subjectBarcode.padStart(14, '0') === cardBarcode.padStart(14, '0')) {
      return { verdict: 'EXACT_EAN_MATCH', reasons: ['zgodny GTIN'] };
    }
    return { verdict: 'MISMATCH', reasons: ['GTIN karty różni się od GTIN wiersza'] };
  }

  const headingNormalised = normalise(heading);
  const brand = normalise(subject.brand);
  if (brand && !headingNormalised.includes(brand)) {
    return { verdict: 'MISMATCH', reasons: [`karta nie dotyczy marki "${subject.brand}"`] };
  }
  if (brand) reasons.push('marka zgodna');

  // Variant percentages must agree exactly where both sides state one.
  const subjectVariants = variantNumbers(`${subject.name ?? ''} ${subject.variant ?? ''}`);
  const cardVariants = variantNumbers(heading);
  if (subjectVariants.length > 0 && cardVariants.length > 0) {
    const shared = subjectVariants.some((value) => cardVariants.includes(value));
    if (!shared) {
      return {
        verdict: 'MISMATCH',
        reasons: [`inny wariant: wiersz ${subjectVariants.join('/')}% vs karta ${cardVariants.join('/')}%`],
      };
    }
    reasons.push('wariant procentowy zgodny');
  } else if (subjectVariants.length !== cardVariants.length) {
    // One side names a variant the other does not — not provably the same pack.
    return {
      verdict: 'AMBIGUOUS',
      reasons: ['tylko jedna ze stron podaje wariant procentowy'],
    };
  }

  // Pack size, when the row states one, must appear on the card.
  const quantity = normalise(subject.netQuantityValue);
  const unit = normalise(subject.netQuantityUnit);
  if (quantity && unit) {
    const compact = `${quantity} ${unit}`.replace(/\s+/g, ' ');
    if (!headingNormalised.replace(/\s+/g, ' ').includes(compact)) {
      return { verdict: 'AMBIGUOUS', reasons: [`karta nie potwierdza opakowania "${compact}"`] };
    }
    reasons.push('opakowanie zgodne');
  }

  const subjectWords = words(`${subject.name ?? ''} ${subject.variant ?? ''}`);
  const headingWords = words(heading);
  const overlap = [...subjectWords].filter((word) => headingWords.has(word));
  if (subjectWords.size > 0 && overlap.length === 0) {
    return { verdict: 'MISMATCH', reasons: ['nazwa produktu nie pokrywa się z kartą'] };
  }
  reasons.push(`wspólne słowa nazwy: ${overlap.length}`);

  return { verdict: 'EXACT_IDENTITY_MATCH', reasons };
}

export interface CardContribution {
  /** Fields the card may contribute, already gated on identity and basis. */
  fields: Partial<Record<WorkingNumericField, FieldTruth>>;
  /** Nutrition the card published per 100 ml, kept truthfully as per 100 ml. */
  per100ml: Partial<Record<string, number>> | null;
  reasons: string[];
}

/** Card labels that map onto working fields. Anything else is not composition. */
const CARD_FIELDS = new Set<string>([
  'kcal_per_100g',
  'fat_percent',
  'carbohydrate_percent',
  'total_sugars_percent',
  'fiber_percent',
  'protein_percent',
  'salt_percent',
]);

/**
 * Turn one identity-confirmed card into field evidence.
 *
 * Per-100 ml nutrition is NEVER written into the per-100 g fields. Without a
 * density that conversion invents a measurement, so it is returned separately
 * and truthfully, and the Mapper keeps supplying the working profile.
 */
export function cardContribution(
  card: SourceCardFacts,
  authority: CardAuthority,
  verdict: IdentityVerdict,
): CardContribution {
  const reasons: string[] = [];
  if (verdict !== 'EXACT_EAN_MATCH' && verdict !== 'EXACT_IDENTITY_MATCH') {
    return { fields: {}, per100ml: null, reasons: [`tożsamość nie potwierdzona (${verdict})`] };
  }
  if (card.basis === 'per_100ml') {
    reasons.push('karta podaje wartości na 100 ml — nie przeliczam na 100 g bez gęstości');
    return { fields: {}, per100ml: { ...card.nutrition }, reasons };
  }
  if (card.basis !== 'per_100g') {
    return { fields: {}, per100ml: null, reasons: ['karta nie deklaruje podstawy'] };
  }

  const fields: Partial<Record<WorkingNumericField, FieldTruth>> = {};
  for (const [key, value] of Object.entries(card.nutrition)) {
    if (!CARD_FIELDS.has(key) || typeof value !== 'number') continue;
    fields[key as WorkingNumericField] = knownField({
      value,
      state: 'VERIFIED',
      confidence: CARD_CONFIDENCE[authority],
      basis: BASIS_OF[authority],
      note: `${authority === 'OFFICIAL_PRIVATE_LABEL' ? 'karta właściciela marki' : 'karta sprzedawcy'}: ${card.url}`,
    });
  }
  reasons.push(`${Object.keys(fields).length} pól z karty (${authority})`);
  return { fields, per100ml: null, reasons };
}
