/** @vitest-environment jsdom */
/**
 * OWNER EXECUTION — PRO recalculation invalidation.
 *
 * These tests stay at the first customer-visible state transition: an exact
 * gram edit in the interactive proposal must replace Apply with Recalculate
 * before the old proposal can be applied. Solver tolerances are deliberately
 * outside this suite.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OWNER_CREATED_AT,
  ownerFruitRecipe,
  ownerPreviewOptions,
} from '../__fixtures__/ownerFruitMainFixture';
import {
  bindProductBehaviorToPreview,
  buildOptimizePreview,
  plannedSum,
  type ConstraintPreview,
} from '../applyPipeline';
import { ConstraintPreviewCard } from './ConstraintPreviewCard';

vi.setConfig({ testTimeout: 60_000 });

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const LINE_ID = 'milk';
const BASELINE_GRAMS = 672;
const ALL_LINES = new Set([
  'milk',
  'cream',
  'smp',
  'sucrose',
  'dextrose',
  'tara',
  'strawberry',
  'cranberry',
  'watermelon',
]);

type ProfileCategory = ConstraintPreview['proposedInput']['category'];

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
  if (!result.ok) throw new Error(`owner preview fixture failed: ${result.code}`);
  return result.preview;
};

/** Keep the real Engine-built proposal shape while pinning the observed 672 g
 * control baseline. This is presentation-only test setup; the target batch is
 * moved with the line so the card does not enter its unrelated residual gate. */
const previewAt = (
  grams = BASELINE_GRAMS,
  locked = false,
  category: ProfileCategory = 'milk_gelato',
): ConstraintPreview => {
  const source = ownerPreview();
  const proposedInput = {
    ...source.proposedInput,
    category,
    items: source.proposedInput.items.map((item) =>
      item.id === LINE_ID ? { ...item, planned_grams: grams } : item,
    ),
  };
  return {
    ...source,
    proposedInput: { ...proposedInput, target_batch_grams: plannedSum(proposedInput) },
    lines: source.lines.map((line) =>
      line.lineId === LINE_ID
        ? {
            ...line,
            beforeGrams: grams + 10,
            afterGrams: grams,
            kind: 'changed' as const,
            locked,
          }
        : line,
    ),
  };
};

const q = <T extends Element = HTMLElement>(selector: string) =>
  host.querySelector<T & HTMLElement>(selector);

const input = () => q<HTMLInputElement>(`[data-testid="preview-grams-control-${LINE_ID}"] input`)!;

const stepper = (direction: 'zwiększ' | 'zmniejsz') =>
  q<HTMLButtonElement>(
    `[data-testid="preview-grams-control-${LINE_ID}"] button[aria-label$="— ${direction}"]`,
  )!;

