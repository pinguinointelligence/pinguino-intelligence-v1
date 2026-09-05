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

function mount(path = '/how-it-works?step=1', audience: 'home' | 'pro' = 'home') {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <KnowledgeTour audience={audience} />
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
  it('renders one original visual, one precise annotation rail and eight real dots', () => {
    const surface = mount('/how-it-works?step=7');
    expect(surface.dataset.activeStep).toBe('7');
    expect(surface.dataset.ownerAsset).toBe('07.png');
    expect(surface.querySelectorAll('.knowledge-tour__artwork img')).toHaveLength(1);
    expect(surface.querySelectorAll('.knowledge-tour__dot')).toHaveLength(8);
    expect(surface.querySelector('[data-annotation="minus-11"]')?.textContent).toContain('−11°C');
    expect(surface.querySelector('[data-annotation="minus-12"]')?.textContent).toContain('−12°C');
    expect(surface.querySelector('[data-annotation="minus-13"]')?.textContent).toContain('−13°C');
  });

  it('supports next, back, direct dots and horizontal swipe from real guide state', () => {
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
  });

  it('uses the Home and Pro source endings without changing the shared architecture', () => {
    expect(mount('/how-it-works?step=8', 'home').dataset.ownerAsset).toBe('08.png');
    act(() => root.unmount());
    root = createRoot(host);
    expect(mount('/how-it-works?step=8', 'pro').dataset.ownerAsset).toBe('09.png');
  });
});
