/**
 * Harness controller: owns the camera session, the frame loop, the decode client and the corpus store,
 * records evidence per scene, and publishes a throttled HUD snapshot for React (useSyncExternalStore).
 * It is plain TypeScript so the page stays a thin view.
 */
import { CameraSession, describeCameraError } from '../camera/cameraSession';
import { ultrawideSuspicionFromSettings } from '../camera/cameraHeuristics';
import { openCorpusDb, estimateStorage, type CorpusDb, type FrameTag } from '../corpus/corpusDb';
import {
  buildRunArchive,
  collectorAvailable,
  downloadOnly,
  HARNESS_VERSION,
  shareOrDownload,
  uploadToCollector,
  type ArchiveResult,
  type ShareOutcome,
} from '../corpus/corpusExport';
import { collectClientHints, collectDeviceMeta } from '../device/deviceInfo';
import { availableTransferPaths, FrameLoop } from '../loop/frameLoop';
import { SCENES } from '../scenes';
import { eventsFromEvidence, ticksFromRecords } from '../stats/evidenceAdapter';
import { SampleBuffer } from '../stats/percentiles';
import {
  buildReport,
  type BaselineReport,
  type DecodeEvent,
  type FrameTick,
} from '../stats/report';
import type {
  CameraControls,
  CameraOption,
  DeliveredVideo,
  FrameEvidence,
  FrameTickRecord,
  FrameTransferPath,
  Quad,
  RequestedVideo,
  SceneDefinition,
  SceneRunSummary,
  SessionRecord,
} from '../types';
import { DecodeClient } from '../worker/decodeClient';

export const RESUME_KEY = 'scan-lab-baseline:resume';
export const DEFAULT_REQUEST: RequestedVideo = {
  width: 1920,
  height: 1080,
  frameRate: 30,
  facingMode: 'environment',
};

export interface ResumeInfo {
  sessionId: string;
  modelLabel: string;
  declaredCode: string | null;
  sceneIndex: number;
  completed: Record<string, number>;
  skipped: string[];
}

export interface SceneLive {
  sceneId: string;
  attempt: number;
  elapsedMs: number;
  remainingMs: number;
  callbacks: number;
  processed: number;
  dropped: number;
  fpsNow: number;
  lastValue: string | null;
  lastValueValid: boolean;
  streak: number;
  firstDecodeMs: number | null;
  firstCandidateMs: number | null;
  candidates: Quad[];
  frameWidth: number;
  frameHeight: number;
  roundTripP50: number;
  localizeP50: number;
  cheapP50: number;
  harderP50: number;
  roiP50: number;
  rectifiedP50: number;
  decodedValues: Record<string, number>;
  wrongValues: string[];
}

export interface HarnessSnapshot {
  version: number;
  sessionId: string | null;
  cameraBusy: boolean;
  delivered: DeliveredVideo | null;
  cameras: CameraOption[];
  selectedCamera: CameraOption | null;
  ultrawideSuspicion: { suspicious: boolean; reason: string | null } | null;
  controls: CameraControls | null;
  worker: SessionRecord['worker'];
  transferPath: FrameTransferPath;
  availablePaths: FrameTransferPath[];
  maxDecodeWidth: number;
  torchOn: boolean;
  live: SceneLive | null;
  lastScene: SceneRunSummary | null;
  scenes: SceneRunSummary[];
  storage: { usage: number | null; quota: number | null } | null;
  report: BaselineReport | null;
  archive: ArchiveResult | null;
  archiveBusy: boolean;
  /** Mac-side collector reachable on this origin (tunnel only). */
  collector: boolean;
  error: string | null;
}

type Listener = () => void;

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sceneKeyFor(sceneId: string, attempt: number): string {
  return attempt <= 1 ? sceneId : `${sceneId}#${attempt}`;
}

function bestText(e: FrameEvidence): { text: string; valid: boolean } | null {
  for (const d of e.decodes) {
    const hit = d.results.find((r) => r.checksumValid);
    if (hit) return { text: hit.text, valid: true };
  }
  for (const d of e.decodes) {
    const any = d.results.find((r) => r.text.length > 0);
    if (any) return { text: any.text, valid: false };
  }
  return null;
}

