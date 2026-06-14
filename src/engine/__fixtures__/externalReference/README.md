# external calibration fixtures (Masterplan §15)

Real test-recipe data — the engine's calibration ground truth. Schema lands with the engine;
values are filled in from the product owner's screenshots and manual records.

Planned fixtures — **ingredient** kind: `honey`, `dry-glucose-syrup-39de`, `liquid-glucose-syrup`,
`inulin`, `alcohol-jim-beam`, `mascarpone`, `pistachio-paste`.
**Recipe** kind: `chocolate`, `raspberry`, `apple`, `banana`.

All 11 planned fixtures above start `status: 'pending'` (skipped by the test runner) until real
data arrives. When an `active` fixture disagrees with the engine: adjust `engine/config/` only —
never per-recipe hacks — and bump `CONFIG_VERSION`.

**Active fixtures (verified, report-only):** `milk-base.ts` and `raspberry-premium.ts` (each a
separate active recipe, kept out of the 11-pending list). Together they confirmed the spec §8
NPAC normalization basis is **`per_water_mass`** — applied in CONFIG_VERSION 0.5.0 (see
`../../config/coefficients.ts`). Their calibration reports remain report-only.
