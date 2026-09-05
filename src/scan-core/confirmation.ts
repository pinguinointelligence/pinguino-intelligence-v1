/**
 * Scan Core — temporal confirmation (Phase 1 design §4). Pure and deterministic.
 * Fast lane: two reads from DIFFERENT frames agreeing, each lineCount ≥ 4 and module ≥ 2 px, neither from
 * a rectified crop alone, no contradicting read in between (table 6: P(wrong) ≤ 0.7 % at lineCount 4; the
 * observed wrong pairs — D1 40 cm, D3 can — all violate one of these).
 * Consensus lane (NOT the audited slot-accumulator slow lane, which stays research-gated): four agreeing
 * reads from different frames with ≥ 2:1 margin over any other value within the window (D1 40 cm alias
 * sequence: the correct code won 6 reads against eight scattered aliases of 1–5 each; a 3:1 margin never
 * confirmed it, 2:1 with ≥ 4 frames confirms it and no alias).
 * §17 rectified rule (corpus): a systematic homography alias repeats identically across frames, so rectified
 * reads never confirm on their own — every confirmation needs at least one non-rectified agreeing read.
 */
import { formatFromDecoder, type BarcodeFormat } from './observation';

export type ReadSource = 'medium' | 'native' | 'rescue' | 'rectified';

export interface Read {
  frameIndex: number;
  tMs: number;
  text: string;
  lineCount: number;
  moduleNative: number | null;
  source: ReadSource;
  /** decoder-reported symbology string (e.g. 'EAN13'); reads of different symbologies never agree */
  format?: string;
  /** decoder text before digit normalisation */
  rawText?: string;
}

export type Lane = 'fast' | 'consensus';

export interface ConfirmationState {
  status: 'idle' | 'reading' | 'confirmed';
  value: string | null;
  lane: Lane | null;
  agreeing: number;
  confirmedAt: number | null;
  /** frames that contributed to the confirmation */
  frames: number[];
  /** normalised symbology of the agreeing reads (null before any read) */
  format: BarcodeFormat | null;
  /** reads of the confirmed digits arrived with more than one known symbology */
  mixedFormats: boolean;
}

export const CONFIRMATION = {
  fastLineCount: 4,
  fastModulePx: 2,
  /** audit §5.5: the two agreeing decodes of the fast lane must land within 400 ms */
  fastWindowMs: 400,
  slowAgreeing: 4,
  slowMargin: 2,
  windowMs: 1500,
} as const;

const IDLE: ConfirmationState = {
  status: 'idle',
  value: null,
  lane: null,
  agreeing: 0,
  confirmedAt: null,
  frames: [],
  format: null,
  mixedFormats: false,
};

/** Agreement key: digits + normalised symbology. An unknown symbology agrees only with unknown. */
function agreementKey(r: Read): string {
  return `${r.text}|${formatFromDecoder(r.format ?? '')}`;
}

/** per-position digit evidence from the reads in the window — never more than the decoder actually read */
export interface DigitVotes {
  /** the digit at each position when every read agrees there (or a ≥ 2:1 majority), else null */
  digits: (string | null)[];
  /** true when at least two reads from different frames agree on that position */
  stable: boolean[];
  reads: number;
}

export class Confirmation {
  private reads: Read[] = [];
  state: ConfirmationState = { ...IDLE };

