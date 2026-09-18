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
 * layout jump, no control outside it. DESIGN V3.0 VI (owner 2026-09-17) moved the call
 * to action out of this section to the bottom of the start screen (`HomeStart`, see
 * `HomeStart.runtime.test.tsx`); the empty field now says what is missing instead.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useHomeDraftStore } from '../homeDraftStore';
import { HomeIntentSection, type HomeIntentSectionHandle } from './HomeIntentSection';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const render = (props: Partial<Parameters<typeof HomeIntentSection>[0]> = {}) => {
  act(() => {
    root.render(<HomeIntentSection onScan={() => undefined} {...props} />);
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

describe('DESIGN V3.0 VI (replaces §28) — the empty field says what is missing', () => {
  it('shows no call to action of its own: it lives at the bottom of the start screen', () => {
    render();
    expect(q('home-intent-cta')).toBeNull();
  });

  it('asks for a first ingredient or flavour under the empty field', () => {
    render();
    expect(need('home-intent-empty-hint').textContent).toBe(
      'Dodaj przynajmniej jeden składnik albo smak.',
    );
  });

  it('the question is the visible heading above the field', () => {
    render();
    const question = need('home-intent-question');
    expect(question.tagName).toBe('H2');
    expect(question.textContent).toBe('Jakie lody dziś robimy?');
  });

  it('the hint goes once a base idea is a chip, and returns when it is removed', () => {
    render();
    const field = need<HTMLTextAreaElement>('home-intent-input');
    type(field, 'banan');
    key(field, { key: 'Enter' });
    render();
    expect(q('home-intent-empty-hint')).toBeNull();

    act(() => {
      const { chips, removeChip } = useHomeDraftStore.getState();
      chips.forEach((chip) => removeChip(chip.id));
    });
    render();
    expect(q('home-intent-empty-hint')).not.toBeNull();
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
    expect(q('home-intent-empty-hint')).not.toBeNull();
  });

  it('the start screen commits the words still in the field through the section handle', () => {
    const handle = { current: null as HomeIntentSectionHandle | null };
    render({ ref: (value: HomeIntentSectionHandle | null) => void (handle.current = value) });
    type(need<HTMLTextAreaElement>('home-intent-input'), 'banan');
    act(() => handle.current?.commitTyped());
    expect(useHomeDraftStore.getState().chips.map((chip) => chip.label)).toEqual(['banan']);
    expect(need<HTMLTextAreaElement>('home-intent-input').value).toBe('');
  });
});

describe('DESIGN V3.0 IV-A/VI — the chip shows the customer’s own word', () => {
  it('shows „truskawkowe”, not the catalogue product, which stays in the tooltip', () => {
    act(() => {
      useHomeDraftStore.setState({
        chips: [
          {
            id: 'c1',
            label: 'truskawkowe',
            concept: 'strawberry',
            role: null,
            source: 'text',
            productId: 'PI-ING-001553',
            productName: 'STRAWBERRIES · Fresh Fruit',
            ambiguous: false,
          },
        ],
      });
    });
    render();
    const chip = need('home-intent-chip');
    const label = need('home-intent-chip-label');
    // What a sighted customer reads is their own word…
    const visible = [...label.childNodes]
      .filter((node) => !(node instanceof HTMLElement && node.classList.contains('sr-only')))
      .map((node) => node.textContent)
      .join('');
    expect(visible).toBe('truskawkowe');
    // …the product it resolved to is still there for anyone who checks.
    expect(chip.getAttribute('title')).toBe('STRAWBERRIES · Fresh Fruit');
    expect(label.textContent).toContain('STRAWBERRIES · Fresh Fruit');
    expect(need('home-intent-chip-remove').getAttribute('aria-label')).toBe('Usuń truskawkowe');
  });
});
