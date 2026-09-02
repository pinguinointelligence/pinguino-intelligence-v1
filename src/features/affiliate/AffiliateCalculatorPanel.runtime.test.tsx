/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AffiliateCalculatorPanel } from './AffiliateCalculatorPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const mount = () => {
  act(() => {
    root.render(<AffiliateCalculatorPanel applyHref="#affiliate-application" />);
  });
};

const inputs = () => [...host.querySelectorAll<HTMLInputElement>('input[type=number]')];
/** The four inputs are a fixed contract of this panel; index access is safe. */
const inputAt = (index: number) => inputs()[index]!;
const results = () =>
  [...host.querySelectorAll('dd')].map((node) => node.textContent?.trim() ?? '');
const modeButton = (label: string) =>
  [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === label)!;

/** Type into a controlled input the way a person does. */
const typeInto = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('AffiliateCalculatorPanel — real interaction', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    mount();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('starts at zero for every output', () => {
    expect(inputs()).toHaveLength(4);
    expect(results().every((value) => /^0/.test(value))).toBe(true);
  });

  /**
   * REGRESSION: the panel used to read `event.currentTarget.value` INSIDE the
   * `setRaw` updater. React nulls `currentTarget` once the handler returns and
   * runs the updater later, so the first keystroke threw and the whole panel
   * fell into the error boundary. A static render test could never see it —
   * only typing does.
   */
  it('survives typing and recomputes on every keystroke', () => {
    typeInto(inputAt(0), '10');
    typeInto(inputAt(1), '5');
    typeInto(inputAt(2), '4');
    typeInto(inputAt(3), '3');

    expect(inputAt(0).value).toBe('10');
    const [monthly, annual, total, average] = results();
    // Standard: 10×1,99 + 5×4,99 = 44,85 / month
    expect(monthly).toMatch(/44,85/);
    // 4×9 + 3×29 = 123 from annual renewals
    expect(annual).toMatch(/123/);
    // 44,85×12 + 123 = 661,20 per year
    expect(total).toMatch(/661,20/);
    // 661,20 / 12 = 55,10
    expect(average).toMatch(/55,10/);
  });

  it('switches to the Gold rates without losing the entered counts', () => {
    typeInto(inputAt(0), '10');
    act(() => modeButton('Gold').click());
    expect(inputAt(0).value).toBe('10');
    // Gold HOME monthly is 2,49
    expect(results()[0]).toMatch(/24,90/);
  });

  it('Elite replaces the result with individual terms and shows NO figure', () => {
    typeInto(inputAt(0), '10');
    act(() => modeButton('Elite').click());
    expect(host.textContent).toContain('Indywidualne warunki');
    expect(host.querySelectorAll('dd')).toHaveLength(0);
    // No euro amount anywhere in the panel while Elite is selected.
    expect(host.textContent).not.toMatch(/€/);
    // …and the inputs are disabled rather than pretending to price Elite.
    expect(inputs().every((input) => input.disabled)).toBe(true);
  });

  it('returns to a priced tier after Elite', () => {
    typeInto(inputAt(0), '10');
    act(() => modeButton('Elite').click());
    act(() => modeButton('Standard').click());
    expect(results()[0]).toMatch(/19,90/);
    expect(inputs().every((input) => input.disabled)).toBe(false);
  });

  it('treats junk input as zero instead of crashing', () => {
    typeInto(inputAt(0), '-5');
    expect(results()[0]).toMatch(/^0/);
    typeInto(inputAt(0), 'abc');
    expect(results()[0]).toMatch(/^0/);
    typeInto(inputAt(0), '');
    expect(results()[0]).toMatch(/^0/);
  });

  it('clears every field with the reset control', () => {
    typeInto(inputAt(0), '10');
    typeInto(inputAt(3), '7');
    act(() => modeButton('Wyczyść').click());
    expect(inputs().map((input) => input.value)).toEqual(['', '', '', '']);
    expect(results().every((value) => /^0/.test(value))).toBe(true);
  });
});
