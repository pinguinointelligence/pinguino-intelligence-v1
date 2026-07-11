/// <reference types="node" />
/**
 * OCR evidence service boundary guard. Proves the evidence layer is APPEND-ONLY (matching
 * migration 0023: SELECT + INSERT only) and never leaks into products / mapper_basement /
 * engine / billing, and uses no privileged key. Static source-text guard (comment-stripped).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CODE = readFileSync(join(import.meta.dirname, 'ocrIntakeEvidence.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

describe('ocrIntakeEvidence — append-only boundary', () => {
  it('targets only the two evidence tables', () => {
    expect(/RUNS_TABLE = 'ocr_extraction_runs'/.test(CODE)).toBe(true);
    expect(/EVIDENCE_TABLE = 'ocr_field_evidence'/.test(CODE)).toBe(true);
    expect(/\.from\('products'\)|mapper_basement/.test(CODE)).toBe(false);
  });

  it('is INSERT + SELECT only — no update/delete/upsert (write-once evidence)', () => {
    expect(CODE.includes('.insert(')).toBe(true);
    expect(CODE.includes('.select(')).toBe(true);
    for (const verb of ['.update(', '.delete(', '.upsert(']) {
      expect(CODE.includes(verb), verb).toBe(false);
    }
  });

  it('uses no privileged key, no engine, no billing/pac/pod/npac', () => {
    expect(/service[_-]?role/i.test(CODE)).toBe(false);
    expect(/@\/engine/.test(CODE)).toBe(false);
    expect(/npac_value|pac_value|pod_value/i.test(CODE)).toBe(false);
    expect(/\b(openai|stripe)\b/i.test(CODE)).toBe(false);
  });
});
