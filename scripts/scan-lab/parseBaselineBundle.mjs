#!/usr/bin/env node
/**
 * SCAN CORE PHASE 0 — bundle parser (D4/D5).
 * Reads one or more exported corpus bundles (STORE zip from the harness), renders the per-device tables
 * and the Phase 0 GO / NO-GO against the decision package (reports/scan-core-decision-2026-09-03):
 *   go: locate + ROI decode ≤ 40 ms p95, 15 fps loop sustained 60 s at ≤ 60 % of one core (duty-cycle proxy),
 *       corpus ≥ 20 scenes × ≥ 3 s per device. Headline (informational in Phase 0): EAN-13 completion
 *       p50 ≤ 0.7 s / p95 ≤ 2.0 s at 12–30 cm, 0 wrong codes.
 * Usage: node scripts/scan-lab/parseBaselineBundle.mjs <bundle.zip> [...more] [--out reports/scan-core-phase-0/results]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const TARGETS = {
  locateRoiP95Ms: 40,
  sustainedFps: 15,
  dutyCycleMax: 0.6,
  minScenes: 20,
  minSceneSeconds: 3,
  completionP50Ms: 700,
  completionP95Ms: 2000,
};

function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip (no EOCD)');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries = new Map();
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('bad central header');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (method !== 0) throw new Error(`entry ${name} is compressed (method ${method}); expected STORE`);
    const localNameLen = view.getUint16(offset + 26, true);
    const localExtraLen = view.getUint16(offset + 28, true);
    const start = offset + 30 + localNameLen + localExtraLen;
    entries.set(name, bytes.subarray(start, start + size));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

const text = (u8) => new TextDecoder().decode(u8);

/** Scenes that use the tester's main product (the one whose digits were typed). Every other barcode scene
 *  prescribes a different object (can, small bottle, glossy pack, damaged code, small code, two products),
 *  so the declared code must not be compared there. */
const DECLARED_CODE_SCENES = new Set(['ean-12cm', 'ean-18cm', 'ean-25cm', 'ean-30cm', 'ean-approach-40cm', 'ean-enter-edge', 'ean-yaw-30', 'ean-yaw-60', 'ean-partial']);
const isGtinValid = (t) => {
  if (!/^\d{8}$|^\d{12,14}$/.test(t)) return false;
  let sum = 0, w = 3;
  for (let i = t.length - 2; i >= 0; i -= 1) { sum += (t.charCodeAt(i) - 48) * w; w = w === 3 ? 1 : 3; }
  return (10 - (sum % 10)) % 10 === t.charCodeAt(t.length - 1) - 48;
};

/** Re-derives hits, confirmation (two consecutive checksum-valid reads from DIFFERENT frames agreeing) and the
 *  verdict on the Mac, with the declared code scoped to DECLARED_CODE_SCENES. Mirrors stats/report.ts. */
