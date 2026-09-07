import { describe, expect, it } from 'vitest';
import { eventsFromEvidence, ticksFromRecords } from '../stats/evidenceAdapter';
import type { FrameEvidence } from '../types';

const frame = (over: Partial<FrameEvidence>): FrameEvidence => ({
  frameIndex: 1,
  tCapture: 1100,
  width: 1280,
  height: 720,
  decodes: [],
  ...over,
});

describe('eventsFromEvidence', () => {
  it('emits one event per decode outcome, relative to the scene start, preferring checksum-valid text', () => {
    const e = frame({
      roundTripMs: 55,
      luminanceMs: 3,
      saliency: {
        durationMs: 2,
        downscaledWidth: 320,
        downscaledHeight: 180,
        candidates: [
          {
            quad: {
              points: [
                { x: 100, y: 100 },
                { x: 400, y: 100 },
                { x: 400, y: 200 },
                { x: 100, y: 200 },
              ],
            },
            orientationDeg: 12,
            score: 0.9,
            blockCount: 20,
            moduleEstimatePx: 3,
            fillRatio: 0.25,
          },
        ],
      },
      decodes: [
        {
          variant: 'full_cheap',
          inputWidth: 1280,
          inputHeight: 720,
          durationMs: 20,
          errorResultsWithGeometry: 1,
          results: [
            {
              text: '12',
              format: 'EAN13',
              isValid: false,
              error: 'checksum',
              checksumValid: false,
              lineCount: 0,
              quad: null,
            },
            {
              text: '5901234123457',
              format: 'EAN13',
              isValid: true,
              error: '',
              checksumValid: true,
              lineCount: 3,
              quad: null,
            },
          ],
        },
        {
          variant: 'roi_cheap',
          inputWidth: 300,
          inputHeight: 100,
          durationMs: 4,
          errorResultsWithGeometry: 0,
          results: [],
        },
      ],
    });
    const events = eventsFromEvidence([e], 1000);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      tMs: 100,
      frameIndex: 1,
      variant: 'full_cheap',
      roundTripMs: 55,
      decodeMs: 20,
      captureToLumaMs: 3,
      text: '5901234123457',
      checksumValid: true,
      diagnostics: { candidateWidthPx: 300, angleDeg: 12 },
    });
    expect(events[1]).toMatchObject({ variant: 'roi_cheap', text: null, checksumValid: false });
  });
  it('falls back to transfer + busy time when no round trip was measured', () => {
    const e = frame({
      transfer: { path: 'rgba_buffer', mainToWorkerMs: 5 },
      workerBusyMs: 30,
      decodes: [
        {
          variant: 'full_cheap',
          inputWidth: 1,
          inputHeight: 1,
          durationMs: 1,
          errorResultsWithGeometry: 0,
          results: [],
        },
      ],
    });
    expect(eventsFromEvidence([e], 0)[0]!.roundTripMs).toBe(35);
  });
});

describe('ticksFromRecords', () => {
  it('returns undefined for empty input and normalises nulls', () => {
    expect(ticksFromRecords(undefined)).toBeUndefined();
    expect(ticksFromRecords([])).toBeUndefined();
    expect(ticksFromRecords([{ tMs: 1, processed: true }])).toEqual([
      { tMs: 1, processed: true, captureToLumaMs: null },
    ]);
  });
});
