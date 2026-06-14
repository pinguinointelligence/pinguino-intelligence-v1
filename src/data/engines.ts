/**
 * Engine catalog — temperature/service-profile engines (Step 6A).
 *
 * An "engine" is a calibrated temperature/service profile, NOT a product type.
 * Exactly ONE engine is active today: the −11°C Engine. The others are labels
 * only — not connected, no calibration — and must never have their behavior
 * faked (selecting one still computes on the −11°C Engine).
 *
 * TODO(future-engines): when a future temperature engine is implemented, give it
 * its own target temperature + ice anchors + external-reference calibration
 * fixtures, flip its status to 'active', and route the matching serving profile
 * to it (see servingProfiles.ts / intakeToRecipe.ts). Until then ACTIVE_ENGINE is
 * the only one that runs calculations.
 */
export type EngineStatus = 'active' | 'future';

export interface EngineProfile {
  id: string;
  /** Exact product label — the active engine is the "−11°C Engine". */
  label: string;
  status: EngineStatus;
  /** Serving temperature the engine targets (°C); null = to be determined (Fresh). */
  target_temperature_c: number | null;
  note?: string;
}

const FUTURE_NOTE = 'Future engine — not connected yet.';

export const ENGINES: readonly EngineProfile[] = [
  { id: 'engine-minus-11', label: '−11°C Engine', status: 'active', target_temperature_c: -11 },
  { id: 'engine-minus-12', label: '−12°C Engine', status: 'future', target_temperature_c: -12, note: FUTURE_NOTE },
  { id: 'engine-minus-13', label: '−13°C Engine', status: 'future', target_temperature_c: -13, note: FUTURE_NOTE },
  { id: 'engine-fresh', label: 'Fresh Engine', status: 'future', target_temperature_c: null, note: 'Future / to be tested — not connected yet.' },
  { id: 'engine-storage-18', label: 'Storage / Retail −18°C Engine', status: 'future', target_temperature_c: -18, note: 'Future / to be tested — not connected yet.' },
];

/** The only engine that runs calculations today. Every recipe is computed here. */
export const ACTIVE_ENGINE: EngineProfile = ENGINES.find((engine) => engine.status === 'active')!;

export const findEngine = (id: string): EngineProfile | undefined =>
  ENGINES.find((engine) => engine.id === id);
