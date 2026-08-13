/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(join(import.meta.dirname, 'productSnapshots.ts'), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const CODE = stripComments(SRC);

describe('productSnapshots — retired ledger compatibility', () => {
  it('targets only the legacy snapshot ledger', () => {
    expect(CODE.includes("const TABLE = 'product_snapshots'")).toBe(true);
    expect(CODE.includes('.from(TABLE)')).toBe(true);
    expect(/\.from\('products'\)|from\('mapper_basement'\)/.test(CODE)).toBe(false);
  });

  it('is strictly read-only because canonical history belongs to product_versions', () => {
    expect(CODE.includes('.select(')).toBe(true);
    for (const verb of ['.insert(', '.update(', '.delete(', '.upsert(']) {
      expect(CODE.includes(verb), verb).toBe(false);
    }
    expect(CODE.includes('ingest_product_v1')).toBe(false);
  });

  it('uses no privileged key, Engine, billing or Mapper source', () => {
    expect(/service[_-]?role/i.test(CODE)).toBe(false);
    expect(/@\/engine/.test(CODE)).toBe(false);
    expect(/mapper_basement/i.test(CODE)).toBe(false);
    expect(/npac_value|\b(openai|stripe)\b/i.test(CODE)).toBe(false);
  });
});
