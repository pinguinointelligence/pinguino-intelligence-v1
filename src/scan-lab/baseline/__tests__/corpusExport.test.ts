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
import { readZip } from './zip.test';

const P = percentiles([]);
const run: SessionRecord = {
  sessionId: 's1',
  createdAt: '2026-09-04T10:11:12.345Z',
  device: {
    modelLabel: 'iPhone 15 Pro Max',
    os: 'iOS 26.6.1',
    browser: 'Safari 26.6',
    executionMode: 'standalone_pwa',
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
  it('rejects an unknown run', async () => {
    await expect(buildRunArchive(fakeDb, 'nope', null, 'x')).rejects.toThrow(/not found/);
  });
});
