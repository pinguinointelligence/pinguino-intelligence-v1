/** @vitest-environment jsdom */
/**
 * OWNER BUGFIX — HOME EMPTY REFUSAL (#287), 2026-09-11 — the served chain, end to end.
 *
 * Served staging `aaece589` (bundle `index-S4moMr6R.js`): a HOME Sorbet, Gellatti's Direction
 * proposal applied, the padlock on one fruit, „Przelicz i popraw" → the dialog showed ONLY „Wróć".
 * Captured there: the Worker answered with the refusal below, the store published it unchanged
 * as `BLOCKED_WITH_EXACT_ACTION`, and the component rendered nothing but the button.
 *
 * Everything after the Worker is the real runtime here: server authority (answered by a fake
 * server), the canonical `createOptimizePreview`, the terminal mapping and the HOME component.
 * Only the Worker's answer is replayed — verbatim, minus its `iteration` diagnostics payload,
 * which nothing on this path reads.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ownerFruitRecipe,
  ownerFruitSnapshots,
} from '@/features/constraint-studio/__fixtures__/ownerFruitMainFixture';
import { constraintStudioCopy } from '@/features/constraint-studio/constraintStudioCopy';
import {
  useConstraintStudioStore,
  type PreviewIssue,
} from '@/features/constraint-studio/constraintStudioStore';
import type { OptimizePreviewComputation } from '@/features/constraint-studio/optimizePreviewComputation';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { HomeRecalculate } from './HomeRecalculate';

vi.setConfig({ testTimeout: 60_000 });

/** The canonical Worker solve, answered with the served result. */
const worker = vi.hoisted(() => ({
  requests: 0,
  answer: null as null | (() => OptimizePreviewComputation),
}));

vi.mock('@/features/constraint-studio/optimizePreviewRuntime', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/constraint-studio/optimizePreviewRuntime')>();
  return {
    ...actual,
    runOptimizePreviewOffMainThread: (
      ...args: Parameters<typeof actual.runOptimizePreviewOffMainThread>
    ) => {
      worker.requests += 1;
      const answer = worker.answer;
      if (answer === null) return actual.runOptimizePreviewOffMainThread(...args);
      return Promise.resolve(answer());
    },
  };
});

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

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

/** The served Worker result (without its `iteration` diagnostics). */
const SERVED_REFUSAL: PreviewIssue = {
  ok: false,
  code: 'no_proposal',
  violatedMetrics: ['npac', 'pod'],
  solverInvocations: 8,
  directionTargetUnreached: true,
};

let host: HTMLDivElement;
let root: Root;

const inDocument = (selector: string) => document.querySelector<HTMLElement>(selector);
const textOf = (testId: string) => inDocument(`[data-testid="${testId}"]`)?.textContent ?? null;
/** The recipe itself — what a refusal must never write. */
const recipeValues = () =>
  useRecipeStore
    .getState()
    .items.map((item) => ({ id: item.id, grams: item.planned_grams, lock: item.lock_type }));

beforeEach(() => {
  worker.requests = 0;
  worker.answer = () => ({ result: structuredClone(SERVED_REFUSAL), rescueAdvice: null });
  useRecipeStore.getState().resetToDemo();
  useRecipeProfileStore.getState().resetForTests();
  useConstraintStudioStore.getState().resetForTests();
  const input = ownerFruitRecipe({ batch: 1000 });
  useRecipeStore.getState().loadRecipeInput(input);
  const snapshots = ownerFruitSnapshots(input);
  for (const item of useRecipeStore.getState().items) {
    const snapshot = snapshots[item.id];
    if (snapshot) useRecipeStore.getState().setProductBehaviorSnapshot(item.id, snapshot);
  }
  // Served step 5: HOME's padlock on one fruit, through HOME's own row action.
  useRecipeStore.getState().setLockType('cranberry', 'grams', 'home');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('OWNER BUGFIX — the served blank refusal, end to end (#287)', () => {
  it("the solver's refusal reaches HOME unchanged, and HOME explains it and offers Wróć", async () => {
    const before = recipeValues();
    await act(async () => {
      root.render(<HomeRecalculate />);
    });
    await act(async () => inDocument('[data-testid="home-recalc-run"]')!.click());
    await vi.waitFor(() => {
      expect(useConstraintStudioStore.getState().recalculationTerminal?.state).toBe(
        'BLOCKED_WITH_EXACT_ACTION',
      );
    });
    await act(async () => undefined);

    // The ordinary run (no 0 g priority line) asked the Worker exactly once.
    expect(worker.requests).toBe(1);
    // The verdict the customer sees is exactly the solver's — nothing on the way reshaped it.
    const studio = useConstraintStudioStore.getState();
    expect(studio.previewIssue).toEqual(SERVED_REFUSAL);
    expect(studio.recalculationTerminal).toEqual({
      state: 'BLOCKED_WITH_EXACT_ACTION',
      code: 'no_proposal',
    });
    expect(studio.preview).toBeNull();
    expect(studio.lockConflict).toBeNull();
    expect(studio.blocked).toBeNull();
    expect(studio.directionBestCandidate).toBeNull();

    // What the customer reads.
    const refusal = inDocument('[data-testid="home-recalc-refusal"]');
    expect(refusal).not.toBeNull();
    expect(refusal!.textContent!.trim()).not.toBe('Wróć');
    expect(textOf('home-recalc-issue')).toBe(constraintStudioCopy.previewIssue.bestSafeResult);
    expect(textOf('home-recalc-issue-detail')).toBe(
      'Nie udało się bezpiecznie poprawić: słodycz, miękkość.',
    );
    expect(textOf('home-recalc-next')).toBe(
      'Twoja receptura się nie zmieniła. Możesz zmienić składniki lub ich ilości i przeliczyć ponownie.',
    );
    expect(textOf('home-recalc-back')).toBe('Wróć');

    // Fail-closed: the recipe was never written.
    expect(recipeValues()).toEqual(before);

    // Wróć: nothing provisional survives, the recipe is exactly as before.
    await act(async () => inDocument('[data-testid="home-recalc-back"]')!.click());
    expect(inDocument('[data-testid="home-recalc-dialog"]')).toBeNull();
    expect(useConstraintStudioStore.getState().previewIssue).toBeNull();
    expect(recipeValues()).toEqual(before);
  });
});
