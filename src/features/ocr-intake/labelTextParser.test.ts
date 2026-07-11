/// <reference types="node" />
/**
 * Deterministic parser tests — run on (a) REAL captured tesseract.js raw text from the
 * committed fixture images (__fixtures__/raw/*.txt, produced by capture-raw-text.mjs)
 * and (b) handcrafted OCR-noise edge cases. NO OCR engine here — parser only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES_DIR } from './__fixtures__/nodeOcrAssets';
import { linesFromText, normalizeNumberToken, parseLabelText, type ParsedOcrLine } from './labelTextParser';

const rawFixture = (name: string): string => readFileSync(join(FIXTURES_DIR, 'raw', name), 'utf8');
const parseRaw = (name: string) => parseLabelText(linesFromText(rawFixture(name)));

describe('normalizeNumberToken', () => {
  it('handles decimal comma, decimal point, and OCR digit-spacing', () => {
    expect(normalizeNumberToken('15.3').value).toBe(15.3);
    expect(normalizeNumberToken('15,3').value).toBe(15.3);
    expect(normalizeNumberToken('1 5,3').value).toBe(15.3); // OCR split digits
    expect(normalizeNumberToken('1544').value).toBe(1544);
  });

  it('refuses ambiguous numbers honestly (null + warning, never a guess)', () => {
    const mixed = normalizeNumberToken('1,234.5');
    expect(mixed.value).toBeNull();
    expect(mixed.warning).toMatch(/ambiguous/);
    const grouping = normalizeNumberToken('1,234,5');
    expect(grouping.value).toBeNull();
  });
});

describe('parseLabelText — captured raw OCR text (clear English label)', () => {
  const x = parseRaw('label_clear_en.txt');

  it('reads identity, EAN, net quantity and language', () => {
    expect(x.productName.value).toBe('Vanilla Dessert Base');
    expect(x.productName.needsReview).toBe(true); // identity is always confirmed by a human
    expect(x.brand.value).toBe('Polar Foods');
    expect(x.eanCode.value).toBe('8480000610928'); // digits from "8 480000 610928"
    expect(x.netQuantity.value).toBe('500 g');
    expect(x.languageHint).toBe('en');
    expect(x.basis).toBe('per_100g');
  });

  it('reads the per-100g nutrition rows (decimal points)', () => {
    expect(x.energyKj.value).toBe(1544);
    expect(x.energyKcal.value).toBe(368);
    expect(x.saturatedFat.value).toBe(9.8);
    expect(x.carbohydrates.value).toBe(52.1);
    expect(x.sugars.value).toBe(48.2);
    expect(x.protein.value).toBe(4.5);
    expect(x.salt.value).toBe(0.28);
  });

  it('leaves the OCR-mangled fat row EMPTY and flagged (real capture read "15.39", unit lost)', () => {
    expect(x.fat.value).toBeNull();
    expect(x.fat.needsReview).toBe(true);
    expect(x.fat.warnings.join(' ')).toMatch(/no readable value/);
  });

  it('reads ingredients (wrapped), allergens, may-contain and storage', () => {
    expect(x.ingredientsText.value).toMatch(/^sugar, skimmed milk powder/);
    expect(x.ingredientsText.value).toMatch(/vanilla flavouring/); // joined wrapped line
    expect(x.allergens.value).toMatch(/milk, soy/);
    expect(x.mayContain.value).toMatch(/hazelnuts/);
    expect(x.storageInstructions.value).toMatch(/cool, dry place/i);
  });
});

describe('parseLabelText — captured raw OCR text (Spanish label, decimal commas, per 100 ml)', () => {
  const x = parseRaw('label_decimal_comma_es.txt');

  it('reads Spanish vocabulary with decimal commas on a per-100ml basis', () => {
    expect(x.basis).toBe('per_100ml');
    expect(x.languageHint).toBe('es');
    expect(x.productName.value).toBe('Horchata Tradicional');
    expect(x.brand.value).toBe('Valenciana Real');
    expect(x.energyKj.value).toBe(254);
    expect(x.energyKcal.value).toBe(60);
    expect(x.saturatedFat.value).toBe(0.2);
    expect(x.carbohydrates.value).toBe(11.4);
    expect(x.sugars.value).toBe(10.1);
    expect(x.protein.value).toBe(0.5);
    expect(x.salt.value).toBe(0.03);
  });

  it('flags rows the OCR mangled instead of guessing (grasas "1,19" lost its unit)', () => {
    expect(x.fat.value).toBeNull();
    expect(x.fat.needsReview).toBe(true);
  });

  it('reads ingredientes / puede contener / conservar', () => {
    expect(x.ingredientsText.value).toMatch(/agua, chufa/);
    expect(x.mayContain.value).toMatch(/frutos de cascara/);
    expect(x.storageInstructions.value).toMatch(/Conservar refrigerado/);
  });
});

describe('parseLabelText — captured raw OCR text (multiline ingredients label)', () => {
  const x = parseRaw('label_multiline_ingredients_en.txt');

  it('joins the wrapped ingredients list and reads allergen sections', () => {
    expect(x.ingredientsText.value).toMatch(/^cocoa mass, sugar, cocoa butter/);
    expect(x.ingredientsText.value).toMatch(/hazelnut paste \(2%\)/); // 3 wrapped lines joined
    expect(x.allergens.value).toMatch(/milk, soy, hazelnuts/);
    expect(x.mayContain.value).toMatch(/other tree nuts, gluten/);
  });

  it('recovers glued OCR unit rows ("Fat34.9¢g", "Salt0.11g" — real capture output)', () => {
    expect(x.fat.value).toBe(34.9);
    expect(x.salt.value).toBe(0.11);
    expect(x.saturatedFat.value).toBe(21.2);
    expect(x.sugars.value).toBe(47.4);
  });
});

describe('parseLabelText — captured raw OCR text (readable but NOT a nutrition label)', () => {
  const x = parseRaw('label_partial_en.txt');

  it('stays honestly incomplete: name found, all nutrition empty + flagged basis', () => {
    expect(x.productName.value).toBe('Alpine Herbal Drops');
    expect(x.basis).toBe('unknown');
    expect(x.warnings.join(' ')).toMatch(/no per-100/);
    for (const f of [x.energyKj, x.energyKcal, x.fat, x.saturatedFat, x.carbohydrates, x.sugars, x.protein, x.salt]) {
      expect(f.value).toBeNull();
    }
    expect(x.ingredientsText.value).toBeNull();
    // the batch number is barcode-shaped — surfaced but ALWAYS flagged for human review
    expect(x.eanCode.value).toBe('20260712');
    expect(x.eanCode.needsReview).toBe(true);
  });
});

describe('parseLabelText — handcrafted OCR-noise edge cases', () => {
  it('OCR digit-spacing inside a value: "Fat 1 5,3 g" → 15.3', () => {
    const x = parseLabelText(linesFromText('per 100 g\nFat 1 5,3 g'));
    expect(x.fat.value).toBe(15.3);
  });

  it('"<0.1" stays EMPTY with a below-quantification flag (never invented)', () => {
    const x = parseLabelText(linesFromText('per 100 g\nSalt <0.1 g'));
    expect(x.salt.value).toBeNull();
    expect(x.salt.needsReview).toBe(true);
    expect(x.salt.warnings.join(' ')).toMatch(/below quantification/);
  });

  it('mg values convert deterministically to g (280 mg → 0.28 g)', () => {
    const x = parseLabelText(linesFromText('per 100 g\nSalt 280 mg'));
    expect(x.salt.value).toBe(0.28);
  });

  it('duplicated nutrition blocks: the per-100 value wins over per-serving', () => {
    const x = parseLabelText(
      linesFromText('Nutrition per serving\nFat 6.9 g\nSugars 12 g\nper 100 g\nFat 15.3 g\nSugars 26.7 g'),
    );
    expect(x.fat.value).toBe(15.3);
    expect(x.sugars.value).toBe(26.7);
    expect(x.fat.warnings.join(' ')).toMatch(/duplicated nutrition rows/);
  });

  it('serving-only labels never fill per-100 values (flagged instead)', () => {
    const x = parseLabelText(linesFromText('Nutrition per serving (30 g)\nFat 4.2 g\nSalt 0.1 g'));
    expect(x.basis).toBe('serving_only');
    expect(x.fat.value).toBeNull();
    expect(x.fat.needsReview).toBe(true);
    expect(x.warnings.join(' ')).toMatch(/per serving only/);
  });

  it('multiple values on one row are taken first + flagged (possible serving column)', () => {
    const x = parseLabelText(linesFromText('per 100 g\nFat 15.3 g 6.9 g'));
    expect(x.fat.value).toBe(15.3);
    expect(x.fat.needsReview).toBe(true);
    expect(x.fat.warnings.join(' ')).toMatch(/multiple values/);
  });

  it('out-of-range values are refused (never a fake per-100 number)', () => {
    const x = parseLabelText(linesFromText('per 100 g\nFat 153 g'));
    expect(x.fat.value).toBeNull();
    expect(x.fat.warnings.join(' ')).toMatch(/out of range/);
  });

  it('sodium is never converted to salt (warned instead)', () => {
    const x = parseLabelText(linesFromText('per 100 g\nSodium 0.11 g'));
    expect(x.salt.value).toBeNull();
    expect(x.warnings.join(' ')).toMatch(/NOT converted/);
  });

  it('empty / junk input parses to an all-null extraction without crashing', () => {
    const x = parseLabelText(linesFromText(''));
    expect(x.productName.value).toBeNull();
    expect(x.fat.value).toBeNull();
    expect(x.basis).toBe('unknown');
  });

  it('aggregates per-field OCR confidence into bands and flags low confidence', () => {
    const high: ParsedOcrLine[] = [
      { text: 'per 100 g', confidence: 95 },
      { text: 'Fat 15.3 g', confidence: 92 },
      { text: 'Salt 0.2 g', confidence: 41 },
    ];
    const x = parseLabelText(high);
    expect(x.fat.ocrConfidence).toBe(92);
    expect(x.fat.band).toBe('high');
    expect(x.fat.needsReview).toBe(false);
    expect(x.salt.band).toBe('low');
    expect(x.salt.needsReview).toBe(true); // low OCR confidence always needs a human
  });
});

describe('labelTextParser — purity (static scan)', () => {
  it('no OCR engine, no network, no DB, no services — parser only', () => {
    const src = readFileSync(join(FIXTURES_DIR, '..', 'labelTextParser.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(/createWorker|vision\.googleapis|openai/i.test(src)).toBe(false);
    expect(/from\s+['"]tesseract/i.test(src)).toBe(false);
    expect(/fetch\(|supabase|@\/services\//i.test(src)).toBe(false);
    expect(/pac_value|pod_value|npac/i.test(src)).toBe(false);
  });
});
