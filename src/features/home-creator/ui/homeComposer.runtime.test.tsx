/** @vitest-environment jsdom */
/**
 * §27/§28/§41 — the composer, driven the way a customer drives it.
 *
 * The owner's manual list (§41) is a keyboard list: click, type, Enter, Shift,
 * Tab, Shift+Tab, select-all, delete, blur, refocus. jsdom can honestly run all
 * of that and check what the DOM does — what it cannot do is paint, so the
 * *appearance* of focus is proved separately by
 * `homeComposerFocus.contract.test.ts` (the cascade) and by a served check.
 *
 * What this file is really for: the field must stay ONE field. No second box, no
 * layout jump, no control outside it, and a call to action that does not exist
 * until there is a base idea to act on.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useHomeDraftStore } from '../homeDraftStore';
import { HomeIntentSection } from './HomeIntentSection';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const render = (props: Partial<Parameters<typeof HomeIntentSection>[0]> = {}) => {
  act(() => {
    root.render(
      <HomeIntentSection onSubmit={() => undefined} onScan={() => undefined} {...props} />,
    );
  });
};

const q = <T extends Element>(id: string): T | null =>
  host.querySelector<T>(`[data-testid="${id}"]`);
const need = <T extends Element>(id: string): T => {
  const el = q<T>(id);
  if (!el) throw new Error(`missing ${id}`);
  return el;
};

const type = (field: HTMLTextAreaElement, text: string) => {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const key = (field: Element, init: KeyboardEventInit) => {
  act(() => {
    field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  });
};

beforeEach(() => {
  useHomeDraftStore.setState({ chips: [], profile: null });
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useHomeDraftStore.setState({ chips: [], profile: null });
});

describe('§27 — one central field, four controls inside it', () => {
  it('renders the composer with voice, scan, AI fruit and send INSIDE it', () => {
    render();
    const composer = need('home-composer');
    for (const id of [
      'home-intent-input',
      'home-intent-voice',
      'home-intent-scan',
      'home-intent-vision',
      'home-intent-send',
    ]) {
      expect(composer.contains(need(id)), id).toBe(true);
    }
  });

  it('no longer offers the big „Powiedz" / „Zeskanuj" buttons', () => {
    render();
    const text = host.textContent ?? '';
    expect(text).not.toContain('Powiedz');
    expect(text).not.toContain('Zeskanuj');
    // …and there is exactly one place to add an idea.
    expect(host.querySelectorAll('[data-testid="home-intent-input"]').length).toBe(1);
  });

  it('carries the owner’s desktop tooltips on each control', () => {
    render();
    expect(need('home-intent-voice').getAttribute('title')).toBe('Powiedz, co chcesz zrobić');
    expect(need('home-intent-scan').getAttribute('title')).toBe('Zeskanuj produkt');
    expect(need('home-intent-vision').getAttribute('title')).toBe('Rozpoznaj owoc ze zdjęcia');
    expect(need('home-intent-send').getAttribute('title')).toBe('Dodaj');
  });

  it('starts on „Wpisz składnik lub smak…" and switches after the first idea', () => {
    render();
    const field = need<HTMLTextAreaElement>('home-intent-input');
    expect(field.placeholder).toBe('Wpisz składnik lub smak…');
    type(field, 'banan');
    key(field, { key: 'Enter' });
    render();
    expect(need<HTMLTextAreaElement>('home-intent-input').placeholder).toBe(
      'Coś jeszcze dodajemy?',
    );
  });

  it('ENTER and the arrow are the SAME action, and the field clears after each', () => {
    render();
    let field = need<HTMLTextAreaElement>('home-intent-input');
    type(field, 'banan');
    key(field, { key: 'Enter' });
    expect(useHomeDraftStore.getState().chips.length).toBe(1);
    expect(need<HTMLTextAreaElement>('home-intent-input').value).toBe('');

    field = need<HTMLTextAreaElement>('home-intent-input');
    type(field, 'czekolada');
    act(() => {
      need<HTMLButtonElement>('home-intent-send').click();
    });
    expect(useHomeDraftStore.getState().chips.length).toBe(2);
    expect(need<HTMLTextAreaElement>('home-intent-input').value).toBe('');
  });

  it('the arrow is inert while the field is empty, so it can never add nothing', () => {
    render();
    expect(need<HTMLButtonElement>('home-intent-send').disabled).toBe(true);
    type(need<HTMLTextAreaElement>('home-intent-input'), 'banan');
    expect(need<HTMLButtonElement>('home-intent-send').disabled).toBe(false);
  });
});

describe('§41 — the keyboard never produces a second box or a layout jump', () => {
  it('the field carries the hook the focus stylesheet needs, and no border of its own', () => {
    render();
    const field = need<HTMLTextAreaElement>('home-intent-input');
    expect(field.className).toContain('home-composer-field');
    expect(field.className).toContain('border-0');
    expect(field.className).toContain('outline-none');
  });

  it('survives the owner’s keyboard sequence without changing its own shape', () => {
    render();
    const composer = need('home-composer');
    const field = need<HTMLTextAreaElement>('home-intent-input');
    const before = composer.className;

    act(() => field.focus());
    type(field, 'banan');
    key(field, { key: 'Shift', shiftKey: true });
    key(field, { key: 'Tab' });
    key(field, { key: 'Tab', shiftKey: true });
    act(() => field.select());
    key(field, { key: 'a', ctrlKey: true });
    type(field, '');
    act(() => field.blur());
    act(() => field.focus());

    // The composer is not restyled per state — the stylesheet is, so the class
    // list must be identical before and after every one of those events.
    expect(need('home-composer').className).toBe(before);
    expect(host.querySelectorAll('[data-testid="home-intent-input"]').length).toBe(1);
  });

  it('blur commits the typed idea exactly once', () => {
    render();
    const field = need<HTMLTextAreaElement>('home-intent-input');
    act(() => field.focus());
    type(field, 'banan');
    act(() => field.blur());
    expect(useHomeDraftStore.getState().chips.length).toBe(1);
    act(() => {
      field.focus();
      field.blur();
    });
    expect(useHomeDraftStore.getState().chips.length).toBe(1);
  });
});

describe('§28 — the call to action appears only when there is a recipe to make', () => {
  it('is absent on the empty screen, together with the hint that explained it', () => {
    render();
    expect(q('home-intent-cta')).toBeNull();
    expect(q('home-intent-empty-hint')).toBeNull();
    expect(host.textContent).not.toContain('Dodaj przynajmniej jeden składnik');
  });

  it('is still absent while text sits unparsed in the field', () => {
    render();
    type(need<HTMLTextAreaElement>('home-intent-input'), 'banan');
    expect(q('home-intent-cta')).toBeNull();
  });

  it('appears after the first base idea and disappears when it is removed', () => {
    render();
    const field = need<HTMLTextAreaElement>('home-intent-input');
    type(field, 'banan');
    key(field, { key: 'Enter' });
    render();
    expect(q('home-intent-cta')).not.toBeNull();

    act(() => {
      const { chips, removeChip } = useHomeDraftStore.getState();
      chips.forEach((chip) => removeChip(chip.id));
    });
    render();
    expect(q('home-intent-cta')).toBeNull();
  });

  it('a topping on its own is not enough', () => {
    render();
    act(() => {
      useHomeDraftStore.setState({
        chips: [
          {
            id: 'c1',
            label: 'posypka czekoladowa',
            concept: 'chocolate',
            role: 'topping',
            source: 'text',
            productId: null,
            productName: null,
            ambiguous: false,
          },
        ],
      });
    });
    render();
    expect(q('home-intent-cta')).toBeNull();
  });
});
