/// <reference types="node" />
/**
 * Catalog import service boundary / scope guard (Slice D5C2).
 *
 * importProductCatalog is PURE ORCHESTRATION: it composes the products service + the D4
 * orchestrator + the pure identity helpers. It must make no direct DB access, never name
 * the locked reference base, never generate a product code, never reach the engine / AI /
 * billing, and never auto-run the matcher. Static source-text guard (comment-stripped).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(join(import.meta.dirname, 'productCatalogImport.ts'), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const CODE = stripComments(SRC);

describe('productCatalogImport — no direct DB access (D5C2)', () => {
  it('never imports the database client or names it, and issues no raw query verbs', () => {
    expect(/@\/lib\/supabase/.test(CODE)).toBe(false);
    expect(/supabase/i.test(CODE)).toBe(false);
    expect(/service[_-]?role/i.test(CODE)).toBe(false);
    for (const verb of ['.from(', '.insert(', '.update(', '.delete(', '.select(']) {
      expect(CODE.includes(verb), verb).toBe(false);
    }
  });
});

describe('productCatalogImport — boundaries (D5C2)', () => {
  it('never names the locked reference base, the engine, AI/billing, or npac_value', () => {
    expect(/mapper_basement/i.test(CODE)).toBe(false);
    expect(/@\/engine/.test(CODE)).toBe(false);
    expect(/\b(openai|stripe)\b/i.test(CODE)).toBe(false);
    expect(/npac_value/i.test(CODE)).toBe(false);
  });

  it('generates no product code app-side (no product_code key set, no MAX, no nextval) and no fake zero', () => {
    expect(/product_code\s*:/.test(CODE)).toBe(false); // reads row.product_code; never SETS one
    expect(/\bmax\s*\(/i.test(CODE)).toBe(false);
    expect(/nextval/i.test(CODE)).toBe(false);
    expect(/\?\?\s*0\b/.test(CODE)).toBe(false);
  });

  it('imports ONLY the allowed services + identity helpers + types', () => {
    expect(CODE.includes("from '@/services/products'")).toBe(true);
    expect(CODE.includes("from '@/services/productMapper'")).toBe(true);
    expect(CODE.includes("from '@/data/products/productIdentity'")).toBe(true);
    expect(/@\/services\/ingredients/.test(CODE)).toBe(false);
  });

  it('runs matchAndSaveProduct only under an explicit runMatch gate — never auto-run', () => {
    expect(CODE.includes('matchAndSaveProduct(')).toBe(true);
    expect(/options\.runMatch === true/.test(CODE)).toBe(true);
    expect(/\b(cron|schedule|setInterval|setTimeout|onInsert|trigger|subscribe|background)\b/i.test(CODE)).toBe(false);
  });

  it('adds no UI / file / OCR / camera / API / XLSX / package', () => {
    expect(/FileReader|readAsText|readAsArrayBuffer|Blob|XMLHttpRequest|\bfetch\(/.test(CODE)).toBe(false);
    expect(/from\s+['"](xlsx|papaparse|exceljs|sheetjs)['"]/.test(CODE)).toBe(false);
    expect(/ocr|tesseract|camera|getUserMedia|mediaDevices/i.test(CODE)).toBe(false);
  });
});
