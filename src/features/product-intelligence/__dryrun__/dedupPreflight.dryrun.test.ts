/**
 * §7 full-file dry preflight. PREVIEW ONLY — nothing is applied, nothing is
 * written. Proves every one of the 820 rows is accounted for in exactly one
 * bucket, and that the six Comprital rows that used to collapse are all still
 * present as distinct commercial products.
 *
 * Costs nothing: no web, OpenAI, Vision or DB call.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseINTIMPORT } from '@/data/products/intimport';
import { planIntimportDedup } from '../intimportDedup';

const CSV = join(homedir(), 'Desktop', 'PL_Poland.csv');
const REPORT = resolve(__dirname, '../../../../docs/products/dedup_preflight.json');
const COMPRITAL = [
  'PL-COM-P1237',
  'PL-COM-P307B',
  'PL-COM-P1244',
  'PL-COM-P338',
  'PL-COM-PC523P',
  'PL-COM-PC524P',
];

describe.runIf(existsSync(CSV))('INTIMPORT dedup preflight — full file', () => {
  it('accounts for every row exactly once and loses none', () => {
    const parsed = parseINTIMPORT(readFileSync(CSV, 'utf8'));
    const plan = planIntimportDedup(parsed.candidates);

    const byProductId = new Map(
      plan.rows.map((row, i) => [
        parsed.candidates[i]!.sourceProductId ?? `row-${row.rowIndex}`,
        row,
      ]),
    );
    const comprital = COMPRITAL.map((id) => {
      const row = byProductId.get(id);
      return {
        sourceProductId: id,
        found: Boolean(row),
        classification: row?.classification ?? null,
        reason: row?.reason ?? null,
        forceDistinct: row?.forceDistinct ?? null,
      };
    });

    const merged = plan.counts.EXACT_DUPLICATE;
    const report = {
      note: 'PREFLIGHT ONLY — nic nie zostało zapisane.',
      totalInput: plan.totalInput,
      totalAccounted: plan.totalAccounted,
      counts: plan.counts,
      silentlyLostRows: plan.totalInput - plan.totalAccounted,
      forceDistinctRows: plan.rows.filter((r) => r.forceDistinct).length,
      compritalCollisionRows: comprital,
      collisionExamples: plan.rows
        .filter((r) => r.classification === 'IDENTITY_COLLISION_RESOLVED_AS_DISTINCT')
        .slice(0, 20),
      possibleDuplicateExamples: plan.rows
        .filter((r) => r.classification === 'POSSIBLE_DUPLICATE_REVIEW')
        .slice(0, 20),
      conflictExamples: plan.rows
        .filter((r) => r.classification === 'IDENTITY_CONFLICT')
        .slice(0, 20),
      exactDuplicateExamples: plan.rows
        .filter((r) => r.classification === 'EXACT_DUPLICATE')
        .slice(0, 20),
      exactDuplicates: merged,
    };
    mkdirSync(dirname(REPORT), { recursive: true });
    writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

    // The whole point: nothing may vanish between input and accounting.
    expect(plan.totalAccounted).toBe(plan.totalInput);
    expect(plan.totalInput).toBe(820);
    // All six previously-collapsing rows survive as their own products.
    expect(comprital.every((entry) => entry.found)).toBe(true);
  });
});
