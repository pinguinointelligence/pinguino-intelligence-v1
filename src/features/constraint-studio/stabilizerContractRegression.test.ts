import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import {
  OWNER_MAPPER_INGREDIENTS,
  ownerSameInputRecipe,
} from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { overSweetStarter, starterLine } from '@/features/recipe-constraints/constraintFixtures';
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
  sweetness: -1 | 0 | 1,
  softness: -1 | 0 | 1 = 0,
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
    expect(
      gramsOf(exactCandidateOf(built.preview), OWNER_MAPPER_INGREDIENTS.inulin.id),
    ).toBeCloseTo(40.52845528455285, 10);
    expect(gramsOf(exactCandidateOf(built.preview), OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(3);
    expect(gramsOf(built.preview.proposedInput, OWNER_MAPPER_INGREDIENTS.inulin.id)).toBe(40);
    expect(gramsOf(built.preview.proposedInput, OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(3);
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
    expect(gramsOf(exactCandidateOf(built.preview), OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(3);
    expect(gramsOf(built.preview.proposedInput, OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(3);
    expect(before.pod_points).toBeCloseTo(15.5712, 10);
    expect(after.pod_points).toBeCloseTo(14.361032, 10);
    expect(after.pod_points!).toBeLessThan(before.pod_points!);
    expect(detectViolations(after)).toEqual([]);
    expect(built.preview.directionAssessment).toMatchObject({
      active: true,
      reached: false,
      // The customer-visible score is always recomputed from the executable
      // whole-gram vector, never retained from the hidden exact candidate.
      score: 8,
    });

    expect(
      Object.fromEntries(
        exactCandidateOf(built.preview).items.map((item) => [
          item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
          item.planned_grams,
        ]),
      ),
    ).toEqual({
      [OWNER_MAPPER_INGREDIENTS.milk_3_5.id]: 565.9636052869171,
      [OWNER_MAPPER_INGREDIENTS.cream_30.id]: 130.06801174232712,
      [OWNER_MAPPER_INGREDIENTS.smp.id]: 45.203010010081314,
      [OWNER_MAPPER_INGREDIENTS.sucrose.id]: 76.35672511095395,
      [OWNER_MAPPER_INGREDIENTS.dextrose.id]: 70.96603061347135,
      [OWNER_MAPPER_INGREDIENTS.inulin.id]: 108.44261723624908,
      [OWNER_MAPPER_INGREDIENTS.tara_gum.id]: 3,
    });
    expect(
      Object.fromEntries(
        built.preview.proposedInput.items.map((item) => [
          item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
          item.planned_grams,
        ]),
      ),
    ).toEqual({
      [OWNER_MAPPER_INGREDIENTS.milk_3_5.id]: 566,
      [OWNER_MAPPER_INGREDIENTS.cream_30.id]: 130,
      [OWNER_MAPPER_INGREDIENTS.smp.id]: 45,
      [OWNER_MAPPER_INGREDIENTS.sucrose.id]: 76,
      [OWNER_MAPPER_INGREDIENTS.dextrose.id]: 71,
      [OWNER_MAPPER_INGREDIENTS.inulin.id]: 109,
      [OWNER_MAPPER_INGREDIENTS.tara_gum.id]: 3,
    });

    const withoutConsent = commitPreview(input, NO_CONSTRAINTS, built.preview, AT, 'no-consent');
    expect(withoutConsent).toMatchObject({ ok: false, code: 'direction_consent_required' });
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
    expect(gramsOf(applied.verified.input, OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(3);
    expect(
      gramsOf(
        applied.verified.record.practicalization!.exactInput,
        OWNER_MAPPER_INGREDIENTS.tara_gum.id,
      ),
    ).toBe(3);
    expect(applied.verified.record.before.input).toEqual(input);
  });

  it.each([
    ['Sweetness LESS', -1, 0],
    ['Sweetness MORE', 1, 0],
    ['Softness firm', 0, -1],
    ['Softness soft', 0, 1],
  ] as const)(
    '%s corrects fractional Tara to whole-gram authority',
    (_label, sweetness, softness) => {
      for (const strategy of ['optimal', 'eco'] as const) {
        const input = ownerDirectionFixture(sweetness, softness, strategy);
        const built = buildOptimizePreview(input, NO_CONSTRAINTS, AT);
        if (!built.ok) {
          expect(built.code).toBe('already_clean');
          continue;
        }
        expect(gramsOf(exactCandidateOf(built.preview), OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(
          3,
        );
        expect(gramsOf(built.preview.proposedInput, OWNER_MAPPER_INGREDIENTS.tara_gum.id)).toBe(3);
      }
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

  it('rejects a forged seed from an existing zero-dose stabilizer', () => {
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

  it('seeds the owner-preferred whole-gram total when Tara is missing', () => {
    const base = ownerSameInputRecipe();
    const input: RecipeInput = {
      ...base,
      items: base.items.filter(
        (item) =>
          (item.ingredient.canonical_ingredient_id ?? item.ingredient.id) !==
          OWNER_MAPPER_INGREDIENTS.tara_gum.id,
      ),
    };
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
    const base = ownerSameInputRecipe();
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
