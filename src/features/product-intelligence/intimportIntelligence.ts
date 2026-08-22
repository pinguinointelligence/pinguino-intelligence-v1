/**
 * INTIMPORT local intelligence — Mapper-first, zero paid calls.
 *
 * Runs AFTER the deterministic CSV parse and BEFORE any external enrichment.
 * It answers one question per product using only what Gellatti already knows:
 * exact canonical identity → Mapper family → local evidence → deterministic
 * confidence → route. Nothing here touches the network, an LLM, or the DB.
 *
 * The whole point is to shrink the "needs enrichment" pile before a single
 * paid call is made.
 */
import type { IntimportCandidate } from '@/data/products/intimport';
import {
  assessProductConfidence,
  routeBeforeWeb,
  type EnrichmentRoute,
  type EvidenceSource,
  type ProductConfidenceAssessment,
  type ProductEvidenceField,
  type ProductEvidenceInput,
  type ProductKind,
} from './productEvidenceConfidence';
import {
  familySupportsInference,
  inferMapperFamily,
  type ProductFamilyMatch,
} from './mapperFamilyInference';
import { classifySourceAuthority, type SourceAuthorityAssessment } from './sourceAuthority';

/** Canonical lookups the caller supplies. Kept injected so this stays pure. */
export interface IntimportCanonicalIndex {
  /** Existing canonical product id for any equivalent GTIN form. */
  byBarcode?: (lookupValues: readonly string[]) => string | null;
  /** Existing canonical product id for a deterministic identity key. */
  byIdentity?: (identityKey: string) => string | null;
}

export interface IntimportProductIntelligence {
  rowIndex: number;
  sourceProductId: string | null;
  displayName: string | null;
  kind: ProductKind;
  family: ProductFamilyMatch | null;
  /** True only when the family evidence was strong enough to count. */
  familyApplied: boolean;
  exactCanonicalMatch: boolean;
  existingProductId: string | null;
  assessment: ProductConfidenceAssessment;
  /** How strong the row's own declared source actually is (§9). */
  sourceAuthority: SourceAuthorityAssessment;
  /**
   * The MINIMAL public identity an external provider needs. Deliberately not the
   * whole 36-field row: only what is required to find the product is ever
   * allowed to leave the system.
   */
  researchIdentity: {
    brand: string | null;
    manufacturer: string | null;
    name: string | null;
    variant: string | null;
    barcode: string | null;
    netQuantity: string | null;
    knownSourceUrl: string | null;
  };
  /** The exact evidence this assessment was computed from. Enrichment merges
   * new facts into THIS, so the caller never rebuilds it and cannot drift. */
  evidence: ProductEvidenceInput;
  route: EnrichmentRoute;
  /** Fields worth asking the outside world about — nothing else may be searched. */
  enrichmentTargets: ProductEvidenceField[];
}

/** Source Product Type / Category values that mean "professional / technical". */
const TECHNICAL_TYPES = new Set(['professional', 'technical']);
const TECHNICAL_FAMILIES = new Set(['stabilizer_hydrocolloid', 'emulsifier']);

function productKind(
  candidate: IntimportCandidate,
  family: ProductFamilyMatch | null,
): ProductKind {
  const type = (candidate.source['Product Type'] ?? '').trim().toLowerCase();
  if (TECHNICAL_TYPES.has(type)) return 'technical';
  if (family && TECHNICAL_FAMILIES.has(family.family)) return 'technical';
  return 'normal_food';
}

/**
 * Map one parsed INTIMPORT row onto canonical evidence. INTIMPORT's own cells
 * are `source_file` evidence — strong, because the owner curated them, but never
 * as strong as a direct label reading or an exact Mapper identity.
 */
