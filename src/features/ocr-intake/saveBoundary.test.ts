/// <reference types="node" />
/**
 * Save-boundary proof — the confirmed OCR draft plugs into the EXISTING create/save
 * boundary (importProductCatalog → createProductWithIdentity) through a MOCKED test
 * adapter ONLY. Every service module is mocked, so this test cannot touch any live
 * database, and a static scan proves the OCR feature's UI path never imports a
 * service at all (no auto-save anywhere).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importProductCatalog } from '@/services/productCatalogImport';
import { linesFromText, parseLabelText } from './labelTextParser';
import {
  buildDraftCandidate,
  buildReviewState,
  confirmField,
  unconfirmedRequiredFields,
} from './reviewState';

/* mocked test adapter — NO real service code runs anywhere in this file */
vi.mock('@/services/products', () => ({
  createProductWithIdentity: vi.fn(async () => ({ id: 'test-product-id', product_code: 'P-000123' })),
  findExistingProductForIdentity: vi.fn(async () => null),
}));
vi.mock('@/services/productMapper', () => ({
  matchAndSaveProduct: vi.fn(async () => {
    throw new Error('matching must never run for an OCR draft unless explicitly requested');
  }),
}));
vi.mock('@/services/productSnapshots', () => ({
  snapshotNewProduct: vi.fn(async () => undefined),
  snapshotSourceChange: vi.fn(async () => undefined),
}));

import { createProductWithIdentity, findExistingProductForIdentity } from '@/services/products';
import { matchAndSaveProduct } from '@/services/productMapper';

const RAW = [
  'Vanilla Dessert Base',
  'Brand: Polar Foods',
  'NUTRITION per 100 g',
  'Fat 15.3 g',
  'of which sugars 48.2 g',
  'Salt 0.28 g',
].join('\n');

const confirmedCandidate = () => {
  let state = buildReviewState(parseLabelText(linesFromText(RAW)), RAW, 90);
  for (const key of unconfirmedRequiredFields(state)) state = confirmField(state, key);
  const result = buildDraftCandidate(state);
  if (!result.ok) throw new Error(result.reason);
  return result.candidate;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OCR draft → existing save boundary (mock adapter only)', () => {
  it('the confirmed draft is accepted by importProductCatalog and reaches createProductWithIdentity', async () => {
    const candidate = confirmedCandidate();
    const summary = await importProductCatalog([candidate], { runMatch: false, snapshot: false });

    expect(summary.created).toBe(1);
    expect(summary.failed).toBe(0);
    expect(findExistingProductForIdentity).toHaveBeenCalledTimes(1);
    expect(createProductWithIdentity).toHaveBeenCalledTimes(1);

    const insert = vi.mocked(createProductWithIdentity).mock.calls[0]?.[0];
    expect(insert?.source_type).toBe('label_scan');
    expect(insert?.product_name_display).toBe('Vanilla Dessert Base');
    expect(insert?.brand).toBe('Polar Foods');
    expect(insert?.fat_percent).toBe(15.3);
    expect(insert?.salt_percent).toBe(0.28);
    expect(insert?.detected_text).toBe(RAW);
    expect(insert?.status).toBeUndefined(); // lifecycle stays DB-default draft
    expect(insert?.pac_value).toBeUndefined();
    expect(insert?.pod_value).toBeUndefined();
  });

  it('never triggers matching automatically (runMatch stays opt-in and unused)', async () => {
    await importProductCatalog([confirmedCandidate()], { runMatch: false, snapshot: false });
    expect(matchAndSaveProduct).not.toHaveBeenCalled();
  });
});

describe('no-live-write boundary (static scan)', () => {
  const FEATURE_DIR = resolve(import.meta.dirname);
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('NO file in features/ocr-intake (outside tests) imports a service, a DB client, or fetch', () => {
    const files = readdirSync(FEATURE_DIR).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
    expect(files.length).toBeGreaterThan(3);
    for (const file of files) {
      const src = strip(readFileSync(join(FEATURE_DIR, file), 'utf8'));
      expect(/@\/services\//.test(src), `service import in ${file}`).toBe(false);
      expect(/supabase/i.test(src), `db client in ${file}`).toBe(false);
      expect(/fetch\(/.test(src), `fetch in ${file}`).toBe(false);
      for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(']) {
        expect(src.includes(verb), `${verb} in ${file}`).toBe(false);
      }
    }
  });

  it('the dev review page performs NO save: no service import, no import service usage', () => {
    const page = strip(
      readFileSync(join(FEATURE_DIR, '..', '..', 'pages', 'dev', 'OcrIntakePage.tsx'), 'utf8'),
    );
    expect(/@\/services\//.test(page)).toBe(false);
    expect(/importProductCatalog|createProductWithIdentity/.test(page)).toBe(false);
    expect(/supabase/i.test(page)).toBe(false);
  });

  it('only the engine module references tesseract; the parser/review/copy stay engine-free', () => {
    const files = readdirSync(FEATURE_DIR).filter((f) => /\.ts$/.test(f) && !/\.test\./.test(f));
    for (const file of files) {
      const src = strip(readFileSync(join(FEATURE_DIR, file), 'utf8'));
      const referencesEngine = /from\s+['"]tesseract\.js['"]/.test(src);
      expect(referencesEngine, file).toBe(file === 'ocrEngine.ts');
    }
  });
});

describe('no-live-write boundary — session/dedup/save/batch modules (static scan)', () => {
  const SESSION_DIR = join(resolve(import.meta.dirname), 'session');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const sessionFiles = () => readdirSync(SESSION_DIR).filter((f) => /\.ts$/.test(f) && !/\.test\./.test(f));

  it('ONLY saveFlow.ts imports a service — and EXACTLY the sanctioned import path', () => {
    for (const file of sessionFiles()) {
      const src = strip(readFileSync(join(SESSION_DIR, file), 'utf8'));
      const serviceImports = [...src.matchAll(/from\s+['"](@\/services\/[^'"]+)['"]/g)].map((m) => m[1]);
      if (file === 'saveFlow.ts') {
        // the one sanctioned save path (mocked in every test) — nothing else service-y
        expect(serviceImports).toEqual(['@/services/productCatalogImport']);
      } else {
        expect(serviceImports, `service import in session/${file}`).toEqual([]);
      }
    }
  });

  it('NO session module touches a DB client, fetch, or a write verb; basement is never named', () => {
    for (const file of sessionFiles()) {
      const src = strip(readFileSync(join(SESSION_DIR, file), 'utf8'));
      expect(/supabase/i.test(src), `db client in session/${file}`).toBe(false);
      expect(/fetch\(/.test(src), `fetch in session/${file}`).toBe(false);
      expect(/mapper_basement/i.test(src), `basement named in session/${file}`).toBe(false);
      for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(']) {
        expect(src.includes(verb), `${verb} in session/${file}`).toBe(false);
      }
    }
  });

  it("NO session module imports the OCR engine or Track G's evidence extractor (injected seam only)", () => {
    for (const file of sessionFiles()) {
      const src = strip(readFileSync(join(SESSION_DIR, file), 'utf8'));
      expect(/from\s+['"]tesseract/.test(src), `engine import in session/${file}`).toBe(false);
      expect(/ocrEngine/.test(src), `ocrEngine import in session/${file}`).toBe(false);
      // the seam is a local fn TYPE (EvidenceExtractorFn) — importing G's module is forbidden
      expect(/from\s+['"][^'"]*evidenceExtractor/i.test(src), `extractor import in session/${file}`).toBe(false);
    }
  });
});
