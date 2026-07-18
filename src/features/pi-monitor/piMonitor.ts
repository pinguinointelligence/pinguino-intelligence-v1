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
import type { NormalizedRecipeIntent, OptimizationRerunState } from '@/spine';
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
  type PiRecalcFailureReason,
  type PiRecalcOutcome,
  type PiRecalculationRunner,
  type PiRecalculationRunnerResult,
} from './piMonitorContracts';
import { TUNING_NOT_APPROVED_COPY } from './monitorTuningApproval';

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

/**
 * Customer-facing outcome headlines. The two FAILURE outcomes never use a
 * generic "impossible" verdict — they carry an honest headline and the detail
 * always states, verbatim, that nothing was changed (Track G).
 */
const OUTCOME_LABEL: Record<PiRecalcOutcome, string> = {
  poprawione: 'Poprawione',
  kompromis: 'Kompromis',
  juz_w_zakresie: 'Już w zakresie',
  niemozliwe: 'PI nie zmieniło receptury',
  zablokowane: 'PI nie mogło przeliczyć',
};

/**
 * The rerun states that constitute a VERIFIED optimizer no-solution — the only
 * states allowed to be presented to the customer as mathematical infeasibility
 * (`niemozliwe`). Anything else that somehow reaches an `impossible` decision is
 * a data/service problem and is honestly downgraded to `zablokowane`.
 */
const VERIFIED_INFEASIBLE_STATES: ReadonlySet<OptimizationRerunState> = new Set([
  'solver_no_correction',
  'no_feasible_plan',
]);

/**
 * Map the sanctioned pipeline result onto the honest customer outcome + the
 * structured failure reason (owner taxonomy). The infeasibility rule: only a
 * VERIFIED optimizer no-solution, aimed at THIS recipe's own approved target
 * band, is `optimizer_no_solution` / `niemozliwe`. A fallback-band solve or an
 * unverified state is an integration/data problem — an honest block, never math.
 */
function classifyRunOutcome(result: PiRecalculationRunnerResult): {
  outcome: PiRecalcOutcome;
  failureReason: PiRecalcFailureReason | null;
} {
  const outcome = outcomeFromDecision(result.decision);
  if (outcome === 'niemozliwe') {
    if (!VERIFIED_INFEASIBLE_STATES.has(result.rerunState)) {
      return { outcome: 'zablokowane', failureReason: 'constraint_verification_failed' };
    }
    if (!result.solverTargetAligned) {
      return { outcome: 'zablokowane', failureReason: 'correction_targets_not_connected' };
    }
    return { outcome: 'niemozliwe', failureReason: 'optimizer_no_solution' };
  }
  if (outcome === 'zablokowane') {
    return {
      outcome,
      failureReason: result.hardBlockers.includes('optimizer_blocked')
        ? 'profile_not_supported'
        : 'constraint_verification_failed',
    };
  }
  return { outcome, failureReason: null };
}

export interface PiRecalculationView {
  gate: PiRecalcGate;
  /** True only when the resolution gate passed and the pipeline actually ran. */
  ran: boolean;
  gramsVisible: boolean;

  before: PiAxisReading[];
  after: PiAxisReading[] | null;

  /** The sanctioned outcome (null when the run was blocked before the pipeline). */
  outcome: PiRecalcOutcome | null;
  outcomeLabel: string;
  outcomeDetail: string;
  /**
   * Structured reason when the recalculation failed or was blocked; null on
   * success. Only `optimizer_no_solution` is ever presented as mathematical
   * infeasibility (Track G owner taxonomy).
   */
  failureReason: PiRecalcFailureReason | null;

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
  /**
   * Whether interactive tuning is approved for this recipe's serving temperature
   * (see `monitorTuningApproval.ts`). Default true (Studio/dev callers). When
   * false the pipeline is NEVER run — an unvalidated cell must not produce
   * PI-endorsed gram changes — and the honest structured state is returned.
   */
  tuningApproved?: boolean;
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

  const blockedView = (
    outcomeLabel: string,
    outcomeDetail: string,
    failureReason: PiRecalcFailureReason,
  ): PiRecalculationView => ({
    gate,
    ran: false,
    gramsVisible,
    before: [],
    after: null,
    outcome: null,
    outcomeLabel,
    outcomeDetail,
    failureReason,
    changedAxes: [],
    tradedOffAxes: [],
    mappedAxes,
    advisoryWishAxes,
    correctedRecipeSnapshot: null,
    warnings: [],
  });

