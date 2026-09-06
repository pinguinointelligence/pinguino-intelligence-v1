/** @vitest-environment jsdom */
/**
 * §58 — the question reaches the screen, in the customer's words.
 *
 * `howToUse`, `asIngredient` and `asTopping` existed in both locales and had never been
 * rendered: three translated strings that no customer could ever see. Copy is not a
 * feature. This drives the real dialog and checks the real words.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { HomeUsagePrompt } from './HomeUsagePrompt';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const show = async (onChoose = vi.fn(), onCancel = vi.fn()) => {
  await act(async () =>
    root.render(
      <HomeUsagePrompt productName="Czekolada gorzka 70%" onChoose={onChoose} onCancel={onCancel} />,
    ),
  );
  return { onChoose, onCancel };
};

describe('the usage question is on screen and in customer words', () => {
  it('asks the canonical question about the named product', async () => {
    await show();
    const text = host.textContent ?? '';
    expect(text).toContain(homeCreatorCopy.recipe.howToUse);
    // Named, not abstract: the customer may have picked several things in a row.
    expect(text).toContain('Czekolada gorzka 70%');
  });

  it('offers exactly the two real answers, plus a way out', async () => {
    await show();
    expect(host.textContent).toContain(homeCreatorCopy.recipe.asIngredient);
    expect(host.textContent).toContain(homeCreatorCopy.recipe.asTopping);
    expect(host.textContent).toContain(homeCreatorCopy.draft.cancel);
  });

  it('reports the choice the customer actually made', async () => {
    const { onChoose } = await show();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="home-usage-as-topping"]')!.click(),
    );
    expect(onChoose).toHaveBeenCalledWith('topping');

    const second = await show(vi.fn());
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="home-usage-as-ingredient"]')!.click(),
    );
    expect(second.onChoose).toHaveBeenCalledWith('ingredient');
  });

  it('can be dismissed with Escape, so the question never traps anyone', async () => {
    const { onCancel } = await show();
    await act(async () =>
      host
        .querySelector('[data-testid="home-usage-prompt"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(onCancel).toHaveBeenCalled();
  });

  it('is a dialog for assistive technology, not a floating div', async () => {
    await show();
    const dialog = host.querySelector('[data-testid="home-usage-prompt"]')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toContain(homeCreatorCopy.recipe.howToUse);
  });
});
