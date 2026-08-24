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
import { buildResearchPlan, type ResearchPlan } from './researchPlan';
import {
  profileDonor,
  PROFILE_MATCH_FLOOR,
  type MapperKnowledge,
  type ProfileMatchInput,
} from './mapperValueInference';
import {
  resolveProductWorkingValues,
  type ProductWorkingValues,
  type ValueReadiness,
} from './productWorkingValues';
import { WORKING_NUMERIC_FIELDS, type WorkingNumericField } from './productFieldTruth';
import type { ProductInsert } from '@/data/products/productRow';

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
    /** The owner's technical/specification document — previously never sent. */
    technicalPdfUrl: string | null;
  };
  /** Ordered sources to try, strongest first. Official evidence leads (§4). */
  researchPlan: ResearchPlan;
  /** The exact evidence this assessment was computed from. Enrichment merges
   * new facts into THIS, so the caller never rebuilds it and cannot drift. */
  evidence: ProductEvidenceInput;
  route: EnrichmentRoute;
  /** Fields worth asking the outside world about — nothing else may be searched. */
  enrichmentTargets: ProductEvidenceField[];
  /** The parsed row's own insert, carried so the import handoff needs no re-parse. */
  insert: ProductInsert;
  /**
   * The product's real numeric state, once Mapper knowledge has been applied.
   * Null only when the caller supplied no Mapper — the layer never invents one.
   */
  workingValues: ProductWorkingValues | null;
  /** Exact public inputs used by the frozen whole-profile matcher. */
  profileMatchInput: ProfileMatchInput;
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
/**
 * Read the product's own declared numbers.
 *
 * Per-100 ml is NOT per-100 g and never becomes it here: without a density this
 * layer cannot convert, and converting on an assumed density would manufacture
 * a measurement. Those declarations are dropped, and the Mapper fills the gap
 * as an honest estimate instead.
 */
function declaredNumericValues(
  candidate: IntimportCandidate,
): Partial<Record<WorkingNumericField, number | null>> {
  if (candidate.nutritionBasis !== 'per_100g') return {};
  const declared: Partial<Record<WorkingNumericField, number | null>> = {};
  for (const field of WORKING_NUMERIC_FIELDS) {
    const value = (candidate.insert as ProductInsert as Record<string, unknown>)[field];
    if (typeof value === 'number' && Number.isFinite(value)) declared[field] = value;
  }
  return declared;
}

