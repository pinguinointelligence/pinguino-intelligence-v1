/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { linesFromText, parseLabelText } from './labelTextParser';
import {
  buildDraftCandidate,
  buildReviewState,
  canConfirmReview,
  confirmField,
  editField,
  effectiveBasis,
  OCR_ENGINE_INFO,
  setBasisOverride,
  unconfirmedRequiredFields,
  type OcrReviewState,
} from './reviewState';

const RAW = [
  'Vanilla Dessert Base',
  'Brand: Polar Foods',
  'Net weight: 500 g',
  'NUTRITION per 100 g',
  'Energy 1544 kJ / 368 kcal',
  'Fat 15.3 g',
  'of which saturates 9.8 g',
  'Carbohydrate 52.1 g',
  'of which sugars 48.2 g',
  'Protein 4.5 g',
  'Salt 0.28 g',
  'Ingredients: sugar, milk powder.',
  'Allergens: milk.',
  '',
  '8 480000 610928',
].join('\n');

const freshState = (): OcrReviewState => buildReviewState(parseLabelText(linesFromText(RAW)), RAW, 93);

const confirmAll = (state: OcrReviewState): OcrReviewState =>
  unconfirmedRequiredFields(state).reduce((s, key) => confirmField(s, key), state);

describe('buildReviewState', () => {
  it('identity fields ALWAYS require manual confirmation; clean numeric fields do not', () => {
    const s = freshState();
    const byKey = Object.fromEntries(s.fields.map((f) => [f.key, f]));
    expect(byKey.productName?.requiresConfirmation).toBe(true);
    expect(byKey.brand?.requiresConfirmation).toBe(true);
    expect(byKey.eanCode?.requiresConfirmation).toBe(true);
    // parsed cleanly with no warnings and unknown-confidence lines → no forced flag
    expect(byKey.sugars?.requiresConfirmation).toBe(false);
    expect(byKey.sugars?.extractedValue).toBe('48.2');
  });

  it('carries raw text, basis, language and overall confidence for the review UI', () => {
    const s = freshState();
    expect(s.rawText).toBe(RAW);
    expect(s.detectedBasis).toBe('per_100g');
    expect(s.overallConfidence).toBe(93);
  });
});

describe('confirmation gating', () => {
  it('blocks the draft until every flagged field is confirmed', () => {
    const s = freshState();
    expect(canConfirmReview(s)).toBe(false);
    const blocked = buildDraftCandidate(s);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toMatch(/confirm every flagged field/);
  });

  it('an explicit edit counts as confirmation of that field', () => {
    let s = freshState();
    s = editField(s, 'productName', 'Vanilla Base 500');
    const field = s.fields.find((f) => f.key === 'productName');
    expect(field?.edited).toBe(true);
    expect(field?.confirmed).toBe(true);
    expect(field?.editedValue).toBe('Vanilla Base 500');
    // extracted value is preserved for the audit trail
    expect(field?.extractedValue).toBe('Vanilla Dessert Base');
  });

  it('confirming every flagged field opens the gate', () => {
    const s = confirmAll(freshState());
    expect(unconfirmedRequiredFields(s)).toEqual([]);
    expect(canConfirmReview(s)).toBe(true);
  });
});

