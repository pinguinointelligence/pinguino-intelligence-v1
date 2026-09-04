# SCAN CORE PHASE 0 — FROZEN ATOMIC CHECKLIST

Frozen 2026-09-04 (owner brief of 2026-09-03). Statuses: DONE · IN PROGRESS · WAITING_ON_OWNER_DEVICE · WAITING_ON_OWNER_RUN · BLOCKED · NOT STARTED. "VERIFIED DONE" counts only items with evidence of the kind the item requires (a phone item needs phone evidence). Rules: implementation ≠ real-device proof · desktop ≠ phone · Safari desktop ≠ iPhone Safari · preview deploy ≠ Phase 0 DONE · synthetic benchmark ≠ phone benchmark · Owner QA cannot be self-approved.

Devices: iPhone 15 Pro Max / iOS 26.6.1 (Safari tab + standalone PWA) · Samsung Galaxy Note10+ SM-N975F/DS / Android Chrome (owner-provided 2026-09-04; Android version to be read by the harness). No unique device identifiers are recorded anywhere.

| id | item | evidence required | status |
|---|---|---|---|
| A1 | Base reconciled: current `origin/staging` SHA recorded and diffed against the decision package base 285f15ed — base now f6cd1290 (fast-forwarded 2026-09-04) | git log | DONE |
| A2 | Fresh branch + worktree `claude/scan-core-phase-0` from current `origin/staging` | git worktree list | DONE |
| A3 | Route `/scan-lab/baseline` isolated: env-flag + lazy chunk, never linked from UI, absent from production builds — `VITE_SCAN_LAB_BASELINE=1` inlined at build; flag-off build: 0 assets mention the harness, no `BaselinePage-*.js`; flag-on: `BaselinePage-*.js` + `decodeWorker-*.js` + `zxing_reader-*.wasm` (build-proof.log 2026-09-04) | code + build inspection | DONE |
| A4 | Route-scoped PWA manifest so the standalone Home-Screen install opens `/scan-lab/baseline` — `public/scan-lab/baseline.webmanifest` + link/meta injected only on the route; code + build done, iPhone install run pending | code + iPhone PWA run | IN PROGRESS |
| A5 | Decision Package updated with the approved owner decisions (two-stage UX, coarse category OFF, slowLane gate) on PR #143 | commit on `claude/scan-core-decision` | DONE (de69969f) |
| A6 | Frozen areas untouched: HOME integration, LiveMultiScanner, LiveProductScanner, catalog, catalogue resolution, Engine, recipe stores, production/main — diff = new files under `src/scan-lab/`, `public/scan-lab/`, `reports/scan-core-phase-0/` + 23 guarded lines in `src/app/router.tsx`; protected-paths guard untouched | `git diff --stat` of the PR shows only new files + one guarded router line | DONE |
| B1 | Camera discovery: enumerate after permission, labels, front/back switch — implemented locally 2026-09-04 | LOCAL TESTS + phone | WAITING_ON_OWNER_RUN |
| B2 | Manual camera choice by the tester — implemented locally 2026-09-04 | phone | WAITING_ON_OWNER_RUN |
| B3 | Likely-ultrawide misselection detection (label + settings heuristics) — implemented locally 2026-09-04 | phone | WAITING_ON_OWNER_RUN |
| B4 | Requested vs delivered settings (width/height/fps, aspect, `getSettings()`, `getCapabilities()`, delivered cadence) — implemented locally 2026-09-04 | phone | WAITING_ON_OWNER_RUN |
| B5 | Zoom: supported? min/max/current, `applyConstraints` result recorded — implemented locally 2026-09-04 | phone | WAITING_ON_OWNER_RUN |
| B6 | Torch: supported? enable/disable results recorded — implemented locally 2026-09-04 | phone | WAITING_ON_OWNER_RUN |
| B7 | Live loop: rVFC cadence, frame count, dropped processing frames, 60 s continuous run, fps degradation — implemented locally 2026-09-04 | phone | WAITING_ON_OWNER_RUN |
| B8 | Visibility pause/resume measured (backgrounding, return) — implemented locally 2026-09-04 | phone | WAITING_ON_OWNER_RUN |
| B9 | Worker transfer: ImageBitmap and VideoFrame paths where available, main→Worker transfer p50/p95, worker cadence, reusable buffers, no global busy flag — implemented locally 2026-09-04 | phone | WAITING_ON_OWNER_RUN |
| B10 | zxing full-frame decode at 1280×720 (time, success, value, checksum, geometry, lineCount, returnErrors) — implemented locally 2026-09-04 | phone | WAITING_ON_OWNER_RUN |
| B11 | zxing full-frame decode at 1920×1080 when actually delivered — implemented locally 2026-09-04 | phone | WAITING_ON_OWNER_RUN |
| B12 | zxing ROI decode — implemented locally 2026-09-04 | phone | WAITING_ON_OWNER_RUN |
| B13 | zxing rectified-ROI decode where a candidate quad exists — implemented locally 2026-09-04 | phone | WAITING_ON_OWNER_RUN |
| B14 | Cheap options and harder retry measured separately — implemented locally 2026-09-04 | phone | WAITING_ON_OWNER_RUN |
| B15 | Localization: bar-texture saliency time, candidate geometry, false candidates, fill / module-size estimate — implemented locally 2026-09-04 | phone | WAITING_ON_OWNER_RUN |
| B16 | Corpus recording per scene into IndexedDB (frames / representative frames, JSON metadata, device metadata, timestamps, scene id, camera settings, timings) — implemented locally 2026-09-04 | phone + export | WAITING_ON_OWNER_RUN |
| B17 | EXPORT CORPUS: downloadable bundle, no cloud upload — implemented locally 2026-09-04 | phone + file received | WAITING_ON_OWNER_RUN |
| B18 | Test mode: scenes one by one, READY / RECORDING / DONE, retry, diagnostics behind an expandable panel — implemented locally 2026-09-04 | phone | WAITING_ON_OWNER_RUN |
| B19 | Automatic evidence recording (owner never opens a console) — implemented locally 2026-09-04 | phone | WAITING_ON_OWNER_RUN |
| B20 | Device metadata without identifiers: model (typed by tester), OS/browser detected where possible, mode (Safari tab / standalone), selected camera, delivered settings, timestamp — implemented locally 2026-09-04 | phone | WAITING_ON_OWNER_RUN |
| B21 | CPU proxy: Worker processing duty cycle, labelled as a proxy — implemented locally 2026-09-04 | phone | WAITING_ON_OWNER_RUN |
| B22 | Optional USB-C Safari Web Inspector debugging documented (not required for the run) — OWNER_RUN_INSTRUCTIONS.md §Debugowanie po kablu | instructions | DONE |
| C1 | Typecheck passes — `tsc -b` inside `npm run build` green 2026-09-04 | LOCAL TESTS | DONE |
| C2 | Lint passes — `eslint src/scan-lab src/app/router.tsx`: 0 errors (1 pre-existing router warning) | LOCAL TESTS | DONE |
| C3 | Unit tests for harness logic (stats, saliency on synthetic frames, rectification, ZIP/export, scene state machine) pass — 78 tests / 12 files green: percentiles, luminance, deviceInfo, zip (+system unzip), gtin, sceneMachine, report verdicts, evidence adapter, saliency+rectify on synthetic EAN-13, zxing-wasm node decode, export archive parse | LOCAL TESTS | DONE |
| C4 | Production build succeeds; harness chunk absent when the flag is off — see A3 | LOCAL TESTS | DONE |
| C5 | Desktop camera smoke (labelled NOT phone evidence) | Safari macOS | NOT STARTED |
| C6 | HTTPS access for the phone: Vercel preview reachable without login, or cloudflared tunnel live | URL fetched from outside | NOT STARTED |
| C7 | QR code + exact Safari, PWA, scene-flow and export instructions delivered | message + file | NOT STARTED |
| D1 | iPhone Safari tab run: all barcode + object scenes, repetitions, corpus exported | IPHONE SAFARI | WAITING_ON_OWNER_RUN |
| D2 | iPhone standalone PWA run: same scenes | IPHONE PWA | WAITING_ON_OWNER_RUN |
| D3 | Android Chrome run (Galaxy Note10+): same scenes | ANDROID CHROME | WAITING_ON_OWNER_RUN |
| D4 | Corpus bundles received and parsed on the Mac; metrics tables produced per device class | CORPUS | WAITING_ON_OWNER_RUN |
| D5 | GO / NO-GO report per device class against the Decision Package targets | GO / NO-GO | WAITING_ON_OWNER_RUN |
| D6 | Owner QA sign-off | OWNER QA | WAITING_ON_OWNER |

**SCAN CORE PHASE 0 — 11 / 41 VERIFIED DONE = 27 %** (A1 A2 A5 A6 A3 B22 C1 C2 C3 C4 + A4 in progress; 21 B-items implemented, phone evidence pending)