export class HarnessController {
  private listeners = new Set<Listener>();
  private snap: HarnessSnapshot = {
    version: 0,
    sessionId: null,
    cameraBusy: false,
    delivered: null,
    cameras: [],
    selectedCamera: null,
    ultrawideSuspicion: null,
    controls: null,
    worker: null,
    transferPath: 'rgba_buffer',
    availablePaths: ['rgba_buffer'],
    maxDecodeWidth: 0,
    torchOn: false,
    live: null,
    lastScene: null,
    scenes: [],
    storage: null,
    report: null,
    archive: null,
    archiveBusy: false,
    collector: false,
    error: null,
  };
  private db: CorpusDb | null = null;
  private run: SessionRecord | null = null;
  readonly camera = new CameraSession();
  private client: DecodeClient | null = null;
  private loop: FrameLoop | null = null;
  private video: HTMLVideoElement | null = null;
  private declaredCode: string | null = null;
  private stopEnded: (() => void) | null = null;
  // per-scene recording state
  private rec: {
    scene: SceneDefinition;
    attempt: number;
    key: string;
    t0: number;
    startedAt: string;
    evidence: FrameEvidence[];
    pending: FrameEvidence[];
    ticks: FrameTickRecord[];
    frameCount: number;
    framesStored: number;
    lastIntervalFrameAt: number;
    firstCandidateMs: number | null;
    firstDecodeMs: number | null;
    decodedValues: Record<string, number>;
    wrongValues: string[];
    lastValue: string | null;
    lastValid: boolean;
    streak: number;
    localize: SampleBuffer;
    full: SampleBuffer;
    roi: SampleBuffer;
    rectified: SampleBuffer;
    transfer: SampleBuffer;
    roundTrip: SampleBuffer;
    cheap: SampleBuffer;
    harder: SampleBuffer;
    candidateFrames: number;
    candidatesWithoutDecode: number;
    timer: ReturnType<typeof setTimeout> | null;
    flushTimer: ReturnType<typeof setInterval> | null;
    hudTimer: ReturnType<typeof setInterval> | null;
    onDone: ((summary: SceneRunSummary) => void) | null;
  } | null = null;
  private snapshotCanvas: HTMLCanvasElement | null = null;

