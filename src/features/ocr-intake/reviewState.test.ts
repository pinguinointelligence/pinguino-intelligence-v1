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
  REVIEW_TO_INTAKE_FIELD_KEY,
  setBasisOverride,
  toReviewedFields,
  unconfirmedRequiredFields,
  type OcrReviewState,
} from './reviewState';
import { resolvedFieldValue } from './session/reviewedFields';

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

describe('toReviewedFields — bridge into the shared intake contract (additive evolution)', () => {
  const IMAGE = 'img-legacy-1';

  it('maps every v1 key except storageInstructions (documented null mapping)', () => {
    const fields = toReviewedFields(freshState(), IMAGE);
    const keys = fields.map((f) => f.fieldKey);
    expect(keys).toContain('product_name');
    expect(keys).toContain('package_size'); // netQuantity
    expect(keys).toContain('carbohydrate'); // carbohydrates
    expect(keys).toContain('allergens_text'); // allergens
    expect(keys).toContain('nutrition_basis'); // derived extra field
    expect(REVIEW_TO_INTAKE_FIELD_KEY.storageInstructions).toBeNull();
    expect(keys).toHaveLength(16); // 15 mapped v1 fields + nutrition_basis
  });

  it('an extracted value becomes ONE explicit-provenance candidate with evidence', () => {
    const fields = toReviewedFields(freshState(), IMAGE);
    const name = fields.find((f) => f.fieldKey === 'product_name');
    expect(name?.candidates).toHaveLength(1);
    const candidate = name?.candidates[0];
    expect(candidate?.extractedRaw).toBe('Vanilla Dessert Base');
    expect(candidate?.provenance).toBe('explicit');
    expect(candidate?.evidence?.imageId).toBe(IMAGE);
    expect(candidate?.evidence?.sourceText).toContain('Vanilla Dessert Base');
  });

  it('a not-found value bridges to zero candidates (absent — never invented)', () => {
    const fields = toReviewedFields(freshState(), IMAGE);
    const mayContain = fields.find((f) => f.fieldKey === 'may_contain_text');
    expect(mayContain?.candidates).toEqual([]);
    expect(resolvedFieldValue(mayContain!)).toBeNull();
  });

  it('review resolution carries over: unconfirmed-required → needs_confirmation; confirmed → confirmed', () => {
    const raw = freshState();
    const confirmed = confirmField(raw, 'brand');
    const before = toReviewedFields(raw, IMAGE).find((f) => f.fieldKey === 'brand');
    const after = toReviewedFields(confirmed, IMAGE).find((f) => f.fieldKey === 'brand');
    expect(before?.reviewStatus).toBe('needs_confirmation');
    expect(after?.reviewStatus).toBe('confirmed');
    expect(after?.chosenCandidate).toBe(0);
  });

  it('an unflagged clean field bridges to auto_accepted', () => {
    const sugars = toReviewedFields(freshState(), IMAGE).find((f) => f.fieldKey === 'sugars');
    expect(sugars?.reviewStatus).toBe('auto_accepted');
    expect(resolvedFieldValue(sugars!)).toBe('48.2');
  });

  it('an edit carries over as edited (and resolves to the human value)', () => {
    const state = editField(freshState(), 'productName', 'Vanilla Base 500');
    const name = toReviewedFields(state, IMAGE).find((f) => f.fieldKey === 'product_name');
    expect(name?.reviewStatus).toBe('edited');
    expect(name?.editedValue).toBe('Vanilla Base 500');
    expect(resolvedFieldValue(name!)).toBe('Vanilla Base 500');
    // the extracted candidate is preserved for the audit trail
    expect(name?.candidates[0]?.extractedRaw).toBe('Vanilla Dessert Base');
  });

  it('an edit that CLEARS the value bridges to marked_unknown (an honest "no value")', () => {
    const state = editField(freshState(), 'brand', '   ');
    const brand = toReviewedFields(state, IMAGE).find((f) => f.fieldKey === 'brand');
    expect(brand?.reviewStatus).toBe('marked_unknown');
    expect(resolvedFieldValue(brand!)).toBeNull();
  });

  it('the detected basis bridges as an auto-accepted explicit candidate', () => {
    const basis = toReviewedFields(freshState(), IMAGE).find((f) => f.fieldKey === 'nutrition_basis');
    expect(basis?.reviewStatus).toBe('auto_accepted');
    expect(basis?.candidates[0]?.normalized).toBe('per_100g');
    expect(resolvedFieldValue(basis!)).toBe('per_100g');
  });

  it('a human basis override bridges as an EDIT (explicit human input)', () => {
    const state = setBasisOverride(freshState(), 'serving_only');
    const basis = toReviewedFields(state, IMAGE).find((f) => f.fieldKey === 'nutrition_basis');
    expect(basis?.reviewStatus).toBe('edited');
    expect(basis?.editedValue).toBe('serving_only');
    expect(resolvedFieldValue(basis!)).toBe('serving_only');
  });

  it('the bridge NEVER mutates the v1 state (old single-image behavior stays valid)', () => {
    const state = freshState();
    const snapshot = JSON.parse(JSON.stringify(state)) as unknown;
    toReviewedFields(state, IMAGE);
    expect(state).toEqual(snapshot);
    // and the v1 draft path still works on the same state
    const draft = buildDraftCandidate(
      unconfirmedRequiredFields(state).reduce((s, key) => confirmField(s, key), state),
    );
    expect(draft.ok).toBe(true);
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
