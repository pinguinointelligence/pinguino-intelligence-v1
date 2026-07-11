/**
 * Deterministic TEST BUILDERS for the session/dedup/save/batch tests. Hand-built
 * contract fixtures only — no OCR engine, no Track-G extractor import, no IO.
 */
import type {
  FieldEvidence,
  IntakeFieldKey,
  IntakeImageRole,
  OcrRunOutcome,
  ProductIntakeSession,
  RawOcrResult,
  ReviewedField,
} from '../../intakeContracts';
import {
  addImage,
  beginExtraction,
  beginImageAnalysis,
  completeExtraction,
  completeImageAnalysis,
  createIntakeSession,
  type AddImageInput,
} from '../intakeSession';

/** Deterministic fake SHA-256 hex from a seed (64 chars; same seed → same hash). */
export function fakeSha(seed: string): string {
  let h = 2166136261;
  let out = '';
  for (let i = 0; out.length < 64; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i % seed.length) ^ i, 16777619) >>> 0;
    out += h.toString(16).padStart(8, '0');
  }
  return out.slice(0, 64);
}

/** A valid AddImageInput; checksum derives from the imageId unless overridden. */
export function imageInput(imageId: string, overrides: Partial<AddImageInput> = {}): AddImageInput {
  return {
    imageId,
    role: 'front' as IntakeImageRole,
    fileName: `${imageId}.png`,
    mime: 'image/png',
    byteSize: 120_000,
    checksumSha256: fakeSha(imageId),
    ...overrides,
  };
}

/** One explicit-provenance evidence candidate. */
export function evidence(value: string, imageId: string, overrides: Partial<FieldEvidence> = {}): FieldEvidence {
  return {
    extractedRaw: value,
    normalized: value,
    evidence: { imageId, lineIndex: 0, sourceText: value },
    extractionConfidence: 90,
    normalizationConfidence: 95,
    provenance: 'explicit',
    warnings: [],
    ...overrides,
  };
}

/** A resolved (auto-accepted) reviewed field with one explicit candidate. */
export function resolvedField(
  fieldKey: IntakeFieldKey,
  value: string,
  imageId = 'img-1',
  overrides: Partial<ReviewedField> = {},
): ReviewedField {
  return {
    fieldKey,
    candidates: [evidence(value, imageId)],
    chosenCandidate: 0,
    editedValue: null,
    reviewStatus: 'auto_accepted',
    ...overrides,
  };
}

/** A field the extractor could not populate (absent, auto-accepted → resolves null). */
export function absentField(fieldKey: IntakeFieldKey): ReviewedField {
  return { fieldKey, candidates: [], chosenCandidate: null, editedValue: null, reviewStatus: 'auto_accepted' };
}

/** A successful OCR run outcome for an image. */
export function okRun(imageId: string, fullText: string, overrides: Partial<RawOcrResult> = {}): OcrRunOutcome {
  return {
    ok: true,
    result: {
      providerId: 'fixture-provider',
      imageId,
      fullText,
      lines: fullText
        .split('\n')
        .filter((t) => t.trim() !== '')
        .map((text) => ({ text, confidence: 90, words: [] })),
      overallConfidence: 90,
      languageHints: ['eng'],
      durationMs: 42,
      ...overrides,
    },
  };
}

export function failedRun(kind: 'unreadable_image' | 'cancelled' = 'unreadable_image'): OcrRunOutcome {
  return { ok: false, failure: { kind } };
}

/** A session in 'collecting_images' with n images (img-1 … img-n). */
export function collectingSession(sessionId = 'session-1', imageCount = 1): ProductIntakeSession {
  let session = createIntakeSession(sessionId);
  for (let i = 1; i <= imageCount; i += 1) {
    session = addImage(session, imageInput(`img-${i}`));
  }
  return session;
}

/** A session mid-'extracting' with every image analysed OK on the given texts. */
export function extractedSession(
  sessionId = 'session-1',
  texts: readonly string[] = ['Vanilla Dessert Base\nBrand: Polar Foods'],
): ProductIntakeSession {
  let session = collectingSession(sessionId, texts.length);
  session = beginExtraction(session);
  texts.forEach((text, i) => {
    const imageId = `img-${i + 1}`;
    session = beginImageAnalysis(session, imageId);
    session = completeImageAnalysis(session, imageId, okRun(imageId, text));
  });
  return session;
}

/** A session in 'review' carrying the given reviewed fields. */
export function reviewSession(
  sessionId = 'session-1',
  fields: readonly ReviewedField[] = [resolvedField('product_name', 'Vanilla Dessert Base')],
  texts: readonly string[] = ['Vanilla Dessert Base\nBrand: Polar Foods'],
): ProductIntakeSession {
  return completeExtraction(extractedSession(sessionId, texts), fields);
}
