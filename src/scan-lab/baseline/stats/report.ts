/**
 * Scan Core — Phase 0 baseline: report generator.
 *
 * Pure: turns a recorded session (SessionRecord + per-scene run summaries + the decode/frame event
 * streams the loop emitted) into one JSON-serialisable BaselineReport. No clocks, no DOM, no I/O —
 * `generatedAt` is passed in, so the same input always yields the same report.
 *
 * Temporal-evidence rule (spike lessons 2026-09-03): a single-frame read is never a success. A scene
 * is DECODED_CONFIRMED only when two consecutive checksum-valid reads from two different frames agree.
 * The first such pair fixes `confirmedText` / `firstConfirmedMs`, and the verdict follows THAT value,
 * because it is the value the app would have committed to.
 */
import { SCENE_BY_ID } from '../scenes';
import type {
  DecodeVariant,
  DeviceMeta,
  LoopStats,
  Percentiles,
  SceneDefinition,
  SceneKind,
  SceneRunSummary,
  SessionRecord,
  TransferStats,
} from '../types';
import { percentiles } from './percentiles';

/** Frame presentation tick as seen on the main thread; `tMs` is relative to the scene start. */
export interface FrameTick {
  /** ms since scene start when the frame was presented (rVFC or rAF). */
  tMs: number;
  /** false when the frame was dropped because a decode was still in flight. */
  processed: boolean;
  /** Capture → luminance plane ready, ms; only meaningful for processed frames. */
  captureToLumaMs?: number | null;
}

export interface DecodeDiagnostics {
  /** Width of the localised candidate in source pixels. */
  candidateWidthPx?: number | null;
  /** Candidate orientation in degrees (0 = bars vertical); the report uses |angle|. */
  angleDeg?: number | null;
}

/** One decode attempt as observed by the main thread; `tMs` is relative to the scene start. */
export interface DecodeEvent {
  /** ms since scene start when the source frame was captured. */
  tMs: number;
  frameIndex: number;
  variant: DecodeVariant;
  /** Main-thread post → worker reply, ms (the latency the tester feels). */
  roundTripMs: number;
  /** Decode time measured inside the worker, ms; null when not reported. */
  decodeMs?: number | null;
  /** Capture → luminance plane ready for this frame, ms; used only when no ticks were supplied. */
  captureToLumaMs?: number | null;
  /** Decoded text, or null when the decoder returned nothing usable. */
  text: string | null;
  format?: string | null;
  /** True only for a checksum-valid read; a read that fails the checksum is never a hit. */
  checksumValid: boolean;
  diagnostics?: DecodeDiagnostics | null;
}

export type SceneVerdict =
  | 'DECODED_CONFIRMED'
  | 'DECODED_UNCONFIRMED'
  | 'MISREAD'
  | 'NO_DECODE'
  | 'NOT_APPLICABLE';

export const SCENE_VERDICTS: readonly SceneVerdict[] = [
  'DECODED_CONFIRMED',
  'DECODED_UNCONFIRMED',
  'MISREAD',
  'NO_DECODE',
  'NOT_APPLICABLE',
];

export interface VariantSummary {
  variant: DecodeVariant;
  attempts: number;
  hits: number;
  decodeMs: Percentiles;
  roundTripMs: Percentiles;
}

export interface SceneSummary {
  sceneId: string;
  attempt: number;
  kind: SceneKind;
  /** Polish, tester-facing (from the scene definition; falls back to the id). */
  title: string;
  startedAt: string;
  durationMs: number;
  /** Tester-declared code, whitespace removed; null when not declared. */
  expectedCode: string | null;
  frames: {
    presented: number;
    processed: number;
    /** (presented − processed) / presented; null when no ticks were supplied. */
    droppedRatio: number | null;
    /** Where the cadence numbers come from: presented ticks, processed-frame capture times, or nothing. */
    cadenceSource: 'ticks' | 'events' | 'none';
  };
  /** Instantaneous 1000 / cadence between consecutive frames. */
  fps: Percentiles;
  cadenceMs: Percentiles;
  captureToLumaMs: Percentiles;
  workerRoundTripMs: Percentiles;
  /** In-worker decode time over attempts that reported it. */
  decodeMs: Percentiles;
  decodeAttempts: number;
  /** Checksum-valid reads. */
  hits: number;
  /** Reads with text that failed the checksum — never hits, never misreads. */
  invalidReads: number;
  /** Distinct checksum-valid texts → count. */
  decodedTexts: Record<string, number>;
  firstHitMs: number | null;
  /** Time of the second read of the first agreeing pair (two different frames), or null. */
  firstConfirmedMs: number | null;
  confirmedText: string | null;
  /** hits equal to expectedCode / hits; null without an expected code or without hits. */
  correctRate: number | null;
  /** Hits that differ from expectedCode; 0 when no code was declared. */
  misreadCount: number;
  medianCandidateWidthPx: number | null;
  medianAbsAngleDeg: number | null;
  variants: VariantSummary[];
  verdict: SceneVerdict;
  notes: string;
}

