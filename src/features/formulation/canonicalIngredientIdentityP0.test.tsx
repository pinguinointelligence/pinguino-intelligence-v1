import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CORRECTION_CANDIDATES,
  calculateRecipe,
  type RecipeInput,
  type RecipeItem,
} from '@/engine';
import {
  CORE_INGREDIENT_IDENTITIES,
  canonicalDuplicateIds,
  canonicalIngredientId,
} from '@/data/ingredients/canonicalIngredientIdentity';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { buildFormulationProposal } from './formulate';
import { listFormulationTemplates, selectFormulationTemplate } from './templateRegistry';
import {
  commitPreview,
  mergeByCanonicalIdentity,
  workingStateFingerprint,
  type ConstraintPreview,
} from '@/features/constraint-studio/applyPipeline';
import { ConstraintPreviewCard } from '@/features/constraint-studio/ui/ConstraintPreviewCard';
import {
  OWNER_MAPPER_INGREDIENTS,
  OWNER_PLANNED_GRAMS,
  ownerSameInputItems,
  ownerSameInputRecipe,
} from './__fixtures__/ownerSameInputFixture';

const EMPTY_CONSTRAINTS: ConstraintSet = { byLineId: {} };

function asStoreInput(input: RecipeInput) {
  return {
    ...input,
    machine_capacity_source: null,
    flavor_intensity: input.goals?.flavor_intensity ?? ('balanced' as const),
    cost_priority: input.goals?.cost_priority ?? ('balanced' as const),
  };
}