function evidenceFields(
  candidate: IntimportCandidate,
  family: ProductFamilyMatch | null,
  familyApplied: boolean,
  exactCanonicalMatch: boolean,
  sourceAuthority: SourceAuthorityAssessment,
): Partial<Record<ProductEvidenceField, EvidenceSource>> {
  // The row's own cells are only as strong as the source they were curated from.
  // A `Primary Source URL` plus a `Checked At` proves the owner looked something
  // up — never that the page was the manufacturer's (§9).
  const file: EvidenceSource = exactCanonicalMatch
    ? 'mapper_exact'
    : sourceAuthority.evidenceSource;
  const s = candidate.source;
  const fields: Partial<Record<ProductEvidenceField, EvidenceSource>> = {};
  const put = (field: ProductEvidenceField, present: unknown, source: EvidenceSource = file) => {
    if (present) fields[field] = source;
  };

  put('identity', candidate.displayName);
  put('brand', s.Brand);
  put('manufacturer', s.Manufacturer);
  put('variant', s['Variant Original'] ?? s['Variant English']);
  put('netQuantity', s['Net Quantity Value'] && s['Net Quantity Unit']);
  put('ingredients', s['Ingredients Original'] ?? s['Ingredients English']);
  put('allergens', s.Allergens);
  put('countryOfOrigin', s['Country of Origin']);
  put('dosage', s['Professional Dosage']);
  put('technicalParameters', s['Technical Parameters']);
  put('technicalSource', s['Technical PDF URL'] ?? s['Primary Source URL']);
  // A checksum-valid GTIN is registry-grade identity evidence.
  if (candidate.ean) fields.barcode = 'barcode_registry';

  // Nutrition only counts when it is on a basis the product model can use.
  if (candidate.nutritionBasis === 'per_100g') {
    put('energyKcal', s['Energy kcal']);
    put('fat', s['Fat g']);
    put('carbohydrate', s['Carbohydrates g']);
    put('protein', s['Protein g']);
    put('salt', s['Salt g']);
  }

  // A strong family match can SUPPLEMENT missing evidence — never replace it, and
  // always stamped `mapper_family` so it can never read as verification.
  if (familyApplied && family) {
    if (!fields.identity) fields.identity = 'mapper_family';
    if (!fields.variant) fields.variant = 'mapper_family';
  }
  return fields;
}

/**
 * Fields the outside world could realistically resolve, in usefulness order —
 * scoped by product kind. Researching a dosage or a technical parameter for a
 * packet of biscuits is wasted money and a nonsense question; researching label
 * nutrition for a professional paste is not what makes it usable.
 */
const SEARCHABLE_BY_KIND: Readonly<Record<ProductKind, readonly ProductEvidenceField[]>> =
  Object.freeze({
    normal_food: [
      'ingredients',
      'energyKcal',
      'fat',
      'carbohydrate',
      'protein',
      'salt',
      'allergens',
      'barcode',
      'manufacturer',
      'netQuantity',
    ],
    technical: [
      'dosage',
      'technicalParameters',
      'technicalSource',
      'ingredients',
      'manufacturer',
      'barcode',
      'netQuantity',
      'energyKcal',
    ],
  });

/**
 * Only missing fields that MATERIALLY affect readiness are worth a call.
 * A missing optional Notes/origin never justifies spending money.
 */
function enrichmentTargets(
  kind: ProductKind,
  assessment: ProductConfidenceAssessment,
  fields: Partial<Record<ProductEvidenceField, EvidenceSource>>,
): ProductEvidenceField[] {
  const missingCritical = new Set<ProductEvidenceField>(assessment.missingCritical);
  return SEARCHABLE_BY_KIND[kind].filter((field) => {
    if (fields[field]) return false;
    // Critical gaps always justify a targeted lookup; the rest are ordered so the
    // most useful missing field is asked for first within the per-product cap.
    return missingCritical.has(field) || true;
  });
}

/**
 * Assess ONE parsed INTIMPORT row with local knowledge only.
 * Deterministic: the same row and the same index always produce the same result.
 */
