/// <reference types="node" />
/**
 * OCR persistence orchestrator boundary guard. Proves the orchestrator writes products ONLY
 * through the existing identity-aware save flow (saveIntakeSession → importProductCatalog),
 * never touches public.products / mapper_basement directly, holds no DB client / privileged
 * key, and never assigns saved_product_id (service-role-only column). Static source guard.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CODE = readFileSync(join(import.meta.dirname, 'ocrIntakePersistence.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

describe('ocrIntakePersistence — products-write boundary', () => {
  it('writes products ONLY via the existing save flow, never a direct products query', () => {
    expect(CODE.includes('saveIntakeSession')).toBe(true);
    expect(/\.from\(('|")products('|")\)/.test(CODE)).toBe(false);
    expect(/mapper_basement/.test(CODE)).toBe(false);
  });

  it('holds no database client / raw query / privileged key of its own', () => {
    expect(/@\/lib\/supabase\/client/.test(CODE)).toBe(false);
    expect(/service[_-]?role/i.test(CODE)).toBe(false);
    expect(/\.rpc\(|execute_sql/.test(CODE)).toBe(false);
  });

  it('never writes saved_product_id (service-role-only) and stays clear of engine/billing', () => {
    // saved_product_id may be NAMED in comments/flags but never assigned in an insert/update payload
    expect(/saved_product_id\s*:/.test(CODE)).toBe(false);
    expect(/@\/engine|npac_value/.test(CODE)).toBe(false);
    expect(/\b(openai|stripe)\b/i.test(CODE)).toBe(false);
  });
});
