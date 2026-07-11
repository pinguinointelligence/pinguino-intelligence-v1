// Capture REAL tesseract.js raw OCR text from the committed fixture PNGs into
// __fixtures__/raw/<name>.txt (committed; used by the deterministic parser tests).
// Run manually after regenerating fixtures — all fixtures, or only some:
//   node src/features/ocr-intake/__fixtures__/capture-raw-text.mjs
//   node src/features/ocr-intake/__fixtures__/capture-raw-text.mjs label_nutrition_de.png
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
for (const lang of ['eng', 'spa', 'deu', 'pol']) {
  const src = join(ROOT, 'node_modules', '@tesseract.js-data', lang, '4.0.0_best_int', `${lang}.traineddata.gz`);
  const dst = join(langPath, `${lang}.traineddata.gz`);
  if (!existsSync(dst)) copyFileSync(src, dst);
}

/** language models per fixture — MUST match the langs the Node tests recognize with. */
const FIXTURES = [
  { name: 'label_clear_en.png', langs: ['eng', 'spa'] },
  { name: 'label_decimal_comma_es.png', langs: ['eng', 'spa'] },
  { name: 'label_multiline_ingredients_en.png', langs: ['eng', 'spa'] },
  { name: 'label_lowquality.png', langs: ['eng', 'spa'] },
  { name: 'label_partial_en.png', langs: ['eng', 'spa'] },
  { name: 'label_nutrition_de.png', langs: ['deu'] },
  { name: 'label_multipack_pl.png', langs: ['pol'] },
];

const only = process.argv.slice(2);
const selected = only.length > 0 ? FIXTURES.filter((f) => only.includes(f.name)) : FIXTURES;

const rawDir = join(HERE, 'raw');
mkdirSync(rawDir, { recursive: true });

// group fixtures by language set so each worker is created once
const byLangs = new Map();
for (const f of selected) {
  const key = f.langs.join('+');
  if (!byLangs.has(key)) byLangs.set(key, { langs: f.langs, names: [] });
  byLangs.get(key).names.push(f.name);
}

for (const { langs, names } of byLangs.values()) {
  const worker = await createWorker(langs, undefined, { langPath, cachePath, gzip: true });
  for (const name of names) {
    const started = Date.now();
    const { data } = await worker.recognize(join(HERE, name), {}, { text: true, blocks: true });
    const out = join(rawDir, name.replace(/\.png$/, '.txt'));
    writeFileSync(out, data.text, 'utf8');
    console.log(`${name} [${langs.join('+')}]: confidence=${data.confidence} chars=${data.text.length} ${Date.now() - started}ms -> ${out}`);
  }
  await worker.terminate();
}
