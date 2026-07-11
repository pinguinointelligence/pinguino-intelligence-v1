/// <reference types="node" />
/**
 * REAL OCR engine proof — tesseract.js actually recognizing the committed fixture
 * images in Node. No mocks, no fixture text: the assertions below only pass if the
 * WASM engine really reads the pixels. Language models load OFFLINE from the vendored
 * @tesseract.js-data packages (see nodeOcrAssets). These tests are slower than unit
 * tests by nature — each carries an explicit timeout.
 */
import { describe, expect, it } from 'vitest';
import { fixturePath, prepareNodeOcrAssets } from './__fixtures__/nodeOcrAssets';
import { parseLabelText } from './labelTextParser';
import {
  MAX_LABEL_IMAGE_BYTES,
  startLabelOcr,
  validateLabelImage,
  type OcrProgress,
} from './ocrEngine';

const assets = prepareNodeOcrAssets();
const OCR_TIMEOUT = 120_000;

const runFixture = (name: string, onProgress?: (p: OcrProgress) => void) =>
  startLabelOcr(fixturePath(name), {
    langPath: assets.langPath,
    cachePath: assets.cachePath,
    ...(onProgress ? { onProgress } : {}),
  }).done;

describe('validateLabelImage (no OCR run)', () => {
  it('accepts PNG/JPEG/WebP within the size limit', () => {
    expect(validateLabelImage({ filename: 'a.png', mime: 'image/png', sizeBytes: 1000 }).ok).toBe(true);
    expect(validateLabelImage({ filename: 'b.JPG', mime: null, sizeBytes: 1000 }).ok).toBe(true);
    expect(validateLabelImage({ filename: 'c.webp', mime: 'image/webp', sizeBytes: 1000 }).ok).toBe(true);
  });

  it('rejects unsupported formats, oversized and empty files with honest reasons', () => {
    const pdf = validateLabelImage({ filename: 'doc.pdf', mime: 'application/pdf', sizeBytes: 1000 });
    expect(pdf.ok).toBe(false);
    expect(pdf.reason).toMatch(/PNG, JPEG or WebP/);
    const heic = validateLabelImage({ filename: 'scan.heic', mime: 'image/heic', sizeBytes: 1000 });
    expect(heic.ok).toBe(false);
    const big = validateLabelImage({ filename: 'a.png', mime: 'image/png', sizeBytes: MAX_LABEL_IMAGE_BYTES + 1 });
    expect(big.ok).toBe(false);
    expect(big.reason).toMatch(/limit/);
    expect(validateLabelImage({ filename: 'a.png', mime: 'image/png', sizeBytes: 0 }).ok).toBe(false);
  });
});

describe('REAL OCR on fixture images (tesseract.js in Node, offline langdata)', () => {
  it(
    'reads the clear English label and reports progress',
    { timeout: OCR_TIMEOUT },
    async () => {
      const progress: OcrProgress[] = [];
      const r = await runFixture('label_clear_en.png', (p) => progress.push(p));
      expect(r.status).toBe('ok');
      if (r.status !== 'ok') return;
      // key tokens REALLY recognized from pixels (minor OCR noise tolerated elsewhere)
      expect(r.text).toMatch(/Vanilla Dessert Base/i);
      expect(r.text).toMatch(/Polar Foods/);
      expect(r.text).toMatch(/368\s*kcal/i);
      expect(r.text).toMatch(/Ingredients/i);
      expect(r.lines.length).toBeGreaterThan(10);
      for (const line of r.lines) {
        expect(line.confidence).toBeGreaterThanOrEqual(0);
        expect(line.confidence).toBeLessThanOrEqual(100);
      }
      expect(r.overallConfidence).toBeGreaterThanOrEqual(60);
      expect(progress.some((p) => p.status === 'recognizing text')).toBe(true);

      // END-TO-END: engine output → parser → structured fields
      const x = parseLabelText(r.lines);
      expect(x.basis).toBe('per_100g');
      expect(x.sugars.value).toBe(48.2);
      expect(x.salt.value).toBe(0.28);
      expect(x.eanCode.value).toBe('8480000610928');
      expect(x.brand.value).toBe('Polar Foods');
    },
  );

  it(
    'reads the Spanish decimal-comma label (per 100 ml)',
    { timeout: OCR_TIMEOUT },
    async () => {
      const r = await runFixture('label_decimal_comma_es.png');
      expect(r.status).toBe('ok');
      if (r.status !== 'ok') return;
      expect(r.text).toMatch(/Horchata/i);
      expect(r.text).toMatch(/azucares/i);
      const x = parseLabelText(r.lines);
      expect(x.basis).toBe('per_100ml');
      expect(x.languageHint).toBe('es');
      expect(x.sugars.value).toBe(10.1); // decimal comma "10,1 g" really parsed
      expect(x.saturatedFat.value).toBe(0.2);
      expect(x.salt.value).toBe(0.03);
    },
  );

  it(
    'reads multiline ingredients + allergens + may-contain',
    { timeout: OCR_TIMEOUT },
    async () => {
      const r = await runFixture('label_multiline_ingredients_en.png');
      expect(r.status).toBe('ok');
      if (r.status !== 'ok') return;
      const x = parseLabelText(r.lines);
      expect(x.ingredientsText.value).toMatch(/cocoa mass/i);
      expect(x.ingredientsText.value).toMatch(/hazelnut paste/i);
      expect(x.allergens.value).toMatch(/milk/i);
      expect(x.mayContain.value).toMatch(/tree nuts/i);
      expect(x.fat.value).toBe(34.9); // glued "Fat34.9¢g" recovered honestly
      expect(x.salt.value).toBe(0.11);
    },
  );

  it(
    'fails HONESTLY on the unreadable (blurred) label — no fabricated text',
    { timeout: OCR_TIMEOUT },
    async () => {
      const r = await runFixture('label_lowquality.png');
      expect(r.status).toBe('failed');
      if (r.status !== 'failed') return;
      expect(r.reason).toBe('unreadable_image');
      expect(r.message).toMatch(/No readable label text/);
    },
  );

  it(
    'OCR succeeds on a readable non-nutrition label but parsing stays incomplete',
    { timeout: OCR_TIMEOUT },
    async () => {
      const r = await runFixture('label_partial_en.png');
      expect(r.status).toBe('ok');
      if (r.status !== 'ok') return;
      expect(r.text).toMatch(/Alpine Herbal Drops/i);
      const x = parseLabelText(r.lines);
      expect(x.basis).toBe('unknown');
      expect(x.fat.value).toBeNull();
      expect(x.energyKcal.value).toBeNull();
      expect(x.ingredientsText.value).toBeNull();
      expect(x.warnings.join(' ')).toMatch(/no per-100/);
    },
  );

  it(
    'cancellation resolves to an honest cancelled failure',
    { timeout: OCR_TIMEOUT },
    async () => {
      const job = startLabelOcr(fixturePath('label_clear_en.png'), {
        langPath: assets.langPath,
        cachePath: assets.cachePath,
      });
      job.cancel();
      const r = await job.done;
      expect(r.status).toBe('failed');
      if (r.status !== 'failed') return;
      expect(r.reason).toBe('cancelled');
    },
  );
});
