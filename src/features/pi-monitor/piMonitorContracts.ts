/**
 * PINGÜINO PI Recipe Monitor — pure contracts (Agent B).
 *
 * The PI Monitor is a customer-friendly layer that shows where a recipe sits vs
 * the golden range on four customer-facing axes, lets the customer nudge intent
 * via STEPPED choices, and re-runs the recipe through the EXISTING optimization/
 * solver pipeline (never a new solver). This module is the pure type + capability
 * layer: no React, no IO, no clock, no randomness, no engine/solver call — the
 * heavy pipeline is DELEGATED through an injected runner (see `piMonitor.ts`).
 *
 * Golden bands are reused read-only via the `@/engine` `selectTargetBand` (in
 * `piMonitorAxes.ts`); no target number is ever re-hardcoded here.
 */
import type { ProductCategory } from '@/engine';
import type { NormalizedRecipeIntent, OptimizationDecision } from '@/spine';
import { proCoreCapabilitiesFor, type ProCorePersona } from '@/features/pro-core/proCoreCapabilities';

/** The four customer-facing axes (never the raw engine metric names). */
export type PiAxisId = 'slodycz' | 'miekkosc_twardosc' | 'kremowosc_tluszcz' | 'pelnia_body';

/** Stable display order for the four axes. */
export const PI_AXIS_ORDER: readonly PiAxisId[] = [
  'slodycz',
  'miekkosc_twardosc',
  'kremowosc_tluszcz',
  'pelnia_body',
];

/** Where a recipe sits relative to the golden band on one axis. */
export type AxisBandPosition = 'ponizej_zakresu' | 'w_zakresie' | 'powyzej_zakresu';

/**
 * The customer's STEPPED wish per axis — never a numeric slider. Rendered with
 * axis-specific Polish labels (e.g. słodycz: mniej słodkie / bez zmian / słodsze).
 */
export type AxisIntentStep = 'decrease' | 'keep' | 'increase';

export type PiAxisIntents = Readonly<Record<PiAxisId, AxisIntentStep>>;

/** All axes at "bez zmian" — the neutral starting point. */
export const NEUTRAL_AXIS_INTENTS: PiAxisIntents = Object.freeze({
  slodycz: 'keep',
  miekkosc_twardosc: 'keep',
  kremowosc_tluszcz: 'keep',
  pelnia_body: 'keep',
});

/**
 * The metric values the four axes read — a STRUCTURAL subset of the spine's
 * `BaseEngineMetrics` (a real metrics object satisfies it). `fat` is optional
 * because sorbet has no fat band (that axis is reported not-applicable).
 */
export interface PiAxisMetricValues {
  pod: number;
  iceFraction: number;
  fat?: number;
  solids: number;
}

/**
 * INJECTED ingredient-resolution summary. PI Monitor consumes this minimal
 * interface and NEVER imports the sibling Ingredient-Resolution module. Exact PI
 * recalculation is blocked while any ingredient is an unresolved generic
 * requirement.
 */
export interface IngredientResolutionSummary {
  allResolved: boolean;
  unresolvedCount: number;
  unresolvedNames: string[];
}

/** The persona resolves onto the canonical PRO CORE capability set. */
export type PiMonitorPersona = ProCorePersona;

/** The single grams gate (canonical capability — never isPro, never email). */
export interface PiGramVisibility {
  canViewExactGrams: boolean;
}

/** Resolve the grams gate for a persona via the canonical capability matrix. */
export function piGramVisibilityFor(persona: PiMonitorPersona): PiGramVisibility {
  return { canViewExactGrams: proCoreCapabilitiesFor(persona).canViewExactGrams };
}

/**
 * One axis reading for the customer. Numeric detail (`value`, `band`) is present
 * ONLY when the persona may view exact grams — for Demo those keys never enter
 * the payload (redaction at source, mirroring customer-flow/recipeView).
 */
export interface PiAxisReading {
  id: PiAxisId;
  /** Customer-facing Polish label, e.g. "Słodycz". */
  label: string;
  /** False when this product defines no band for the axis (e.g. sorbet fat). */
  applicable: boolean;
  position: AxisBandPosition | null;
  /** Honest Polish direction phrase, e.g. "słodsze niż zakres". */
  directionCopy: string;
  /** Present only when the persona may view exact grams AND the axis applies. */
  value?: number;
  /** Present only when the persona may view exact grams AND the axis applies. */
  band?: readonly [number, number];
}

/** The customer-facing recalculation outcome (honest labels). */
export type PiRecalcOutcome =
  | 'poprawione' // moved into range, no regression (engine decision: optimized)
  | 'kompromis' // improved one axis at the cost of another (engine decision: tradeoff)
  | 'juz_w_zakresie' // already in range, nothing to change (no_action_needed)
  | 'niemozliwe' // no safe correction lever exists (impossible)
  | 'zablokowane'; // pipeline blocked (blocked / unsupported)

/** Map the sanctioned engine `OptimizationDecision` onto the customer outcome. */
export function outcomeFromDecision(decision: OptimizationDecision): PiRecalcOutcome {
  switch (decision) {
    case 'optimized':
      return 'poprawione';
    case 'tradeoff':
      return 'kompromis';
    case 'no_action_needed':
      return 'juz_w_zakresie';
    case 'impossible':
      return 'niemozliwe';
    case 'blocked':
      return 'zablokowane';
  }
}

/* ------------------------------------------------------------------------ *
 * Injected recalculation runner (the sanctioned pipeline seam)             *
 * ------------------------------------------------------------------------ */

/** One proposed gram adjustment surfaced by the real solver (Home/Pro only). */
export interface PiProposedAdjustment {
  type: string;
  ingredient: string;
  grams: number;
}

/** What PI Monitor asks the injected runner to recalculate. */
export interface PiRecalculationRunnerInput {
  /** The intent with the customer's stepped wishes already applied. */
  intent: NormalizedRecipeIntent;
  /** The local recipe draft, opaque to the pure core (the adapter knows its type). */
  recipeDraft: unknown;
}

/**
 * The runner's result — a STRUCTURAL subset of the optimization feature's
 * `OptimizationPreviewView` (the real runner satisfies it). Carries the sanctioned
 * decision + rerun regression info, so PI Monitor never re-derives "did it improve".
 */
export interface PiRecalculationRunnerResult {
  category: ProductCategory;
  servingTemperatureC: number;
  beforeMetrics: PiAxisMetricValues;
  afterMetrics: PiAxisMetricValues | null;
  /** The final, rerun-verified decision from `verifyOptimizationRerun`. */
  decision: OptimizationDecision;
  /** Hard gates that FAILED after but not before (a regression) — from the rerun. */
  rerunNewFailures: readonly string[];
  /** Hard gates already failing that are now further out of band — from the rerun. */
  rerunWorsenedFailures: readonly string[];
  /** The solver's proposed gram adjustments (exposed to Home/Pro only). */
  proposedAdjustments: readonly PiProposedAdjustment[];
  /** The hypothetical corrected local draft (opaque) — the input to a LOCAL apply. */
  correctedRecipeSnapshot: unknown | null;
  warnings: readonly string[];
  hardBlockers: readonly string[];
}

/** The injected, deterministic recalculation runner (pure given a pure runner). */
export type PiRecalculationRunner = (
  input: PiRecalculationRunnerInput,
) => PiRecalculationRunnerResult;