function rescoreScene(sc, events, declared, kind) {
  const expected = DECLARED_CODE_SCENES.has(sc.sceneId) ? declared : null;
  const reads = [];
  for (const e of [...events].sort((a, b) => a.tCapture - b.tCapture || a.frameIndex - b.frameIndex)) {
    for (const d of e.decodes ?? []) {
      const hit = d.results.find((r) => r.checksumValid && isGtinValid(r.text.replace(/\D/g, '')));
      reads.push({ frame: e.frameIndex, tMs: e.tCapture - sc.t0, text: hit ? hit.text.replace(/\D/g, '') : null });
    }
  }
  const hits = reads.filter((r) => r.text);
  const counts = {};
  for (const h of hits) counts[h.text] = (counts[h.text] ?? 0) + 1;
  let prev = null, confirmed = null;
  for (const h of hits) {
    if (prev && prev.text === h.text && prev.frame !== h.frame) { confirmed = { text: h.text, tMs: h.tMs }; break; }
    if (!prev || prev.text !== h.text) prev = h;
  }
  const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const legit = sc.sceneId === 'ean-two-codes' ? 2 : 1;
  const topSet = new Set(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, legit).map(([t]) => t));
  const rawContradicting = hits.filter((h) => !topSet.has(h.text)).length;
  const correct = expected ? hits.filter((h) => h.text === expected).length : null;
  const misread = expected ? hits.length - correct : 0;
  let verdict;
  if (kind === 'object') verdict = 'NOT_APPLICABLE';
  else if (hits.length === 0) verdict = 'NO_DECODE';
  else if (confirmed) verdict = expected && confirmed.text !== expected ? 'MISREAD' : 'DECODED_CONFIRMED';
  else verdict = expected && correct === 0 ? 'MISREAD' : 'DECODED_UNCONFIRMED';
  const confirmedWrong = confirmed && (expected ? confirmed.text !== expected : majority && confirmed.text !== majority && counts[confirmed.text] < counts[majority]);
  return { hits: hits.length, attempts: reads.length, counts, firstHitMs: hits[0]?.tMs ?? null, firstConfirmedMs: confirmed?.tMs ?? null, confirmedText: confirmed?.text ?? null, verdict, misread, rawContradicting, expected, confirmedWrong: Boolean(confirmedWrong) };
}
const ms = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v).toString() : '—');
const ms1 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(1) : '—');
const pct = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v * 100)} %` : '—');
const P = (p) => (p ? `${ms1(p.p50)} / ${ms1(p.p95)}` : '—');

function percentile(values, q) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}

export function analyzeBundle(bytes, fileName) {
  const z = readZip(bytes);
  const manifest = JSON.parse(text(z.get('manifest.json') ?? new Uint8Array()));
  const scenes = JSON.parse(text(z.get('scenes.json') ?? new Uint8Array([91, 93])));
  const run = manifest.run;
  const report = manifest.report;
  const frames = [...z.keys()].filter((k) => k.startsWith('frames/')).length;
  const eventFiles = [...z.keys()].filter((k) => k.startsWith('events/'));
  const eventCounts = Object.fromEntries(eventFiles.map((k) => [k.slice(7, -7), text(z.get(k)).trim().split('\n').filter(Boolean).length]));
  const d = run.device;
  const cam = run.camera?.delivered;
  const loop = run.loop;
  const transfer = run.transfer;
  const controls = run.controls;
  const worker = run.worker;
  const sceneMap = new Map(scenes.map((s) => [`${s.sceneId}:${s.attempt}`, s]));
  const eventsOf = (sceneId, attempt) => {
    const key = attempt > 1 ? `${sceneId}#${attempt}` : sceneId;
    const raw = z.get(`events/${key}.ndjson`);
    if (!raw) return [];
    return text(raw).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  };
  const declaredRaw = scenes.find((sc) => sc.declaredCode)?.declaredCode ?? null;
  const declared = declaredRaw ? declaredRaw.replace(/\D/g, '') : null;
  const rescored = new Map();
  for (const sc of scenes) {
    const kind = (report?.scenes ?? []).find((x) => x.sceneId === sc.sceneId && x.attempt === sc.attempt)?.kind ?? (sc.sceneId.startsWith('ean') ? 'barcode' : 'object');
    rescored.set(`${sc.sceneId}:${sc.attempt}`, rescoreScene(sc, eventsOf(sc.sceneId, sc.attempt), declared, kind));
  }
  const pooled = { locateRoi: [], sal: [], roi: [], transferProxy: [], rawWrong: 0, rawWrongDetail: [] };
  const mainCaptureMs = [];
  for (const sc of scenes) {
    const ev = eventsOf(sc.sceneId, sc.attempt);
    const isBar = sc.sceneId.startsWith('ean');
    for (const e of ev) {
      const sd = e.saliency ? e.saliency.durationMs : null;
      const rd = (e.decodes ?? []).find((d) => d.variant === 'roi_cheap');
      if (isBar && sd !== null) pooled.sal.push(sd);
      if (isBar && rd) pooled.roi.push(rd.durationMs);
      if (isBar && sd !== null && rd) pooled.locateRoi.push(sd + rd.durationMs);
      if (typeof e.roundTripMs === 'number' && typeof e.workerBusyMs === 'number') pooled.transferProxy.push(e.roundTripMs - e.workerBusyMs);
    }
    if (isBar) {
      const rs = rescored.get(`${sc.sceneId}:${sc.attempt}`);
      if (rs && rs.rawContradicting > 0) {
        pooled.rawWrong += rs.rawContradicting;
        pooled.rawWrongDetail.push(`${sc.sceneId}: ${Object.entries(rs.counts).sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v}×${n}`).join(' vs ')}`);
      }
    }
    for (const t of sc.frameTicks ?? []) if (t.processed && typeof t.captureToLumaMs === 'number') mainCaptureMs.push(t.captureToLumaMs);
  }

  // --- GO / NO-GO inputs
  const barcodeScenes = (report?.scenes ?? []).filter((s) => s.kind === 'barcode');
  const locateP95 = percentile(pooled.sal, 0.95);
  const roiP95 = percentile(pooled.roi, 0.95);
  const locateRoiP50 = percentile(pooled.locateRoi, 0.5);
  const locateRoiP95 = percentile(pooled.locateRoi, 0.95);
  const loop60 = (report?.scenes ?? []).find((s) => s.sceneId === 'loop-60s');
  const loop60Raw = scenes.find((s) => s.sceneId === 'loop-60s');
  const ticks60 = loop60Raw?.frameTicks ?? [];
  const processed60 = ticks60.filter((t) => t.processed).length;
  const dur60 = loop60Raw ? loop60Raw.durationMs / 1000 : 0;
  const processedFps = dur60 > 0 ? processed60 / dur60 : null;
  const perSec = [];
  for (const t of ticks60) { const sec = Math.floor(t.tMs / 1000); perSec[sec] = (perSec[sec] ?? 0) + (t.processed ? 1 : 0); }
  const perSecTrim = perSec.slice(1, Math.max(1, perSec.length - 1)).filter((v) => typeof v === 'number');
  const processedFpsMin = perSecTrim.length ? Math.min(...perSecTrim) : null;
  const cameraSkipped = loop && ticks60.length ? loop.framesPresented - ticks60.length : null;
  const mainCaptureP50 = percentile(mainCaptureMs, 0.5);
  const mainCaptureP95 = percentile(mainCaptureMs, 0.95);
  const mainShare = loop && mainCaptureP50 !== null && processedFps !== null ? (processedFps * mainCaptureP50) / 1000 : null;
  const fpsSeries = loop?.fpsPerSecond ?? [];
  const tail5 = fpsSeries.slice(-6, -1);
  const head5 = fpsSeries.slice(1, 6);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const fpsHead = avg(head5);
  const fpsTail = avg(tail5);
  const duty = loop ? loop.localizeDutyCycle + loop.decodeDutyCycle : null;
  const sceneSeconds = scenes.filter((s) => s.durationMs >= TARGETS.minSceneSeconds * 1000).length;
  const rescoredRows = [...rescored.values()];
  const misreads = declared ? rescoredRows.reduce((a, r) => a + r.misread, 0) : null;
  const confirmedWrongCount = rescoredRows.filter((r) => r.confirmedWrong).length;
  const verdictCounts = {};
  for (const r of rescoredRows) verdictCounts[r.verdict] = (verdictCounts[r.verdict] ?? 0) + 1;
  const distScenes = scenes.filter((s) => /^ean-(12|18|25|30)cm$/.test(s.sceneId));
  const completionAll = distScenes.map((s) => rescored.get(`${s.sceneId}:${s.attempt}`)?.firstConfirmedMs ?? null);
  const completion = completionAll.filter((v) => typeof v === 'number');
  const neverConfirmed = distScenes.filter((s, i) => completionAll[i] === null).map((s) => s.sceneId);
  const wrongPairs = [];
  for (const sc of scenes) {
    if (!sc.sceneId.startsWith('ean')) continue;
    const rs = rescored.get(`${sc.sceneId}:${sc.attempt}`);
    if (!rs) continue;
    const ranked = Object.entries(rs.counts).sort((a, b) => b[1] - a[1]).map(([t]) => t);
    const legit = new Set(rs.expected ? [rs.expected] : ranked.slice(0, sc.sceneId === 'ean-two-codes' ? 2 : 1));
    if (legit.size === 0) continue;
    const ev = eventsOf(sc.sceneId, sc.attempt).sort((a, b) => a.tCapture - b.tCapture || a.frameIndex - b.frameIndex);
    let prev = null;
    const seen = new Set();
    for (const e of ev) {
      for (const d of e.decodes ?? []) {
        const hit = d.results.find((r) => r.checksumValid);
        if (!hit) continue;
        const t = hit.text.replace(/\D/g, '');
        if (prev && prev.t === t && prev.f !== e.frameIndex && !legit.has(t) && !seen.has(t)) {
          seen.add(t);
          wrongPairs.push(`${sc.sceneId}: ${t} at ${Math.round(e.tCapture - sc.t0)} ms (frames ${prev.f}/${e.frameIndex})`);
        }
        if (!prev || prev.t !== t) prev = { t, f: e.frameIndex };
      }
    }
  }
  const checks = [
    { id: 'locate+roi per-frame p95 ≤ 40 ms (pooled over barcode frames)', value: locateRoiP95 === null ? '— (no frame carried both a saliency and a roi_cheap timing)' : `p50 ${ms1(locateRoiP50)} / p95 ${ms1(locateRoiP95)} ms (saliency p95 ${ms1(locateP95)} + roi p95 ${ms1(roiP95)}, n=${pooled.locateRoi.length})`, pass: locateRoiP95 === null ? null : locateRoiP95 <= TARGETS.locateRoiP95Ms },
    { id: '≥ 15 fps PROCESSED sustained 60 s (loop-60s)', value: processedFps === null ? '— (loop-60s not run)' : `${ms1(processedFps)} fps processed (min second ${processedFpsMin ?? '—'}); camera presented ${loop ? ms1(loop.framesPresented / dur60) : '—'} fps, rVFC callbacks ${ms1(ticks60.length / (dur60 || 1))}/s (first 5 s ${ms1(fpsHead)} → last 5 s ${ms1(fpsTail)})`, pass: processedFps === null ? null : processedFps >= TARGETS.sustainedFps && (processedFpsMin === null || processedFpsMin >= TARGETS.sustainedFps) },
    { id: 'CPU proxy ≤ 60 % of one core (worker duty + main-thread capture share)', value: duty === null ? '—' : `worker ${pct(loop.localizeDutyCycle)} localize + ${pct(loop.decodeDutyCycle)} decode = ${pct(duty)}; main-thread capture→luma ${ms1(mainCaptureP50)}/${ms1(mainCaptureP95)} ms p50/p95 × ${ms1(processedFps)} fps = ${pct(mainShare)}; combined ${pct(duty + (mainShare ?? 0))}`, pass: duty === null ? null : duty + (mainShare ?? 0) <= TARGETS.dutyCycleMax },
    { id: 'corpus ≥ 20 scenes × ≥ 3 s', value: `${sceneSeconds} scenes ≥ 3 s (${scenes.length} recorded, ${frames} frames stored)`, pass: sceneSeconds >= TARGETS.minScenes },
    { id: 'wrong codes = 0 (headline: CONFIRMED wrong values)', value: `${confirmedWrongCount} confirmed wrong value(s); ${verdictCounts.MISREAD ?? 0} MISREAD scene(s)${declared ? ` vs declared ${declared} (P1 scenes only, ${misreads} raw hit(s) differ)` : ' (no declared code)'}; ${pooled.rawWrong} raw single-frame read(s) contradicting the scene majority${pooled.rawWrongDetail.length ? ` (${pooled.rawWrongDetail.join('; ')})` : ''}`, pass: confirmedWrongCount === 0 && (verdictCounts.MISREAD ?? 0) === 0 },
    { id: 'EAN-13 completion 12–30 cm p50 ≤ 0.7 s / p95 ≤ 2.0 s (headline)', value: `${completion.length ? `p50 ${ms(completionP50)} ms / p95 ${ms(completionP95)} ms over ${completion.length} confirmed scene(s)` : 'no confirmed 12–30 cm scene'}${neverConfirmed.length ? `; NEVER confirmed: ${neverConfirmed.join(', ')}` : ''}`, pass: distScenes.length ? neverConfirmed.length === 0 && completionP50 <= TARGETS.completionP50Ms && completionP95 <= TARGETS.completionP95Ms : null },
    { id: 'two consecutive frames agreeing on a WRONG value (fast-lane hazard)', value: wrongPairs.length ? wrongPairs.join('; ') : 'none observed', pass: wrongPairs.length === 0 },
  ];
  const phase0 = checks.slice(0, 4);
  const verdict = phase0.every((c) => c.pass === true) ? 'GO' : phase0.some((c) => c.pass === false) ? 'NO-GO' : 'INCOMPLETE';

  const lines = [];
  lines.push(`# ${d.modelLabel} — ${d.os} — ${d.browser} — ${d.executionMode}`);
  lines.push('');
  lines.push(`Bundle \`${fileName}\` · session ${run.sessionId} · created ${run.createdAt} · exported ${manifest.exportedAt} · harness ${manifest.harness}`);
  lines.push('');
  lines.push('## Device + camera');
  lines.push('| item | value |');
  lines.push('|---|---|');
  lines.push(`| screen / dpr / cores / memory | ${d.screen.width}×${d.screen.height} / ${d.screen.dpr} / ${d.hardwareConcurrency ?? '—'} / ${d.deviceMemoryGb ?? '—'} GB |`);
  lines.push(`| requested | ${run.camera?.requested?.width}×${run.camera?.requested?.height} @ ${run.camera?.requested?.frameRate} (${run.camera?.requested?.facingMode ?? 'deviceId'}) |`);
  lines.push(`| delivered | ${cam ? `${cam.width}×${cam.height} @ ${cam.frameRate ?? '?'} · ${cam.label ?? '—'} · facing ${cam.facingMode ?? '—'} · open ${ms(cam.openMs)} ms · first frame ${ms(cam.firstFrameMs)} ms` : '—'} |`);
  lines.push(`| cameras seen | ${(run.camera?.options ?? []).map((o) => `${o.label}${o.likelyUltrawide ? ' (ultra-wide?)' : ''} r${o.primaryRank}`).join('; ') || '—'} |`);
  lines.push(`| zoom | ${controls?.zoom?.supported ? `${controls.zoom.range?.min}–${controls.zoom.range?.max} · apply ${controls.zoom.ok ? 'ok' : 'FAILED'} (${controls.zoom.before} → ${controls.zoom.after ?? '?'}, ${ms(controls.zoom.durationMs)} ms)` : 'not exposed'} |`);
  lines.push(`| torch | ${controls?.torch?.supported ? `exposed · apply ${controls.torch.ok ? 'ok' : 'FAILED'} (${ms(controls.torch.durationMs)} ms)` : 'not exposed'} |`);
  lines.push(`| focusMode exposed | ${controls ? (controls.focusModeExposed ? 'yes' : 'no') : '—'} |`);
  lines.push(`| worker | ${worker ? `zxing-wasm ${worker.zxingVersion} · warm-up ${ms(worker.warmupMs)} ms · OffscreenCanvas ${worker.offscreenCanvas ? 'yes' : 'no'}` : '—'} |`);
  lines.push(`| loop (last scene) | ${loop ? `${loop.source} · presented ${loop.framesPresented} · processed ${loop.framesProcessed} · dropped(decode busy) ${loop.framesDroppedDecode} · cadence p50/p95 ${P(loop.cadenceMs)} ms · visibility events ${loop.visibilityEvents.length}` : '—'} |`);
  lines.push(`| transfer | ${transfer ? `${transfer.path} · main→worker p50/p95 ${P(transfer.mainToWorkerMs)} ms · reply p50/p95 ${P(transfer.workerReplyMs)} ms · buffer reuse ${transfer.bufferReuseHits} / alloc ${transfer.bufferAllocations} · round-trip minus worker-busy p50/p95 ${ms1(percentile(pooled.transferProxy, 0.5))}/${ms1(percentile(pooled.transferProxy, 0.95))} ms` : '—'} |`);
  lines.push(`| main-thread capture→luma | ${mainCaptureMs.length ? `${ms1(mainCaptureP50)} / ${ms1(mainCaptureP95)} ms p50/p95 over ${mainCaptureMs.length} processed frames` : '—'} |`);
  lines.push(`| loop-60s frames | ${loop60Raw ? `presented ${loop?.framesPresented ?? '—'} · surfaced ${ticks60.length} (camera-side skipped ${cameraSkipped ?? '—'}) · processed ${processed60} · dropped(busy) ${loop?.framesDroppedDecode ?? '—'}` : '—'} |`);
  lines.push(`| client hints | ${d.clientHints ? `${d.clientHints.platform ?? '?'} ${d.clientHints.platformVersion ?? '?'} · model ${d.clientHints.model ?? '?'} · ${d.clientHints.brands ?? ''}` : 'none (Safari, or hints refused) — reduced UA only'} |`);
  lines.push(`| camera auto-switch | ${run.camera?.autoSwitchedFrom ? `re-opened on the ranked primary; first delivery was ${run.camera.autoSwitchedFrom.label} ${run.camera.autoSwitchedFrom.width}×${run.camera.autoSwitchedFrom.height}` : 'none'} |`);
  lines.push('');
  lines.push('## Scenes');
  lines.push('| scene | kind | att | verdict | 1st hit ms | confirmed ms | hits/att | misread | fps p50 | cadence p50 | worker RT p50/p95 | localize p50/p95 | full_cheap p50/p95 (hits) | full_harder p50/p95 (hits) | roi p50/p95 (hits) | rect p50/p95 (hits) | cand px / |°| | dropped |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s0 of report?.scenes ?? []) {
    const rs = rescored.get(`${s0.sceneId}:${s0.attempt}`);
    const s = rs ? { ...s0, verdict: rs.verdict, firstHitMs: rs.firstHitMs, firstConfirmedMs: rs.firstConfirmedMs, confirmedText: rs.confirmedText, hits: rs.hits, decodeAttempts: rs.attempts, misreadCount: rs.misread } : s0;
    const raw = sceneMap.get(`${s.sceneId}:${s.attempt}`);
    const v = (name) => { const x = s.variants.find((q) => q.variant === name); return x ? `${P(x.decodeMs)} (${x.hits}/${x.attempts})` : '—'; };
    lines.push(`| ${s.sceneId} | ${s.kind} | ${s.attempt} | ${s.verdict} | ${ms(s.firstHitMs)} | ${ms(s.firstConfirmedMs)}${s.confirmedText ? ` ${s.confirmedText}` : ''} | ${s.hits}/${s.decodeAttempts} | ${s.misreadCount} | ${ms1(s.fps.p50)} | ${ms1(s.cadenceMs.p50)} | ${P(s.workerRoundTripMs)} | ${raw ? P(raw.localizeMs) : '—'} | ${v('full_cheap')} | ${v('full_harder')} | ${v('roi_cheap')} | ${v('rectified_cheap')} | ${ms(s.medianCandidateWidthPx)} / ${ms(s.medianAbsAngleDeg)} | ${pct(s.frames.droppedRatio)} |`);
  }
  lines.push('');
  lines.push(`Events per scene: ${Object.entries(eventCounts).map(([k, n]) => `${k}=${n}`).join(', ') || '—'}`);
  lines.push('');
  lines.push(`## Phase 0 GATES (decision package Phase 0 acceptance) — **${verdict}**`);
  lines.push('| gate | measured | result |');
  lines.push('|---|---|---|');
  for (const c of phase0) lines.push(`| ${c.id} | ${c.value} | ${c.pass === null ? 'n/a' : c.pass ? 'PASS' : 'FAIL'} |`);
  lines.push('');
  lines.push('## Phase 1 headline targets measured on this corpus (diagnostic — NOT Phase 0 gates)');
  lines.push('| target | measured | result |');
  lines.push('|---|---|---|');
  for (const c of checks.slice(4)) lines.push(`| ${c.id} | ${c.value} | ${c.pass === null ? 'n/a' : c.pass ? 'meets' : 'misses'} |`);
  lines.push('');
  lines.push(`Verdict counts (rescored on the Mac, declared code scoped to the P1 scenes): ${Object.entries(verdictCounts).map(([k, n]) => `${k}=${n}`).join(', ')}`);
  return { markdown: lines.join('\n'), verdict, checks, device: d, sceneCount: scenes.length, frames, pooled, scenes, report, run, fileName, processedFps, processedFpsMin, duty, mainShare, sceneSeconds };
}

/**
 * Canonical evidence merging: bundles of the SAME device label + browser + execution mode are combined —
 * the scene set is the union (newest attempt per scene wins), locate+ROI is pooled over all frames, the
 * loop gates come from whichever bundle carried loop-60s (newest). Every merged row names its bundle.
 */
export function mergeDeviceClass(results) {
  const byScene = new Map();
  for (const r of results) {
    for (const sc of r.report?.scenes ?? []) {
      const prev = byScene.get(sc.sceneId);
      if (!prev || r.run.createdAt > prev.createdAt) byScene.set(sc.sceneId, { ...sc, bundle: r.fileName, createdAt: r.run.createdAt });
    }
  }
  const scenes = [...byScene.values()].sort((a, b) => a.sceneId.localeCompare(b.sceneId));
  const locateRoi = results.flatMap((r) => r.pooled.locateRoi);
  const loopSource = results.filter((r) => r.processedFps !== null).sort((a, b) => (a.run.createdAt < b.run.createdAt ? 1 : -1))[0] ?? null;
  const sceneSeconds = scenes.filter((sc) => sc.durationMs >= TARGETS.minSceneSeconds * 1000).length;
  const gates = [
    { id: 'locate+roi per-frame p95 ≤ 40 ms (pooled over all bundles)', value: locateRoi.length ? `p50 ${ms1(percentile(locateRoi, 0.5))} / p95 ${ms1(percentile(locateRoi, 0.95))} ms (n=${locateRoi.length})` : '—', pass: locateRoi.length ? percentile(locateRoi, 0.95) <= TARGETS.locateRoiP95Ms : null },
    { id: '≥ 15 fps PROCESSED sustained 60 s', value: loopSource ? `${ms1(loopSource.processedFps)} fps (min second ${loopSource.processedFpsMin ?? '—'}) from ${loopSource.fileName}` : '— (no bundle carried loop-60s)', pass: loopSource ? loopSource.processedFps >= TARGETS.sustainedFps && (loopSource.processedFpsMin === null || loopSource.processedFpsMin >= TARGETS.sustainedFps) : null },
    { id: 'CPU proxy ≤ 60 %', value: loopSource && loopSource.duty !== null ? `${pct(loopSource.duty + (loopSource.mainShare ?? 0))} from ${loopSource.fileName}` : '—', pass: loopSource && loopSource.duty !== null ? loopSource.duty + (loopSource.mainShare ?? 0) <= TARGETS.dutyCycleMax : null },
    { id: 'corpus ≥ 20 scenes × ≥ 3 s (union)', value: `${sceneSeconds} scenes ≥ 3 s across ${results.length} bundle(s)`, pass: sceneSeconds >= TARGETS.minScenes },
  ];
  const verdict = gates.every((g) => g.pass === true) ? 'GO' : gates.some((g) => g.pass === false) ? 'NO-GO' : 'INCOMPLETE';
  const d = results[0].device;
  const lines = [`# MERGED — ${d.modelLabel} — ${d.os} — ${d.browser} — ${d.executionMode}`, '', `Bundles: ${results.map((r) => r.fileName).join(', ')}`, '', '| scene | verdict | confirmed ms | hits/att | bundle |', '|---|---|---|---|---|'];
  for (const sc of scenes) lines.push(`| ${sc.sceneId} | ${sc.verdict} | ${ms(sc.firstConfirmedMs)} | ${sc.hits}/${sc.decodeAttempts} | ${sc.bundle} |`);
  lines.push('', `## Phase 0 GATES (merged) — **${verdict}**`, '| gate | measured | result |', '|---|---|---|');
  for (const g of gates) lines.push(`| ${g.id} | ${g.value} | ${g.pass === null ? 'n/a' : g.pass ? 'PASS' : 'FAIL'} |`);
  return { markdown: lines.join('\n'), verdict, key: `${d.modelLabel}|${d.browser}|${d.executionMode}` };
}

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? (args[outIdx + 1] ?? null) : null;
const merge = args.includes('--merge');
const files = args.filter((a, i) => a !== '--merge' && (outIdx < 0 || (i !== outIdx && i !== outIdx + 1)));
if (files.length === 0 && import.meta.url === `file://${process.argv[1]}`) {
  console.error('usage: node scripts/scan-lab/parseBaselineBundle.mjs <bundle.zip> [...] [--out dir]');
  process.exit(2);
}
const summary = [];
const all = [];
for (const f of files) {
  const res = analyzeBundle(new Uint8Array(readFileSync(f)), basename(f));
  all.push(res);
  summary.push(`| ${res.device.modelLabel} | ${res.device.os} | ${res.device.browser} | ${res.device.executionMode} | ${res.sceneCount} | ${res.frames} | **${res.verdict}** |`);
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    const target = join(outDir, basename(f).replace(/\.zip$/i, '') + '.md');
    writeFileSync(target, res.markdown + '\n');
    console.error(`wrote ${target}`);
  } else {
    console.log(res.markdown);
    console.log('');
  }
}
if (merge) {
  const groups = new Map();
  for (const r of all) {
    const key = `${r.device.modelLabel}|${r.device.browser}|${r.device.executionMode}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const [key, rs] of groups) {
    if (rs.length < 2) continue;
    const m = mergeDeviceClass(rs);
    summary.push(`| MERGED ${rs[0].device.modelLabel} | ${rs[0].device.os} | ${rs[0].device.browser} | ${rs[0].device.executionMode} | ${rs.length} bundles | — | **${m.verdict}** |`);
    if (outDir) writeFileSync(join(outDir, `MERGED_${key.replace(/[^A-Za-z0-9]+/g, '_')}.md`), m.markdown + '\n');
    else console.log(m.markdown);
  }
}
if (files.length > 1 || outDir) {
  const head = ['# Phase 0 — device classes', '', '| device | os | browser | mode | scenes | frames | Phase 0 |', '|---|---|---|---|---|---|---|', ...summary].join('\n');
  if (outDir) writeFileSync(join(outDir, 'SUMMARY.md'), head + '\n');
  else console.log(head);
}