export interface BaselineReport {
  harnessVersion: string;
  /** Passed in by the caller — the report never reads a clock. */
  generatedAt: string;
  sessionId: string;
  sessionCreatedAt: string;
  device: DeviceMeta;
  camera: SessionRecord['camera'];
  controls: SessionRecord['controls'];
  loop: LoopStats | null;
  transfer: TransferStats | null;
  scenes: SceneSummary[];
  verdictCounts: Record<SceneVerdict, number>;
  totals: {
    scenes: number;
    barcodeScenes: number;
    objectScenes: number;
    framesPresented: number;
    framesProcessed: number;
    decodeAttempts: number;
    hits: number;
    misreads: number;
    confirmedScenes: number;
    /** Pooled over every barcode scene. */
    workerRoundTripMs: Percentiles;
  };
}

export interface ReportInput {
  run: SessionRecord;
  scenes: SceneRunSummary[];
  /**
   * Keyed by `sceneId` (single attempt) or `${sceneId}:${attempt}` (retries); the composite key wins
   * when both are present.
   */
  eventsByScene: Record<string, DecodeEvent[]>;
  ticksByScene?: Record<string, FrameTick[]>;
  /** ISO timestamp supplied by the caller. */
  generatedAt: string;
  /** Scene definitions used to resolve kind/title; defaults to the owner scene list. */
  sceneDefinitions?: ReadonlyMap<string, SceneDefinition>;
}

const EMPTY_TEXT_ORDER = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Removes every whitespace character; an empty result is "no code". */
export function normalizeCode(code: string | null | undefined): string | null {
  if (typeof code !== 'string') return null;
  const compact = code.replace(/\s+/g, '');
  return compact.length > 0 ? compact : null;
}

/** Normalised text of a checksum-valid read, or null when the event is not a hit. */
export function hitText(event: DecodeEvent): string | null {
  if (!event.checksumValid) return null;
  return normalizeCode(event.text);
}

function sortedByTime(events: readonly DecodeEvent[]): DecodeEvent[] {
  return [...events].sort((a, b) => a.tMs - b.tMs || a.frameIndex - b.frameIndex);
}

/**
 * First pair of consecutive hits that agree. "Consecutive" is in the sequence of HITS — frames with no
 * read in between do not break the pair — but both hits must come from different frames, so two decode
 * variants reading the same frame can never confirm on their own.
 */
