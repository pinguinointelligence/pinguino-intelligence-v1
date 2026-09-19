/**
 * CONTROLLED ±2 RELAXATION — THE OWNER'S EVIDENCE TABLE
 * (owner decision 2026-09-19 § 5, § 12, § 19, § 26).
 *
 * The registered owner range is used here as the concrete worked example the
 * owner asked to see end to end — normal band, ±1 refusal to leave it, ±2
 * emergency band, validity inside it, the single public quality point, the
 * continuous severity that is NOT flattened, and refusal outside the approved
 * envelope on BOTH sides.
 *
 * Everything is reached through the generic registry. The file names no
 * ingredient: it asks `relaxableOwnerRanges` which lines are governed and works
 * from the band the policy publishes, so the same evidence is produced for the
 * next registered range without touching this file.
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';
import drafts from '@/features/constraint-studio/__fixtures__/directionFalseInfeasibleDrafts.json';
import { ownerInulinPolicyIssues } from '@/features/product-intelligence/ownerInulinPolicy';
import { recipeFitForInput } from '@/features/protein-gelato/proteinAuthority';
import { assessRecipeDirection } from './recipeDirectionAssessment';
import { extendedGramBand } from './directionRelaxation';
import {
  RELAXATION_SCORE_PENALTY_CAP,
  relaxableOwnerRanges,
  relaxationCost,
  relaxationScorePenalty,
} from './relaxableRangePolicy';
import { recipeDirectionViolations } from './recipeDirectionTargets';

type CaseKey = keyof typeof drafts;
const draftFor = (key: CaseKey) =>
  drafts[key] as unknown as { input: RecipeInput; constraints: ConstraintSet };
const AT = '2026-09-19T00:00:00.000Z';

const atLevel = (input: RecipeInput, sweetness: -2 | -1 | 1 | 2): RecipeInput => ({
  ...input,
  goals: {
    ...input.goals,
    direction_targets_active: true,
    direction_targets: { sweetness, softness: 0, creaminess: 0, flavor: 0 },
  },
});

const withGoverned = (input: RecipeInput, lineId: string, grams: number): RecipeInput => {
  const line = input.items.find((item) => item.id === lineId)!;
  const delta = grams - line.planned_grams;
  const donor = [...input.items]
    .filter((item) => item.id !== lineId)
    .sort((a, b) => b.planned_grams - a.planned_grams)[0]!;
  return {
    ...input,
    items: input.items.map((item) =>
      item.id === lineId
        ? { ...item, planned_grams: grams }
        : item.id === donor.id
          ? { ...item, planned_grams: item.planned_grams - delta }
          : item,
    ),
  };
};

describe('OWNER EVIDENCE — a registered owner range, normal and emergency', () => {
  it('walks the whole envelope and records what the engine says at each dose', () => {
    const { input } = draftFor('LOCK-02a');
    const governed = relaxableOwnerRanges(input);
    expect(governed.length).toBeGreaterThan(0);
    const range = governed[0]!;
    const lineId = range.lineIds[0]!;
    const normal = range.normal;
    const emergency = extendedGramBand(normal);

    // The published 50 % extension, from the policy's own band.
    expect(emergency.minGrams).toBeCloseTo(normal.minGrams * 0.5, 9);
    expect(emergency.maxGrams).toBeCloseTo(normal.maxGrams * 1.5, 9);

    const doses = [
      emergency.minGrams - 1, // below the approved envelope
      emergency.minGrams, // the approved lower edge
      (emergency.minGrams + normal.minGrams) / 2,
      normal.minGrams, // inside, at the preferred floor
      (normal.minGrams + normal.maxGrams) / 2, // inside, preferred
      normal.maxGrams, // inside, at the preferred ceiling
      normal.maxGrams + 1, // barely outside
      (normal.maxGrams + emergency.maxGrams) / 2, // midway through emergency
      emergency.maxGrams, // the approved upper edge
      emergency.maxGrams + 1, // beyond the approved envelope
    ];

    const rows: string[] = [];
    let lastUpperCost = -1;
    for (const grams of doses) {
      const extreme = withGoverned(atLevel(input, 2), lineId, grams);
      const ordinary = withGoverned(atLevel(input, 1), lineId, grams);
      const insideNormal = grams >= normal.minGrams - 1e-9 && grams <= normal.maxGrams + 1e-9;
      const insideEmergency =
        grams >= emergency.minGrams - 1e-9 && grams <= emergency.maxGrams + 1e-9;

      const extremeIssues = ownerInulinPolicyIssues(extreme);
      const ordinaryIssues = ownerInulinPolicyIssues(ordinary);
      const cost = relaxationCost(extreme);
      const penalty = relaxationScorePenalty(extreme);
      const fit = recipeFitForInput(extreme);

      // ±2 — VALID anywhere inside the approved emergency envelope, refused outside.
      expect(extremeIssues.length === 0).toBe(insideEmergency);
      // ±1 — may never leave the NORMAL band, whatever the emergency band says.
      expect(ordinaryIssues.length === 0).toBe(insideNormal);
      // The public quality cost of relaxing is one point, or nothing at all.
      expect(penalty).toBe(insideNormal ? 0 : RELAXATION_SCORE_PENALTY_CAP);
      expect(fit.relaxationPenalty).toBe(penalty);
      if (!insideNormal) {
        // A relaxed recipe is never the validated-native 10/10 state …
        expect(fit.validatedNative).toBe(false);
        // … and the severity is kept continuously, not flattened with the score.
        expect(cost).toBeGreaterThan(0);
        // Strictly rising while INSIDE the approved envelope; at and beyond its
        // edge the cost saturates, because the policy permits nothing further.
        if (grams > normal.maxGrams && insideEmergency) {
          expect(cost).toBeGreaterThan(lastUpperCost);
          lastUpperCost = cost;
        }
        if (!insideEmergency) expect(cost).toBe(1);
      } else {
        expect(cost).toBe(0);
      }

      rows.push(
        `${grams.toFixed(1).padStart(7)} g  ` +
          `${insideNormal ? 'NORMAL   ' : insideEmergency ? 'EMERGENCY' : 'OUTSIDE  '}  ` +
          `±2 ${extremeIssues.length === 0 ? 'VALID  ' : 'REFUSED'}  ` +
          `±1 ${ordinaryIssues.length === 0 ? 'VALID  ' : 'REFUSED'}  ` +
          `cost ${cost.toFixed(4)}  public −${penalty}  fit ${fit.display}`,
      );
    }
    console.info(
      `OWNER-RANGE EVIDENCE  policy=${range.policyId}  normal ${normal.minGrams}–${normal.maxGrams} g  ` +
        `emergency ${emergency.minGrams}–${emergency.maxGrams} g\n` +
        rows.join('\n'),
    );
  });

  it('a larger excursion loses to a smaller one when the target is equally satisfied', () => {
    const { input } = draftFor('LOCK-02a');
    const range = relaxableOwnerRanges(input)[0]!;
    const lineId = range.lineIds[0]!;
    const emergency = extendedGramBand(range.normal);
    const small = withGoverned(atLevel(input, 2), lineId, range.normal.maxGrams + 1);
    const large = withGoverned(atLevel(input, 2), lineId, emergency.maxGrams);
    // Internally they are NOT equivalent …
    expect(relaxationCost(large)).toBeGreaterThan(relaxationCost(small));
    // … while the public quality cost of relaxing is the same single point.
    expect(relaxationScorePenalty(large)).toBe(relaxationScorePenalty(small));
  });
});

describe('§19 — the audited cells, re-measured under the finished policy', () => {
  const solve = (key: CaseKey) => {
    const { input, constraints } = draftFor(key);
    const result = buildOptimizePreview(input, constraints, AT, {
      requirePracticalPreview: true,
      directionFallbackPass: true,
      skipRescueAssessment: true,
    });
    if (!result.ok) return { key, ok: false as const, code: result.code, input };
    const proposed = result.preview.proposedInput;
    return {
      key,
      ok: true as const,
      input,
      proposed,
      preview: result.preview,
      distance: recipeDirectionViolations(proposed).reduce(
        (sum, violation) => sum + violation.severity_points,
        0,
      ),
      violations: detectViolations(calculateRecipe(proposed)),
      plannedSum: proposed.items.reduce((sum, item) => sum + item.planned_grams, 0),
    };
  };

  it('records every audited cell and holds the invariants that must not move', () => {
    const rows: string[] = [];
    for (const key of Object.keys(drafts) as CaseKey[]) {
      const solved = solve(key);
      if (!solved.ok) {
        rows.push(`${key.padEnd(26)} REFUSED (${solved.code})`);
        continue;
      }
      // Legal, on batch, never negative — on every cell, whatever the envelope.
      if (solved.preview.diagnosticOnly !== true) expect(solved.violations).toEqual([]);
      expect(Math.abs(solved.plannedSum - solved.proposed.target_batch_grams)).toBeLessThan(0.5);
      expect(solved.proposed.items.some((item) => item.planned_grams < 0)).toBe(false);
      // Nothing may sit outside the APPROVED envelope of a registered range.
      for (const range of relaxableOwnerRanges(solved.proposed)) {
        expect(range.normalizedExcursion).toBeLessThanOrEqual(1 + 1e-9);
      }
      rows.push(
        `${key.padEnd(26)} d=${solved.distance.toFixed(5).padStart(9)}  ` +
          `env=${(solved.preview.directionEnvelope ?? 'normal').padEnd(8)} ` +
          `relax=${relaxationCost(solved.proposed).toFixed(3)}  ` +
          `reached=${assessRecipeDirection(solved.proposed, calculateRecipe(solved.proposed)).reached}  ` +
          `grams=[${solved.proposed.items.map((item) => item.planned_grams).join(',')}]`,
      );
    }
    console.info(`AUDITED CELLS\n${rows.join('\n')}`);
  }, 900_000);

  it('the proven dead end still refuses, and nothing relaxed it open', () => {
    const solved = solve('CONTROL-C2-sorbet-hard-2');
    if (!solved.ok) return;
    expect(
      assessRecipeDirection(solved.proposed, calculateRecipe(solved.proposed)).reached,
    ).toBe(false);
    // It must not have bought that refusal-avoidance with an owner band either.
    expect(relaxationCost(solved.proposed)).toBe(0);
  });
});
