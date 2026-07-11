/// <reference types="node" />
/**
 * REAL provider proof — TesseractOcrProvider actually recognizing the committed
 * German + Polish fixture PNGs in Node (offline vendored deu/pol langdata), then the
 * evidence extractor producing correctly normalized, provenance-honest fields.
 * The contract-failure tests (mime/empty/oversize/abort) never start the engine.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixturePath, prepareNodeOcrAssets } from '../__fixtures__/nodeOcrAssets';
import { ALL_INTAKE_FIELD_KEYS, extractEvidence } from '../evidenceExtractor';
import type { AcceptedMime, IntakeFieldKey, RawOcrResult, ReviewedField } from '../intakeContracts';
import { MAX_LABEL_IMAGE_BYTES } from '../ocrEngine';
import { TESSERACT_PROVIDER_ID, TesseractOcrProvider } from './tesseractProvider';

const assets = prepareNodeOcrAssets();
const OCR_TIMEOUT = 120_000;

const provider = new TesseractOcrProvider({ langPath: assets.langPath, cachePath: assets.cachePath });

const imageBytes = (name: string): Uint8Array => new Uint8Array(readFileSync(fixturePath(name)));

const field = (fields: ReviewedField[], key: IntakeFieldKey): ReviewedField => {
  const f = fields.find((x) => x.fieldKey === key);
  if (!f) throw new Error(`field ${key} missing`);
  return f;
};

describe('TesseractOcrProvider — contract failures (no engine start)', () => {
  it('unsupported mime → unsupported_format with the offending mime', async () => {
    const r = await provider.recognize({
      imageId: 'img-pdf',
      bytes: new Uint8Array([1, 2, 3]),
      mime: 'application/pdf' as AcceptedMime,
      languages: ['eng'],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure).toEqual({ kind: 'unsupported_format', mime: 'application/pdf' });
  });

  it('empty bytes → unreadable_image (nothing to read is not an engine error)', async () => {
    const r = await provider.recognize({
      imageId: 'img-empty',
      bytes: new Uint8Array(0),
      mime: 'image/png',
      languages: ['eng'],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.kind).toBe('unreadable_image');
  });

  it('over the 15 MB cap → engine_error with the honest limit message', async () => {
    const r = await provider.recognize({
      imageId: 'img-huge',
      bytes: new Uint8Array(MAX_LABEL_IMAGE_BYTES + 1),
      mime: 'image/png',
      languages: ['eng'],
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.failure.kind === 'engine_error') {
      expect(r.failure.message).toMatch(/limit is 15 MB/);
    } else {
      throw new Error('expected engine_error');
    }
  });

  it('an already-aborted signal → cancelled before any recognition', async () => {
    const controller = new AbortController();
    controller.abort();
    const r = await provider.recognize({
      imageId: 'img-aborted',
      bytes: imageBytes('label_clear_en.png'),
      mime: 'image/png',
      languages: ['eng'],
      signal: controller.signal,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.kind).toBe('cancelled');
  });
});

describe('TesseractOcrProvider — REAL OCR (offline deu/pol langdata)', () => {
  it(
    'recognizes the German fixture: RawOcrResult shape, words + bboxes, progress',
    { timeout: OCR_TIMEOUT },
    async () => {
      const fractions: number[] = [];
      const r = await provider.recognize({
        imageId: 'img-de',
        bytes: imageBytes('label_nutrition_de.png'),
        mime: 'image/png',
        languages: ['deu'],
        onProgress: (f) => fractions.push(f),
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const result: RawOcrResult = r.result;
      expect(result.providerId).toBe(TESSERACT_PROVIDER_ID);
      expect(result.imageId).toBe('img-de');
      expect(result.languageHints).toEqual(['deu']);
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.overallConfidence).toBeGreaterThanOrEqual(60);
      // tokens REALLY read from pixels
      expect(result.fullText).toMatch(/Alpenmilch Schokolade/);
      expect(result.fullText).toMatch(/Brennwert/);
      expect(result.fullText).toMatch(/N[ÄA]HRWERTE/i);
      expect(result.lines.length).toBeGreaterThan(10);
      for (const line of result.lines) {
        expect(line.confidence).toBeGreaterThanOrEqual(0);
        expect(line.confidence).toBeLessThanOrEqual(100);
        expect(line.words.length).toBeGreaterThan(0);
      }
      // per-word bounding boxes present (provider seam requirement)
      const words = result.lines.flatMap((l) => l.words);
      expect(words.some((w) => w.bbox !== null && w.bbox.x1 > w.bbox.x0 && w.bbox.y1 > w.bbox.y0)).toBe(true);
      // progress really reported as 0..1 fractions
      expect(fractions.length).toBeGreaterThan(0);
      for (const f of fractions) {
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      }

      // END-TO-END: real OCR → evidence extractor (normalized values + provenance)
      const out = extractEvidence([{ imageId: 'img-de', role: 'nutrition_table', result }]);
      expect(out.map((f) => f.fieldKey).sort()).toEqual([...ALL_INTAKE_FIELD_KEYS].sort());
      expect(field(out, 'product_name').candidates[0]?.normalized).toBe('Alpenmilch Schokolade');
      expect(field(out, 'brand').candidates[0]?.normalized).toBe('Gletscherhaus');
      expect(field(out, 'package_size').candidates[0]?.normalized).toBe('90');
      expect(field(out, 'package_unit').candidates[0]?.normalized).toBe('g');
      expect(field(out, 'nutrition_basis').candidates[0]?.normalized).toBe('per_100g');
      expect(field(out, 'energy_kj').candidates[0]?.normalized).toBe('2287');
      expect(field(out, 'energy_kcal').candidates[0]?.normalized).toBe('549');
      expect(field(out, 'fat').candidates[0]?.normalized).toBe('30.5');
      expect(field(out, 'saturated_fat').candidates[0]?.normalized).toBe('18.7');
      expect(field(out, 'carbohydrate').candidates[0]?.normalized).toBe('52.4');
      expect(field(out, 'sugars').candidates[0]?.normalized).toBe('51.2');
      expect(field(out, 'protein').candidates[0]?.normalized).toBe('7.3');
      expect(field(out, 'salt').candidates[0]?.normalized).toBe('0.25');
      expect(field(out, 'ean_code').candidates[0]?.normalized).toBe('4012345678901');
      expect(field(out, 'claim_vegetarian').candidates[0]?.normalized).toBe('true');
      expect(field(out, 'claim_gluten_free').candidates[0]?.normalized).toBe('true');
      // provenance honesty on a real run
      expect(field(out, 'fat').candidates[0]?.provenance).toBe('explicit');
      expect(field(out, 'sodium').candidates[0]?.provenance).toBe('absent');
      expect(field(out, 'product_name').reviewStatus).toBe('needs_confirmation');
    },
  );

  it(
    'recognizes the Polish multipack fixture: trace + explicit zero + fibre + EAN',
    { timeout: OCR_TIMEOUT },
    async () => {
      const r = await provider.recognize({
        imageId: 'img-pl',
        bytes: imageBytes('label_multipack_pl.png'),
        mime: 'image/png',
        languages: ['pol'],
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.result.fullText).toMatch(/Jab[łl]kowy/);
      expect(r.result.fullText).toMatch(/WARTO[ŚS][ĆC] OD[ŻZ]YWCZA/i);

      const out = extractEvidence([{ imageId: 'img-pl', role: 'nutrition_table', result: r.result }]);
      expect(field(out, 'product_name').candidates[0]?.normalized).toBe('Sok Jabłkowy Klarowny');
      expect(field(out, 'package_size').candidates[0]?.normalized).toBe('330'); // multipack per-unit
      expect(field(out, 'package_unit').candidates[0]?.normalized).toBe('ml');
      expect(field(out, 'package_size').candidates[0]?.warnings.join(' ')).toMatch(/multipack/);
      expect(field(out, 'nutrition_basis').candidates[0]?.normalized).toBe('per_100ml');
      expect(field(out, 'energy_kj').candidates[0]?.normalized).toBe('190');
      expect(field(out, 'energy_kcal').candidates[0]?.normalized).toBe('45');
      expect(field(out, 'fat').candidates[0]?.normalized).toBe('0.1');
      expect(field(out, 'carbohydrate').candidates[0]?.normalized).toBe('10.6');
      expect(field(out, 'sugars').candidates[0]?.normalized).toBe('10.2');
      expect(field(out, 'fibre').candidates[0]?.normalized).toBe('0.5');
      expect(field(out, 'protein').candidates[0]?.normalized).toBe('0.1');
      // "<0,1 g" really read from pixels → trace: explicit + null (NEVER zero)
      const sat = field(out, 'saturated_fat').candidates[0];
      expect(sat?.provenance).toBe('explicit');
      expect(sat?.normalized).toBeNull();
      // glued "Sól0,0g" really read → EXPLICIT zero (distinct from absent)
      expect(field(out, 'salt').candidates[0]?.normalized).toBe('0');
      expect(field(out, 'ean_code').candidates[0]?.normalized).toBe('5901234123457');
      expect(field(out, 'claim_gluten_free').candidates[0]?.normalized).toBe('true');
    },
  );

  it(
    'AbortSignal mid-run resolves to an honest cancelled failure',
    { timeout: OCR_TIMEOUT },
    async () => {
      const controller = new AbortController();
      const pending = provider.recognize({
        imageId: 'img-cancel',
        bytes: imageBytes('label_nutrition_de.png'),
        mime: 'image/png',
        languages: ['deu'],
        onProgress: () => controller.abort(), // cancel as soon as recognition starts
        signal: controller.signal,
      });
      const r = await pending;
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.failure.kind).toBe('cancelled');
    },
  );
});