  // Gate blocked → do NOT run the pipeline; show only the current reading + block copy.
  if (!gate.canRecalculate) {
    return blockedView('Wymaga wyboru produktów', gate.blockCopy ?? '', 'ingredient_not_engine_ready');
  }

  // Tuning not approved for this serving temperature → NEVER run the pipeline:
  // an unvalidated cell must not produce PI-endorsed gram changes (Track G).
  if (input.tuningApproved === false) {
    return blockedView(
      'Dostrajanie Monitorem niedostępne',
      `${TUNING_NOT_APPROVED_COPY} ${RECIPE_NOT_CHANGED}`,
      'correction_targets_not_approved',
    );
  }

  const result = runner({ intent, recipeDraft });
  const { category, servingTemperatureC } = result;

  const before = mapRecipeToAxes({ metrics: result.beforeMetrics, category, servingTemperatureC, capability });
  const after = result.afterMetrics
    ? mapRecipeToAxes({ metrics: result.afterMetrics, category, servingTemperatureC, capability })
    : null;

  // Honest structured outcome + failure classification (Track G taxonomy).
  const { outcome, failureReason } = classifyRunOutcome(result);

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
    failureReason,
    servingTemperatureC: result.servingTemperatureC,
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
    failureReason,
    changedAxes,
    tradedOffAxes,
    mappedAxes,
    advisoryWishAxes,
    // The corrected recipe carries exact grams — expose it ONLY to a persona that
    // may view exact grams (Demo never receives it, even in local state). §22.
    correctedRecipeSnapshot: gramsVisible ? result.correctedRecipeSnapshot : null,
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

/** The verbatim sentence every FAILED recalculation must state (Track G). */
const RECIPE_NOT_CHANGED = 'Receptura nie została zmieniona.';

/**
 * Turn the structured failure reason into ONE honest, customer-safe phrase —
 * never raw engine codes. An integration/approval gap is named as such; only
 * `optimizer_no_solution` speaks the language of "no safe change exists".
 */
function describeFailure(reason: PiRecalcFailureReason | null): string {
  switch (reason) {
    case 'correction_targets_not_connected':
    case 'correction_targets_not_approved':
      return TUNING_NOT_APPROVED_COPY;
    case 'profile_not_supported':
      return 'PI nie może teraz przeliczyć tej receptury — wybrany tryb lub temperatura podawania nie są jeszcze w pełni obsługiwane.';
    case 'constraint_verification_failed':
      return 'PI nie może teraz przeliczyć tej receptury — brakuje pełnych danych, aby zweryfikować wynik bezpiecznie.';
    case 'locked_constraints_conflict':
      return 'PI nie może teraz przeliczyć tej receptury — zablokowane składniki nie zostawiają bezpiecznego pola zmian.';
    case 'backend_failure':
      return 'PI nie może teraz przeliczyć tej receptury — usługa jest chwilowo niedostępna.';
    default:
      return 'PI nie może teraz przeliczyć tej receptury.';
  }
}

function buildOutcomeDetail(
  outcome: PiRecalcOutcome,
  ctx: {
    tradedOffAxes: PiAxisId[];
    changedAxes: PiAxisId[];
    failureReason: PiRecalcFailureReason | null;
    servingTemperatureC: number | null;
  },
): string {
  const tempPhrase =
    ctx.servingTemperatureC != null ? ` przy podawaniu w temperaturze ${ctx.servingTemperatureC}°C` : '';
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
      // VERIFIED optimizer no-solution: the solver actually ran on this cell's own
      // approved targets and found no safe change. Honest + specific (names the
      // serving temperature) — and always states that nothing was changed.
      return `PI nie znalazło bezpiecznej zmiany, która dopasowałaby tę recepturę${tempPhrase} bez pogorszenia innych cech. ${RECIPE_NOT_CHANGED}`;
    case 'zablokowane':
      return `${describeFailure(ctx.failureReason)} ${RECIPE_NOT_CHANGED}`;
  }
}
