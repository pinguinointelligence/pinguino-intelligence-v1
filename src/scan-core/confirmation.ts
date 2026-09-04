/**
 * Scan Core — temporal confirmation (Phase 1 design §4). Pure and deterministic.
 * Fast lane: two reads from DIFFERENT frames agreeing, each lineCount ≥ 4 and module ≥ 2 px, neither from
 * a rectified crop alone, no contradicting read in between (table 6: P(wrong) ≤ 0.7 % at lineCount 4; the
 * observed wrong pairs — D1 40 cm, D3 can — all violate one of these).
 * Slow lane: four agreeing reads from different frames with ≥ 2:1 margin over any other value within the
 * window (D1 40 cm alias sequence: the correct code won 6 reads against eight scattered aliases of 1–5 each;
 * a 3:1 margin never confirmed it, 2:1 with ≥ 4 frames confirms it and no alias).
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

export type Lane = 'fast' | 'slow';

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

    // fast lane: the previous read (any source) must agree and come from another frame; both fast-eligible;
    // a contradicting read between them is impossible by construction (we look at the immediately previous read)
    const prev = this.reads.length >= 2 ? this.reads[this.reads.length - 2] : undefined;
    if (
      prev &&
      prev.text === read.text &&
      prev.frameIndex !== read.frameIndex &&
      this.fastEligible(prev) &&
      this.fastEligible(read)
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
    const byText = new Map<string, Set<number>>();
    for (const r of this.reads) {
      if (r.source === 'rectified') continue;
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
