import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseINTIMPORT } from '@/data/products/intimport';
import { runIntimportLocalIntelligence } from '../intimportIntelligence';
import { runIntimportEnrichment } from '../intimportEnrichment';

const FILE = join(homedir(), 'Desktop', 'PL_Poland.csv');

describe.runIf(existsSync(FILE))('INTIMPORT Phase B — controlled subset', () => {
  it('enriches only the sub-90 subset, under caps, with caching', async () => {
    const parsed = parseINTIMPORT(readFileSync(FILE, 'utf8'));
    const { rows } = runIntimportLocalIntelligence(parsed.candidates);

    // A representative controlled subset: 10 sub-90 rows + 5 that already clear 90.
    const subset = [
      ...rows.filter((r) => r.assessment.confidence < 90).slice(0, 10),
      ...rows.filter((r) => r.assessment.confidence >= 90).slice(0, 5),
    ].map((intelligence) => ({ intelligence, barcode: null }));

    let providerCalls = 0;
    const provider = async () => {
      providerCalls += 1;
      return {
        facts: [
          { field: 'ingredients' as const, value: 'Cukier.', source: 'manufacturer' as const },
          { field: 'energyKcal' as const, value: 400, source: 'manufacturer' as const },
          { field: 'fat' as const, value: 20, source: 'manufacturer' as const },
          { field: 'carbohydrate' as const, value: 50, source: 'manufacturer' as const },
          { field: 'protein' as const, value: 5, source: 'manufacturer' as const },
        ],
        calls: 1,
        estimatedCostUsd: 0.012,
      };
    };

    const { products, summary } = await runIntimportEnrichment(subset, provider, {
      maxCallsPerImport: 50,
      maxSpendUsd: 1,
      concurrency: 4,
    });

    console.log(
      'INTIMPORT_PIPELINE ' +
        JSON.stringify(
          {
            subsetSize: subset.length,
            providerCalls,
            summary,
            movedOverFloor: products.filter(
              (p) => p.preWebConfidence < 85 && p.postWebConfidence >= 85,
            ).length,
            stillBelowFloor: products.filter((p) => p.postWebConfidence < 85).length,
            technicalBlockedAfter: products.filter((p) => p.assessment.technicalBlocked).length,
          },
          null,
          2,
        ),
    );
    // The five ≥90 products must never have been researched.
    expect(summary.webSkippedHighConfidence).toBe(5);
    expect(providerCalls).toBeLessThanOrEqual(10);
  });
});
