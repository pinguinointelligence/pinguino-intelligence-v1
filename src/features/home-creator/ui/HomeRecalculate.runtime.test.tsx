/** @vitest-environment jsdom */
/**
 * HOME — owner 2026-09-11, Part C: the SAME interaction pattern as PRO in ONE
 * modal. Every change is visible before Apply, each proposed amount is the
 * familiar grams control + padlock, conflicts get the simpler correction, and
 * X / Wróć discards everything provisional.
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
  bindProductBehaviorToPreview,
  buildOptimizePreview,
  type ConstraintPreview,
} from '@/features/constraint-studio/applyPipeline';
import {
  useConstraintStudioStore,
  type LockConflictState,
} from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { HomeRecalculate } from './HomeRecalculate';

vi.setConfig({ testTimeout: 60_000 });

const runtime = vi.hoisted(() => ({
  run: vi.fn(async () => undefined),
  interactive: vi.fn<(instructions: unknown) => Promise<void>>(async () => undefined),
  apply: vi.fn(async () => undefined),
}));

vi.mock('@/features/constraint-studio/constraintStudioStore', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/constraint-studio/constraintStudioStore')>();
  return {
    ...actual,
    runPiRecalculationWithTerminal: runtime.run,
    runInteractiveRecalculationWithTerminal: runtime.interactive,
    applyPreviewWithServerAuthority: runtime.apply,
  };
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

const render = async (canSeeGrams = true, onGramsBlocked = vi.fn()) => {
  await act(async () => {
    root.render(<HomeRecalculate canSeeGrams={canSeeGrams} onGramsBlocked={onGramsBlocked} />);
  });
};

const open = async () => {
  await act(async () => inDocument<HTMLButtonElement>('[data-testid="home-recalc-run"]')!.click());
};

beforeEach(() => {
  runtime.run.mockClear();
  runtime.interactive.mockClear();
  runtime.apply.mockClear();
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

describe('HOME interactive recalculation', () => {
  it('opens ONE modal showing every change with the familiar controls; an edit recalculates in place', async () => {
    await render();
    await open();
    expect(runtime.run).toHaveBeenCalledOnce();
    expect(inDocument('[data-testid="home-recalc-dialog"]')).not.toBeNull();

    const preview = ownerPreview();
    await act(async () => {
      useConstraintStudioStore.setState({
        preview,
        recalculationTerminal: { state: 'PREVIEW_READY' },
      });
    });
    const row = inDocument(
      '[data-testid="home-recalc-preview"] [data-testid="preview-row-cranberry"]',
    );
    expect(row).not.toBeNull();
    expect(row?.querySelector('[data-testid="preview-from-grams"]')?.textContent).toBe('130 g');
    expect(inDocument('[data-testid="preview-apply"]')?.textContent).toBe('Zastosuj zmiany');

    await act(async () =>
      inDocument<HTMLButtonElement>('[data-testid="preview-lock-cranberry"]')!.click(),
    );
    await act(async () =>
      inDocument<HTMLButtonElement>('[data-testid="preview-recalculate"]')!.click(),
    );
    const cranberry = preview.lines.find((line) => line.lineId === 'cranberry')!;
    expect(runtime.interactive).toHaveBeenCalledWith([
      { lineId: 'cranberry', grams: cranberry.afterGrams, locked: true },
    ]);
    expect(runtime.apply).not.toHaveBeenCalled();
  });

  it('Zastosuj zmiany applies through the one door and closes the modal', async () => {
    runtime.apply.mockImplementationOnce(async () => {
      useConstraintStudioStore.setState({ preview: null, recalculationTerminal: null });
    });
    await render();
    await open();
    await act(async () => {
      useConstraintStudioStore.setState({
        preview: ownerPreview(),
        recalculationTerminal: { state: 'PREVIEW_READY' },
      });
    });
    await act(async () => inDocument<HTMLButtonElement>('[data-testid="preview-apply"]')!.click());
    expect(runtime.apply).toHaveBeenCalledOnce();
    expect(inDocument('[data-testid="home-recalc-dialog"]')).toBeNull();
  });

  it('a lock conflict gets the simpler HOME correction in the same modal', async () => {
    await render();
    await open();
    await act(async () => {
      useConstraintStudioStore.setState({
        preview: null,
        lockConflict: conflict,
        previewIssue: { ok: false, code: 'no_proposal' },
        recalculationTerminal: { state: 'BLOCKED_WITH_EXACT_ACTION', code: 'no_proposal' },
      });
    });
    const panel = inDocument('[data-testid="lock-conflict-panel"]');
    expect(panel?.dataset.surface).toBe('home');
    expect(panel?.textContent).toContain('Tych ustawień nie da się teraz połączyć.');
    expect(inDocument('[data-testid="lock-conflict-gap"]')).toBeNull();
    await act(async () =>
      inDocument<HTMLButtonElement>('[data-testid="lock-conflict-use-proposal"]')!.click(),
    );
    expect(runtime.interactive).toHaveBeenCalledWith([
      { lineId: 'cranberry', grams: 76, locked: true },
    ]);
  });

  it('X discards everything provisional and closes; the recipe is untouched', async () => {
    await render();
    await open();
    const before = structuredClone(useRecipeStore.getState().items);
    await act(async () => {
      useConstraintStudioStore.setState({
        preview: null,
        lockConflict: conflict,
        recalculationTerminal: { state: 'BLOCKED_WITH_EXACT_ACTION', code: 'no_proposal' },
      });
    });
    await act(async () =>
      inDocument<HTMLButtonElement>('[data-testid="home-recalc-close"]')!.click(),
    );
    expect(inDocument('[data-testid="home-recalc-dialog"]')).toBeNull();
    expect(useConstraintStudioStore.getState().lockConflict).toBeNull();
    expect(useConstraintStudioStore.getState().preview).toBeNull();
    expect(useRecipeStore.getState().items).toEqual(before);
  });

  it('Demo: grams stay hidden in the preview and a control routes to the entitlement', async () => {
    const onGramsBlocked = vi.fn();
    await render(false, onGramsBlocked);
    await open();
    await act(async () => {
      useConstraintStudioStore.setState({
        preview: ownerPreview(),
        recalculationTerminal: { state: 'PREVIEW_READY' },
      });
    });
    const dialog = inDocument('[data-testid="home-recalc-dialog"]')!;
    expect(dialog.textContent).not.toContain('130 g');
    await act(async () =>
      inDocument<HTMLButtonElement>(
        '[data-testid="preview-grams-control-cranberry"] button[aria-label*="— zwiększ"]',
      )!.click(),
    );
    expect(onGramsBlocked).toHaveBeenCalled();
  });
});
