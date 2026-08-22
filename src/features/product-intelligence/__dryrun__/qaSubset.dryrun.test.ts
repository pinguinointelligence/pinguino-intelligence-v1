import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { parseINTIMPORT } from '@/data/products/intimport';
import { runIntimportLocalIntelligence } from '../intimportIntelligence';

const FILE = '/private/tmp/claude-501/-Users-tomaszboro22-Developer/a74d0848-1d0d-49c0-bd04-d51bd5572364/scratchpad/qa.csv';

describe.runIf(existsSync(FILE))('INTIMPORT QA subset — local ledger', () => {
  it('reports each row', () => {
    const parsed = parseINTIMPORT(readFileSync(FILE, 'utf8'));
    const { rows, summary } = runIntimportLocalIntelligence(parsed.candidates);
    console.log('QA_SUMMARY ' + JSON.stringify(summary));
    for (const r of rows) {
      console.log(
        'QA_ROW ' +
          JSON.stringify({
            id: r.sourceProductId,
            name: (r.displayName ?? '').slice(0, 28),
            kind: r.kind,
            authority: r.sourceAuthority.authority,
            family: r.family?.family ?? null,
            applied: r.familyApplied,
            conf: r.assessment.confidence,
            route: r.route,
            techBlocked: r.assessment.technicalBlocked,
            targets: r.enrichmentTargets.slice(0, 3),
          }),
      );
    }
    expect(rows.length).toBeGreaterThan(0);
  });
});
