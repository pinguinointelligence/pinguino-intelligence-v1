/**
 * Scan Core — tracks (audit §5.5 Track/Accumulate): every physical barcode in view is a persistent identity
 * with its own evidence memory, best-crop memory and confirmation. Pure and deterministic; the worker
 * supplies candidates per frame and reads per track.
 */
import { Confirmation, type Read } from './confirmation';
import type { MergedCandidate } from './candidates';

export const TRACK = {
  /** audit: loss after 500 ms without an observation */
  lostAfterMs: 500,
  /** audit: candidate ≥ 3 frames → FOUND */
  foundAfterFrames: 3,
  /** association: predicted-vs-observed centre distance as a fraction of the larger width */
  maxCentreDistFrac: 0.6,
  /** association: width ratio tolerance */
  widthRatioMax: 1.8,
  evidenceCap: 120,
  bestCropKeys: ['sharpest', 'contrast', 'largestModule', 'leastTilt'] as const,
} as const;

export type BestCropKey = (typeof TRACK.bestCropKeys)[number];

export interface Geometry {
  cx: number;
  cy: number;
  widthPx: number;
  heightPx: number;
  angleDeg: number;
}

export type EvidenceKind = 'valid_read' | 'invalid_hypothesis' | 'error_geometry' | 'quality';

/** One retained observation. Never promoted on its own; provenance always kept. */
export interface EvidenceEntry {
  frameIndex: number;
  tMs: number;
  kind: EvidenceKind;
  source: Read['source'] | 'none';
  text?: string;
  format?: string;
  /** decoder text before digit normalisation (valid reads) */
  rawText?: string;
  lineCount?: number;
  error?: string;
  moduleNative?: number | null;
  sharpness?: number;
  contrast?: number;
}

/** Descriptor of a frame worth keeping for a later retry; the worker owns the pixels keyed by frameIndex. */
export interface BestCrop {
  key: BestCropKey;
  frameIndex: number;
  score: number;
  geometry: Geometry;
}

export type TrackState = 'CANDIDATE' | 'FOUND' | 'READING' | 'COMPLETE' | 'LOST';

export interface FrameQualityForTrack {
  sharpness: number;
  contrast: number;
  moduleNative: number | null;
  tiltDeg: number;
}

let nextTrackId = 1;
/** Test hook: deterministic ids. */
export function resetTrackIds(): void {
  nextTrackId = 1;
}

export class Track {
  readonly id: string;
  readonly firstSeenFrame: number;
  readonly firstSeenMs: number;
  lastSeenFrame: number;
  lastSeenMs: number;
  frames = 0;
  geometry: Geometry;
  private velocity = { vx: 0, vy: 0 };
  readonly evidence: EvidenceEntry[] = [];
  readonly best = new Map<BestCropKey, BestCrop>();
  readonly confirmation = new Confirmation();
  state: TrackState = 'CANDIDATE';
  /** consecutive decode misses on this track (drives the per-track ladder) */
  misses = 0;

  constructor(frameIndex: number, tMs: number, c: MergedCandidate) {
    this.id = `t${nextTrackId++}`;
    this.firstSeenFrame = frameIndex;
    this.firstSeenMs = tMs;
    this.lastSeenFrame = frameIndex;
    this.lastSeenMs = tMs;
    this.geometry = {
      cx: c.cx,
      cy: c.cy,
      widthPx: c.widthPx,
      heightPx: c.heightPx,
      angleDeg: c.angleDeg,
    };
    this.frames = 1;
  }

  /** Constant-velocity prediction so the box can move even on frames where locate was skipped. */
  predict(tMs: number): Geometry {
    const dt = Math.max(0, tMs - this.lastSeenMs);
    return {
      ...this.geometry,
      cx: this.geometry.cx + this.velocity.vx * dt,
      cy: this.geometry.cy + this.velocity.vy * dt,
    };
  }

