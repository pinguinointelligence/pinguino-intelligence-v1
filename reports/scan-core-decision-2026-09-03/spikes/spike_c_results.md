## Spike C — per-frame cost (median of 8, ms, Node v24.19.0 single thread on Apple Silicon; expect ×3–6 on a mid-range phone in WASM)

| frame | zxing-wasm tryHarder | zxing-wasm fast | zbar-wasm | repo scanline | Laplacian quality (4× subsampled) |
|---|---|---|---|---|---|
| 1920×1080 | 30.1 | 8.7 | 51.5 | 1.1 | 4.97 |
| 1280×720 | 19.3 | 3.3 | 20.2 | 2.9 | 0.61 |
| 960×540 | 13.6 | 2.2 | 15.1 | 1.1 | 3.67 |
| 640×360 | 5.9 | 0.8 | 4.8 | 0.7 | 0.82 |
| ROI 640×288 crop of 1280×720 | 6.3 | – | 4.5 | – | – |
