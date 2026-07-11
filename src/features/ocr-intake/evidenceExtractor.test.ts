/// <reference types="node" />
/**
 * Evidence-extractor tests — pure: hand-built RawOcrResults + REAL captured raw OCR
 * text from the committed fixtures (no engine, no IO beyond reading fixture text).
 * Verifies the locked evidence rules: provenance never collapsed, absent ≠ zero,
 * sodium never converted, conflicts become multiple candidates, cross-image merge
 * ordering, and per-candidate EvidenceRefs that really point at their source line.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES_DIR } from './__fixtures__/nodeOcrAssets';
import { ALL_INTAKE_FIELD_KEYS, extractEvidence, type EvidenceSource } from './evidenceExtractor';
import type { IntakeFieldKey, IntakeImageRole, RawOcrResult, ReviewedField } from './intakeContracts';
import { fixtureLines } from './provider/fixtureProvider';

/* ── helpers ─────────────────────────────────────────────────────────────── */

const rawFixture = (name: string): string => readFileSync(join(FIXTURES_DIR, 'raw', name), 'utf8');

/** Deterministic RawOcrResult from raw text (the fixture-provider line shape). */
const resultFrom = (imageId: string, rawText: string, confidence = 90): RawOcrResult => ({
  providerId: 'fixture',
  imageId,
  fullText: rawText,
  lines: fixtureLines(rawText, []).map((l) => ({ ...l, confidence })),
  overallConfidence: confidence,
  languageHints: ['eng'],
  durationMs: 0,
});

const sourceOf = (imageId: string, rawText: string, role: IntakeImageRole = 'other', confidence = 90): EvidenceSource => ({
  imageId,
  role,
  result: resultFrom(imageId, rawText, confidence),
});

const field = (fields: ReviewedField[], key: IntakeFieldKey): ReviewedField => {
  const f = fields.find((x) => x.fieldKey === key);
  if (!f) throw new Error(`field ${key} missing from extractor output`);
  return f;
};

const CLEAR_EN = rawFixture('label_clear_en.txt');

/* ── full-contract coverage ──────────────────────────────────────────────── */

describe('extractEvidence — contract coverage', () => {
  const out = extractEvidence([sourceOf('img-1', CLEAR_EN, 'front')]);

  it('emits EVERY IntakeFieldKey exactly once (28 fields)', () => {
    expect(ALL_INTAKE_FIELD_KEYS).toHaveLength(28);
    expect(out.map((f) => f.fieldKey).sort()).toEqual([...ALL_INTAKE_FIELD_KEYS].sort());
    const unique = new Set(out.map((f) => f.fieldKey));
    expect(unique.size).toBe(out.length);
  });

  it('every field has candidates, null editedValue and a defined review status', () => {
    for (const f of out) {
      expect(f.candidates.length).toBeGreaterThan(0);
      expect(f.editedValue).toBeNull();
      expect(['auto_accepted', 'needs_confirmation', 'conflict_unresolved']).toContain(f.reviewStatus);
    }
  });

  it('provenance is ONLY explicit or absent — calculated/inferred are never emitted', () => {
    for (const f of out) {
      for (const c of f.candidates) {
        expect(['explicit', 'absent']).toContain(c.provenance);
      }
    }
  });

  it('fields the parser never reads stay honestly absent (never invented)', () => {
    for (const key of ['country', 'supplier', 'category', 'subcategory', 'claims_other'] as const) {
      const f = field(out, key);
      expect(f.candidates).toHaveLength(1);
      expect(f.candidates[0]?.provenance).toBe('absent');
      expect(f.candidates[0]?.normalized).toBeNull();
      expect(f.candidates[0]?.extractedRaw).toBeNull();
      expect(f.candidates[0]?.evidence).toBeNull();
      expect(f.reviewStatus).toBe('needs_confirmation');
      expect(f.chosenCandidate).toBeNull();
    }
  });
});

/* ── explicit values, evidence refs, confidences ─────────────────────────── */

