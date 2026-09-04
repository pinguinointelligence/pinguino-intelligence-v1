/**
 * Corpus export (B17): one ZIP per session, built from Blob parts so frames are never concatenated in
 * memory, handed to the tester through Web Share (files) on the phone or a download link elsewhere.
 * Nothing is uploaded anywhere.
 */
import type { FrameEvidence } from '../types';
import type { CorpusReader } from './corpusDb';
import { buildZip, type ZipEntryInput } from './zip';

export const HARNESS_VERSION = 'scan-lab-baseline/0.1.0';

export function slugify(label: string): string {
  const ascii = label.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L');
  return (
    ascii
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'device'
  );
}

export function compactTimestamp(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function archiveFileName(modelLabel: string, createdAtIso: string): string {
  return `scan-baseline_${slugify(modelLabel)}_${compactTimestamp(createdAtIso)}.zip`;
}

const README_TXT = `SCAN LAB — PHASE 0 BASELINE (PINGÜINO / GELLATTI)

PL: To archiwum zawiera pomiary z testu aparatu i dekodera kodów kreskowych wykonanego na Twoim
telefonie: metadane urządzenia (bez identyfikatorów), ustawienia aparatu, czasy klatek i dekodowania
dla każdej sceny oraz kilka reprezentatywnych klatek z aparatu (opakowania produktów). Nic nie zostało
wysłane automatycznie — przesyłasz ten plik sam(a), np. przez AirDrop, e-mail lub komunikator.

EN: This archive contains the camera/decoder benchmark recorded on your phone: device metadata (no
identifiers), delivered camera settings, per-frame timings and decode results for every scene, and a few
representative camera frames (product packaging). Nothing was uploaded automatically — you share this
file yourself (AirDrop, e-mail, messenger).

Layout:
  manifest.json          session record + generated report
  scenes.json            per-scene summaries
  events/<scene>.ndjson  one JSON object per processed frame (timings, saliency, decode outcomes)
  frames/<scene>/*.jpg   representative frames
`;

export interface ArchiveResult {
  blob: Blob;
  fileName: string;
  entries: number;
  bytes: number;
}

export async function buildRunArchive(
  db: CorpusReader,
  runId: string,
  report: unknown,
  exportedAtIso: string,
): Promise<ArchiveResult> {
  const run = await db.getRun(runId);
  if (!run) throw new Error(`run ${runId} not found`);
  const scenes = await db.getSceneResults(runId);
  const entries: ZipEntryInput[] = [];
  entries.push({ name: 'README.txt', data: README_TXT });
  entries.push({
    name: 'manifest.json',
    data: JSON.stringify(
      { harness: HARNESS_VERSION, exportedAt: exportedAtIso, run, report },
      null,
      2,
    ),
  });
  entries.push({ name: 'scenes.json', data: JSON.stringify(scenes, null, 2) });
  for (const scene of scenes) {
    const key = `${scene.sceneId}`;
    const lines: string[] = [];
    await db.iterateEvents(runId, scene.sceneId, (event: FrameEvidence) => {
      lines.push(JSON.stringify(event));
    });
    if (lines.length > 0)
      entries.push({ name: `events/${key}.ndjson`, data: `${lines.join('\n')}\n` });
    const frames = await db.listFrames(runId, scene.sceneId);
    for (const frame of frames) {
      const blob = await db.getFrameBlob(runId, scene.sceneId, frame.frameIndex);
      if (!blob) continue;
      const ext = frame.meta.mime === 'image/png' ? 'png' : 'jpg';
      const index = String(frame.frameIndex).padStart(5, '0');
      entries.push({ name: `frames/${key}/${index}_${frame.meta.tag}.${ext}`, data: blob });
    }
  }
  const blob = await buildZip(entries);
  return {
    blob,
    fileName: archiveFileName(run.device.modelLabel, run.createdAt),
    entries: entries.length,
    bytes: blob.size,
  };
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'unsupported';

/**
 * Must be called synchronously inside the tester's tap: Web Share with files (iOS Safari, Android Chrome)
 * needs a live user gesture, so the archive Blob has to be built BEFORE the tap.
 */
export function shareOrDownload(
  blob: Blob,
  fileName: string,
  nav: Navigator = navigator,
  doc: Document = document,
): Promise<ShareOutcome> {
  const file =
    typeof File === 'function' ? new File([blob], fileName, { type: 'application/zip' }) : null;
  if (
    file &&
    typeof nav.share === 'function' &&
    typeof nav.canShare === 'function' &&
    nav.canShare({ files: [file] })
  ) {
    return nav
      .share({ files: [file], title: fileName })
      .then((): ShareOutcome => 'shared')
      .catch((error: unknown): ShareOutcome => {
        const name =
          error && typeof error === 'object' && 'name' in error
            ? String((error as { name: unknown }).name)
            : '';
        if (name === 'AbortError') return 'cancelled';
        return triggerDownload(blob, fileName, doc);
      });
  }
  return Promise.resolve(triggerDownload(blob, fileName, doc));
}

function triggerDownload(blob: Blob, fileName: string, doc: Document): ShareOutcome {
  if (typeof URL.createObjectURL !== 'function') return 'unsupported';
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  doc.body.appendChild(a);
  a.click();
  setTimeout(() => {
    doc.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 10_000);
  return 'downloaded';
}
