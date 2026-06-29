/// <reference types="node" />
/**
 * Product snapshots service boundary guard. Proves the service targets ONLY the append-only
 * public.product_snapshots table: it never writes products or the locked mapper_basement,
 * exposes no UPDATE/DELETE (append-only), uses no privileged key, no engine, no npac_value,
 * and diffs via the pure productSnapshotDiff. Static source-text guard (comment-stripped).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(join(import.meta.dirname, 'productSnapshots.ts'), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const CODE = stripComments(SRC);

describe('productSnapshots — scope & append-only', () => {
  it('targets ONLY the product_snapshots table', () => {
    expect(/const TABLE = 'product_snapshots'/.test(CODE)).toBe(true);
    expect(CODE.includes('.from(TABLE)')).toBe(true);
    // never the products table or the locked reference base
    expect(/\.from\('products'\)|from\('mapper_basement'\)/.test(CODE)).toBe(false);
    expect(/mapper_basement/i.test(CODE)).toBe(false);
  });

  it('is append-only: SELECT + INSERT only, no UPDATE/DELETE/UPSERT', () => {
    expect(CODE.includes('.insert(')).toBe(true);
    expect(CODE.includes('.select(')).toBe(true);
    for (const verb of ['.update(', '.delete(', '.upsert(']) {
      expect(CODE.includes(verb), verb).toBe(false);
    }
  });

  it('is owner-scoped (getCurrentUser + owner_user_id), uses no privileged key', () => {
    expect(CODE.includes('getCurrentUser')).toBe(true);
    expect(CODE.includes('owner_user_id')).toBe(true);
    expect(/service[_-]?role/i.test(CODE)).toBe(false);
  });

  it('diffs via the pure productSnapshotDiff and never touches engine / npac_value', () => {
    expect(CODE.includes("from '@/data/products/productSnapshotDiff'")).toBe(true);
    expect(/@\/engine/.test(CODE)).toBe(false);
    expect(/npac_value/i.test(CODE)).toBe(false);
    expect(/\b(openai|stripe)\b/i.test(CODE)).toBe(false);
  });
});
