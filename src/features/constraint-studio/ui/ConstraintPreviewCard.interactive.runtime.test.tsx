/** @vitest-environment jsdom */
/**
 * INTERACTIVE RECALCULATION PREVIEW — owner 2026-09-11, Part A (UI).
 * The proposed amount is the SAME grams control + padlock as the recipe row;
 * the CTA is „Zastosuj zmiany" until the customer changes something, then
 * „Przelicz"; setting a value back withdraws the edit; nothing is written.
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
  type ConstraintPreview,
} from '../applyPipeline';
import { ConstraintPreviewCard } from './ConstraintPreviewCard';

vi.setConfig({ testTimeout: 60_000 });

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
  if (!result.ok) throw new Error(`owner preview fixture failed: ${result.code}`);
  return result.preview;
};

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

const q = <T extends Element = HTMLElement>(selector: string) =>
  host.querySelector<T & HTMLElement>(selector);
const stepper = (lineId: string, direction: 'zwiększ' | 'zmniejsz') =>
  q<HTMLButtonElement>(
    `[data-testid="preview-grams-control-${lineId}"] button[aria-label$="— ${direction}"]`,
  )!;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('interactive recalculation preview card', () => {
  it('MGAL-PREVIEW-UI-01 a grams edit auto-locks and a separate unlock remains available', async () => {
    const preview = ownerPreview();
    const cranberry = preview.lines.find((line) => line.lineId === 'cranberry')!;
    expect(cranberry.beforeGrams).toBe(130);
    expect(cranberry.afterGrams!).toBeLessThan(130 / 4);
    const onRecalculate = vi.fn();
    const onApply = vi.fn();
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

    const row = q('[data-testid="preview-row-cranberry"]')!;
    expect(row.querySelector('[data-testid="preview-from-grams"]')?.textContent).toBe('130 g');
    expect(q('[data-testid="preview-grams-control-cranberry"]')).not.toBeNull();
    expect(q('[data-testid="preview-lock-cranberry"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(q('[data-testid="preview-apply"]')?.textContent).toBe('Zastosuj zmiany');
    expect(q('[data-testid="preview-recalculate"]')).toBeNull();

    await act(async () => stepper('cranberry', 'zwiększ').click());
    expect(q('[data-testid="preview-row-cranberry"]')?.dataset.edited).toBe('true');
    expect(q('[data-testid="preview-apply"]')).toBeNull();
    expect(q('[data-testid="preview-recalculate"]')?.textContent).toBe('Przelicz');
    expect(host.textContent).toContain(
      'Zmieniono ustawienia. Przelicz, aby zobaczyć nową propozycję.',
    );
    expect(q('[data-testid="preview-lock-cranberry"]')?.getAttribute('aria-pressed')).toBe('true');

    // Returning to the original grams is itself another exact decision, so the
    // automatic lock stays on until the customer explicitly unlocks it.
    await act(async () => stepper('cranberry', 'zmniejsz').click());
    expect(q('[data-testid="preview-row-cranberry"]')?.dataset.edited).toBe('true');
    expect(q('[data-testid="preview-lock-cranberry"]')?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => q<HTMLButtonElement>('[data-testid="preview-lock-cranberry"]')!.click());
    expect(q('[data-testid="preview-row-cranberry"]')?.dataset.edited).toBe('false');

    // The next amount change turns it on again without a second click.
    await act(async () => stepper('cranberry', 'zwiększ').click());
    expect(q('[data-testid="preview-lock-cranberry"]')?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => q<HTMLButtonElement>('[data-testid="preview-recalculate"]')!.click());
    expect(onRecalculate).toHaveBeenCalledWith([
      { lineId: 'cranberry', grams: cranberry.afterGrams! + 1, locked: true },
    ]);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('MGAL-PREVIEW-UI-02 manual unlock does not immediately relock, but the next grams edit does', async () => {
    const preview = ownerPreview();
    const cranberry = preview.lines.find((line) => line.lineId === 'cranberry')!;
    const onRecalculate = vi.fn();
    await act(async () => {
      root.render(
        <ConstraintPreviewCard
          preview={preview}
          onApply={() => undefined}
          onCancel={() => undefined}
          interactive={{ instructions: [], editableLineIds: ALL_LINES, onRecalculate }}
        />,
      );
    });
    await act(async () => stepper('cranberry', 'zwiększ').click());
    await act(async () => q<HTMLButtonElement>('[data-testid="preview-lock-cranberry"]')!.click());
    expect(q('[data-testid="preview-lock-cranberry"]')?.getAttribute('aria-pressed')).toBe('false');
    await act(async () => stepper('cranberry', 'zwiększ').click());
    expect(q('[data-testid="preview-lock-cranberry"]')?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => q<HTMLButtonElement>('[data-testid="preview-recalculate"]')!.click());
    expect(onRecalculate).toHaveBeenCalledWith([
      { lineId: 'cranberry', grams: cranberry.afterGrams! + 2, locked: true },
    ]);
  });

  it('merges new edits onto the session’s earlier instructions', async () => {
    const preview = ownerPreview();
    const onRecalculate = vi.fn();
    await act(async () => {
      root.render(
        <ConstraintPreviewCard
          preview={preview}
          onApply={() => undefined}
          onCancel={() => undefined}
          interactive={{
            instructions: [{ lineId: 'strawberry', grams: 60, locked: true }],
            editableLineIds: ALL_LINES,
            onRecalculate,
          }}
        />,
      );
    });
    await act(async () => q<HTMLButtonElement>('[data-testid="preview-lock-cranberry"]')!.click());
    await act(async () => q<HTMLButtonElement>('[data-testid="preview-recalculate"]')!.click());
    const cranberry = preview.lines.find((line) => line.lineId === 'cranberry')!;
    expect(onRecalculate).toHaveBeenCalledWith([
      { lineId: 'strawberry', grams: 60, locked: true },
      { lineId: 'cranberry', grams: cranberry.afterGrams!, locked: true },
    ]);
  });

  it('a newly staged proposal starts with no provisional edits', async () => {
    const preview = ownerPreview();
    const render = async (current: ConstraintPreview) =>
      act(async () => {
        root.render(
          <ConstraintPreviewCard
            preview={current}
            onApply={() => undefined}
            onCancel={() => undefined}
            interactive={{ instructions: [], editableLineIds: ALL_LINES, onRecalculate: vi.fn() }}
          />,
        );
      });
    await render(preview);
    await act(async () => stepper('cranberry', 'zwiększ').click());
    expect(q('[data-testid="preview-recalculate"]')).not.toBeNull();
    await render({ ...preview });
    expect(q('[data-testid="preview-recalculate"]')).toBeNull();
    expect(q('[data-testid="preview-apply"]')).not.toBeNull();
  });

  it('lines outside the customer’s own editable set keep their static value', async () => {
    const preview = ownerPreview();
    await act(async () => {
      root.render(
        <ConstraintPreviewCard
          preview={preview}
          onApply={() => undefined}
          onCancel={() => undefined}
          interactive={{
            instructions: [],
            editableLineIds: new Set(['cranberry']),
            onRecalculate: vi.fn(),
          }}
        />,
      );
    });
    expect(q('[data-testid="preview-grams-control-cranberry"]')).not.toBeNull();
    expect(q('[data-testid="preview-grams-control-watermelon"]')).toBeNull();
  });

  it('Demo mask: no gram value is revealed and operating a control routes to the entitlement', async () => {
    const preview = ownerPreview();
    const onInteract = vi.fn();
    const onRecalculate = vi.fn();
    await act(async () => {
      root.render(
        <ConstraintPreviewCard
          preview={preview}
          onApply={() => undefined}
          onCancel={() => undefined}
          gramsMask={{
            text: '••• g',
            controlValue: '•••',
            label: 'Gramatura ukryta',
            onInteract,
          }}
          interactive={{ instructions: [], editableLineIds: ALL_LINES, onRecalculate }}
        />,
      );
    });
    expect(host.textContent).not.toContain('130 g');
    expect(
      q('[data-testid="preview-row-cranberry"] [data-testid="preview-from-grams"]')?.textContent,
    ).toBe('••• g');
    await act(async () =>
      q<HTMLButtonElement>(
        '[data-testid="preview-grams-control-cranberry"] button[aria-label*="— zwiększ"]',
      )!.click(),
    );
    expect(onInteract).toHaveBeenCalled();
    expect(q('[data-testid="preview-recalculate"]')).toBeNull();
  });
});
