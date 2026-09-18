## Spike B — temporal guard-anchored evidence accumulation (KAPPA=n/(2σ²), σ=0.35·(1+0.6·blur), TAU=3, 7 scanlines/frame, oracle localization)

- E0 single frame (m≈1.8 px, blur 0.8, noise 5, roll ±10°, N=40): accepted 0/40, correct 0, WRONG-accepted 0; displayed digits 21 of which correct 21
- E1 pan through full view (trials=30, 10 frames, m≈1.61 px, blur 0.9, noise 6, max visible 1): accumulator accepted 7/30 (correct 7, WRONG 0), median accept frame 5; any-frame full decode: zxing 11/30, zbar 0/30, repo 12/30; per-frame wrong values 0
-    example progress: 0:•••••••••••••  1:•••••••••••••  2:•••••••••••••  3:•••••••••••••  4:•••••••••••••  5:•••••••••••••  6:•••••••••••••  7:•••••••••••••  8:•••••••••••••  9:•••••••••••••
- E1 pan never fully visible (max 85%) (trials=30, 10 frames, m≈1.61 px, blur 0.9, noise 6, max visible 0.85): accumulator accepted 2/30 (correct 2, WRONG 0), median accept frame 6; any-frame full decode: zxing 0/30, zbar 0/30, repo 0/30; per-frame wrong values 0
-    example progress: 0:•••••••••••••  1:•••••••••••••  2:•••••••••••••  3:•••••••••••••  4:•••••••••••••  5:•••••••••••••  6:•••••••••••••  7:•••••••••••••  8:•••••••••••••  9:•••••••••••••
- E1 pan far (m≈1.2) (trials=30, 10 frames, m≈1.21 px, blur 0.9, noise 6, max visible 1): accumulator accepted 0/30 (correct 0, WRONG 0), median accept frame -; any-frame full decode: zxing 0/30, zbar 0/30, repo 0/30; per-frame wrong values 0
-    example progress: 0:•••••••••••••  1:•••••••••••••  2:•••••••••••••  3:•••••••••••••  4:•••••••••••••  5:•••••••••••••  6:•••••••••••••  7:•••••••••••••  8:•••••••••••••  9:•••••••••••••
- E2 blur accumulation (m≈1.5 px, blur σ1.3, noise 7, jitter, 10 frames, trials=30): accumulator accepted 0/30 (correct 0, WRONG 0), median accept frame -; any-frame full decode: zxing 0, zbar 0, repo 0
- E3 chimera test (A left 62% ×4 + B right 62% ×4, consistency=true, trials=40): accepted 0/40, of which A-or-B 0, CHIMERA (checksum-valid but neither) 0
- E3 chimera test (A left 62% ×4 + B right 62% ×4, consistency=false, trials=40): accepted 0/40, of which A-or-B 0, CHIMERA (checksum-valid but neither) 0
- E4 no-barcode frames (blank + noise σ25, 6 frames, trials=40): accepted 0/40
- E5 alternating A/B full codes (8 frames, trials=30): accepted 8/30 (A-or-B 8, chimera 0); decode saw >1 consistency group in 30/30
