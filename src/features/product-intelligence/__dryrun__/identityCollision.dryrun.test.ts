/**
 * Dedup safety probe (diagnostic only): would the SERVER identity rule over-merge
 * two genuinely different INTIMPORT products? Server rule is EAN-first, else
 * sha256(brand|product_name_display|package_size) — no variant, no source id.
 * Costs nothing: no web, OpenAI or DB call. Writes a JSON report.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseINTIMPORT } from '@/data/products/intimport';

const CSV = join(homedir(), 'Desktop', 'PL_Poland.csv');
const REPORT = resolve(__dirname, '../../../../docs/products/identity_collision.json');
const norm = (s: unknown) =>
  String(s ?? '')
    .trim()
    .toLowerCase();

describe.runIf(existsSync(CSV))('INTIMPORT dedup collision probe', () => {
  it('reports server-identity collisions across the real file', () => {
    const parsed = parseINTIMPORT(readFileSync(CSV, 'utf8'));
    const groups = new Map<string, { key: string; withEan: boolean; rows: unknown[] }>();
    let withEan = 0;
    for (const cand of parsed.candidates) {
      const ins = cand.insert as Record<string, unknown>;
      const ean = norm(ins.ean_code ?? (cand as unknown as Record<string, unknown>).ean);
      const hasEan = ean !== '';
      if (hasEan) withEan += 1;
      const key = hasEan
        ? `ean:${ean.replace(/\D/g, '')}`
        : `identity:${norm(ins.brand)}|${norm(ins.product_name_display ?? ins.product_name_internal)}|${norm(ins.package_size)}`;
      const g = groups.get(key) ?? { key, withEan: hasEan, rows: [] };
      g.rows.push({
        rowIndex: cand.rowIndex,
        sourceProductId: (cand as unknown as Record<string, unknown>).sourceProductId ?? null,
        name: cand.displayName,
        brand: ins.brand ?? null,
        size: ins.package_size ?? null,
        variant: cand.source['Variant Original'] ?? cand.source['Variant English'] ?? null,
      });
      groups.set(key, g);
    }
    const collisions = [...groups.values()].filter((g) => g.rows.length > 1);
    // A collision is DANGEROUS when the merged rows are not the same product:
    // different source Product ID or a different variant.
    const dangerous = collisions.filter((g) => {
      const ids = new Set(g.rows.map((r) => norm((r as Record<string, unknown>).sourceProductId)));
      const variants = new Set(g.rows.map((r) => norm((r as Record<string, unknown>).variant)));
      return ids.size > 1 || variants.size > 1;
    });
    const report = {
      totalRows: parsed.candidates.length,
      withEan,
      withoutEan: parsed.candidates.length - withEan,
      distinctIdentities: groups.size,
      collidingGroups: collisions.length,
      rowsInCollidingGroups: collisions.reduce((n, g) => n + g.rows.length, 0),
      dangerousGroups: dangerous.length,
      dangerousExamples: dangerous.slice(0, 25),
      benignExamples: collisions.filter((g) => !dangerous.includes(g)).slice(0, 10),
    };
    mkdirSync(dirname(REPORT), { recursive: true });
    writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
    expect(report.totalRows).toBeGreaterThan(0);
  });
});
