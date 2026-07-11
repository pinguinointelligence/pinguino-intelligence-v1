import { describe, expect, it, vi } from 'vitest';

// The whole OCR intake persistence layer must degrade gracefully when Supabase is not
// configured (no env): reads return empty, writes refuse loudly. Never a silent no-op write.
vi.mock('@/lib/supabase/client', () => ({ supabase: null, isSupabaseConfigured: false }));
vi.mock('@/services/auth', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'u1' })) }));

import {
  createIntakeImageSignedUrl,
  removeIntakeObject,
  uploadIntakeImage,
} from './ocrIntakeStorage';
import {
  createBatch,
  createSession,
  listBatches,
  listSessionImages,
  listSessions,
  loadSession,
  saveImageMetadata,
  updateSessionState,
} from './ocrIntakeSessions';
import { listEvidence, listOcrRuns, recordOcrRun, saveEvidence } from './ocrIntakeEvidence';

describe('OCR intake persistence — unconfigured client degrades safely', () => {
  it('reads return empty / null (never throw)', async () => {
    expect(await listBatches()).toEqual([]);
    expect(await listSessions()).toEqual([]);
    expect(await loadSession('s1')).toBeNull();
    expect(await listSessionImages('s1')).toEqual([]);
    expect(await listOcrRuns('s1')).toEqual([]);
    expect(await listEvidence('s1')).toEqual([]);
    expect(await createIntakeImageSignedUrl('u1/s1/i1.png')).toBeNull();
  });

  it('every write refuses loudly (no silent success)', async () => {
    await expect(createBatch()).rejects.toThrow(/not available/i);
    await expect(createSession()).rejects.toThrow(/not available/i);
    await expect(updateSessionState('s1', 'saved', {})).rejects.toThrow(/not available/i);
    await expect(
      saveImageMetadata('s1', {
        imageId: 'i1',
        role: 'front',
        order: 0,
        fileName: 'f.png',
        mime: 'image/png',
        byteSize: 1,
        checksumSha256: 'a'.repeat(64),
        width: null,
        height: null,
        state: 'ready',
        failure: null,
      }),
    ).rejects.toThrow(/not available/i);
    await expect(uploadIntakeImage('s1', 'i1', new Uint8Array(1), 'image/png')).rejects.toThrow(
      /not available/i,
    );
    await expect(removeIntakeObject('u1/s1/i1.png')).rejects.toThrow(/not available/i);
    await expect(recordOcrRun('s1', 'i1', {
      providerId: 't',
      imageId: 'i1',
      fullText: 'x',
      lines: [],
      overallConfidence: 90,
      languageHints: [],
      durationMs: 1,
    })).rejects.toThrow(/not available/i);
    await expect(
      saveEvidence('s1', [
        { fieldKey: 'salt', candidates: [], chosenCandidate: null, editedValue: '1', reviewStatus: 'edited' },
      ]),
    ).rejects.toThrow(/not available/i);
  });
});