  /** what the reads so far support, digit by digit (null before any read); length = the dominant read length */
  digitVotes(): DigitVotes | null {
    if (this.reads.length === 0) return null;
    const byLength = new Map<number, Read[]>();
    for (const r of this.reads) {
      const list = byLength.get(r.text.length) ?? [];
      list.push(r);
      byLength.set(r.text.length, list);
    }
    const [length, reads] = [...byLength.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
    const digits: (string | null)[] = [];
    const stable: boolean[] = [];
    for (let i = 0; i < length; i += 1) {
      const counts = new Map<string, Set<number>>();
      for (const r of reads) {
        const ch = r.text[i]!;
        const frames = counts.get(ch) ?? new Set<number>();
        frames.add(r.frameIndex);
        counts.set(ch, frames);
      }
      const ranked = [...counts.entries()]
        .map(([ch, frames]) => ({ ch, n: frames.size }))
        .sort((a, b) => b.n - a.n);
      const best = ranked[0]!;
      const second = ranked[1]?.n ?? 0;
      const agreed = second === 0 || best.n >= 2 * second;
      digits.push(agreed ? best.ch : null);
      stable.push(agreed && best.n >= 2);
    }
    return { digits, stable, reads: reads.length };
  }

  reset(): void {
    this.reads = [];
    this.state = { ...IDLE };
  }

  private mixedFormats(text: string): boolean {
    const known = new Set(
      this.reads
        .filter((r) => r.text === text)
        .map((r) => formatFromDecoder(r.format ?? ''))
        .filter((f) => f !== 'unknown'),
    );
    return known.size > 1;
  }

  private fastEligible(r: Read): boolean {
    return (
      r.source !== 'rectified' &&
      r.lineCount >= CONFIRMATION.fastLineCount &&
      (r.moduleNative ?? 0) >= CONFIRMATION.fastModulePx
    );
  }

  push(read: Read): ConfirmationState {
    if (this.state.status === 'confirmed') return this.state;
    this.reads = this.reads.filter((r) => read.tMs - r.tMs <= CONFIRMATION.windowMs);
    this.reads.push(read);

    // fast lane (audit §5.5 + corpus gates): the immediately previous read agrees, comes from another frame,
    // both fast-eligible, within 400 ms, and at least one of the two is NOT from a rectified crop (§17)
    const prev = this.reads.length >= 2 ? this.reads[this.reads.length - 2] : undefined;
    if (
      prev &&
      agreementKey(prev) === agreementKey(read) &&
      prev.frameIndex !== read.frameIndex &&
      read.tMs - prev.tMs <= CONFIRMATION.fastWindowMs &&
      this.fastEligible(prev) &&
      this.fastEligible(read) &&
      !(prev.source === 'rectified' && read.source === 'rectified')
    ) {
      this.state = {
        status: 'confirmed',
        value: read.text,
        lane: 'fast',
        agreeing: 2,
        confirmedAt: read.tMs,
        frames: [prev.frameIndex, read.frameIndex],
        format: formatFromDecoder(read.format ?? ''),
        mixedFormats: this.mixedFormats(read.text),
      };
      return this.state;
    }

    // slow lane: count agreeing reads from distinct frames within the window
    // rectified reads COUNT on the slow lane (D3 can: all 40 correct reads came from the rectified crop) but
    // never carry the fast lane (the same crop also produced 6 consecutive aliases)
    const byKey = new Map<string, { text: string; format: BarcodeFormat; frames: Set<number> }>();
    for (const r of this.reads) {
      const key = agreementKey(r);
      const g = byKey.get(key) ?? {
        text: r.text,
        format: formatFromDecoder(r.format ?? ''),
        frames: new Set<number>(),
      };
      g.frames.add(r.frameIndex);
      byKey.set(key, g);
    }
    const ranked = [...byKey.values()]
      .map((g) => ({ text: g.text, format: g.format, n: g.frames.size, frames: [...g.frames] }))
      .sort((a, b) => b.n - a.n);
    const top = ranked[0];
    const second = ranked[1];
    // §17: the winning value needs at least one non-rectified read
    const topHasIndependent = top
      ? this.reads.some(
          (r) =>
            r.text === top.text &&
            formatFromDecoder(r.format ?? '') === top.format &&
            r.source !== 'rectified',
        )
      : false;
    if (
      top &&
      topHasIndependent &&
      top.n >= CONFIRMATION.slowAgreeing &&
      (!second || top.n >= second.n * CONFIRMATION.slowMargin)
    ) {
      this.state = {
        status: 'confirmed',
        value: top.text,
        lane: 'consensus',
        agreeing: top.n,
        confirmedAt: read.tMs,
        frames: top.frames,
        format: top.format,
        mixedFormats: this.mixedFormats(top.text),
      };
      return this.state;
    }
    this.state = {
      status: 'reading',
      value: top?.text ?? null,
      lane: null,
      agreeing: top?.n ?? 0,
      confirmedAt: null,
      frames: top?.frames ?? [],
      format: top?.format ?? null,
      mixedFormats: top ? this.mixedFormats(top.text) : false,
    };
    return this.state;
  }
}
