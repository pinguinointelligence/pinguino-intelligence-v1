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
  type PreviewIssue,
} from '@/features/constraint-studio/constraintStudioStore';
import { constraintStudioCopy } from '@/features/constraint-studio/constraintStudioCopy';
import { customerStopReasonPl } from '@/features/constraint-studio/customerConstraintStudioPresentation';
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

describe('PACKAGE 2A — OWNER OD-1: a 0 g HOME priority line is the solver’s to size', () => {
  it('„Przelicz i popraw" hands it over as the Crown bootstrap on the provisional copy', async () => {
    const main = useRecipeStore.getState().items.find((item) => item.lock_type === 'main')!;
    useRecipeStore.setState((state) => ({
      items: state.items.map((item) =>
        item.id === main.id ? { ...item, planned_grams: 0 } : item,
      ),
    }));
    await render();
    await open();
    expect(runtime.run).not.toHaveBeenCalled();
    expect(runtime.interactive).toHaveBeenCalledWith([
      { lineId: main.id, grams: 1, locked: false, bootstrap: true },
    ]);
    // The recipe itself was not written.
    expect(useRecipeStore.getState().items.find((item) => item.id === main.id)!.planned_grams).toBe(
      0,
    );
  });

  it('with no 0 g priority line the run is the ordinary one', async () => {
    await render();
    await open();
    expect(runtime.run).toHaveBeenCalledOnce();
    expect(runtime.interactive).not.toHaveBeenCalled();
  });
});

/*
 * OWNER BUGFIX — HOME EMPTY REFUSAL (#287), 2026-09-11.
 *
 * Served staging `aaece589`: a HOME Sorbet, Gellatti's Direction proposal applied, the padlock
 * on one fruit, „Przelicz i popraw" again → the dialog rendered ONLY „Wróć". This is the refusal
 * HomeRecalculate held at that moment (read from the served component): the solver's own verdict,
 * untouched by the binding. The HOME adapter read nothing but `messagePl`, which this variant does
 * not carry, and the block had no fallback.
 */
const SERVED_REFUSAL: PreviewIssue = {
  ok: false,
  code: 'no_proposal',
  violatedMetrics: ['npac', 'pod'],
  solverInvocations: 8,
  directionTargetUnreached: true,
};
const SERVED_TERMINAL = { state: 'BLOCKED_WITH_EXACT_ACTION', code: 'no_proposal' } as const;
const REFUSAL_NEXT =
  'Twoja receptura się nie zmieniła. Możesz zmienić składniki lub ich ilości i przeliczyć ponownie.';
/** Internal vocabulary that must never reach the customer. */
const RAW = [
  'no_proposal',
  'best_safe_result',
  'directionTargetUnreached',
  'solverInvocations',
  'violatedMetrics',
  'BLOCKED_WITH_EXACT_ACTION',
  'NPAC',
  'POD',
  'PI-ING-',
];

const textOf = (testId: string) => inDocument(`[data-testid="${testId}"]`)?.textContent ?? null;

const showState = async (
  state: Partial<ReturnType<typeof useConstraintStudioStore.getState>>,
): Promise<HTMLElement | null> => {
  await render();
  await open();
  await act(async () => {
    useConstraintStudioStore.setState({ preview: null, ...state });
  });
  return inDocument('[data-testid="home-recalc-refusal"]');
};

