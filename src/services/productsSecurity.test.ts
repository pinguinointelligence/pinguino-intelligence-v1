/// <reference types="node" />
/**
 * Mapper Slice D1 — products data-layer security/scope guards.
 *
 * The products service MAY write public.products (own-row CRUD), but it must
 * NEVER read or write the locked reference base (mapper_basement), must pull in
 * no privileged role / AI / billing vendor, must not call the recipe engine, and
 * must not carry an ingredient-level npac_value. The runtime ingredient service
 * must still read mapper_basement, read-only. Static source-text guards.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

const SERVICE = read('services', 'products.ts');
const ROW = read('data', 'products', 'productRow.ts');
const INGREDIENTS = read('services', 'ingredients.ts');

/** Strip block + line comments so guards check executable code, not the docs
 * (the headers intentionally document the mapper_basement / no-npac boundary). */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const SERVICE_CODE = stripComments(SERVICE);
const ROW_CODE = stripComments(ROW);

describe('products service — scope & security (Slice D1)', () => {
  it('targets only the products table', () => {
    expect(/const TABLE = 'products'/.test(SERVICE)).toBe(true);
    expect(SERVICE.includes('.from(TABLE)')).toBe(true);
  });

  it('never references the locked reference base or the legacy table (executable code)', () => {
    expect(/mapper_basement/i.test(SERVICE_CODE)).toBe(false);
    expect(/ingredients_final_v0_95_no_npac/i.test(SERVICE_CODE)).toBe(false);
  });

  it('uses no privileged server role and no AI/billing vendor', () => {
    expect(/service[_-]?role/i.test(SERVICE_CODE)).toBe(false);
    expect(/\b(openai|stripe)\b/i.test(SERVICE_CODE)).toBe(false);
  });

  it('imports no recipe engine and does no recipe calculation', () => {
    expect(/@\/engine/.test(SERVICE_CODE)).toBe(false);
    expect(/calculateRecipe|proposeCorrections|applyAutoFix/.test(SERVICE_CODE)).toBe(false);
  });

  it('never coerces unknown numeric values to 0 (NULL stays NULL)', () => {
    expect(/\?\?\s*0\b/.test(SERVICE_CODE)).toBe(false);
  });

  it('writes (insert/update/delete) only ever bind to the products TABLE', () => {
    // the basement is never named in executable code, so no write can target it;
    // every write verb in the file is `.from(TABLE).<verb>` with TABLE === 'products'.
    expect(/mapper_basement/i.test(SERVICE_CODE)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.delete(']) {
      if (SERVICE_CODE.includes(verb)) {
        expect(SERVICE_CODE.includes('.from(TABLE)')).toBe(true);
      }
    }
  });
});

describe('product types (Slice D1)', () => {
  it('carry no npac_value but keep pac_value + pod_value', () => {
    expect(/npac_value/i.test(ROW_CODE)).toBe(false);
    expect(/\bpac_value\b/.test(ROW_CODE)).toBe(true);
    expect(/\bpod_value\b/.test(ROW_CODE)).toBe(true);
  });

  it('import no engine module', () => {
    expect(/@\/engine/.test(ROW_CODE)).toBe(false);
  });

  it('do NOT include the future Mapper-result columns (those arrive with 0008)', () => {
    for (const f of [
      'matched_basement_id', 'match_confidence', 'match_method', 'mapper_status',
      'normalized_name', 'calculated_profile_json', 'source_values_json',
    ]) {
      expect(ROW_CODE.includes(f), `D1 must not define ${f}`).toBe(false);
    }
  });

  it('expose the full status and source_type vocabularies', () => {
    for (const s of ['draft', 'pi_calculated', 'pi_generated', 'manual_adjusted', 'pi_verified', 'rejected']) {
      expect(ROW.includes(`'${s}'`), s).toBe(true);
    }
    for (const s of ['customer_upload', 'label_scan', 'barcode_ean', 'catalog_import', 'mercadona', 'colin_catalog', 'manual', 'api']) {
      expect(ROW.includes(`'${s}'`), s).toBe(true);
    }
  });
});

describe('runtime reference base is untouched by Slice D1', () => {
  it('the ingredient service still reads mapper_basement, read-only', () => {
    expect(INGREDIENTS.includes("const TABLE = 'mapper_basement'")).toBe(true);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(INGREDIENTS.includes(verb), `ingredients.ts must stay read-only (${verb})`).toBe(false);
    }
  });
});
