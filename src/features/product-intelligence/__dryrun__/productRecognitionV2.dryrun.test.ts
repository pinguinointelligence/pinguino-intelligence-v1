import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseINTIMPORT } from '@/data/products/intimport';
import {
  runIntimportLocalIntelligence,
  type IntimportProductIntelligence,
} from '../intimportIntelligence';
import {
  classifyProductSemantics,
  evaluateMapperSemanticCompatibility,
  type ProductIntendedUsageRole,
} from '../productRecognition';
import { buildMapperKnowledge, profileDonor } from '../mapperValueInference';
import { loadMapperKnowledgeRows, MAPPER_FILE } from './mapperFixture';

const POLAND_FILE = join(homedir(), 'Desktop', 'PL_Poland.csv');
const ACCEPTED_OWNER_AUDIT =
  process.env.PRODUCT_RECOGNITION_V2_BASELINE ??
  join(
    homedir(),
    '.codex',
    'outputs',
    'poland_820_preimport_owner_audit_20260825',
    'POLAND_820_PREIMPORT_OWNER_AUDIT.csv',
  );
const OUTPUT_DIR =
  process.env.PRODUCT_RECOGNITION_V2_OUTPUT_DIR ??
  join(homedir(), '.codex', 'outputs', 'product_recognition_v2_20260825');

type CsvRecord = Record<string, string>;
type Readiness = 'ENGINE_READY' | 'REVIEW' | 'BLOCKED' | 'IDENTITY_CONFLICT';
type MapperAuditRole = ProductIntendedUsageRole | 'REVIEW';

const parseCsv = (text: string): string[][] => {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (row.length > 0 || field) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
};

const csvRecords = (path: string): CsvRecord[] => {
  const [header = [], ...rows] = parseCsv(readFileSync(path, 'utf8'));
  return rows
    .filter((row) => row.some((entry) => entry !== ''))
    .map((row) => Object.fromEntries(header.map((column, index) => [column, row[index] ?? ''])));
};

