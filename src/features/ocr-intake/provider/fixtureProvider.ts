/**
 * FixtureOcrProvider — deterministic OcrProvider for tests and demos (spec §7).
 * Zero network, zero WASM, zero timers: constructed with a map of
 * checksum-or-imageId → captured raw OCR text (+ optional per-line confidences) and
 * returns byte-identical RawOcrResults for the same input every time.
 *
 * Lookup order: SHA-256 hex of the bytes (WebCrypto — pure, local) first, then the
 * imageId. Unknown images fail HONESTLY (engine_error naming the lookup keys) — the
 * fixture provider never fabricates text for an image nobody captured.
 */

import type {
  AcceptedMime,
  OcrLine,
  OcrProvider,
  OcrRunFailure,
  OcrRunOutcome,
  RawOcrResult,
} from '../intakeContracts';

export const FIXTURE_PROVIDER_ID = 'fixture';

const ACCEPTED_MIMES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

/** One registered fixture: captured raw text, or a deliberate failure to replay. */
export type FixtureEntry =
  | {
      kind: 'text';
      /** captured raw OCR text (verbatim — e.g. __fixtures__/raw/*.txt content). */
      rawText: string;
      /** per-NON-EMPTY-line confidences (0..100); shorter arrays fall back to the default. */
      lineConfidences?: readonly number[];
      /** page-level confidence (default: mean of line confidences, else 90). */
      overallConfidence?: number;
    }
  | { kind: 'failure'; failure: OcrRunFailure };

/** SHA-256 hex of raw bytes via WebCrypto (Node ≥15 + browsers, fully local). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = new Uint8Array(bytes).buffer as ArrayBuffer;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const DEFAULT_LINE_CONFIDENCE = 90;

/** Deterministic line split: non-empty trimmed lines, whitespace collapsed —
 * the same shape the real engine produces from a recognized page. */
export function fixtureLines(rawText: string, lineConfidences: readonly number[] = []): OcrLine[] {
  const lines: OcrLine[] = [];
  let nonEmptyIndex = 0;
  for (const raw of rawText.split(/\r?\n/)) {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (text === '') continue;
    const confidence = lineConfidences[nonEmptyIndex] ?? DEFAULT_LINE_CONFIDENCE;
    lines.push({
      text,
      confidence,
      words: text.split(' ').map((word) => ({ text: word, confidence, bbox: null })),
    });
    nonEmptyIndex += 1;
  }
  return lines;
}

export class FixtureOcrProvider implements OcrProvider {
  readonly providerId = FIXTURE_PROVIDER_ID;

  private readonly entries: ReadonlyMap<string, FixtureEntry>;

  /** @param entries keyed by SHA-256 checksum (hex) OR imageId. */
  constructor(entries: Record<string, FixtureEntry> | Map<string, FixtureEntry>) {
    this.entries = entries instanceof Map ? new Map(entries) : new Map(Object.entries(entries));
  }

  async recognize(input: {
    imageId: string;
    bytes: Uint8Array;
    mime: AcceptedMime;
    languages: string[];
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
  }): Promise<OcrRunOutcome> {
    // same honest pre-flight as the real provider, so tests exercise identical seams
    if (!ACCEPTED_MIMES.includes(input.mime)) {
      return { ok: false, failure: { kind: 'unsupported_format', mime: input.mime } };
    }
    if (input.signal?.aborted) {
      return { ok: false, failure: { kind: 'cancelled' } };
    }

    const checksum = await sha256Hex(input.bytes);
    const entry = this.entries.get(checksum) ?? this.entries.get(input.imageId);
    if (!entry) {
      return {
        ok: false,
        failure: {
          kind: 'engine_error',
          message: `no fixture registered for checksum ${checksum} or imageId "${input.imageId}" — the fixture provider never invents text.`,
        },
      };
    }
    if (entry.kind === 'failure') {
      return { ok: false, failure: entry.failure };
    }

    input.onProgress?.(1);
    const lines = fixtureLines(entry.rawText, entry.lineConfidences ?? []);
    const meanConfidence =
      lines.length > 0
        ? Math.round(lines.reduce((sum, l) => sum + l.confidence, 0) / lines.length)
        : 0;
    const result: RawOcrResult = {
      providerId: this.providerId,
      imageId: input.imageId,
      fullText: entry.rawText,
      lines,
      overallConfidence: entry.overallConfidence ?? meanConfidence,
      languageHints: [...input.languages],
      durationMs: 0, // deterministic: the fixture provider does no real work
    };
    return { ok: true, result };
  }
}
