/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(join(import.meta.dirname, 'productStatusWrite.ts'), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const CODE = stripComments(SRC);

describe('productStatusWrite — canonical lifecycle decision boundary', () => {
  it('uses only the canonical ingest adapter and never writes a table directly', () => {
    expect(CODE.includes('ingestProduct(')).toBe(true);
    expect(CODE.includes('canonicalIngestFromLegacyProduct')).toBe(true);
    expect(CODE.includes('.update(')).toBe(false);
    expect(CODE.includes(".from('products')")).toBe(false);
    expect(/mapper_basement/i.test(CODE)).toBe(false);
  });

  it('sends a lifecycle decision and explicit review evidence', () => {
    expect(CODE.includes('lifecycleDecision')).toBe(true);
    expect(CODE.includes('reviewEvidence')).toBe(true);
  });

  it('never sets science, identity or Mapper fields locally', () => {
    for (const forbidden of [
      'pac_value', 'pod_value', 'npac_value', 'ean_code', 'product_code', 'source_type',
      'matched_basement_id', 'mapper_status', 'fat_percent', 'total_sugars_percent',
    ]) expect(CODE.includes(forbidden), forbidden).toBe(false);
  });

  it('uses no privileged key, Engine or billing integration', () => {
    expect(/service[_-]?role/i.test(CODE)).toBe(false);
    expect(/@\/engine/.test(CODE)).toBe(false);
    expect(/\b(openai|stripe)\b/i.test(CODE)).toBe(false);
  });
});
