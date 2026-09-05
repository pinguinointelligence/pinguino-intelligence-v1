/** @vitest-environment jsdom */
/**
 * THE OWNER'S EXACT FLOW — one Przelicz click must produce ONE visible dialog.
 *
 * Captured on served staging (`30fffe4f`) before this fix, WATERMELON 884 g →
 * one click on Przelicz produced FOUR visible modal states:
 *
 *   t+0     click
 *   t+70    pro-recalc-panel  680x117  WORKING        „Liczymy balans receptury…"
 *   t+1259  pro-recalc-panel  680x347  PREVIEW_READY  „Sprawdź proponowaną korektę"
 *   t+1464  pro-recalc-panel  680x169  IDLE           „Zmiany są w recepturze roboczej"
 *   t+1981  crown-off-…-notice 520x255                „Maksymalna ilość została osiągnięta"
 *
 * The two middle states are implementation steps of ONE operation: the pipeline
 * stages a Preview, then commits it through the canonical Apply door. The panel
 * reads the same store the pipeline is mutating, so each step painted as its own
 * window — different sizes, a few hundred milliseconds apart.
 *
 * A static "two shells mounted ⇒ one active" test cannot see this: the states
 * are SEQUENTIAL, never simultaneous. So this test drives the store through the
 * same transitions the pipeline makes and samples what a user could see after
 * every one of them.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import {
  buildBatchRescalePreview,
  type ConstraintPreview,
} from '@/features/constraint-studio/applyPipeline';
import {
  useConstraintStudioStore,
  type ConstraintStudioState,
} from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { ProRecalcPanel } from './ProRecalcPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const CORRECTION = {
  lineId: 'watermelon',
  ingredientName: 'WATERMELON · Fresh Fruit',
  requestedGrams: 884,
  selectedGrams: 364,
  requestPreserved: false,
  limitingTechnicalRules: ['main_policy_ceiling'],
} as const;

/** Everything a user could actually see as a dialog right now. */
const visibleDialogs = () =>
  [...document.querySelectorAll('[role="dialog"]')]
    .filter((el) => el.getAttribute('aria-hidden') !== 'true')
    .map((el) => ({
      testid: el.getAttribute('data-testid'),
      size: el.getAttribute('data-dialog-size'),
      state: el.getAttribute('data-terminal-state') ?? el.getAttribute('data-dialog-state'),
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    }));

const set = (patch: Partial<ConstraintStudioState>) =>
  useConstraintStudioStore.setState(patch as never);

/** A REAL preview payload — the card reads `lines`, so a stub would only crash. */
const realPreview = (correction?: typeof CORRECTION): ConstraintPreview => {
  const built = buildBatchRescalePreview(starterMilkBase(), { byLineId: {} }, 1_200, 'cascade');
  if (!built.ok) throw new Error('preview fixture unavailable');
  return correction
    ? ({
        ...built.preview,
        crownOffMainCorrection: { ...correction },
      } as unknown as ConstraintPreview)
    : built.preview;
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  useRecipeStore.getState().loadRecipeInput(starterMilkBase());
  useConstraintStudioStore.getState().resetForTests();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useConstraintStudioStore.getState().resetForTests();
});