  update(frameIndex: number, tMs: number, c: MergedCandidate): void {
    const dt = tMs - this.lastSeenMs;
    if (dt > 0) {
      const a = 0.5; // damped velocity estimate
      this.velocity.vx = a * ((c.cx - this.geometry.cx) / dt) + (1 - a) * this.velocity.vx;
      this.velocity.vy = a * ((c.cy - this.geometry.cy) / dt) + (1 - a) * this.velocity.vy;
    }
    this.geometry = {
      cx: c.cx,
      cy: c.cy,
      widthPx: c.widthPx,
      heightPx: c.heightPx,
      angleDeg: c.angleDeg,
    };
    this.lastSeenFrame = frameIndex;
    this.lastSeenMs = tMs;
    this.frames += 1;
    if (this.state === 'CANDIDATE' && this.frames >= TRACK.foundAfterFrames) this.state = 'FOUND';
  }

  /** Track-scoped stability (the corpus table-7 metric). */
  stability(c: MergedCandidate): number {
    return (
      Math.abs(c.widthPx - this.geometry.widthPx) / Math.max(1, c.widthPx) +
      Math.hypot(c.cx - this.geometry.cx, c.cy - this.geometry.cy) / Math.max(1, c.widthPx * 4)
    );
  }

  addEvidence(e: EvidenceEntry): void {
    this.evidence.push(e);
    if (this.evidence.length > TRACK.evidenceCap) this.evidence.shift();
    if (e.kind === 'valid_read') this.state = this.state === 'COMPLETE' ? 'COMPLETE' : 'READING';
  }

  /** Bounded best-frame memory: one descriptor per key, replaced only by a better score. */
  considerBest(frameIndex: number, q: FrameQualityForTrack): void {
    const g = this.geometry;
    const cand: Array<[BestCropKey, number]> = [
      ['sharpest', q.sharpness],
      ['contrast', q.contrast],
      ['largestModule', q.moduleNative ?? 0],
      ['leastTilt', -Math.abs(q.tiltDeg)],
    ];
    for (const [key, score] of cand) {
      const cur = this.best.get(key);
      if (!cur || score > cur.score)
        this.best.set(key, { key, frameIndex, score, geometry: { ...g } });
    }
  }

  /** Frames the decoder should retry against when the live frame fails (sharpest first, unique). */
  /**
   * Per-track decode escalation ladder, derived from consecutive misses since the last valid read:
   * 0 cheap crop · 1 harder / rectified when tilted · 2 retry the best retained frames · 3 rescue-eligible.
   * A returning code gets a new track and therefore a fresh ladder; a valid read resets it (pushRead).
   */
  escalationLevel(): 0 | 1 | 2 | 3 {
    if (this.misses <= 0) return 0;
    if (this.misses === 1) return 1;
    if (this.misses < 4) return 2;
    return 3;
  }

  retryFrames(): number[] {
    const order: BestCropKey[] = ['sharpest', 'largestModule', 'contrast', 'leastTilt'];
    const out: number[] = [];
    for (const k of order) {
      const b = this.best.get(k);
      if (b && !out.includes(b.frameIndex)) out.push(b.frameIndex);
    }
    return out;
  }

  pushRead(read: Read): void {
    this.addEvidence({
      frameIndex: read.frameIndex,
      tMs: read.tMs,
      kind: 'valid_read',
      source: read.source,
      text: read.text,
      lineCount: read.lineCount,
      moduleNative: read.moduleNative,
      format: read.format,
      rawText: read.rawText,
    });
    const st = this.confirmation.push(read);
    if (st.status === 'confirmed') this.state = 'COMPLETE';
    this.misses = 0;
  }
}

export interface TrackerUpdate {
  assigned: Array<{ track: Track; candidate: MergedCandidate; stability: number }>;
  created: Track[];
  lost: Track[];
}

/** SORT-style greedy association on predicted centre distance + width ratio; new ids for the rest. */
export class Tracker {
  readonly tracks: Track[] = [];

