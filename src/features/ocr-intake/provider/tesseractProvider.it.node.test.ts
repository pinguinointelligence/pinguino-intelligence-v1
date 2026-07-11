/// <reference types="node" />
/**
 * REAL provider proof for ITALIAN — closes the last multilingual gap. The audit noted
 * EN/ES/DE/PL were real-OCR-proven but IT was unit-only (no image fixture). This runs
 * the TesseractOcrProvider on a committed Italian label PNG with the offline vendored
 * `ita` langdata, then the evidence extractor, asserting real recognized tokens +
 * normalized, provenance-honest fields (decimal commas, native IT headings).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixturePath, prepareNodeOcrAssets } from '../__fixtures__/nodeOcrAssets';
import { ALL_INTAKE_FIELD_KEYS, extractEvidence } from '../evidenceExtractor';
import type { IntakeFieldKey, ReviewedField } from '../intakeContracts';
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

describe('TesseractOcrProvider — REAL OCR (offline ita langdata)', () => {
  it(
    'recognizes the Italian fixture: native headings, comma decimals, valid EAN',
    { timeout: OCR_TIMEOUT },
    async () => {
      const r = await provider.recognize({
        imageId: 'img-it',
        bytes: imageBytes('label_nutrition_it.png'),
        mime: 'image/png',
        languages: ['ita'],
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const result = r.result;
      expect(result.providerId).toBe(TESSERACT_PROVIDER_ID);
      expect(result.imageId).toBe('img-it');
      expect(result.languageHints).toEqual(['ita']);
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.overallConfidence).toBeGreaterThanOrEqual(60);
      // tokens REALLY read from pixels
      expect(result.fullText).toMatch(/Gelato al Pistacchio/i);
      expect(result.fullText).toMatch(/VALORI NUTRIZIONALI/i);
      expect(result.fullText).toMatch(/Proteine/i);

      // END-TO-END: real OCR → deterministic evidence extractor (Italian parser path)
      const out = extractEvidence([{ imageId: 'img-it', role: 'nutrition_table', result }]);
      expect(out.map((f) => f.fieldKey).sort()).toEqual([...ALL_INTAKE_FIELD_KEYS].sort());
      expect(field(out, 'brand').candidates[0]?.normalized).toBe('Dolce Sicilia');
      expect(field(out, 'package_size').candidates[0]?.normalized).toBe('500');
      expect(field(out, 'package_unit').candidates[0]?.normalized).toBe('g');
      expect(field(out, 'nutrition_basis').candidates[0]?.normalized).toBe('per_100g');
      expect(field(out, 'energy_kj').candidates[0]?.normalized).toBe('1042');
      expect(field(out, 'energy_kcal').candidates[0]?.normalized).toBe('249');
      expect(field(out, 'fat').candidates[0]?.normalized).toBe('14.2');
      expect(field(out, 'saturated_fat').candidates[0]?.normalized).toBe('8.1');
      expect(field(out, 'carbohydrate').candidates[0]?.normalized).toBe('26.3');
      expect(field(out, 'sugars').candidates[0]?.normalized).toBe('24.7');
      expect(field(out, 'protein').candidates[0]?.normalized).toBe('4.1');
      expect(field(out, 'salt').candidates[0]?.normalized).toBe('0.12');
      expect(field(out, 'ean_code').candidates[0]?.normalized).toBe('8001234567897');
      // provenance honesty on a real run: read value is explicit, sodium never invented
      expect(field(out, 'fat').candidates[0]?.provenance).toBe('explicit');
      expect(field(out, 'sodium').candidates[0]?.provenance).toBe('absent');
    },
  );
});