export function assessIntimportProduct(
  candidate: IntimportCandidate,
  index: IntimportCanonicalIndex = {},
  mapper: MapperKnowledge | null = null,
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
  };

  const assessment = assessProductConfidence(evidence);
  const route = routeBeforeWeb(assessment, { exactCanonicalMatch });
  const targets =
    route === 'EXISTING' || route === 'READY_LOCAL'
      ? []
      : enrichmentTargets(kind, assessment, fields);
  const researchPlan = buildResearchPlan({
    brand: candidate.source.Brand,
    manufacturer: candidate.source.Manufacturer,
    name: candidate.displayName,
    variant: candidate.source['Variant Original'] ?? candidate.source['Variant English'],
    barcode: candidate.ean,
    netQuantity:
      [candidate.source['Net Quantity Value'], candidate.source['Net Quantity Unit']]
        .filter(Boolean)
        .join(' ') || null,
    knownSourceUrl: candidate.source['Primary Source URL'],
    technicalPdfUrl: candidate.source['Technical PDF URL'],
    missingFields: targets,
  });

  const workingValues = mapper
    ? resolveProductWorkingValues(
        {
          declared: declaredNumericValues(candidate),
          // The declaration is only as strong as the source it was curated from,
          // which the confidence assessment has already judged (§9).
          declaredConfidence: assessment.confidence / 100,
          identity: {
            name: candidate.displayName,
            variant: candidate.source['Variant Original'] ?? candidate.source['Variant English'],
            brand: candidate.source.Brand,
            category: candidate.sourceCategory,
            subcategory: candidate.sourceSubcategory,
            barcode: candidate.ean,
          },
          technical: kind === 'technical',
          // INTIMPORT never resolves a manufacturer's dosage authority. The
          // resulting flag is reported so the owner can SEE that the dosage is
          // unproven; it withholds nothing.
          technicalAuthority: false,
        },
        mapper,
      )
    : null;
  const declared = declaredNumericValues(candidate);
  const profileMatchInput: ProfileMatchInput = {
    name: candidate.displayName,
    variant: candidate.source['Variant Original'] ?? candidate.source['Variant English'],
    brand: candidate.source.Brand,
    category: candidate.sourceCategory,
    subcategory: candidate.sourceSubcategory,
    barcode: candidate.ean,
    knownMacros: Object.fromEntries(
      (
        [
          'fat_percent',
          'protein_percent',
          'carbohydrate_percent',
          'total_sugars_percent',
          'fiber_percent',
          'salt_percent',
        ] as const
      ).flatMap((field) =>
        typeof declared[field] === 'number' ? [[field, declared[field]]] : [],
      ),
    ),
    technical: kind === 'technical',
  };

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
      netQuantity:
        [candidate.source['Net Quantity Value'], candidate.source['Net Quantity Unit']]
          .filter(Boolean)
          .join(' ') || null,
      knownSourceUrl: candidate.source['Primary Source URL'],
      technicalPdfUrl: candidate.source['Technical PDF URL'],
    },
    researchPlan,
    evidence,
    route,
    enrichmentTargets: targets,
    insert: candidate.insert,
    workingValues,
    profileMatchInput,
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
  /**
   * Numeric readiness, reported SEPARATELY from the informational
   * dosage-authority flag: a professional product may have a complete
   * composition and an unproven dosage, and neither says anything about
   * the other.
   */
  valueReadiness: Record<ValueReadiness, number> | null;
  /** Products the Mapper gave at least one working field to. */
  mapperContributed: number;
  /** Products whose own declared values contradict each other. */
  selfContradictory: number;
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
  mapper: MapperKnowledge | null = null,
): { rows: IntimportProductIntelligence[]; summary: IntimportLocalSummary } {
  // INVALID rows have no usable identity and are not products to research.
  const rows = candidates
    .filter((candidate) => candidate.state !== 'INVALID' && candidate.state !== 'DUPLICATE')
    .map((candidate) => assessIntimportProduct(candidate, index, mapper));

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
      valueReadiness: mapper
        ? rows.reduce(
            (counts, row) => {
              const state = row.workingValues?.valueReadiness;
              if (state) counts[state] += 1;
              return counts;
            },
            { READY: 0, ESTIMATED_READY: 0, REVIEW: 0 } as Record<ValueReadiness, number>,
          )
        : null,
      mapperContributed: rows.filter((row) => (row.workingValues?.mapperTiersUsed.length ?? 0) > 0)
        .length,
      selfContradictory: rows.filter((row) => row.workingValues?.contradictedByDeclaration).length,
    },
  };
}

/** Hard per-product ceiling on external calls. */
export const MAX_CALLS_PER_PRODUCT = 3;

/* ── import handoff ────────────────────────────────────────────────────────── */

/** What a row may do once it is in the catalogue. Readiness gates USE, not existence.
 *
 * There is no `TECHNICAL_AUTHORITY_REQUIRED` state: its only cause was a missing
 * manufacturer dosage, which is informational (owner decision, 2026-08-23). The
 * fact itself survives as `workingValues.technicalAuthorityRequired`. */
export type ImportedProductState =
  /** Every engine field measured. */
  | 'READY_VERIFIED'
  /** Engine-usable on values a compatible Mapper profile supplied. */
  | 'READY_ESTIMATED'
  /** Stored with whatever is known, but not fit to formulate with. */
  | 'REVIEW';

export interface IntimportImportRow {
  rowIndex: number;
  sourceProductId: string | null;
  displayName: string | null;
  /** The insert to persist, carrying resolved working values and provenance. */
  insert: ProductInsert;
  state: ImportedProductState;
  /** True only when the Engine may formulate with this product. */
  engineUsable: boolean;
}

export interface IntimportImportPlan {
  rows: IntimportImportRow[];
  byState: Record<ImportedProductState, number>;
  engineUsable: number;
}

