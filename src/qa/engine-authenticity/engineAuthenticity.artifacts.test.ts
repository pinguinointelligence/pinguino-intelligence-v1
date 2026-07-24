/// <reference types="node" />
/**
 * AGENT 2 — machine-readable artifacts generator (owner requirement (d)).
 *
 * Runs the full T1–T20 battery against the REAL pipeline and (re)writes the
 * committed artifacts:
 *   docs/engine-validation/ENGINE_AUTHENTICITY_TESTS.json
 *   docs/engine-validation/ENGINE_AUTHENTICITY_TESTS.csv
 * Deterministic content (no timestamps) — a re-run only changes the files when
 * the ENGINE OUTPUT changed, which makes the artifacts themselves drift
 * detectors reviewable in git history.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  runAllAuthenticityCases,
  runDeterminismBattery,
  type AuthenticityRecord,
} from './authenticityCases';

const DOCS_DIR = resolve(import.meta.dirname, '../../../docs/engine-validation');

const csvEscape = (value: string | number | null | undefined): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const CSV_COLUMNS = [
  'test_id',
  'verdict',
  'outcome',
  'feasible',
  'score_10',
  'overall_0_100',
  'batch_total_g',
  'strawberry_g',
  'pod_points',
  'pac_points',
  'npac_points',
  'ice_fraction_percent',
  'water_percent',
  'total_solids_percent',
  'fat_percent',
  'protein_percent',
  'lactose_percent',
  'tara_g',
  'tara_percent_of_mix',
  'tara_source',
  'violations',
  'hard_metrics',
  'soft_metrics',
  'main_limiting_metric',
  'iterations',
  'stop_reason',
  'solver_mode',
  'template',
  'band_source',
  'proportional_scaling_detected',
  'engine_version',
  'config_version',
] as const;

const mainLimitingMetric = (record: AuthenticityRecord): string => {
  if (record.violations.length === 0) return '';
  const worst = [...record.violations].sort((a, b) => b.severityPoints - a.severityPoints)[0]!;
  return `${worst.metric} (${worst.provenance}, sev ${worst.severityPoints})`;
};

const strawberryGrams = (record: AuthenticityRecord): number | '' => {
  const lines = record.finalLines ?? record.input.lines;
  const straw = lines.find((row) => row.ingredientId === 'PI-ING-001553');
  return straw ? straw.grams : '';
};

const toCsvRow = (record: AuthenticityRecord): string =>
  [
    record.testId,
    record.verdict,
    record.outcome,
    record.outcome === 'preview' || record.outcome === 'already_clean' ? 'yes' : 'no',
    record.score.tenPoint,
    record.score.overall0to100,
    record.batchTotalG,
    strawberryGrams(record),
    record.metrics.podPoints,
    record.metrics.pacPoints,
    record.metrics.npacPoints,
    record.metrics.iceFractionPercent,
    record.metrics.waterPercent,
    record.metrics.totalSolidsPercent,
    record.metrics.fatPercent,
    record.metrics.proteinPercent,
    record.metrics.lactosePercent,
    record.stabilizer.grams,
    record.stabilizer.percentOfMix,
    record.stabilizer.source,
    record.violations.map((v) => `${v.metric}:${v.value}∉[${v.band?.min}-${v.band?.max}]`).join('; '),
    record.violations.filter((v) => v.provenance === 'hard').map((v) => v.metric).join('; '),
    record.violations.filter((v) => v.provenance === 'soft').map((v) => v.metric).join('; '),
    mainLimitingMetric(record),
    record.iterations,
    record.stopReason,
    record.solverMode,
    record.template ? `${record.template.id} (${record.template.status})` : '',
    record.targetBandSource,
    record.proportionalScaling.detected ? 'DETECTED' : 'no',
    record.engineVersion,
    record.configVersion,
  ]
    .map(csvEscape)
    .join(',');

describe('AGENT 2 — engine authenticity artifacts (owner requirement d)', () => {
  it('writes ENGINE_AUTHENTICITY_TESTS.json and .csv from the live pipeline run', () => {
    const records = runAllAuthenticityCases();
    const battery = runDeterminismBattery();
    const all = [...records, battery.record];

    expect(all).toHaveLength(20);
    expect(battery.allDirectIdentical).toBe(true);

    mkdirSync(DOCS_DIR, { recursive: true });

    const json = {
      artifact: 'PINGÜINO ENGINE AUTHENTICITY — Agent 2 offline test battery (T1–T20)',
      pipeline:
        'buildOptimizePreview (src/features/constraint-studio/applyPipeline.ts) + calculateRecipe (src/engine) — real production code, node env, no mocks',
      engineVersion: all[0]!.engineVersion,
      configVersion: all[0]!.configVersion,
      determinism: {
        directRuns: battery.directSignatures.length,
        allDirectIdentical: battery.allDirectIdentical,
        signature: battery.directSignatures[0],
      },
      results: all,
    };
    writeFileSync(join(DOCS_DIR, 'ENGINE_AUTHENTICITY_TESTS.json'), JSON.stringify(json, null, 2) + '\n', 'utf8');

    const csv = [CSV_COLUMNS.join(','), ...all.map(toCsvRow)].join('\n') + '\n';
    writeFileSync(join(DOCS_DIR, 'ENGINE_AUTHENTICITY_TESTS.csv'), csv, 'utf8');
  });
});