describe('OWNER BUGFIX — HOME never shows an empty refusal (#287)', () => {
  it('the exact served refusal explains itself: reason, what could not be improved, the next step, Wróć', async () => {
    const refusal = await showState({
      previewIssue: structuredClone(SERVED_REFUSAL),
      recalculationTerminal: SERVED_TERMINAL,
    });
    expect(refusal).not.toBeNull();
    expect(textOf('home-recalc-issue')).toBe(constraintStudioCopy.previewIssue.bestSafeResult);
    expect(textOf('home-recalc-issue-detail')).toBe(
      'Nie udało się bezpiecznie poprawić: słodycz, miękkość.',
    );
    expect(textOf('home-recalc-next')).toBe(REFUSAL_NEXT);
    expect(textOf('home-recalc-back')).toBe('Wróć');
    expect(refusal!.textContent!.trim()).not.toBe('Wróć');
    for (const raw of RAW) expect(refusal!.textContent).not.toContain(raw);
    // Presentation only: the verdict is exactly what the pipeline published.
    expect(useConstraintStudioStore.getState().previewIssue).toEqual(SERVED_REFUSAL);
    expect(useConstraintStudioStore.getState().recalculationTerminal).toEqual(SERVED_TERMINAL);
  });

  it('Wróć closes the refusal and leaves the recipe untouched', async () => {
    const before = structuredClone(useRecipeStore.getState().items);
    await showState({
      previewIssue: structuredClone(SERVED_REFUSAL),
      recalculationTerminal: SERVED_TERMINAL,
    });
    await act(async () =>
      inDocument<HTMLButtonElement>('[data-testid="home-recalc-back"]')!.click(),
    );
    expect(inDocument('[data-testid="home-recalc-dialog"]')).toBeNull();
    expect(useConstraintStudioStore.getState().previewIssue).toBeNull();
    expect(useRecipeStore.getState().items).toEqual(before);
  });

  it('a refusal that carries no reason at all still says what happened and what to do', async () => {
    const refusal = await showState({ previewIssue: null, recalculationTerminal: SERVED_TERMINAL });
    expect(textOf('home-recalc-issue')).toBe('Nie udało się teraz przygotować propozycji.');
    expect(textOf('home-recalc-issue-detail')).toBeNull();
    expect(textOf('home-recalc-next')).toBe(REFUSAL_NEXT);
    expect(textOf('home-recalc-back')).toBe('Wróć');
    for (const raw of RAW) expect(refusal!.textContent).not.toContain(raw);
  });

  it('„best achievable" is explained with its stop reason, never blank and never a search count', async () => {
    const refusal = await showState({
      previewIssue: {
        ok: false,
        code: 'best_safe_result',
        solverInvocations: 12,
        softViolatedMetrics: ['npac'],
        stopReason: 'local_no_proposal',
      } as unknown as PreviewIssue,
      recalculationTerminal: { state: 'BEST_ACHIEVABLE' },
    });
    expect(textOf('home-recalc-issue')).toBe(
      `${constraintStudioCopy.previewIssue.bestSafeResult} ${customerStopReasonPl('local_no_proposal')}`,
    );
    expect(textOf('home-recalc-next')).toBe(REFUSAL_NEXT);
    for (const raw of RAW) expect(refusal!.textContent).not.toContain(raw);
    expect(refusal!.textContent).not.toContain('12');
  });

  it('an ordinary no-proposal names what stayed out of range and never a PRO-only lock control', async () => {
    const refusal = await showState({
      previewIssue: {
        ok: false,
        code: 'no_proposal',
        violatedMetrics: ['npac'],
        solverInvocations: 8,
      },
      recalculationTerminal: SERVED_TERMINAL,
    });
    expect(textOf('home-recalc-issue')).toBe(
      'Przeliczyliśmy recepturę, ale nie znaleźliśmy bezpiecznej korekty w zatwierdzonych ' +
        'zakresach. Parametry poza zakresem: miękkość.',
    );
    expect(refusal!.textContent).not.toContain('Sprawdź wykonalność blokad');
    expect(textOf('home-recalc-next')).toBe(REFUSAL_NEXT);
    for (const raw of RAW) expect(refusal!.textContent).not.toContain(raw);
  });

  it('an applied change whose refresh did not finish is not dressed as a refusal', async () => {
    const notice =
      'Receptura została zmieniona, ale jej bieżące wyniki nie zostały w pełni odświeżone. ' +
      'Uruchom Przelicz ponownie.';
    const refusal = await showState({
      previewIssue: null,
      recalculationTerminal: null,
      postApplyNotice: { state: 'APPLIED_WITH_INCOMPLETE_CONSUMERS', messagePl: notice },
    });
    expect(refusal).toBeNull();
    expect(textOf('home-recalc-applied-notice')).toBe(notice);
    expect(textOf('home-recalc-back')).toBe('Wróć');
    expect(inDocument('[data-testid="home-recalc-dialog"]')!.textContent).not.toContain(
      'Twoja receptura się nie zmieniła',
    );
  });

  it('the Direction choice, the lock conflict and a staged preview are unchanged — no refusal card', async () => {
    await showState({
      directionBestCandidate: ownerPreview(),
      recalculationTerminal: { state: 'PREVIEW_READY' },
    });
    const choice = inDocument('[data-testid="home-recalc-direction-best"]');
    expect(choice?.textContent).toContain(constraintStudioCopy.previewIssue.bestSafeResult);
    expect(choice?.textContent).toContain(constraintStudioCopy.preview.title);
    expect(inDocument('[data-testid="home-recalc-refusal"]')).toBeNull();

    await act(async () => {
      useConstraintStudioStore.setState({
        directionBestCandidate: null,
        lockConflict: conflict,
        previewIssue: { ok: false, code: 'no_proposal' },
        recalculationTerminal: { state: 'BLOCKED_WITH_EXACT_ACTION', code: 'no_proposal' },
      });
    });
    expect(inDocument('[data-testid="lock-conflict-panel"]')).not.toBeNull();
    expect(inDocument('[data-testid="home-recalc-refusal"]')).toBeNull();

    await act(async () => {
      useConstraintStudioStore.setState({
        lockConflict: null,
        previewIssue: null,
        preview: ownerPreview(),
        recalculationTerminal: { state: 'PREVIEW_READY' },
      });
    });
    expect(inDocument('[data-testid="home-recalc-preview"]')).not.toBeNull();
    expect(inDocument('[data-testid="home-recalc-refusal"]')).toBeNull();
    expect(inDocument('[data-testid="home-recalc-next"]')).toBeNull();
  });
});
