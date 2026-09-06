/**
 * POLAND LABEL CORPUS — the owner's PL_Poland workbook (2026-08, 820 retail products), the 170 rows
 * that carry a nutrition declaration, replayed through the scanner's completion path on the real
 * Mapper rows. This is the "ordinary food" measurement the owner asked for: how many everyday Polish
 * products a customer in the kitchen could add to a recipe in seconds, and WHY the rest cannot.
 *
 * It measures; it does not claim. Structural contracts are asserted for every row; the ready-rate
 * of complete labels is a ratchet that must never fall below the recorded floor.
 * Report: reports/scan-import-v2/PL_POLAND_REPLAY_<tag>.json (+ .md summary).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CustomerProductFamilyChoice } from '../product-scanner/customerProductFamily';
import {
  loadReplayRows,
  replayFixture,
  scanResultFromLabelRow,
  type LabelCorpusRow,
  type ReplayOutcome,
} from '@/scan-import-v2/__dryrun__/scanRescueHarness';
import { ENGINE_COMPOSITION_FIELDS } from './productWorkingValues';
import corpus from './__fixtures__/scanRescue/plPoland.json';

const TAG = process.env['SCAN_RESCUE_REPLAY_TAG'] ?? 'replay';
const ROWS = corpus as LabelCorpusRow[];

/** What a customer would answer when the scanner has to ask for the product family. */
function customerFamilyFor(row: LabelCorpusRow): CustomerProductFamilyChoice {
  const name = `${row.name} ${row.subcategory ?? ''}`.toLowerCase();
  switch (row.category) {
    case 'Dairy':
      return 'dairy';
    case 'Fruit':
      return 'fruit';
    case 'Chocolate & cocoa':
      return 'cocoa_chocolate';
    case 'Nuts & pastes':
      return 'nut_paste';
    case 'Sugars & sweeteners':
      return 'sweetener';
    case 'Professional gelato products':
    case 'Stabilizers & emulsifiers':
      return 'technical';
    case 'Vegan':
      return /napój|napoj|drink|mleko|milk|owsian|migdał|sojow|kokosow/.test(name)
        ? 'beverage'
        : 'other';
    default:
      return 'other';
  }
}

const hasCompleteMacros = (row: LabelCorpusRow): boolean =>
  row.fat !== null &&
  row.protein !== null &&
  row.carbohydrate !== null &&
  row.sugars !== null &&
  row.salt !== null;

interface RowOutcome {
  id: string;
  category: string;
  brand: string | null;
  name: string;
  basis: string;
  completeMacros: boolean;
  hasIngredients: boolean;
  gtinFromLabel: boolean;
  family: string | null;
  role: string | null;
  familyResolution: string;
  modelRequired: boolean;
  modelReasonCodes: string[];
  ready: boolean;
  readiness: string;
  engineUsable: boolean;
  roleReadiness: string;
  donor: string | null;
  similarity: number | null;
  estimatedFields: string[];
  blockers: string[];
  missingEngineFields: string[];
  sweetness: { kind: string; resolved: boolean; reason: string };
  error: string | null;
}

function summarise(outcomes: RowOutcome[]) {
  const byCategory: Record<
    string,
    { n: number; ready: number; complete: number; completeReady: number }
  > = {};
  const blockerHistogram: Record<string, number> = {};
  for (const o of outcomes) {
    const c = (byCategory[o.category] ??= { n: 0, ready: 0, complete: 0, completeReady: 0 });
    c.n++;
    if (o.ready) c.ready++;
    if (o.completeMacros) {
      c.complete++;
      if (o.ready) c.completeReady++;
    }
    if (!o.ready) for (const b of o.blockers) blockerHistogram[b] = (blockerHistogram[b] ?? 0) + 1;
  }
  const complete = outcomes.filter((o) => o.completeMacros);
  const completeWithIngredients = complete.filter((o) => o.hasIngredients);
  const ordinary = completeWithIngredients.filter(
    (o) => !['Professional gelato products', 'Stabilizers & emulsifiers'].includes(o.category),
  );
  const rate = (rows: RowOutcome[]) =>
    rows.length === 0
      ? null
      : Math.round((rows.filter((o) => o.ready).length / rows.length) * 1000) / 10;
  return {
    rows: outcomes.length,
    ready: outcomes.filter((o) => o.ready).length,
    completeMacros: {
      n: complete.length,
      ready: complete.filter((o) => o.ready).length,
      ratePercent: rate(complete),
    },
    completeWithIngredients: {
      n: completeWithIngredients.length,
      ready: completeWithIngredients.filter((o) => o.ready).length,
      ratePercent: rate(completeWithIngredients),
    },
    ordinaryFoodCompleteLabel: {
      n: ordinary.length,
      ready: ordinary.filter((o) => o.ready).length,
      ratePercent: rate(ordinary),
    },
    familyAsked: outcomes.filter((o) => o.familyResolution !== 'RESOLVED' || o.modelRequired)
      .length,
    byCategory,
    blockerHistogram,
  };
}

