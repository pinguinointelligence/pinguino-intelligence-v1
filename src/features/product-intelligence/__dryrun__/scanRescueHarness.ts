/**
 * OFFLINE REPLAY HARNESS for the scanner → Product Intelligence → Rescue path on REAL Mapper rows.
 *
 * Runs exactly what `product-scan-finalize` runs (evidence → deterministic recognition → customer
 * family → proposal → whole-profile authority) for a stored or synthesised scan result. The model
 * step is not available offline; the replay records the deterministic + customer-family
 * classification, which is what staging persisted for the owner products.
 *
 * Shared by the owner-product replay, the regression corpus and the Poland label corpus.
 */
import { existsSync, readFileSync } from 'node:fs';
import type { IntimportMapperAuthorityRow } from '../../../../supabase/functions/_shared/intimportWholeProfileAuthority.ts';
import { validateIntimportProductProfileProposal } from '../../../../supabase/functions/_shared/intimportWholeProfileAuthority.ts';
import { customerProductProfileProposal } from '../../../../supabase/functions/_shared/customerProductProfile.ts';
import { productSemanticEvidenceFromScanResult } from '../../../../supabase/functions/_shared/productScanner.ts';
import {
  applyCustomerProductFamily,
  resolveCustomerProductFamily,
  type CustomerProductFamilyChoice,
} from '../../product-scanner/customerProductFamily';
import type { ProductEvidenceField } from '../productEvidenceConfidence';
import { classifyProductSemantics } from '../productRecognition';
import { loadMapperKnowledgeRows } from './mapperFixture';
import {
  allergensFromIngredients,
  looksLikeIngredientList,
} from '../../../../supabase/functions/_shared/openFoodFactsLookup.ts';

/** Real Mapper rows: the repo's immutable CSV (2089 rows) by default, or a live dump via env. */
export function loadReplayRows(
  dumpPath: string | undefined = process.env['SCAN_RESCUE_REPLAY_MAPPER'],
): IntimportMapperAuthorityRow[] {
  if (dumpPath && existsSync(dumpPath))
    return JSON.parse(readFileSync(dumpPath, 'utf8')) as IntimportMapperAuthorityRow[];
  return loadMapperKnowledgeRows().rows.map((row) => ({
    ...row,
    approved_for_base: row.approved_for_base === true,
    approved_for_engines: row.approved_for_engines === true,
    verification_status: row.verification_status ?? '',
  })) as IntimportMapperAuthorityRow[];
}

export interface ReplayFixture {
  label: string;
  gtin: string;
  customerFamily: CustomerProductFamilyChoice;
  confirmedFields: ProductEvidenceField[];
  scanResult: Record<string, unknown>;
}

export type ReplayOutcome = ReturnType<typeof replayFixture>;

