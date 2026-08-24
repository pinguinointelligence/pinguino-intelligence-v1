import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import {
  OWNER_MAPPER_INGREDIENTS,
  ownerSameInputRecipe,
} from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { assessGelatoStabilizerSystem } from '@/features/recipe-constraints';
import { overSweetStarter, starterLine } from '@/features/recipe-constraints/constraintFixtures';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { routeFormulationMode } from '@/features/formulation/formulate';
import { recipeDirectionViolations } from '@/features/recipe-direction/recipeDirectionTargets';
import {
  buildBatchRescalePreview,
  buildOptimizePreview,
  commitPreview,
  directionTargetFingerprint,
  workingStateFingerprint,
} from './applyPipeline';
import { buildDraftCandidateVector } from './draftCandidateVector';

const NO_CONSTRAINTS: ConstraintSet = { byLineId: {} };
const AT = '2026-08-10T20:00:00.000Z';

function ownerDirectionFixture(
  sweetness: -2 | -1 | 0 | 1 | 2,
  softness: -2 | -1 | 0 | 1 | 2 = 0,
  strategy: 'optimal' | 'eco' = 'optimal',
): RecipeInput {
  const input = ownerSameInputRecipe();
  return {
    ...input,
    goals: {
      ...input.goals,
      formulation_strategy: strategy,
      direction_targets: { sweetness, softness, creaminess: 0, flavor: 0 },
      direction_targets_active: true,
    },
  };
}

const gramsOf = (input: RecipeInput, canonicalId: string): number =>
  input.items.find(
    (item) => (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) === canonicalId,
  )!.planned_grams;

const exactCandidateOf = (
  preview: Extract<ReturnType<typeof buildOptimizePreview>, { ok: true }>['preview'],
): RecipeInput => {
  expect(preview.practicalization?.status).toBe('ready');
  if (preview.practicalization?.status !== 'ready') throw new Error('missing practical audit');
  return preview.practicalization.audit.exactInput;
};

/**
 * ROUTE NOTE (2026-08-24, PAC/POD unit contract).
 *
 * `ownerSameInputRecipe()` carries canonical Sucrose. Until the unit fix that
 * row resolved to `sugar_freezing_control`, so EVERY fixture in this file
 * reported `missing_hard_role` and was rebuilt through `full_formulation` —
 * which is where the template stabilizer seed lives. With the role corrected
 * these drafts are complete and the LOCAL corrector owns them, so the file now
 * separates two different contracts:
 *
 *  - on the LOCAL route the user's own stabilizer system is made EXECUTABLE —
 *    whole grams inside the owner band, `assessGelatoStabilizerSystem` clean —
 *    and PI does not move it to the preferred dose or invent one where there is
 *    none (`gelatoStabilizerSystemAuthority`: "not permission to silently
 *    insert a stabilizer into a recipe that has none");
 *  - on the TEMPLATE route — a draft that really is missing a HARD role — the
 *    approved seed and its whole-gram preferred total are unchanged.
 */
const withoutLine = (input: RecipeInput, canonicalId: string): RecipeInput => ({
  ...input,
  items: input.items.filter(
    (item) => (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) !== canonicalId,
  ),
});

/** Drops Sucrose, so the milk-gelato template HARD role really is missing and
 *  the approved formulation path is the honest route. */
const templateRoutedRecipe = (input: RecipeInput): RecipeInput =>
  withoutLine(input, OWNER_MAPPER_INGREDIENTS.sucrose.id);

const hasLine = (input: RecipeInput, canonicalId: string): boolean =>
  input.items.some(
    (item) => (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) === canonicalId,
  );

/** The executable stabilizer contract on the local route: whole grams, inside
 *  the owner band, and the aggregate authority reports nothing wrong. */
const expectExecutableStabilizerSystem = (input: RecipeInput, label: string) => {
  const assessment = assessGelatoStabilizerSystem(input);
  expect(assessment.issues, `${label}: stabilizer issues`).toEqual([]);
  expect(assessment.present, `${label}: stabilizer present`).toBe(true);
  expect(Number.isInteger(assessment.totalGrams), `${label}: whole grams`).toBe(true);
  expect(assessment.totalGrams, `${label}: >= band minimum`).toBeGreaterThanOrEqual(
    assessment.band!.minGrams,
  );
  expect(assessment.totalGrams, `${label}: <= band maximum`).toBeLessThanOrEqual(
    assessment.band!.maxGrams,
  );
};