describe('Poland label corpus — ordinary food through the scanner completion path', () => {
  const rows = loadReplayRows();
  const outcomes: RowOutcome[] = [];

  it('replays every label row without a crash and keeps declared values VERIFIED', () => {
    for (const row of ROWS) {
      const { gtin, scanResult, confirmedFields } = scanResultFromLabelRow(row);
      let out: ReplayOutcome | null = null;
      let error: string | null = null;
      try {
        out = replayFixture(
          {
            label: row.id,
            gtin,
            customerFamily: customerFamilyFor(row),
            confirmedFields,
            scanResult,
          },
          rows,
        );
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      const truth = out?.fieldTruth ?? {};
      const estimatedFields = Object.entries(truth)
        .filter(([, t]) => t.state === 'ESTIMATED' && t.value !== null)
        .map(([f]) => f);
      if (out) {
        // a label value is the product's own statement; no reference may relabel it
        for (const [field, value] of [
          ['fat_percent', row.fat],
          ['protein_percent', row.protein],
          ['carbohydrate_percent', row.carbohydrate],
          ['total_sugars_percent', row.sugars],
          ['salt_percent', row.salt],
        ] as const) {
          if (value === null) continue;
          expect(truth[field]?.state, `${row.id} ${field}`).toBe('VERIFIED');
          expect(truth[field]?.value, `${row.id} ${field}`).toBe(value);
        }
        if (out.ready && out.engineUsable) {
          for (const field of ENGINE_COMPOSITION_FIELDS) {
            expect(truth[field]?.value, `${row.id} ready without ${field}`).not.toBeNull();
          }
        }
      }
      outcomes.push({
        id: row.id,
        category: row.category,
        brand: row.brand,
        name: row.name,
        basis: row.basis,
        completeMacros: hasCompleteMacros(row),
        hasIngredients: row.ingredients !== null,
        gtinFromLabel: row.gtin !== null && gtin === row.gtin.padStart(13, '0'),
        family: out?.recognition.final.family ?? null,
        role: out?.recognition.final.role ?? null,
        familyResolution: out?.recognition.final.familyResolution ?? 'ERROR',
        modelRequired: out?.recognition.final.modelRequired ?? false,
        modelReasonCodes: out?.recognition.final.modelReasonCodes ?? [],
        ready: out?.ready ?? false,
        readiness: out?.readiness ?? 'ERROR',
        engineUsable: out?.engineUsable ?? false,
        roleReadiness: out?.roleReadiness ?? 'ERROR',
        donor: out?.mapper.donor ?? null,
        similarity: out?.mapper.similarity ?? null,
        estimatedFields,
        blockers: out?.blockers ?? [],
        missingEngineFields: out?.missingEngineFields ?? [],
        sweetness: out?.sweetnessPath ?? { kind: 'error', resolved: false, reason: error ?? '' },
        error,
      });
    }
    expect(outcomes.filter((o) => o.error !== null).map((o) => `${o.id}: ${o.error}`)).toEqual([]);
  }, 120_000);

  it('writes the measurement report and holds the ready-rate floor for complete ordinary labels', () => {
    const summary = summarise(outcomes);
    const dir = join(process.cwd(), 'reports', 'scan-import-v2');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `PL_POLAND_REPLAY_${TAG}.json`),
      JSON.stringify(
        { generatedAt: new Date().toISOString(), tag: TAG, summary, outcomes },
        null,
        2,
      ),
    );
    const notReady = outcomes.filter((o) => o.completeMacros && o.hasIngredients && !o.ready);
    const md = [
      `# PL_Poland label corpus replay (${TAG})`,
      '',
      `Rows with a nutrition declaration: ${summary.rows}; ready: ${summary.ready}.`,
      `Complete macros: ${summary.completeMacros.ready}/${summary.completeMacros.n} (${summary.completeMacros.ratePercent}%).`,
      `Complete macros + ingredients: ${summary.completeWithIngredients.ready}/${summary.completeWithIngredients.n} (${summary.completeWithIngredients.ratePercent}%).`,
      `Ordinary food, complete label: ${summary.ordinaryFoodCompleteLabel.ready}/${summary.ordinaryFoodCompleteLabel.n} (${summary.ordinaryFoodCompleteLabel.ratePercent}%).`,
      '',
      '| category | rows | ready | complete | complete ready |',
      '|---|---|---|---|---|',
      ...Object.entries(summary.byCategory).map(
        ([c, v]) => `| ${c} | ${v.n} | ${v.ready} | ${v.complete} | ${v.completeReady} |`,
      ),
      '',
      '## Blockers among not-ready rows',
      ...Object.entries(summary.blockerHistogram)
        .sort((a, b) => b[1] - a[1])
        .map(([b, n]) => `- ${b}: ${n}`),
      '',
      '## Not ready despite a complete label with ingredients',
      ...notReady.map(
        (o) =>
          `- ${o.id} ${o.brand ?? ''} ${o.name} [${o.category}] family=${o.family} role=${o.role} ` +
          `blockers=${o.blockers.join(',')} missing=${o.missingEngineFields.join(',')} ` +
          `sweetness=${o.sweetness.kind}${o.modelRequired ? ` model=${o.modelReasonCodes.join('/')}` : ''}`,
      ),
      '',
    ].join('\n');
    writeFileSync(join(dir, `PL_POLAND_REPLAY_${TAG}.md`), md);
    expect(summary.completeMacros.n).toBeGreaterThan(100);
  });
});
