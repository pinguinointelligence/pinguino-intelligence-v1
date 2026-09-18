/** @vitest-environment jsdom */
/**
 * „Zmień ilość” driven the way the served customer drove it (2026-09-18): the topping
 * showed 34 g, the customer typed 50 and pressed Enter — the dialog closed and the
 * recipe kept 34 g. The field publishes the typed amount while it blurs, inside the
 * same key event that then reaches the dialog's Enter handler, so that handler must
 * read what was just published, not the draft from the previous render.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { HomeChangeAmountDialog } from './HomeChangeAmountDialog';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const render = (onConfirm: (grams: number) => void, onCancel = vi.fn()) => {
  act(() => {
    root.render(
      <HomeChangeAmountDialog
        name="HARIBO Quaxi"
        grams={34}
        canSeeGrams
        onBlocked={() => undefined}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
  });
};

const field = (): HTMLInputElement => {
  const input = host.querySelector<HTMLInputElement>('[data-testid="home-change-amount"] input');
  if (!input) throw new Error('missing amount field');
  return input;
};

const typeInto = (input: HTMLInputElement, text: string) => {
  act(() => {
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('HOME „Zmień ilość” — the amount the customer typed is the amount confirmed', () => {
  it('HOME-AMOUNT-ENTER-01: typing 50 and pressing Enter confirms 50, not the old 34', () => {
    const onConfirm = vi.fn();
    render(onConfirm);
    const input = field();
    typeInto(input, '50');
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(50);
  });

  it('HOME-AMOUNT-ENTER-02: typing, leaving the field and pressing „Gotowe” confirms the typed amount', () => {
    const onConfirm = vi.fn();
    render(onConfirm);
    const input = field();
    typeInto(input, '72');
    act(() => input.blur());
    act(() => {
      host.querySelector<HTMLButtonElement>('[data-testid="home-change-amount-confirm"]')!.click();
    });
    expect(onConfirm).toHaveBeenCalledWith(72);
  });

  it('HOME-AMOUNT-ENTER-03: cancelling says „Anuluj” and confirms nothing', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(onConfirm, onCancel);
    typeInto(field(), '90');
    const cancel = host.querySelector<HTMLButtonElement>(
      '[data-testid="home-change-amount-cancel"]',
    )!;
    expect(cancel.textContent).toBe(homeCreatorCopy.draft.cancel);
    act(() => cancel.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
