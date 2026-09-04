/**
 * Offline replay of the adaptive policy over the Phase 0 corpus (env-gated; skipped in CI).
 *   SCAN_CORE_CORPUS_DIR=<dir with extracted bundle folders> npx vitest run src/scan-core/__tests__/policyReplay.test.ts
 * Writes reports/scan-core-phase-1/P1_POLICY_REPLAY_<date>.md. The decode outcome of a chosen path is
 * APPROXIMATED by the recorded variant closest to it (LOW_MEDIUM/RESCUE ≈ full_harder (tryDownscale) else
 * full_cheap; NATIVE_ROI ≈ roi_cheap else full_cheap; harder crops ≈ full_harder), so the numbers bound,
 * not measure, the live behaviour.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Confirmation, type Read } from '../confirmation';
import { PolicyState, type FrameSignals, type ScanPath } from '../policy';
import type { CameraProfile } from '../profile';

const SCENES = [
  'ean-12cm',
  'ean-18cm',
  'ean-25cm',
  'ean-30cm',
  'ean-approach-40cm',
  'ean-small',
  'ean-curved-can',
  'ean-glare',
  'ean-hand-motion',
  'ean-low-light',
  'ean-two-codes',
];
const P1 = new Set(['ean-12cm', 'ean-18cm', 'ean-25cm', 'ean-30cm', 'ean-approach-40cm']);

interface Ev {
  frameIndex: number;
  tCapture: number;
  width: number;
  height: number;
  saliency?: {
    candidates: Array<{
      quad: { points: Array<{ x: number; y: number }> };
      orientationDeg: number;
    }>;
  };
  quality: { laplacianVar: number; meanLuma: number; clippedHighRatio: number };
  decodes: Array<{
    variant: string;
    results: Array<{ text: string; checksumValid: boolean; lineCount: number }>;
  }>;
}

describe('policy replay over the Phase 0 corpus', () => {
  it('writes the per-scene path table when SCAN_CORE_CORPUS_DIR is set', () => {
    const root = process.env['SCAN_CORE_CORPUS_DIR'];
    if (!root) return;
    const lines: string[] = [
      '# Adaptive policy — offline replay over the Phase 0 corpus',
      '',
      'Outcome column = decode approximated by the recorded variant closest to the chosen path (see file header). "wrong" = the replayed confirmation disagrees with the scene reference (declared code on the P1 scenes, otherwise the scene majority).',
      '',
    ];
    let wrongConfirmations = 0;
    let confirmations = 0;
    for (const dir of readdirSync(root).filter((d) => existsSync(join(root, d, 'manifest.json')))) {
      const run = JSON.parse(readFileSync(join(root, dir, 'manifest.json'), 'utf8')).run;
      const scenes = JSON.parse(readFileSync(join(root, dir, 'scenes.json'), 'utf8')) as Array<{
        sceneId: string;
        attempt: number;
        t0: number;
        declaredCode: string | null;
        decodedValues: Record<string, number>;
      }>;
      const declared =
        (scenes.find((s) => s.declaredCode)?.declaredCode ?? '').replace(/\D/g, '') || null;
      const dl = run.camera?.delivered;
      lines.push(
        `## ${run.device.modelLabel} — ${run.device.browser} — ${run.device.executionMode} (${dir})`,
      );
      lines.push(
        '| scene | dominant path (share) | 2nd path | reason (dominant) | replay confirmation | Phase 0 first hit | reference |',
      );
      lines.push('|---|---|---|---|---|---|---|');
      for (const sid of SCENES) {
        const sc = scenes.find((s) => s.sceneId === sid);
        if (!sc) continue;
        const f = join(root, dir, `events/${sid}${sc.attempt > 1 ? `#${sc.attempt}` : ''}.ndjson`);
        if (!existsSync(f)) continue;
        const evs = readFileSync(f, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l) as Ev)
          .sort((a, b) => a.tCapture - b.tCapture);
        if (!evs.length) continue;
        const sourceW = evs[0]!.width;
        const profile: CameraProfile = {
          formFactor: run.device.formFactor ?? 'mobile',
          sourceW,
          sourceH: evs[0]!.height,
          fps: dl?.frameRate ?? null,
          autofocus: dl?.autofocus ?? null,
          zoomMax: dl?.capabilities?.zoom?.max ?? null,
          torch: Boolean(dl?.capabilities?.torch),
          startSharpness: null,
        };
        const policy = new PolicyState(profile, false);
        const conf = new Confirmation();
        const hist = new Map<ScanPath, number>();
        const reasons = new Map<ScanPath, string>();
        let firstHit: number | null = null;
        let confirmed: { value: string; at: number; lane: string } | null = null;
        const counts: Record<string, number> = {};
        for (const e of evs) {
          for (const d of e.decodes)
            for (const r of d.results)
              if (r.checksumValid) counts[r.text] = (counts[r.text] ?? 0) + 1;
        }
        const legit =
          P1.has(sid) && declared
            ? new Set([declared])
            : new Set(
                Object.entries(counts)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, sid === 'ean-two-codes' ? 2 : 1)
                  .map(([t]) => t),
              );
        for (const e of evs) {
          const c = e.saliency?.candidates?.[0];
          const tMs = e.tCapture - sc.t0;
          const cand = c
            ? (() => {
                const p = c.quad.points;
                const w = Math.hypot(p[1]!.x - p[0]!.x, p[1]!.y - p[0]!.y);
                const h = Math.hypot(p[3]!.x - p[0]!.x, p[3]!.y - p[0]!.y);
                return {
                  fill: w / sourceW,
                  widthPx: w,
                  heightPx: h,
                  angleDeg: c.orientationDeg,
                  cx: p.reduce((a, q) => a + q.x, 0) / 4,
                  cy: p.reduce((a, q) => a + q.y, 0) / 4,
                };
              })()
            : null;
          const sig: FrameSignals = {
            frameIndex: e.frameIndex,
            tMs,
            candidate: cand,
            sharpness: e.quality.laplacianVar,
            meanLuma: e.quality.meanLuma,
            clippedRatio: e.quality.clippedHighRatio,
            workerDuty: 0.3,
            zoomApplied: false,
          };
          const d = policy.decide(sig);
          hist.set(d.path, (hist.get(d.path) ?? 0) + 1);
          if (!reasons.has(d.path)) reasons.set(d.path, d.reason);
          const pick = (names: string[]) => {
            for (const n of names) {
              const v = e.decodes.find((x) => x.variant === n);
              if (v) return v;
            }
            return null;
          };
          let variant: { variant: string; results: Ev['decodes'][number]['results'] } | null = null;
          let source: Read['source'] = 'native';
          if (d.path === 'LOW_MEDIUM' || d.path === 'SKIP_MOTION') {
            variant = pick(['full_harder', 'full_cheap']);
            source = 'medium';
          } else if (d.path === 'RESCUE_FULL') {
            variant = pick(['full_harder', 'full_cheap']);
            source = 'rescue';
          } else if (d.path === 'NATIVE_ROI') {
            variant = d.harder
              ? pick(['full_harder', 'roi_cheap', 'full_cheap'])
              : pick(['roi_cheap', 'full_cheap']);
          } else if (d.path === 'FAR_NATIVE_ROI') {
            variant = pick(['full_harder', 'roi_cheap']);
          }
          const hit = variant?.results.find((r) => r.checksumValid) ?? null;
          if (hit) {
            policy.noteHit();
            if (firstHit === null) firstHit = tMs;
            const st = conf.push({
              frameIndex: e.frameIndex,
              tMs,
              text: hit.text.replace(/\D/g, ''),
              lineCount: hit.lineCount,
              moduleNative: d.moduleNative,
              source,
            });
            if (st.status === 'confirmed' && !confirmed)
              confirmed = { value: st.value!, at: st.confirmedAt!, lane: st.lane! };
          } else if (variant) policy.noteMiss();
        }
        const total = evs.length;
        const ranked = [...hist.entries()].sort((a, b) => b[1] - a[1]);
        const dom = ranked[0];
        const sec = ranked[1];
        const wrong = confirmed ? !legit.has(confirmed.value) : false;
        if (confirmed) confirmations += 1;
        if (wrong) wrongConfirmations += 1;
        lines.push(
          `| ${sid} | ${dom ? `${dom[0]} (${Math.round((100 * dom[1]) / total)} %)` : '—'} | ${sec ? `${sec[0]} (${Math.round((100 * sec[1]) / total)} %)` : '—'} | ${dom ? reasons.get(dom[0]) : ''} | ${confirmed ? `${Math.round(confirmed.at)} ms (${confirmed.lane}) ${confirmed.value}${wrong ? ' **WRONG**' : ''}` : 'not confirmed'} | ${firstHit === null ? '—' : `${Math.round(firstHit)} ms`} | ${[...legit].join('/') || '—'} |`,
        );
      }
      lines.push('');
    }
    lines.push(
      `Replayed confirmations: ${confirmations}; wrong confirmations: ${wrongConfirmations}.`,
    );
    const out = join(process.cwd(), 'reports/scan-core-phase-1/P1_POLICY_REPLAY_2026-09-04.md');
    writeFileSync(out, lines.join('\n') + '\n');
    expect(wrongConfirmations).toBe(0);
  });
});
