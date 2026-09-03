/** @vitest-environment jsdom */
/**
 * OWNER 2026-09-03 — the automatic Crown-OFF correction notice.
 *
 * The whole point of this notice is that there is NOTHING LEFT TO DO. The
 * correction has already been committed through the canonical Apply door by the
 * same click, so the notice states the limit and the action taken and asks only
 * for an acknowledgement. What it must never become is the thing it replaced: a
 * graphite diagnostic panel quoting percentages and asking for a second Apply.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { ProRecalcPanel } from './ProRecalcPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const NOTICE = {
  ingredientName: 'WATERMELON · Fresh Fruit',
  requestedGrams: 600,
  safeMaximumGrams: 450,
} as const;

const render = async (open: boolean, onClose = vi.fn()) => {
  await act(async () => {
    root.render(<ProRecalcPanel open={open} onClose={onClose} />);
  });
  return onClose;
};

const notice = () => document.querySelector('[data-testid="crown-off-correction-notice"]');
const panel = () =>
  document.querySelector('[data-testid="crown-off-correction-notice"] [role="dialog"]');

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  useRecipeStore.getState().loadRecipeInput(starterMilkBase());
  useConstraintStudioStore.getState().resetForTests();
  useConstraintStudioStore.setState({ crownOffCorrectionNotice: { ...NOTICE } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useConstraintStudioStore.setState({ crownOffCorrectionNotice: null });
});

describe('Crown-OFF correction notice', () => {
  it('names the real ingredient and the real safe maximum, with no hardcoded grams', async () => {
    await render(true);
    const text = notice()?.textContent ?? '';
    expect(text).toContain('Maksymalna ilość została osiągnięta');
    // The product name is shown WITHOUT its Mapper qualifier — „WATERMELON",
    // not „WATERMELON · Fresh Fruit".
    expect(text).toContain('WATERMELON');
    expect(text).not.toContain('· Fresh Fruit');
    expect(text).toContain('450 g');
    expect(text).toContain('Ustawiliśmy tę wartość automatycznie.');

    // A DIFFERENT recipe must produce a different sentence — nothing here is a
    // fixed number.
    await act(async () => {
      useConstraintStudioStore.setState({
        crownOffCorrectionNotice: {
          ingredientName: 'STRAWBERRIES · Fresh Fruit',
          requestedGrams: 300,
          safeMaximumGrams: 211,
        },
      });
    });
    const second = notice()?.textContent ?? '';
    expect(second).toContain('STRAWBERRIES');
    expect(second).toContain('211 g');
    expect(second).not.toContain('450');
  });

  it('carries no technical noise and no second action', async () => {
    await render(true);
    const text = notice()?.textContent ?? '';
    // No raw engine percentages, no internal constraint vocabulary.
    expect(text).not.toMatch(/%/);
    for (const token of ['NPAC', 'POD', 'PAC', 'hard_limit', 'main_above', 'solver', 'Engine']) {
      expect(text, token).not.toContain(token);
    }
    // Exactly ONE control: the acknowledgement. No Zastosuj, no Cofnij, no
    // change list — the recipe is already correct.
    const buttons = [...(notice()?.querySelectorAll('button') ?? [])];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe('OK');
    expect(text).not.toContain('Zastosuj');
    expect(document.querySelector('[data-testid="pro-recalc-preview-motion"]')).toBeNull();
  });

  it('is a WHITE centered Gellatti surface with the warm attention outline', async () => {
    await render(true);
    const surface = panel();
    expect(surface, 'the notice must use the shared DialogShell surface').not.toBeNull();
    expect(surface?.className).toContain('bg-white');
    // Attention is an OUTLINE, never a tinted panel that would drag the notice
    // off the Gellatti white surface — and it is a RING, because `cn` is a
    // plain joiner: a `border-*` here would ship ALONGSIDE DialogShell's
    // `border-ink/15` and lose on CSS order. That is not hypothetical; served
    // staging measured the panel border as ink/15 while this class was present.
    expect(surface?.className).toContain('ring-[var(--g-orange)]');
    expect(surface?.className, 'a border would be outranked by DialogShell').not.toContain(
      'border-[var(--g-orange)]',
    );
    const body = notice()?.querySelector('[data-notice-tone]');
    expect(body?.getAttribute('data-notice-tone')).toBe('attention');
    expect(body?.getAttribute('data-notice-align')).toBe('center');
    expect(body?.className).toContain('text-center');
    // The graphite diagnostic shell must not come back with it.
    expect(surface?.className).not.toContain('bg-shell');
    expect(surface?.className).not.toContain('color-scheme:dark');
  });

  it('OK closes it for good — no persistent banner', async () => {
    const onClose = await render(true);
    await act(async () => {
      notice()!.querySelector<HTMLButtonElement>('[data-testid$="-primary"]')!.click();
    });
    expect(useConstraintStudioStore.getState().crownOffCorrectionNotice).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
    expect(notice()).toBeNull();
  });

  it('shows even when the recalculation overlay has already closed', async () => {
    // The correction commits and the overlay closes in the same click, so the
    // notice cannot depend on the overlay still being open.
    await render(false);
    expect(notice()).not.toBeNull();
    expect(document.querySelector('[data-testid="pro-recalc-overlay"]')).toBeNull();
  });

  it('shares its shell with the other simple PRO notices', async () => {
    // OWNER item 4 — ONE visual system. `GellattiNotice` is the single shell;
    // a second hand-rolled headline/body/button trio is what this replaces.
    // The stabilizer-limit notice (from #136) was migrated onto it, keeping its
    // own acknowledgement test id.
    const source = readFileSync(
      resolve(process.cwd(), 'src/features/ingredient-builder/IngredientBuilder.tsx'),
      'utf8',
    );
    expect(source).toContain('<GellattiNotice');
    expect(source).toContain('primaryTestId="stabilizer-limit-ok"');
    expect(source).not.toContain('testId="stabilizer-limit-dialog"\n              panelClassName');

    // And the recalculation overlay no longer carries the graphite diagnostic
    // shell that made a plain sentence look like an error dump.
    const panel = readFileSync(
      resolve(process.cwd(), 'src/features/pro-core/ProRecalcPanel.tsx'),
      'utf8',
    );
    expect(panel).not.toContain('[color-scheme:dark]');
    expect(panel).not.toContain('bg-shell px-4 py-4');
  });
});
