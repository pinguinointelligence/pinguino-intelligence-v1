/**
 * Explain contract (UI/UX master spec §20.4) — a PURE builder that turns a
 * solver proposal and/or a feasibility analysis into plain-language reason
 * entries, WITHOUT target-band numbers and WITHOUT formulas.
 *
 * Honesty rules:
 *  - causality is REUSED from what the engine already emitted, never invented:
 *    a proposal's `affected_metrics`/`reasons` are index-aligned with the
 *    violations the solver targeted (audit: solver.ts builds both from the
 *    same `targets` array), and when the action count matches the target
 *    count, action i was generated FOR target i (the solver selects candidate
 *    i for violation i before the joint solve). Any other shape falls back to
 *    the proposal's PRIMARY reason for all actions — attributed as the
 *    proposal's goal, not per-action causality;
 *  - entries carry ingredient names and gram amounts (§19.1/§20.4 show grams)
 *    but never band min/max values, band centers, metric readings or scoring
 *    weights;
 *  - locked lines are explained from the CONSTRAINT SET (deterministic
 *    ground truth), mirroring "Nie zmieniono mleka ani truskawek, ponieważ
 *    ich gramatury są zablokowane".
 *
 * The domain emits structured entries (codes + params). `renderConstraintExplanationEn`
 * is the reference English renderer (repo copy language is English); moving
 * these strings into src/copy/en.ts is the UI track's wiring step.
 */
import type { CorrectionProposal, RecipeInput, TargetMetric } from '@/engine';
import type { ConstraintFeasibilityAnalysis, ConstraintSet } from './constraintTypes';

/* ── entry model ─────────────────────────────────────────────────────────── */

export type ConstraintExplanationEntry =
  | {
      kind: 'action';
      verb: 'add' | 'reduce';
      ingredientName: string;
      grams: number;
      /** The engine-emitted target this action serves (null when the engine
       * gave no per-action attribution — see module header). */
      reasonMetric: TargetMetric | null;
      reasonDirection: 'low' | 'high' | null;
    }
  | { kind: 'locked_unchanged'; ingredientNames: string[] }
  | { kind: 'in_band' }
  | {
      kind: 'bound';
      boundType: 'max' | 'min';
      ingredientName: string;
      lockedGrams: number;
      boundGrams: number;
    }
  | { kind: 'conflict_group'; ingredientNames: string[] }
  | { kind: 'no_reliable_bound' };

/* ── builders ────────────────────────────────────────────────────────────── */

const parseDirection = (reason: string): 'low' | 'high' | null =>
  reason.endsWith('_low') ? 'low' : reason.endsWith('_high') ? 'high' : null;

/** Names of the lines the constraint set locks (locked | range), in recipe order. */
function constrainedIngredientNames(input: RecipeInput, set: ConstraintSet): string[] {
  return input.items
    .filter((item) => {
      const constraint = set.byLineId[item.id];
      return constraint !== undefined && constraint.mode !== 'ai';
    })
    .map((item) => item.ingredient.name);
}

/**
 * Explain one non-redacted solver proposal: one entry per action with the
 * engine-emitted reason, plus a locked-unchanged entry when the constraint
 * set holds any line. Returns [] for a redacted or action-less proposal —
 * nothing is fabricated when the engine proposed nothing.
 */
export function buildProposalExplanation(
  input: RecipeInput,
  set: ConstraintSet,
  proposal: CorrectionProposal,
): ConstraintExplanationEntry[] {
  const entries: ConstraintExplanationEntry[] = [];

  // Per-action attribution only when the engine's own target list aligns 1:1.
  const aligned =
    proposal.actions.length === proposal.affected_metrics.length &&
    proposal.affected_metrics.length === proposal.reasons.length;

  proposal.actions.forEach((action, index) => {
    const metric = aligned ? proposal.affected_metrics[index] : proposal.affected_metrics[0];
    const reason = aligned ? proposal.reasons[index] : proposal.reasons[0];
    entries.push({
      kind: 'action',
      verb: action.type,
      ingredientName: action.ingredient_name,
      grams: action.grams,
      reasonMetric: metric ?? null,
      reasonDirection: reason ? parseDirection(reason) : null,
    });
  });

  const lockedNames = constrainedIngredientNames(input, set);
  if (lockedNames.length > 0) {
    entries.push({ kind: 'locked_unchanged', ingredientNames: lockedNames });
  }

  return entries;
}

