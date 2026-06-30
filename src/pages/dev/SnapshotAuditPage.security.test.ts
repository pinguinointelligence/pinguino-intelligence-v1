/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const PAGE = strip(readFileSync(join(SRC, 'pages', 'dev', 'SnapshotAuditPage.tsx'), 'utf8'));

describe('snapshot audit — boundaries', () => {
  it('is DEV-only (NotFoundPage in production)', () => {
    expect(PAGE.includes('import.meta.env.DEV')).toBe(true);
    expect(PAGE.includes('NotFoundPage')).toBe(true);
  });

  it('is read-only — no write verbs, no write/mutation service, no supabase', () => {
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(PAGE.includes(verb), verb).toBe(false);
    }
    expect(/supabase/i.test(PAGE)).toBe(false);
    expect(/updateProduct|createProduct|applyProductEnrichment|setProductLifecycleStatus|snapshotSourceChange/.test(PAGE)).toBe(false);
  });

  it('reads only via listMyProducts + listProductSnapshots', () => {
    expect(PAGE.includes('listMyProducts')).toBe(true);
    expect(PAGE.includes('listProductSnapshots')).toBe(true);
  });

  it('never references pac/pod, the reference base, or npac', () => {
    expect(/pac_value|pod_value/i.test(PAGE)).toBe(false);
    expect(/mapper_basement/i.test(PAGE)).toBe(false);
    expect(/npac_value/i.test(PAGE)).toBe(false);
  });
});