const typeWithoutBlur = async (value: number) => {
  await act(async () => {
    input().focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input(), String(value));
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const renderPreview = async (preview = previewAt(), onRecalculate = vi.fn(), onApply = vi.fn()) => {
  await act(async () => {
    root.render(
      <ConstraintPreviewCard
        preview={preview}
        onApply={onApply}
        onCancel={() => undefined}
        interactive={{ instructions: [], editableLineIds: ALL_LINES, onRecalculate }}
      />,
    );
  });
  return { onRecalculate, onApply };
};

const expectStale = () => {
  expect(q(`[data-testid="preview-row-${LINE_ID}"]`)?.dataset.edited).toBe('true');
  expect(q('[data-testid="preview-apply"]')).toBeNull();
  expect(q('[data-testid="preview-recalculate"]')?.textContent).toBe('Przelicz');
  expect(host.textContent).toContain(
    'Zmieniono ustawienia. Przelicz, aby zobaczyć nową propozycję.',
  );
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('PRO proposal dirty invalidation — exact semantic gram edits', () => {
  it('PRO-RECALC-DIRTY-01 672 g → 671 g is stale immediately', async () => {
    await renderPreview();
    await act(async () => stepper('zmniejsz').click());
    expect(input().value).toBe('671');
    expectStale();
  });

  it('PRO-RECALC-DIRTY-02 672 g → 673 g is stale immediately', async () => {
    await renderPreview();
    await act(async () => stepper('zwiększ').click());
    expect(input().value).toBe('673');
    expectStale();
  });

  it('PRO-RECALC-DIRTY-03 672 g → 670 g is stale immediately', async () => {
    await renderPreview();
    await act(async () => stepper('zmniejsz').click());
    await act(async () => stepper('zmniejsz').click());
    expect(input().value).toBe('670');
    expectStale();
  });

  it('PRO-RECALC-DIRTY-04 every observed direct-input delta invalidates before blur', async () => {
    for (const grams of [671, 670, 669, 668, 664, 673]) {
      await renderPreview({ ...previewAt() });
      await typeWithoutBlur(grams);
      expect(input().value).toBe(String(grams));
      expectStale();
    }
  });

  it('PRO-RECALC-DIRTY-05 minus control by 1 g is stale', async () => {
    await renderPreview();
    await act(async () => stepper('zmniejsz').click());
    expectStale();
  });

  it('PRO-RECALC-DIRTY-06 plus control by 1 g is stale', async () => {
    await renderPreview();
    await act(async () => stepper('zwiększ').click());
    expectStale();
  });

  it('PRO-RECALC-DIRTY-07 672 g → 672 g is a true no-op', async () => {
    await renderPreview();
    await typeWithoutBlur(672);
    expect(q('[data-testid="preview-recalculate"]')).toBeNull();
    expect(q('[data-testid="preview-apply"]')).not.toBeNull();
    expect(q(`[data-testid="preview-row-${LINE_ID}"]`)?.dataset.edited).toBe('false');
  });

  it('PRO-RECALC-DIRTY-08 recalculation establishes the new proposal baseline', async () => {
    const onRecalculate = vi.fn();
    await renderPreview(previewAt(), onRecalculate);
    await act(async () => stepper('zmniejsz').click());
    await act(async () => q<HTMLButtonElement>('[data-testid="preview-recalculate"]')!.click());
    expect(onRecalculate).toHaveBeenCalledWith([{ lineId: LINE_ID, grams: 671, locked: true }]);
    await renderPreview(previewAt(671), onRecalculate);
    expect(q('[data-testid="preview-recalculate"]')).toBeNull();
    expect(q('[data-testid="preview-apply"]')).not.toBeNull();
  });

  it('PRO-RECALC-DIRTY-09 a second 1 g edit after recalculation is stale again', async () => {
    await renderPreview(previewAt(671));
    await act(async () => stepper('zmniejsz').click());
    expect(input().value).toBe('670');
    expectStale();
  });

  it('PRO-RECALC-DIRTY-10 old Apply is unavailable while stale', async () => {
    const onApply = vi.fn();
    await renderPreview(previewAt(), vi.fn(), onApply);
    await typeWithoutBlur(671);
    expectStale();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('PRO-RECALC-DIRTY-11 Gelato uses exact 1 g invalidation', async () => {
    const preview = previewAt(672, false, 'milk_gelato');
    expect(preview.proposedInput.category).toBe('milk_gelato');
    await renderPreview(preview);
    await typeWithoutBlur(671);
    expectStale();
  });

  it('PRO-RECALC-DIRTY-12 Sorbet uses exact 1 g invalidation', async () => {
    const preview = previewAt(672, false, 'sorbet');
    expect(preview.proposedInput.category).toBe('sorbet');
    await renderPreview(preview);
    await typeWithoutBlur(671);
    expectStale();
  });

  it('PRO-RECALC-DIRTY-13 Vegan uses exact 1 g invalidation', async () => {
    const preview = previewAt(672, false, 'vegan_gelato');
    expect(preview.proposedInput.category).toBe('vegan_gelato');
    await renderPreview(preview);
    await typeWithoutBlur(671);
    expectStale();
  });

  it('PRO-RECALC-DIRTY-14 Protein uses exact 1 g invalidation', async () => {
    const preview = previewAt(672, false, 'protein_gelato');
    expect(preview.proposedInput.category).toBe('protein_gelato');
    await renderPreview(preview);
    await typeWithoutBlur(671);
    expectStale();
  });

  it('PRO-RECALC-DIRTY-15 Lock ON manual 1 g edit is stale', async () => {
    await renderPreview(previewAt(672, true));
    expect(q(`[data-testid="preview-lock-${LINE_ID}"]`)?.getAttribute('aria-pressed')).toBe('true');
    await typeWithoutBlur(671);
    expectStale();
  });

  it('PRO-RECALC-DIRTY-16 Lock OFF manual 1 g edit is stale', async () => {
    await renderPreview(previewAt(672, false));
    expect(q(`[data-testid="preview-lock-${LINE_ID}"]`)?.getAttribute('aria-pressed')).toBe(
      'false',
    );
    await typeWithoutBlur(671);
    expectStale();
  });
});