describe('one Przelicz click, one visible outcome', () => {
  it('never shows the Preview or the applied state while the correction completes', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(<ProRecalcPanel open onClose={onClose} />);
    });

    /** What the user could see, sampled after every pipeline transition. */
    const seen: { step: string; dialogs: ReturnType<typeof visibleDialogs> }[] = [];
    const step = async (name: string, patch: Partial<ConstraintStudioState>) => {
      await act(async () => set(patch));
      seen.push({ step: name, dialogs: visibleDialogs() });
    };

    // 1. The click. WORKING is the honest progress state and MAY be seen.
    await step('WORKING', { recalculationTerminal: { state: 'WORKING' } });

    // 2. The pipeline stages the corrected Preview AND raises the in-flight flag
    //    in the SAME tick — which is what the store does, with no await between
    //    them, so React batches them into one render.
    await step('PREVIEW staged + in-flight', {
      preview: realPreview(CORRECTION) as never,
      recalculationTerminal: { state: 'PREVIEW_READY' },
      correctionInFlight: true,
    });

    // 3. The canonical Apply door commits: preview cleared, undo history written.
    await step('committed', {
      preview: null,
      recalculationTerminal: null,
      correctionInFlight: true,
    });

    // 4. The one intended outcome.
    await step('notice', {
      correctionInFlight: false,
      crownOffCorrectionNotice: {
        ingredientName: CORRECTION.ingredientName,
        requestedGrams: CORRECTION.requestedGrams,
        safeMaximumGrams: CORRECTION.selectedGrams,
      },
    });

    // At EVERY observable point, at most one dialog is visible.
    for (const { step: name, dialogs } of seen) {
      expect(dialogs.length, `${name} showed ${dialogs.length} dialogs`).toBeLessThanOrEqual(1);
    }

    // The two states the owner saw flash must never have been visible.
    const everySeenText = seen.flatMap((s) => s.dialogs.map((d) => d.text)).join(' | ');
    expect(everySeenText, 'the Preview card flashed').not.toContain('Sprawdź proponowaną korektę');
    expect(everySeenText, 'the applied/undo state flashed').not.toContain(
      'Zmiany są w recepturze roboczej',
    );
    const states = seen.flatMap((s) => s.dialogs.map((d) => d.state));
    expect(states, 'PREVIEW_READY reached the screen').not.toContain('PREVIEW_READY');

    // The only outcome the user is left with is the notice.
    const last = seen[seen.length - 1]!.dialogs;
    expect(last).toHaveLength(1);
    expect(last[0]?.text).toContain('Maksymalna ilość została osiągnięta');
    expect(last[0]?.text).toContain('364 g');
  });

  /**
   * THE CASE THAT WAS MISSING — and why served still failed after the first fix.
   *
   * Re-measured on served staging (merge `4ee3db2`) the flow was down to THREE
   * states, all 520 px: WORKING, then `IDLE` „Zmiany są w recepturze roboczej"
   * at t+1371 for ~480 ms, then the notice at t+1849. `PREVIEW_READY` and the
   * 680 px flash were gone, but the applied/undo window still painted.
   *
   * The cause was NOT in the panel. `correctionInFlight` was listed in
   * `CLEAR_STAGED`, and the recipe-store subscriber spreads that object on any
   * Base technical change — which is precisely what the correction's own commit
   * is. So the flag was lowered in the middle of the operation it exists to
   * span, the panel dropped its suppression, and the applied state reached the
   * screen before the notice arrived.
   *
   * The earlier cascade cases could not see it because they hand-wrote
   * `correctionInFlight: true` at the commit step — encoding the assumption
   * instead of the system's behaviour. This one changes the RECIPE and lets the
   * real subscriber run, and proves the subscriber actually fired by asserting
   * the staged content it is responsible for really was cleared.
   */
  it('keeps the in-flight flag through a real commit that clears staged content', async () => {
    set({ preview: realPreview(CORRECTION) as never, correctionInFlight: true });

    // A real Base technical change — the same kind of write the correction's
    // commit performs — which is what fires the staged-clearing subscriber.
    await act(async () => {
      const base = starterMilkBase();
      useRecipeStore.getState().loadRecipeInput({
        ...base,
        items: base.items.map((item, index) =>
          index === 0 ? { ...item, planned_grams: item.planned_grams + 137 } : item,
        ),
      });
    });

    const after = useConstraintStudioStore.getState();
    // Not vacuous: the subscriber DID run and did its real job.
    expect(after.preview, 'the staged preview should have been cleared').toBeNull();
    // ...and the flow flag survived it.
    expect(after.correctionInFlight, 'the commit lowered the in-flight flag').toBe(true);
  });

  it('keeps one canonical width for the whole corrected flow', async () => {
    await act(async () => {
      root.render(<ProRecalcPanel open onClose={vi.fn()} />);
    });
    const widths: (string | null)[] = [];
    const record = () => widths.push(visibleDialogs()[0]?.size ?? null);

    await act(async () => set({ recalculationTerminal: { state: 'WORKING' } }));
    record();
    await act(async () =>
      set({
        preview: realPreview(CORRECTION) as never,
        recalculationTerminal: { state: 'PREVIEW_READY' },
        correctionInFlight: true,
      }),
    );
    record();
    await act(async () =>
      set({
        correctionInFlight: false,
        crownOffCorrectionNotice: {
          ingredientName: CORRECTION.ingredientName,
          requestedGrams: CORRECTION.requestedGrams,
          safeMaximumGrams: CORRECTION.selectedGrams,
        },
      }),
    );
    record();

    // Served before the fix: 680 → 680 → 680 → 520. Now one width throughout,
    // so the flow no longer reads as small → medium → large.
    expect(new Set(widths.filter(Boolean)).size, `widths seen: ${widths.join(' → ')}`).toBe(1);
    expect(widths.filter(Boolean)[0]).toBe('default');
  });

  it('still shows the ordinary Preview when NO correction is in flight', async () => {
    // The suppression must be scoped to the automatic correction. A normal
    // recalculation still owes the user its change list and its Zastosuj.
    await act(async () => {
      root.render(<ProRecalcPanel open onClose={vi.fn()} />);
    });
    await act(async () =>
      set({
        preview: realPreview() as never,
        recalculationTerminal: { state: 'PREVIEW_READY' },
        correctionInFlight: false,
      }),
    );
    const dialogs = visibleDialogs();
    expect(dialogs).toHaveLength(1);
    // It grows to the wide shell only because the change list has columns.
    expect(dialogs[0]?.size).toBe('wide');
  });

  it('restores the normal surface when the correction is refused', async () => {
    // If the Apply door refuses, the flag comes down and the existing blocked
    // surface must appear — suppression must never strand the user.
    await act(async () => {
      root.render(<ProRecalcPanel open onClose={vi.fn()} />);
    });
    await act(async () =>
      set({
        preview: realPreview(CORRECTION) as never,
        recalculationTerminal: { state: 'PREVIEW_READY' },
        correctionInFlight: true,
      }),
    );
    expect(visibleDialogs()[0]?.state).not.toBe('PREVIEW_READY');
    await act(async () =>
      set({
        correctionInFlight: false,
        blocked: { code: 'stale_preview', messagePl: 'x' } as never,
      }),
    );
    expect(visibleDialogs()).toHaveLength(1);
    expect(visibleDialogs()[0]?.state).toBe('PREVIEW_READY');
  });
});
