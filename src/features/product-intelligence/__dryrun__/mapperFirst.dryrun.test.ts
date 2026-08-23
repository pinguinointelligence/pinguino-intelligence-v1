/**
 * Mapper-first local dry run over the real Poland file.
 *
 * Costs nothing: no web call, no OpenAI call, no Vision call, no DB. It reads
 * the immutable Mapper Base and the owner's own export, and reports how much of
 * the catalogue becomes formulable from existing Gellatti knowledge alone.
 *
 * The Mapper fingerprint is recomputed here rather than hard-coded, so a run
 * against a changed Mapper is visible in the report instead of silent.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseINTIMPORT } from '@/data/products/intimport';
import { assessIntimportProduct } from '../intimportIntelligence';
import {
  buildMapperKnowledge,
  fieldConsensus,
  MIN_FAMILY_COHORT,
  type MapperKnowledgeRow,
} from '../mapperValueInference';
import {
  ENGINE_REQUIRED_WORKING_FIELDS,
  resolveProductWorkingValues,
  type ProductReadiness,
} from '../productWorkingValues';
import { WORKING_NUMERIC_FIELDS, type WorkingNumericField } from '../productFieldTruth';

const IMPORT_FILE = join(homedir(), 'Desktop', 'PL_Poland.csv');
const MAPPER_FILE = resolve(__dirname, '../../../../docs/ingredients/validation/mapper_basement.csv');
const REPORT = resolve(__dirname, '../../../../docs/products/mapper_first_dryrun.json');

/** RFC-4180-ish parser: quotes, escaped quotes, embedded commas, CRLF, BOM. */
function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      /* ignore */
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const num = (value: string | undefined): number | null => {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

function loadMapper(): { rows: MapperKnowledgeRow[]; fingerprint: string } {
  const raw = readFileSync(MAPPER_FILE);
  const fingerprint = createHash('sha256').update(raw).digest('hex');
  const table = parseCsv(raw.toString('utf8'));
  const header = table[0];
  const at = (row: string[], column: string): string | undefined => {
    const index = header.indexOf(column);
    return index === -1 ? undefined : row[index];
  };
  const rows: MapperKnowledgeRow[] = table.slice(1)
    .filter((row) => row.length >= header.length - 2 && (at(row, 'ingredient_id') ?? '') !== '')
    .map((row) => {
      const numericFields = Object.fromEntries(
        WORKING_NUMERIC_FIELDS.map((field) => [field, num(at(row, field))]),
      ) as Record<WorkingNumericField, number | null>;
      return {
        ingredient_id: at(row, 'ingredient_id') ?? '',
        ingredient_name_internal: at(row, 'ingredient_name_internal') ?? '',
        ingredient_name_display: at(row, 'ingredient_name_display') ?? null,
        brand: at(row, 'brand') ?? null,
        ingredient_category: at(row, 'ingredient_category') ?? null,
        ingredient_subcategory: at(row, 'ingredient_subcategory') ?? null,
        is_active: (at(row, 'is_active') ?? 'true').trim().toLowerCase() !== 'false',
        ean_code: at(row, 'ean_code') ?? null,
        ...numericFields,
      };
    });
  return { rows, fingerprint };
}

describe.runIf(existsSync(IMPORT_FILE) && existsSync(MAPPER_FILE))(
  'Mapper-first local dry run (0 paid calls)',
  () => {
    it('reports how much of PL_Poland.csv Gellatti already knows', () => {
      const mapper = loadMapper();
      const knowledge = buildMapperKnowledge(mapper.rows, mapper.fingerprint);
      const parsed = parseINTIMPORT(readFileSync(IMPORT_FILE, 'utf8'));

      const readiness: Record<ProductReadiness, number> = {
        READY: 0,
        ESTIMATED_READY: 0,
        REVIEW: 0,
        TECHNICAL_AUTHORITY_REQUIRED: 0,
      };
      const valueReadiness = { READY: 0, ESTIMATED_READY: 0, REVIEW: 0 };
      const tierCounts: Record<string, number> = {};
      const fieldFill: Record<string, { verified: number; estimated: number; unknown: number }> = {};
      for (const field of ENGINE_REQUIRED_WORKING_FIELDS) {
        fieldFill[field] = { verified: 0, estimated: 0, unknown: 0 };
      }
      const missingHistogram: Record<string, number> = {};
      /** How many engine fields each not-yet-ready product still lacks. */
      const gapDistribution: Record<string, number> = {};
      /** Confidence of products whose nine fields are ALL populated. */
      const completeProfileConfidence: number[] = [];
      let conflicted = 0;
      let familyAssigned = 0;
      /** Distinct products the Mapper contributed at least one field to. */
      let mapperContributed = 0;
      const familyHistogram: Record<string, number> = {};
      const samples: unknown[] = [];

      const usable = parsed.candidates.filter(
        (candidate) => candidate.state !== 'INVALID' && candidate.state !== 'DUPLICATE',
      );

      for (const candidate of usable) {
        const intelligence = assessIntimportProduct(candidate);
        const declared: Partial<Record<WorkingNumericField, number | null>> = {};
        for (const field of WORKING_NUMERIC_FIELDS) {
          const value = (candidate.insert as Record<string, unknown>)[field];
          if (typeof value === 'number' && Number.isFinite(value)) declared[field] = value;
        }
        // Per-100 ml nutrition is NOT per-100 g and is never treated as declared.
        if (candidate.nutritionBasis !== 'per_100g') {
          for (const field of WORKING_NUMERIC_FIELDS) delete declared[field];
        }

        const resolved = resolveProductWorkingValues(
          {
            declared,
            declaredConfidence: intelligence.assessment.confidence / 100,
            identity: {
              name: candidate.displayName,
              variant:
                candidate.source['Variant Original'] ?? candidate.source['Variant English'],
              brand: candidate.source.Brand,
              category: candidate.sourceCategory,
              subcategory: candidate.sourceSubcategory,
              barcode: candidate.ean,
            },
            technical: intelligence.kind === 'technical',
            // Nothing here grants technical authority; that stays with ProductBehavior.
            technicalAuthority: false,
          },
          knowledge,
        );

        readiness[resolved.readiness] += 1;
        valueReadiness[resolved.valueReadiness] += 1;
        if (intelligence.familyApplied && intelligence.family) {
          familyAssigned += 1;
          const key = intelligence.family.family;
          familyHistogram[key] = (familyHistogram[key] ?? 0) + 1;
        }
        if (resolved.mapperTiersUsed.length > 0) mapperContributed += 1;
        for (const tier of resolved.mapperTiersUsed) {
          tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
        }
        for (const field of ENGINE_REQUIRED_WORKING_FIELDS) {
          const state = resolved.fields[field].provenance.state;
          if (state === 'VERIFIED') fieldFill[field].verified += 1;
          else if (state === 'ESTIMATED') fieldFill[field].estimated += 1;
          else fieldFill[field].unknown += 1;
        }
        if (resolved.missingEngineFields.length === 0 && resolved.engineConfidence !== null) {
          completeProfileConfidence.push(resolved.engineConfidence);
        }
        if (resolved.valueReadiness === 'REVIEW') {
          const gap = String(resolved.missingEngineFields.length);
          gapDistribution[gap] = (gapDistribution[gap] ?? 0) + 1;
        }
        for (const field of resolved.missingEngineFields) {
          missingHistogram[field] = (missingHistogram[field] ?? 0) + 1;
        }
        if (resolved.conflicts.length > 0) conflicted += 1;

        if (samples.length < 12) {
          samples.push({
            row: candidate.rowIndex,
            name: candidate.displayName,
            category: candidate.sourceCategory,
            readiness: resolved.readiness,
            engineConfidence: resolved.engineConfidence,
            tiers: resolved.mapperTiersUsed,
            missing: resolved.missingEngineFields,
            mapperReferences: resolved.mapperReferences.slice(0, 6),
          });
        }
      }

      const engineReady = valueReadiness.READY + valueReadiness.ESTIMATED_READY;
      const report = {
        generatedFrom: 'PL_Poland.csv',
        mapper: {
          file: 'docs/ingredients/validation/mapper_basement.csv',
          rows: mapper.rows.length,
          fingerprint: mapper.fingerprint,
        },
        parsed: parsed.summary,
        assessed: usable.length,
        readiness,
        valueReadiness,
        engineReady,
        engineReadyShare: Number((engineReady / usable.length).toFixed(4)),
        familyAssigned,
        familyHistogram,
        mapperFamilyCohorts: Object.fromEntries(
          [...knowledge.byFamily.entries()].map(([family, cohort]) => [family, cohort.length]),
        ),
        mapperTokenVocabulary: knowledge.documentFrequency.size,
        mapperFamilyConsensusFields: Object.fromEntries(
          [...knowledge.byFamily.keys()].map((family) => [
            family,
            ENGINE_REQUIRED_WORKING_FIELDS.filter(
              (field) =>
                fieldConsensus(knowledge.byFamily.get(family) ?? [], field, MIN_FAMILY_COHORT) !==
                null,
            ),
          ]),
        ),
        mapperContributed,
        tierCounts,
        fieldFill,
        missingHistogram,
        gapDistribution,
        completeProfiles: completeProfileConfidence.length,
        completeProfileConfidenceBuckets: completeProfileConfidence.reduce<Record<string, number>>(
          (buckets, value) => {
            const bucket = `${(Math.floor(value * 20) / 20).toFixed(2)}`;
            buckets[bucket] = (buckets[bucket] ?? 0) + 1;
            return buckets;
          },
          {},
        ),
        productsWithDeclarationConflicts: conflicted,
        samples,
      };

      mkdirSync(dirname(REPORT), { recursive: true });
      writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

      // The run must have actually covered the file, and cost nothing to do it.
      expect(usable.length).toBeGreaterThan(0);
      expect(readiness.READY + readiness.ESTIMATED_READY + readiness.REVIEW +
        readiness.TECHNICAL_AUTHORITY_REQUIRED).toBe(usable.length);
    });
  },
);
