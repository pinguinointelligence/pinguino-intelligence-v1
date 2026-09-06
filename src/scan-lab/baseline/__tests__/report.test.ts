import { describe, expect, it } from 'vitest';
import { buildReport, firstConfirmation, summarizeScene, type DecodeEvent } from '../stats/report';
import type { SceneDefinition, SceneRunSummary, SessionRecord } from '../types';
import { percentiles } from '../stats/percentiles';

const P = percentiles([]);
const scene = (id: string, over: Partial<SceneRunSummary> = {}): SceneRunSummary => ({
  sceneId: id === 'bar' ? 'ean-25cm' : id,
  attempt: 1,
  startedAt: '2026-09-04T10:00:00.000Z',
  t0: 0,
  durationMs: 8000,
  framesProcessed: 10,
  framesStored: 2,
  firstCandidateMs: null,
  firstDecodeMs: null,
  decodedValues: {},
  wrongValues: [],
  candidateCount: 0,
  candidatesWithoutDecode: 0,
  localizeMs: P,
  decodeFullMs: P,
  decodeRoiMs: P,
  decodeRectifiedMs: P,
  transferMs: P,
  declaredCode: null,
  notes: '',
  ...over,
});
const ev = (
  tMs: number,
  frameIndex: number,
  text: string | null,
  valid = text !== null,
  variant: DecodeEvent['variant'] = 'full_cheap',
): DecodeEvent => ({
  tMs,
  frameIndex,
  variant,
  roundTripMs: 40,
  decodeMs: 12,
  text,
  checksumValid: valid,
});
const defs = new Map<string, SceneDefinition>([
  [
    'bar',
    {
      id: 'bar',
      kind: 'barcode',
      title: 'Kod',
      instruction: '',
      durationMs: 8000,
      expectsCode: true,
    },
  ],
  [
    'obj',
    {
      id: 'obj',
      kind: 'object',
      title: 'Banan',
      instruction: '',
      durationMs: 8000,
      expectsCode: false,
    },
  ],
]);
const run: SessionRecord = {
  sessionId: 's1',
  createdAt: '2026-09-04T10:00:00.000Z',
  device: {
    modelLabel: 'iPhone 15 Pro Max',
    os: 'iOS 26.6.1',
    browser: 'Safari 26.6',
    executionMode: 'safari_tab',
    formFactor: 'mobile',
    userAgent: 'ua',
    screen: { width: 430, height: 932, dpr: 3 },
    hardwareConcurrency: 6,
    deviceMemoryGb: null,
    capturedAt: '2026-09-04T10:00:00.000Z',
  },
  camera: {
    selected: null,
    options: [],
    requested: { width: 1920, height: 1080, frameRate: 30 },
    delivered: null,
  },
  controls: null,
  loop: null,
  transfer: null,
  worker: null,
  scenes: [],
  harnessVersion: 'test',
};

describe('firstConfirmation (two consecutive agreeing hits from different frames)', () => {
  it('A, B, A does not confirm; A, A confirms at the second A', () => {
    expect(firstConfirmation([ev(100, 1, 'A'), ev(200, 2, 'B'), ev(300, 3, 'A')])).toBeNull();
    expect(firstConfirmation([ev(100, 1, 'A'), ev(200, 2, 'A')])).toEqual({ text: 'A', tMs: 200 });
  });
  it('two variants reading the same frame never confirm alone', () => {
    expect(firstConfirmation([ev(100, 1, 'A'), ev(100, 1, 'A', true, 'roi_cheap')])).toBeNull();
  });
  it('frames without a read do not break the pair, checksum-invalid reads are ignored', () => {
    expect(
      firstConfirmation([
        ev(100, 1, 'A'),
        ev(150, 2, null),
        ev(180, 3, 'A', false),
        ev(200, 4, 'A'),
      ]),
    ).toEqual({ text: 'A', tMs: 200 });
  });
});