export function replayFixture(
  fixture: ReplayFixture,
  rows: readonly IntimportMapperAuthorityRow[],
) {
  const evidence = productSemanticEvidenceFromScanResult(fixture.scanResult);
  const deterministic = classifyProductSemantics(evidence);
  let recognition = deterministic;
  let familyResolution = resolveCustomerProductFamily(recognition);
  if (familyResolution.status !== 'RESOLVED') {
    recognition = applyCustomerProductFamily(recognition, fixture.customerFamily);
    familyResolution = resolveCustomerProductFamily(recognition);
  }
  const proposal = customerProductProfileProposal({
    scanResult: fixture.scanResult,
    recognitionEvidence: evidence,
    recognition,
    userConfirmedFields: fixture.confirmedFields,
  });
  if (!proposal) throw new Error('proposal rejected');
  const profile = validateIntimportProductProfileProposal({
    origin: 'CUSTOMER_ADDED',
    proposedMapperIngredientId: null,
    matchInput: proposal.matchInput,
    declared: proposal.declared,
    declaredBasis: proposal.declaredBasis,
    evidence: proposal.evidence,
    recognitionEvidence: proposal.recognitionEvidence,
    trustedRecognition: proposal.trustedRecognition,
    rows,
  });
  if (!profile) throw new Error('profile rejected');
  const truth = Object.fromEntries(
    Object.entries(profile.fieldTruth).map(([field, t]) => [
      field,
      {
        value: t!.value,
        state: t!.state,
        basis: t!.basis,
        confidence: t!.confidence,
        refs: t!.mapperReferences,
      },
    ]),
  );
  return {
    label: fixture.label,
    gtin: fixture.gtin,
    recognition: {
      deterministic: {
        archetype: deterministic.productArchetype,
        family: deterministic.ingredientFamily,
        form: deterministic.physicalForm,
        role: deterministic.intendedUsageRole,
        modelRequired: deterministic.modelRequired,
        modelReasonCodes: deterministic.modelReasonCodes,
        compatibleMapperCategories: deterministic.compatibleMapperCategories,
      },
      final: {
        source: recognition.classificationSource,
        archetype: recognition.productArchetype,
        family: recognition.ingredientFamily,
        form: recognition.physicalForm,
        role: recognition.intendedUsageRole,
        modelRequired: recognition.modelRequired,
        modelReasonCodes: recognition.modelReasonCodes,
        compatibleMapperCategories: recognition.compatibleMapperCategories,
        familyResolution: familyResolution.status,
      },
    },
    declaredNutritionBasis: proposal.declaredNutritionBasis,
    normalizationBasis: proposal.normalizationBasis,
    mapper: {
      candidatesBeforeFilter: profile.mapperCandidatesBeforeFilter,
      candidatesAfterFilter: profile.mapperCandidatesAfterFilter,
      rejected: profile.mapperRejectedCandidates,
      donor: profile.profileReferenceMapperIngredientId,
      similarity: profile.mapperSimilarity,
      basis: profile.mapperProfileBasis,
      estimatedFromMapperIds: profile.estimatedFromMapperIds,
      hintCategories: profile.mapperSemanticHintCategories ?? [],
      verified: profile.mapperVerifiedMatch ?? null,
    },
    fieldTruth: truth,
    missingEngineFields: profile.missingEngineFields,
    criticalPhysicsBlockers: profile.criticalPhysicsBlockers,
    sweetnessPath: {
      kind: profile.sweetnessPath.kind,
      resolved: profile.sweetnessPath.resolved,
      reason: profile.sweetnessPath.reason,
    },
    readiness: profile.readiness,
    engineUsable: profile.engineUsable,
    productAccuracy: profile.productAccuracy,
    roleReadiness: profile.productAccuracyAssessment.roleReadiness,
    ready: profile.productAccuracyAssessment.gellattiReadiness.ready,
    blockers: profile.productAccuracyAssessment.criticalBlockers,
    profile,
  };
}

/** A retail label as the workbook/registry states it (per 100 g or per 100 ml). */
export interface LabelCorpusRow {
  id: string;
  category: string;
  subcategory: string | null;
  brand: string | null;
  name: string;
  variant: string | null;
  netQuantity: number | null;
  unit: string | null;
  ingredients: string | null;
  allergens: string | null;
  basis: 'per_100g' | 'per_100ml';
  energyKj: number | null;
  energyKcal: number | null;
  fat: number | null;
  saturatedFat: number | null;
  carbohydrate: number | null;
  sugars: number | null;
  fibre: number | null;
  protein: number | null;
  salt: number | null;
  gtin: string | null;
  dosage: string | null;
  technicalParameters: string | null;
}

const gtin13CheckDigit = (body12: string): string => {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
};

const validGtin13 = (value: string): boolean =>
  /^\d{13}$/.test(value) && gtin13CheckDigit(value.slice(0, 12)) === value[12];

/**
 * A deterministic restricted-circulation GTIN (prefix 200) for a label row the workbook
 * lists without a code — offline replay needs an exact identity, the number never leaves it.
 */
