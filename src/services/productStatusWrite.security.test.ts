/// <reference types="node" />
/**
 * productStatusWrite boundary guard. Proves the service writes ONLY the lifecycle status +
 * review-audit fields on public.products — never identity / EAN / source / nutrition /
 * composition / pac-pod / Mapper-result columns, never mapper_basement, no privileged key,
 * no npac_value. Static source-text guard (comment-stripped).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(join(import.meta.dirname, 'productStatusWrite.ts'), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const CODE = stripComments(SRC);

describe('productStatusWrite — narrow lifecycle-status write', () => {
  it('targets only public.products and a single UPDATE', () => {
    expect(/const TABLE = 'products'/.test(CODE)).toBe(true);
    expect(CODE.includes('.update(patch)')).toBe(true);
    expect(/mapper_basement/i.test(CODE)).toBe(false);
  });

  it('the patch carries ONLY status + the review-audit fields', () => {
    // the patch type lists exactly these keys
    expect(/status: ProductStatus; reviewed_by\?: string; reviewed_at\?: string; review_notes\?: string/.test(CODE)).toBe(true);
  });

  it('never sets identity / EAN / source / nutrition / composition / pac-pod / mapper columns', () => {
    for (const forbidden of [
      'pac_value', 'pod_value', 'npac_value', 'ean_code', 'product_code', 'source_type',
      'matched_basement_id', 'mapper_status', 'fat_percent', 'total_sugars_percent', 'product_name',
    ]) {
      expect(CODE.includes(forbidden), forbidden).toBe(false);
    }
  });

  it('uses no privileged key, no engine, no billing', () => {
    expect(/service[_-]?role/i.test(CODE)).toBe(false);
    expect(/@\/engine/.test(CODE)).toBe(false);
    expect(/\b(openai|stripe)\b/i.test(CODE)).toBe(false);
  });
});
