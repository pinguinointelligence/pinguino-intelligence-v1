import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseINTIMPORT } from '@/data/products/intimport';
import { runIntimportLocalIntelligence } from '../intimportIntelligence';

const FILE = join(homedir(), 'Desktop', 'PL_Poland.csv');

describe.runIf(existsSync(FILE))('INTIMPORT Phase A — local-only intelligence', () => {
  it('reports the real local routing for PL_Poland.csv', () => {
    const parsed = parseINTIMPORT(readFileSync(FILE, 'utf8'));
    const { rows, summary } = runIntimportLocalIntelligence(parsed.candidates);

    const buckets = { '>=90': 0, '85-89.99': 0, '<85': 0 };
    for (const row of rows) {
      const c = row.assessment.confidence;
      if (c >= 90) buckets['>=90'] += 1;
      else if (c >= 85) buckets['85-89.99'] += 1;
      else buckets['<85'] += 1;
    }
    const authorities: Record<string, number> = {};
    for (const row of rows) {
      const k = row.sourceAuthority.authority;
      authorities[k] = (authorities[k] ?? 0) + 1;
    }
    const families: Record<string, number> = {};
    for (const row of rows) {
      if (!row.familyApplied || !row.family) continue;
      families[row.family.family] = (families[row.family.family] ?? 0) + 1;
    }
    const confidences = rows.map((r) => r.assessment.confidence).sort((a, b) => a - b);
    console.log(
      'INTIMPORT_LOCAL ' +
        JSON.stringify(
          {
            parsed: parsed.summary,
            local: summary,
            confidenceBuckets: buckets,
            technical: rows.filter((r) => r.kind === 'technical').length,
            technicalBlocked: rows.filter((r) => r.assessment.technicalBlocked).length,
            familyBreakdown: families,
            sourceAuthorities: authorities,
            confidenceMin: confidences[0],
            confidenceMedian: confidences[Math.floor(confidences.length / 2)],
            confidenceMax: confidences.at(-1),
          },
          null,
          2,
        ),
    );
    expect(summary.products).toBeGreaterThan(0);
  });
});