export function syntheticGtin13(seed: string): string {
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const body = `200${String(h).padStart(9, '0').slice(0, 9)}`;
  return `${body}${gtin13CheckDigit(body)}`;
}

/** The scanner's post-research result shape for one label row (manufacturer-sourced facts). */
export function scanResultFromLabelRow(row: LabelCorpusRow): {
  gtin: string;
  scanResult: Record<string, unknown>;
  confirmedFields: ProductEvidenceField[];
} {
  const gtin =
    row.gtin && validGtin13(row.gtin.padStart(13, '0'))
      ? row.gtin.padStart(13, '0')
      : syntheticGtin13(row.id);
  const nutrition: Record<string, unknown> = { basis: row.basis };
  const fieldsUsed = ['nutrition.basis'];
  const confirmed: ProductEvidenceField[] = ['identity', 'nutritionBasis'];
  if (row.brand) confirmed.push('brand');
  const pairs: Array<[string, number | null, string, ProductEvidenceField]> = [
    ['energyKcal', row.energyKcal, 'nutrition.energyKcal', 'energyKcal'],
    ['fat', row.fat, 'nutrition.fat', 'fat'],
    ['carbohydrate', row.carbohydrate, 'nutrition.carbohydrate', 'carbohydrate'],
    ['sugars', row.sugars, 'nutrition.sugars', 'sugars'],
    ['fibre', row.fibre, 'nutrition.fibre', 'fiber'],
    ['protein', row.protein, 'nutrition.protein', 'protein'],
    ['salt', row.salt, 'nutrition.salt', 'salt'],
  ];
  for (const [key, value, path, field] of pairs) {
    if (value === null) continue;
    nutrition[key] = value;
    fieldsUsed.push(path);
    confirmed.push(field);
  }
  // the same gate and the same allergen reading the server applies to a registry record
  const ingredients = looksLikeIngredientList(row.ingredients) ? row.ingredients : null;
  if (ingredients) {
    fieldsUsed.push('ingredientsText');
    confirmed.push('ingredients');
  }
  const allergens = row.allergens ?? (ingredients ? allergensFromIngredients(ingredients) : null);
  if (allergens) {
    fieldsUsed.push('allergensText');
    confirmed.push('allergens');
  }
  const technical = row.dosage || row.technicalParameters;
  return {
    gtin,
    confirmedFields: confirmed,
    scanResult: {
      claims: [],
      package: {
        unit: row.unit,
        netQuantity: row.netQuantity,
        netQuantityText:
          row.netQuantity !== null ? `${row.netQuantity} ${row.unit ?? ''}`.trim() : null,
      },
      barcodes: [{ value: gtin, format: 'EAN_13' }],
      identity: {
        brand: row.brand,
        displayName: row.name,
        variant: row.variant,
        originalName: row.name,
        category: row.subcategory ?? row.category,
        labelLanguages: ['pl'],
        countryOfOrigin: null,
        explicitlyUnbranded: row.brand === null,
      },
      warnings: [],
      conflicts: [],
      evidence: [],
      nutrition,
      manufacturer: null,
      allergensText: allergens,
      missingFields: [],
      schemaVersion: 'gellatti_product_scan_v1',
      ingredientsText: ingredients,
      mayContainAllergens: [],
      storageInstructions: null,
      productionDeclarations: {
        brix: null,
        alcoholAbv: null,
        dosageText: row.dosage,
        formDeclaration: null,
        concentrationText: null,
        cocoaButterPercent: null,
        cocoaSolidsPercent: null,
        fruitContentPercent: null,
        technicalParametersText: technical ? (row.technicalParameters ?? row.dosage) : null,
      },
      externalSources: [
        {
          url: 'https://retailer.example.test/product',
          title: 'retailer product card',
          fieldsUsed,
          sourceType: 'manufacturer',
        },
      ],
    },
  };
}
