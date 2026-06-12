# external calibration fixtures (Masterplan §15)

Real test-recipe data — the engine's calibration ground truth. Schema lands with the engine;
values are filled in from the product owner's screenshots and manual records.

Planned fixtures — **ingredient** kind: `honey`, `dry-glucose-syrup-39de`, `liquid-glucose-syrup`,
`inulin`, `alcohol-jim-beam`, `mascarpone`, `pistachio-paste`.
**Recipe** kind: `chocolate`, `raspberry`, `apple`, `banana`.

All fixtures start `status: 'pending'` (skipped by the test runner) until real data arrives.
When an `active` fixture disagrees with the engine: adjust `engine/config/` only — never
per-recipe hacks — and bump `CONFIG_VERSION`.
