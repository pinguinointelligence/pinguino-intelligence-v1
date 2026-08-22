import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseINTIMPORT } from '../intimport';

const FILE = join(homedir(), 'Desktop', 'PL_Poland.csv');

describe.runIf(existsSync(FILE))('INTIMPORT real owner file dry run', () => {
  it('reports the honest deterministic preview for PL_Poland.csv', () => {
    const result = parseINTIMPORT(readFileSync(FILE, 'utf8'));
    const s = result.summary;
    const warnCensus: Record<string, number> = {};
    for (const c of result.candidates)
      for (const w of c.warnings) {
        const key = w.replace(/"[^"]*"/g, '"…"').slice(0, 80);
        warnCensus[key] = (warnCensus[key] ?? 0) + 1;
      }
    const reasonCensus: Record<string, number> = {};
    for (const c of result.candidates)
      for (const r of c.reasons) {
        const key = r.replace(/row \d+/, 'row N').slice(0, 80);
        reasonCensus[key] = (reasonCensus[key] ?? 0) + 1;
      }
    console.log(
      JSON.stringify(
        {
          headerOk: result.headerOk,
          missingColumns: result.missingColumns,
          unexpectedColumns: result.unexpectedColumns,
          summary: s,
          withValidEan: result.candidates.filter((c) => c.ean).length,
          withRawEan: result.candidates.filter((c) => c.eanRaw).length,
          basisCensus: result.candidates.reduce<Record<string, number>>((acc, c) => {
            const k = String(c.nutritionBasis);
            acc[k] = (acc[k] ?? 0) + 1;
            return acc;
          }, {}),
          warnCensus,
          reasonCensus,
        },
        null,
        2,
      ),
    );
    expect(result.headerOk).toBe(true);
    expect(s.rows).toBe(820);
  });
});
