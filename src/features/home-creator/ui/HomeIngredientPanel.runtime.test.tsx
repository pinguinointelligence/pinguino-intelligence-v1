/** @vitest-environment jsdom */
/**
 * DESIGN V3.0 HOME (IV-C + XII) — the ingredient panel, driven the way a customer drives it.
 *
 * HOME-AMOUNT-ENTER-01..03 were written for the „Zmień ilość” dialog (served 2026-09-18:
 * the topping showed 34 g, the customer typed 50, pressed Enter — and 34 g stayed). The
 * dialog is replaced by the panel; the rule is the same: the amount confirmed is the
 * amount the field just published, and leaving without „Gotowe” confirms nothing. What
 * the DESIGN changes is only Enter: it is the keyboard's „OK” — the keyboard goes away
 * and the panel stays, so „Gotowe” is the one confirmation.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeIngredientPanel, type HomeIngredientPanelTarget } from './HomeIngredientPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const target = (patch: Partial<HomeIngredientPanelTarget> = {}): HomeIngredientPanelTarget => ({
  key: 'line-1',
  name: 'HARIBO Quaxi · Żelki',
  category: 'other',
  kind: 'topping',
  pending: false,
  grams: 34,
  commit: vi.fn(),
  onRemove: vi.fn(),
  ...patch,
});

const render = (
  props: Partial<Parameters<typeof HomeIngredientPanel>[0]> & {
    target: HomeIngredientPanelTarget;
  },
) => {
  const onClose = props.onClose ?? vi.fn();
  const onBlocked = props.onBlocked ?? vi.fn();
  act(() => {
    root.render(
      <HomeIngredientPanel
        target={props.target}
        canSeeGrams={props.canSeeGrams ?? true}
        onBlocked={onBlocked}
        onClose={onClose}
      />,
    );
  });
  return { onClose, onBlocked };
};

const q = <T extends Element = HTMLElement>(testId: string) =>
  document.querySelector<T>(`[data-testid="${testId}"]`);

const field = (): HTMLInputElement => {
  const input = q<HTMLInputElement>('home-panel-grams')?.querySelector<HTMLInputElement>('input');
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

const click = (testId: string) => {
  const button = q<HTMLButtonElement>(testId);
  if (!button) throw new Error(`missing ${testId}`);
  act(() => button.click());
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

describe('HOME ingredient panel — the amount the customer typed is the amount confirmed', () => {
  it('HOME-AMOUNT-ENTER-01: typing 50 and pressing Enter (the keyboard OK) keeps the panel; „Gotowe” confirms 50, not the old 34', () => {
    const t = target();
    const { onClose } = render({ target: t });
    const input = field();
    typeInto(input, '50');
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    // „OK” hides the keyboard; the panel stays and nothing is written yet.
    expect(q('home-ingredient-panel')).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(t.commit).not.toHaveBeenCalled();
    expect(field().value).toBe('50');

    click('home-panel-done');
    expect(t.commit).toHaveBeenCalledTimes(1);
    expect(t.commit).toHaveBeenCalledWith(50);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('HOME-AMOUNT-ENTER-02: typing, leaving the field and pressing „Gotowe” confirms the typed amount', () => {
    const t = target();
    render({ target: t });
    const input = field();
    typeInto(input, '72');
    act(() => input.blur());
    click('home-panel-done');
    expect(t.commit).toHaveBeenCalledWith(72);
  });

  it('HOME-AMOUNT-ENTER-03: leaving with Escape confirms nothing (the panel has no „Anuluj”)', () => {
    const t = target();
    const { onClose } = render({ target: t });
    typeInto(field(), '90');
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(t.commit).not.toHaveBeenCalled();
    expect(q('home-panel')?.textContent).not.toContain('Anuluj');
  });

  it('a tap on the dimmed recipe is „Gotowe” (DESIGN IV-C) and keeps the typed amount', () => {
    const t = target();
    const { onClose } = render({ target: t });
    const input = field();
    typeInto(input, '41');
    act(() => input.blur());
    const overlay = q('home-ingredient-panel')!;
    act(() => {
      overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(t.commit).toHaveBeenCalledWith(41);
    expect(onClose).toHaveBeenCalled();
  });

  it('opening the panel and pressing „Gotowe” without a change writes nothing', () => {
    const t = target({ kind: 'ingredient', onToggleLock: vi.fn() });
    const { onClose } = render({ target: t });
    click('home-panel-done');
    expect(t.commit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('a product just picked (§B) — the same panel instead of „Ile chcesz dodać?”', () => {
  it('„Gotowe” without an amount creates nothing: the product keeps waiting (5B)', () => {
    const t = target({ kind: 'ingredient', pending: true, grams: 0 });
    const { onClose } = render({ target: t });
    expect(field().value).toBe('0');
    click('home-panel-done');
    expect(t.commit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('a typed positive amount is the confirmation', () => {
    const t = target({ kind: 'ingredient', pending: true, grams: 0 });
    render({ target: t });
    const input = field();
    typeInto(input, '40');
    act(() => input.blur());
    click('home-panel-done');
    expect(t.commit).toHaveBeenCalledWith(40);
  });

  it("a topping's question starts at its canonical default, which „Gotowe” confirms", () => {
    const t = target({ kind: 'topping', pending: true, grams: 50 });
    render({ target: t });
    expect(field().value).toBe('50');
    click('home-panel-done');
    expect(t.commit).toHaveBeenCalledWith(50);
  });

  it('shows the manufacturer dosage the prompt showed, and never masks the customer’s own amount', () => {
    const t = target({ kind: 'ingredient', pending: true, grams: 0, recommendedDose: '2–4%' });
    render({ target: t, canSeeGrams: false });
    expect(q('home-panel')?.textContent).toContain('Zalecane dawkowanie producenta: 2–4%');
    expect(q('home-panel-grams-masked')).toBeNull();
  });

  it('„Usuń” drops the waiting product and closes', () => {
    const t = target({ pending: true });
    const { onClose } = render({ target: t });
    click('home-panel-remove');
    expect(t.onRemove).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
    expect(t.commit).not.toHaveBeenCalled();
  });
});

describe('what the panel offers (DESIGN IV-C, VI, XII)', () => {
  it('a Base ingredient: ⓘ · ⇄ · Crown, the amount with its padlock, „Usuń” | „Gotowe”', () => {
    const onToggleLock = vi.fn();
    const onToggleCrown = vi.fn();
    const onReplace = vi.fn();
    render({
      target: target({
        kind: 'ingredient',
        name: 'MILK · 3.5% FAT · Chilled',
        category: 'dairy',
        onToggleLock,
        locked: false,
        crown: { isMain: false, onToggle: onToggleCrown },
        onReplace,
      }),
    });
    expect(q('home-panel-name')?.textContent).toBe('MILK');
    expect(q('home-panel')?.textContent).toContain('3.5% FAT · Chilled');
    expect(q('home-panel-tag')?.textContent).toBe('Składnik');
    const actions = [...q('home-panel-actions')!.querySelectorAll('button')].map((b) =>
      b.getAttribute('data-testid'),
    );
    expect(actions).toEqual(['home-panel-info', 'home-panel-replace', 'home-crown-line-1']);
    click('home-crown-line-1');
    expect(onToggleCrown).toHaveBeenCalledTimes(1);
    click('home-panel-lock');
    expect(onToggleLock).toHaveBeenCalledTimes(1);
    click('home-panel-replace');
    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(q('home-panel-remove')?.textContent).toBe('Usuń');
    expect(q('home-panel-done')?.textContent).toBe('Gotowe');
  });

  it('a topping: ⓘ and ⇄ only — no Crown, no padlock', () => {
    render({ target: target({ kind: 'topping', onReplace: vi.fn() }) });
    const actions = [...q('home-panel-actions')!.querySelectorAll('button')].map((b) =>
      b.getAttribute('data-testid'),
    );
    expect(actions).toEqual(['home-panel-info', 'home-panel-replace']);
    expect(q('home-panel-lock')).toBeNull();
    expect(q('home-panel-tag')?.textContent).toBe('Topping');
  });

  it('ⓘ shows the category and „Pełne dane składnika” only — no availability, no percent, no price', () => {
    render({ target: target({ kind: 'ingredient', category: 'dairy' }) });
    expect(q('home-panel-data')).toBeNull();
    click('home-panel-info');
    const data = q('home-panel-data')!;
    expect(data.textContent).toContain('Kategoria');
    expect(data.textContent).toContain('Pełne dane składnika');
    click('home-panel-full-data');
    expect(q('home-panel-full-data-list')).not.toBeNull();
    const text = q('home-panel')!.textContent ?? '';
    for (const gone of ['Dostępność', 'W recepturze', 'Moja cena', '€', '%']) {
      expect(text, gone).not.toContain(gone);
    }
  });

  it('masks a recipe line’s grams for an account without them, routing to the entitlement', () => {
    const { onBlocked } = render({ target: target({ kind: 'ingredient' }), canSeeGrams: false });
    const masked = q<HTMLButtonElement>('home-panel-grams-masked');
    expect(masked?.textContent).toBe('•••');
    expect(q('home-panel-grams')?.querySelector('input')).toBeNull();
    act(() => masked!.click());
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });
});