describe('summarizeScene verdicts', () => {
  const def = defs.get('ean-25cm');
  it('NO_DECODE without hits', () => {
    expect(summarizeScene(scene('bar'), [ev(1, 1, null)], undefined, def).verdict).toBe(
      'NO_DECODE',
    );
  });
  it('DECODED_UNCONFIRMED with a single hit', () => {
    const s = summarizeScene(scene('bar'), [ev(50, 1, '5901234123457')], undefined, def);
    expect(s.verdict).toBe('DECODED_UNCONFIRMED');
    expect(s.firstHitMs).toBe(50);
    expect(s.firstConfirmedMs).toBeNull();
  });
  it('DECODED_CONFIRMED and correct rate against the declared code', () => {
    const s = summarizeScene(
      scene('bar', { declaredCode: '5901 234 123457' }),
      [ev(50, 1, '5901234123457'), ev(90, 2, '5901234123457'), ev(130, 3, '1234567890128')],
      undefined,
      def,
    );
    expect(s.verdict).toBe('DECODED_CONFIRMED');
    expect(s.firstConfirmedMs).toBe(90);
    expect(s.correctRate).toBeCloseTo(2 / 3);
    expect(s.misreadCount).toBe(1);
    expect(s.decodedTexts).toEqual({ '5901234123457': 2, '1234567890128': 1 });
  });
  it('MISREAD when the confirmed value differs from the declared code', () => {
    const s = summarizeScene(
      scene('bar', { declaredCode: '5901234123457' }),
      [ev(50, 1, '1234567890128'), ev(90, 2, '1234567890128')],
      undefined,
      def,
    );
    expect(s.verdict).toBe('MISREAD');
  });
  it('MISREAD when every unconfirmed hit is wrong', () => {
    const s = summarizeScene(
      scene('bar', { declaredCode: '5901234123457' }),
      [ev(50, 1, '1234567890128')],
      undefined,
      def,
    );
    expect(s.verdict).toBe('MISREAD');
  });
  it('NOT_APPLICABLE for object scenes even with reads', () => {
    expect(
      summarizeScene(
        scene('obj'),
        [ev(50, 1, '5901234123457'), ev(90, 2, '5901234123457')],
        undefined,
        defs.get('obj'),
      ).verdict,
    ).toBe('NOT_APPLICABLE');
  });
  it('uses ticks for presented/processed/dropped and fps', () => {
    const ticks = Array.from({ length: 30 }, (_, i) => ({
      tMs: i * 33.3,
      processed: i % 3 !== 0,
      captureToLumaMs: 4,
    }));
    const s = summarizeScene(scene('bar'), [], ticks, def);
    expect(s.frames.presented).toBe(30);
    expect(s.frames.processed).toBe(20);
    expect(s.frames.droppedRatio).toBeCloseTo(1 / 3);
    expect(s.fps.p50).toBeCloseTo(30, 0);
    expect(s.captureToLumaMs.p50).toBe(4);
  });
});

describe('buildReport', () => {
  it('aggregates verdict counts and totals with composite scene keys', () => {
    const report = buildReport({
      run,
      scenes: [scene('bar', { attempt: 2, declaredCode: '5901234123457' }), scene('obj')],
      eventsByScene: {
        'ean-25cm:2': [ev(50, 1, '5901234123457'), ev(90, 2, '5901234123457')],
        obj: [],
      },
      generatedAt: '2026-09-04T11:00:00.000Z',
      sceneDefinitions: defs,
    });
    expect(report.generatedAt).toBe('2026-09-04T11:00:00.000Z');
    expect(report.verdictCounts.DECODED_CONFIRMED).toBe(1);
    expect(report.verdictCounts.NOT_APPLICABLE).toBe(1);
    expect(report.totals).toMatchObject({
      scenes: 2,
      barcodeScenes: 1,
      objectScenes: 1,
      hits: 2,
      confirmedScenes: 1,
    });
    expect(report.totals.workerRoundTripMs.count).toBe(2);
  });
});

describe('declared code scope', () => {
  it('ignores the declared code on scenes that prescribe a different product', () => {
    const can = summarizeScene(
      scene('ean-curved-can', { declaredCode: '5901234123457' }),
      [ev(50, 1, '8411092731130'), ev(90, 2, '8411092731130')],
      undefined,
      {
        id: 'ean-curved-can',
        kind: 'barcode',
        title: 'Puszka',
        instruction: '',
        durationMs: 8000,
        expectsCode: true,
      },
    );
    expect(can.verdict).toBe('DECODED_CONFIRMED');
    expect(can.misreadCount).toBe(0);
    expect(can.expectedCode).toBeNull();
  });
});