export function firstConfirmation(
  events: readonly DecodeEvent[],
): { text: string; tMs: number } | null {
  let previous: { text: string; frameIndex: number } | null = null;
  for (const event of sortedByTime(events)) {
    const text = hitText(event);
    if (text === null) continue;
    if (previous && previous.text === text && previous.frameIndex !== event.frameIndex) {
      return { text, tMs: event.tMs };
    }
    if (!previous || previous.text !== text) previous = { text, frameIndex: event.frameIndex };
  }
  return null;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function cadenceOf(times: readonly number[]): number[] {
  const sorted = [...times].sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const dt = sorted[i]! - sorted[i - 1]!;
    if (dt > 0) out.push(dt);
  }
  return out;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function lookupByScene<T>(
  table: Record<string, T[]> | undefined,
  sceneId: string,
  attempt: number,
): T[] {
  if (!table) return [];
  return table[`${sceneId}:${attempt}`] ?? table[sceneId] ?? [];
}

function decideVerdict(args: {
  kind: SceneKind;
  hits: number;
  expectedCode: string | null;
  confirmedText: string | null;
  correctHits: number;
}): SceneVerdict {
  const { kind, hits, expectedCode, confirmedText, correctHits } = args;
  if (kind === 'object') return 'NOT_APPLICABLE';
  if (hits === 0) return 'NO_DECODE';
  if (confirmedText !== null) {
    if (expectedCode !== null && confirmedText !== expectedCode) return 'MISREAD';
    return 'DECODED_CONFIRMED';
  }
  // Unconfirmed reads: the app would have shown nothing, but if every read was wrong that is still a
  // misread signal worth surfacing rather than hiding behind "unconfirmed".
  if (expectedCode !== null && correctHits === 0) return 'MISREAD';
  return 'DECODED_UNCONFIRMED';
}

export function summarizeScene(
  scene: SceneRunSummary,
  events: readonly DecodeEvent[],
  ticks: readonly FrameTick[] | undefined,
  definition: SceneDefinition | undefined,
): SceneSummary {
  const kind: SceneKind = definition?.kind ?? 'barcode';
  const expectedCode = normalizeCode(scene.declaredCode);
  const ordered = sortedByTime(events);

  // Frames + cadence
  let presented = scene.framesProcessed;
  let processed = scene.framesProcessed;
  let droppedRatio: number | null = null;
  let cadenceSource: SceneSummary['frames']['cadenceSource'] = 'none';
  let cadence: number[] = [];
  const captureToLuma: number[] = [];
  if (ticks && ticks.length > 0) {
    presented = ticks.length;
    processed = 0;
    for (const tick of ticks) {
      if (tick.processed) processed += 1;
      if (tick.processed && isFiniteNumber(tick.captureToLumaMs)) {
        captureToLuma.push(tick.captureToLumaMs);
      }
    }
    droppedRatio = presented > 0 ? (presented - processed) / presented : null;
    cadence = cadenceOf(ticks.map((tick) => tick.tMs));
    cadenceSource = cadence.length > 0 ? 'ticks' : 'none';
  } else {
    const seenFrames = new Map<number, number>();
    for (const event of ordered) {
      if (!seenFrames.has(event.frameIndex)) seenFrames.set(event.frameIndex, event.tMs);
      if (isFiniteNumber(event.captureToLumaMs) && !captureToLuma.length) {
        // filled below per frame
      }
    }
    const perFrameLuma = new Map<number, number>();
    for (const event of ordered) {
      if (isFiniteNumber(event.captureToLumaMs) && !perFrameLuma.has(event.frameIndex)) {
        perFrameLuma.set(event.frameIndex, event.captureToLumaMs);
      }
    }
    captureToLuma.length = 0;
    captureToLuma.push(...perFrameLuma.values());
    if (seenFrames.size > 1) {
      cadence = cadenceOf([...seenFrames.values()]);
      cadenceSource = cadence.length > 0 ? 'events' : 'none';
    }
  }
  const fps = percentiles(cadence.map((dt) => 1000 / dt));

  // Decodes
  const roundTrips: number[] = [];
  const decodeTimes: number[] = [];
  const decodedTexts: Record<string, number> = {};
  const candidateWidths: number[] = [];
  const absAngles: number[] = [];
  const byVariant = new Map<
    DecodeVariant,
    { attempts: number; hits: number; decodeMs: number[]; roundTripMs: number[] }
  >();
  let hits = 0;
  let invalidReads = 0;
  let correctHits = 0;
  let misreadCount = 0;
  let firstHitMs: number | null = null;
  for (const event of ordered) {
    roundTrips.push(event.roundTripMs);
    if (isFiniteNumber(event.decodeMs)) decodeTimes.push(event.decodeMs);
    let bucket = byVariant.get(event.variant);
    if (!bucket) {
      bucket = { attempts: 0, hits: 0, decodeMs: [], roundTripMs: [] };
      byVariant.set(event.variant, bucket);
    }
    bucket.attempts += 1;
    bucket.roundTripMs.push(event.roundTripMs);
    if (isFiniteNumber(event.decodeMs)) bucket.decodeMs.push(event.decodeMs);
    const diag = event.diagnostics;
    if (diag) {
      if (isFiniteNumber(diag.candidateWidthPx)) candidateWidths.push(diag.candidateWidthPx);
      if (isFiniteNumber(diag.angleDeg)) absAngles.push(Math.abs(diag.angleDeg));
    }
    const text = hitText(event);
    if (text === null) {
      if (normalizeCode(event.text) !== null) invalidReads += 1;
      continue;
    }
    hits += 1;
    bucket.hits += 1;
    decodedTexts[text] = (decodedTexts[text] ?? 0) + 1;
    if (firstHitMs === null) firstHitMs = event.tMs;
    if (expectedCode !== null) {
      if (text === expectedCode) correctHits += 1;
      else misreadCount += 1;
    }
  }
  const confirmation = firstConfirmation(ordered);
  const confirmedText = confirmation?.text ?? null;
  const variants: VariantSummary[] = [...byVariant.entries()]
    .sort(([a], [b]) => EMPTY_TEXT_ORDER(a, b))
    .map(([variant, bucket]) => ({
      variant,
      attempts: bucket.attempts,
      hits: bucket.hits,
      decodeMs: percentiles(bucket.decodeMs),
      roundTripMs: percentiles(bucket.roundTripMs),
    }));

  return {
    sceneId: scene.sceneId,
    attempt: scene.attempt,
    kind,
    title: definition?.title ?? scene.sceneId,
    startedAt: scene.startedAt,
    durationMs: scene.durationMs,
    expectedCode,
    frames: { presented, processed, droppedRatio, cadenceSource },
    fps,
    cadenceMs: percentiles(cadence),
    captureToLumaMs: percentiles(captureToLuma),
    workerRoundTripMs: percentiles(roundTrips),
    decodeMs: percentiles(decodeTimes),
    decodeAttempts: ordered.length,
    hits,
    invalidReads,
    decodedTexts,
    firstHitMs,
    firstConfirmedMs: confirmation?.tMs ?? null,
    confirmedText,
    correctRate: expectedCode !== null && hits > 0 ? correctHits / hits : null,
    misreadCount,
    medianCandidateWidthPx: median(candidateWidths),
    medianAbsAngleDeg: median(absAngles),
    variants,
    verdict: decideVerdict({ kind, hits, expectedCode, confirmedText, correctHits }),
    notes: scene.notes,
  };
}

export function buildReport(input: ReportInput): BaselineReport {
  const definitions = input.sceneDefinitions ?? SCENE_BY_ID;
  const scenes = input.scenes.map((scene) =>
    summarizeScene(
      scene,
      lookupByScene(input.eventsByScene, scene.sceneId, scene.attempt),
      input.ticksByScene
        ? lookupByScene(input.ticksByScene, scene.sceneId, scene.attempt)
        : undefined,
      definitions.get(scene.sceneId),
    ),
  );

  const verdictCounts = Object.fromEntries(SCENE_VERDICTS.map((v) => [v, 0])) as Record<
    SceneVerdict,
    number
  >;
  const pooledRoundTrips: number[] = [];
  const totals: BaselineReport['totals'] = {
    scenes: scenes.length,
    barcodeScenes: 0,
    objectScenes: 0,
    framesPresented: 0,
    framesProcessed: 0,
    decodeAttempts: 0,
    hits: 0,
    misreads: 0,
    confirmedScenes: 0,
    workerRoundTripMs: percentiles([]),
  };
  for (let i = 0; i < scenes.length; i += 1) {
    const summary = scenes[i]!;
    verdictCounts[summary.verdict] += 1;
    if (summary.kind === 'object') totals.objectScenes += 1;
    else totals.barcodeScenes += 1;
    totals.framesPresented += summary.frames.presented;
    totals.framesProcessed += summary.frames.processed;
    totals.decodeAttempts += summary.decodeAttempts;
    totals.hits += summary.hits;
    totals.misreads += summary.misreadCount;
    if (summary.firstConfirmedMs !== null) totals.confirmedScenes += 1;
    if (summary.kind === 'barcode') {
      for (const event of lookupByScene(input.eventsByScene, summary.sceneId, summary.attempt)) {
        pooledRoundTrips.push(event.roundTripMs);
      }
    }
  }
  totals.workerRoundTripMs = percentiles(pooledRoundTrips);

  const { run } = input;
  return {
    harnessVersion: run.harnessVersion,
    generatedAt: input.generatedAt,
    sessionId: run.sessionId,
    sessionCreatedAt: run.createdAt,
    device: run.device,
    camera: run.camera,
    controls: run.controls,
    loop: run.loop,
    transfer: run.transfer,
    scenes,
    verdictCounts,
    totals,
  };
}
