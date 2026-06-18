/**
 * −11°C Engine Contract (Slice 1A.5) — a read-only, drift-proof Knowledge Pack.
 *
 * This is the machine-readable companion to docs/engine/MINUS_11_ENGINE_CONTRACT.md.
 * A future AI/API layer consumes it as guardrails. It is NOT a calculator and adds
 * NO math: every numeric is IMPORTED from the canonical engine config
 * (src/engine/config/*) and re-exposed, so it cannot drift. The drift test
 * (./minus11EngineContract.test.ts) asserts each value equals its engine source.
 *
 * Leaf module by design — NOT re-exported from the engine barrel (src/engine/index.ts)
 * this slice. It is infrastructure/guardrails for the future API layer, not part of
 * the deterministic calculation API. It imports only engine config (pure data, no IO),
 * keeping the engine portable. The engine label and reference-recipe names are owned
 * here as plain strings and cross-checked against their canonical sources in the test
 * (src/data/engines.ts and the committed −11°C fixtures) — importing those into a
 * production engine module would invert layering / pull test scaffolding into the graph.
 *
 * SCOPE: −11°C ONLY. Every value recovered from the planning history was measured at
 * −11°C; nothing here validates −10 / −12 / −13°C or any future temperature profile.
 */
import { MODES } from '../config/modes';
import { GOLDEN_MIDDLE_PRIORITY } from '../config/priorities';
import { IDEAL_ZONE_FRACTION, TARGET_BANDS } from '../config/targets';
import { CONFIG_VERSION, ENGINE_VERSION } from '../config/version';
import type { PriorityKey, ProductCategory, ProductMode, TargetMetric, TargetRange } from '../types';

export interface ContractReferenceRecipe {
  readonly name: string;
  readonly category: ProductCategory;
  readonly temperature_c: number;
}

export interface Minus11EngineContract {
  /** Tracks the contract's own prose/shape, independent of engine math. */
  readonly contract_revision: string;
  /** The active engine label — '−11°C Engine' (U+2212). Cross-checked vs ACTIVE_ENGINE.label. */
  readonly engine_label: string;
  readonly scope: 'minus_11c_only';
  readonly temperature_c: -11;
  /** The ONLY serving temperatures this contract validates. */
  readonly validated_temperatures_c: readonly number[];
  /** Composed from the engine identity (never an independent number). */
  readonly version: { readonly engine_version: string; readonly config_version: string };
  readonly ideal_zone_fraction: number;
  /** The seeded milk_gelato @ −11°C band (the only seeded band today). */
  readonly milk_gelato_minus_11_band: Readonly<Record<TargetMetric, TargetRange>>;
  /** Golden Middle priority order (hero/taste → … → cost). */
  readonly priority_order: readonly PriorityKey[];
  /** Whether the hero/main ingredient is protected from reduction, per mode. */
  readonly hero_protected_by_mode: Readonly<Record<ProductMode, boolean>>;
  /** Confirmed external-reference diagnostic recipes (−11°C only). */
  readonly reference_recipes: readonly ContractReferenceRecipe[];
}

/** The seeded milk_gelato @ −11°C band — the single canonical source for the ranges. */
const MILK_GELATO_MINUS_11_BAND = TARGET_BANDS.find(
  (band) => band.category === 'milk_gelato' && band.temperature_c === -11,
)!.metrics;

export const MINUS_11_ENGINE_CONTRACT: Minus11EngineContract = {
  contract_revision: '1A.5',
  engine_label: '−11°C Engine',
  scope: 'minus_11c_only',
  temperature_c: -11,
  validated_temperatures_c: [-11],
  version: { engine_version: ENGINE_VERSION, config_version: CONFIG_VERSION },
  ideal_zone_fraction: IDEAL_ZONE_FRACTION,
  milk_gelato_minus_11_band: MILK_GELATO_MINUS_11_BAND,
  priority_order: GOLDEN_MIDDLE_PRIORITY,
  hero_protected_by_mode: {
    eco: MODES.eco.main_ingredient.reduce_forbidden,
    classic: MODES.classic.main_ingredient.reduce_forbidden,
    premium: MODES.premium.main_ingredient.reduce_forbidden,
    signature: MODES.signature.main_ingredient.reduce_forbidden,
  },
  reference_recipes: [
    { name: 'External Reference Chocolate #123 -11C', category: 'chocolate_gelato', temperature_c: -11 },
    { name: 'External Reference Ultra-Fruit Raspberry-428 -11C', category: 'fruit_gelato', temperature_c: -11 },
  ],
};
