/** @vitest-environment jsdom */
/**
 * MASKED GRAMS CONFIDENTIALITY — served-QA regression, 2026-08-31.
 *
 * #67 reused `DirectNumberControl` for the entitlement-masked row and brought its value
 * announcements with it. The display said `•••` while the exact grams were still in the
 * accessibility surface: an `aria-live` region reading „— ilość w g: 402 g", plus a
 * hidden input carrying `value="402"` and `aria-valuenow="402"`. The mask was visual only.
 *
 * These assert the RENDERED result, not the source text.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectNumberControl } from './DirectNumberControl';

const SECRET = 402;
const MASK = '•••';
const MASK_LABEL = 'Gramatura ukryta — dostępna w planie HOME lub PRO';

let host: HTMLDivElement;
let root: Root;

const mount = (props: Record<string, unknown>) => {
  act(() => {
    root.render(
      <DirectNumberControl
        value={SECRET}
        step={1}
        decimals={0}
        suffix="g"
        ariaLabel="MILK 3.5% — ilość w g"
        testId="row-grams"
        onChange={(props.onChange as (v: number) => void) ?? vi.fn()}
        {...props}
      />,
    );
  });
  return host;
};

/** Everything a person or a screen reader could observe. */
const accessibleSurface = (el: HTMLElement) => {
  const attrs: string[] = [];
  el.querySelectorAll('*').forEach((node) => {
    for (const name of [
      'aria-label',
      'aria-valuenow',
      'aria-valuetext',
      'aria-describedby',
      'title',
      'value',
      'placeholder',
    ]) {
      const v = node.getAttribute(name);
      if (v) attrs.push(v);
    }
    if (node instanceof HTMLInputElement && node.value) attrs.push(node.value);
  });
  return `${el.innerText ?? ''} ${el.textContent ?? ''} ${attrs.join(' ')}`;
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('masked row leaks no exact grams', () => {
  it('shows the mask and the unit, and never the number', () => {
    const el = mount({ maskedValue: MASK, maskedLabel: MASK_LABEL, onMaskedInteract: vi.fn() });
    expect(el.textContent).toContain(MASK);
    expect(el.textContent).toContain('g');
    expect(el.textContent).not.toContain(String(SECRET));
  });

  it('keeps the number out of the whole accessible surface', () => {
    const el = mount({ maskedValue: MASK, maskedLabel: MASK_LABEL, onMaskedInteract: vi.fn() });
    expect(accessibleSurface(el)).not.toContain(String(SECRET));
  });

  it('renders no numeric input at all — hidden is not enough', () => {
    const el = mount({ maskedValue: MASK, maskedLabel: MASK_LABEL, onMaskedInteract: vi.fn() });
    expect(el.querySelectorAll('input')).toHaveLength(0);
    expect(el.querySelector('[aria-valuenow]')).toBeNull();
    expect(el.querySelector('[role="spinbutton"]')).toBeNull();
  });

  it('announces the gate, not the amount, in the live region', () => {
    const el = mount({ maskedValue: MASK, maskedLabel: MASK_LABEL, onMaskedInteract: vi.fn() });
    const live = el.querySelector('[aria-live]');
    expect(live).not.toBeNull();
    expect(live!.textContent).not.toContain(String(SECRET));
    expect(live!.textContent).toContain(MASK_LABEL);
  });

  it('never falls back to the value when no masked label is supplied', () => {
    const el = mount({ maskedValue: MASK, onMaskedInteract: vi.fn() });
    expect(accessibleSurface(el)).not.toContain(String(SECRET));
  });
});

describe('masked controls route to entitlement and mutate nothing', () => {
  it('minus and plus call the gate and never onChange', () => {
    const onChange = vi.fn();
    const onMaskedInteract = vi.fn();
    const el = mount({ maskedValue: MASK, maskedLabel: MASK_LABEL, onChange, onMaskedInteract });
    const steppers = [...el.querySelectorAll('button')].filter((b) =>
      /zmniejsz|zwiększ/.test(b.getAttribute('aria-label') ?? ''),
    );
    expect(steppers).toHaveLength(2);
    steppers.forEach((b) => act(() => b.dispatchEvent(new MouseEvent('click', { bubbles: true }))));
    expect(onMaskedInteract).toHaveBeenCalledTimes(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('the masked value cell itself routes to the gate', () => {
    const onChange = vi.fn();
    const onMaskedInteract = vi.fn();
    const el = mount({ maskedValue: MASK, maskedLabel: MASK_LABEL, onChange, onMaskedInteract });
    const cell = el.querySelector('[data-testid="row-grams-masked"]')!;
    act(() => cell.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onMaskedInteract).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('names the gate on the stepper labels so they are not silently inert', () => {
    const el = mount({ maskedValue: MASK, maskedLabel: MASK_LABEL, onMaskedInteract: vi.fn() });
    const minus = [...el.querySelectorAll('button')].find((b) =>
      /zmniejsz/.test(b.getAttribute('aria-label') ?? ''),
    )!;
    expect(minus.getAttribute('aria-label')).toContain(MASK_LABEL);
    expect(minus.getAttribute('aria-label')).not.toContain(String(SECRET));
  });
});

describe('the masked lock routes to entitlement too', () => {
  const lockSegment = (onToggle: () => void) => ({
    pressed: false,
    ariaLabel: 'MILK 3.5% — Zablokuj ilość',
    title: 'Zablokuj ilość',
    suffix: 'g' as const,
    testId: 'row-lock',
    onToggle,
  });

  it('does not call onToggle while masked — it opens the gate instead', () => {
    const onToggle = vi.fn();
    const onMaskedInteract = vi.fn();
    const onChange = vi.fn();
    const el = mount({
      maskedValue: MASK,
      maskedLabel: MASK_LABEL,
      onChange,
      onMaskedInteract,
      lockSegment: lockSegment(onToggle),
    });
    const lock = el.querySelector('[data-testid="row-lock"]')!;
    act(() => lock.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onToggle).not.toHaveBeenCalled();
    expect(onMaskedInteract).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('still renders the single closed padlock and leaks nothing', () => {
    const el = mount({
      maskedValue: MASK,
      maskedLabel: MASK_LABEL,
      onMaskedInteract: vi.fn(),
      lockSegment: lockSegment(vi.fn()),
    });
    const lock = el.querySelector('[data-testid="row-lock"]')!;
    expect(lock.querySelectorAll('svg')).toHaveLength(1);
    expect(accessibleSurface(el)).not.toContain(String(SECRET));
  });

  it('the entitled lock still toggles normally', () => {
    const onToggle = vi.fn();
    const el = mount({ lockSegment: lockSegment(onToggle) });
    const lock = el.querySelector('[data-testid="row-lock"]')!;
    act(() => lock.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('the entitled lock keeps its pressed semantics', () => {
    const el = mount({ lockSegment: { ...lockSegment(vi.fn()), pressed: true } });
    expect(el.querySelector('[data-testid="row-lock"]')!.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the entitled state is unchanged', () => {
  it('still renders the real value and a working spinbutton', () => {
    const el = mount({});
    expect(el.querySelector('[role="spinbutton"]')).not.toBeNull();
    expect(el.querySelector('[aria-valuenow]')?.getAttribute('aria-valuenow')).toBe(String(SECRET));
    expect(el.textContent).toContain(String(SECRET));
  });

  it('still announces the exact amount for an entitled user', () => {
    const el = mount({});
    expect(el.querySelector('[aria-live]')!.textContent).toContain(String(SECRET));
  });

  it('minus and plus still mutate through onChange', () => {
    const onChange = vi.fn();
    const el = mount({ onChange });
    const plus = [...el.querySelectorAll('button')].find((b) =>
      /zwiększ/.test(b.getAttribute('aria-label') ?? ''),
    )!;
    act(() => plus.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onChange).toHaveBeenCalled();
  });
});

describe('geometry is identical in both states', () => {
  const shell = (el: HTMLElement) => el.firstElementChild!.className;
  const segments = (el: HTMLElement) =>
    [...el.querySelectorAll('button')].map((b) => b.className).join('|');

  it('the control shell keeps the same classes', () => {
    const maskedShell = shell(
      mount({ maskedValue: MASK, maskedLabel: MASK_LABEL, onMaskedInteract: vi.fn() }),
    );
    act(() => root.unmount());
    root = createRoot(host);
    expect(shell(mount({}))).toBe(maskedShell);
  });

  it('the stepper segments keep the same classes', () => {
    const maskedSegs = segments(
      mount({ maskedValue: MASK, maskedLabel: MASK_LABEL, onMaskedInteract: vi.fn() }),
    );
    act(() => root.unmount());
    root = createRoot(host);
    // Masked adds the value-cell button; compare only the two steppers.
    expect(segments(mount({})).split('|').slice(0, 2)).toEqual(maskedSegs.split('|').slice(0, 2));
  });
});