/** Explain a feasibility analysis outcome (§18.2/§18.4/§18.5 messages). */
export function buildFeasibilityExplanation(
  input: RecipeInput,
  analysis: ConstraintFeasibilityAnalysis,
): ConstraintExplanationEntry[] {
  switch (analysis.status) {
    case 'feasible':
      return [{ kind: 'in_band' }];
    case 'infeasible_with_bound': {
      const line = input.items.find((item) => item.id === analysis.bound.lineId);
      return [
        {
          kind: 'bound',
          boundType: analysis.bound.boundType,
          ingredientName: analysis.bound.ingredientName,
          lockedGrams: line?.planned_grams ?? Number.NaN,
          boundGrams: analysis.bound.displayGrams,
        },
      ];
    }
    case 'conflict_group': {
      const nameById = new Map(input.items.map((item) => [item.id, item.ingredient.name]));
      return [
        {
          kind: 'conflict_group',
          ingredientNames: analysis.conflict.lineIds.map(
            (lineId) => nameById.get(lineId) ?? lineId,
          ),
        },
      ];
    }
    case 'no_reliable_bound':
      return [{ kind: 'no_reliable_bound' }];
    case 'invalid_constraints':
      return [];
  }
}

/* ── reference English renderer ──────────────────────────────────────────── */

/** Product-language phrases for the engine's violation reasons — sensory
 * consequences only, no metric readings, no band values, no internal names
 * beyond what Pro already sees in the PI panel. */
const REASON_PHRASES: Readonly<Record<TargetMetric, { low: string; high: string }>> = {
  pod: { low: 'the recipe was not sweet enough', high: 'the recipe was too sweet' },
  npac: {
    low: 'the recipe would freeze too hard',
    high: 'the recipe would stay too soft when frozen',
  },
  ice_fraction: {
    low: 'the recipe would be too soft at serving temperature',
    high: 'the recipe would be too icy at serving temperature',
  },
  water: { low: 'the mix had too little water', high: 'the mix had too much free water' },
  total_solids: { low: 'the body was too thin', high: 'the body was too dense' },
  fat: { low: 'creaminess needed more fat', high: 'the fat level was too rich' },
  aerating_protein: {
    low: 'the structure risked collapsing without more protein',
    high: 'the protein level was too high for a smooth texture',
  },
  protein_in_solids: {
    low: 'the solids carried too little protein',
    high: 'the solids carried too much protein',
  },
  lactose: { low: 'the dairy sugars were too low', high: 'the dairy sugars risked crystallizing' },
  lactose_sandiness_risk: {
    low: 'the lactose balance was below the smooth zone',
    high: 'there was a risk of sandy texture from lactose',
  },
  alcohol: {
    low: 'the alcohol level was below the intended character',
    high: 'the alcohol level would prevent stable freezing',
  },
};

const formatGrams = (grams: number): string =>
  `${(Math.round(grams * 10) / 10).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })} g`;

const listNames = (names: string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** Reference renderer (see module header). One plain sentence per entry;
 * never emits band numbers — the only numbers are gram amounts. */
export function renderConstraintExplanationEn(entry: ConstraintExplanationEntry): string {
  switch (entry.kind) {
    case 'action': {
      const verb = entry.verb === 'add' ? 'Added' : 'Reduced';
      const preposition = entry.verb === 'add' ? '' : ' by';
      const reason =
        entry.reasonMetric && entry.reasonDirection
          ? `, because ${REASON_PHRASES[entry.reasonMetric][entry.reasonDirection]}`
          : '';
      return `${verb} ${entry.ingredientName}${preposition} ${formatGrams(entry.grams)}${reason}.`;
    }
    case 'locked_unchanged':
      return `${listNames(entry.ingredientNames)} ${
        entry.ingredientNames.length === 1 ? 'was' : 'were'
      } not changed, because ${
        entry.ingredientNames.length === 1 ? 'its grams are' : 'their grams are'
      } locked.`;
    case 'in_band':
      return 'The recipe is in the optimal range with the current locks.';
    case 'bound': {
      const direction = entry.boundType === 'max' ? 'at most' : 'at least';
      return `${entry.ingredientName} is locked at ${formatGrams(entry.lockedGrams)}. To reach the optimal range, set ${direction} ${formatGrams(entry.boundGrams)}.`;
    }
    case 'conflict_group':
      return `The locked ingredients ${listNames(entry.ingredientNames)} together prevent reaching the optimal range. Unlock one of them, change a range, increase the batch, or keep the recipe as it is.`;
    case 'no_reliable_bound':
      return 'No solution in the optimal range was found with the current locks. Unlock one of the marked ingredients or change the batch.';
  }
}
