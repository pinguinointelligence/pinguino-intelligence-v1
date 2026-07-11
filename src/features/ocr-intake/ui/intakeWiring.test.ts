/**
 * Orchestrator wiring test — the real IntakeWiring assembles the merged G+H
 * modules and runs real duplicate assessment end-to-end (no mocks).
 */
import { describe, expect, it } from 'vitest';
import { buildRealIntakeWiring, toEvidenceSources } from './intakeWiring';
import type { IntakeImage, ProductIntakeSession, RawOcrResult } from '../intakeContracts';

const run = (imageId: string): RawOcrResult => ({
  providerId: 'fixture',
  imageId,
  fullText: 'x',
  lines: [{ text: 'x', confidence: 90, words: [] }],
  overallConfidence: 90,
  languageHints: ['eng'],
  durationMs: 0,
});

const image = (imageId: string, role: IntakeImage['role']): IntakeImage => ({
  imageId,
  role,
  order: 0,
  fileName: `${imageId}.png`,
  mime: 'image/png',
  byteSize: 100,
  checksumSha256: 'a'.repeat(64),
  width: null,
  height: null,
  state: 'ready',
  failure: null,
});

const emptySession = (over: Partial<ProductIntakeSession> = {}): ProductIntakeSession => ({
  sessionId: 's1',
  state: 'review',
  images: [],
  manualEan: null,
  ocrRuns: {},
  fields: [],
  warnings: [],
  duplicate: null,
  ...over,
});

describe('toEvidenceSources', () => {
  it('maps each run to its image role; unmatched run → other', () => {
    const sources = toEvidenceSources([run('a'), run('b')], [image('a', 'nutrition_table')]);
    expect(sources).toEqual([
      { imageId: 'a', role: 'nutrition_table', result: run('a') },
      { imageId: 'b', role: 'other', result: run('b') },
    ]);
  });
});

describe('buildRealIntakeWiring', () => {
  it('wires real runOcr, extractEvidence and assessDuplicate (reduceSession stays demo)', () => {
    const wiring = buildRealIntakeWiring();
    expect(typeof wiring.runOcr).toBe('function');
    expect(typeof wiring.extractEvidence).toBe('function');
    expect(typeof wiring.assessDuplicate).toBe('function');
    expect(wiring.reduceSession).toBeNull();
  });

  it('extractEvidence returns all 28 contract fields for empty runs', () => {
    const fields = buildRealIntakeWiring().extractEvidence!([]);
    expect(fields).toHaveLength(28);
    // nothing invented: every field is absent for zero runs
    expect(fields.every((f) => f.reviewStatus === 'marked_unknown' || f.candidates.every((c) => c.provenance === 'absent'))).toBe(true);
  });

  it('assessDuplicate against an empty catalog → new_product (real dedup, no mock)', async () => {
    const assessment = await buildRealIntakeWiring().assessDuplicate!(emptySession());
    expect(assessment.verdict).toBe('new_product');
    expect(assessment.allowedActions).toEqual(['create_new']);
  });

  it('assessDuplicate finds a real EAN match against a supplied product', async () => {
    const wiring = buildRealIntakeWiring({
      existingProducts: [{ id: 'P-1', ean_code: '4012345678901' }],
    });
    const session = emptySession({ manualEan: '4012345678901' });
    const assessment = await wiring.assessDuplicate!(session);
    expect(assessment.verdict).toBe('exact_duplicate');
    expect(assessment.reasons.some((r) => r.check === 'ean_match' && r.existingProductId === 'P-1')).toBe(true);
  });
});
