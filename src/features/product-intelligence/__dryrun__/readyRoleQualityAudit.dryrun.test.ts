import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseINTIMPORT } from '@/data/products/intimport';
import { WORKING_NUMERIC_FIELDS } from '../productFieldTruth';
import { runIntimportLocalIntelligence } from '../intimportIntelligence';
import { evaluateMapperSemanticCompatibility } from '../productRecognition';
import { buildMapperKnowledge, profileDonor } from '../mapperValueInference';
import { loadMapperKnowledgeRows, MAPPER_FILE } from './mapperFixture';

const POLAND_FILE = join(homedir(), 'Desktop', 'PL_Poland.csv');
const PRIOR_FINAL_TRACE =
  process.env.READY_ROLE_PRIOR_TRACE ??
  join(
    homedir(),
    '.codex',
    'outputs',
    'recognition-v2-proof-20260825T081405Z',
    'POLAND_820_RECOGNITION_V2_FINAL_TRACE.csv',
  );
const OUTPUT_DIR =
  process.env.READY_ROLE_AUDIT_OUTPUT_DIR ??
  join(homedir(), '.codex', 'outputs', 'poland_138_ready_role_quality_audit_20260825');

type CsvRecord = Record<string, string>;

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

const writeCsv = (path: string, rows: readonly Record<string, unknown>[]): void => {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const body = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\n');
  writeFileSync(path, `\uFEFF${body}\n`);
};

