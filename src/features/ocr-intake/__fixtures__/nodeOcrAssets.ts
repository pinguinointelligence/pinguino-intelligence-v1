/// <reference types="node" />
/**
 * Node-side OCR asset preparation for tests/scripts ONLY (never imported by app code).
 *
 * Copies the VENDORED language models (npm packages @tesseract.js-data/eng + /spa,
 * exact-pinned in package.json) into one local directory so tesseract.js can load them
 * fully OFFLINE via `langPath`. Nothing is downloaded at test time; the engine cache is
 * kept under node_modules/.cache (never committed).
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');

export const FIXTURES_DIR = HERE;

/** Local (vendored, best_int) language models — matches the engine's LSTM-only default. */
const LANG_VARIANT = '4.0.0_best_int';
const LANGS = ['eng', 'spa'] as const;

export interface NodeOcrAssets {
  langPath: string;
  cachePath: string;
}

/** Prepare an offline langPath + cachePath for Node OCR runs. Idempotent. */
export function prepareNodeOcrAssets(): NodeOcrAssets {
  const cacheRoot = join(REPO_ROOT, 'node_modules', '.cache', 'pinguino-ocr');
  const langPath = join(cacheRoot, 'langs');
  const cachePath = join(cacheRoot, 'engine-cache');
  mkdirSync(langPath, { recursive: true });
  mkdirSync(cachePath, { recursive: true });
  for (const lang of LANGS) {
    const source = join(REPO_ROOT, 'node_modules', '@tesseract.js-data', lang, LANG_VARIANT, `${lang}.traineddata.gz`);
    const target = join(langPath, `${lang}.traineddata.gz`);
    if (!existsSync(source)) {
      throw new Error(`vendored language model missing: ${source} — run npm install`);
    }
    if (!existsSync(target)) copyFileSync(source, target);
  }
  return { langPath, cachePath };
}

export const fixturePath = (name: string): string => join(FIXTURES_DIR, name);
