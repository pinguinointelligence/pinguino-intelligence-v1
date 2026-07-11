import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FieldEvidence, RawOcrResult, ReviewedField } from '@/features/ocr-intake/intakeContracts';

const h = vi.hoisted(() => {
  const state: { single: unknown; list: unknown; error: unknown } = { single: null, list: [], error: null };
  const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
  for (const m of ['from', 'insert', 'select', 'eq', 'order']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn(async () => ({ data: state.single, error: state.error }));
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve({ data: state.list, error: state.error });
  return { chain, state };
});
vi.mock('@/lib/supabase/client', () => ({ supabase: h.chain }));

import { buildEvidenceRows, recordOcrRun, saveEvidence } from './ocrIntakeEvidence';

const candidate = (over: Partial<FieldEvidence>): FieldEvidence => ({
  extractedRaw: 'raw',
  normalized: 'norm',
  evidence: { imageId: 'i1', lineIndex: 2, sourceText: 'Salt 0.28 g' },
  extractionConfidence: 90,
  normalizationConfidence: 88,
  provenance: 'explicit',
  warnings: [],
  ...over,
});

const field = (over: Partial<ReviewedField>): ReviewedField => ({
  fieldKey: 'salt',
  candidates: [candidate({})],
  chosenCandidate: 0,
  editedValue: null,
  reviewStatus: 'confirmed',
  ...over,
});

afterEach(() => {
  vi.clearAllMocks();
  h.state.single = null;
  h.state.list = [];
  h.state.error = null;
});

describe('buildEvidenceRows (pure flatten)', () => {
  it('emits one row per candidate with contiguous candidate_index', () => {
    const rows = buildEvidenceRows('s1', [
      field({ candidates: [candidate({ extractedRaw: 'a' }), candidate({ extractedRaw: 'b' })], chosenCandidate: 1 }),
    ]);
    expect(rows.map((r) => r.candidate_index)).toEqual([0, 1]);
    // review_status: only the CHOSEN candidate carries the field's status
    expect(rows[0]?.review_status).toBe('needs_confirmation');
    expect(rows[1]?.review_status).toBe('confirmed');
    expect(rows.every((r) => r.session_id === 's1' && r.field_key === 'salt')).toBe(true);
  });

  it('an ABSENT candidate is forced to null extracted_raw AND null normalized_value (never a fake 0)', () => {
    const rows = buildEvidenceRows('s1', [
      field({
        candidates: [candidate({ provenance: 'absent', extractedRaw: 'leftover', normalized: '0' })],
      }),
    ]);
    expect(rows[0]?.provenance).toBe('absent');
    expect(rows[0]?.extracted_raw).toBeNull();
    expect(rows[0]?.normalized_value).toBeNull();
  });

  it('stringifies a normalized value and carries evidence refs', () => {
    const rows = buildEvidenceRows('s1', [
      field({ candidates: [candidate({ normalized: 0.28 as unknown as string })] }),
    ]);
    expect(rows[0]?.normalized_value).toBe('0.28');
    expect(rows[0]?.evidence_image_id).toBe('i1');
    expect(rows[0]?.evidence_line_index).toBe(2);
    expect(rows[0]?.source_text).toBe('Salt 0.28 g');
  });

  it('null evidence → null refs', () => {
    const rows = buildEvidenceRows('s1', [field({ candidates: [candidate({ evidence: null })] })]);
    expect(rows[0]?.evidence_image_id).toBeNull();
    expect(rows[0]?.evidence_line_index).toBeNull();
    expect(rows[0]?.source_text).toBeNull();
  });

  it('appends a manual edit as a NEW candidate row (write-once — never mutating an existing row)', () => {
    const rows = buildEvidenceRows('s1', [
      field({ candidates: [candidate({})], editedValue: '0.30', reviewStatus: 'edited' }),
    ]);
    expect(rows).toHaveLength(2);
    const edit = rows[1];
    expect(edit?.candidate_index).toBe(1);
    expect(edit?.normalized_value).toBe('0.30');
    expect(edit?.provenance).toBe('inferred');
    expect(edit?.review_status).toBe('edited');
    expect(edit?.extracted_raw).toBeNull();
  });
});

describe('saveEvidence / recordOcrRun (insert-only)', () => {
  it('saveEvidence is a no-op (no insert) when there is nothing to record', async () => {
    h.state.list = [];
    const out = await saveEvidence('s1', []);
    expect(out).toEqual([]);
    expect(h.chain.insert).not.toHaveBeenCalled();
  });

  it('saveEvidence bulk-inserts the built rows', async () => {
    h.state.list = [{ id: 'e1' }];
    await saveEvidence('s1', [field({})]);
    expect(h.chain.from).toHaveBeenCalledWith('ocr_field_evidence');
    const inserted = h.chain.insert!.mock.calls[0]?.[0] as unknown[];
    expect(Array.isArray(inserted)).toBe(true);
    expect(inserted).toHaveLength(1);
  });

  it('recordOcrRun persists verbatim full_text + aggregates (never lines/words)', async () => {
    h.state.single = { id: 'r1' };
    const run: RawOcrResult = {
      providerId: 'tesseract',
      imageId: 'i1',
      fullText: 'Salt 0.28 g',
      lines: [{ text: 'Salt 0.28 g', confidence: 90, words: [] }],
      overallConfidence: 91,
      languageHints: ['eng'],
      durationMs: 1200,
    };
    await recordOcrRun('s1', 'i1', run);
    const row = h.chain.insert!.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      session_id: 's1',
      image_id: 'i1',
      provider_id: 'tesseract',
      full_text: 'Salt 0.28 g',
      overall_confidence: 91,
      duration_ms: 1200,
    });
    expect(row).not.toHaveProperty('lines');
    expect(row).not.toHaveProperty('words');
  });
});
