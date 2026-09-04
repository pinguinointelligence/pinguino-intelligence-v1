/**
 * Scan Core v0 inside the harness worker: engine-driven decodes (per-track ladder) instead of the fixed
 * Phase 0 variant set. Produces the per-frame decision record and observations for the corpus.
 */
import {
  ScanCoreEngine,
  budgetFor,
  type CameraProfile,
  type DecodeRequest,
  type DecodeResultItem,
  type FrameDecisionRecord,
  type ScanObservation,
} from '../../../scan-core';
import type { DecodeOutcome, FrameEvidence, Quad, SaliencyResult } from '../types';
import { downscaleLuminance } from '../vision/luminance';
import { expandQuad, rectifyQuad } from '../vision/rectify';
import { CHEAP_OPTIONS, HARDER_OPTIONS, type ZxingDecoder } from './zxingAdapter';

export interface LaneCamera {
  zoomLevel: number;
  torchOn: boolean;
  refocusAvailable: boolean;
  zoomAvailable: boolean;
  torchAvailable: boolean;
}

export class ScanCoreLane {
  private engine: ScanCoreEngine | null = null;
  private profile: CameraProfile | null = null;
  camera: LaneCamera = {
    zoomLevel: 1,
    torchOn: false,
    refocusAvailable: false,
    zoomAvailable: false,
    torchAvailable: false,
  };
  private medium: Uint8Array | undefined;
  private crop: Uint8Array | undefined;
  private rect: Uint8Array | undefined;
  private busyWindow: Array<{ t: number; ms: number }> = [];

  setProfile(
    profile: CameraProfile,
    hardwareConcurrency: number | null,
    zoomApproved: boolean,
    mediumDecodeMs: number | null,
  ): void {
    this.profile = profile;
    this.camera.zoomAvailable = (profile.zoomMax ?? 1) > 1;
    this.camera.torchAvailable = profile.torch;
    const budget = budgetFor(profile, { mediumDecodeMs, hardwareConcurrency });
    this.engine = new ScanCoreEngine({ profile, budget, zoomApproved });
  }

  get ready(): boolean {
    return this.engine !== null;
  }

  private duty(now: number): number {
    this.busyWindow = this.busyWindow.filter((b) => now - b.t < 2000);
    const busy = this.busyWindow.reduce((a, b) => a + b.ms, 0);
    return Math.min(1, busy / 2000);
  }

  private quadOf(
    req: DecodeRequest,
    track: { cx: number; cy: number; widthPx: number; heightPx: number; angleDeg: number },
  ): Quad {
    const rad = (track.angleDeg * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const vx = -uy;
    const vy = ux;
    const hw = track.widthPx / 2;
    const hh = track.heightPx / 2;
    const p = (a: number, b: number) => ({
      x: track.cx + ux * a + vx * b,
      y: track.cy + uy * a + vy * b,
    });
    void req;
    return { points: [p(-hw, -hh), p(hw, -hh), p(hw, hh), p(-hw, hh)] };
  }

  /**
   * Runs the engine for one frame. Returns the decision record, the decode outcomes (recorded in the corpus
   * under core_* variants) and any observation.
   */
  async process(
    dec: ZxingDecoder,
    luma: Uint8Array,
    width: number,
    height: number,
    frameIndex: number,
    tCapture: number,
    saliency: SaliencyResult | undefined,
    lowPlane: { data: Uint8Array; width: number; height: number; factor: number } | null,
    quality: FrameEvidence['quality'],
  ): Promise<{
    decision: FrameDecisionRecord;
    decodes: DecodeOutcome[];
    observation: ScanObservation | null;
  }> {
    const engine = this.engine;
    if (!engine || !this.profile) throw new Error('scan core lane not initialised');
    const t0 = performance.now();
    const { record, requests } = engine.processFrame({
      frameIndex,
      tMs: tCapture,
      sourceW: width,
      sourceH: height,
      candidates: saliency?.candidates ?? [],
      lowLuma: lowPlane ?? undefined,
      sharpness: quality?.laplacianVar ?? 0,
      meanLuma: quality?.meanLuma ?? 128,
      clippedRatio: quality?.clippedHighRatio ?? 0,
      workerDuty: this.duty(t0),
      zoomLevel: this.camera.zoomLevel,
      torchOn: this.camera.torchOn,
      zoomAvailable: this.camera.zoomAvailable,
      torchAvailable: this.camera.torchAvailable,
      refocusAvailable: this.camera.refocusAvailable,
    });
    const decodes: DecodeOutcome[] = [];
    let observation: ScanObservation | null = null;
    for (const req of requests) {
      let plane = luma;
      let pw = width;
      let ph = height;
      if (req.roi.plane === 'medium') {
        const m = downscaleLuminance(luma, width, height, 2, this.medium);
        this.medium = m.data;
        plane = m.data;
        pw = m.width;
        ph = m.height;
      }
      const opts = req.harder ? HARDER_OPTIONS : CHEAP_OPTIONS;
      let outcome: DecodeOutcome;
      const track = req.trackId
        ? engine.tracker.tracks.find((t) => t.id === req.trackId)
        : undefined;
      if (req.rectify && track) {
        const region = rectifyQuad(
          luma,
          width,
          height,
          expandQuad(this.quadOf(req, track.geometry), 0.15, 0.25),
          this.rect,
        );
        this.rect = region.data;
        outcome = await dec.decodeLuma(
          region.data,
          region.width,
          region.height,
          'core_rectified',
          opts,
        );
        outcome.durationMs += region.durationMs;
        for (const r of outcome.results) r.quad = null;
      } else {
        const x0 = Math.max(0, Math.min(pw - 1, req.roi.x));
        const y0 = Math.max(0, Math.min(ph - 1, req.roi.y));
        const w = Math.max(1, Math.min(pw - x0, req.roi.w));
        const h = Math.max(1, Math.min(ph - y0, req.roi.h));
        if (w * h === pw * ph && x0 === 0 && y0 === 0) {
          outcome = await dec.decodeLuma(
            plane,
            pw,
            ph,
            req.source === 'rescue' ? 'core_rescue' : 'core_medium',
            opts,
          );
        } else {
          const size = w * h;
          const out = this.crop && this.crop.length === size ? this.crop : new Uint8Array(size);
          this.crop = out;
          for (let y = 0; y < h; y += 1)
            out.set(plane.subarray((y0 + y) * pw + x0, (y0 + y) * pw + x0 + w), y * w);
          outcome = await dec.decodeLuma(
            out,
            w,
            h,
            req.source === 'medium' ? 'core_medium' : 'core_native',
            opts,
          );
          const scale = req.roi.plane === 'medium' ? 2 : 1;
          for (const r of outcome.results) {
            if (!r.quad) continue;
            for (const pt of r.quad.points) {
              pt.x = (pt.x + x0) * scale;
              pt.y = (pt.y + y0) * scale;
            }
          }
        }
      }
      decodes.push(outcome);
      const items: DecodeResultItem[] = outcome.results.map((r) => ({
        text: r.text,
        format: r.format,
        checksumValid: r.checksumValid,
        lineCount: r.lineCount,
        error: r.error,
        hasGeometry: r.quad !== null,
      }));
      const obs = engine.ingestDecode({
        trackId: req.trackId,
        frameIndex,
        tMs: tCapture,
        source: req.source,
        items,
      });
      if (obs && !observation) observation = obs;
    }
    this.busyWindow.push({ t: t0, ms: performance.now() - t0 });
    return { decision: record, decodes, observation };
  }
}
