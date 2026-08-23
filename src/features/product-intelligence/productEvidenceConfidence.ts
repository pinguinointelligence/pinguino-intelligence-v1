/**
 * Canonical product-evidence confidence — ONE deterministic scorer shared by
 * every ingestion channel (Scanner, INTIMPORT, future manual input).
 *
 * DETERMINISTIC BY CONSTRUCTION. The number is computed from the evidence a
 * product actually carries — identity, GTIN, brand/manufacturer, quantity,
 * ingredients, nutrition, source quality, canonical/family similarity and
 * conflicts. It is NEVER an LLM's self-reported certainty: no model is asked
 * "how confident are you?", and no model output can set this value.
 *
 * CONFIDENCE IS NOT PERMISSION. `confidence` answers "how well do we know this
 * product?"; `criticalReadiness` answers "may it be used?". A technical product
 * can be 99% identified and still be fail-closed for Engine/Production because
 * its dosage/behaviour authority is missing. The two are reported separately and
 * a high number can never mask a missing critical field.
 */

/** How a fact came to be known, strongest first. Mirrors the Scanner hierarchy. */
export type EvidenceSource =
  | 'label'
  | 'manufacturer'
  | 'barcode_registry'
  | 'retailer'
  | 'web_search'
  | 'mapper_exact'
  | 'mapper_family'
  | 'source_file';

/** Strength of each source. A family inference can never outrank a direct fact. */
export const EVIDENCE_SOURCE_RANK: Readonly<Record<EvidenceSource, number>> = Object.freeze({
  label: 6,
  mapper_exact: 6,
  manufacturer: 5,
  barcode_registry: 4,
  source_file: 4,
  retailer: 2,
  web_search: 2,
  mapper_family: 1,
});

export type ProductKind = 'normal_food' | 'technical';

/** The evidence signals the scorer reads. Every channel maps onto this shape. */
export interface ProductEvidenceInput {
  kind: ProductKind;
  /** Present fields and how each is known. Absent keys mean "not known". */
  fields: Partial<Record<ProductEvidenceField, EvidenceSource>>;
  /** A checksum-valid GTIN was supplied AND validated. */
  validatedBarcode: boolean;
  /** This row resolved to an existing canonical product by exact identity. */
  exactCanonicalMatch: boolean;
  /** A deterministic Mapper-family match was found (NOT exact identity). */
  mapperFamilyMatch: boolean;
  /** Unresolved contradictions between two credible observations. */
  materialConflicts: readonly string[];
}

export type ProductEvidenceField =
  | 'identity'
  | 'brand'
  | 'manufacturer'
  | 'variant'
  | 'netQuantity'
  | 'ingredients'
  | 'allergens'
  | 'energyKcal'
  | 'fat'
  | 'carbohydrate'
  | 'protein'
  | 'salt'
  | 'barcode'
  | 'countryOfOrigin'
  | 'dosage'
  | 'technicalParameters'
  | 'technicalSource';

/**
 * Field weights. They sum to 100 for a normal retail food; technical products
 * redistribute part of the nutrition weight onto technical evidence.
 * These are FIXED constants, not tunable at runtime, so the same product always
 * scores the same number.
 *
 * `dosage` deliberately carries NO weight: the manufacturer's recommended
 * dosage is informational (owner decision, 2026-08-23), so its absence must not
 * depress a product's confidence into a route that withholds import.
 */
const NORMAL_WEIGHTS: Readonly<Partial<Record<ProductEvidenceField, number>>> = Object.freeze({
  identity: 16,
  brand: 10,
  manufacturer: 4,
  variant: 2,
  netQuantity: 6,
  barcode: 10,
  ingredients: 16,
  allergens: 8,
  energyKcal: 7,
  fat: 5,
  carbohydrate: 5,
  protein: 5,
  salt: 4,
  countryOfOrigin: 2,
});

const TECHNICAL_WEIGHTS: Readonly<Partial<Record<ProductEvidenceField, number>>> = Object.freeze({
  identity: 20,
  brand: 12,
  manufacturer: 8,
  variant: 2,
  netQuantity: 4,
  barcode: 10,
  ingredients: 14,
  technicalParameters: 16,
  technicalSource: 8,
  countryOfOrigin: 2,
  energyKcal: 4,
});

/** Fields that must be sufficiently supported before a product may be imported. */
const NORMAL_CRITICAL: readonly ProductEvidenceField[] = [
  'identity',
  'ingredients',
  'energyKcal',
  'fat',
  'carbohydrate',
  'protein',
];

/** Dosage is NOT critical: missing or ambiguous dosage never withholds import. */
const TECHNICAL_CRITICAL: readonly ProductEvidenceField[] = ['identity'];

/**
 * How much of a field's weight a source earns. A family inference is explicitly
 * partial — it can raise confidence, but it can never look like verification.
 */
const sourceCredit = (source: EvidenceSource): number => {
  switch (source) {
    case 'label':
    case 'mapper_exact':
      return 1;
    case 'manufacturer':
      return 0.95;
    // An official owner-curated catalog export carries a Primary Source URL and a
    // reviewed Checked At date. It is not a scraped guess, so it sits in the same
    // tier as manufacturer evidence — otherwise a COMPLETE INTIMPORT row could
    // never clear the no-web threshold and every product would be searched.
    case 'source_file':
      return 0.95;
    case 'barcode_registry':
      return 0.9;
    case 'retailer':
    case 'web_search':
      return 0.6;
    case 'mapper_family':
      return 0.45;
  }
};

