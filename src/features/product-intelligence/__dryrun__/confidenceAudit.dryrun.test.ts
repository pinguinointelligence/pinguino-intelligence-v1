/**
 * Confidence audit — prove what the product score is actually made of.
 *
 * The owner's question is precise: 119 products reach a complete numeric
 * profile, but 106 of them score 0.45–0.60. Is that genuinely poor physical
 * evidence, or is a product being punished merely for combining several
 * individually reasonable field estimates?
 *
 * This run changes NO scoring. It decomposes every product's score exactly:
 *
 *   fieldConfidence = ceiling × (1 − PENALTY × (1 − tightness))
 *
 * so each field's shortfall from 1.0 splits cleanly into
 *   • a tier penalty      (1 − ceiling)          — how good the KIND of evidence is
 *   • a dispersion penalty (ceiling × PENALTY × (1 − tightness)) — how much the
 *     cohort actually disagreed
 *
 * and reports, alongside the shipped minimum aggregation, what mean/median/product
 * aggregation would have said. Reporting an alternative is not adopting it.
 *
 * Costs nothing: no web, OpenAI, Vision or DB call.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseINTIMPORT } from '@/data/products/intimport';
import { assessIntimportProduct } from '../intimportIntelligence';
import { buildMapperKnowledge } from '../mapperValueInference';
import {
  ENGINE_REQUIRED_WORKING_FIELDS,
  resolveProductWorkingValues,
} from '../productWorkingValues';
import { WORKING_NUMERIC_FIELDS, type WorkingNumericField } from '../productFieldTruth';
import { loadMapperKnowledgeRows, MAPPER_FILE } from './mapperFixture';

const IMPORT_FILE = join(homedir(), 'Desktop', 'PL_Poland.csv');
const REPORT = resolve(__dirname, '../../../../docs/products/confidence_audit.json');

const round4 = (value: number): number => Math.round(value * 1e4) / 1e4;

const medianOf = (sorted: readonly number[]): number => {
  if (sorted.length === 0) return 0;
  const mid = sorted.length >> 1;
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? upper) + upper) / 2;
};

interface FieldAudit {
  field: WorkingNumericField;
  state: string;
  basis: string;
  confidence: number;
  tierPenalty: number;
  dispersionPenalty: number;
  cohortSize: number | null;
  spread: number | null;
  band: number | null;
  tightness: number | null;
}

describe.runIf(existsSync(IMPORT_FILE) && existsSync(MAPPER_FILE))(
  'Confidence audit — what the 0.45-0.60 band is made of',
  () => {
    it('decomposes every complete-profile product score without changing it', () => {
      const mapper = loadMapperKnowledgeRows();
      const knowledge = buildMapperKnowledge(mapper.rows, mapper.fingerprint);
      const parsed = parseINTIMPORT(readFileSync(IMPORT_FILE, 'utf8'));

      const complete: {
        row: number;
        name: string | null;
        shipped: number;
        mean: number;
        median: number;
        product: number;
        weakestField: string;
        weakestBasis: string;
        totalTierPenalty: number;
        totalDispersionPenalty: number;
        fields: FieldAudit[];
      }[] = [];

      for (const candidate of parsed.candidates) {
        if (candidate.state === 'INVALID' || candidate.state === 'DUPLICATE') continue;
        const intelligence = assessIntimportProduct(candidate);
        const declared: Partial<Record<WorkingNumericField, number | null>> = {};
        if (candidate.nutritionBasis === 'per_100g') {
          for (const field of WORKING_NUMERIC_FIELDS) {
            const value = (candidate.insert as Record<string, unknown>)[field];
            if (typeof value === 'number' && Number.isFinite(value)) declared[field] = value;
          }
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
          },
          knowledge,
        );
        if (resolved.missingEngineFields.length > 0) continue;

        const fields: FieldAudit[] = ENGINE_REQUIRED_WORKING_FIELDS.map((field) => {
          const { provenance } = resolved.fields[field];
          const cohort = provenance.cohort;
          const ceiling = cohort?.ceiling ?? provenance.confidence;
          return {
            field,
            state: provenance.state,
            basis: provenance.basis,
            confidence: provenance.confidence,
            tierPenalty: round4(1 - ceiling),
            dispersionPenalty: round4(Math.max(0, ceiling - provenance.confidence)),
            cohortSize: cohort?.size ?? null,
            spread: cohort?.spread ?? null,
            band: cohort?.band ?? null,
            tightness: cohort?.tightness ?? null,
          };
        });

        const values = fields.map((entry) => entry.confidence);
        const sorted = [...values].sort((a, b) => a - b);
        const weakest = fields.reduce((low, entry) =>
          entry.confidence < low.confidence ? entry : low,
        );

        complete.push({
          row: candidate.rowIndex,
          name: candidate.displayName,
          shipped: round4(Math.min(...values)),
          mean: round4(values.reduce((sum, value) => sum + value, 0) / values.length),
          median: round4(medianOf(sorted)),
          product: round4(values.reduce((acc, value) => acc * value, 1)),
          weakestField: weakest.field,
          weakestBasis: weakest.basis,
          totalTierPenalty: round4(
            fields.reduce((sum, entry) => sum + entry.tierPenalty, 0) / fields.length,
          ),
          totalDispersionPenalty: round4(
            fields.reduce((sum, entry) => sum + entry.dispersionPenalty, 0) / fields.length,
          ),
        fields,
        });
      }

      const belowFloor = complete.filter((entry) => entry.shipped < 0.85);
      const tally = <T extends string | number>(values: T[]): Record<string, number> =>
        values.reduce<Record<string, number>>((counts, value) => {
          counts[String(value)] = (counts[String(value)] ?? 0) + 1;
          return counts;
        }, {});

      // Would a different aggregation of the SAME field confidences clear the floor?
      const aggregationEffect = {
        shippedMinimum: complete.filter((entry) => entry.shipped >= 0.85).length,
        ifMean: complete.filter((entry) => entry.mean >= 0.85).length,
        ifMedian: complete.filter((entry) => entry.median >= 0.85).length,
        ifProduct: complete.filter((entry) => entry.product >= 0.85).length,
        // The decisive question: how many below-floor products have EVERY field
        // individually at or above the floor? Those, and only those, would be
        // products punished purely by aggregation.
        allFieldsAboveFloorButProductBelow: belowFloor.filter((entry) =>
          entry.fields.every((field) => field.confidence >= 0.85),
        ).length,
        belowFloorWithAtLeastOneFieldBelowFloor: belowFloor.filter((entry) =>
          entry.fields.some((field) => field.confidence < 0.85),
        ).length,
      };

      const report = {
        mapperFingerprint: mapper.fingerprint,
        completeProfiles: complete.length,
        belowFloor: belowFloor.length,
        aggregationEffect,
        weakestFieldTally: tally(belowFloor.map((entry) => entry.weakestField)),
        weakestBasisTally: tally(belowFloor.map((entry) => entry.weakestBasis)),
        /** For below-floor products: how many of the nine fields are themselves below floor. */
        fieldsBelowFloorPerProduct: tally(
          belowFloor.map((entry) => entry.fields.filter((f) => f.confidence < 0.85).length),
        ),
        /** Average penalty split across below-floor products. */
        averagePenalties: {
          tier: round4(
            belowFloor.reduce((sum, entry) => sum + entry.totalTierPenalty, 0) /
              Math.max(1, belowFloor.length),
          ),
          dispersion: round4(
            belowFloor.reduce((sum, entry) => sum + entry.totalDispersionPenalty, 0) /
              Math.max(1, belowFloor.length),
          ),
        },
        /** Tightness of the binding weakest field — the crux of the question. */
        weakestFieldTightnessBuckets: tally(
          belowFloor.map((entry) => {
            const weakest = entry.fields.reduce((low, field) =>
              field.confidence < low.confidence ? field : low,
            );
            return weakest.tightness === null
              ? 'n/a'
              : (Math.floor(weakest.tightness * 10) / 10).toFixed(1);
          }),
        ),
        samples: belowFloor.slice(0, 15),
      };

      mkdirSync(dirname(REPORT), { recursive: true });
      writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
      expect(complete.length).toBeGreaterThan(0);
    });
  },
);