  // ---- store plumbing -------------------------------------------------------------------------
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): HarnessSnapshot => this.snap;
  private publish(patch: Partial<HarnessSnapshot>): void {
    this.snap = { ...this.snap, ...patch, version: this.snap.version + 1 };
    for (const l of this.listeners) l();
  }
  private fail(error: unknown, fallbackPl: string): void {
    const messagePl =
      error && typeof error === 'object' && 'messagePl' in error
        ? String((error as { messagePl: unknown }).messagePl)
        : fallbackPl;
    this.publish({ error: messagePl });
  }
  clearError(): void {
    this.publish({ error: null });
  }

  // ---- session --------------------------------------------------------------------------------
  static readResume(
    storage: Storage | null = typeof localStorage === 'undefined' ? null : localStorage,
  ): ResumeInfo | null {
    try {
      const raw = storage?.getItem(RESUME_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ResumeInfo;
      return parsed && typeof parsed.sessionId === 'string' ? parsed : null;
    } catch {
      return null;
    }
  }
  static clearResume(
    storage: Storage | null = typeof localStorage === 'undefined' ? null : localStorage,
  ): void {
    try {
      storage?.removeItem(RESUME_KEY);
    } catch {
      /* ignore */
    }
  }
  saveResume(info: Omit<ResumeInfo, 'sessionId' | 'modelLabel' | 'declaredCode'>): void {
    if (!this.run) return;
    try {
      const payload: ResumeInfo = {
        sessionId: this.run.sessionId,
        modelLabel: this.run.device.modelLabel,
        declaredCode: this.declaredCode,
        ...info,
      };
      localStorage.setItem(RESUME_KEY, JSON.stringify(payload));
    } catch {
      /* private mode */
    }
  }

  async startSession(
    modelLabel: string,
    declaredCode: string | null,
    resumeSessionId?: string,
  ): Promise<void> {
    this.declaredCode = declaredCode;
    try {
      this.db ??= await openCorpusDb();
      const now = () => new Date().toISOString();
      if (resumeSessionId) {
        const existing = await this.db.getRun(resumeSessionId);
        if (existing) {
          this.run = existing;
          const scenes = await this.db.getSceneResults(existing.sessionId);
          this.publish({ sessionId: existing.sessionId, scenes });
          void this.refreshStorage();
          return;
        }
      }
      const device = collectDeviceMeta(modelLabel, navigator, window, now);
      device.clientHints = await collectClientHints(navigator);
      const run: SessionRecord = {
        sessionId: newSessionId(),
        createdAt: now(),
        device,
        camera: { selected: null, options: [], requested: DEFAULT_REQUEST, delivered: null },
        controls: null,
        loop: null,
        transfer: null,
        worker: null,
        scenes: [],
        harnessVersion: HARNESS_VERSION,
      };
      await this.db.createRun(run);
      this.run = run;
      this.publish({ sessionId: run.sessionId, scenes: [] });
      void this.refreshStorage();
    } catch (error) {
      this.fail(error, 'Nie udało się przygotować pamięci lokalnej.');
      throw error;
    }
  }

  /** Completed or abandoned sessions still stored on this phone (newest first). */
  async listPreviousRuns(): Promise<
    Array<{ sessionId: string; modelLabel: string; createdAt: string; scenes: number }>
  > {
    try {
      this.db ??= await openCorpusDb();
      const runs = await this.db.listRuns();
      const out: Array<{
        sessionId: string;
        modelLabel: string;
        createdAt: string;
        scenes: number;
      }> = [];
      for (const run of runs) {
        const scenes = await this.db.getSceneResults(run.sessionId);
        out.push({
          sessionId: run.sessionId,
          modelLabel: run.device.modelLabel,
          createdAt: run.createdAt,
          scenes: scenes.length,
        });
      }
      return out;
    } catch {
      return [];
    }
  }

  /** Re-opens a stored session so its summary can be exported or sent again. */
  async openPreviousRun(sessionId: string): Promise<boolean> {
    try {
      this.db ??= await openCorpusDb();
      const existing = await this.db.getRun(sessionId);
      if (!existing) return false;
      this.run = existing;
      this.declaredCode = existing.scenes[0]?.declaredCode ?? null;
      const scenes = await this.db.getSceneResults(existing.sessionId);
      this.publish({
        sessionId: existing.sessionId,
        scenes,
        report: null,
        archive: null,
        error: null,
      });
      void this.refreshStorage();
      return true;
    } catch (error) {
      this.fail(error, 'Nie udało się otworzyć zapisanej sesji.');
      return false;
    }
  }

  async refreshStorage(): Promise<void> {
    try {
      const e = await estimateStorage();
      this.publish({
        storage: e ? { usage: e.usageBytes ?? null, quota: e.quotaBytes ?? null } : null,
      });
    } catch {
      /* ignore */
    }
  }

  // ---- camera ---------------------------------------------------------------------------------
  attachVideo(video: HTMLVideoElement): void {
    this.video = video;
  }

  async openCamera(deviceId?: string): Promise<void> {
    const video = this.video;
    if (!video) throw new Error('video element not attached');
    this.publish({ cameraBusy: true, error: null });
    let requested: RequestedVideo = deviceId ? { ...DEFAULT_REQUEST, deviceId } : DEFAULT_REQUEST;
    try {
      this.stopEnded?.();
      let delivered = await this.camera.open(video, requested);
      const cameras = await this.camera.listCameras();
      let autoSwitchedFrom: DeliveredVideo | null = null;
      // Note10+ evidence 2026-09-04: `facingMode: environment` handed out the fixed-focus ultra-wide ("camera 2")
      // while the ranked primary ("camera 0") sat unused. When the tester made no explicit choice, re-open once
      // on the ranked primary back camera and keep the first delivery on record.
      const primary = cameras.find((c) => c.facing === 'environment');
      if (!deviceId && primary && primary.deviceId && primary.label !== delivered.label) {
        const first = delivered;
        try {
          requested = { ...DEFAULT_REQUEST, deviceId: primary.deviceId };
          delivered = await this.camera.open(video, requested);
          autoSwitchedFrom = first;
        } catch {
          // keep the first stream if the primary refuses to open
          requested = DEFAULT_REQUEST;
          delivered = await this.camera.open(video, requested);
        }
      }
      const label = delivered.label;
      const selected =
        cameras.find((c) => c.label === label) ??
        (requested.deviceId
          ? (cameras.find((c) => c.deviceId === requested.deviceId) ?? null)
          : null);
      const ultrawideSuspicion = ultrawideSuspicionFromSettings(
        delivered.settings,
        selected,
        delivered.capabilities,
      );
      this.stopEnded = this.camera.onEnded(() =>
        this.publish({
          error: 'Aparat został zatrzymany (aplikacja była w tle). Włącz go ponownie.',
        }),
      );
      if (this.run) {
        // never persist deviceIds
        const stripped = cameras.map((c) => ({ ...c, deviceId: '' }));
        this.run.camera = {
          selected: selected ? { ...selected, deviceId: '' } : null,
          options: stripped,
          requested: { ...requested, deviceId: requested.deviceId ? '(chosen)' : undefined },
          delivered,
          autoSwitchedFrom,
        };
        await this.db?.updateRun(this.run.sessionId, { camera: this.run.camera });
      }
      this.publish({
        cameraBusy: false,
        delivered,
        cameras,
        selectedCamera: selected,
        ultrawideSuspicion,
        torchOn: false,
      });
    } catch (error) {
      this.publish({ cameraBusy: false });
      this.fail(error, describeCameraError(error).messagePl);
      throw error;
    }
  }

  async probe(): Promise<void> {
    try {
      const controls = await this.camera.probeControls();
      if (!this.client) {
        this.client = new DecodeClient({
          plan: { maxDecodeWidth: 0 },
          onResult: (evidence) => this.onEvidence(evidence),
          onError: (message) => this.publish({ error: `Błąd dekodera: ${message}` }),
        });
        const ready = await this.client.start();
        const worker = {
          warmupMs: ready.warmupMs,
          zxingVersion: ready.zxingVersion,
          offscreenCanvas: ready.offscreenCanvas,
        };
        const availablePaths = availableTransferPaths(ready.offscreenCanvas);
        this.publish({ worker, availablePaths });
        if (this.run) {
          this.run.worker = worker;
          await this.db?.updateRun(this.run.sessionId, { worker });
        }
      }
      if (this.run) {
        this.run.controls = controls;
        await this.db?.updateRun(this.run.sessionId, { controls });
      }
      this.publish({ controls });
    } catch (error) {
      this.fail(error, 'Nie udało się sprawdzić sterowania aparatem.');
      throw error;
    }
  }

  async setTorch(on: boolean): Promise<void> {
    const ok = await this.camera.setTorch(on);
    this.publish({ torchOn: ok ? on : false });
  }

  setTransferPath(path: FrameTransferPath): void {
    if (this.snap.availablePaths.includes(path)) this.publish({ transferPath: path });
  }

  setMaxDecodeWidth(width: number): void {
    this.publish({ maxDecodeWidth: width });
  }

  // ---- scenes ---------------------------------------------------------------------------------
  startScene(
    scene: SceneDefinition,
    attempt: number,
    onDone: (summary: SceneRunSummary) => void,
  ): void {
    const video = this.video;
    const client = this.client;
    if (!video || !client || !this.run) {
      this.publish({ error: 'Aparat lub dekoder nie jest gotowy.' });
      return;
    }
    if (this.rec) this.finishScene();
    const t0 = performance.now();
    const key = sceneKeyFor(scene.id, attempt);
    this.rec = {
      scene,
      attempt,
      key,
      t0,
      startedAt: new Date().toISOString(),
      evidence: [],
      pending: [],
      ticks: [],
      frameCount: 0,
      framesStored: 0,
      lastIntervalFrameAt: -Infinity,
      firstCandidateMs: null,
      firstDecodeMs: null,
      decodedValues: {},
      wrongValues: [],
      lastValue: null,
      lastValid: false,
      streak: 0,
      localize: new SampleBuffer(4096),
      full: new SampleBuffer(4096),
      roi: new SampleBuffer(4096),
      rectified: new SampleBuffer(4096),
      transfer: new SampleBuffer(4096),
      roundTrip: new SampleBuffer(4096),
      cheap: new SampleBuffer(4096),
      harder: new SampleBuffer(4096),
      candidateFrames: 0,
      candidatesWithoutDecode: 0,
      timer: null,
      flushTimer: null,
      hudTimer: null,
      onDone,
    };
    client.resetStats();
    this.loop = new FrameLoop({
      video,
      client,
      path: this.snap.transferPath,
      analysisLongEdge: this.snap.maxDecodeWidth,
      onTick: (tick) => {
        const rec = this.rec;
        if (!rec) return;
        rec.ticks.push({
          tMs: tick.tMs,
          processed: tick.processed,
          captureToLumaMs: tick.captureToLumaMs ?? null,
        });
      },
    });
    this.loop.start();
    const rec = this.rec;
    rec.timer = setTimeout(() => this.finishScene(), scene.durationMs);
    rec.flushTimer = setInterval(() => void this.flushPending(), 500);
    rec.hudTimer = setInterval(() => this.publishLive(), 250);
    this.publishLive();
  }

  private onEvidence(evidence: FrameEvidence): void {
    const rec = this.rec;
    if (!rec) return;
    this.loop?.noteEvidence(evidence);
    rec.evidence.push(evidence);
    rec.pending.push(evidence);
    rec.frameCount += 1;
    const tMs = evidence.tCapture - rec.t0;
    if (evidence.transfer) rec.transfer.push(evidence.transfer.mainToWorkerMs);
    if (typeof evidence.roundTripMs === 'number') rec.roundTrip.push(evidence.roundTripMs);
    if (evidence.saliency) rec.localize.push(evidence.saliency.durationMs);
    const hasCandidate = (evidence.saliency?.candidates.length ?? 0) > 0;
    if (hasCandidate) {
      rec.candidateFrames += 1;
      if (rec.firstCandidateMs === null) rec.firstCandidateMs = tMs;
    }
    let validThisFrame = false;
    for (const d of evidence.decodes) {
      if (d.variant === 'full_cheap') {
        rec.full.push(d.durationMs);
        rec.cheap.push(d.durationMs);
      } else if (d.variant === 'full_harder') {
        rec.full.push(d.durationMs);
        rec.harder.push(d.durationMs);
      } else if (d.variant === 'roi_cheap' || d.variant === 'roi_harder')
        rec.roi.push(d.durationMs);
      else if (d.variant === 'rectified_cheap') rec.rectified.push(d.durationMs);
      for (const r of d.results) {
        if (!r.checksumValid) continue;
        validThisFrame = true;
        rec.decodedValues[r.text] = (rec.decodedValues[r.text] ?? 0) + 1;
        if (
          this.declaredCode &&
          r.text !== this.declaredCode &&
          !rec.wrongValues.includes(r.text)
        ) {
          rec.wrongValues.push(r.text);
          void this.storeFrame('wrong_value', evidence.frameIndex, evidence);
        }
      }
    }
    if (hasCandidate && !validThisFrame) rec.candidatesWithoutDecode += 1;
    const best = bestText(evidence);
    if (best) {
      if (best.valid && rec.lastValid && rec.lastValue === best.text) rec.streak += 1;
      else rec.streak = best.valid ? 1 : 0;
      rec.lastValue = best.text;
      rec.lastValid = best.valid;
    }
    if (validThisFrame && rec.firstDecodeMs === null) {
      rec.firstDecodeMs = tMs;
      void this.storeFrame('first_decode', evidence.frameIndex, evidence);
    }
    if (hasCandidate && rec.candidateFrames === 1)
      void this.storeFrame('first_candidate', evidence.frameIndex, evidence);
    if (tMs - rec.lastIntervalFrameAt >= 3000 && rec.framesStored < 8) {
      rec.lastIntervalFrameAt = tMs;
      void this.storeFrame('interval', evidence.frameIndex, evidence);
    }
  }

  private async storeFrame(
    tag: FrameTag,
    frameIndex: number,
    evidence: FrameEvidence,
  ): Promise<void> {
    const rec = this.rec;
    const video = this.video;
    const db = this.db;
    const run = this.run;
    if (!rec || !video || !db || !run || rec.framesStored >= 10) return;
    rec.framesStored += 1;
    try {
      const canvas = (this.snapshotCanvas ??= document.createElement('canvas'));
      const w = Math.min(1280, video.videoWidth || evidence.width);
      const h = Math.round(
        (w * (video.videoHeight || evidence.height)) / (video.videoWidth || evidence.width),
      );
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.8),
      );
      if (!blob) return;
      await db.putFrame(run.sessionId, rec.key, frameIndex, blob, {
        tCapture: evidence.tCapture - rec.t0,
        width: w,
        height: h,
        mime: 'image/jpeg',
        tag,
        quality: evidence.quality,
      });
    } catch (error) {
      this.fail(error, 'Nie udało się zapisać klatki.');
    }
  }

  private async flushPending(): Promise<void> {
    const rec = this.rec;
    const db = this.db;
    const run = this.run;
    if (!rec || !db || !run || rec.pending.length === 0) return;
    const batch = rec.pending.splice(0, rec.pending.length);
    try {
      await db.appendEvents(run.sessionId, rec.key, batch);
    } catch (error) {
      this.fail(error, 'Nie udało się zapisać danych klatek.');
    }
  }

  private publishLive(): void {
    const rec = this.rec;
    if (!rec) {
      this.publish({ live: null });
      return;
    }
    const elapsedMs = performance.now() - rec.t0;
    const last = rec.evidence[rec.evidence.length - 1];
    const stats = this.loop?.stop ? null : null; // loop stats are read at finish; live counts below
    void stats;
    const ticks = rec.ticks;
    const recent = ticks.filter((t) => t.tMs > elapsedMs - 1000).length;
    const processed = ticks.filter((t) => t.processed).length;
    this.publish({
      live: {
        sceneId: rec.scene.id,
        attempt: rec.attempt,
        elapsedMs,
        remainingMs: Math.max(0, rec.scene.durationMs - elapsedMs),
        callbacks: ticks.length,
        processed,
        dropped: ticks.length - processed,
        fpsNow: recent,
        lastValue: rec.lastValue,
        lastValueValid: rec.lastValid,
        streak: rec.streak,
        firstDecodeMs: rec.firstDecodeMs,
        firstCandidateMs: rec.firstCandidateMs,
        candidates: last?.saliency?.candidates.map((c) => c.quad) ?? [],
        frameWidth: last?.width ?? 0,
        frameHeight: last?.height ?? 0,
        roundTripP50: rec.roundTrip.snapshot().p50,
        localizeP50: rec.localize.snapshot().p50,
        cheapP50: rec.cheap.snapshot().p50,
        harderP50: rec.harder.snapshot().p50,
        roiP50: rec.roi.snapshot().p50,
        rectifiedP50: rec.rectified.snapshot().p50,
        decodedValues: { ...rec.decodedValues },
        wrongValues: [...rec.wrongValues],
      },
    });
  }

  finishScene(): void {
    const rec = this.rec;
    if (!rec) return;
    if (rec.timer) clearTimeout(rec.timer);
    if (rec.flushTimer) clearInterval(rec.flushTimer);
    if (rec.hudTimer) clearInterval(rec.hudTimer);
    const loopStats = this.loop?.stop() ?? null;
    this.loop = null;
    const durationMs = performance.now() - rec.t0;
    const summary: SceneRunSummary = {
      sceneId: rec.scene.id,
      attempt: rec.attempt,
      startedAt: rec.startedAt,
      t0: rec.t0,
      durationMs,
      framesProcessed: rec.frameCount,
      framesStored: rec.framesStored,
      firstCandidateMs: rec.firstCandidateMs,
      firstDecodeMs: rec.firstDecodeMs,
      decodedValues: { ...rec.decodedValues },
      wrongValues: [...rec.wrongValues],
      candidateCount: rec.candidateFrames,
      candidatesWithoutDecode: rec.candidatesWithoutDecode,
      localizeMs: rec.localize.snapshot(),
      decodeFullMs: rec.full.snapshot(),
      decodeRoiMs: rec.roi.snapshot(),
      decodeRectifiedMs: rec.rectified.snapshot(),
      transferMs: rec.transfer.snapshot(),
      declaredCode: this.declaredCode,
      notes: loopStats
        ? `loop=${loopStats.source} presented=${loopStats.framesPresented} dropped=${loopStats.framesDroppedDecode} cadence_p50=${loopStats.cadenceMs.p50.toFixed(1)}ms`
        : '',
      frameTicks: rec.ticks,
      transferPath: this.snap.transferPath,
    };
    this.rec = null;
    const finalize = async () => {
      try {
        // flush remaining events synchronously-ordered before the summary
        const db = this.db;
        const run = this.run;
        if (db && run) {
          if (rec.pending.length)
            await db.appendEvents(run.sessionId, rec.key, rec.pending.splice(0));
          await db.putSceneResult(run.sessionId, summary);
          run.scenes = [...run.scenes.filter((s) => s.sceneId !== summary.sceneId), summary];
          if (loopStats) run.loop = loopStats;
          run.transfer = this.client?.stats() ?? run.transfer;
          await db.updateRun(run.sessionId, {
            scenes: run.scenes,
            loop: run.loop,
            transfer: run.transfer,
          });
          this.publish({ scenes: run.scenes, lastScene: summary, live: null });
          void this.refreshStorage();
        }
      } catch (error) {
        this.fail(error, 'Nie udało się zapisać sceny.');
      }
      rec.onDone?.(summary);
    };
    void finalize();
  }

  // ---- summary --------------------------------------------------------------------------------
  async buildReport(): Promise<BaselineReport | null> {
    const db = this.db;
    const run = this.run;
    if (!db || !run) return null;
    const scenes = await db.getSceneResults(run.sessionId);
    const eventsByScene: Record<string, DecodeEvent[]> = {};
    const ticksByScene: Record<string, FrameTick[]> = {};
    for (const scene of scenes) {
      const evidence: FrameEvidence[] = [];
      await db.iterateEvents(run.sessionId, sceneKeyFor(scene.sceneId, scene.attempt), (e) => {
        evidence.push(e);
      });
      const key = `${scene.sceneId}:${scene.attempt}`;
      eventsByScene[key] = eventsFromEvidence(evidence, scene.t0);
      const ticks = ticksFromRecords(scene.frameTicks);
      if (ticks) ticksByScene[key] = ticks;
    }
    const report = buildReport({
      run: { ...run, scenes },
      scenes,
      eventsByScene,
      ticksByScene,
      generatedAt: new Date().toISOString(),
    });
    this.publish({ report, scenes });
    return report;
  }

  async prepareArchive(): Promise<ArchiveResult | null> {
    const db = this.db;
    const run = this.run;
    if (!db || !run) return null;
    this.publish({ archiveBusy: true });
    try {
      const report = this.snap.report ?? (await this.buildReport());
      const archive = await buildRunArchive(db, run.sessionId, report, new Date().toISOString());
      this.publish({ archive, archiveBusy: false });
      return archive;
    } catch (error) {
      this.publish({ archiveBusy: false });
      this.fail(error, 'Nie udało się przygotować archiwum.');
      return null;
    }
  }

  async probeCollector(): Promise<boolean> {
    const collector = await collectorAvailable();
    this.publish({ collector });
    return collector;
  }

  download(): ShareOutcome {
    const archive = this.snap.archive;
    if (!archive) return 'unsupported';
    return downloadOnly(archive.blob, archive.fileName);
  }

  /** Explicit tester action; never called automatically. */
  async sendToCollector(): Promise<{ ok: boolean; bytes: number; error?: string }> {
    const archive = this.snap.archive;
    if (!archive) return { ok: false, bytes: 0, error: 'no archive' };
    return uploadToCollector(archive.blob, archive.fileName);
  }

  /** Must run synchronously inside the tap handler — no awaits before the share call. */
  share(): Promise<ShareOutcome> {
    const archive = this.snap.archive;
    if (!archive) return Promise.resolve('unsupported');
    return shareOrDownload(archive.blob, archive.fileName);
  }

  async deleteSession(): Promise<void> {
    const db = this.db;
    const run = this.run;
    if (!db || !run) return;
    try {
      await db.deleteRun(run.sessionId);
      HarnessController.clearResume();
      this.publish({ archive: null, report: null, scenes: [] });
      void this.refreshStorage();
    } catch (error) {
      this.fail(error, 'Nie udało się usunąć danych.');
    }
  }

  get sceneList(): readonly SceneDefinition[] {
    return SCENES;
  }

  dispose(): void {
    if (this.rec) this.finishScene();
    this.stopEnded?.();
    this.client?.stop();
    this.client = null;
    this.camera.stop();
    this.db?.close();
    this.db = null;
  }
}
