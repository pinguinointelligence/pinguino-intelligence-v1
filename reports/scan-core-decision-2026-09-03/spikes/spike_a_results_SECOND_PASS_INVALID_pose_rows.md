## Spike A — single-frame decoders on synthetic EAN-13 frames (1280×720, focal 1100 px ≈ 60° HFOV; baseline lens blur σ0.5 px on every frame, 3× supersampling; N=12 random EANs per condition; Node v24.19.0 on Apple Silicon, single thread — phone CPU is ~3–6× slower)

| condition | zxing-wasm tryHarder | zxing-wasm fast | zbar-wasm | repo scanline | zxing error-results (detect w/o decode) |
|---|---|---|---|---|---|
| dist 120mm (≈3.0 px/module) | 100% 16ms | 100% 3ms | 100% 15ms | 100% 1ms | 0/12 |
| dist 180mm (≈2.0 px/module) | 100% 13ms | 100% 4ms | 100% 15ms | 100% 0ms | 0/12 |
| dist 240mm (≈1.5 px/module) | 92% 12ms | 92% 3ms | 75% 13ms | 92% 0ms | 0/12 |
| dist 300mm (≈1.2 px/module) | 0% 13ms | 0% 3ms | 0% 12ms | 0% 1ms | 0/12 |
| dist 360mm (≈1.0 px/module) | 0% 10ms | 0% 2ms | 0% 11ms | 100% 0ms | 0/12 |
| dist 420mm (≈0.86 px/module) | 0% 13ms | 0% 4ms | 0% 16ms | 0% 0ms | 0/12 |
| small code 80% mag @240mm (≈1.2 px/module) | 0% 14ms | 0% 3ms | 0% 16ms | 0% 1ms | 0/12 |
| blur σ0.7 @180mm | 0% 19ms | 0% 4ms | 0% (✗1) 19ms | 75% 1ms | 2/12 |
| blur σ1.2 @180mm | 0% 11ms | 0% 2ms | 0% 13ms | 0% 0ms | 0/12 |
| blur σ1.8 @180mm | 0% 12ms | 0% 2ms | 0% 13ms | 0% 1ms | 0/12 |
| blur σ1.0 @240mm | 0% 11ms | 0% 2ms | 0% 13ms | 0% 0ms | 0/12 |
| motion 4px @180mm | 0% 12ms | 0% 2ms | 0% 14ms | 0% 0ms | 0/12 |
| motion 7px @180mm | 0% 12ms | 0% 3ms | 0% 14ms | 0% 0ms | 0/12 |
| motion 11px @180mm | 0% 12ms | 0% 2ms | 0% 13ms | 0% 0ms | 0/12 |
| roll 20° @180mm | 0% 13ms | 0% 3ms | 0% 16ms | 0% 0ms | 0/12 |
| roll 45° @180mm | 0% 16ms | 0% 3ms | 0% 21ms | 0% 0ms | 0/12 |
| roll 80° @180mm | 0% 26ms | 0% 6ms | 0% 21ms | 0% 0ms | 0/12 |
| yaw 30° @180mm | 0% 21ms | 0% 4ms | 0% 23ms | 0% 0ms | 0/12 |
| yaw 45° @180mm | 0% 18ms | 0% 4ms | 0% 20ms | 0% 0ms | 0/12 |
| yaw 60° @180mm | 0% 16ms | 0% 4ms | 0% 20ms | 0% 0ms | 0/12 |
| pitch 45° @180mm | 0% 16ms | 0% 4ms | 0% 16ms | 0% 0ms | 0/12 |
| can r=33mm yaw 20° @180mm | 0% 14ms | 0% 2ms | 0% 15ms | 0% 0ms | 0/12 |
| bottle r=20mm yaw 25° @180mm | 0% 13ms | 0% 3ms | 0% 15ms | 0% 0ms | 0/12 |
| glare on code @180mm | 100% 13ms | 100% 3ms | 100% 14ms | 100% 1ms | 0/12 |
| low contrast 0.35 + noise 6 @180mm | 100% 8ms | 42% 3ms | 100% 129ms | 100% 0ms | 0/12 |
| noise σ15 @180mm | 100% 18ms | 58% 4ms | 100% 182ms | 100% 0ms | 0/12 |
| noise σ25 @180mm | 50% 27ms | 0% 3ms | 83% 199ms | 92% 2ms | 0/12 |
| blur σ1.0 + noise 8 + yaw 25° @200mm | 0% 5ms | 0% 3ms | 0% 143ms | 0% 23ms | 0/12 |
| cut: only left 55% visible @180mm | 0% 12ms | 0% 3ms | 0% 12ms | 0% 0ms | 0/12 |
| cut: only left 80% visible @180mm | 0% 15ms | 0% 4ms | 0% 17ms | 0% 0ms | 0/12 |
| cut: only right 55% visible @180mm | 0% 14ms | 0% 3ms | 0% 18ms | 0% 0ms | 0/12 |
| cut: right quiet zone missing (100% bars) @180mm | 0% 12ms | 0% 3ms | 0% 13ms | 0% 0ms | 0/12 |
| damaged: 5px light scratch across code @180mm | 0% 12ms | 0% 2ms | 0% 14ms | 0% 1ms | 0/12 |
| damaged: 14px dark blot on code @180mm | 100% 14ms | 100% 4ms | 100% 20ms | 100% 0ms | 0/12 |
| two codes side by side @180mm | 100% (✗1) 16ms | 100% 4ms | 100% 21ms | 100% 0ms | 0/12 |

(✗n = frames where a decoder returned a WRONG 13-digit value; error-results = frames where zxing returned a symbol with a checksum/decode error but with a position)