export function assessIntimportProduct(
  candidate: IntimportCandidate,
  index: IntimportCanonicalIndex = {},
): IntimportProductIntelligence {
  const family = inferMapperFamily({
    name: candidate.displayName,
    variant: candidate.source['Variant Original'] ?? candidate.source['Variant English'],
    sourceCategory: candidate.sourceCategory,
    sourceSubcategory: candidate.sourceSubcategory,
  });
  const familyApplied = familySupportsInference(family);

  const lookupValues = candidate.ean ? [candidate.ean] : [];
  const existingByBarcode =
    lookupValues.length > 0 && index.byBarcode ? index.byBarcode(lookupValues) : null;
  const existingProductId = existingByBarcode ?? candidate.existingProductId ?? null;
  const exactCanonicalMatch = existingProductId !== null;

  const kind = productKind(candidate, family);
  const sourceAuthority = classifySourceAuthority({
    url: candidate.source['Primary Source URL'] ?? candidate.source['Technical PDF URL'],
    brand: candidate.source.Brand,
    manufacturer: candidate.source.Manufacturer,
    ownerProvided: true,
  });
  const fields = evidenceFields(
    candidate,
    family,
    familyApplied,
    exactCanonicalMatch,
    sourceAuthority,
  );

  const conflicts =
    candidate.state === 'REVIEW_REQUIRED' && candidate.duplicateOfRow !== null
      ? [`ambiguous identity vs row ${candidate.duplicateOfRow}`]
      : [];

  const evidence: ProductEvidenceInput = {
    kind,
    fields,
    validatedBarcode: candidate.ean !== null,
    exactCanonicalMatch,
    mapperFamilyMatch: familyApplied,
    materialConflicts: conflicts,
    // INTIMPORT never grants technical authority — that stays with ProductBehavior.
    technicalAuthority: false,
  };

  const assessment = assessProductConfidence(evidence);
  const route = routeBeforeWeb(assessment, { exactCanonicalMatch });

  return {
    rowIndex: candidate.rowIndex,
    sourceProductId: candidate.sourceProductId,
    displayName: candidate.displayName,
    kind,
    family,
    familyApplied,
    exactCanonicalMatch,
    existingProductId,
    assessment,
    sourceAuthority,
    researchIdentity: {
      brand: candidate.source.Brand,
      manufacturer: candidate.source.Manufacturer,
      name: candidate.displayName,
      variant: candidate.source['Variant Original'] ?? candidate.source['Variant English'],
      barcode: candidate.ean,
      netQuantity: [candidate.source['Net Quantity Value'], candidate.source['Net Quantity Unit']]
        .filter(Boolean)
        .join(' ') || null,
      knownSourceUrl: candidate.source['Primary Source URL'],
    },
    evidence,
    route,
    enrichmentTargets:
      route === 'EXISTING' || route === 'READY_LOCAL'
        ? []
        : enrichmentTargets(kind, assessment, fields),
  };
}

export interface IntimportLocalSummary {
  products: number;
  existingExact: number;
  readyLocalNoWeb: number;
  webRecommended: number;
  webRequired: number;
  reviewRequired: number;
  familyMatches: number;
  /** Upper bound on external calls if the owner enriches everything under 90%. */
  estimatedMaxExternalCalls: number;
}

/** Products that will never be searched, because local evidence already suffices. */
const NO_WEB_ROUTES = new Set<EnrichmentRoute>(['EXISTING', 'READY_LOCAL']);

/**
 * Run local intelligence over a whole parsed file. Pure and free: this is what
 * the owner sees BEFORE deciding whether to spend anything.
 */
export function runIntimportLocalIntelligence(
  candidates: readonly IntimportCandidate[],
  index: IntimportCanonicalIndex = {},
): { rows: IntimportProductIntelligence[]; summary: IntimportLocalSummary } {
  // INVALID rows have no usable identity and are not products to research.
  const rows = candidates
    .filter((candidate) => candidate.state !== 'INVALID' && candidate.state !== 'DUPLICATE')
    .map((candidate) => assessIntimportProduct(candidate, index));

  const count = (route: EnrichmentRoute) => rows.filter((row) => row.route === route).length;
  const enrichable = rows.filter((row) => !NO_WEB_ROUTES.has(row.route));

  return {
    rows,
    summary: {
      products: rows.length,
      existingExact: count('EXISTING'),
      readyLocalNoWeb: count('READY_LOCAL'),
      webRecommended: count('WEB_RECOMMENDED'),
      webRequired: count('WEB_REQUIRED'),
      reviewRequired: count('REVIEW_REQUIRED'),
      familyMatches: rows.filter((row) => row.familyApplied).length,
      // One targeted call per genuinely missing field, capped per product.
      estimatedMaxExternalCalls: enrichable.reduce(
        (sum, row) => sum + Math.min(row.enrichmentTargets.length, MAX_CALLS_PER_PRODUCT),
        0,
      ),
    },
  };
}

/** Hard per-product ceiling on external calls. */
export const MAX_CALLS_PER_PRODUCT = 3;
