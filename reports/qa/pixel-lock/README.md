# Desktop pixel-lock evidence

Deterministic local capture environment:

- viewport: `2048 Ã— 1040`
- device scale factor: `1`
- locale: Polish
- browser zoom: `100%`
- animations/transitions/caret: disabled during capture
- `document.fonts.ready`: awaited before capture
- fixture: six Base rows, no toppings, Milk marked Main, ECO, Profile, settings confirmed

Commands:

```powershell
node scripts/captureDesktopPixelLock.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/buildPixelLockReport.ps1
```

The capture script reads real rendered DOM boxes and fails when any mandatory
anchor differs by more than `2 px`. The report script generates 50% overlays,
structural diffs and the independent logo-glyph bounding-box report.

Structural comparison uses zero raster masks. It filters isolated text-glyph
components while retaining control and card boundaries, gaps, dividers,
shadows, narrow scrollbars and panel geometry.

Results:

- mandatory DOM anchor assertions: `64/64 PASS`
- logo glyph assertions: `4/4 PASS`
- closed structural difference: `0.281325%`
- picker structural difference: `0.3279%`
- required threshold: `< 0.5%`

Machine-readable evidence:

- `bounding-box-results.json`
- `logo-bounds-results.json`
- `pixel-diff-results.json`

Raster evidence is provided for target, implementation, 50% overlay and
structural diff in both closed and picker-open states.