/**
 * Prepare every valid row for the catalogue, and say what each may be used for.
 *
 * Readiness controls ENGINE USE, not whether a product may exist. A product the
 * owner imported is a product they have; refusing to store it because its water
 * is unknown loses the identity, the label evidence and the enrichment work
 * already done on it. So nothing is dropped here — a REVIEW row is written with
 * everything known about it and simply is not engine-usable, and a professional
 * product is written with its composition regardless of whether its dosage is
 * known — that is the manufacturer's instruction, not our permission.
 *
 * The resolved working values, estimates included, go into the SAME canonical
 * numeric fields a measured product uses, because that is what makes an
 * estimated product usable rather than merely annotated. Every field carries its
 * own provenance so nothing is flattened into a single READY flag.
 */
export function planIntimportImport(
  rows: readonly IntimportProductIntelligence[],
): IntimportImportPlan {
  const planned: IntimportImportRow[] = [];
  const byState: Record<ImportedProductState, number> = {
    READY_VERIFIED: 0,
    READY_ESTIMATED: 0,
    REVIEW: 0,
  };

  for (const row of rows) {
    const values = row.workingValues;
    // Composition decides. A professional product is not held back for missing
    // dosage or process — those are informational and carry no authority.
    const state: ImportedProductState = !values
      ? 'REVIEW'
      : values.valueReadiness === 'READY'
        ? 'READY_VERIFIED'
        : values.valueReadiness === 'ESTIMATED_READY'
          ? 'READY_ESTIMATED'
          : 'REVIEW';

    const insert: ProductInsert = { ...row.insert };
    const provenance: Record<string, unknown> = {};

    if (values) {
      for (const field of WORKING_NUMERIC_FIELDS) {
        const truth = values.fields[field];
        if (truth.value === null) continue;
        // Whatever was resolved is persisted for EVERY state — a REVIEW row
        // keeps its evidence rather than being stored empty and re-derived.
        (insert as Record<string, unknown>)[field] = truth.value;
        provenance[field] = {
          state: truth.provenance.state,
          basis: truth.provenance.basis,
          confidence: truth.provenance.confidence,
          mapperReferences: truth.provenance.mapperReferences,
          algorithmVersion: truth.provenance.algorithmVersion,
          mapperFingerprint: truth.provenance.mapperFingerprint,
        };
      }
    }

    const existing = (insert.extracted_json ?? {}) as Record<string, unknown>;
    const acceptedProfile =
      values?.profileMatch &&
      values.profileMatch.confidence >= PROFILE_MATCH_FLOOR &&
      values.profileMatch.rejected === null
        ? values.profileMatch
        : null;
    const selectedProfile = acceptedProfile ? profileDonor(acceptedProfile) : null;
    (insert as Record<string, unknown>).extracted_json = {
      ...existing,
      productIntelligence: {
        version: 1,
        state,
        engineUsable: state === 'READY_VERIFIED' || state === 'READY_ESTIMATED',
        // Two independent facts, deliberately never folded together.
        compositionReadiness: values?.valueReadiness ?? 'REVIEW',
        // INFORMATIONAL ONLY (owner decision, 2026-08-23). Recorded for audit,
        // explanation, tooltips and diagnostics. It never independently blocks
        // selection, Base use, an Engine calculation, Preview, Apply or Save.
        technicalAuthorityRequired: values?.technicalAuthorityRequired ?? false,
        needsEnrichment: state === 'REVIEW',
        profileMatch: values?.profileMatch
          ? {
              confidence: values.profileMatch.confidence,
              basis: values.profileMatch.basis,
              references: values.profileMatch.references,
              selectedMapperIngredientId: selectedProfile?.ingredient_id ?? null,
            }
          : null,
        // This is a proposal, never an authorization. catalog-submit recomputes
        // the match server-side and will reject any different donor/confidence.
        intimportWholeProfileProposal: selectedProfile
          ? {
              mapperIngredientId: selectedProfile.ingredient_id,
              matchInput: row.profileMatchInput,
              sourceProductId: row.sourceProductId,
            }
          : null,
        fields: provenance,
      },
    };

    byState[state] += 1;
    planned.push({
      rowIndex: row.rowIndex,
      sourceProductId: row.sourceProductId,
      displayName: row.displayName,
      insert,
      state,
      engineUsable: state === 'READY_VERIFIED' || state === 'READY_ESTIMATED',
    });
  }

  return {
    rows: planned,
    byState,
    engineUsable: planned.filter((entry) => entry.engineUsable).length,
  };
}
