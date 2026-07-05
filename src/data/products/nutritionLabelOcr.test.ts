/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_LABEL_IMAGE_TYPES,
  isAcceptedLabelImage,
  parseNutritionLabelImage,
} from './nutritionLabelOcr';

describe('parseNutritionLabelImage — interface only, never fake OCR', () => {
  it('always returns not_implemented with a NULL extraction (no fabricated text)', () => {
    const r = parseNutritionLabelImage({ filename: 'label.jpg', size_bytes: 123456, mime: 'image/jpeg' });
    expect(r.status).toBe('not_implemented');
    expect(r.extraction).toBeNull();
    expect(r.note).toMatch(/keyless\/LOCAL OCR only/);
    expect(r.note).toMatch(/never fabricated text/);
    expect(r.image.filename).toBe('label.jpg');
  });
});

describe('isAcceptedLabelImage', () => {
  it('accepts the declared mime types and common image extensions', () => {
    for (const mime of ACCEPTED_LABEL_IMAGE_TYPES) {
      expect(isAcceptedLabelImage(mime, 'x.bin'), mime).toBe(true);
    }
    expect(isAcceptedLabelImage(null, 'photo.JPG')).toBe(true);
    expect(isAcceptedLabelImage(null, 'scan.heic')).toBe(true);
  });

  it('rejects non-image files', () => {
    expect(isAcceptedLabelImage('text/csv', 'catalog.csv')).toBe(false);
    expect(isAcceptedLabelImage(null, 'notes.pdf')).toBe(false);
    expect(isAcceptedLabelImage(null, 'noext')).toBe(false);
  });
});

describe('nutritionLabelOcr — purity (static scan)', () => {
  it('no OCR engine, no network, no DB, no npac — interface only', () => {
    const src = readFileSync(join(resolve(import.meta.dirname), 'nutritionLabelOcr.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(/tesseract|createWorker|vision\.googleapis|openai/i.test(src)).toBe(false);
    expect(/fetch\(|supabase|@\/services\//i.test(src)).toBe(false);
    expect(/npac_value/i.test(src)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(src.includes(verb), verb).toBe(false);
    }
  });
});
