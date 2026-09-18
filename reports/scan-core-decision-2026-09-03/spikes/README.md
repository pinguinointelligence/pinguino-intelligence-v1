# Scan Core spikes — throwaway research code (NOT production)

Source lives outside the repository in `~/Developer/scan-core-spikes/` (Node 24, `zxing-wasm@3.1.3`, `@undecaf/zbar-wasm@0.11.0`, `tsx`). Copies of the sources are archived here with a `.txt` suffix so no tooling treats them as project code.

- `ean13.mjs` — synthetic EAN-13 renderer (pinhole camera, yaw/pitch/roll, cylindrical curvature, Gaussian + motion blur, noise, glare, human-readable digits) + PNG writer.
- `decoders.mjs` — adapters for zxing-wasm (`readBarcodes`, `returnErrors`), zbar-wasm and the repo's `barcodeScanline.ts` (imported read-only from the worktree).
- `evidence.mjs` — guard-anchored, module-indexed per-slot evidence accumulator: matched-filter anchors with sub-pixel refinement, two-anchor module frames, blur-matched slot posteriors, within-frame averaging / across-frame product, consistency components, checksum-constrained top-2 Viterbi over parity patterns, margin + coverage + marginal gates, rule-bound digit display.
- `lib_frames.mjs` — scanline sampling in image space and in rectified (quad) space.
- `run_a.mjs` → `spike_a_results.md` (single-frame decoder grid); `run_b.mjs` → `spike_b_results.md` (temporal experiments E0–E5); `run_c.mjs` → `spike_c_results.md` (cost model); `smoke.mjs` sanity.
- `bench.html` + `server.mjs` — in-browser WASM decoder bench (Safari 26.5 / Chromium 148 results in `probe-results/`).
- `frames/` — sample synthetic frames (Spike A conditions; Spike B "never fully visible" pan sequence).

Two earlier Spike A passes are kept for honesty: the first used 2× supersampling with no optical blur and produced edge-phase aliasing that broke zxing at 2 px/module (invalid); the second had a harness bug that dropped the camera distance for every condition with an explicit pose (roll/yaw/pitch/curvature/cut rows invalid). The final `spike_a_results.md` is the corrected run (3× supersampling, 0.5 px baseline blur).

Re-run: `cd ~/Developer/scan-core-spikes && N=12 npx tsx src/run_a.mjs && npx tsx src/run_b.mjs && npx tsx src/run_c.mjs`.