describe('extractEvidence — explicit values with real evidence refs', () => {
  const source = sourceOf('img-clear', CLEAR_EN, 'front', 92);
  const out = extractEvidence([source]);

  it('reads sugars 48.2 with an EvidenceRef pointing at the true line', () => {
    const sugars = field(out, 'sugars');
    const c = sugars.candidates[0];
    expect(c?.normalized).toBe('48.2');
    expect(c?.provenance).toBe('explicit');
    expect(c?.evidence?.imageId).toBe('img-clear');
    expect(c?.evidence?.sourceText).toMatch(/sugars 48.2/i);
    const idx = c?.evidence?.lineIndex;
    expect(idx).not.toBeNull();
    expect(source.result.lines[idx as number]?.text).toMatch(/sugars 48.2/i);
  });

  it('extraction confidence comes from the OCR line, normalization from ambiguity', () => {
    const salt = field(out, 'salt');
    expect(salt.candidates[0]?.extractionConfidence).toBe(92);
    expect(salt.candidates[0]?.normalizationConfidence).toBe(95); // clean single reading
  });

  it('auto-accepts ONLY clean high-confidence single candidates (chosenCandidate 0)', () => {
    const sugars = field(out, 'sugars');
    expect(sugars.reviewStatus).toBe('auto_accepted');
    expect(sugars.chosenCandidate).toBe(0);
  });

  it('identity heuristics ALWAYS need confirmation, however confident', () => {
    expect(field(out, 'product_name').reviewStatus).toBe('needs_confirmation');
    expect(field(out, 'brand').reviewStatus).toBe('needs_confirmation');
    expect(field(out, 'ean_code').reviewStatus).toBe('needs_confirmation');
    expect(field(out, 'product_name').candidates[0]?.normalized).toBe('Vanilla Dessert Base');
    expect(field(out, 'ean_code').candidates[0]?.normalized).toBe('8480000610928');
  });

  it('kcal and kJ are recorded separately as read — kcal is NEVER derived from kJ', () => {
    expect(field(out, 'energy_kj').candidates[0]?.normalized).toBe('1544');
    expect(field(out, 'energy_kcal').candidates[0]?.normalized).toBe('368');
    expect(field(out, 'energy_kcal').candidates[0]?.provenance).toBe('explicit');
  });

  it('nutrition basis is explicit evidence with its declaring line', () => {
    const basis = field(out, 'nutrition_basis');
    expect(basis.candidates[0]?.normalized).toBe('per_100g');
    expect(basis.candidates[0]?.evidence?.sourceText).toMatch(/per 100 g/i);
  });

  it('low OCR confidence blocks auto-acceptance', () => {
    const low = extractEvidence([sourceOf('img-low', CLEAR_EN, 'front', 60)]);
    expect(field(low, 'sugars').reviewStatus).toBe('needs_confirmation');
    expect(field(low, 'sugars').chosenCandidate).toBeNull();
  });
});

/* ── the four value outcomes at evidence level ───────────────────────────── */

describe('extractEvidence — trace / zero / blank / unreadable distinctions', () => {
  const PL = rawFixture('label_multipack_pl.txt');
  const out = extractEvidence([sourceOf('img-pl', PL, 'nutrition_table', 91)]);

  it('trace ("<0,1 g"): provenance explicit, normalized null, warning — never 0', () => {
    const sat = field(out, 'saturated_fat');
    const c = sat.candidates[0];
    expect(c?.provenance).toBe('explicit');
    expect(c?.normalized).toBeNull();
    expect(c?.extractedRaw).toMatch(/nasycone/);
    expect(c?.warnings.join(' ')).toMatch(/below quantification/);
    expect(sat.reviewStatus).toBe('needs_confirmation');
  });

  it('explicit zero ("Sól0,0g"): normalized "0" — a real value, not absent', () => {
    const salt = field(out, 'salt');
    expect(salt.candidates[0]?.normalized).toBe('0');
    expect(salt.candidates[0]?.provenance).toBe('explicit');
  });

  it('blank (sodium not on this label): provenance absent, normalized null — never zero-filled', () => {
    const sodium = field(out, 'sodium');
    expect(sodium.candidates).toHaveLength(1);
    expect(sodium.candidates[0]?.provenance).toBe('absent');
    expect(sodium.candidates[0]?.normalized).toBeNull();
  });

  it('unreadable row (ES "Grasas 1,19"): explicit row, null value, low normalization confidence', () => {
    const es = extractEvidence([sourceOf('img-es', rawFixture('label_decimal_comma_es.txt'), 'nutrition_table')]);
    const fat = field(es, 'fat');
    const c = fat.candidates[0];
    expect(c?.provenance).toBe('explicit');
    expect(c?.normalized).toBeNull();
    expect(c?.normalizationConfidence).toBe(30);
    expect(fat.reviewStatus).toBe('needs_confirmation');
  });
});