describe('buildDraftCandidate — the EXISTING intake draft contract', () => {
  it('produces a ProductIntakeCandidate with source_type label_scan and honest values', () => {
    const result = buildDraftCandidate(confirmAll(freshState()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { insert, status } = result.candidate;
    expect(insert.source_type).toBe('label_scan');
    expect(insert.product_name_display).toBe('Vanilla Dessert Base');
    expect(insert.brand).toBe('Polar Foods');
    expect(insert.ean_code).toBe('8480000610928'); // string — never a number
    expect(insert.package_size).toBe('500 g');
    expect(insert.kcal_per_100g).toBe(368);
    expect(insert.fat_percent).toBe(15.3);
    expect(insert.saturated_fat_percent).toBe(9.8);
    expect(insert.carbohydrate_percent).toBe(52.1);
    expect(insert.total_sugars_percent).toBe(48.2);
    expect(insert.protein_percent).toBe(4.5);
    expect(insert.salt_percent).toBe(0.28);
    expect(insert.allergens).toBe('milk.');
    expect(insert.detected_text).toBe(RAW);
    expect(['valid', 'warning']).toContain(status);
  });

  it('NEVER sets status, verification, or engine values (no PAC/POD, no pi_calculated)', () => {
    const result = buildDraftCandidate(confirmAll(freshState()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { insert } = result.candidate;
    expect(insert.status).toBeUndefined();
    expect(insert.pac_value).toBeUndefined();
    expect(insert.pod_value).toBeUndefined();
    expect(insert.de_value).toBeUndefined();
    expect(insert.water_percent).toBeUndefined(); // never derived from a label
    expect(insert.total_solids_percent).toBeUndefined();
  });

  it('records the full extraction audit in extracted_json (edits, confidence, engine pin)', () => {
    let s = confirmAll(freshState());
    s = editField(s, 'salt', '0.3');
    const result = buildDraftCandidate(s);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const json = result.candidate.insert.extracted_json as {
      schema: string;
      engine: typeof OCR_ENGINE_INFO;
      basis: string;
      fields: Record<string, { extracted: string | null; final: string | null; edited: boolean }>;
    };
    expect(json.schema).toBe('pinguino.ocr_label_extraction.v1');
    expect(json.engine).toEqual(OCR_ENGINE_INFO);
    expect(json.basis).toBe('per_100g');
    expect(json.fields.salt?.extracted).toBe('0.28');
    expect(json.fields.salt?.final).toBe('0.3');
    expect(json.fields.salt?.edited).toBe(true);
    expect(result.candidate.insert.salt_percent).toBe(0.3); // the edit reached the draft
  });

  it('an edited garbage number never becomes a fake value (null + warning via the shared parser)', () => {
    let s = confirmAll(freshState());
    s = editField(s, 'fat', 'about 15');
    const result = buildDraftCandidate(s);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidate.insert.fat_percent).toBeUndefined();
    expect(result.candidate.warnings.join(' ')).toMatch(/non-numeric|ambiguous/);
  });

  it('unknown/serving-only basis blocks per-100 numeric mapping (honest, flagged)', () => {
    let s = confirmAll(freshState());
    s = setBasisOverride(s, 'serving_only');
    expect(effectiveBasis(s)).toBe('serving_only');
    const result = buildDraftCandidate(s);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidate.insert.fat_percent).toBeUndefined();
    expect(result.candidate.insert.kcal_per_100g).toBeUndefined();
    expect(result.candidate.status).toBe('warning');
    expect(result.candidate.warnings.join(' ')).toMatch(/NOT mapped/);
    // identity + text fields still flow
    expect(result.candidate.insert.product_name_display).toBe('Vanilla Dessert Base');
  });

  it('per-100ml maps numbers but flags the density caveat', () => {
    let s = confirmAll(freshState());
    s = setBasisOverride(s, 'per_100ml');
    const result = buildDraftCandidate(s);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidate.insert.fat_percent).toBe(15.3);
    expect(result.candidate.warnings.join(' ')).toMatch(/density NOT applied/);
  });
});

describe('reviewState — boundaries', () => {
  const HERE = resolve(import.meta.dirname);

  it('the pinned engine version constant matches package.json exactly', () => {
    const pkg = JSON.parse(readFileSync(join(HERE, '..', '..', '..', 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['tesseract.js']).toBe(OCR_ENGINE_INFO.version); // exact pin, no ^
  });

  it('reviewState is pure — no engine, no services, no DB (static scan)', () => {
    const src = readFileSync(join(HERE, 'reviewState.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(/from\s+['"]tesseract/i.test(src)).toBe(false);
    expect(/createWorker|fetch\(|supabase|@\/services\//i.test(src)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(src.includes(verb), verb).toBe(false);
    }
  });
});
