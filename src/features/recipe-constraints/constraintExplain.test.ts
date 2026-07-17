/**
 * §20.4 Explain contract: plain-language entries built from REAL engine
 * proposals and feasibility outcomes; reasons are reused engine codes; the
 * output exposes NO target-band numbers and no formulas.
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, proposeAutoFix, type CorrectionProposal } from '@/engine';
import { recipeContext } from '@/features/studio/buildRecipeInput';
import {
  buildFeasibilityExplanation,
  buildProposalExplanation,
  renderConstraintExplanationEn,
} from './constraintExplain';
import { analyzeConstraintFeasibility } from './constraintFeasibility';
import { applyConstraintsToRecipe } from './constraintSet';
import { overSweetStarter, starterLine } from './constraintFixtures';
import type { ConstraintSet } from './constraintTypes';

const SUCROSE = starterLine('sucrose');
const MILK = starterLine('milk_3_5');

/** Band values of every indicator the engine reports for a recipe — the
 * numbers that §20.4 forbids in explanations. */
const bandNumbersOf = (input: ReturnType<typeof overSweetStarter>): number[] => {
  const result = calculateRecipe(input);
  const numbers: number[] = [];
  for (const indicator of result.indicators) {
    if (indicator.band) {
      numbers.push(indicator.band.min, indicator.band.max);
      if (indicator.band.warn_above !== undefined) numbers.push(indicator.band.warn_above);
      if (indicator.band.warn_below !== undefined) numbers.push(indicator.band.warn_below);
    }
    if (indicator.value !== null) numbers.push(indicator.value);
  }
  return numbers;
};

