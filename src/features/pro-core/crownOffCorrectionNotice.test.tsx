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

  it('carries no technical noise and only one semantic action plus the shared close control', async () => {
    await render(true);
    const text = notice()?.textContent ?? '';
    // No raw engine percentages, no internal constraint vocabulary.
    expect(text).not.toMatch(/%/);
    for (const token of ['NPAC', 'POD', 'PAC', 'hard_limit', 'main_above', 'solver', 'Engine']) {
      expect(text, token).not.toContain(token);
    }
    // Exactly ONE semantic action: the acknowledgement. The second button is
    // the shared, explicit dialog X — never another recipe action.
    const buttons = [...(notice()?.querySelectorAll('button') ?? [])];
    expect(buttons).toHaveLength(2);
    expect(buttons.filter((button) => button.textContent === 'OK')).toHaveLength(1);
    expect(
      buttons.filter((button) => button.getAttribute('aria-label') === 'Zamknij komunikat'),
    ).toHaveLength(1);
    expect(text).not.toContain('Zastosuj');
    expect(document.querySelector('[data-testid="pro-recalc-preview-motion"]')).toBeNull();
  });

  it('is a WHITE centered Gellatti surface whose attention treatment can actually paint', async () => {
    await render(true);
    const surface = panel();
    expect(surface, 'the notice must use the shared DialogShell surface').not.toBeNull();
    expect(surface?.className).toContain('bg-white');
    expect(surface?.getAttribute('data-dialog-tone')).toBe('attention');

    // THE regression this file exists to stop. `cn` is a plain joiner, so any
    // property DialogShell already sets and the notice sets AGAIN is decided by
    // CSS order, not by intent. Two attempts shipped a class that never
    // painted, both measured dead on served staging:
    //   1. `border-[var(--g-orange)]` lost to the shell's `border-ink/15`;
    //   2. `ring-2 ring-[var(--g-orange)]` populated `--tw-ring-shadow` while
    //      `shadow-pro-e3` kept sole ownership of `box-shadow`.
    // So the contract is structural: the panel carries EXACTLY ONE shadow
    // utility and EXACTLY ONE border-colour utility. Counting them catches the
    // collision in a unit test, where jsdom cannot resolve the real cascade.
    const classes = (surface?.className ?? '').split(/\s+/).filter(Boolean);
    const shadows = classes.filter((c) => /^shadow-/.test(c));
    const borderColours = classes.filter((c) => /^border-(?!\d|x-|y-|t-|b-|l-|r-)/.test(c));
    expect(shadows, `two shadow utilities collide: ${shadows.join(' ')}`).toHaveLength(1);
    expect(
      borderColours,
      `two border-colour utilities collide: ${borderColours.join(' ')}`,
    ).toHaveLength(1);
    // And the one shadow that survives must be the one carrying the warm ring.
    expect(shadows[0]).toContain('rgba(245,138,7');
    expect(borderColours[0]).toBe('border-[var(--g-orange)]');
    // A ring/outline utility layered on top would reintroduce the collision.
    expect(classes.some((c) => /^ring-/.test(c))).toBe(false);

    const body = notice()?.querySelector('[data-notice-tone]');
    expect(body?.getAttribute('data-notice-tone')).toBe('attention');
    expect(body?.getAttribute('data-notice-align')).toBe('center');
    expect(body?.className).toContain('text-center');
    // The graphite diagnostic shell must not come back with it.
    expect(surface?.className).not.toContain('bg-shell');
    expect(surface?.className).not.toContain('color-scheme:dark');
  });

  it('an informational notice keeps the ordinary shell treatment', async () => {
    await act(async () => {
      useConstraintStudioStore.setState({ crownOffCorrectionNotice: { ...NOTICE } });
    });
    await render(true);
    // Sanity: the same counting contract holds on the default tone, so the
    // assertion above is measuring the tone and not just the component.
    const classes = (panel()?.className ?? '').split(/\s+/).filter(Boolean);
    expect(classes.filter((c) => /^shadow-/.test(c))).toHaveLength(1);
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