  update(frameIndex: number, tMs: number, candidates: readonly MergedCandidate[]): TrackerUpdate {
    const assigned: TrackerUpdate['assigned'] = [];
    const created: Track[] = [];
    const usedCand = new Set<number>();
    const usedTrack = new Set<string>();
    const pairs: Array<{ t: Track; i: number; d: number }> = [];
    for (const t of this.tracks) {
      if (t.state === 'LOST') continue;
      const p = t.predict(tMs);
      candidates.forEach((c, i) => {
        const dist =
          Math.hypot(c.cx - p.cx, c.cy - p.cy) / Math.max(1, Math.max(c.widthPx, p.widthPx));
        const ratio = Math.max(c.widthPx, p.widthPx) / Math.max(1, Math.min(c.widthPx, p.widthPx));
        if (dist <= TRACK.maxCentreDistFrac && ratio <= TRACK.widthRatioMax)
          pairs.push({ t, i, d: dist + (ratio - 1) * 0.25 });
      });
    }
    pairs.sort((a, b) => a.d - b.d);
    const cost = new Map<string, number>();
    for (const pr of pairs) cost.set(`${pr.t.id}:${pr.i}`, pr.d);
    const chosen: Array<{ t: Track; i: number }> = [];
    for (const pr of pairs) {
      if (usedTrack.has(pr.t.id) || usedCand.has(pr.i)) continue;
      usedTrack.add(pr.t.id);
      usedCand.add(pr.i);
      chosen.push({ t: pr.t, i: pr.i });
    }
    // Swap guard (2-opt): greedy nearest-first can pair two crossing codes the wrong way round when
    // the first pick is cheap and leaves the other track an expensive leftover. Exchange any two
    // assignments whose swapped total is strictly cheaper, so identities follow the cheaper joint
    // explanation rather than the first match.
    let improved = true;
    while (improved) {
      improved = false;
      for (let a = 0; a < chosen.length; a += 1)
        for (let b = a + 1; b < chosen.length; b += 1) {
          const A = chosen[a]!;
          const B = chosen[b]!;
          const current = cost.get(`${A.t.id}:${A.i}`)! + cost.get(`${B.t.id}:${B.i}`)!;
          const swappedA = cost.get(`${A.t.id}:${B.i}`);
          const swappedB = cost.get(`${B.t.id}:${A.i}`);
          if (
            swappedA !== undefined &&
            swappedB !== undefined &&
            swappedA + swappedB < current - 1e-9
          ) {
            const tmp = A.i;
            A.i = B.i;
            B.i = tmp;
            improved = true;
          }
        }
    }
    for (const { t, i } of chosen) {
      const c = candidates[i]!;
      const stability = t.stability(c);
      t.update(frameIndex, tMs, c);
      assigned.push({ track: t, candidate: c, stability });
    }
    candidates.forEach((c, i) => {
      if (usedCand.has(i)) return;
      const t = new Track(frameIndex, tMs, c);
      this.tracks.push(t);
      created.push(t);
    });
    const lost: Track[] = [];
    for (const t of this.tracks) {
      if (
        t.state !== 'LOST' &&
        !usedTrack.has(t.id) &&
        !created.includes(t) &&
        tMs - t.lastSeenMs > TRACK.lostAfterMs
      ) {
        t.state = 'LOST';
        lost.push(t);
      }
    }
    // forget long-lost tracks (bounded memory)
    for (let i = this.tracks.length - 1; i >= 0; i -= 1) {
      const t = this.tracks[i]!;
      if (t.state === 'LOST' && tMs - t.lastSeenMs > 2000) this.tracks.splice(i, 1);
    }
    return { assigned, created, lost };
  }

  /** The track the user is most plausibly aiming at: largest, most central, most frames. */
  primary(sourceW: number, sourceH: number): Track | null {
    let best: Track | null = null;
    let bestScore = -Infinity;
    for (const t of this.tracks) {
      if (t.state === 'LOST') continue;
      const centre =
        1 -
        Math.hypot(t.geometry.cx - sourceW / 2, t.geometry.cy - sourceH / 2) /
          Math.hypot(sourceW / 2, sourceH / 2);
      const score = t.geometry.widthPx / sourceW + 0.5 * centre + 0.02 * Math.min(t.frames, 30);
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }
}