/* ── sodium / multipack / claims / EAN checksum at evidence level ─────────── */

describe('extractEvidence — locked field rules', () => {
  it('sodium stays its own field with the never-converted warning; salt stays absent', () => {
    const out = extractEvidence([sourceOf('img-na', 'per 100 g\nSodium 0.11 g', 'nutrition_table')]);
    const sodium = field(out, 'sodium');
    expect(sodium.candidates[0]?.normalized).toBe('0.11');
    expect(sodium.candidates[0]?.warnings.join(' ')).toMatch(/human decision/);
    expect(sodium.reviewStatus).toBe('needs_confirmation'); // warned → never auto-accepted
    const salt = field(out, 'salt');
    expect(salt.candidates[0]?.provenance).toBe('absent');
    expect(salt.candidates[0]?.normalized).toBeNull();
  });

  it('serving-only labels never map nutrition to per-100 (explicit null + warning)', () => {
    const out = extractEvidence([sourceOf('img-srv', 'Nutrition per serving (30 g)\nFat 4.2 g', 'nutrition_table')]);
    const fat = field(out, 'fat');
    expect(fat.candidates[0]?.provenance).toBe('explicit');
    expect(fat.candidates[0]?.normalized).toBeNull();
    expect(fat.candidates[0]?.warnings.join(' ')).toMatch(/per serving only/);
    expect(field(out, 'nutrition_basis').candidates[0]?.normalized).toBe('serving_only');
  });

  it('multipack: package_size 330 + package_unit ml, warned and confirmed by a human', () => {
    const out = extractEvidence([sourceOf('img-mp', 'Juice Pack\n6 x 330 ml', 'front')]);
    const size = field(out, 'package_size');
    expect(size.candidates[0]?.normalized).toBe('330');
    expect(size.candidates[0]?.warnings.join(' ')).toMatch(/multipack/);
    expect(size.reviewStatus).toBe('needs_confirmation');
    expect(field(out, 'package_unit').candidates[0]?.normalized).toBe('ml');
  });

  it('EAN with an invalid checksum: extractedRaw kept, normalized null, warning', () => {
    const out = extractEvidence([sourceOf('img-ean', 'Some Bar\n8 480000 610927', 'barcode')]);
    const ean = field(out, 'ean_code');
    expect(ean.candidates[0]?.extractedRaw).toBe('8480000610927');
    expect(ean.candidates[0]?.normalized).toBeNull();
    expect(ean.candidates[0]?.warnings.join(' ')).toMatch(/checksum/);
    expect(ean.reviewStatus).toBe('needs_confirmation');
  });

  it('claims: printed → "true"; unprinted → absent (never "false")', () => {
    const out = extractEvidence([sourceOf('img-cl', 'Bar\nVegan. Gluten-free.\nper 100 g\nFat 2 g', 'claims_allergens')]);
    expect(field(out, 'claim_vegan').candidates[0]?.normalized).toBe('true');
    expect(field(out, 'claim_gluten_free').candidates[0]?.normalized).toBe('true');
    const vegetarian = field(out, 'claim_vegetarian');
    expect(vegetarian.candidates[0]?.provenance).toBe('absent');
    expect(vegetarian.candidates[0]?.normalized).not.toBe('false');
  });
});

/* ── conflicts: within one image and across images ───────────────────────── */

