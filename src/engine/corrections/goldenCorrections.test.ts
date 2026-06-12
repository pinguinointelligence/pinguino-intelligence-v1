import { describe, expect, it } from 'vitest';
import { GOLDEN_RECIPES, type GoldenCorrectionCase } from '../__fixtures__/goldenRecipes';
import { calculateRecipe } from '../calculateRecipe';
import { DEFAULT_CORRECTION_CANDIDATES } from './candidates';
import { detectViolations, proposeCorrections } from './solver';
import type { CorrectionProposal } from './types';
import { applyCorrectionActions } from './verify';

const brokenCases: Array<{ recipeId: string; brokenCase: GoldenCorrectionCase }> =
  GOLDEN_RECIPES.flatMap((recipe) =>
    (recipe.broken ?? []).map((brokenCase) => ({ recipeId: recipe.id, brokenCase })),
  );

const runCase = (brokenCase: GoldenCorrectionCase): CorrectionProposal[] => {
  const result = proposeCorrections({
    input: brokenCase.input,
    context: brokenCase.context,
    redact: false,
    focus: brokenCase.focus,
    candidates: brokenCase.use_empty_candidates ? [] : undefined,
  });
  if (result.redacted) throw new Error('expected unredacted result');
  return result.proposals;
};

describe('golden corrections — solver QA on broken recipes', () => {
  for (const { recipeId, brokenCase } of brokenCases) {
    describe(`${recipeId}: ${brokenCase.description}`, () => {
      it('meets the expected correction behavior', () => {
        const proposals = runCase(brokenCase);
        expect(proposals.length).toBeGreaterThan(0);
        const first = proposals[0]!;
        const expectation = brokenCase.expect;

        if (expectation.first_kinds) {
          expect(expectation.first_kinds).toContain(first.kind);
        }
        if (expectation.first_add_ids && first.kind === 'correction') {
          expect(expectation.first_add_ids).toContain(first.actions[0]!.ingredient_id);
        }
        if (expectation.blocking_constraint) {
          expect(first.blocking?.constraint).toBe(expectation.blocking_constraint);
        }

        for (const proposal of proposals) {
          if (expectation.forbidden_add_ids) {
            for (const action of proposal.actions) {
              expect(
                action.type === 'add' &&
                  expectation.forbidden_add_ids.includes(action.ingredient_id),
                `forbidden add: ${action.ingredient_id}`,
              ).toBe(false);
            }
          }
          if (expectation.add_only) {
            expect(proposal.actions.every((action) => action.type === 'add')).toBe(true);
          }
          if (expectation.never_reduce_line_id) {
            expect(
              proposal.actions.some(
                (action) =>
                  action.type === 'reduce' &&
                  action.target_line_id === expectation.never_reduce_line_id,
              ),
            ).toBe(false);
          }
          // Pro contract: exact grams present and finite on every action
          for (const action of proposal.actions) {
            expect(Number.isFinite(action.grams)).toBe(true);
            expect(action.grams).toBeGreaterThan(0);
          }
        }
      });

      it('never worsens a higher-priority metric (independent re-verification)', () => {
        const proposals = runCase(brokenCase);
        const correction = proposals.find(
          (proposal) => proposal.kind === 'correction' && proposal.actions.length > 0,
        );
        if (!correction) return; // tradeoff/impossible — nothing to apply

        const before = calculateRecipe(brokenCase.input);
        const beforeViolations = detectViolations(before);
        const beforeBadness = new Map(
          beforeViolations.map((violation) => [violation.metric, violation.severity_points]),
        );
        const minTargetRank = Math.min(
          ...correction.affected_metrics.map(
            (metric) =>
              beforeViolations.find((violation) => violation.metric === metric)?.priority_rank ??
              Number.POSITIVE_INFINITY,
          ),
        );

        const hypothetical = applyCorrectionActions(
          brokenCase.input,
          correction.actions,
          {
            context: brokenCase.context,
            mode: brokenCase.input.mode,
            allow_main_ingredient_reduction: false,
            machine_capacity_grams: brokenCase.input.machine_capacity_grams,
          },
          DEFAULT_CORRECTION_CANDIDATES,
        );
        expect(hypothetical).not.toBeNull();

        const after = calculateRecipe(hypothetical!);
        for (const violation of detectViolations(after)) {
          if (violation.priority_rank < minTargetRank) {
            const previous = beforeBadness.get(violation.metric) ?? 0;
            expect(
              violation.severity_points,
              `higher-priority regression on ${violation.metric}`,
            ).toBeLessThanOrEqual(previous + 1e-9);
          }
        }
      });

      it('redacted demo twin exposes no grams and no ingredient names', () => {
        const redacted = proposeCorrections({
          input: brokenCase.input,
          context: brokenCase.context,
          redact: true,
          focus: brokenCase.focus,
          candidates: brokenCase.use_empty_candidates ? [] : undefined,
        });
        if (!redacted.redacted) throw new Error('expected a redacted result');

        const collect = (value: unknown, found: number[] = []): number[] => {
          if (typeof value === 'number') found.push(value);
          else if (Array.isArray(value)) value.forEach((v) => collect(v, found));
          else if (value !== null && typeof value === 'object') {
            Object.values(value).forEach((v) => collect(v, found));
          }
          return found;
        };
        expect(collect(redacted.proposals)).toEqual([]);
        const json = JSON.stringify(redacted.proposals).toLowerCase();
        for (const leak of ['sucrose', 'dextrose', 'milk', 'cream', 'inulin', 'smp', 'beam']) {
          expect(json, `leak: ${leak}`).not.toContain(leak);
        }
      });
    });
  }
});
