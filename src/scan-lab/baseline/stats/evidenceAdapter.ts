/**
 * Bridges the stored per-frame evidence (FrameEvidence, absolute performance.now() times) to the report
 * generator's scene-relative DecodeEvent / FrameTick inputs.
 */
import type { FrameEvidence, FrameTickRecord, Point } from '../types';
import type { DecodeEvent, FrameTick } from './report';

function edgeLength(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function eventsFromEvidence(evidence: readonly FrameEvidence[], t0: number): DecodeEvent[] {
  const events: DecodeEvent[] = [];
  for (const frame of evidence) {
    const best = frame.saliency?.candidates[0];
    const diagnostics = best
      ? {
          candidateWidthPx: edgeLength(best.quad.points[0], best.quad.points[1]),
          angleDeg: best.orientationDeg,
        }
      : null;
    const roundTripMs =
      frame.roundTripMs ?? (frame.transfer?.mainToWorkerMs ?? 0) + (frame.workerBusyMs ?? 0);
    for (const outcome of frame.decodes) {
      const pick =
        outcome.results.find((r) => r.checksumValid) ??
        outcome.results.find((r) => r.isValid) ??
        outcome.results.find((r) => r.text.length > 0) ??
        null;
      events.push({
        tMs: frame.tCapture - t0,
        frameIndex: frame.frameIndex,
        variant: outcome.variant,
        roundTripMs,
        decodeMs: outcome.durationMs,
        captureToLumaMs: frame.luminanceMs ?? null,
        text: pick ? pick.text : null,
        format: pick ? pick.format : null,
        checksumValid: pick ? pick.checksumValid : false,
        diagnostics,
      });
    }
  }
  return events;
}

export function ticksFromRecords(
  ticks: readonly FrameTickRecord[] | undefined,
): FrameTick[] | undefined {
  if (!ticks || ticks.length === 0) return undefined;
  return ticks.map((t) => ({
    tMs: t.tMs,
    processed: t.processed,
    captureToLumaMs: t.captureToLumaMs ?? null,
  }));
}