function canonicalCounts(input: RecipeInput): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of input.items) {
    const id = canonicalIngredientId(item.ingredient);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

afterEach(() => {
  useRecipeStore.getState().resetToDemo();
});

describe('P0 canonical ingredient identity + current draft integrity', () => {
  it('Test A: exact owner fixture uses visible planned grams for canonical draft, Engine and Monitor', () => {
    const input = buildRecipeInput(asStoreInput(ownerSameInputRecipe(true)));
    const result = calculateRecipe(input);

    expect(input.items.map((item) => item.actual_grams)).toEqual(Array(7).fill(null));
    expect(input.items.map((item) => item.planned_grams)).toEqual(
      Object.values(OWNER_PLANNED_GRAMS),
    );
    expect(result.items.map((item) => item.effective_grams)).toEqual(
      Object.values(OWNER_PLANNED_GRAMS),
    );
    expect(result.total_batch_g).toBe(1000);
    expect(
      result.items.map((item) =>
        Number(((item.effective_grams / result.total_batch_g) * 100).toFixed(2)),
      ),
    ).toEqual([60, 13.5, 4.3, 8.6, 8, 5.41, 0.19]);
    expect(canonicalDuplicateIds(input.items)).toEqual([]);
    expect(result.engine_version).toBeTruthy();
    expect(result.config_version).toBeTruthy();
  });

  it('Test B: full G17 formulation reuses an existing live-Mapper Milk line', () => {
    const template = selectFormulationTemplate('milk_gelato', -12).template!;
    const input: RecipeInput = {
      ...ownerSameInputRecipe(),
      items: [{ ...ownerSameInputItems()[0]!, planned_grams: 1 }],
    };
    const built = buildFormulationProposal(input, EMPTY_CONSTRAINTS, template, 'full_formulation');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const milkId = canonicalIngredientId(OWNER_MAPPER_INGREDIENTS.milk_3_5);
    expect(canonicalCounts(built.proposal.proposedInput).get(milkId)).toBe(1);
    expect(
      built.proposal.proposedInput.items.find(
        (item) => canonicalIngredientId(item.ingredient) === milkId,
      )?.id,
    ).toBe('owner:milk_3_5');
    expect(built.proposal.added.some((line) => line.mapperId === milkId)).toBe(false);
    expect(
      built.proposal.roleTrace.find((row) => row.mapperId === milkId)?.existingLineReused,
    ).toBe(true);
  });

  it('Test C: save/load roundtrip preserves canonical ids, grams, totals, percentages and Engine output', () => {
    const before = buildRecipeInput(asStoreInput(ownerSameInputRecipe(true)));
    const beforeResult = calculateRecipe(before);

    useRecipeStore.getState().loadRecipeInput(before, {
      savedId: 'owner-same-input',
      savedName: 'Owner same input',
      versionNumber: 1,
    });
    const after = buildRecipeInput(useRecipeStore.getState());
    const afterResult = calculateRecipe(after);

    expect(after.items.map((item) => canonicalIngredientId(item.ingredient))).toEqual(
      before.items.map((item) => canonicalIngredientId(item.ingredient)),
    );
    expect(after.items.map((item) => item.planned_grams)).toEqual(
      before.items.map((item) => item.planned_grams),
    );
    expect(afterResult).toEqual(beforeResult);
  });

  it.each(CORE_INGREDIENT_IDENTITIES)(
    'Test D: pre-added $toolboxId is never auto-added as a duplicate',
    (identity) => {
      const template = selectFormulationTemplate('milk_gelato', -12).template!;
      const candidate = DEFAULT_CORRECTION_CANDIDATES.find(
        (entry) => entry.id === identity.toolboxId,
      )!;
      const livePickerIngredient = {
        ...candidate.ingredient,
        id: identity.mapperId,
        canonical_ingredient_id: identity.mapperId,
        identity_provenance: 'mapper' as const,
      };
      const input: RecipeInput = {
        ...ownerSameInputRecipe(),
        items: [
          {
            id: `picker:${identity.toolboxId}`,
            ingredient: livePickerIngredient,
            planned_grams: 1,
            actual_grams: null,
            lock_type: 'unlocked',
          },
        ],
      };
      const built = buildFormulationProposal(
        input,
        EMPTY_CONSTRAINTS,
        template,
        'full_formulation',
      );
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(canonicalCounts(built.proposal.proposedInput).get(identity.mapperId)).toBe(1);
    },
  );

  it('Test E: 1193.7 g Preview is diagnostic, Apply returns batch_total_mismatch and draft is unchanged', () => {
    const current = ownerSameInputRecipe();
    const legacyMilk = DEFAULT_CORRECTION_CANDIDATES.find((entry) => entry.id === 'milk_3_5')!;
    const added: RecipeItem = {
      id: 'correction-milk_3_5-owner',
      ingredient: legacyMilk.ingredient,
      planned_grams: 193.7,
      actual_grams: null,
      lock_type: 'unlocked',
    };
    const proposed: RecipeInput = { ...current, items: [...current.items, added] };
    const engine = calculateRecipe(proposed);
    const preview: ConstraintPreview = {
      kind: 'suggested_fix',
      titlePl: 'Owner 1193.7 g proof',
      outcomeClassification: {
        outcome: 'no_verified_change',
        batchReconciled: false,
        compositionUnchanged: false,
        engineImproved: false,
        beforeGrams: 1000,
        afterGrams: 1193.7,
        targetBatchGrams: 1000,
        violationsBefore: 0,
        violationsAfter: 0,
      },
      baseFingerprint: workingStateFingerprint(current, EMPTY_CONSTRAINTS),
      proposedInput: proposed,
      nextConstraints: EMPTY_CONSTRAINTS,
      lines: [
        ...current.items.map((item) => ({
          lineId: item.id,
          name: item.ingredient.name,
          beforeGrams: item.planned_grams,
          afterGrams: item.planned_grams,
          kind: 'unchanged' as const,
          locked: false,
        })),
        {
          lineId: added.id,
          name: added.ingredient.name,
          beforeGrams: null,
          afterGrams: 193.7,
          kind: 'added',
          locked: false,
        },
      ],
      violationsBefore: 0,
      violationsAfter: 0,
      explanation: [],
      engineVersion: engine.engine_version,
      configVersion: engine.config_version,
      createdAt: '2026-08-07T00:00:00.000Z',
    };
    const before = JSON.stringify(current);
    const committed = commitPreview(
      current,
      EMPTY_CONSTRAINTS,
      preview,
      '2026-08-07T00:00:01.000Z',
      'owner-1193-7',
    );
    expect(committed.ok).toBe(false);
    if (!committed.ok) expect(committed.code).toBe('batch_total_mismatch');
    expect(JSON.stringify(current)).toBe(before);

    const html = renderToStaticMarkup(
      <ConstraintPreviewCard
        preview={preview}
        onApply={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="preview-apply-disabled"');
    expect(html).toContain('disabled=""');

    // Independent semantic-duplicate door at an otherwise exact 1000 g total.
    const balancedDuplicate: RecipeInput = {
      ...current,
      items: [
        ...current.items.map((item) =>
          canonicalIngredientId(item.ingredient) === 'PI-ING-000236'
            ? { ...item, planned_grams: item.planned_grams - 193.7 }
            : item,
        ),
        added,
      ],
    };
    useRecipeStore.getState().loadRecipeInput(current);
    const storeBefore = JSON.stringify(useRecipeStore.getState().items);
    const duplicateWrite = useRecipeStore.getState().applyVerifiedRecipeInput(balancedDuplicate);
    expect(duplicateWrite.ok).toBe(false);
    if (!duplicateWrite.ok) expect(duplicateWrite.code).toBe('duplicate_ingredient');
    expect(JSON.stringify(useRecipeStore.getState().items)).toBe(storeBefore);
  });

  it('Test F: 20 edit/formulate Apply-or-Cancel cycles keep ids stable, one row per ingredient and target equality', () => {
    let current = ownerSameInputRecipe();
    const initialIds = current.items.map((item) => canonicalIngredientId(item.ingredient));
    const legacyMilk = DEFAULT_CORRECTION_CANDIDATES.find((entry) => entry.id === 'milk_3_5')!;

    for (let cycle = 0; cycle < 20; cycle += 1) {
      const delta = 0.25;
      const edited = {
        ...current,
        items: current.items.map((item) =>
          canonicalIngredientId(item.ingredient) === 'PI-ING-000180'
            ? { ...item, planned_grams: item.planned_grams - delta }
            : item,
        ),
      };
      const proposal: RecipeInput = {
        ...edited,
        items: [
          ...edited.items,
          {
            id: `cycle-milk-${cycle}`,
            ingredient: legacyMilk.ingredient,
            planned_grams: delta,
            actual_grams: null,
            lock_type: 'unlocked',
          },
        ],
      };
      const formulated = mergeByCanonicalIdentity(edited, proposal);
      if (cycle % 2 === 0) current = formulated; // Apply; odd cycle = Cancel.

      expect(current.items.map((item) => canonicalIngredientId(item.ingredient))).toEqual(
        initialIds,
      );
      expect(canonicalDuplicateIds(current.items)).toEqual([]);
      expect(current.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBeCloseTo(1000, 9);
      const one = buildRecipeInput(asStoreInput(current));
      const two = buildRecipeInput(asStoreInput(structuredClone(current)));
      expect(JSON.stringify(one)).toBe(JSON.stringify(two));
      expect(calculateRecipe(one).total_batch_g).toBeCloseTo(1000, 9);
    }
  });

  it('Test G: picker, toolbox, template and Engine resolve every core role to the same PI-ING identity', () => {
    const templateToolboxIds = new Set(
      listFormulationTemplates().flatMap((template) =>
        template.roles.flatMap((role) => (role.toolboxId ? [role.toolboxId] : [])),
      ),
    );
    for (const identity of CORE_INGREDIENT_IDENTITIES) {
      const toolbox = DEFAULT_CORRECTION_CANDIDATES.find(
        (candidate) => candidate.id === identity.toolboxId,
      );
      expect(toolbox, identity.toolboxId).toBeDefined();
      expect(templateToolboxIds.has(identity.toolboxId), identity.toolboxId).toBe(true);
      expect(canonicalIngredientId(toolbox!.ingredient)).toBe(identity.mapperId);
      expect(canonicalIngredientId({ ...toolbox!.ingredient, id: identity.mapperId })).toBe(
        identity.mapperId,
      );
    }
  });
});
