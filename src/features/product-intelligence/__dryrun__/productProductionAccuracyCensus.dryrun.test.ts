import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseINTIMPORT } from '@/data/products/intimport';
import { runIntimportLocalIntelligence } from '../intimportIntelligence';
import { buildMapperKnowledge } from '../mapperValueInference';
import { loadMapperKnowledgeRows, MAPPER_FILE } from './mapperFixture';

const POLAND_FILE = join(homedir(), 'Desktop', 'PL_Poland.csv');
const OLD_AUDIT = join(
  homedir(),
  '.codex',
  'outputs',
  'poland_820_preimport_owner_audit_20260825',
  'POLAND_820_PREIMPORT_OWNER_AUDIT.csv',
);

const parseCsv = (source: string): string[][] => {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
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

const oldAccuracy = (): number[] => {
  const [header = [], ...rows] = parseCsv(readFileSync(OLD_AUDIT, 'utf8'));
  const index = header.indexOf('product_accuracy_percent');
  return rows
    .filter((row) => row.some(Boolean))
    .map((row) => Number(row[index] ?? 0))
    .filter(Number.isFinite);
};

const distribution = (values: readonly number[]) => ({
  '0-49.99': values.filter((value) => value < 50).length,
  '50-69.99': values.filter((value) => value >= 50 && value < 70).length,
  '70-84.99': values.filter((value) => value >= 70 && value < 85).length,
  '85-89.99': values.filter((value) => value >= 85 && value < 90).length,
  '90-100': values.filter((value) => value >= 90).length,
});

describe.runIf(existsSync(POLAND_FILE) && existsSync(OLD_AUDIT))(
  'production Product Accuracy — read-only Poland 820 census',
  () => {
    it('compares old/new scores and role readiness without import or Mapper mutation', () => {
      const polandBefore = createHash('sha256').update(readFileSync(POLAND_FILE)).digest('hex');
      const mapperBefore = createHash('sha256').update(readFileSync(MAPPER_FILE)).digest('hex');
      const parsed = parseINTIMPORT(readFileSync(POLAND_FILE, 'utf8'));
      const { rows: mapperRows, fingerprint } = loadMapperKnowledgeRows();
      const mapper = buildMapperKnowledge(mapperRows, fingerprint);
      const { rows } = runIntimportLocalIntelligence(parsed.candidates, {}, mapper);
      const oldScores = oldAccuracy();
      const newScores = rows.map((row) => row.productionAccuracy.productAccuracy);
      const readiness = rows.reduce(
        (counts, row) => {
          const role = row.recognition.intendedUsageRole;
          const score = row.productionAccuracy;
          if (row.recognitionTrace.finalStatus === 'IDENTITY_CONFLICT') counts.CONFLICT += 1;
          else if (role === 'TOPPING_ONLY') counts.TOPPING_ONLY += 1;
          else if (score.roleReadiness === 'BLOCKED') counts.BLOCKED += 1;
          else if (score.roleReadiness === 'BASE_READY' && score.productAccuracy >= 85) {
            counts.READY += 1;
          } else counts.REVIEW += 1;
          return counts;
        },
        { READY: 0, REVIEW: 0, BLOCKED: 0, CONFLICT: 0, TOPPING_ONLY: 0 },
      );
      const report = {
        rows: rows.length,
        oldDistribution: distribution(oldScores),
        newDistribution: distribution(newScores),
        productsAtLeast85Before: oldScores.filter((value) => value >= 85).length,
        productsAtLeast85After: newScores.filter((value) => value >= 85).length,
        cappedAt84: rows.filter((row) => row.productionAccuracy.criticalCapApplied).length,
        cappedProducts: rows
          .filter((row) => row.productionAccuracy.criticalCapApplied)
          .map((row) => ({
            sourceProductId: row.sourceProductId,
            productName: row.displayName,
            role: row.recognition.intendedUsageRole,
            rawProductAccuracy: row.productionAccuracy.rawProductAccuracy,
            productAccuracy: row.productionAccuracy.productAccuracy,
            blockers: row.productionAccuracy.criticalBlockers,
            sweetnessPath: row.workingValues?.sweetnessPath ?? null,
          })),
        nonMaterialSweeteningProducts: rows
          .filter((row) => row.workingValues?.sweetnessPath.materiality?.verdict === 'NON_MATERIAL')
          .map((row) => ({
            sourceProductId: row.sourceProductId,
            productName: row.displayName,
            role: row.recognition.intendedUsageRole,
            rawProductAccuracy: row.productionAccuracy.rawProductAccuracy,
            productAccuracy: row.productionAccuracy.productAccuracy,
            blockers: row.productionAccuracy.criticalBlockers,
            materiality: row.workingValues?.sweetnessPath.materiality,
          })),
        readiness,
      };

      if (process.env.PRODUCT_ACCURACY_REPORT === '1') {
        console.log(`PRODUCT_ACCURACY_POLAND_820 ${JSON.stringify(report)}`);
      }

      expect(rows).toHaveLength(820);
      expect(oldScores).toHaveLength(820);
      expect(mapperRows).toHaveLength(2088);
      expect(Object.values(readiness).reduce((sum, value) => sum + value, 0)).toBe(820);
      for (const row of rows) {
        if (row.productionAccuracy.criticalBlockers.length > 0) {
          expect(row.productionAccuracy.productAccuracy).toBeLessThanOrEqual(84);
        }
        if (row.productionAccuracy.roleReadiness === 'TOPPING_READY') {
          expect(row.productionAccuracy.baseEngineReady).toBe(false);
        }
      }
      expect(createHash('sha256').update(readFileSync(POLAND_FILE)).digest('hex')).toBe(
        polandBefore,
      );
      expect(createHash('sha256').update(readFileSync(MAPPER_FILE)).digest('hex')).toBe(
        mapperBefore,
      );
    });
  },
);
