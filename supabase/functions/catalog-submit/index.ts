import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts';
import { evidenceImageDimensionsAllowed } from '../_shared/evidenceImageDimensions.ts';
import { authorizeLiveOverlayIdentity } from '../_shared/liveOverlayIdentity.ts';
import {
  INTIMPORT_PRODUCT_PROFILE_AUTHORITY,
  INTIMPORT_WHOLE_PROFILE_AUTHORITY,
  validateIntimportProductProfileProposal,
  type IntimportMapperAuthorityRow,
  type IntimportTrustedEvidenceProvenance,
  type IntimportTrustedProductProfile,
} from '../_shared/intimportWholeProfileAuthority.ts';
import type { ProfileMatchInput } from '../../../src/features/product-intelligence/mapperValueInference.ts';
import {
  WORKING_NUMERIC_FIELDS,
  type WorkingNumericField,
} from '../../../src/features/product-intelligence/productFieldTruth.ts';
import type {
  EvidenceSource,
  ProductEvidenceField,
  ProductEvidenceInput,
} from '../../../src/features/product-intelligence/productEvidenceConfidence.ts';
import { EVIDENCE_SOURCE_RANK } from '../../../src/features/product-intelligence/productEvidenceConfidence.ts';
import {
  familySupportsInference,
  inferMapperFamily,
} from '../../../src/features/product-intelligence/mapperFamilyInference.ts';
import { isValidGtin } from '../../../src/features/global-catalog/normalization.ts';
import { classifySourceAuthority } from '../_shared/sourceAuthority.ts';
import type { CarbonationEvidence } from '../../../src/data/products/carbonation.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ServiceClient = ReturnType<typeof createClient>;
interface IntakeImageRow {
  id: string;
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  checksum_sha256: string;
  display_order: number;
  role: string;
  state: string;
}

interface CapturedEvidence {
  imagePhashes: string[];
  archivedImagePaths: string[];
  newlyArchivedImagePaths: string[];
  imageChecksums: string[];
  images: Array<{ path: string; mime: IntakeImageRow['mime']; checksum: string }>;
}

interface ServerOcrResult {
  provider: string;
  providerVersion: string;
  overallConfidence: number;
  verifiedFields: Record<string, unknown>;
}

const INGEST_SOURCES = new Set([
  'ocr',
  'barcode',
  'manual',
  'admin',
  'catalog_import',
  'retailer_feed',
  'spreadsheet',
  'supplier_specification',
  'shop',
  'franchise',
  'internal_subproduct',
  'future_integration',
]);

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const MAPPER_AUTHORITY_COLUMNS = [
  'ingredient_id',
  'ingredient_name_internal',
  'ingredient_name_display',
  'brand',
  'ingredient_category',
  'ingredient_subcategory',
  'is_active',
  'approved_for_base',
  'approved_for_engines',
  'verification_status',
  'ean_code',
  'water_percent',
  'total_solids_percent',
  'fat_percent',
  'protein_percent',
  'carbohydrate_percent',
  'total_sugars_percent',
  'sucrose_percent',
  'dextrose_percent',
  'glucose_percent',
  'fructose_percent',
  'lactose_percent',
  'polyol_percent',
  'fiber_percent',
  'salt_percent',
  'alcohol_percent',
  'kcal_per_100g',
  'pod_value',
  'pac_value',
  'sweetness_factor',
  'freezing_factor',
].join(',');

let mapperAuthorityRowsCache: Promise<IntimportMapperAuthorityRow[]> | null = null;

const EVIDENCE_SOURCES = new Set<EvidenceSource>([
  'label',
  'user_confirmed',
  'manufacturer',
  'barcode_registry',
  'retailer',
  'web_search',
  'mapper_exact',
  'mapper_family',
  'source_file',
]);

const EVIDENCE_FIELDS = new Set<ProductEvidenceField>([
  'identity', 'brand', 'manufacturer', 'variant', 'netQuantity', 'ingredients', 'allergens',
  'energyKcal', 'fat', 'carbohydrate', 'protein', 'salt', 'barcode', 'countryOfOrigin',
  'dosage', 'technicalParameters', 'technicalSource',
]);

async function loadMapperAuthorityRows(service: ServiceClient): Promise<IntimportMapperAuthorityRow[]> {
  if (!mapperAuthorityRowsCache) {
    mapperAuthorityRowsCache = (async () => {
      const rows: IntimportMapperAuthorityRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await service
          .from('mapper_basement')
          .select(MAPPER_AUTHORITY_COLUMNS)
          .order('ingredient_id', { ascending: true })
          .range(offset, offset + 999);
        if (error) throw new Error('intimport_mapper_authority_read_failed');
        const page = (data ?? []) as unknown as IntimportMapperAuthorityRow[];
        rows.push(...page);
        if (page.length < 1000) break;
      }
      return rows;
    })().catch((error: unknown) => {
      mapperAuthorityRowsCache = null;
      throw error;
    });
  }
  return mapperAuthorityRowsCache;
}

const comparableText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== ''
    ? value.trim().toLowerCase().replace(/\s+/g, ' ')
    : null;

function serverMatchInput(canonicalInput: Record<string, unknown>): {
  matchInput: ProfileMatchInput;
  sourceProductId: string | null;
} | null {
  const facts = objectValue(canonicalInput.facts);
  const identity = objectValue(facts.catalogImportIdentity);
  if (identity.system !== 'INTIMPORT') return null;
  const raw = objectValue(identity.matchInput);
  if (comparableText(raw.name) !== comparableText(canonicalInput.displayName)) return null;
  if (comparableText(raw.brand) !== comparableText(canonicalInput.brand)) return null;
  // INTIMPORT keeps the source category as evidence while canonicalInput.category
  // carries its mapped catalogue category. They are deliberately not compared:
  // requiring equality would reject every legitimately mapped source label.

  const canonicalCode = String(canonicalInput.ean ?? canonicalInput.barcode ?? '').replace(/\D+/g, '');
  const proposedCode = String(raw.barcode ?? '').replace(/\D+/g, '');
  if (canonicalCode !== proposedCode) return null;

  const technical = objectValue(facts.technicalComposition);
  const rawMacros = objectValue(raw.knownMacros);
  const macroToFact: Readonly<Record<string, string>> = {
    fat_percent: 'fat',
    protein_percent: 'protein',
    carbohydrate_percent: 'carbohydrate',
    total_sugars_percent: 'sugars',
    fiber_percent: 'fibre',
    salt_percent: 'salt',
  };
  const knownMacros: Record<string, number> = {};
  for (const [macro, fact] of Object.entries(macroToFact)) {
    const value = rawMacros[macro];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const persistedValue = technical[fact];
    if (
      typeof persistedValue !== 'number' ||
      !Number.isFinite(persistedValue) ||
      Math.abs(persistedValue - value) > 0.0001
    ) {
      return null;
    }
    knownMacros[macro] = value;
  }

  return {
    matchInput: {
      name: typeof raw.name === 'string' ? raw.name : null,
      variant: typeof raw.variant === 'string' ? raw.variant : null,
      brand: typeof raw.brand === 'string' ? raw.brand : null,
      category: typeof raw.category === 'string' ? raw.category : null,
      subcategory: typeof raw.subcategory === 'string' ? raw.subcategory : null,
      barcode: typeof raw.barcode === 'string' ? raw.barcode : null,
      knownMacros,
      technical: raw.technical === true,
    },
    sourceProductId:
      typeof identity.sourceProductId === 'string' && identity.sourceProductId.trim() !== ''
        ? identity.sourceProductId.trim()
        : null,
  };
}

