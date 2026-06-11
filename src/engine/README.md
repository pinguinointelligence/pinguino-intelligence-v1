# src/engine — deterministic calculation core

Pure TypeScript, **zero dependencies, no React, no IO**. Same input → same output, always.

Spec: [Masterplan §12–§15](../../docs/PINGUINO_MASTERPLAN_V1.md). Arrives in the engine build step
(test-driven): `types → config → composition → pod → pac → iceFraction → statuses → scoring →
nutrition/cost → corrections`.

Rules: all coefficients live in `config/` (never inline); every result is stamped with
`ENGINE_VERSION` + `CONFIG_VERSION`; the corrections module stays IO-free and portable for the
planned `solve-corrections` Edge Function migration (Masterplan §10).
