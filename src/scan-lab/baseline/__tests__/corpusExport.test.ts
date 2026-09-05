import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CorpusReader, FrameEntry } from '../corpus/corpusDb';
import {
  archiveFileName,
  buildRunArchive,
  compactTimestamp,
  slugify,
} from '../corpus/corpusExport';
import { crc32 } from '../corpus/zip';
import type { FrameEvidence, SceneRunSummary, SessionRecord } from '../types';
import { percentiles } from '../stats/percentiles';
import { readZip } from './zipReader';

const P = percentiles([]);
const run: SessionRecord = {
  sessionId: 's1',
  createdAt: '2026-09-04T10:11:12.345Z',
  device: {
    modelLabel: 'iPhone 15 Pro Max',
    os: 'iOS 26.6.1',
    browser: 'Safari 26.6',
    executionMode: 'standalone_pwa',
    formFactor: 'mobile',
    userAgent: 'ua',
    screen: { width: 430, height: 932, dpr: 3 },
    hardwareConcurrency: 6,
    deviceMemoryGb: null,
    capturedAt: '2026-09-04T10:11:12.345Z',
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
const scene: SceneRunSummary = {
  sceneId: 'ean-12cm',
  attempt: 1,
  startedAt: run.createdAt,
  t0: 0,
  durationMs: 8000,
  framesProcessed: 2,
  framesStored: 1,
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
};
const events: FrameEvidence[] = [
  { frameIndex: 0, tCapture: 10, width: 1280, height: 720, decodes: [] },
  { frameIndex: 1, tCapture: 43, width: 1280, height: 720, decodes: [] },
];
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

const fakeDb: CorpusReader = {
  getRun: async (id) => (id === 's1' ? run : undefined),
  getSceneResults: async () => [scene],
  iterateEvents: async (_run, sceneId, visit) => {
    if (sceneId !== 'ean-12cm') return 0;
    events.forEach((e, i) => visit(e, i));
    return events.length;
  },
  listFrames: async (): Promise<FrameEntry[]> => [
    {
      runId: 's1',
      sceneId: 'ean-12cm',
      frameIndex: 1,
      meta: {
        tCapture: 43,
        width: 1280,
        height: 720,
        mime: 'image/jpeg',
        tag: 'first_decode',
        bytes: 4,
      },
    },
  ],
  getFrameBlob: async () => new Blob([jpeg], { type: 'image/jpeg' }),
};

describe('naming', () => {
  it('slugifies Polish labels and compacts timestamps', () => {
    expect(slugify('Galaxy Note10+ (Łukasz)')).toBe('galaxy-note10-lukasz');
    expect(slugify('')).toBe('device');
    expect(compactTimestamp('2026-09-04T10:11:12.345Z')).toBe('20260904T101112Z');
    expect(archiveFileName('iPhone 15 Pro Max', '2026-09-04T10:11:12.345Z')).toBe(
      'scan-baseline_iphone-15-pro-max_20260904T101112Z.zip',
    );
  });
});

describe('buildRunArchive', () => {
  it('produces a parseable zip with manifest, scenes, ndjson events and frames', async () => {
    const result = await buildRunArchive(
      fakeDb,
      's1',
      { verdictCounts: { NO_DECODE: 1 } },
      '2026-09-04T12:00:00.000Z',
    );
    expect(result.fileName).toBe('scan-baseline_iphone-15-pro-max_20260904T101112Z.zip');
    const entries = readZip(new Uint8Array(await result.blob.arrayBuffer()));
    expect(entries.map((e) => e.name)).toEqual([
      'README.txt',
      'manifest.json',
      'scenes.json',
      'events/ean-12cm.ndjson',
      'frames/ean-12cm/00001_first_decode.jpg',
    ]);
    for (const e of entries) expect(crc32(e.data)).toBe(e.crc);
    const manifest = JSON.parse(new TextDecoder().decode(entries[1]!.data));
    expect(manifest.run.sessionId).toBe('s1');
    expect(manifest.report).toEqual({ verdictCounts: { NO_DECODE: 1 } });
    expect(manifest.exportedAt).toBe('2026-09-04T12:00:00.000Z');
    const ndjson = new TextDecoder()
      .decode(entries[3]!.data)
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(ndjson).toHaveLength(2);
    expect(ndjson[1].frameIndex).toBe(1);
    expect(Array.from(entries[4]!.data)).toEqual(Array.from(jpeg));
    expect(result.entries).toBe(5);
    expect(result.bytes).toBe(result.blob.size);
  });
  it('exports a retried scene under its attempt key', async () => {
    const retried: CorpusReader = {
      ...fakeDb,
      getSceneResults: async () => [{ ...scene, attempt: 2 }],
      iterateEvents: async (_run, sceneId, visit) => {
        if (sceneId !== 'ean-12cm#2') return 0;
        visit(events[0]!, 0);
        return 1;
      },
      listFrames: async (_run, sceneId) =>
        sceneId === 'ean-12cm#2'
          ? [
              {
                runId: 's1',
                sceneId,
                frameIndex: 3,
                meta: {
                  tCapture: 1,
                  width: 1,
                  height: 1,
                  mime: 'image/jpeg',
                  tag: 'interval',
                  bytes: 4,
                },
              },
            ]
          : [],
    };
    const result = await buildRunArchive(retried, 's1', null, '2026-09-04T12:00:00.000Z');
    const names = readZip(new Uint8Array(await result.blob.arrayBuffer())).map((e) => e.name);
    expect(names).toContain('events/ean-12cm#2.ndjson');
    expect(names).toContain('frames/ean-12cm#2/00003_interval.jpg');
  });

  it('rejects an unknown run', async () => {
    await expect(buildRunArchive(fakeDb, 'nope', null, 'x')).rejects.toThrow(/not found/);
  });
});

describe('sample bundle for the Mac-side parser', () => {
  it('writes a sample bundle when SCAN_LAB_SAMPLE_DIR is set (skipped otherwise)', async () => {
    const dir = process.env['SCAN_LAB_SAMPLE_DIR'];
    if (!dir) return;
    const report = {
      scenes: [
        {
          sceneId: 'ean-12cm',
          attempt: 1,
          kind: 'barcode',
          verdict: 'DECODED_CONFIRMED',
          firstHitMs: 120,
          firstConfirmedMs: 160,
          confirmedText: '5901234123457',
          hits: 20,
          decodeAttempts: 24,
          misreadCount: 0,
          fps: { p50: 29.8, p95: 31 },
          cadenceMs: { p50: 33.5 },
          workerRoundTripMs: { p50: 42, p95: 61 },
          variants: [
            { variant: 'full_cheap', attempts: 24, hits: 20, decodeMs: { p50: 21, p95: 30 } },
            { variant: 'roi_cheap', attempts: 20, hits: 18, decodeMs: { p50: 4, p95: 7 } },
          ],
          medianCandidateWidthPx: 310,
          medianAbsAngleDeg: 3,
          frames: { droppedRatio: 0.2 },
        },
        {
          sceneId: 'loop-60s',
          attempt: 1,
          kind: 'object',
          verdict: 'NOT_APPLICABLE',
          firstHitMs: null,
          firstConfirmedMs: null,
          confirmedText: null,
          hits: 0,
          decodeAttempts: 900,
          misreadCount: 0,
          fps: { p50: 28, p95: 30 },
          cadenceMs: { p50: 35 },
          workerRoundTripMs: { p50: 40, p95: 66 },
          variants: [],
          medianCandidateWidthPx: null,
          medianAbsAngleDeg: null,
          frames: { droppedRatio: 0.3 },
        },
      ],
      verdictCounts: {
        DECODED_CONFIRMED: 1,
        DECODED_UNCONFIRMED: 0,
        MISREAD: 0,
        NO_DECODE: 0,
        NOT_APPLICABLE: 1,
      },
      totals: { misreads: 0 },
    };
    const result = await buildRunArchive(fakeDb, 's1', report, '2026-09-04T12:00:00.000Z');
    mkdirSync(dir, { recursive: true });
    const target = join(dir, result.fileName);
    writeFileSync(target, new Uint8Array(await result.blob.arrayBuffer()));
    expect(result.bytes).toBeGreaterThan(0);
  });
});
