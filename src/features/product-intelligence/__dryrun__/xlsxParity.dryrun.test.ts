/**
 * §13/§14 — XLSX and CSV must be the SAME import.
 *
 * The workbook is only an input adapter, so the two formats must agree on every
 * downstream fact: row count, identities, canonical names, readiness and the
 * dedup preflight. A difference here would mean Product Intelligence had become
 * format-dependent, which is exactly what must never happen.
 *
 * Costs nothing: no web, OpenAI, Vision or DB call.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseINTIMPORT } from '@/data/products/intimport';
import { intimportWorkbookToCsv } from '@/data/products/intimportWorkbook';
import { runIntimportLocalIntelligence } from '../intimportIntelligence';
import { planIntimportDedup } from '../intimportDedup';
import { buildMapperKnowledge } from '../mapperValueInference';
import { loadMapperKnowledgeRows, MAPPER_FILE } from './mapperFixture';

const CSV = join(homedir(), 'Desktop', 'PL_Poland.csv');
const XLSX = join(homedir(), 'Desktop', 'PL_Poland.xlsx');
const REPORT = resolve(__dirname, '../../../../docs/products/xlsx_parity.json');

describe.runIf(existsSync(CSV) && existsSync(XLSX) && existsSync(MAPPER_FILE))(
  'INTIMPORT XLSX / CSV parity',
  () => {
    it('produces the same import from the workbook as from the CSV', () => {
      const buffer = readFileSync(XLSX);
      const converted = intimportWorkbookToCsv(
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      );
      const fromXlsx = parseINTIMPORT(converted.csv);
      const fromCsv = parseINTIMPORT(readFileSync(CSV, 'utf8'));

      const mapper = loadMapperKnowledgeRows();
      const knowledge = buildMapperKnowledge(mapper.rows, mapper.fingerprint);
      const xlsxRun = runIntimportLocalIntelligence(fromXlsx.candidates, {}, knowledge);
      const csvRun = runIntimportLocalIntelligence(fromCsv.candidates, {}, knowledge);
      const xlsxDedup = planIntimportDedup(fromXlsx.candidates);
      const csvDedup = planIntimportDedup(fromCsv.candidates);

      // The owner's CSV export carries HTML entities where the workbook holds
      // the real character: three Teekanne products read &quot;LOVE&quot; in the
      // CSV and "LOVE" in the sheet. The workbook is the faithful source, so the
      // adapter does NOT rewrite values to match a lossy export — the comparison
      // decodes the entity instead, and the difference is recorded below.
      const decode = (value: string) => value.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      const names = (r: typeof fromCsv) =>
        r.candidates.map((c) => decode(`${c.sourceProductId ?? ''}|${c.displayName ?? ''}`));

      const report = {
        sheet: converted.sheet,
        candidates: converted.candidates,
        rows: { xlsx: fromXlsx.candidates.length, csv: fromCsv.candidates.length },
        readiness: { xlsx: xlsxRun.summary.valueReadiness, csv: csvRun.summary.valueReadiness },
        dedup: { xlsx: xlsxDedup.counts, csv: csvDedup.counts },
        identicalNames: JSON.stringify(names(fromXlsx)) === JSON.stringify(names(fromCsv)),
        htmlEntitiesOnlyInCsv: fromCsv.candidates
          .filter((c) => /&quot;|&amp;/.test(c.displayName ?? ''))
          .map((c) => c.sourceProductId),
      };
      mkdirSync(dirname(REPORT), { recursive: true });
      writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

      // EVERY insert field, not just the name. package_size is part of the
      // canonical identity, and Excel's display formatting silently made it
      // „14.00 g × 1.00" against the CSV's „14 g" on 788 rows — which would have
      // re-created the whole catalogue instead of reusing it.
      const insertDiffs: string[] = [];
      for (let i = 0; i < Math.min(fromXlsx.candidates.length, fromCsv.candidates.length); i += 1) {
        const xi = fromXlsx.candidates[i]!.insert as Record<string, unknown>;
        const ci = fromCsv.candidates[i]!.insert as Record<string, unknown>;
        for (const field of new Set([...Object.keys(xi), ...Object.keys(ci)])) {
          if (field === 'extracted_json' || field === 'product_name_display') continue;
          if (JSON.stringify(xi[field]) !== JSON.stringify(ci[field])) {
            insertDiffs.push(`row ${i + 1} ${field}`);
          }
        }
      }
      expect(insertDiffs).toEqual([]);

      expect(fromXlsx.candidates).toHaveLength(fromCsv.candidates.length);
      // Identity and canonical naming must be character-identical.
      expect(names(fromXlsx)).toEqual(names(fromCsv));
      // Product Intelligence must not notice the format.
      expect(xlsxRun.summary.valueReadiness).toEqual(csvRun.summary.valueReadiness);
      expect(xlsxDedup.counts).toEqual(csvDedup.counts);
    });
  },
);