describe('extractEvidence — conflicts become multiple candidates', () => {
  it('contradictory same-basis rows in ONE image → one candidate per reading', () => {
    const out = extractEvidence([
      sourceOf('img-x', 'per 100 g\nFat 15.3 g\nper 100 g\nFat 12.1 g', 'nutrition_table'),
    ]);
    const fat = field(out, 'fat');
    expect(fat.reviewStatus).toBe('conflict_unresolved');
    expect(fat.chosenCandidate).toBeNull();
    expect(fat.candidates.map((c) => c.normalized)).toEqual(['15.3', '12.1']);
    for (const c of fat.candidates) {
      expect(c.provenance).toBe('explicit');
      expect(c.evidence?.sourceText).toMatch(/Fat/);
    }
  });

  it('cross-image conflict: nutrition_table wins ordering, the other value STAYS', () => {
    const out = extractEvidence([
      sourceOf('img-front', 'per 100 g\nFat 10.0 g', 'front'),
      sourceOf('img-table', 'per 100 g\nFat 15.3 g', 'nutrition_table'),
    ]);
    const fat = field(out, 'fat');
    expect(fat.reviewStatus).toBe('conflict_unresolved');
    expect(fat.candidates).toHaveLength(2);
    expect(fat.candidates[0]?.normalized).toBe('15.3'); // nutrition_table ordered first
    expect(fat.candidates[0]?.evidence?.imageId).toBe('img-table');
    expect(fat.candidates[1]?.normalized).toBe('10');
    expect(fat.candidates[1]?.evidence?.imageId).toBe('img-front');
  });

  it('agreeing values across images are deduped — no false conflict', () => {
    const out = extractEvidence([
      sourceOf('img-a', 'per 100 g\nFat 15.3 g', 'front'),
      sourceOf('img-b', 'per 100 g\nFat 15.3 g', 'nutrition_table'),
    ]);
    const fat = field(out, 'fat');
    expect(fat.candidates).toHaveLength(1);
    expect(fat.candidates[0]?.normalized).toBe('15.3');
    expect(fat.reviewStatus).toBe('auto_accepted');
  });

  it('role priority: ingredients image wins ingredient text, barcode image wins EANs', () => {
    const out = extractEvidence([
      sourceOf('img-front', 'Ingredients: front-side summary.\n8 480000 610928', 'front'),
      sourceOf('img-ing', 'Ingredients: cocoa mass, sugar.', 'ingredients'),
    ]);
    const ing = field(out, 'ingredients_text');
    expect(ing.candidates[0]?.normalized).toBe('cocoa mass, sugar.');
    expect(ing.candidates[0]?.evidence?.imageId).toBe('img-ing');
    expect(field(out, 'ean_code').candidates[0]?.normalized).toBe('8480000610928');
  });
});

/* ── whole-fixture sweep: never invent, never zero-fill ──────────────────── */

describe('extractEvidence — never invent, never zero-fill (all captured fixtures)', () => {
  const fixtures = [
    'label_clear_en.txt',
    'label_decimal_comma_es.txt',
    'label_multiline_ingredients_en.txt',
    'label_lowquality.txt',
    'label_partial_en.txt',
    'label_nutrition_de.txt',
    'label_multipack_pl.txt',
  ];

  it('absent candidates never carry values, evidence or confidences', () => {
    for (const name of fixtures) {
      const out = extractEvidence([sourceOf(name, rawFixture(name), 'other')]);
      for (const f of out) {
        for (const c of f.candidates) {
          if (c.provenance === 'absent') {
            expect(c.normalized).toBeNull();
            expect(c.extractedRaw).toBeNull();
            expect(c.evidence).toBeNull();
            expect(c.extractionConfidence).toBeNull();
            expect(c.normalizationConfidence).toBeNull();
          }
        }
      }
    }
  });

  it('the empty low-quality capture yields ALL-absent fields (28 × nothing invented)', () => {
    const out = extractEvidence([sourceOf('img-lq', rawFixture('label_lowquality.txt'), 'front')]);
    for (const f of out) {
      expect(f.candidates[0]?.provenance).toBe('absent');
      expect(f.candidates[0]?.normalized).toBeNull();
      expect(f.reviewStatus).toBe('needs_confirmation');
    }
  });

  it('no input at all still yields the full 28-field absent contract', () => {
    const out = extractEvidence([]);
    expect(out).toHaveLength(28);
    for (const f of out) expect(f.candidates[0]?.provenance).toBe('absent');
  });
});