const numericTokens = (text: string): number[] =>
  (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

describe('buildProposalExplanation (§20.4)', () => {
  const makeRealProposal = (): {
    proposal: CorrectionProposal;
    set: ConstraintSet;
    input: ReturnType<typeof overSweetStarter>;
  } => {
    // Mild over-sweet recipe with MILK locked: the real solver proposes the
    // sucrose reduce (high confidence) while the milk lock holds.
    const base = overSweetStarter(150);
    const set: ConstraintSet = { byLineId: { [MILK]: { mode: 'locked', grams: 670 } } };
    const applied = applyConstraintsToRecipe(base, set);
    if (!applied.ok) throw new Error('apply failed');
    const solve = proposeAutoFix({
      input: applied.input,
      context: recipeContext(applied.input),
      exactCorrectionGrams: true,
    });
    if (solve.redacted) throw new Error('unexpected redaction');
    const proposal = solve.proposals.find(
      (candidate) => candidate.kind === 'correction' && candidate.actions.length > 0,
    );
    if (!proposal) throw new Error('no correction proposal');
    return { proposal, set, input: applied.input };
  };

  it('one entry per action with the ENGINE-emitted reason, plus the locked note', () => {
    const { proposal, set, input } = makeRealProposal();
    const entries = buildProposalExplanation(input, set, proposal);

    const action = entries.find((entry) => entry.kind === 'action');
    expect(action).toBeDefined();
    if (action?.kind !== 'action') return;
    expect(action.verb).toBe('reduce');
    expect(action.ingredientName).toBe('Sucrose');
    expect(action.reasonMetric).toBe('pod');
    expect(action.reasonDirection).toBe('high');

    const locked = entries.find((entry) => entry.kind === 'locked_unchanged');
    expect(locked).toBeDefined();
    if (locked?.kind !== 'locked_unchanged') return;
    expect(locked.ingredientNames).toEqual(['Milk 3.5 %']);
  });

  it('renders the spec §20.4 sentence shapes', () => {
    const { proposal, set, input } = makeRealProposal();
    const [actionText, lockedText] = buildProposalExplanation(input, set, proposal).map(
      renderConstraintExplanationEn,
    );
    expect(actionText).toMatch(/^Reduced Sucrose by \d+(\.\d)? g, because the recipe was too sweet\.$/);
    expect(lockedText).toBe('Milk 3.5 % was not changed, because its grams are locked.');
  });

  it('exposes NO band numbers and no raw metric readings (§20.4 hard rule)', () => {
    const { proposal, set, input } = makeRealProposal();
    const entries = buildProposalExplanation(input, set, proposal);
    const rendered = entries.map(renderConstraintExplanationEn).join(' ');

    // structural: entries carry no band-like fields at all
    for (const entry of entries) {
      expect(JSON.stringify(entry)).not.toMatch(/"band|"min|"max|warn_above|warn_below/);
    }
    // numeric: every number in the text is an action gram amount (rounded for
    // display) or part of an ingredient name — never a band edge or a metric
    // reading of this recipe
    const allowed = new Set<number>([
      ...proposal.actions.map((a) => Math.round(a.grams * 10) / 10),
      3.5, // "Milk 3.5 %" — the ingredient's name
    ]);
    for (const token of numericTokens(rendered)) {
      expect(allowed.has(token), `unexpected number ${token} in "${rendered}"`).toBe(true);
    }
    const forbidden = new Set(bandNumbersOf(input).map((n) => Math.round(n * 100) / 100));
    for (const token of numericTokens(rendered)) {
      expect(forbidden.has(token), `band/metric number ${token} leaked`).toBe(false);
    }
    // no band talk, no internal metric names, no formula operators (the '%'
    // in "Milk 3.5 %" is the ingredient's own display name, not a metric)
    expect(rendered).not.toMatch(/\bband\b|\btarget\b|\bPOD\b|\bNPAC\b|[=+×]/i);
  });

  it('falls back to the primary reason when the engine gives no per-action alignment', () => {
    const { proposal, set, input } = makeRealProposal();
    const misaligned: CorrectionProposal = {
      ...proposal,
      actions: [
        ...proposal.actions,
        { ...proposal.actions[0]!, ingredient_id: 'x', ingredient_name: 'Extra', grams: 1 },
      ],
    };
    const entries = buildProposalExplanation(input, set, misaligned);
    const actions = entries.filter((entry) => entry.kind === 'action');
    expect(actions).toHaveLength(2);
    for (const action of actions) {
      if (action.kind !== 'action') continue;
      expect(action.reasonMetric).toBe(misaligned.affected_metrics[0]);
    }
  });
});

describe('buildFeasibilityExplanation (§18.2/§18.5 copy shapes)', () => {
  it('bound outcome → the exact §18.2 sentence pattern with ONLY gram numbers', () => {
    const input = overSweetStarter(220);
    const analysis = analyzeConstraintFeasibility(input, {
      byLineId: { [SUCROSE]: { mode: 'locked', grams: 220 } },
    });
    if (analysis.status !== 'infeasible_with_bound') throw new Error('unexpected status');
    const entries = buildFeasibilityExplanation(input, analysis);
    expect(entries).toHaveLength(1);
    const text = renderConstraintExplanationEn(entries[0]!);
    expect(text).toBe(
      `Sucrose is locked at 220 g. To reach the optimal range, set at most ${analysis.bound.displayGrams} g.`,
    );
    // the only numbers are the locked grams and the verified bound
    expect(numericTokens(text).sort((a, b) => a - b)).toEqual(
      [analysis.bound.displayGrams, 220].sort((a, b) => a - b),
    );
  });

  it('no_reliable_bound → the honest §18.5 fallback sentence with NO numbers', () => {
    const entries = buildFeasibilityExplanation(overSweetStarter(220), {
      status: 'no_reliable_bound',
      reasonCode: 'not_solvable_by_constraint_changes',
      lineIds: [SUCROSE],
      violationsBefore: [],
      evaluationsUsed: 20,
    });
    const text = renderConstraintExplanationEn(entries[0]!);
    expect(text).toBe(
      'No solution in the optimal range was found with the current locks. Unlock one of the marked ingredients or change the batch.',
    );
    expect(numericTokens(text)).toEqual([]);
  });

  it('conflict group → names every group member', () => {
    const input = overSweetStarter(150);
    const entries = buildFeasibilityExplanation(input, {
      status: 'conflict_group',
      conflict: {
        lineIds: [SUCROSE, starterLine('dextrose')],
        reasonCode: 'locks_jointly_block',
        suggestedActions: [],
      },
      violationsBefore: [],
      evaluationsUsed: 22,
    });
    const text = renderConstraintExplanationEn(entries[0]!);
    expect(text).toContain('Sucrose');
    expect(text).toContain('Dextrose');
    expect(text).toContain('Unlock one of them');
  });

  it('feasible → the in-band sentence', () => {
    const entries = buildFeasibilityExplanation(overSweetStarter(150), {
      status: 'feasible',
      alreadyInBand: true,
      viaSolverProposal: false,
      violationsBefore: [],
      evaluationsUsed: 1,
    });
    expect(renderConstraintExplanationEn(entries[0]!)).toBe(
      'The recipe is in the optimal range with the current locks.',
    );
  });
});
