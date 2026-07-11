// Capture REAL tesseract.js raw OCR text from the committed fixture PNGs into
// __fixtures__/raw/<name>.txt (committed; used by the deterministic parser tests).
// Run manually after regenerating fixtures:
//   node src/features/ocr-intake/__fixtures__/capture-raw-text.mjs
// Fully local: vendored langdata from node_modules/@tesseract.js-data (no network).
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorker } from 'tesseract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..');
const cacheRoot = join(ROOT, 'node_modules', '.cache', 'pinguino-ocr');
const langPath = join(cacheRoot, 'langs');
const cachePath = join(cacheRoot, 'engine-cache');
mkdirSync(langPath, { recursive: true });
mkdirSync(cachePath, { recursive: true });
for (const lang of ['eng', 'spa']) {
  const src = join(ROOT, 'node_modules', '@tesseract.js-data', lang, '4.0.0_best_int', `${lang}.traineddata.gz`);
  const dst = join(langPath, `${lang}.traineddata.gz`);
  if (!existsSync(dst)) copyFileSync(src, dst);
}

const FIXTURES = [
  'label_clear_en.png',
  'label_decimal_comma_es.png',
  'label_multiline_ingredients_en.png',
  'label_lowquality.png',
  'label_partial_en.png',
];

const rawDir = join(HERE, 'raw');
mkdirSync(rawDir, { recursive: true });

const worker = await createWorker(['eng', 'spa'], undefined, { langPath, cachePath, gzip: true });
for (const name of FIXTURES) {
  const started = Date.now();
  const { data } = await worker.recognize(join(HERE, name), {}, { text: true, blocks: true });
  const out = join(rawDir, name.replace(/\.png$/, '.txt'));
  writeFileSync(out, data.text, 'utf8');
  console.log(`${name}: confidence=${data.confidence} chars=${data.text.length} ${Date.now() - started}ms -> ${out}`);
}
await worker.terminate();
