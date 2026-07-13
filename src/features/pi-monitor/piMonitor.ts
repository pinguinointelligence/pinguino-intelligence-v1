/**
 * PINGÜINO PI Recipe Monitor — pure orchestration.
 *
 * Ties the pure axis mapping + intent mapping together and DELEGATES the actual
 * recalculation to an injected runner (the sanctioned optimization/solver
 * pipeline — never a new solver here). Enforces:
 *  - the ingredient-resolution gate (exact recalc blocked while any ingredient is
 *    an unresolved generic requirement — consumed via an injected summary);
 *  - persona gating (Demo = qualitative only, no grams; Home/Pro = exact grams via
 *    the canonical capability);
 *  - an HONEST optimized-vs-tradeoff verdict taken from the sanctioned rerun
 *    decision, plus a per-axis Przed/Po movement story.
 * Pure and deterministic: no React, no IO, no mutation, no persistence.
 */
import type { ProductCategory } from '@/engine';
import type { NormalizedRecipeIntent } from '@/spine';
import { mapRecipeToAxes } from './piMonitorAxes';
import { applyAxisIntentsToIntent } from './piMonitorIntent';
import {
  outcomeFromDecision,
  piGramVisibilityFor,
  PI_AXIS_ORDER,
  type IngredientResolutionSummary,
  type PiAxisId,
  type PiAxisMetricValues,
  type PiAxisReading,
  type PiAxisIntents,
  type PiMonitorPersona,
  type PiProposedAdjustment,
  type PiRecalcOutcome,
  type PiRecalculationRunner,
} from './piMonitorContracts';

/* ------------------------------------------------------------------------ *
 * Ingredient-resolution gate                                               *
 * ------------------------------------------------------------------------ */

export interface PiRecalcGate {
  canRecalculate: boolean;
  /** Exact Polish block copy when recalculation is gated, else null. */
  blockCopy: string | null;
}

/** Honest Polish noun form after "dla {n}": 1 → składnika, ≥2 → składników. */
function skladnikForm(n: number): string {
  return n === 1 ? 'składnika' : 'składników';
}

/**
 * The exact recalculation is blocked while any ingredient is an unresolved generic
 * requirement. Consumes the injected resolution summary; produces the exact,
 * honest-count block copy.
 */
export function evaluateRecalcGate(resolution: IngredientResolutionSummary): PiRecalcGate {
  if (resolution.allResolved) return { canRecalculate: true, blockCopy: null };
  const n = Math.max(1, resolution.unresolvedCount || resolution.unresolvedNames.length || 1);
  const blockCopy = `Najpierw wybierz konkretny produkt dla ${n} ${skladnikForm(n)}, aby PI mogło dokładnie przeliczyć recepturę.`;
  return { canRecalculate: false, blockCopy };
}

/* ------------------------------------------------------------------------ *
 * Monitor display (current recipe vs the golden range)                     *
 * ------------------------------------------------------------------------ */

export interface MonitorRecipeInput {
  metrics: PiAxisMetricValues;
  category: ProductCategory;
  servingTemperatureC: number;
  persona: PiMonitorPersona;
}

/** The current recipe mapped onto the four customer axes (persona-redacted). */
export function monitorRecipe(input: MonitorRecipeInput): PiAxisReading[] {
  return mapRecipeToAxes({
    metrics: input.metrics,
    category: input.category,
    servingTemperatureC: input.servingTemperatureC,
    capability: piGramVisibilityFor(input.persona),
  });
}

/* ------------------------------------------------------------------------ *
 * Recalculation (delegated to the injected sanctioned pipeline)            *
 * ------------------------------------------------------------------------ */

const OUTCOME_LABEL: Record<PiRecalcOutcome, string> = {
  poprawione: 'Poprawione',
  kompromis: 'Kompromis',
  juz_w_zakresie: 'Już w zakresie',
  niemozliwe: 'Nie da się bezpiecznie przeliczyć',
  zablokowane: 'Zablokowane',
};

export interface PiRecalculationView {
  gate: PiRecalcGate;
  /** True only when the resolution gate passed and the pipeline actually ran. */
  ran: boolean;
  gramsVisible: boolean;

  before: PiAxisReading[];
  after: PiAxisReading[] | null;

  /** The sanctioned outcome (null when the gate blocked the run). */
  outcome: PiRecalcOutcome | null;
  outcomeLabel: string;
  outcomeDetail: string;

  /** Axes that moved toward the range (improved). */
  changedAxes: PiAxisId[];
  /** Axes that moved out of / further from the range — the honest tradeoff. */
  tradedOffAxes: PiAxisId[];
  /** Axes whose wish became a real spine preference lever. */
  mappedAxes: PiAxisId[];
  /** Axes the customer nudged that have no direct lever (advisory only). */
  advisoryWishAxes: PiAxisId[];

  /** The solver's proposed gram adjustments — present ONLY for Home/Pro. */
  proposedAdjustments?: readonly PiProposedAdjustment[];
  /** Opaque hypothetical corrected draft for a LOCAL apply (never persisted). */
  correctedRecipeSnapshot: unknown | null;

  warnings: string[];
}

export interface RecalculateWithPiInput {
  baseIntent: NormalizedRecipeIntent;
  recipeDraft: unknown;
  axisIntents: PiAxisIntents;
  resolution: IngredientResolutionSummary;
  persona: PiMonitorPersona;
  /** The injected sanctioned recalculation runner (real engine + solver). */
  runner: PiRecalculationRunner;
}

/** Signed distance OUTSIDE the band (0 when in range). */
function outsideDistance(value: number, band: readonly [number, number]): number {
  if (value < band[0]) return band[0] - value;
  if (value > band[1]) return value - band[1];
  return 0;
}

