/// <reference types="node" />
/**
 * FixtureOcrProvider tests — the deterministic provider the session/UI tracks build
 * against: byte-identical results, checksum/imageId lookup, honest failures, and the
 * FULL provider → extractor pipeline over every committed captured fixture text.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES_DIR } from '../__fixtures__/nodeOcrAssets';
import { extractEvidence } from '../evidenceExtractor';
import type { AcceptedMime, IntakeFieldKey, ReviewedField } from '../intakeContracts';
import { FIXTURE_PROVIDER_ID, FixtureOcrProvider, fixtureLines, sha256Hex } from './fixtureProvider';

const rawFixture = (name: string): string => readFileSync(join(FIXTURES_DIR, 'raw', name), 'utf8');
const bytes = (seed: string): Uint8Array => new TextEncoder().encode(seed);

const recognize = (provider: FixtureOcrProvider, imageId: string, data: Uint8Array, mime: AcceptedMime = 'image/png') =>
  provider.recognize({ imageId, bytes: data, mime, languages: ['eng'] });

const field = (fields: ReviewedField[], key: IntakeFieldKey): ReviewedField => {
  const f = fields.find((x) => x.fieldKey === key);
  if (!f) throw new Error(`field ${key} missing`);
  return f;
};

describe('FixtureOcrProvider — deterministic contract', () => {
  it('same bytes → byte-identical RawOcrResult on every call', async () => {
    const provider = new FixtureOcrProvider({ 'img-1': { kind: 'text', rawText: 'per 100 g\nFat 15.3 g' } });
    const a = await recognize(provider, 'img-1', bytes('same'));
    const b = await recognize(provider, 'img-1', bytes('same'));
    expect(a.ok).toBe(true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('looks up by SHA-256 checksum of the bytes first', async () => {
    const data = bytes('checksum-keyed image bytes');
    const checksum = await sha256Hex(data);
    const provider = new FixtureOcrProvider({ [checksum]: { kind: 'text', rawText: 'Salt 0.28 g' } });
    const r = await recognize(provider, 'some-other-id', data);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result.fullText).toBe('Salt 0.28 g');
  });

  it('falls back to imageId lookup when no checksum matches', async () => {
    const provider = new FixtureOcrProvider({ 'img-by-id': { kind: 'text', rawText: 'Sugars 48.2 g' } });
    const r = await recognize(provider, 'img-by-id', bytes('unregistered bytes'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result.fullText).toBe('Sugars 48.2 g');
  });

  it('unknown images fail HONESTLY — the fixture provider never invents text', async () => {
    const provider = new FixtureOcrProvider({});
    const r = await recognize(provider, 'never-registered', bytes('mystery'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure.kind).toBe('engine_error');
      if (r.failure.kind === 'engine_error') expect(r.failure.message).toMatch(/never invents/);
    }
  });

  it('rejects unsupported mimes exactly like the real provider', async () => {
    const provider = new FixtureOcrProvider({ 'img-1': { kind: 'text', rawText: 'x' } });
    const r = await provider.recognize({
      imageId: 'img-1',
      bytes: bytes('x'),
      mime: 'application/pdf' as AcceptedMime,
      languages: ['eng'],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure).toEqual({ kind: 'unsupported_format', mime: 'application/pdf' });
  });

  it('an already-aborted signal → cancelled', async () => {
    const provider = new FixtureOcrProvider({ 'img-1': { kind: 'text', rawText: 'x' } });
    const controller = new AbortController();
    controller.abort();
    const r = await provider.recognize({
      imageId: 'img-1',
      bytes: bytes('x'),
      mime: 'image/png',
      languages: ['eng'],
      signal: controller.signal,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.kind).toBe('cancelled');
  });

  it('replays registered failures verbatim (failure-path testing for other tracks)', async () => {
    const provider = new FixtureOcrProvider({
      'img-bad': { kind: 'failure', failure: { kind: 'unreadable_image' } },
    });
    const r = await recognize(provider, 'img-bad', bytes('blurry'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.kind).toBe('unreadable_image');
  });

  it('reports completion progress (1) and zero duration — no fake timing', async () => {
    const provider = new FixtureOcrProvider({ 'img-1': { kind: 'text', rawText: 'Fat 1 g' } });
    const fractions: number[] = [];
    const r = await provider.recognize({
      imageId: 'img-1',
      bytes: bytes('x'),
      mime: 'image/png',
      languages: ['eng', 'deu'],
      onProgress: (f) => fractions.push(f),
    });
    expect(fractions).toEqual([1]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.durationMs).toBe(0);
      expect(r.result.providerId).toBe(FIXTURE_PROVIDER_ID);
      expect(r.result.languageHints).toEqual(['eng', 'deu']);
    }
  });

  it('applies per-line confidences (default 90) and derives overall confidence', async () => {
    const provider = new FixtureOcrProvider({
      'img-1': { kind: 'text', rawText: 'line one\n\nline two\nline three', lineConfidences: [95, 41] },
    });
    const r = await recognize(provider, 'img-1', bytes('x'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.lines.map((l) => l.confidence)).toEqual([95, 41, 90]); // blank line skipped
    expect(r.result.overallConfidence).toBe(Math.round((95 + 41 + 90) / 3));
    expect(r.result.lines[0]?.words.map((w) => w.text)).toEqual(['line', 'one']);
  });

  it('fixtureLines is deterministic and whitespace-normalizing', () => {
    const a = fixtureLines('  Fat   15.3 g  \n\n Salt 0.2 g ');
    expect(a.map((l) => l.text)).toEqual(['Fat 15.3 g', 'Salt 0.2 g']);
    expect(JSON.stringify(a)).toBe(JSON.stringify(fixtureLines('  Fat   15.3 g  \n\n Salt 0.2 g ')));
  });
});

describe('FixtureOcrProvider → extractEvidence — full pipeline over ALL captured fixtures', () => {
  const FIXTURE_TEXTS: Record<string, string> = {
    'label_clear_en.png': rawFixture('label_clear_en.txt'),
    'label_decimal_comma_es.png': rawFixture('label_decimal_comma_es.txt'),
    'label_multiline_ingredients_en.png': rawFixture('label_multiline_ingredients_en.txt'),
    'label_lowquality.png': rawFixture('label_lowquality.txt'),
    'label_partial_en.png': rawFixture('label_partial_en.txt'),
    'label_nutrition_de.png': rawFixture('label_nutrition_de.txt'),
    'label_multipack_pl.png': rawFixture('label_multipack_pl.txt'),
  };
  const provider = new FixtureOcrProvider(
    Object.fromEntries(Object.entries(FIXTURE_TEXTS).map(([id, rawText]) => [id, { kind: 'text', rawText }])),
  );

  const run = async (imageId: string) => {
    const r = await recognize(provider, imageId, bytes(imageId));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('fixture recognize failed');
    return extractEvidence([{ imageId, role: 'other', result: r.result }]);
  };

  it('label_clear_en: identity + per-100g nutrition', async () => {
    const out = await run('label_clear_en.png');
    expect(field(out, 'product_name').candidates[0]?.normalized).toBe('Vanilla Dessert Base');
    expect(field(out, 'brand').candidates[0]?.normalized).toBe('Polar Foods');
    expect(field(out, 'ean_code').candidates[0]?.normalized).toBe('8480000610928');
    expect(field(out, 'sugars').candidates[0]?.normalized).toBe('48.2');
    expect(field(out, 'salt').candidates[0]?.normalized).toBe('0.28');
    expect(field(out, 'nutrition_basis').candidates[0]?.normalized).toBe('per_100g');
  });

  it('label_decimal_comma_es: decimal commas on per-100ml', async () => {
    const out = await run('label_decimal_comma_es.png');
    expect(field(out, 'nutrition_basis').candidates[0]?.normalized).toBe('per_100ml');
    expect(field(out, 'sugars').candidates[0]?.normalized).toBe('10.1');
    expect(field(out, 'saturated_fat').candidates[0]?.normalized).toBe('0.2');
    expect(field(out, 'salt').candidates[0]?.normalized).toBe('0.03');
    expect(field(out, 'fat').candidates[0]?.normalized).toBeNull(); // mangled row stays honest
  });

  it('label_multiline_ingredients_en: glued units + wrapped ingredients', async () => {
    const out = await run('label_multiline_ingredients_en.png');
    expect(field(out, 'fat').candidates[0]?.normalized).toBe('34.9');
    expect(field(out, 'salt').candidates[0]?.normalized).toBe('0.11');
    expect(field(out, 'ingredients_text').candidates[0]?.normalized).toMatch(/hazelnut paste/);
    expect(field(out, 'may_contain_text').candidates[0]?.normalized).toMatch(/tree nuts/);
  });

  it('label_lowquality: empty capture → everything absent', async () => {
    const out = await run('label_lowquality.png');
    for (const f of out) expect(f.candidates[0]?.provenance).toBe('absent');
  });

  it('label_partial_en: identity found, nutrition honestly absent', async () => {
    const out = await run('label_partial_en.png');
    expect(field(out, 'product_name').candidates[0]?.normalized).toBe('Alpine Herbal Drops');
    expect(field(out, 'fat').candidates[0]?.provenance).toBe('absent');
    expect(field(out, 'energy_kcal').candidates[0]?.provenance).toBe('absent');
  });

  it('label_nutrition_de: German rows, EAN, claims', async () => {
    const out = await run('label_nutrition_de.png');
    expect(field(out, 'fat').candidates[0]?.normalized).toBe('30.5');
    expect(field(out, 'saturated_fat').candidates[0]?.normalized).toBe('18.7');
    expect(field(out, 'sugars').candidates[0]?.normalized).toBe('51.2');
    expect(field(out, 'protein').candidates[0]?.normalized).toBe('7.3');
    expect(field(out, 'ean_code').candidates[0]?.normalized).toBe('4012345678901');
    expect(field(out, 'claim_vegetarian').candidates[0]?.normalized).toBe('true');
    expect(field(out, 'claim_gluten_free').candidates[0]?.normalized).toBe('true');
  });

  it('label_multipack_pl: multipack, trace, explicit zero, fibre', async () => {
    const out = await run('label_multipack_pl.png');
    expect(field(out, 'package_size').candidates[0]?.normalized).toBe('330');
    expect(field(out, 'package_unit').candidates[0]?.normalized).toBe('ml');
    expect(field(out, 'saturated_fat').candidates[0]?.normalized).toBeNull(); // trace
    expect(field(out, 'saturated_fat').candidates[0]?.provenance).toBe('explicit');
    expect(field(out, 'salt').candidates[0]?.normalized).toBe('0'); // explicit zero
    expect(field(out, 'fibre').candidates[0]?.normalized).toBe('0.5');
    expect(field(out, 'ean_code').candidates[0]?.normalized).toBe('5901234123457');
  });
});
