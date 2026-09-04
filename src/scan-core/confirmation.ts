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
export type ReadSource = 'medium' | 'native' | 'rescue' | 'rectified';

export interface Read {
  frameIndex: number;
  tMs: number;
  text: string;
  lineCount: number;
  moduleNative: number | null;
  source: ReadSource;
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

export class Confirmation {
  private reads: Read[] = [];
  state: ConfirmationState = {
    status: 'idle',
    value: null,
    lane: null,
    agreeing: 0,
    confirmedAt: null,
    frames: [],
  };

  reset(): void {
    this.reads = [];
    this.state = {
      status: 'idle',
      value: null,
      lane: null,
      agreeing: 0,
      confirmedAt: null,
      frames: [],
    };
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
      prev.text === read.text &&
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
      };
      return this.state;
    }

    // slow lane: count agreeing reads from distinct frames within the window
    // rectified reads COUNT on the slow lane (D3 can: all 40 correct reads came from the rectified crop) but
    // never carry the fast lane (the same crop also produced 6 consecutive aliases)
    const byText = new Map<string, Set<number>>();
    for (const r of this.reads) {
      const set = byText.get(r.text) ?? new Set<number>();
      set.add(r.frameIndex);
      byText.set(r.text, set);
    }
    const ranked = [...byText.entries()]
      .map(([text, frames]) => ({ text, n: frames.size, frames: [...frames] }))
      .sort((a, b) => b.n - a.n);
    const top = ranked[0];
    const second = ranked[1];
    if (
      top &&
      top.n >= CONFIRMATION.slowAgreeing &&
      (!second || top.n >= second.n * CONFIRMATION.slowMargin)
    ) {
      this.state = {
        status: 'confirmed',
        value: top.text,
        lane: 'slow',
        agreeing: top.n,
        confirmedAt: read.tMs,
        frames: top.frames,
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
    };
    return this.state;
  }
}
