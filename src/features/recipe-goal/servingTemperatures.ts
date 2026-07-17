/**
 * Pro serving-temperature choice — EXACTLY the engine's real serving cells
 * (TARGET_BANDS carry −11/−12/−13 per category; nothing engine-side changed).
 * AUDIT #5 (P0) + SPEC §11.1, owner decision 2026-07-17 (Slice C): −14 was an
 * unapproved cell and −18°C is a STORAGE temperature (SPEC §11.2 — see
 * src/data/servingProfiles.ts) — neither may be offered as serving.
 */
export const SERVING_TEMPERATURES_C = [-11, -12, -13] as const;