describe.runIf(existsSync(POLAND_FILE) && existsSync(PRIOR_FINAL_TRACE))(
  'final quality audit of the accepted 138 Recognition V2 READY rows',
  () => {
    it('keeps no semantically suspicious article READY and writes the owner artifact', () => {
      const polandBefore = createHash('sha256').update(readFileSync(POLAND_FILE)).digest('hex');
      const mapperBefore = createHash('sha256').update(readFileSync(MAPPER_FILE)).digest('hex');
      const priorRows = csvRecords(PRIOR_FINAL_TRACE);
      const priorReady = priorRows.filter((row) => row.final_status === 'ENGINE_READY');
      const priorTopping = priorRows.filter((row) => row.role === 'TOPPING_ONLY');
      const priorById = new Map(priorReady.map((row) => [row.source_product_id, row]));
      const parsed = parseINTIMPORT(readFileSync(POLAND_FILE, 'utf8'));
      const { rows: mapperRows, fingerprint } = loadMapperKnowledgeRows();
      const mapper = buildMapperKnowledge(mapperRows, fingerprint);
      const mapperById = new Map(mapperRows.map((row) => [row.ingredient_id, row]));
      const current = runIntimportLocalIntelligence(parsed.candidates, {}, mapper).rows.filter(
        (row) => priorById.has(row.sourceProductId ?? ''),
      );

      expect(priorReady).toHaveLength(138);
      expect(priorTopping).toHaveLength(213);
      expect(current).toHaveLength(138);
      expect(mapperRows).toHaveLength(2088);

      const auditRows = current.map((row) => {
        const prior = priorById.get(row.sourceProductId ?? '')!;
        const donor = row.workingValues?.profileMatch
          ? profileDonor(row.workingValues.profileMatch)
          : null;
        const donorRow = donor ? (mapperById.get(donor.ingredient_id) ?? null) : null;
        const compatibility = donorRow
          ? evaluateMapperSemanticCompatibility(row.recognition, {
              ingredientId: donorRow.ingredient_id,
              name: donorRow.ingredient_name_display ?? donorRow.ingredient_name_internal,
              category: donorRow.ingredient_category ?? null,
              subcategory: donorRow.ingredient_subcategory ?? null,
              brand: donorRow.brand ?? null,
              gtin: donorRow.ean_code ?? null,
            })
          : null;
        const verifiedOverwrites = WORKING_NUMERIC_FIELDS.flatMap((field) => {
          const declared = (row.insert as Record<string, unknown>)[field];
          const resolved = row.workingValues?.fields[field];
          return typeof declared === 'number' && resolved?.value !== declared
            ? [`${field}:${declared}->${resolved?.value ?? 'null'}`]
            : [];
        });
        const provenance = Object.fromEntries(
          WORKING_NUMERIC_FIELDS.map((field) => {
            const truth = row.workingValues?.fields[field];
            return [
              field,
              truth
                ? {
                    value: truth.value,
                    state: truth.provenance.state,
                    basis: truth.provenance.basis,
                    mapperReferences: truth.provenance.mapperReferences,
                  }
                : null,
            ];
          }),
        );
        const currentReady = row.recognitionTrace.finalStatus === 'ENGINE_READY';
        const readyQualityPass =
          currentReady &&
          !row.recognition.modelRequired &&
          row.recognition.intendedUsageRole !== 'NEITHER_REVIEW' &&
          compatibility?.compatible !== false &&
          verifiedOverwrites.length === 0 &&
          row.productBehaviorAuthority.classificationOutcome === 'classified';
        const auditOutcome = readyQualityPass
          ? 'READY_PASS'
          : currentReady
            ? 'SUSPICIOUS_READY_FAIL'
            : 'MOVED_TO_REVIEW';
        const semanticQualityReason = readyQualityPass
          ? 'SEMANTIC_ROLE_DONOR_PROVENANCE_PASS'
          : currentReady
            ? 'UNRESOLVED_READY_CONTRADICTION'
            : prior.product_archetype !== row.recognition.productArchetype
              ? `CORRECTED_${prior.product_archetype}_TO_${row.recognition.productArchetype}`
              : 'NO_LONGER_ENGINE_READY_AFTER_SEMANTIC_GATE';

        return {
          source_product_id: row.sourceProductId,
          product_name: row.displayName,
          semantic_archetype: row.recognition.productArchetype,
          family: row.recognition.ingredientFamily,
          form: row.recognition.physicalForm,
          usage_role: row.recognition.intendedUsageRole,
          mapper_donor: donor?.ingredient_id ?? null,
          similarity: row.recognitionTrace.mapperSimilarity,
          semantic_quality_pass: readyQualityPass,
          semantic_quality_reason: semanticQualityReason,
          final_status: row.recognitionTrace.finalStatus,
          source_brand: row.recognitionEvidence.brand,
          source_manufacturer: row.recognitionEvidence.manufacturer,
          source_category: row.recognitionEvidence.category,
          source_subcategory: row.recognitionEvidence.subcategory,
          source_variant: row.recognitionEvidence.variant,
          source_evidence_basis: row.sourceAuthority.authority,
          evidence_fields: row.evidence.fields,
          prior_status: prior.final_status,
          prior_archetype: prior.product_archetype,
          prior_family: prior.ingredient_family,
          prior_form: prior.physical_form,
          prior_role: prior.role,
          classification_source: row.recognition.classificationSource,
          archetype: row.recognition.productArchetype,
          ingredient_family: row.recognition.ingredientFamily,
          physical_form: row.recognition.physicalForm,
          intended_usage_role: row.recognition.intendedUsageRole,
          semantic_confidence: row.recognition.confidence,
          mapper_donor_id: donor?.ingredient_id ?? null,
          mapper_similarity: row.recognitionTrace.mapperSimilarity,
          mapper_semantic_compatible: compatibility?.compatible ?? null,
          mapper_semantic_reason_codes: compatibility?.reasonCodes ?? [],
          product_behavior_outcome: row.productBehaviorAuthority.classificationOutcome,
          product_behavior_base_eligible: row.productBehaviorAuthority.baseRecipeEligible,
          product_behavior_topping_eligible: row.productBehaviorAuthority.toppingEligible,
          field_provenance: provenance,
          verified_overwrite_count: verifiedOverwrites.length,
          verified_overwrites: verifiedOverwrites,
          ready_quality_pass: readyQualityPass,
          audit_outcome: auditOutcome,
          final_reason_codes: row.recognitionTrace.finalReasonCodes,
        };
      });

      expect(auditRows.filter((row) => row.audit_outcome === 'READY_PASS')).toHaveLength(134);
      expect(auditRows.filter((row) => row.audit_outcome === 'MOVED_TO_REVIEW')).toHaveLength(4);
      expect(auditRows.filter((row) => row.audit_outcome === 'SUSPICIOUS_READY_FAIL')).toEqual([]);
      expect(auditRows.filter((row) => row.verified_overwrite_count > 0)).toEqual([]);

      const readyPassRows = auditRows.filter((row) => row.audit_outcome === 'READY_PASS');
      const readyRoleCounts = Object.fromEntries(
        [...new Set(readyPassRows.map((row) => row.usage_role))].map((role) => [
          role,
          readyPassRows.filter((row) => row.usage_role === role).length,
        ]),
      );
      expect(readyRoleCounts).toEqual({
        BASE_ONLY: 100,
        TOPPING_ONLY: 30,
        BASE_AND_TOPPING: 4,
      });
      const toppingStatusCounts = Object.fromEntries(
        ['ENGINE_READY', 'REVIEW', 'BLOCKED', 'IDENTITY_CONFLICT'].map((status) => [
          status,
          priorTopping.filter((row) => row.final_status === status).length,
        ]),
      );
      expect(toppingStatusCounts).toEqual({
        ENGINE_READY: 30,
        REVIEW: 182,
        BLOCKED: 0,
        IDENTITY_CONFLICT: 1,
      });

      mkdirSync(OUTPUT_DIR, { recursive: true });
      const artifact = join(OUTPUT_DIR, 'POLAND_138_READY_ROLE_QUALITY_AUDIT.csv');
      writeCsv(artifact, auditRows);
      writeFileSync(
        join(OUTPUT_DIR, 'POLAND_138_READY_ROLE_QUALITY_SUMMARY.json'),
        `${JSON.stringify(
          {
            execution: 'READ_ONLY_LOCAL_DETERMINISTIC',
            modelCalls: 0,
            audited: 138,
            readyPass: 134,
            movedToReview: 4,
            suspiciousReady: 0,
            verifiedOverwrites: 0,
            readyRoleCounts,
            priorAcceptedToppingOnly: {
              total: 213,
              statusCounts: toppingStatusCounts,
            },
            roleCounts: Object.fromEntries(
              [...new Set(auditRows.map((row) => row.intended_usage_role))].map((role) => [
                role,
                auditRows.filter((row) => row.intended_usage_role === role).length,
              ]),
            ),
            movedProductIds: auditRows
              .filter((row) => row.audit_outcome === 'MOVED_TO_REVIEW')
              .map((row) => row.source_product_id),
            polandCsvSha256: polandBefore,
            mapperCsvSha256: mapperBefore,
            artifact,
          },
          null,
          2,
        )}\n`,
      );

      expect(createHash('sha256').update(readFileSync(POLAND_FILE)).digest('hex')).toBe(
        polandBefore,
      );
      expect(createHash('sha256').update(readFileSync(MAPPER_FILE)).digest('hex')).toBe(
        mapperBefore,
      );
    }, 30_000);
  },
);