const csvCell = (value: unknown): string => {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const writeCsv = (name: string, rows: readonly Record<string, unknown>[]): string => {
  const path = join(OUTPUT_DIR, name);
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const body = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\n');
  writeFileSync(path, `\uFEFF${body}\n`);
  return path;
};

const countBy = <T extends string>(values: readonly T[]): Record<T, number> =>
  values.reduce(
    (counts, value) => {
      counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    },
    {} as Record<T, number>,
  );

const finalStatus = (row: IntimportProductIntelligence): Readiness =>
  row.recognitionTrace.finalStatus;

const sourceEvidence = (row: IntimportProductIntelligence): string =>
  [
    row.recognition.manufacturerCategory,
    row.recognition.manufacturerSubcategory,
    row.recognitionEvidence.description,
    row.recognitionEvidence.dosage,
  ]
    .filter(Boolean)
    .join(' | ');

const mapperRole = (role: ProductIntendedUsageRole, modelRequired: boolean): MapperAuditRole =>
  role === 'NEITHER_REVIEW' || modelRequired ? 'REVIEW' : role;

const reviewTransition = (row: IntimportProductIntelligence, baseline: CsvRecord): string => {
  if (finalStatus(row) === 'ENGINE_READY') return 'AUTOMATICALLY_RESOLVED';
  const oldReasons = `${baseline.review_reason_codes} ${baseline.review_explanation}`.toLowerCase();
  if (
    oldReasons.includes('source_conflict') ||
    oldReasons.includes('source_contradiction') ||
    oldReasons.includes('source contradiction')
  ) {
    return 'SOURCE_CONTRADICTION';
  }
  if (
    row.workingValues?.engineReady !== true &&
    (baseline.missing_critical_physics !== 'UNKNOWN' || oldReasons.includes('physics'))
  )
    return 'STILL_PHYSICS_UNRESOLVED';
  if (
    row.researchPlan.steps.length > 0 &&
    (row.researchIdentity.knownSourceUrl || row.researchIdentity.technicalPdfUrl)
  )
    return 'STILL_WEB_RESOLVABLE';
  return 'STILL_LABEL_OR_USER_DATA_REQUIRED';
};

const blockedTransition = (row: IntimportProductIntelligence): string => {
  if (finalStatus(row) === 'REVIEW') return 'REVIEW';
  if (row.recognition.isTechnicalProduct && finalStatus(row) === 'BLOCKED') {
    return 'TRUE_TECHNICAL_BLOCKED';
  }
  if (row.recognition.intendedUsageRole === 'TOPPING_ONLY') return 'TOPPING_ONLY';
  if (row.recognition.intendedUsageRole === 'BASE_AND_TOPPING') return 'BASE_AND_TOPPING';
  if (row.recognition.intendedUsageRole === 'BASE_ONLY' && finalStatus(row) === 'ENGINE_READY')
    return 'NORMAL_BASE';
  return 'REVIEW';
};

describe.runIf(existsSync(POLAND_FILE) && existsSync(ACCEPTED_OWNER_AUDIT))(
  'Product Recognition V2 — complete read-only Poland and Mapper audit',
  () => {
    it('writes complete decision traces without changing Poland, Mapper, or runtime data', () => {
      const polandBefore = createHash('sha256').update(readFileSync(POLAND_FILE)).digest('hex');
      const mapperBefore = createHash('sha256').update(readFileSync(MAPPER_FILE)).digest('hex');
      const parsed = parseINTIMPORT(readFileSync(POLAND_FILE, 'utf8'));
      const baselineRows = csvRecords(ACCEPTED_OWNER_AUDIT);
      const baselineByProduct = new Map(baselineRows.map((row) => [row.source_product_id, row]));
      const { rows: mapperRows, fingerprint } = loadMapperKnowledgeRows();
      const mapper = buildMapperKnowledge(mapperRows, fingerprint);
      const { rows } = runIntimportLocalIntelligence(parsed.candidates, {}, mapper);

      expect(rows).toHaveLength(820);
      expect(mapperRows).toHaveLength(2088);
      expect(baselineRows).toHaveLength(820);
      expect(baselineByProduct.size).toBe(820);
      expect(countBy(baselineRows.map((row) => row.final_status ?? ''))).toMatchObject({
        ENGINE_READY: 186,
        REVIEW: 373,
        BLOCKED: 258,
        IDENTITY_CONFLICT: 3,
      });

      const traceRows = rows.map((row) => {
        const donor = row.workingValues?.profileMatch
          ? profileDonor(row.workingValues.profileMatch)
          : null;
        const donorDecision = donor
          ? evaluateMapperSemanticCompatibility(row.recognition, {
              ingredientId: donor.ingredient_id,
              name: donor.ingredient_name_display ?? donor.ingredient_name_internal,
              category: donor.ingredient_category ?? null,
              subcategory: donor.ingredient_subcategory ?? null,
              brand: donor.brand ?? null,
              gtin: donor.ean_code ?? null,
            })
          : null;
        const suspiciousReasons = [
          ...(donorDecision && !donorDecision.compatible ? donorDecision.reasonCodes : []),
          ...(row.recognition.modelRequired && finalStatus(row) === 'ENGINE_READY'
            ? ['ENGINE_READY_WITH_UNRESOLVED_SEMANTICS']
            : []),
        ];
        return {
          source_row: row.rowIndex,
          source_product_id: row.sourceProductId,
          product_name: row.displayName,
          manufacturer: row.recognitionEvidence.manufacturer ?? row.recognitionEvidence.brand,
          old_status: baselineByProduct.get(row.sourceProductId ?? '')?.final_status ?? 'MISSING',
          final_status: finalStatus(row),
          semantic_classification_source: row.recognition.classificationSource,
          semantic_confidence: row.recognition.confidence,
          product_archetype: row.recognition.productArchetype,
          ingredient_family: row.recognition.ingredientFamily,
          physical_form: row.recognition.physicalForm,
          final_role: row.recognition.intendedUsageRole,
          professional: row.recognition.isProfessionalProduct,
          technical: row.recognition.isTechnicalProduct,
          dosage_dependent: row.recognition.isDosageDependent,
          dosage_semantics: row.recognition.dosage.semantics,
          dosage_value: row.recognition.dosage.value,
          dosage_unit: row.recognition.dosage.unit,
          dosage_basis: row.recognition.dosage.basis,
          density_resolved: row.recognition.dosage.densityResolved,
          mapper_candidates_before_filter: row.recognitionTrace.mapperCandidatesBeforeFilter,
          mapper_candidates_after_filter: row.recognitionTrace.mapperCandidatesAfterFilter,
          selected_mapper_donor: row.recognitionTrace.selectedMapperDonor,
          mapper_similarity: row.recognitionTrace.mapperSimilarity,
          rejected_mapper_candidates: row.recognitionTrace.rejectedMapperCandidates,
          product_behavior_status: row.productBehaviorAuthority.classificationOutcome,
          base_eligible_candidate: row.productBehaviorAuthority.baseRecipeEligible,
          topping_eligible_candidate: row.productBehaviorAuthority.toppingEligible,
          suspicious_donor: suspiciousReasons.length > 0,
          suspicious_donor_reasons: suspiciousReasons,
          final_reason_codes: row.recognitionTrace.finalReasonCodes,
          exact_evidence: sourceEvidence(row),
        };
      });

      const newCounts = countBy(rows.map(finalStatus));
      const roleCounts = countBy(rows.map((row) => row.recognition.intendedUsageRole));
      const previousBlocked = rows
        .filter(
          (row) => baselineByProduct.get(row.sourceProductId ?? '')?.final_status === 'BLOCKED',
        )
        .map((row) => ({
          source_product_id: row.sourceProductId,
          product_name: row.displayName,
          manufacturer: row.recognitionEvidence.manufacturer ?? row.recognitionEvidence.brand,
          transition: blockedTransition(row),
          new_status: finalStatus(row),
          archetype: row.recognition.productArchetype,
          family: row.recognition.ingredientFamily,
          form: row.recognition.physicalForm,
          role: row.recognition.intendedUsageRole,
          technical: row.recognition.isTechnicalProduct,
          dosage: row.recognition.dosage,
          exact_evidence: sourceEvidence(row),
          reason_codes: row.recognitionTrace.finalReasonCodes,
        }));
      const previousReview = rows
        .filter(
          (row) => baselineByProduct.get(row.sourceProductId ?? '')?.final_status === 'REVIEW',
        )
        .map((row) => {
          const baseline = baselineByProduct.get(row.sourceProductId ?? '')!;
          return {
            source_product_id: row.sourceProductId,
            product_name: row.displayName,
            manufacturer: row.recognitionEvidence.manufacturer ?? row.recognitionEvidence.brand,
            transition: reviewTransition(row, baseline),
            new_status: finalStatus(row),
            role: row.recognition.intendedUsageRole,
            old_reason_codes: baseline.review_reason_codes,
            new_reason_codes: row.recognitionTrace.finalReasonCodes,
            research_sources_available: row.researchPlan.steps.length,
            missing_critical_physics: baseline.missing_critical_physics,
          };
        });
      const blockedCounts = countBy(previousBlocked.map((row) => row.transition));
      const reviewCounts = countBy(previousReview.map((row) => row.transition));

      const mapperAudit = mapperRows.map((row) => {
        const recognition = classifyProductSemantics({
          name: row.ingredient_name_display ?? row.ingredient_name_internal,
          brand: row.brand ?? null,
          manufacturer: row.brand ?? null,
          manufacturerCode: row.ingredient_id,
          gtin: row.ean_code ?? null,
          productType: 'mapper_reference',
          category: row.ingredient_category ?? null,
          subcategory: row.ingredient_subcategory ?? null,
          variant: null,
          ingredients: null,
          nutrition: null,
          description: null,
          dosage: null,
          technicalParameters: null,
          sourceUrls: [],
        });
        return {
          product_id: row.ingredient_id,
          name: row.ingredient_name_display ?? row.ingredient_name_internal,
          manufacturer: row.brand ?? null,
          category: row.ingredient_category ?? null,
          subcategory: row.ingredient_subcategory ?? null,
          current_approved_for_base: row.approved_for_base === true,
          proposed_role: mapperRole(recognition.intendedUsageRole, recognition.modelRequired),
          proposed_usable_in_base:
            ['BASE_ONLY', 'BASE_AND_TOPPING'].includes(recognition.intendedUsageRole) &&
            !recognition.modelRequired,
          proposed_usable_as_topping:
            ['TOPPING_ONLY', 'BASE_AND_TOPPING'].includes(recognition.intendedUsageRole) &&
            !recognition.modelRequired,
          archetype: recognition.productArchetype,
          family: recognition.ingredientFamily,
          form: recognition.physicalForm,
          confidence: recognition.confidence,
          classification_source: recognition.classificationSource,
          evidence: [
            row.ingredient_name_internal,
            row.ingredient_category,
            row.ingredient_subcategory,
          ]
            .filter(Boolean)
            .join(' | '),
          reason: recognition.reasonCodes,
        };
      });
      const mapperRoleCounts = countBy(mapperAudit.map((row) => row.proposed_role));

      const dosage = {
        gPerLParsed: rows.filter((row) => row.recognition.dosage.unit === 'G_PER_L').length,
        asDesired: rows.filter((row) => row.recognition.dosage.unit === 'AS_DESIRED').length,
        densityResolved: rows.filter((row) => row.recognition.dosage.densityResolved).length,
        basisUnknownOrReview: rows.filter(
          (row) =>
            row.recognition.dosage.semantics === 'UNKNOWN' ||
            (row.recognition.dosage.semantics === 'FIXED' &&
              row.recognition.dosage.basis === 'UNKNOWN'),
        ).length,
      };
      const carbonation = countBy(rows.map((row) => row.carbonation.status));
      const suspiciousReady = traceRows.filter(
        (row) => row.final_status === 'ENGINE_READY' && row.suspicious_donor,
      );
      const toppingPoland = traceRows.filter((row) => row.final_role === 'TOPPING_ONLY');
      const toppingMapper = mapperAudit.filter((row) => row.proposed_role === 'TOPPING_ONLY');

      mkdirSync(OUTPUT_DIR, { recursive: true });
      const artifacts = {
        traces: writeCsv('POLAND_820_RECOGNITION_V2_TRACE.csv', traceRows),
        readyQuality: writeCsv(
          'POLAND_820_ENGINE_READY_QUALITY_AUDIT.csv',
          traceRows.filter((row) => row.final_status === 'ENGINE_READY'),
        ),
        previousBlocked: writeCsv('POLAND_820_PREVIOUS_258_TRANSITIONS.csv', previousBlocked),
        previousReview: writeCsv('POLAND_820_PREVIOUS_373_TRANSITIONS.csv', previousReview),
        toppingPoland: writeCsv('POLAND_820_TOPPING_ONLY.csv', toppingPoland),
        mapperAudit: writeCsv('MAPPER_2088_ROLE_AUDIT.csv', mapperAudit),
        toppingMapper: writeCsv('MAPPER_2088_TOPPING_ONLY.csv', toppingMapper),
      };
      const summary = {
        generatedAt: new Date().toISOString(),
        execution: {
          mode: 'READ_ONLY_LOCAL_DETERMINISTIC',
          polandImportStarted: false,
          mapperMutated: false,
          modelCalls: 0,
          cacheHits: 0,
          note: 'Ambiguous semantic cases remain REVIEW; no paid model call was forced by this audit.',
        },
        fingerprints: {
          polandCsvSha256: polandBefore,
          mapperCsvSha256: mapperBefore,
          mapperKnowledgeFingerprint: fingerprint,
        },
        before: { ENGINE_READY: 186, REVIEW: 373, BLOCKED: 258, IDENTITY_CONFLICT: 3 },
        after: newCounts,
        polandRoles: roleCounts,
        previous258: blockedCounts,
        previous373: reviewCounts,
        mapperRoles: mapperRoleCounts,
        dosage,
        carbonation,
        readyQuality: {
          checked: traceRows.filter((row) => row.final_status === 'ENGINE_READY').length,
          suspicious: suspiciousReady.length,
        },
        semanticHardContradictions: traceRows.reduce(
          (sum, row) => sum + row.rejected_mapper_candidates.length,
          0,
        ),
        artifacts,
      };
      writeFileSync(
        join(OUTPUT_DIR, 'PRODUCT_RECOGNITION_V2_SUMMARY.json'),
        `${JSON.stringify(summary, null, 2)}\n`,
      );
      writeFileSync(
        join(OUTPUT_DIR, 'PRODUCT_RECOGNITION_V2_SUMMARY.md'),
        [
          '# Product Recognition V2 — read-only audit',
          '',
          `- Poland: ${rows.length}; Mapper: ${mapperRows.length}`,
          `- OLD: 186 / 373 / 258 / 3`,
          `- NEW: ${newCounts.ENGINE_READY ?? 0} / ${newCounts.REVIEW ?? 0} / ${newCounts.BLOCKED ?? 0} / ${newCounts.IDENTITY_CONFLICT ?? 0}`,
          `- Poland roles: ${JSON.stringify(roleCounts)}`,
          `- Previous 258: ${JSON.stringify(blockedCounts)}`,
          `- Previous 373: ${JSON.stringify(reviewCounts)}`,
          `- Mapper roles: ${JSON.stringify(mapperRoleCounts)}`,
          `- Dosage: ${JSON.stringify(dosage)}`,
          `- Carbonation: ${JSON.stringify(carbonation)}`,
          `- Suspicious READY donors: ${suspiciousReady.length}`,
          '- Model calls/cache hits: 0/0 (deterministic read-only census)',
          '- Import: NO; Mapper mutation: NO',
          '',
        ].join('\n'),
      );

      expect(previousBlocked).toHaveLength(258);
      expect(previousReview).toHaveLength(373);
      expect(Object.values(newCounts).reduce((sum, value) => sum + value, 0)).toBe(820);
      expect(Object.values(blockedCounts).reduce((sum, value) => sum + value, 0)).toBe(258);
      expect(Object.values(reviewCounts).reduce((sum, value) => sum + value, 0)).toBe(373);
      expect(Object.values(mapperRoleCounts).reduce((sum, value) => sum + value, 0)).toBe(2088);
      expect(suspiciousReady).toHaveLength(0);
      expect(createHash('sha256').update(readFileSync(POLAND_FILE)).digest('hex')).toBe(
        polandBefore,
      );
      expect(createHash('sha256').update(readFileSync(MAPPER_FILE)).digest('hex')).toBe(
        mapperBefore,
      );

      console.log(`PRODUCT_RECOGNITION_V2_AUDIT ${JSON.stringify(summary, null, 2)}`);
    }, 20_000);
  },
);