function serverProductProfileProposal(
  canonicalInput: Record<string, unknown>,
  rawProposal: Record<string, unknown>,
): {
  proposedMapperIngredientId: string | null;
  matchInput: ProfileMatchInput;
  declared: Partial<Record<WorkingNumericField, number>>;
  evidence: ProductEvidenceInput;
  enrichmentEvidenceReceipts: string[];
  sourceProductId: string | null;
} | null {
  const serverInput = serverMatchInput(canonicalInput);
  if (!serverInput) return null;

  const rawDeclared = objectValue(rawProposal.declared);
  const declared: Partial<Record<WorkingNumericField, number>> = {};
  for (const field of WORKING_NUMERIC_FIELDS) {
    const value = rawDeclared[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    declared[field] = value;
  }
  const rawEvidence = objectValue(rawProposal.evidence);
  const allowedProposalKeys = new Set([
    'proposedMapperIngredientId',
    'matchInput',
    'sourceProductId',
    'declared',
    'evidence',
    'enrichmentEvidenceReceipts',
  ]);
  if (Object.keys(rawProposal).some((key) => !allowedProposalKeys.has(key))) return null;
  const allowedEvidenceKeys = new Set([
    'kind',
    'fields',
    'validatedBarcode',
    'exactCanonicalMatch',
    'mapperFamilyMatch',
    'materialConflicts',
  ]);
  if (Object.keys(rawEvidence).some((key) => !allowedEvidenceKeys.has(key))) return null;
  const rawFields = objectValue(rawEvidence.fields);
  const fields: Partial<Record<ProductEvidenceField, EvidenceSource>> = {};
  for (const [field, source] of Object.entries(rawFields)) {
    if (!EVIDENCE_FIELDS.has(field as ProductEvidenceField)) return null;
    if (typeof source !== 'string' || !EVIDENCE_SOURCES.has(source as EvidenceSource)) return null;
    fields[field as ProductEvidenceField] = source as EvidenceSource;
  }
  if (rawEvidence.kind !== 'normal_food' && rawEvidence.kind !== 'technical') return null;
  if (!Array.isArray(rawEvidence.materialConflicts) ||
      rawEvidence.materialConflicts.some((entry) => typeof entry !== 'string')) return null;
  for (const flag of ['validatedBarcode', 'exactCanonicalMatch', 'mapperFamilyMatch'] as const) {
    if (typeof rawEvidence[flag] !== 'boolean') return null;
  }

  // The proposal and the stable catalog-import identity must describe the same
  // source row. A caller cannot swap evidence material after the adapter built
  // the canonical identity envelope.
  const proposedMatch = objectValue(rawProposal.matchInput);
  if (stableJson(proposedMatch) !== stableJson(objectValue(
    objectValue(objectValue(canonicalInput.facts).catalogImportIdentity).matchInput,
  ))) return null;
  const sourceProductId =
    typeof rawProposal.sourceProductId === 'string' && rawProposal.sourceProductId.trim() !== ''
      ? rawProposal.sourceProductId.trim()
      : null;
  if (sourceProductId !== serverInput.sourceProductId) return null;
  const enrichmentEvidenceReceipts = Array.isArray(rawProposal.enrichmentEvidenceReceipts)
    ? rawProposal.enrichmentEvidenceReceipts.filter(
        (entry): entry is string =>
          typeof entry === 'string' && /^[0-9a-f]{64}$/.test(entry),
      )
    : [];
  if (
    enrichmentEvidenceReceipts.length > 8 ||
    enrichmentEvidenceReceipts.length !==
      (Array.isArray(rawProposal.enrichmentEvidenceReceipts)
        ? rawProposal.enrichmentEvidenceReceipts.length
        : 0)
  ) return null;

  return {
    proposedMapperIngredientId:
      typeof rawProposal.proposedMapperIngredientId === 'string'
        ? rawProposal.proposedMapperIngredientId
        : null,
    matchInput: serverInput.matchInput,
    declared,
    evidence: {
      kind: rawEvidence.kind,
      fields,
      validatedBarcode: rawEvidence.validatedBarcode as boolean,
      exactCanonicalMatch: rawEvidence.exactCanonicalMatch as boolean,
      mapperFamilyMatch: rawEvidence.mapperFamilyMatch as boolean,
      materialConflicts: rawEvidence.materialConflicts as string[],
    },
    enrichmentEvidenceReceipts: [...new Set(enrichmentEvidenceReceipts)],
    sourceProductId,
  };
}

type TrustedIntimportEvidence = {
  evidence: ProductEvidenceInput;
  provenance: Partial<Record<ProductEvidenceField, IntimportTrustedEvidenceProvenance>>;
  carbonationEvidence: CarbonationEvidence[];
};

const evidenceValuePresent = (value: unknown): boolean =>
  (typeof value === 'string' && value.trim() !== '') ||
  (typeof value === 'number' && Number.isFinite(value));

const clippedText = (value: unknown, limit: number): string | null =>
  typeof value === 'string' ? value.slice(0, limit) : null;

/**
 * Rebuild the evidence the server is willing to score.
 *
 * Direct facts are derived from the canonical INTIMPORT envelope. Web facts are
 * accepted only when their receipt resolves to this user's service-role usage
 * ledger row, its request hash matches this exact product identity, and the
 * source URL independently reclassifies to the stored authority. Browser tags
 * are compared with this result, never used to manufacture it.
 */
async function trustedIntimportEvidence(input: {
  service: ServiceClient;
  actorUserId: string;
  canonicalInput: Record<string, unknown>;
  proposal: NonNullable<ReturnType<typeof serverProductProfileProposal>>;
}): Promise<TrustedIntimportEvidence | null> {
  const facts = objectValue(input.canonicalInput.facts);
  const source = objectValue(facts.catalogImportSourceEvidence);
  const match = input.proposal.matchInput;
  const sourceUrl =
    clippedText(source.primarySourceUrl, 400) ?? clippedText(source.technicalPdfUrl, 400);
  const manufacturer = clippedText(source.manufacturer, 160);
  const brand = clippedText(input.canonicalInput.brand, 120);
  const sourceAuthority = classifySourceAuthority({
    url: sourceUrl,
    brand,
    manufacturer,
    ownerProvided: true,
  });
  const fields: Partial<Record<ProductEvidenceField, EvidenceSource>> = {};
  const provenance: Partial<Record<ProductEvidenceField, IntimportTrustedEvidenceProvenance>> = {};
  const carbonationEvidence: CarbonationEvidence[] = [];
  const direct = (field: ProductEvidenceField, value: unknown) => {
    if (!evidenceValuePresent(value)) return;
    fields[field] = sourceAuthority.evidenceSource;
    provenance[field] = {
      source: sourceAuthority.evidenceSource,
      sourceUrl,
      sourceDomain: sourceAuthority.domain,
      sourceTitle: null,
      sourceAuthorityClass: sourceAuthority.authority,
      retrievedAt: null,
      evidenceReceipt: null,
    };
  };

  direct('identity', input.canonicalInput.displayName);
  direct('brand', input.canonicalInput.brand);
  direct('manufacturer', source.manufacturer);
  direct('variant', source.variant ?? match.variant);
  direct('netQuantity', source.netQuantity ?? facts.packageSize);
  direct('ingredients', source.ingredients ?? facts.ingredientsText);
  direct('allergens', source.allergens ?? facts.allergensText);
  direct('countryOfOrigin', source.countryOfOrigin);
  direct('dosage', source.dosage);
  direct('technicalParameters', source.technicalParameters);
  direct('technicalSource', source.technicalPdfUrl ?? source.primarySourceUrl);

  const ingredientsAssertion = clippedText(source.ingredients ?? facts.ingredientsText, 2_000);
  if (ingredientsAssertion) {
    carbonationEvidence.push({
      source: 'EXACT_LABEL',
      assertion: ingredientsAssertion,
      assertionPath: 'catalogImportSourceEvidence.ingredients',
      sourceUrl,
      sourceDomain: sourceAuthority.domain,
      sourceAuthorityClass: sourceAuthority.authority,
      evidenceReceipt: null,
      retrievedAt: null,
    });
  }
  const technicalAssertion = clippedText(source.technicalParameters, 2_000);
  const technicalCarbonationSource =
    sourceAuthority.authority === 'AUTHORITATIVE_RETAILER'
      ? 'EXACT_AUTHORITATIVE_RETAILER'
      : sourceAuthority.authority === 'STRUCTURED_PRODUCT_DATABASE'
        ? 'EXACT_EAN_PRODUCT'
        : sourceAuthority.authority.startsWith('OFFICIAL_')
          ? 'EXACT_MANUFACTURER'
          : null;
  if (technicalAssertion && technicalCarbonationSource) {
    carbonationEvidence.push({
      source: technicalCarbonationSource,
      assertion: technicalAssertion,
      assertionPath: 'catalogImportSourceEvidence.technicalParameters',
      sourceUrl,
      sourceDomain: sourceAuthority.domain,
      sourceAuthorityClass: sourceAuthority.authority,
      evidenceReceipt: null,
      retrievedAt: null,
    });
  }

  const nutritionBasis = String(source.nutritionBasis ?? '').toLowerCase().replace(/\s+/g, '');
  const per100g = nutritionBasis === '100g' || nutritionBasis === 'per100g';
  if (per100g) {
    direct('energyKcal', source.energyKcal);
    direct('fat', source.fat);
    direct('carbohydrate', source.carbohydrate);
    direct('protein', source.protein);
    direct('salt', source.salt);
  }

  const barcode = clippedText(match.barcode, 20);
  const validatedBarcode = isValidGtin(barcode);
  if (validatedBarcode) {
    fields.barcode = 'barcode_registry';
    provenance.barcode = {
      source: 'barcode_registry',
      sourceUrl: null,
      sourceDomain: null,
      sourceTitle: null,
      sourceAuthorityClass: 'CHECKSUM_VALIDATED_GTIN',
      retrievedAt: null,
      evidenceReceipt: null,
    };
  }

  const family = inferMapperFamily({
    name: match.name,
    variant: match.variant,
    sourceCategory: match.category,
    sourceSubcategory: match.subcategory,
  });
  const mapperFamilyMatch = familySupportsInference(family);
  if (mapperFamilyMatch) {
    for (const field of ['identity', 'variant'] as const) {
      if (fields[field]) continue;
      fields[field] = 'mapper_family';
      provenance[field] = {
        source: 'mapper_family',
        sourceUrl: null,
        sourceDomain: null,
        sourceTitle: null,
        sourceAuthorityClass: 'MAPPER_FAMILY_INFERENCE',
        retrievedAt: null,
        evidenceReceipt: null,
      };
    }
  }

  const researchIdentity = {
    brand,
    manufacturer,
    name: clippedText(match.name, 200),
    variant: clippedText(match.variant, 160),
    barcode,
    netQuantity: clippedText(source.netQuantity ?? facts.packageSize, 60),
    knownSourceUrl: clippedText(source.primarySourceUrl, 400),
    technicalPdfUrl: clippedText(source.technicalPdfUrl, 400),
  };

  const receipts = input.proposal.enrichmentEvidenceReceipts;
  if (receipts.length > 0) {
    const { data, error } = await input.service
      .from('intimport_enrichment_usage')
      .select('idempotency_key,fields_requested,result_json')
      .eq('user_id', input.actorUserId)
      .in('idempotency_key', receipts);
    if (error || !data || data.length !== receipts.length) return null;
    const byReceipt = new Map(
      data.map((row) => [String(row.idempotency_key), row as Record<string, unknown>]),
    );
    for (const receipt of receipts) {
      const usage = byReceipt.get(receipt);
      if (!usage) return null;
      const requestedFields = Array.isArray(usage.fields_requested)
        ? usage.fields_requested.filter((field): field is string => typeof field === 'string')
        : [];
      const expectedReceipt = await sha256Text(
        stableJson({ identity: researchIdentity, fields: [...requestedFields].sort() }),
      );
      if (expectedReceipt !== receipt) return null;
      const result = objectValue(usage.result_json);
      const resultFacts = Array.isArray(result.facts) ? result.facts : [];
      for (const rawFact of resultFacts) {
        const fact = objectValue(rawFact);
        const field = String(fact.field ?? '') as ProductEvidenceField;
        if (!EVIDENCE_FIELDS.has(field) || !requestedFields.includes(field)) return null;
        const factSourceUrl = clippedText(fact.sourceUrl, 400);
        if (!factSourceUrl || !evidenceValuePresent(fact.value)) return null;
        const authority = classifySourceAuthority({
          url: factSourceUrl,
          brand: researchIdentity.brand,
          manufacturer: researchIdentity.manufacturer,
          ownerProvided: false,
        });
        if (
          authority.authority === 'UNKNOWN' ||
          fact.sourceAuthorityClass !== authority.authority ||
          fact.evidenceSource !== authority.evidenceSource
        ) return null;
        const current = fields[field];
        if (current && EVIDENCE_SOURCE_RANK[current] >= EVIDENCE_SOURCE_RANK[authority.evidenceSource]) {
          continue;
        }
        fields[field] = authority.evidenceSource;
        provenance[field] = {
          source: authority.evidenceSource,
          sourceUrl: factSourceUrl,
          sourceDomain: authority.domain,
          sourceTitle: clippedText(fact.sourceTitle, 300),
          sourceAuthorityClass: authority.authority,
          retrievedAt: clippedText(fact.retrievedAt, 80),
          evidenceReceipt: receipt,
        };
        if (field === 'ingredients') {
          const exactSource =
            authority.authority === 'AUTHORITATIVE_RETAILER'
              ? 'EXACT_AUTHORITATIVE_RETAILER'
              : authority.authority === 'STRUCTURED_PRODUCT_DATABASE'
                ? 'EXACT_EAN_PRODUCT'
                : authority.authority.startsWith('OFFICIAL_')
                  ? 'EXACT_MANUFACTURER'
                  : null;
          if (exactSource) {
            carbonationEvidence.push({
              source: exactSource,
              assertion: String(fact.value).slice(0, 2_000),
              assertionPath: 'enrichment.ingredients',
              sourceUrl: factSourceUrl,
              sourceDomain: authority.domain,
              sourceAuthorityClass: authority.authority,
              evidenceReceipt: receipt,
              retrievedAt: clippedText(fact.retrievedAt, 80),
            });
          }
        }
      }
    }
  }

  const evidence: ProductEvidenceInput = {
    kind: input.proposal.evidence.kind,
    fields,
    validatedBarcode,
    // A clean catalog-import proposal never gets to self-assert existing
    // canonical identity. Duplicate resolution is owned elsewhere by the server.
    exactCanonicalMatch: false,
    mapperFamilyMatch,
    // Conflicts can only reduce authority. They are retained verbatim and never
    // converted into a positive signal.
    materialConflicts: [...input.proposal.evidence.materialConflicts],
  };

  // Reject stale or forged browser evidence. A valid enriched client object is
  // an exact transport copy of the independently rebuilt server truth.
  if (stableJson(evidence) !== stableJson(input.proposal.evidence)) return null;
  return { evidence, provenance, carbonationEvidence };
}

function serverManualProductProfileProposal(
  canonicalInput: Record<string, unknown>,
): {
  matchInput: ProfileMatchInput;
  declared: Partial<Record<WorkingNumericField, number>>;
  declaredBasis: Partial<Record<WorkingNumericField, 'user_confirmed'>>;
  evidence: ProductEvidenceInput;
} | null {
  const facts = objectValue(canonicalInput.facts);
  const nutrition = objectValue(facts.nutrition);
  const name = typeof canonicalInput.displayName === 'string' && canonicalInput.displayName.trim()
    ? canonicalInput.displayName.trim()
    : null;
  const brand = typeof canonicalInput.brand === 'string' && canonicalInput.brand.trim()
    ? canonicalInput.brand.trim()
    : null;
  if (!name || (!brand && canonicalInput.explicitlyUnbranded !== true)) return null;

  const declared: Partial<Record<WorkingNumericField, number>> = {};
  const declaredBasis: Partial<Record<WorkingNumericField, 'user_confirmed'>> = {};
  const macroMap: Readonly<Record<string, WorkingNumericField>> = {
    energyKcal: 'kcal_per_100g', fat: 'fat_percent', protein: 'protein_percent',
    carbohydrate: 'carbohydrate_percent', sugars: 'total_sugars_percent',
    fibre: 'fiber_percent', salt: 'salt_percent',
  };
  if (nutrition.basis === 'per_100g') {
    for (const [key, field] of Object.entries(macroMap)) {
      const value = nutrition[key];
      if (value === undefined || value === null) continue;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
      if (key !== 'energyKcal' && value > 100) return null;
      declared[field] = value;
      declaredBasis[field] = 'user_confirmed';
    }
  }
  const ean = String(canonicalInput.ean ?? canonicalInput.barcode ?? '').replace(/\D+/g, '') || null;
  const fields: Partial<Record<ProductEvidenceField, EvidenceSource>> = {
    identity: 'user_confirmed',
    ...(brand || canonicalInput.explicitlyUnbranded === true ? { brand: 'user_confirmed' as const } : {}),
    ...(typeof facts.packageSize === 'string' && facts.packageSize.trim()
      ? { netQuantity: 'user_confirmed' as const }
      : {}),
    ...(typeof facts.ingredientsText === 'string' && facts.ingredientsText.trim()
      ? { ingredients: 'user_confirmed' as const }
      : {}),
    ...(typeof facts.allergensText === 'string' && facts.allergensText.trim()
      ? { allergens: 'user_confirmed' as const }
      : {}),
    ...(typeof declared.kcal_per_100g === 'number' ? { energyKcal: 'user_confirmed' as const } : {}),
    ...(typeof declared.fat_percent === 'number' ? { fat: 'user_confirmed' as const } : {}),
    ...(typeof declared.carbohydrate_percent === 'number'
      ? { carbohydrate: 'user_confirmed' as const }
      : {}),
    ...(typeof declared.protein_percent === 'number' ? { protein: 'user_confirmed' as const } : {}),
    ...(typeof declared.salt_percent === 'number' ? { salt: 'user_confirmed' as const } : {}),
    ...(ean ? { barcode: 'user_confirmed' as const } : {}),
  };
  return {
    matchInput: {
      name,
      variant: null,
      brand,
      category: typeof canonicalInput.category === 'string' ? canonicalInput.category : null,
      subcategory: null,
      barcode: ean,
      knownMacros: {
        ...(typeof declared.fat_percent === 'number' ? { fat_percent: declared.fat_percent } : {}),
        ...(typeof declared.protein_percent === 'number' ? { protein_percent: declared.protein_percent } : {}),
        ...(typeof declared.carbohydrate_percent === 'number'
          ? { carbohydrate_percent: declared.carbohydrate_percent }
          : {}),
        ...(typeof declared.total_sugars_percent === 'number'
          ? { total_sugars_percent: declared.total_sugars_percent }
          : {}),
        ...(typeof declared.fiber_percent === 'number' ? { fiber_percent: declared.fiber_percent } : {}),
        ...(typeof declared.salt_percent === 'number' ? { salt_percent: declared.salt_percent } : {}),
      },
      technical: false,
    },
    declared,
    declaredBasis,
    evidence: {
      kind: 'normal_food', fields, validatedBarcode: ean !== null,
      exactCanonicalMatch: false, mapperFamilyMatch: false, materialConflicts: [],
    },
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

async function legacyOwnedProductInput(input: {
  service: ServiceClient;
  actorUserId: string;
  productId: string;
}): Promise<Record<string, unknown>> {
  const { data, error } = await input.service
    .from('products')
    .select('*')
    .eq('id', input.productId)
    .eq('owner_user_id', input.actorUserId)
    .maybeSingle();
  if (error || !data) throw new Error('owned_source_product_not_found');
  const extracted = objectValue(data.extracted_json);
  return {
    productKind: 'commercial_product',
    displayName: data.product_name_display,
    originalName: data.product_name_internal,
    originalLanguage: extracted.originalLanguage ?? null,
    brand: data.brand,
    explicitlyUnbranded: extracted.explicitlyUnbranded === true,
    canonicalFamily: null,
    category: data.product_category,
    countryOfOrigin: data.country,
    ean: data.ean_code,
    barcode: data.barcode,
    facts: {
      packageSize: data.package_size,
      allergensText: data.allergens,
      ingredientsText: extracted.ingredientsText ?? null,
      nutrition: {
        basis: extracted.nutritionBasis ?? 'per_100g',
        energyKcal: data.kcal_per_100g,
        fat: data.fat_percent,
        saturatedFat: data.saturated_fat_percent,
        carbohydrate: data.carbohydrate_percent,
        sugars: data.total_sugars_percent,
        protein: data.protein_percent,
        salt: data.salt_percent,
        fibre: data.fiber_percent,
      },
      technicalComposition: {
        water: data.water_percent,
        totalSolids: data.total_solids_percent,
        fat: data.fat_percent,
        saturatedFat: data.saturated_fat_percent,
        protein: data.protein_percent,
        carbohydrate: data.carbohydrate_percent,
        sugars: data.total_sugars_percent,
        fibre: data.fiber_percent,
        salt: data.salt_percent,
      },
    },
    provenance: data.source_type ?? 'ocr',
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function extensionFor(mime: IntakeImageRow['mime']): string {
  return mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'webp';
}

async function hmacRiskValue(value: string | null, secret: string): Promise<string | null> {
  if (!value) return null;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Server-derived 8x8 average hash. It is intentionally evidence/dedup only. */
async function perceptualHash(
  bytes: Uint8Array,
  mime: IntakeImageRow['mime'],
): Promise<string | null> {
  // ImageScript's stable decoder covers PNG/JPEG. WebP stays archived with its
  // cryptographic checksum and simply has no perceptual hash; never fabricate one.
  if (mime === 'image/webp') return null;
  if (!evidenceImageDimensionsAllowed(bytes, mime)) return null;
  try {
    const decoded = await Image.decode(bytes);
    const resized = (await decoded.resize(8, 8)) ?? decoded;
    const luminance: number[] = [];
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        // ImageScript uses 1-based pixel coordinates even though this loop is
        // intentionally 0-based for the 64-bit hash layout.
        const value = resized.getRGBAAt(x + 1, y + 1) as unknown;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 255;
        if (Array.isArray(value) || ArrayBuffer.isView(value)) {
          const channels = Array.from(value as ArrayLike<number>);
          [r = 0, g = 0, b = 0, a = 255] = channels;
        } else if (typeof value === 'number') {
          r = (value >>> 24) & 255;
          g = (value >>> 16) & 255;
          b = (value >>> 8) & 255;
          a = value & 255;
        } else return null;
        const opacity = a / 255;
        const visibleRed = r * opacity + 255 * (1 - opacity);
        const visibleGreen = g * opacity + 255 * (1 - opacity);
        const visibleBlue = b * opacity + 255 * (1 - opacity);
        luminance.push((visibleRed * 299 + visibleGreen * 587 + visibleBlue * 114) / 1000);
      }
    }
    const average = luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
    let hash = '';
    for (let offset = 0; offset < 64; offset += 4) {
      let nibble = 0;
      for (let bit = 0; bit < 4; bit += 1) {
        if (luminance[offset + bit]! >= average) nibble |= 1 << (3 - bit);
      }
      hash += nibble.toString(16);
    }
    return hash;
  } catch {
    return null;
  }
}

async function captureOwnedEvidence(input: {
  service: ServiceClient;
  actorUserId: string;
  ocrSessionId: string;
}): Promise<CapturedEvidence> {
  const { data: session, error: sessionError } = await input.service
    .from('ocr_intake_sessions')
    .select('id,user_id,state')
    .eq('id', input.ocrSessionId)
    .eq('user_id', input.actorUserId)
    .in('state', ['ready_to_save', 'duplicate_blocked', 'saved'])
    .maybeSingle();
  if (sessionError || !session) throw new Error('owned_saved_ocr_session_not_found');

  const { data, error } = await input.service
    .from('ocr_intake_images')
    .select('id,mime,checksum_sha256,display_order,role,state')
    .eq('session_id', input.ocrSessionId)
    .order('display_order', { ascending: true });
  if (error) throw new Error('ocr_evidence_read_failed');

  const phashes: string[] = [];
  const archived: string[] = [];
  const newlyArchived: string[] = [];
  const checksums: string[] = [];
  const images: CapturedEvidence['images'] = [];
  try {
    for (const image of (data ?? []) as IntakeImageRow[]) {
      if (image.state !== 'ready') continue;
      const ext = extensionFor(image.mime);
      const sourcePath = `${input.actorUserId}/${input.ocrSessionId}/${image.id}.${ext}`;
      const { data: source, error: downloadError } = await input.service.storage
        .from('product-intake-images')
        .download(sourcePath);
      if (downloadError || !source) throw new Error(`ocr_evidence_image_missing:${image.id}`);
      const bytes = new Uint8Array(await source.arrayBuffer());
      const actualChecksum = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      )
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      if (actualChecksum !== image.checksum_sha256.toLowerCase()) {
        throw new Error(`ocr_evidence_checksum_mismatch:${image.id}`);
      }
      if (!evidenceImageDimensionsAllowed(bytes, image.mime)) {
        throw new Error(`ocr_evidence_image_dimensions_invalid:${image.id}`);
      }
      const archivePath = `${input.ocrSessionId}/${image.display_order}-${image.id}-${image.checksum_sha256}.${ext}`;
      const { error: archiveError } = await input.service.storage
        .from('global-catalog-evidence')
        .upload(archivePath, bytes, { contentType: image.mime, upsert: false });
      if (archiveError && !/already exists|duplicate/i.test(archiveError.message)) {
        throw new Error(`ocr_evidence_archive_failed:${image.id}`);
      }
      if (!archiveError) newlyArchived.push(archivePath);
      archived.push(archivePath);
      checksums.push(actualChecksum);
      images.push({ path: archivePath, mime: image.mime, checksum: actualChecksum });
      const phash = await perceptualHash(bytes, image.mime);
      if (phash) phashes.push(phash);
    }
  } catch (error) {
    if (newlyArchived.length > 0) {
      await input.service.storage.from('global-catalog-evidence').remove(newlyArchived);
    }
    throw error;
  }
  return {
    imagePhashes: [...new Set(phashes)],
    archivedImagePaths: archived,
    newlyArchivedImagePaths: newlyArchived,
    imageChecksums: checksums,
    images,
  };
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function attestServerOcr(input: {
  service: ServiceClient;
  actorUserId: string;
  ocrSessionId: string;
  evidence: CapturedEvidence;
  expectedPublicSnapshotSha256: string;
  market: string | null;
}): Promise<{ id: string; created: boolean } | null> {
  const endpoint = Deno.env.get('CATALOG_OCR_VERIFY_URL');
  const key = Deno.env.get('CATALOG_OCR_VERIFY_KEY');
  if (!endpoint || !key) return null;
  // A retry of duplicate resolution or manual completion must not pay for OCR
  // again and must not violate the immutable evidence key.
  const { data: prior } = await input.service
    .from('global_catalog_server_ocr_attestations')
    .select('id,verified_fields,image_checksums')
    .eq('source_session_key', input.ocrSessionId);
  const reusable = (prior ?? []).find(
    (row) =>
      row.verified_fields?.sourceProductSnapshotSha256 === input.expectedPublicSnapshotSha256 &&
      (row.verified_fields?.market ?? null) === input.market &&
      JSON.stringify(row.image_checksums) === JSON.stringify(input.evidence.imageChecksums),
  );
  if (reusable?.id) return { id: reusable.id as string, created: false };

  let result: Partial<ServerOcrResult>;
  try {
    const signedImages: Array<{ url: string; mime: string; checksum: string }> = [];
    for (const image of input.evidence.images) {
      const { data, error } = await input.service.storage
        .from('global-catalog-evidence')
        .createSignedUrl(image.path, 15 * 60);
      if (error || !data?.signedUrl) return null;
      signedImages.push({ url: data.signedUrl, mime: image.mime, checksum: image.checksum });
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: input.ocrSessionId,
        images: signedImages,
        // The trusted worker must return the complete normalized public-facts
        // object. SQL compares it byte-for-byte as jsonb to server-built facts;
        // echoing only this hash can never make a product GREEN.
        expectedPublicSnapshotSha256: input.expectedPublicSnapshotSha256,
        market: input.market,
      }),
    });
    if (!response.ok) return null;
    result = (await response.json()) as Partial<ServerOcrResult>;
  } catch {
    // Provider unavailability is an honest fail-closed BLUE/RED outcome, not a
    // generic 409 that strands the customer's manual-completion flow.
    return null;
  }
  if (
    typeof result.provider !== 'string' ||
    typeof result.providerVersion !== 'string' ||
    typeof result.overallConfidence !== 'number' ||
    result.overallConfidence < 0 ||
    result.overallConfidence > 100 ||
    typeof result.verifiedFields !== 'object' ||
    result.verifiedFields === null
  )
    return null;
  if (result.verifiedFields.sourceProductSnapshotSha256 !== input.expectedPublicSnapshotSha256) {
    return null;
  }
  const evidenceSha = await sha256Text(
    JSON.stringify({
      checksums: input.evidence.imageChecksums,
      fields: result.verifiedFields,
      provider: result.provider,
      providerVersion: result.providerVersion,
    }),
  );
  const { data, error } = await input.service
    .from('global_catalog_server_ocr_attestations')
    .upsert(
      {
        actor_user_id: input.actorUserId,
        ocr_session_id: input.ocrSessionId,
        source_session_key: input.ocrSessionId,
        provider: result.provider,
        provider_version: result.providerVersion,
        image_checksums: input.evidence.imageChecksums,
        archived_image_paths: input.evidence.archivedImagePaths,
        verified_fields: result.verifiedFields,
        overall_confidence: result.overallConfidence,
        evidence_sha256: evidenceSha,
      },
      { onConflict: 'source_session_key,evidence_sha256', ignoreDuplicates: false },
    )
    .select('id')
    .single();
  if (error || !data?.id) throw new Error('server_ocr_attestation_save_failed');
  return { id: data.id as string, created: true };
}

async function cleanupUnfinalizedEvidence(input: {
  service: ServiceClient;
  actorUserId: string;
  evidence: CapturedEvidence;
  attestation: { id: string; created: boolean } | null;
}): Promise<void> {
  if (input.attestation?.created) {
    await input.service
      .from('global_catalog_server_ocr_attestations')
      .delete()
      .eq('id', input.attestation.id)
      .eq('actor_user_id', input.actorUserId);
  }
  if (input.evidence.newlyArchivedImagePaths.length > 0) {
    await input.service.storage
      .from('global-catalog-evidence')
      .remove(input.evidence.newlyArchivedImagePaths);
  }
}

async function verifyRiskChallenge(input: {
  token: string | null;
  secret: string | undefined;
  remoteIp: string | null;
}): Promise<boolean> {
  if (!input.token || !input.secret) return false;
  const form = new FormData();
  form.set('secret', input.secret);
  form.set('response', input.token);
  if (input.remoteIp) form.set('remoteip', input.remoteIp);
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const result = (await response.json()) as { success?: boolean };
    return response.ok && result.success === true;
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !serviceKey || !authorization)
    return json({ error: 'catalog_submit_unavailable' }, 503);
  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: auth, error: authError } = await authClient.auth.getUser();
  if (authError || !auth.user) return json({ error: 'authentication_required' }, 401);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const legacyPrivateProductId =
    typeof body.privateProductId === 'string'
      ? body.privateProductId
      : typeof objectValue(body.input).legacyPrivateProductId === 'string'
        ? (objectValue(body.input).legacyPrivateProductId as string)
        : null;
  const source =
    typeof body.source === 'string' ? body.source : legacyPrivateProductId ? 'ocr' : null;
  const ocrSessionId = typeof body.ocrSessionId === 'string' ? body.ocrSessionId : null;
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null;
  if (!source || !INGEST_SOURCES.has(source) || !idempotencyKey) {
    return json({ error: 'missing_or_invalid_required_fields' }, 400);
  }
  if (source === 'ocr' && !ocrSessionId) return json({ error: 'ocr_session_required' }, 400);
  if (idempotencyKey.length > 160) return json({ error: 'invalid_idempotency_key' }, 400);
  const importRunId = typeof body.importRunId === 'string' ? body.importRunId : null;
  const importRowIndex = Number(body.importRowIndex);
  const hasImportRunMetadata =
    importRunId !== null || body.importRowIndex !== null && body.importRowIndex !== undefined;
  if (
    hasImportRunMetadata &&
    (source !== 'catalog_import' ||
      !importRunId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        importRunId,
      ) ||
      !Number.isInteger(importRowIndex) ||
      importRowIndex < 0)
  ) return json({ error: 'invalid_import_run_metadata' }, 400);
  const importSourceRowId =
    typeof body.importSourceRowId === 'string' ? body.importSourceRowId.slice(0, 240) : null;
  const importDisplayName =
    typeof body.importDisplayName === 'string' ? body.importDisplayName.slice(0, 500) : null;
  const market = typeof body.market === 'string' ? body.market.trim().slice(0, 64) : null;
  const retailer = typeof body.retailer === 'string' ? body.retailer.trim().slice(0, 120) : null;
  const packageLanguage =
    typeof body.packageLanguage === 'string' ? body.packageLanguage.trim().slice(0, 24) : null;
  const distinguishingEvidence =
    typeof body.distinguishingEvidence === 'object' && body.distinguishingEvidence !== null
      ? body.distinguishingEvidence
      : {};
  if (JSON.stringify(distinguishingEvidence).length > 8_000)
    return json({ error: 'distinguishing_evidence_too_large' }, 400);
  const suppliedInput = objectValue(body.input);
  const suppliedEvidence = objectValue(body.evidence);
  const privateOverlay = objectValue(body.privateOverlay);
  if (
    JSON.stringify(suppliedInput).length > 200_000 ||
    JSON.stringify(suppliedEvidence).length > 200_000
  ) {
    return json({ error: 'ingest_payload_too_large' }, 400);
  }
  if (JSON.stringify(privateOverlay).length > 32_000)
    return json({ error: 'private_overlay_too_large' }, 400);
  // Prefer gateway-owned address headers. If only X-Forwarded-For is present,
  // use the right-most hop added by the trusted edge rather than the
  // client-spoofable left-most value.
  const forwardedChain =
    request.headers
      .get('x-forwarded-for')
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
  const forwarded =
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    forwardedChain.at(-1) ||
    null;
  const device = typeof body.deviceSignal === 'string' ? body.deviceSignal : null;
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const riskSecret = Deno.env.get('CATALOG_RISK_HMAC_SECRET');
  if (!riskSecret) return json({ error: 'catalog_risk_control_unavailable' }, 503);
  const riskChallengePassed = await verifyRiskChallenge({
    token: typeof body.riskChallengeToken === 'string' ? body.riskChallengeToken : null,
    secret: Deno.env.get('TURNSTILE_SECRET_KEY'),
    remoteIp: forwarded,
  });
  const ipHash = riskSecret ? await hmacRiskValue(forwarded, riskSecret) : null;
  const deviceHash = riskSecret
    ? await hmacRiskValue(device?.slice(0, 512) ?? null, riskSecret)
    : null;
  let canonicalInput: Record<string, unknown>;
  try {
    canonicalInput = legacyPrivateProductId
      ? await legacyOwnedProductInput({
          service,
          actorUserId: auth.user.id,
          productId: legacyPrivateProductId,
        })
      : { ...suppliedInput };
  } catch {
    return json({ error: 'source_product_snapshot_failed' }, 409);
  }
  canonicalInput.market = market;
  canonicalInput.retailer = retailer;
  canonicalInput.packageLanguage = packageLanguage;
  canonicalInput.duplicateDecision =
    body.duplicateDecision === 'same' || body.duplicateDecision === 'different'
      ? body.duplicateDecision
      : null;
  canonicalInput.distinguishingEvidence = distinguishingEvidence;
  if (typeof body.duplicateProductId === 'string')
    canonicalInput.duplicateProductId = body.duplicateProductId;
  if (typeof body.productId === 'string') canonicalInput.productId = body.productId;
  if (body.operation === 'upsert' || body.operation === 'retire')
    canonicalInput.operation = body.operation;

  const suppliedMapperDecision = objectValue(canonicalInput.mapperDecision);
  if (suppliedMapperDecision.authority === INTIMPORT_WHOLE_PROFILE_AUTHORITY) {
    return json({ error: 'browser_intimport_mapper_authority_forbidden' }, 403);
  }
  if (
    objectValue(canonicalInput.trustedProductProfile).authority ===
      INTIMPORT_PRODUCT_PROFILE_AUTHORITY ||
    objectValue(canonicalInput.intimportProductProfileAuthority).authority ===
      INTIMPORT_PRODUCT_PROFILE_AUTHORITY ||
    objectValue(canonicalInput.productProfileAuthority).authority ===
      INTIMPORT_PRODUCT_PROFILE_AUTHORITY
  ) {
    return json({ error: 'browser_intimport_product_profile_authority_forbidden' }, 403);
  }

  let preflightEvidenceIdentity: unknown[] = [];
  if (ocrSessionId) {
    const { data: imageIdentity, error: imageIdentityError } = await service
      .from('ocr_intake_images')
      .select('id,checksum_sha256,display_order,role,state')
      .eq('session_id', ocrSessionId)
      .order('display_order', { ascending: true });
    if (imageIdentityError) return json({ error: 'catalog_evidence_preflight_failed' }, 409);
    preflightEvidenceIdentity = imageIdentity ?? [];
  }

  // Reserve account/IP/device quota before any image download, decode, archive,
  // or external OCR request. The durable reservation survives a later ingest
  // rollback and is consumed by ingest_product_v1.
  const preflightPayloadHash = await sha256Text(
    stableJson({
      source,
      input: canonicalInput,
      evidence: { supplied: suppliedEvidence, images: preflightEvidenceIdentity },
      privateOverlay,
      ocrSessionId,
    }),
  );
  const { data: preflight, error: preflightError } = await service.rpc(
    'preflight_product_ingest_v1',
    {
      p_actor_user_id: auth.user.id,
      p_source: source,
      p_idempotency_key: idempotencyKey,
      p_payload_hash: preflightPayloadHash,
      p_ip_hash: ipHash,
      p_device_hash: deviceHash,
      p_risk_challenge_passed: riskChallengePassed,
      p_ocr_session_id: ocrSessionId,
      p_duplicate_decision: canonicalInput.duplicateDecision,
      p_review_escalation:
        canonicalInput.lifecycleDecision !== undefined ||
        Object.keys(objectValue(canonicalInput.mapperDecision)).length > 0 ||
        Object.keys(objectValue(canonicalInput.mapperCandidate)).length > 0,
    },
  );
  if (preflightError) {
    if (/administrator/i.test(preflightError.message))
      return json({ error: 'administrator_required' }, 403);
    if (/idempotency|payload mismatch/i.test(preflightError.message)) {
      return json({ error: 'idempotency_payload_mismatch' }, 409);
    }
    return json({ error: 'product_ingest_preflight_failed' }, 400);
  }
  const preflightResult = objectValue(preflight);
  if (preflightResult.allowed !== true) {
    return json({
      schemaVersion: 1,
      kind: 'rate_limited',
      productId: null,
      productVersionId: null,
      behaviorBindingId: null,
      status: null,
      verificationMethod: null,
      autoFavorited: false,
      reviewCaseKey: null,
      idempotent: false,
      missingFields: [],
      invalidFields: [],
      duplicateCandidates: [],
      retryAt: preflightResult.retryAt ?? null,
      challengeRequired: preflightResult.challengeRequired === true,
      rateReason: preflightResult.reason ?? 'rate_limited',
    });
  }
  if (typeof preflightResult.reservationId !== 'string') {
    return json({ error: 'product_ingest_preflight_invalid' }, 503);
  }
  const completedResult = objectValue(preflightResult.completedResult);
  if (Object.keys(completedResult).length > 0) {
    if (hasImportRunMetadata && importRunId) {
      const { error: ledgerError } = await service.rpc('record_product_import_row_outcome_v1', {
        p_actor_user_id: auth.user.id,
        p_import_run_id: importRunId,
        p_row_index: importRowIndex,
        p_source_row_id: importSourceRowId,
        p_display_name: importDisplayName,
        p_outcome: 'REUSED',
        p_error: null,
        p_result: completedResult,
      });
      if (ledgerError) return json({ error: 'import_run_ledger_write_failed' }, 409);
    }
    return json({ ...completedResult, idempotent: true });
  }

  let serverProductProfileAuthority: (IntimportTrustedProductProfile & {
    sourceProductId: string | null;
  }) | null = null;
  const productProfileProposal = objectValue(canonicalInput.intimportProductProfileProposal);
  delete canonicalInput.intimportProductProfileProposal;
  const manualProductProfileProposal = objectValue(canonicalInput.manualProductProfileProposal);
  delete canonicalInput.manualProductProfileProposal;
  if (Object.keys(productProfileProposal).length > 0) {
    if (source !== 'catalog_import') {
      return json({ error: 'intimport_product_profile_requires_catalog_import' }, 403);
    }
    const proposal = serverProductProfileProposal(canonicalInput, productProfileProposal);
    if (!proposal) return json({ error: 'intimport_product_profile_input_invalid' }, 409);
    try {
      const trustedEvidence = await trustedIntimportEvidence({
        service,
        actorUserId: auth.user.id,
        canonicalInput,
        proposal,
      });
      if (!trustedEvidence) {
        return json({ error: 'intimport_product_evidence_untrusted' }, 409);
      }
      const authority = validateIntimportProductProfileProposal({
        origin: 'PR',
        proposedMapperIngredientId: proposal.proposedMapperIngredientId,
        matchInput: proposal.matchInput,
        declared: proposal.declared,
        evidence: trustedEvidence.evidence,
        evidenceProvenance: trustedEvidence.provenance,
        carbonationEvidence: trustedEvidence.carbonationEvidence,
        proposedTechnicalComposition: objectValue(objectValue(canonicalInput.facts).technicalComposition),
        rows: await loadMapperAuthorityRows(service),
      });
      if (!authority) return json({ error: 'intimport_product_profile_rejected' }, 409);
      serverProductProfileAuthority = {
        ...authority,
        sourceProductId: proposal.sourceProductId,
      };
    } catch {
      return json({ error: 'intimport_product_profile_unavailable' }, 503);
    }
  }
  if (Object.keys(manualProductProfileProposal).length > 0) {
    if (source !== 'manual' && source !== 'barcode') {
      return json({ error: 'manual_product_profile_requires_interactive_source' }, 403);
    }
    const proposal = serverManualProductProfileProposal(canonicalInput);
    if (!proposal) return json({ error: 'manual_product_profile_input_invalid' }, 409);
    try {
      const authority = validateIntimportProductProfileProposal({
        origin: 'PM',
        proposedMapperIngredientId: null,
        matchInput: proposal.matchInput,
        declared: proposal.declared,
        declaredBasis: proposal.declaredBasis,
        evidence: proposal.evidence,
        proposedTechnicalComposition: objectValue(objectValue(canonicalInput.facts).technicalComposition),
        rows: await loadMapperAuthorityRows(service),
      });
      if (!authority) return json({ error: 'manual_product_profile_rejected' }, 409);
      serverProductProfileAuthority = { ...authority, sourceProductId: null };
    } catch {
      return json({ error: 'manual_product_profile_unavailable' }, 503);
    }
  }

  let evidence: CapturedEvidence = {
    imagePhashes: [],
    archivedImagePaths: [],
    newlyArchivedImagePaths: [],
    imageChecksums: [],
    images: [],
  };
  let serverAttestation: { id: string; created: boolean } | null = null;
  try {
    if (ocrSessionId) {
      evidence = await captureOwnedEvidence({ service, actorUserId: auth.user.id, ocrSessionId });
      const expectedPublicSnapshotSha256 = await sha256Text(JSON.stringify(canonicalInput));
      serverAttestation = await attestServerOcr({
        service,
        actorUserId: auth.user.id,
        ocrSessionId,
        evidence,
        expectedPublicSnapshotSha256,
        market,
      });
    } else {
      serverAttestation = null;
    }
  } catch {
    await cleanupUnfinalizedEvidence({
      service,
      actorUserId: auth.user.id,
      evidence,
      attestation: serverAttestation,
    });
    return json({ error: 'catalog_evidence_verification_failed' }, 409);
  }
  const ingestArguments = {
    p_actor_user_id: auth.user.id,
    p_source: source,
    p_idempotency_key: idempotencyKey,
    p_input: canonicalInput,
    p_evidence: {
      ...suppliedEvidence,
      ocrSessionId,
      archivedImagePaths: evidence.archivedImagePaths,
      imageChecksums: evidence.imageChecksums,
      imagePhashes: evidence.imagePhashes,
      serverAttestationId: serverAttestation?.id ?? null,
    },
    p_private_overlay: privateOverlay,
    p_risk: {
      ipHash,
      deviceHash,
      challengePassed: riskChallengePassed,
      rateReservationId: preflightResult.reservationId,
      disputeReservationId: preflightResult.disputeReservationId ?? null,
      reviewReservationId: preflightResult.reviewReservationId ?? null,
      preflightPayloadHash,
      productProfileAuthority: serverProductProfileAuthority,
    },
  };
  const { data, error } = hasImportRunMetadata && importRunId
    ? await service.rpc('ingest_product_import_row_v1', {
        ...ingestArguments,
        p_import_run_id: importRunId,
        p_row_index: importRowIndex,
        p_source_row_id: importSourceRowId,
        p_display_name: importDisplayName,
      })
    : await service.rpc('ingest_product_v1', ingestArguments);
  if (error) {
    console.error('catalog_product_ingest_failed', {
      source,
      importRunId,
      importRowIndex,
      importSourceRowId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    await cleanupUnfinalizedEvidence({
      service,
      actorUserId: auth.user.id,
      evidence,
      attestation: serverAttestation,
    });
    if (/idempotency|payload mismatch/i.test(error.message))
      return json({ error: 'idempotency_payload_mismatch' }, 409);
    if (/import cancellation requested/i.test(error.message))
      return json({ error: 'import_cancellation_requested' }, 409);
    return json({ error: 'product_ingest_failed' }, 400);
  }
  // The same last hop the Scanner takes. INTIMPORT and a manual entry reach identical
  // capability because they reach it through identical authority — not a copy of it.
  const ingested = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const ingestedProductId =
    typeof ingested.productId === 'string' ? ingested.productId : null;
  const liveOverlay = ingestedProductId
    ? await authorizeLiveOverlayIdentity({
        service,
        actorUserId: auth.user.id,
        productId: ingestedProductId,
      })
    : { authorized: false, reason: 'product_id_missing' };
  return json({
    ...ingested,
    liveOverlay,
    ...(serverProductProfileAuthority
      ? {
          productAccuracy: serverProductProfileAuthority.productAccuracy,
          readiness: serverProductProfileAuthority.readiness,
          engineUsable: serverProductProfileAuthority.engineUsable,
          missingEngineFields: serverProductProfileAuthority.missingEngineFields,
          allergenEvidenceStatus: serverProductProfileAuthority.allergenEvidenceStatus,
          ingredientsEvidenceStatus: serverProductProfileAuthority.ingredientsEvidenceStatus,
        }
      : {}),
  });
});
