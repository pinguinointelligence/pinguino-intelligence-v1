/**
 * OWNER 2026-09-11 — FIX 1: the PRO Crown 1 g AUTO-SEED is a bootstrap, never
 * an exact Direction hold.
 *
 * Served capture (see the fixture): PRO Sorbet, three Fresh Fruit lines crowned
 * from 0 g at the 1 g seed, neutral Direction active. Before the fix the exact
 * Direction machinery held the seeds — the Sorbet pre-router keeps every Main
 * byte-exact and the Main frontier's `direction:*` gate vetoed every raise — so
 * Przelicz failed technical validation at ~1 g per fruit. The distinction is
 * provenance, never value: the same grams typed by the user keep the existing
 * hold, and real locks win.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecipeInput } from '@/engine';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import type { IngredientConstraint } from '@/features/recipe-constraints';
import { hasActiveExactDirectionObjective } from '@/features/recipe-direction/recipeDirectionTargets';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  SERVED_FRUIT,
  SERVED_FRUIT_IDS,
  servedSorbetPreviewOptions,
  servedSorbetRecipe,
  servedSorbetSnapshots,
} from './__fixtures__/servedSorbetThreeFruitFixture';
import { buildOptimizePreview } from './applyPipeline';
import { applyPreviewInstructions } from './previewInstructions';
import {
  applyPreviewWithServerAuthority,
  runPiRecalculationWithTerminal,
  useConstraintStudioStore,
} from './constraintStudioStore';

vi.setConfig({ testTimeout: 180_000 });

vi.mock('@/services/productIntelligence', () => ({
  resolveRecipeProposalBehaviorSnapshots: async (input: {
    snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  }) => ({
    snapshots: Object.fromEntries(
      Object.entries(input.snapshots)
        .filter((entry): entry is [string, ProductBehaviorSnapshot] => entry[1] !== undefined)
        .map(([lineId, snapshot]) => [
          lineId,
          { ...structuredClone(snapshot), resolutionState: 'RESOLVED' as const },
        ]),
    ),
    unresolvedLineIds: [],
  }),
  validateRecipeBehaviorOnServer: async (input: { module: string }) => ({
    ready: true,
    module: input.module,
    staleLineIds: [],
    lines: [],
  }),
}));

const CREATED_AT = '2026-09-11T08:40:23.734Z';
const { strawberry, cranberry, watermelon } = SERVED_FRUIT;

const preview = (input: RecipeInput, byLineId: Record<string, IngredientConstraint> = {}) =>
  buildOptimizePreview(input, { byLineId }, CREATED_AT, servedSorbetPreviewOptions(input));

const accepted = (result: ReturnType<typeof preview>) => {
  expect(result.ok, JSON.stringify(result).slice(0, 800)).toBe(true);
  if (!result.ok) throw new Error('preview refused');
  return result.preview;
};

const grams = (input: RecipeInput, lineId: string) =>
  input.items.find((item) => item.id === lineId)!.planned_grams;
const fruit = (input: RecipeInput) => SERVED_FRUIT_IDS.map((id) => grams(input, id));
const total = (input: RecipeInput) =>
  input.items.reduce((sum, item) => sum + item.planned_grams, 0);
const raisesAnyFruit = (result: ReturnType<typeof preview>) =>
  result.ok && fruit(result.preview.proposedInput).some((value) => value > 1);

describe('FIX 1 — the untouched PRO Crown seed is sized by the Main search', () => {
  it('A/P1: three seeded Mains are raised, on batch, in whole grams — Direction still active', () => {
    const input = servedSorbetRecipe({ seeded: SERVED_FRUIT_IDS });
    expect(hasActiveExactDirectionObjective(input)).toBe(true);
    const result = accepted(preview(input));
    for (const value of fruit(result.proposedInput)) expect(value).toBeGreaterThan(1);
    expect(total(result.proposedInput)).toBe(input.target_batch_grams);
    for (const item of result.proposedInput.items) {
      expect(Number.isInteger(item.planned_grams)).toBe(true);
    }
    expect(result.mainHeldByExactDirection).not.toBe(true);
    expect(result.mainObjective?.exactAcceptedMainGrams).toBe(
      fruit(result.proposedInput).reduce((sum, value) => sum + value, 0),
    );
  });

  it('P2: the same 1 g the user typed keeps the existing exact Direction hold', () => {
    expect(raisesAnyFruit(preview(servedSorbetRecipe({ seeded: [] })))).toBe(false);
  });

  it('single Main: the seed leaves the Sorbet pre-router hold; a typed amount keeps it', () => {
    const seeded = accepted(
      preview(servedSorbetRecipe({ mains: [strawberry], seeded: [strawberry] })),
    );
    const typed = preview(servedSorbetRecipe({ mains: [strawberry] }));
    const sized = grams(seeded.proposedInput, strawberry);
    expect(sized).toBeGreaterThan(100);
    expect(typed.ok ? grams(typed.preview.proposedInput, strawberry) : 1).toBeLessThan(sized / 10);
    // PR #276: the uncrowned fruit are secondary flavours — they may give mass
    // back, never receive more.
    expect(grams(seeded.proposedInput, cranberry)).toBeLessThanOrEqual(1);
    expect(grams(seeded.proposedInput, watermelon)).toBeLessThanOrEqual(1);
  });

  it('P8: two seeded Mains are sized; the uncrowned third fruit stays a decrease-only flavour', () => {
    const result = accepted(
      preview(
        servedSorbetRecipe({ mains: [strawberry, cranberry], seeded: [strawberry, cranberry] }),
      ),
    );
    expect(grams(result.proposedInput, strawberry)).toBeGreaterThan(1);
    expect(grams(result.proposedInput, cranberry)).toBeGreaterThan(1);
    expect(grams(result.proposedInput, watermelon)).toBeLessThanOrEqual(1);
  });

  it('P8 mixed: a seed still in the Crown group means the group is unsized — it moves together', () => {
    // Entered Crown grams are never a Multi-Main anchor (equal top-down seed
    // shares), so the typed 1 g sibling is sized with the seeds it shares a
    // group with rather than pinning them.
    const result = accepted(preview(servedSorbetRecipe({ seeded: [strawberry, watermelon] })));
    for (const value of fruit(result.proposedInput)) expect(value).toBeGreaterThan(1);
    expect(total(result.proposedInput)).toBe(1000);
  });

  it('Direction off: the provenance changes nothing — it only concerns the exact Direction hold', () => {
    const seeded = accepted(
      preview(servedSorbetRecipe({ seeded: SERVED_FRUIT_IDS, directionActive: false })),
    );
    const typed = accepted(preview(servedSorbetRecipe({ directionActive: false })));
    expect(fruit(seeded.proposedInput)).toEqual(fruit(typed.proposedInput));
  });
});

describe('FIX 1 — a real lock always wins over the bootstrap', () => {
  it('P4: grams lock', () => {
    const result = accepted(
      preview(servedSorbetRecipe({ seeded: [strawberry, watermelon] }), {
        [cranberry]: { mode: 'locked', grams: 1 },
      }),
    );
    expect(grams(result.proposedInput, cranberry)).toBe(1);
    expect(grams(result.proposedInput, strawberry)).toBeGreaterThan(1);
    expect(grams(result.proposedInput, watermelon)).toBeGreaterThan(1);
  });

  it('P5: percent lock', () => {
    const result = accepted(
      preview(servedSorbetRecipe({ seeded: [strawberry, cranberry] }), {
        [watermelon]: { mode: 'percent', percent: 10 },
      }),
    );
    expect(grams(result.proposedInput, watermelon)).toBe(100);
    expect(grams(result.proposedInput, strawberry)).toBeGreaterThan(1);
  });

  it('P6: range lock', () => {
    const result = accepted(
      preview(servedSorbetRecipe({ seeded: [cranberry, watermelon] }), {
        [strawberry]: { mode: 'range', minGrams: 1, maxGrams: 5 },
      }),
    );
    const value = grams(result.proposedInput, strawberry);
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(5);
  });
});

describe("FIX 1 — an amount typed inside the recalculation preview is the user's", () => {
  const provenanceAfter = (value: number, locked: boolean) => {
    const result = applyPreviewInstructions(
      servedSorbetRecipe({ seeded: SERVED_FRUIT_IDS }),
      { byLineId: {} },
      [{ lineId: strawberry, grams: value, locked }],
    );
    if (!result.ok) throw new Error(result.reason);
    return result.input.items.find((item) => item.id === strawberry)!.amount_provenance;
  };

  it('C: a changed amount ends the bootstrap, padlocked or not', () => {
    expect(provenanceAfter(40, false)).toBeUndefined();
    expect(provenanceAfter(40, true)).toBeUndefined();
  });

  it('D: a padlock at the seed amount is a real lock', () => {
    expect(provenanceAfter(1, true)).toBeUndefined();
  });

  it('an untouched amount without a padlock writes nothing — the seed stays a seed', () => {
    expect(provenanceAfter(1, false)).toBe('AUTO_CROWN_SEED');
  });
});

describe('FIX 1 — end to end through the PRO store (Przelicz → Zastosuj → Przelicz)', () => {
  const line = (lineId: string) =>
    useRecipeStore.getState().items.find((item) => item.id === lineId)!;

  beforeEach(() => {
    useRecipeStore.getState().resetToDemo();
    useRecipeProfileStore.getState().resetForTests();
    useConstraintStudioStore.getState().resetForTests();
  });

  it('the seeds are sized and applied, lose their provenance, and the next Przelicz keeps the sized amounts', async () => {
    const input = servedSorbetRecipe({ seeded: SERVED_FRUIT_IDS });
    useRecipeStore.getState().loadRecipeInput(input);
    const snapshots = servedSorbetSnapshots(input);
    for (const item of useRecipeStore.getState().items) {
      const snapshot = snapshots[item.id];
      if (snapshot) useRecipeStore.getState().setProductBehaviorSnapshot(item.id, snapshot);
    }
    for (const id of SERVED_FRUIT_IDS) {
      expect(line(id)).toMatchObject({ planned_grams: 1, lock_type: 'main' });
      expect(line(id).amount_provenance).toBe('AUTO_CROWN_SEED');
    }

    await runPiRecalculationWithTerminal();
    const session = useConstraintStudioStore.getState();
    expect(session.recalculationTerminal?.state).toBe('PREVIEW_READY');
    // The neutral Direction cannot be met exactly by this fruit set, so the
    // sized recipe arrives as the best Direction candidate and needs the
    // customer's consent — the served „najbliżej" card. Nothing here is held.
    const candidate = session.directionBestCandidate ?? session.preview;
    expect(candidate, JSON.stringify(session.previewIssue)).not.toBeNull();
    if (!candidate) return;
    for (const value of fruit(candidate.proposedInput)) expect(value).toBeGreaterThan(1);
    if (session.directionBestCandidate) session.acceptBestDirectionCandidate();
    const first = useConstraintStudioStore.getState().preview;
    expect(first?.proposedInput).toEqual(candidate.proposedInput);
    if (!first) return;

    await applyPreviewWithServerAuthority();
    const applied = useConstraintStudioStore.getState();
    expect(applied.blocked, JSON.stringify(applied.blocked)).toBeNull();
    expect(applied.history).toHaveLength(1);
    for (const id of SERVED_FRUIT_IDS) {
      expect(line(id).planned_grams).toBe(grams(first.proposedInput, id));
      expect(line(id).lock_type).toBe('main');
      expect(line(id).amount_provenance).toBeUndefined();
    }
    const sized = SERVED_FRUIT_IDS.map((id) => line(id).planned_grams);
    expect(useRecipeStore.getState().items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(
      1000,
    );

    // E: the sized amounts are the user's now — the next Przelicz under the
    // same Direction keeps them instead of treating them as a bootstrap.
    await runPiRecalculationWithTerminal();
    const next = useConstraintStudioStore.getState();
    const second = next.directionBestCandidate ?? next.preview;
    if (second) expect(fruit(second.proposedInput)).toEqual(sized);
    expect(SERVED_FRUIT_IDS.map((id) => line(id).planned_grams)).toEqual(sized);
  });
});