describe('owner-approved Gelato aggregate stabilizer contract', () => {
  it('creates an executable Preview for an Engine-clean but fractional G17 draft', () => {
    const directionSeed = buildOptimizePreview(ownerDirectionFixture(-1), NO_CONSTRAINTS, AT);
    expect(directionSeed.ok).toBe(true);
    if (!directionSeed.ok) return;
    const input = exactCandidateOf(directionSeed.preview);
    input.goals = {
      ...input.goals,
      direction_targets_active: false,
      direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    };
    expect(detectViolations(calculateRecipe(input))).toEqual([]);
    const built = buildOptimizePreview(input, NO_CONSTRAINTS, AT);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.preview.practicalization?.status).toBe('ready');
    // The continued candidate is already whole-gram, so the second pass keeps
    // it byte-stable instead of rebuilding it.
    expect(gramsOf(exactCandidateOf(built.preview), OWNER_MAPPER_INGREDIENTS.inulin.id)).toBe(100);
    expect(gramsOf(exactCandidateOf(built.preview), OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(2);
    expect(gramsOf(built.preview.proposedInput, OWNER_MAPPER_INGREDIENTS.inulin.id)).toBe(100);
    expectExecutableStabilizerSystem(built.preview.proposedInput, 'continued G17 draft');
    expect(commitPreview(input, NO_CONSTRAINTS, built.preview, AT, 'practical-only').ok).toBe(true);
  });

  it('reproduces the Owner Sweetness LESS fixture and corrects fractional Tara to 3 g', () => {
    const input = ownerDirectionFixture(-1);
    const built = buildOptimizePreview(input, NO_CONSTRAINTS, AT);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const before = calculateRecipe(input);
    const after = calculateRecipe(built.preview.proposedInput);
    expect(gramsOf(input, OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(1.9);
    // The user's own 1.9 g system is made executable — whole grams inside the
    // owner band — instead of being moved to the template's preferred dose.
    expect(gramsOf(built.preview.proposedInput, OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(2);
    expectExecutableStabilizerSystem(built.preview.proposedInput, 'Sweetness LESS');
    expect(before.pod_points).toBeCloseTo(15.5712, 10);
    // Owner P1-A (2026-08-23): the paired mass-neutral exchange reaches the
    // Sweetness −1 band [13, 14] that the old single-line search could not, so
    // this fixture lands INSIDE its target instead of 0.36 above it. On the
    // local route (2026-08-24 unit contract) the same exchange runs on the
    // user's own draft rather than a template rebuild: POD 13.934384, side
    // "inside", distance 0; NPAC 45.1637 also inside; zero violations; batch
    // exactly 1000 g; preview applicable.
    expect(after.pod_points).toBeCloseTo(13.934384, 10);
    expect(after.pod_points!).toBeLessThan(before.pod_points!);
    expect(detectViolations(after)).toEqual([]);
    expect(built.preview.directionAssessment).toMatchObject({
      active: true,
      // Both supported axes are now genuinely inside their bands.
      reached: true,
      // The customer-visible score is always recomputed from the executable
      // whole-gram vector, never retained from the hidden exact candidate.
      score: 10,
    });

    expect(
      Object.fromEntries(
        exactCandidateOf(built.preview).items.map((item) => [
          item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
          item.planned_grams,
        ]),
      ),
    ).toEqual({
      // Exact candidate for the same fixture on the local route: the exchange
      // pass trades sucrose down / dextrose up and rebalances milk↔cream, which
      // is what brings POD inside [13, 14]. Tara stays byte-exact at the user's
      // own 1.9 g — the solver-side stabilizer hold — and only the executable
      // whole-gram projection below rounds it.
      [OWNER_MAPPER_INGREDIENTS.milk_3_5.id]: 574.9357232684927,
      [OWNER_MAPPER_INGREDIENTS.cream_30.id]: 131.82974684524112,
      [OWNER_MAPPER_INGREDIENTS.smp.id]: 45.11525949770638,
      [OWNER_MAPPER_INGREDIENTS.sucrose.id]: 66.22223866828396,
      [OWNER_MAPPER_INGREDIENTS.dextrose.id]: 79.84111023097371,
      [OWNER_MAPPER_INGREDIENTS.inulin.id]: 100.15592148930214,
      [OWNER_MAPPER_INGREDIENTS.tara_gum.id]: 1.9,
    });
    expect(
      Object.fromEntries(
        built.preview.proposedInput.items.map((item) => [
          item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
          item.planned_grams,
        ]),
      ),
    ).toEqual({
      // Executable whole-gram projection of the exact candidate; still exactly
      // 1000 g, and Tara now a whole 2 g inside the owner band [2, 5].
      [OWNER_MAPPER_INGREDIENTS.milk_3_5.id]: 575,
      [OWNER_MAPPER_INGREDIENTS.cream_30.id]: 132,
      [OWNER_MAPPER_INGREDIENTS.smp.id]: 45,
      [OWNER_MAPPER_INGREDIENTS.sucrose.id]: 66,
      [OWNER_MAPPER_INGREDIENTS.dextrose.id]: 80,
      [OWNER_MAPPER_INGREDIENTS.inulin.id]: 100,
      [OWNER_MAPPER_INGREDIENTS.tara_gum.id]: 2,
    });

    // The Direction target is now REACHED, so the best-achievable consent gate
    // no longer applies to this fixture — Apply proceeds directly. The consent
    // contract itself is still pinned, on a genuinely unreachable target, by
    // `recipeDirectionTargets.test.ts`.
    const applied = commitPreview(
      input,
      NO_CONSTRAINTS,
      built.preview,
      AT,
      'with-consent',
      [],
      undefined,
      null,
      null,
      {
        baseFingerprint: built.preview.baseFingerprint,
        targetFingerprint: directionTargetFingerprint(input),
        candidateFingerprint: workingStateFingerprint(
          built.preview.proposedInput,
          built.preview.nextConstraints,
        ),
      },
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(gramsOf(applied.verified.input, OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(2);
    expect(
      gramsOf(
        applied.verified.record.practicalization!.exactInput,
        OWNER_MAPPER_INGREDIENTS.tara_gum.id,
      ),
    ).toBe(1.9);
    expect(applied.verified.record.before.input).toEqual(input);
  });

  it.each([
    ['Sweetness LESS', -2, 0],
    ['Sweetness MORE', 2, 0],
    ['Hardness softer', 0, -2],
    ['Hardness firmer', 0, 2],
  ] as const)(
    '%s makes the fractional Tara system executable under Direction',
    (label, sweetness, softness) => {
      for (const strategy of ['optimal', 'eco'] as const) {
        const input = ownerDirectionFixture(sweetness, softness, strategy);
        const built = buildOptimizePreview(input, NO_CONSTRAINTS, AT);
        if (!built.ok) {
          // ECO on this fixture has no owner prices — an honest refusal, and
          // an already-clean draft is equally acceptable.
          expect(['already_clean', 'missing_prices']).toContain(built.code);
          continue;
        }
        // The user's 1.9 g may be held byte-exact by the solver-side stabilizer
        // hold; what Apply writes must be whole grams inside the owner band.
        expectExecutableStabilizerSystem(
          built.preview.proposedInput,
          `${label} ${strategy}`,
        );
        expect(gramsOf(built.preview.proposedInput, OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(2);
      }
    },
  );

  it.each([0, 20, 40, 80])(
    'keeps owner Inulin %i g inside 0-or-2-to-8-percent authority under strong Direction',
    (inulinGrams) => {
      const input = ownerDirectionFixture(2, -2);
      const currentTotal = input.items.reduce((sum, item) => sum + item.planned_grams, 0);
      const inulin = input.items.find(
        (item) =>
          (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
          OWNER_MAPPER_INGREDIENTS.inulin.id,
      )!;
      const tara = input.items.find(
        (item) =>
          (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
          OWNER_MAPPER_INGREDIENTS.tara_gum.id,
      )!;
      const milk = input.items.find(
        (item) =>
          (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
          OWNER_MAPPER_INGREDIENTS.milk_3_5.id,
      )!;
      inulin.planned_grams = inulinGrams;
      tara.planned_grams = 3;
      milk.planned_grams -=
        input.items.reduce((sum, item) => sum + item.planned_grams, 0) - currentTotal;

      const snapshots = productBehaviorTestSnapshots(input);
      const inulinSnapshot = snapshots[inulin.id]!;
      if (!inulinSnapshot.sharedFacts) throw new Error('missing Inulin shared facts fixture');
      snapshots[inulin.id] = {
        ...inulinSnapshot,
        sharedFacts: {
          ...inulinSnapshot.sharedFacts,
          recommendedDose: {
            minPercent: 2,
            preferredPercent: 4,
            maxPercent: 8,
            presenceSemantics: 'optional_zero_or_range',
            provenance: 'owner-approved Gellatti formulation policy',
            policyId: 'gellatti-generic-inulin',
            policyVersion: 1,
            sourceVersion: 'owner-gellatti-inulin-v1',
          },
        },
      };
      // The Inulin snapshot above declares the owner's 0-or-2-8 % window. It is
      // informational: the band that actually holds is PINGÜINO's own
      // stabilizer-system authority, asserted here and after the Preview.
      expect(assessGelatoStabilizerSystem(input).issues).toEqual([]);

      const result = buildOptimizePreview(input, NO_CONSTRAINTS, AT, {
        productBehaviorSnapshots: snapshots,
      });
      if (!result.ok) {
        if (result.code === 'already_clean') {
          expect(detectViolations(calculateRecipe(input))).toEqual([]);
          expect(recipeDirectionViolations(input)).toEqual([]);
        } else {
          expect(['no_proposal', 'unsafe_proposal']).toContain(result.code);
        }
        return;
      }

      const proposed = result.preview.proposedInput;
      // Owner zero-gram executable invariant: an unused optional Inulin is
      // OMITTED from the executable proposal (absence), never a 0 g row.
      const proposedInulinLine = proposed.items.find(
        (item) =>
          (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
          OWNER_MAPPER_INGREDIENTS.inulin.id,
      );
      const proposedInulin = proposedInulinLine?.planned_grams ?? 0;
      expect(assessGelatoStabilizerSystem(proposed).issues).toEqual([]);
      expect(detectViolations(calculateRecipe(proposed))).toEqual([]);
      expect(proposedInulin === 0 || (proposedInulin >= 20 && proposedInulin <= 80)).toBe(true);
      expect(proposed.items.every((item) => item.planned_grams > 0)).toBe(true);
      if (inulinGrams === 0) expect(proposedInulinLine).toBeUndefined();
    },
  );

  it('keeps Tara out of generic search while Inulin remains an adjustable fiber/body lever', () => {
    const input = ownerDirectionFixture(-1);
    const vector = buildDraftCandidateVector(input, NO_CONSTRAINTS, new Set());
    expect(vector.map((candidate) => candidate.ingredientId)).not.toContain(
      OWNER_MAPPER_INGREDIENTS.tara_gum.id,
    );
    expect(vector.map((candidate) => candidate.ingredientId)).toContain(
      OWNER_MAPPER_INGREDIENTS.inulin.id,
    );
  });

  it('keeps corrected whole-gram Tara through constrained reformulation', () => {
    const input = ownerDirectionFixture(-1);
    const milk = input.items.find(
      (item) =>
        (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
        OWNER_MAPPER_INGREDIENTS.milk_3_5.id,
    )!;
    const constraints: ConstraintSet = {
      byLineId: { [milk.id]: { mode: 'locked', grams: milk.planned_grams } },
    };
    const built = buildOptimizePreview(input, constraints, AT);
    expect(built.ok, built.ok ? '' : built.code).toBe(true);
    if (!built.ok) return;
    expect(gramsOf(exactCandidateOf(built.preview), OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(3);
    expect(gramsOf(built.preview.proposedInput, OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(3);
  });

  it('does not batch-scale an established Tara dose during generic constrained reformulation', () => {
    const input = overSweetStarter(220); // 1090 g target; established Tara remains 5 g.
    const sucroseLineId = starterLine('sucrose');
    const taraLineId = starterLine('tara_gum');
    const constraints: ConstraintSet = {
      byLineId: { [sucroseLineId]: { mode: 'locked', grams: 220 } },
    };
    const built = buildOptimizePreview(input, constraints, AT);
    expect(built.ok, built.ok ? '' : built.code).toBe(true);
    if (!built.ok) return;
    expect(
      built.preview.proposedInput.items.find((item) => item.id === taraLineId)?.planned_grams,
    ).toBe(5);
  });

  it('rejects a forged in-window Tara mutation at the trustless Apply door', () => {
    const input = ownerDirectionFixture(-1);
    const built = buildOptimizePreview(input, NO_CONSTRAINTS, AT);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const forged = structuredClone(built.preview);
    const tara = forged.proposedInput.items.find(
      (item) =>
        (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
        OWNER_MAPPER_INGREDIENTS.tara_gum.id,
    )!;
    const milk = forged.proposedInput.items.find(
      (item) =>
        (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
        OWNER_MAPPER_INGREDIENTS.milk_3_5.id,
    )!;
    tara.planned_grams += 1;
    milk.planned_grams -= 1;
    expect(commitPreview(input, NO_CONSTRAINTS, forged, AT, 'forged')).toMatchObject({
      ok: false,
      code: 'constraints_violated',
    });
  });

  it('keeps the approved explicit batch-rescale exception proportional', () => {
    const input = ownerSameInputRecipe();
    const built = buildBatchRescalePreview(input, NO_CONSTRAINTS, 2000, AT);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(gramsOf(exactCandidateOf(built.preview), OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(
      3.8,
    );
    expect(gramsOf(built.preview.proposedInput, OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(4);
    const applied = commitPreview(input, NO_CONSTRAINTS, built.preview, AT, 'scale');
    expect(applied.ok).toBe(true);
  });

  it('preserves a percent-locked Tara contract when the batch doubles', () => {
    const base = ownerSameInputRecipe();
    const tara = base.items.find(
      (item) =>
        (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
        OWNER_MAPPER_INGREDIENTS.tara_gum.id,
    )!;
    const input: RecipeInput = {
      ...base,
      items: base.items.map((item) =>
        item.id === tara.id ? { ...item, lock_type: 'percent' } : item,
      ),
    };
    const constraints: ConstraintSet = {
      byLineId: { [tara.id]: { mode: 'percent', percent: 0.19 } },
    };
    const built = buildBatchRescalePreview(input, constraints, 2000, AT);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(gramsOf(built.preview.proposedInput, OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(3.8);
    expect(built.preview.practicalization).toMatchObject({
      status: 'blocked',
      failure: { code: 'percent_lock_not_whole_gram' },
    });
    expect(commitPreview(input, constraints, built.preview, AT, 'percent-scale')).toMatchObject({
      ok: false,
      code: 'practicalization_invalid',
    });
  });

  it('leaves an existing zero-dose stabilizer at zero on the local route', () => {
    // The owner policy is explicit: it "governs an existing Gelato stabilizer
    // system" and is "not permission to silently insert a stabilizer into a
    // recipe that has none". A complete draft is corrected locally, so a
    // zero-dose stabilizer stays the user's decision.
    const base = ownerSameInputRecipe();
    const input: RecipeInput = {
      ...base,
      items: base.items.map((item) =>
        (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
        OWNER_MAPPER_INGREDIENTS.tara_gum.id
          ? { ...item, planned_grams: 0 }
          : item,
      ),
    };
    expect(routeFormulationMode(input, NO_CONSTRAINTS).mode).toBe('local_correction');
    const built = buildOptimizePreview(input, NO_CONSTRAINTS, AT);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(gramsOf(built.preview.proposedInput, OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(0);
    expect(assessGelatoStabilizerSystem(built.preview.proposedInput).present).toBe(false);
  });

  it('rejects a forged seed from an existing zero-dose stabilizer', () => {
    // The seed itself is a TEMPLATE-path authority, so the forgery is staged on
    // a draft that genuinely needs the template (no Sucrose → missing HARD role).
    const base = ownerSameInputRecipe();
    const input: RecipeInput = templateRoutedRecipe({
      ...base,
      items: base.items.map((item) =>
        (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
        OWNER_MAPPER_INGREDIENTS.tara_gum.id
          ? { ...item, planned_grams: 0 }
          : item,
      ),
    });
    expect(routeFormulationMode(input, NO_CONSTRAINTS).mode).toBe('full_formulation');
    const built = buildOptimizePreview(input, NO_CONSTRAINTS, AT);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(gramsOf(exactCandidateOf(built.preview), OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(3);
    expect(gramsOf(built.preview.proposedInput, OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(3);
    expect(commitPreview(input, NO_CONSTRAINTS, built.preview, AT, 'approved-zero-seed').ok).toBe(
      true,
    );

    const forged = structuredClone(built.preview);
    const tara = forged.proposedInput.items.find(
      (item) =>
        (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
        OWNER_MAPPER_INGREDIENTS.tara_gum.id,
    )!;
    const milk = forged.proposedInput.items.find(
      (item) =>
        (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
        OWNER_MAPPER_INGREDIENTS.milk_3_5.id,
    )!;
    milk.planned_grams += tara.planned_grams - 1;
    tara.planned_grams = 1;
    expect(commitPreview(input, NO_CONSTRAINTS, forged, AT, 'forged-zero-seed')).toMatchObject({
      ok: false,
      code: 'constraints_violated',
    });
  });

  it('never invents a stabilizer for a complete draft that has none', () => {
    const base = ownerSameInputRecipe();
    const input = withoutLine(base, OWNER_MAPPER_INGREDIENTS.tara_gum.id);
    expect(routeFormulationMode(input, NO_CONSTRAINTS).mode).toBe('local_correction');
    const built = buildOptimizePreview(input, NO_CONSTRAINTS, AT);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(hasLine(built.preview.proposedInput, OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(false);
    expect(assessGelatoStabilizerSystem(built.preview.proposedInput).present).toBe(false);
  });

  it('seeds the owner-preferred whole-gram total when Tara is missing', () => {
    // TEMPLATE route: this draft is genuinely missing a HARD role, so the
    // approved seed authority is the one under test here.
    const base = ownerSameInputRecipe();
    const input: RecipeInput = templateRoutedRecipe(
      withoutLine(base, OWNER_MAPPER_INGREDIENTS.tara_gum.id),
    );
    expect(routeFormulationMode(input, NO_CONSTRAINTS).mode).toBe('full_formulation');
    const built = buildOptimizePreview(input, NO_CONSTRAINTS, AT);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(gramsOf(exactCandidateOf(built.preview), OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(3);
    expect(gramsOf(built.preview.proposedInput, OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(3);
    expect(
      commitPreview(input, NO_CONSTRAINTS, built.preview, AT, 'approved-missing-seed').ok,
    ).toBe(true);

    const forged = structuredClone(built.preview);
    const tara = forged.proposedInput.items.find(
      (item) =>
        (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
        OWNER_MAPPER_INGREDIENTS.tara_gum.id,
    )!;
    const milk = forged.proposedInput.items.find(
      (item) =>
        (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
        OWNER_MAPPER_INGREDIENTS.milk_3_5.id,
    )!;
    milk.planned_grams += tara.planned_grams - 1;
    tara.planned_grams = 1;
    expect(commitPreview(input, NO_CONSTRAINTS, forged, AT, 'forged-missing-seed')).toMatchObject({
      ok: false,
      code: 'constraints_violated',
    });

    const wrongTemplate = structuredClone(built.preview);
    wrongTemplate.formulation!.templateId = 'milk_base_v1';
    const wrongTara = wrongTemplate.proposedInput.items.find(
      (item) =>
        (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
        OWNER_MAPPER_INGREDIENTS.tara_gum.id,
    )!;
    const wrongMilk = wrongTemplate.proposedInput.items.find(
      (item) =>
        (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
        OWNER_MAPPER_INGREDIENTS.milk_3_5.id,
    )!;
    wrongMilk.planned_grams -= 5 - wrongTara.planned_grams;
    wrongTara.planned_grams = 5;
    expect(commitPreview(input, NO_CONSTRAINTS, wrongTemplate, AT, 'wrong-template')).toMatchObject(
      {
        ok: false,
      },
    );
  });

  it('never gives an approved template dose to an unapproved zero-dose stabilizer identity', () => {
    const base = templateRoutedRecipe(ownerSameInputRecipe());
    const input: RecipeInput = {
      ...base,
      items: base.items.map((item) =>
        (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
        OWNER_MAPPER_INGREDIENTS.tara_gum.id
          ? {
              ...item,
              planned_grams: 0,
              ingredient: {
                ...item.ingredient,
                id: 'UNAPPROVED-STAB',
                canonical_ingredient_id: 'UNAPPROVED-STAB',
              },
            }
          : item,
      ),
    };
    const built = buildOptimizePreview(input, NO_CONSTRAINTS, AT);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const unapproved = built.preview.proposedInput.items.find(
      (item) =>
        (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) === 'UNAPPROVED-STAB',
    );
    expect(unapproved?.planned_grams).toBe(0);
    expect(gramsOf(exactCandidateOf(built.preview), OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(3);
    expect(gramsOf(built.preview.proposedInput, OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(3);
    expect(
      commitPreview(input, NO_CONSTRAINTS, built.preview, AT, 'approved-identity-seed').ok,
    ).toBe(true);

    const forged = structuredClone(built.preview);
    const approved = forged.proposedInput.items.find(
      (item) =>
        (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) ===
        OWNER_MAPPER_INGREDIENTS.tara_gum.id,
    )!;
    const forgedUnapproved = forged.proposedInput.items.find(
      (item) =>
        (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) === 'UNAPPROVED-STAB',
    )!;
    forgedUnapproved.planned_grams = approved.planned_grams;
    approved.planned_grams = 0;
    expect(commitPreview(input, NO_CONSTRAINTS, forged, AT, 'forged-identity-seed')).toMatchObject({
      ok: false,
      code: 'constraints_violated',
    });
  });
});
