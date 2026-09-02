/**
 * Evidence for the moisture-cohort rules: what the Mapper's water actually does.
 *
 * The acceptance thresholds in `mapperValueInference` are not chosen to unlock a
 * target number of products; they are chosen from these distributions. This run
 * regenerates the table so the rules can be re-checked whenever the Mapper moves.
 *
 * Costs nothing: reads the immutable Mapper CSV, no network, no model.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  moistureCohortProfile,
  MOISTURE_COHORT_RULES,
  type MapperKnowledgeRow,
} from '../mapperValueInference';
import { loadMapperKnowledgeRows, MAPPER_FILE } from './mapperFixture';

const REPORT = resolve(__dirname, '../../../../docs/products/moisture_cohort_audit.json');

const label = (row: MapperKnowledgeRow, bySubcategory: boolean): string =>
  bySubcategory
    ? `${row.ingredient_category ?? ''}|${row.ingredient_subcategory ?? ''}`
    : (row.ingredient_category ?? '');

describe.runIf(existsSync(MAPPER_FILE))('Moisture cohort audit', () => {
  it('profiles every candidate cohort and records which qualify as narrow', () => {
    const mapper = loadMapperKnowledgeRows();

    const build = (bySubcategory: boolean) => {
      const groups = new Map<string, MapperKnowledgeRow[]>();
      for (const row of mapper.rows) {
        if (row.is_active === false) continue;
        const key = label(row, bySubcategory);
        if (!key.trim()) continue;
        const existing = groups.get(key);
        if (existing) existing.push(row);
        else groups.set(key, [row]);
      }
      return [...groups.entries()]
        .map(([cohort, rows]) => ({ cohort, ...moistureCohortProfile(rows) }))
        .filter((entry) => entry.n > 0)
        .sort((a, b) => b.n - a.n);
    };

    const categories = build(false);
    const subcategories = build(true);
    const accepted = [...categories, ...subcategories].filter((entry) => entry.narrow);
    const rejected = [...categories, ...subcategories].filter((entry) => !entry.narrow);

    const report = {
      mapperFingerprint: mapper.fingerprint,
      rules: MOISTURE_COHORT_RULES,
      note:
        'Thresholds come from these distributions, not from a target product count. ' +
        'The median absolute deviation separates physically coherent cohorts from ' +
        'heterogeneous families with a clear empirical gap between roughly 4.5 and 6.5.',
      categories,
      subcategories: subcategories.slice(0, 60),
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      acceptedCohorts: accepted.map((entry) => entry.cohort),
      rejectedBroadExamples: rejected
        .filter((entry) => entry.n >= 20)
        .slice(0, 25)
        .map((entry) => ({ cohort: entry.cohort, n: entry.n, mad: entry.mad, iqr: entry.iqr })),
    };
    mkdirSync(dirname(REPORT), { recursive: true });
    writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

    // The families the owner named as physically heterogeneous must never qualify.
    for (const broad of ['flavor_paste', 'dairy', 'fruit', 'alcohol']) {
      const entry = categories.find((candidate) => candidate.cohort === broad);
      expect(entry?.narrow, `${broad} must be rejected as broad`).toBe(false);
    }
    expect(accepted.length).toBeGreaterThan(0);
  });
});
