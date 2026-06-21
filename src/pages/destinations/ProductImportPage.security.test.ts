/// <reference types="node" />
/**
 * Static boundary guard for the D5C4A upload UI. Scans the page + its page-local
 * helpers (comment-stripped source) and proves the slice stayed CSV-UI-only: no
 * XLSX/OCR/camera/network/AI/billing, no engine, no Mapper Basement, no direct DB /
 * Supabase, no product_code write, matching off, no auto-run, no nav exposure.
 *
 * NOTE (per the plan): this UI is ALLOWED to read a CSV file as text in the browser,
 * so file.text() is permitted and asserted present — only the dangerous primitives
 * (readAsArrayBuffer, server upload, no-accept file input) are banned.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = import.meta.dirname;
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (file: string) => stripComments(readFileSync(join(HERE, file), 'utf8'));

const FILES = [
  'ProductImportPage.tsx',
  'productImportController.ts',
  'productImportView.tsx',
  'runProductImport.ts',
] as const;
const SRC: Record<string, string> = Object.fromEntries(FILES.map((f) => [f, read(f)]));
const ALL = Object.values(SRC).join('\n');

describe('ProductImportPage — no banned formats / capture', () => {
  it('pulls in no XLSX / spreadsheet / OCR package', () => {
    expect(/(xlsx|papaparse|exceljs|sheetjs|tesseract)/i.test(ALL)).toBe(false);
  });
  it('has no OCR / camera / media-capture APIs', () => {
    expect(/ocr|camera|getUserMedia|mediaDevices/i.test(ALL)).toBe(false);
  });
});

describe('ProductImportPage — no network / AI / billing / engine', () => {
  it('makes no network call or enrichment', () => {
    expect(/\bfetch\s*\(|XMLHttpRequest|axios/.test(ALL)).toBe(false);
  });
  it('imports no engine, AI, or billing', () => {
    expect(/@\/engine/.test(ALL)).toBe(false);
    expect(/\b(openai|stripe)\b/i.test(ALL)).toBe(false);
  });
});

describe('ProductImportPage — no DB / locked base / write-back', () => {
  it('never touches the database client directly', () => {
    expect(/supabase/i.test(ALL)).toBe(false);
    expect(/service[_-]?role/i.test(ALL)).toBe(false);
    for (const verb of ['.from(', '.insert(', '.update(', '.delete(']) {
      expect(ALL.includes(verb), verb).toBe(false);
    }
  });
  it('never names the locked reference base, NPAC, or writes a product code', () => {
    expect(/mapper_basement/i.test(ALL)).toBe(false);
    expect(/npac_value/i.test(ALL)).toBe(false);
    expect(/product_code\s*[:=]/.test(ALL)).toBe(false);
  });
});

describe('ProductImportPage — matching off, no auto-run', () => {
  it('never enables matching (runMatch stays default false)', () => {
    expect(/runMatch/.test(ALL)).toBe(false); // not even referenced
  });
  it('has no scheduler / trigger / background auto-run', () => {
    expect(/\b(cron|schedule|setInterval|setTimeout|onInsert|trigger|subscribe|background)\b/i.test(ALL)).toBe(false);
  });
  it('writes products ONLY through the sanctioned import service, via runProductImport', () => {
    expect(SRC['runProductImport.ts']!.includes("from '@/services/productCatalogImport'")).toBe(true);
    expect(SRC['runProductImport.ts']!.includes('importProductCatalog(')).toBe(true);
    // the page composes the service only through the wrapper, never the products data layer
    expect(/@\/services\/products\b/.test(ALL)).toBe(false);
    expect(/createProductWithIdentity|matchAndSaveProduct/.test(ALL)).toBe(false);
  });
});

describe('ProductImportPage — CSV file reading is text-only', () => {
  it('reads files as text only (Blob.text), never readAsArrayBuffer / FileReader', () => {
    expect(/\.text\(\)/.test(ALL)).toBe(true); // legitimate in-browser text read is allowed
    expect(/readAsArrayBuffer|FileReader/.test(ALL)).toBe(false);
  });
  it('the file input is constrained to .csv (no no-accept upload control)', () => {
    expect(/type="file"/.test(SRC['ProductImportPage.tsx']!)).toBe(true);
    expect(/accept="\.csv,text\/csv"/.test(SRC['ProductImportPage.tsx']!)).toBe(true);
  });
});

describe('ProductImportPage — no nav exposure', () => {
  it('does not modify or reference the navigation config', () => {
    expect(/navConfig|NAV_ITEMS/.test(ALL)).toBe(false);
  });
});
