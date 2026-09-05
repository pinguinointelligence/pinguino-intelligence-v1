/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KnowledgeTour } from './KnowledgeTour';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function mount(path = '/how-it-works?step=1') {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <KnowledgeTour />
      </MemoryRouter>,
    );
  });
  return host.querySelector<HTMLElement>('[data-testid="knowledge-tour"]')!;
}

function swipe(surface: HTMLElement, startX: number, endX: number) {
  const start = new Event('touchstart', { bubbles: true });
  Object.defineProperty(start, 'changedTouches', {
    value: [{ clientX: startX, clientY: 120 }],
  });
  const end = new Event('touchend', { bubbles: true });
  Object.defineProperty(end, 'changedTouches', {
    value: [{ clientX: endX, clientY: 124 }],
  });
  act(() => {
    surface.dispatchEvent(start);
    surface.dispatchEvent(end);
  });
}

describe('responsive Knowledge Tour interactions', () => {
  it('renders the corrected Step 7 visual, normalized labels and nine real dots', () => {
    const surface = mount('/how-it-works?step=7');
    expect(surface.dataset.activeStep).toBe('7');
    expect(surface.dataset.ownerAsset).toBe('07.png');
    expect(surface.querySelector('.knowledge-tour__eyebrow')?.textContent).toContain('Krok 7 z 9');
    expect(surface.querySelectorAll('.knowledge-tour__artwork img')).toHaveLength(1);
    expect(surface.querySelectorAll('.knowledge-tour__dot')).toHaveLength(9);
    expect(surface.querySelector('[data-annotation="minus-11"]')?.textContent).toContain('−11°C');
    expect(surface.querySelector('[data-annotation="minus-12"]')?.textContent).toContain('−12°C');
    expect(surface.querySelector('[data-annotation="minus-13"]')?.textContent).toContain('−13°C');
    expect(
      (surface.querySelector('[data-annotation="minus-11"]') as HTMLElement).style.getPropertyValue(
        '--tour-anchor-x',
      ),
    ).toBe('19%');
  });

  it('supports next, back, direct dots, keyboard and horizontal swipe from real guide state', () => {
    const surface = mount();
    const buttons = () =>
      surface.querySelectorAll<HTMLButtonElement>('.knowledge-tour__nav-button');

    act(() => buttons()[1]?.click());
    expect(surface.dataset.activeStep).toBe('2');

    act(() => buttons()[0]?.click());
    expect(surface.dataset.activeStep).toBe('1');

    act(() => surface.querySelectorAll<HTMLButtonElement>('.knowledge-tour__dot')[6]?.click());
    expect(surface.dataset.activeStep).toBe('7');

    swipe(surface, 320, 210);
    expect(surface.dataset.activeStep).toBe('8');
    swipe(surface, 120, 230);
    expect(surface.dataset.activeStep).toBe('7');

    act(() =>
      surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    );
    expect(surface.dataset.activeStep).toBe('8');
    act(() =>
      surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })),
    );
    expect(surface.dataset.activeStep).toBe('7');
  });

  it('deep-links to HOME machines at Step 8 and professional production at Step 9', () => {
    expect(mount('/how-it-works?step=8').dataset.ownerAsset).toBe('08.png');
    act(() => root.unmount());
    root = createRoot(host);
    const final = mount('/how-it-works?step=9');
    expect(final.dataset.ownerAsset).toBe('09.png');
    expect(final.querySelector('.knowledge-tour__eyebrow')?.textContent).toContain('Krok 9 z 9');
  });

  it('restarts only from the ninth and final step', () => {
    const surface = mount('/how-it-works?step=9');
    const next = surface.querySelectorAll<HTMLButtonElement>('.knowledge-tour__nav-button')[1]!;
    expect(next.textContent).toContain('Od początku');
    act(() => next.click());
    expect(surface.dataset.activeStep).toBe('1');
  });

  it('retains normalized caption centers when the viewport resizes', () => {
    const surface = mount('/how-it-works?step=4');
    const before = [...surface.querySelectorAll<HTMLElement>('.knowledge-tour__annotation')].map(
      (item) => item.style.getPropertyValue('--tour-anchor-x'),
    );
    act(() => window.dispatchEvent(new Event('resize')));
    const after = [...surface.querySelectorAll<HTMLElement>('.knowledge-tour__annotation')].map(
      (item) => item.style.getPropertyValue('--tour-anchor-x'),
    );
    expect(after).toEqual(before);
    expect(after).toHaveLength(5);
  });
});
