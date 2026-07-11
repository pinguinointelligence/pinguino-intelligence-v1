/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCEPTED_LABEL_IMAGE_TYPES, isAcceptedLabelImage } from './nutritionLabelOcr';

describe('isAcceptedLabelImage', () => {
  it('accepts the declared mime types and common image extensions', () => {
    for (const mime of ACCEPTED_LABEL_IMAGE_TYPES) {
      expect(isAcceptedLabelImage(mime, 'x.bin'), mime).toBe(true);
    }
    expect(isAcceptedLabelImage(null, 'photo.JPG')).toBe(true);
    expect(isAcceptedLabelImage(null, 'scan.webp')).toBe(true);
    expect(isAcceptedLabelImage(null, 'label.png')).toBe(true);
  });

  it('rejects non-image files AND formats the local engine cannot decode (HEIC)', () => {
    expect(isAcceptedLabelImage('text/csv', 'catalog.csv')).toBe(false);
    expect(isAcceptedLabelImage(null, 'notes.pdf')).toBe(false);
    expect(isAcceptedLabelImage(null, 'noext')).toBe(false);
    // honest: the local WASM engine cannot decode HEIC — never accepted then failed later
    expect(isAcceptedLabelImage('image/heic', 'scan.heic')).toBe(false);
    expect(isAcceptedLabelImage(null, 'scan.heic')).toBe(false);
  });
});

describe('nutritionLabelOcr — purity (static scan)', () => {
  it('no OCR engine import, no network, no DB, no npac — the engine lives in features/ocr-intake', () => {
    const src = readFileSync(join(resolve(import.meta.dirname), 'nutritionLabelOcr.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(/createWorker|vision\.googleapis|openai/i.test(src)).toBe(false);
    expect(/from\s+['"]tesseract/i.test(src)).toBe(false);
    expect(/fetch\(|supabase|@\/services\//i.test(src)).toBe(false);
    expect(/npac_value/i.test(src)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(src.includes(verb), verb).toBe(false);
    }
  });
});