const EPS = 1e-9;

/**
 * Run the customer's stepped wishes through the injected sanctioned pipeline and
 * build a LOCAL Przed/Po preview. Blocks (never runs) while ingredients are
 * unresolved. The optimized-vs-tradeoff verdict is the pipeline's own
 * rerun-verified decision; the per-axis improved/traded-off lists are computed
 * from the real before/after metrics. Nothing is saved or persisted.
 */
export function recalculateWithPi(input: RecalculateWithPiInput): PiRecalculationView {
  const { baseIntent, recipeDraft, axisIntents, resolution, persona, runner } = input;
  const capability = piGramVisibilityFor(persona);
  const gramsVisible = capability.canViewExactGrams === true;
  const gate = evaluateRecalcGate(resolution);
  const { intent, mappedAxes, advisoryWishAxes } = applyAxisIntentsToIntent(baseIntent, axisIntents);

  // Gate blocked → do NOT run the pipeline; show only the current reading + block copy.
  if (!gate.canRecalculate) {
    return {
      gate,
      ran: false,
      gramsVisible,
      before: [],
      after: null,
      outcome: null,
      outcomeLabel: 'Wymaga wyboru produktów',
      outcomeDetail: gate.blockCopy ?? '',
      changedAxes: [],
      tradedOffAxes: [],
      mappedAxes,
      advisoryWishAxes,
      correctedRecipeSnapshot: null,
      warnings: [],
    };
  }

  const result = runner({ intent, recipeDraft });
  const { category, servingTemperatureC } = result;

  const before = mapRecipeToAxes({ metrics: result.beforeMetrics, category, servingTemperatureC, capability });
  const after = result.afterMetrics
    ? mapRecipeToAxes({ metrics: result.afterMetrics, category, servingTemperatureC, capability })
    : null;

  const outcome = outcomeFromDecision(result.decision);

  // Per-axis Przed/Po movement — computed internally at full precision (independent
  // of the persona redaction) so the improved/traded-off story is always honest.
  const changedAxes: PiAxisId[] = [];
  const tradedOffAxes: PiAxisId[] = [];
  if (result.afterMetrics) {
    const beforeFull = mapRecipeToAxes({ metrics: result.beforeMetrics, category, servingTemperatureC, capability: { canViewExactGrams: true } });
    const afterFull = mapRecipeToAxes({ metrics: result.afterMetrics, category, servingTemperatureC, capability: { canViewExactGrams: true } });
    for (const id of PI_AXIS_ORDER) {
      const b = beforeFull.find((r) => r.id === id);
      const a = afterFull.find((r) => r.id === id);
      if (!b || !a || !b.applicable || !a.applicable) continue;
      if (b.value === undefined || a.value === undefined || !b.band || !a.band) continue;
      const bd = outsideDistance(b.value, b.band);
      const ad = outsideDistance(a.value, a.band);
      if (ad < bd - EPS) changedAxes.push(id);
      else if (ad > bd + EPS) tradedOffAxes.push(id);
    }
  }

  const outcomeDetail = buildOutcomeDetail(outcome, {
    tradedOffAxes,
    changedAxes,
    warnings: result.warnings,
    hardBlockers: result.hardBlockers,
  });

  const view: PiRecalculationView = {
    gate,
    ran: true,
    gramsVisible,
    before,
    after,
    outcome,
    outcomeLabel: OUTCOME_LABEL[outcome],
    outcomeDetail,
    changedAxes,
    tradedOffAxes,
    mappedAxes,
    advisoryWishAxes,
    correctedRecipeSnapshot: result.correctedRecipeSnapshot,
    warnings: [...result.warnings],
  };
  // Exact gram adjustments are exposed ONLY to a persona that may view exact grams.
  if (gramsVisible) view.proposedAdjustments = result.proposedAdjustments;
  return view;
}

function axisNames(ids: PiAxisId[]): string {
  const LABELS: Record<PiAxisId, string> = {
    slodycz: 'słodycz',
    miekkosc_twardosc: 'twardość',
    kremowosc_tluszcz: 'kremowość',
    pelnia_body: 'pełnię',
  };
  return ids.map((id) => LABELS[id]).join(', ');
}

function buildOutcomeDetail(
  outcome: PiRecalcOutcome,
  ctx: { tradedOffAxes: PiAxisId[]; changedAxes: PiAxisId[]; warnings: readonly string[]; hardBlockers: readonly string[] },
): string {
  switch (outcome) {
    case 'poprawione':
      return ctx.changedAxes.length
        ? `PI przesunęło recepturę w stronę zakresu (${axisNames(ctx.changedAxes)}).`
        : 'PI przesunęło recepturę w stronę zakresu.';
    case 'kompromis':
      return ctx.tradedOffAxes.length
        ? `PI poprawiło jedną cechę kosztem innej — zmieniło się: ${axisNames(ctx.tradedOffAxes)}. To kompromis, nie pełne dopasowanie.`
        : 'PI poprawiło recepturę, ale część cech nadal jest poza zakresem. To kompromis, nie pełne dopasowanie.';
    case 'juz_w_zakresie':
      return 'Receptura jest już w zakresie — nie ma nic do zmiany.';
    case 'niemozliwe':
      return 'PI nie znalazło bezpiecznego sposobu, by przeliczyć tę recepturę bez pogorszenia innej cechy.';
    case 'zablokowane':
      return ctx.hardBlockers.length
        ? `PI nie może przeliczyć tej receptury: ${ctx.hardBlockers.join(', ')}.`
        : 'PI nie może teraz przeliczyć tej receptury.';
  }
}