export interface ProductConfidenceAssessment {
  /** 0–100, deterministic. */
  confidence: number;
  /** Every critical field sufficiently supported AND no material conflict. */
  criticalReadiness: boolean;
  missingCritical: ProductEvidenceField[];
  /** Short, owner-readable reasons — never internal weights. */
  reasons: string[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Score one product's evidence. Pure, deterministic and side-effect free:
 * same input → same number, always.
 */
export function assessProductConfidence(
  input: ProductEvidenceInput,
): ProductConfidenceAssessment {
  const technical = input.kind === 'technical';
  const weights = technical ? TECHNICAL_WEIGHTS : NORMAL_WEIGHTS;
  const critical = technical ? TECHNICAL_CRITICAL : NORMAL_CRITICAL;

  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + (weight ?? 0), 0);
  let earned = 0;
  for (const [field, weight] of Object.entries(weights) as [ProductEvidenceField, number][]) {
    const source = input.fields[field];
    if (!source) continue;
    earned += weight * sourceCredit(source);
  }

  let confidence = (earned / totalWeight) * 100;

  // An exact canonical match is the strongest identity evidence there is.
  if (input.exactCanonicalMatch) confidence = Math.max(confidence, 97);
  // A validated GTIN materially strengthens identity, but never alone completes a product.
  else if (input.validatedBarcode) confidence = Math.min(100, confidence + 3);

  // Every unresolved material conflict is a real deduction, not a footnote.
  confidence -= input.materialConflicts.length * 12;
  confidence = round2(Math.max(0, Math.min(100, confidence)));

  const missingCritical = critical.filter((field) => !input.fields[field]);
  const criticalReadiness = missingCritical.length === 0 && input.materialConflicts.length === 0;

  const reasons: string[] = [];
  if (input.exactCanonicalMatch) reasons.push('dokładne dopasowanie do istniejącego produktu');
  if (input.validatedBarcode) reasons.push('poprawny kod EAN/GTIN');
  if (input.fields.brand) reasons.push('marka rozpoznana');
  if (input.fields.ingredients) reasons.push('skład kompletny');
  if (input.fields.energyKcal && input.fields.fat && input.fields.carbohydrate && input.fields.protein) {
    reasons.push('wartości odżywcze kompletne');
  }
  if (input.mapperFamilyMatch) reasons.push('dopasowanie do rodziny produktów z Mappera');
  for (const field of missingCritical) reasons.push(`brak: ${field}`);
  for (const conflict of input.materialConflicts) reasons.push(`konflikt: ${conflict}`);
  return { confidence, criticalReadiness, missingCritical, reasons };
}

/* ── owner thresholds ────────────────────────────────────────────────────── */

/** At or above this, local evidence is strong enough that web spend is wasted. */
export const NO_WEB_CONFIDENCE = 90;
/** The final auto-import floor after ALL available evidence. Never lowered silently. */
export const AUTO_IMPORT_FLOOR = 85;

export type EnrichmentRoute =
  | 'EXISTING'
  | 'READY_LOCAL'
  | 'WEB_RECOMMENDED'
  | 'WEB_REQUIRED'
  | 'REVIEW_REQUIRED';

/**
 * Route one product BEFORE any web call.
 *
 *   ≥ 90 + critical ready + no conflict → READY_LOCAL   (never search the web)
 *   85 … 89.99                          → WEB_RECOMMENDED (already potentially acceptable)
 *   < 85                                → WEB_REQUIRED
 *   unresolved conflict / missing critical at ≥90 → still needs work
 */
export function routeBeforeWeb(
  assessment: ProductConfidenceAssessment,
  options: { exactCanonicalMatch?: boolean } = {},
): EnrichmentRoute {
  if (options.exactCanonicalMatch) return 'EXISTING';
  if (assessment.confidence >= NO_WEB_CONFIDENCE && assessment.criticalReadiness) {
    return 'READY_LOCAL';
  }
  if (assessment.confidence >= AUTO_IMPORT_FLOOR) return 'WEB_RECOMMENDED';
  return 'WEB_REQUIRED';
}

/** Final decision AFTER all available evidence, web included. */
export function routeAfterWeb(assessment: ProductConfidenceAssessment): EnrichmentRoute {
  if (!assessment.criticalReadiness) return 'REVIEW_REQUIRED';
  if (assessment.confidence >= NO_WEB_CONFIDENCE) return 'READY_LOCAL';
  if (assessment.confidence >= AUTO_IMPORT_FLOOR) return 'WEB_RECOMMENDED';
  return 'REVIEW_REQUIRED';
}

/**
 * The auto-import gate. 90 is the STOP-ENRICHING threshold; 85 is the acceptance
 * floor. Dosage and process evidence are informational and are never consulted
 * here (owner decision, 2026-08-23).
 */
export function isAutoImportEligible(assessment: ProductConfidenceAssessment): boolean {
  return assessment.confidence >= AUTO_IMPORT_FLOOR && assessment.criticalReadiness;
}
