/** @vitest-environment jsdom */
/**
 * PRO modal wiring — owner 2026-09-11. The conflict correction and the
 * interactive preview live in the SAME recalculation modal (no nested modal,
 * no new page); X discards the provisional session like „Wróć".
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OWNER_CREATED_AT,
  ownerFruitRecipe,
  ownerPreviewOptions,
} from '@/features/constraint-studio/__fixtures__/ownerFruitMainFixture';
import {
  attachPreviewInstructionProof,
  bindProductBehaviorToPreview,
  buildOptimizePreview,
  type ConstraintPreview,
} from '@/features/constraint-studio/applyPipeline';
import {
  useConstraintStudioStore,
  type LockConflictState,
} from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { ProRecalcPanel } from './ProRecalcPanel';

vi.setConfig({ testTimeout: 60_000 });

const runtime = vi.hoisted(() => ({
  interactive: vi.fn<(instructions: unknown) => Promise<void>>(async () => undefined),
}));

vi.mock('@/features/constraint-studio/constraintStudioStore', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/constraint-studio/constraintStudioStore')>();
  return { ...actual, runInteractiveRecalculationWithTerminal: runtime.interactive };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const ownerPreview = (): ConstraintPreview => {
  const input = ownerFruitRecipe({ batch: 1000 });
  const options = ownerPreviewOptions(input);
  const result = bindProductBehaviorToPreview(
    buildOptimizePreview(input, { byLineId: {} }, OWNER_CREATED_AT, options),
    options.productBehaviorSnapshots,
    options.productBehaviorSnapshots,
    [],
  );
  if (!result.ok) throw new Error(result.code);
  return result.preview;
};

const conflict: LockConflictState = {
  diagnosis: {
    status: 'relaxation_found',
    locks: [
      { lineId: 'strawberry', ingredientName: 'STRAWBERRIES', grams: 100 },
      { lineId: 'cranberry', ingredientName: 'CRANBERRY', grams: 130 },
    ],
    changes: [{ lineId: 'cranberry', ingredientName: 'CRANBERRY', fromGrams: 130, toGrams: 76 }],
    totalChangeGrams: 54,
    blockers: [{ code: 'liquid_dairy_carrier_below_floor', actualPercent: 24, limitPercent: 30 }],
    probes: 20,
    searchComplete: true,
  },
  baseFingerprint: 'untouched',
  baseDraftRevision: 1,
  sessionInstructions: [],
};

const inDocument = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector);

beforeEach(() => {
  runtime.interactive.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  useRecipeStore.getState().loadRecipeInput(ownerFruitRecipe({ batch: 1000 }));
  useConstraintStudioStore.getState().resetForTests();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('PRO recalculation modal — interactive preview + conflict resolution', () => {
  it('replaces the technical dead end with the conflict correction inside the same modal; X discards it', async () => {
    const onClose = vi.fn();
    useConstraintStudioStore.setState({
      preview: null,
      lockConflict: conflict,
      previewIssue: {
        ok: false,
        code: 'impossible_under_constraints',
        conflict: { lineId: 'cranberry', ingredientName: 'CRANBERRY', kind: 'locked', grams: 130 },
        hardViolatedMetrics: [],
        residualViolatedMetrics: ['liquid_dairy_carrier_below_floor'],
        capReached: false,
        nearestFeasibleGrams: null,
        alternativeProductType: null,
        solverInvocations: 3,
        iteration: {
          solverInvocations: 3,
          draftVectorSearches: 0,
          candidateVector: [],
          draftPlannedSumGrams: 1000,
          draftLineGrams: [],
          startPlannedSumGrams: 1000,
          targetBatchGrams: 1000,
          rounds: [],
          stopReason: 'fixed_point_no_proposal',
          stopDetail: null,
          capped: false,
          attemptedMoves: [],
        },
        templateId: 'milk_base_v1',
        templateStatus: 'approved',
      },
      recalculationTerminal: {
        state: 'LOCK_CHANGE_REQUIRED',
        code: 'impossible_under_constraints',
      },
    });
    await act(async () => {
      root.render(<ProRecalcPanel open onClose={onClose} />);
    });
    const panel = inDocument('[data-testid="lock-conflict-panel"]');
    expect(panel?.dataset.surface).toBe('pro');
    expect(inDocument('[data-testid="pro-recalc-panel"]')?.contains(panel)).toBe(true);
    // The technical refusal (lock table / „Brak wykonalnej alternatywy…") is not shown.
    expect(inDocument('[data-testid="pro-recalc-panel"]')?.textContent).not.toContain(
      'Zweryfikowany stan blokad',
    );
    expect(inDocument('[data-testid="pro-recalc-panel"]')?.textContent).not.toContain(
      'Brak wykonalnej alternatywy',
    );
    await act(async () =>
      inDocument<HTMLButtonElement>('[data-testid="lock-conflict-use-proposal"]')!.click(),
    );
    expect(runtime.interactive).toHaveBeenCalledWith([
      { lineId: 'cranberry', grams: 76, locked: true },
    ]);
    await act(async () =>
      inDocument<HTMLButtonElement>('[data-testid="pro-recalc-close"]')!.click(),
    );
    expect(onClose).toHaveBeenCalled();
    expect(useConstraintStudioStore.getState().lockConflict).toBeNull();
  });

  it('the staged preview is interactive and X discards a provisional instruction session', async () => {
    const onClose = vi.fn();
    const draftInput = ownerFruitRecipe({ batch: 1000 });
    const preview = attachPreviewInstructionProof(ownerPreview(), draftInput, { byLineId: {} }, [
      { lineId: 'strawberry', grams: 60, locked: true },
    ]);
    useConstraintStudioStore.setState({
      preview,
      previewInstructionAuthorization: {
        baseFingerprint: preview.previewInstructions!.baseFingerprint,
        lines: preview.previewInstructions!.lines,
      },
      recalculationTerminal: { state: 'PREVIEW_READY' },
    });
    await act(async () => {
      root.render(<ProRecalcPanel open onClose={onClose} />);
    });
    expect(inDocument('[data-testid="preview-grams-control-cranberry"]')).not.toBeNull();
    await act(async () =>
      inDocument<HTMLButtonElement>('[data-testid="preview-lock-cranberry"]')!.click(),
    );
    await act(async () =>
      inDocument<HTMLButtonElement>('[data-testid="preview-recalculate"]')!.click(),
    );
    const cranberry = preview.lines.find((line) => line.lineId === 'cranberry')!;
    expect(runtime.interactive).toHaveBeenCalledWith([
      { lineId: 'strawberry', grams: 60, locked: true },
      { lineId: 'cranberry', grams: cranberry.afterGrams, locked: true },
    ]);
    await act(async () =>
      inDocument<HTMLButtonElement>('[data-testid="pro-recalc-close"]')!.click(),
    );
    const state = useConstraintStudioStore.getState();
    expect(state.preview).toBeNull();
    expect(state.previewInstructionAuthorization).toBeNull();
  });

  it('an ordinary preview keeps the accepted X behaviour (the staged preview survives for „Otwórz podgląd")', async () => {
    const onClose = vi.fn();
    useConstraintStudioStore.setState({
      preview: ownerPreview(),
      recalculationTerminal: { state: 'PREVIEW_READY' },
    });
    await act(async () => {
      root.render(<ProRecalcPanel open onClose={onClose} />);
    });
    await act(async () =>
      inDocument<HTMLButtonElement>('[data-testid="pro-recalc-close"]')!.click(),
    );
    expect(onClose).toHaveBeenCalled();
    expect(useConstraintStudioStore.getState().preview).not.toBeNull();
  });
});
