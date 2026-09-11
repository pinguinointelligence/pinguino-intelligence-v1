/** @vitest-environment jsdom */
/**
 * §29 — the coachmark on a real document.
 *
 * jsdom lays nothing out, so every element measures 0×0. That is convenient
 * here: it is exactly the „element is not really on screen" case, and it lets
 * the anchor geometry be supplied explicitly for the one test that needs it.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TutorialOverlay } from './TutorialOverlay';
import type { TutorialStep } from './tutorialSteps';
import { useTutorialStore, writeSeen } from './tutorialState';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const STEPS: readonly TutorialStep[] = [
  { id: 'one', anchor: 'anchor-one', title: 'Pierwszy', body: 'Pierwsza rzecz.' },
  { id: 'two', anchor: 'anchor-two', title: 'Drugi', body: 'Druga rzecz.' },
  { id: 'ghost', anchor: 'anchor-missing', title: 'Nie ma', body: 'Nie istnieje.' },
];

let host: HTMLDivElement;
let root: Root;

const anchor = (testId: string, box?: Partial<DOMRect>) => {
  const el = document.createElement('div');
  el.setAttribute('data-testid', testId);
  el.scrollIntoView = vi.fn();
  if (box) {
    el.getBoundingClientRect = () =>
      ({ top: 100, left: 40, width: 300, height: 60, ...box }) as DOMRect;
  }
  document.body.appendChild(el);
  return el;
};

const q = (id: string) => document.querySelector(`[data-testid="${id}"]`);
const click = (id: string) =>
  act(() => {
    (q(id) as HTMLButtonElement).click();
  });

const render = () => {
  act(() => {
    root.render(<TutorialOverlay steps={STEPS} />);
  });
};

/**
 * Let the rAF-driven measure, the auto-start timer and the scroll-follow loop
 * all run. The follow loop deliberately keeps asking for frames until the
 * anchor's box stops moving, so this drains several rounds rather than one.
 */
const settle = async () => {
  for (let round = 0; round < 10; round += 1) {
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(performance.now()), 0)) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = ((id: number) =>
    window.clearTimeout(id)) as typeof window.cancelAnimationFrame;
  window.localStorage.clear();
  useTutorialStore.setState({ run: { status: 'idle' } });
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
  });
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
  window.localStorage.clear();
  useTutorialStore.setState({ run: { status: 'idle' } });
});

describe('§29 — first run', () => {
  it('offers itself once, spotlighting only steps whose element is there', async () => {
    anchor('anchor-one', {});
    anchor('anchor-two', {});
    render();
    await settle();
    expect(q('tutorial-overlay')).not.toBeNull();
    expect(q('tutorial-counter')?.textContent).toBe('1 / 2');
    expect(q('tutorial-overlay')?.getAttribute('data-tutorial-step')).toBe('one');
    expect(document.body.textContent).toContain('Pierwsza rzecz.');
    expect(document.body.textContent).not.toContain('Nie istnieje.');
  });

  it('does not appear again once it has been seen', async () => {
    writeSeen();
    anchor('anchor-one', {});
    render();
    await settle();
    expect(q('tutorial-overlay')).toBeNull();
  });

  it('does not appear when there is nothing on screen to point at', async () => {
    render();
    await settle();
    expect(q('tutorial-overlay')).toBeNull();
  });
});

describe('§29 — it starts itself only where it has something REAL to teach', () => {
  const WITH_OPENER: readonly TutorialStep[] = [
    {
      id: 'opener',
      anchor: 'home-pro-switch',
      title: 'HOME i PRO',
      body: 'Opener.',
      anchorOptional: true,
    },
    ...STEPS,
  ];

  it('does not start on a page that only has the optional HOME|PRO opener — and consumes nothing', async () => {
    // The header's HOME|PRO switch is on almost every page. Counting the
    // opener made every page "have a tutorial", and one click there marked it
    // seen before the customer ever reached HOME.
    anchor('home-pro-switch', {});
    act(() => {
      root.render(<TutorialOverlay steps={WITH_OPENER} />);
    });
    await settle();
    expect(q('tutorial-overlay')).toBeNull();
    expect(window.localStorage.getItem('gellatti.tutorial.home.seen.v1')).toBeNull();
  });

  it('still starts on HOME, opener first, once a real step is on screen', async () => {
    anchor('home-pro-switch', {});
    anchor('anchor-one', {});
    act(() => {
      root.render(<TutorialOverlay steps={WITH_OPENER} />);
    });
    await settle();
    expect(q('tutorial-overlay')?.getAttribute('data-tutorial-step')).toBe('opener');
    expect(q('tutorial-counter')?.textContent).toBe('1 / 2');
  });

  it('„Uruchom samouczek ponownie" still works on any page — it shows what exists', async () => {
    anchor('home-pro-switch', {});
    act(() => {
      root.render(<TutorialOverlay steps={WITH_OPENER} />);
    });
    await settle();
    act(() => useTutorialStore.getState().start());
    await settle();
    expect(q('tutorial-overlay')?.getAttribute('data-tutorial-step')).toBe('opener');
  });

  it('never throws where the platform has no scrollIntoView (jsdom, some webviews)', async () => {
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'anchor-one');
    el.getBoundingClientRect = () => ({ top: 100, left: 40, width: 300, height: 60 }) as DOMRect;
    // An own `undefined` shadows any prototype method: this IS the crash case
    // the full suite hit in ProductionHistoryTruth / RecipesHubPage.
    (el as unknown as { scrollIntoView?: unknown }).scrollIntoView = undefined;
    document.body.appendChild(el);
    render();
    await settle();
    expect(q('tutorial-overlay')?.getAttribute('data-tutorial-measured')).toBe('anchor-one');
  });
});

describe('§29 — Dalej / Wstecz / Pomiń', () => {
  it('walks forward, back, and finishes without coming back', async () => {
    anchor('anchor-one', {});
    anchor('anchor-two', {});
    render();
    await settle();

    click('tutorial-next');
    await settle();
    expect(q('tutorial-counter')?.textContent).toBe('2 / 2');
    expect(q('tutorial-next')?.textContent).toBe('Gotowe');

    click('tutorial-back');
    await settle();
    expect(q('tutorial-counter')?.textContent).toBe('1 / 2');
    expect(q('tutorial-back')).toBeNull();

    click('tutorial-next');
    await settle();
    click('tutorial-next');
    await settle();
    expect(q('tutorial-overlay')).toBeNull();
    expect(window.localStorage.getItem('gellatti.tutorial.home.seen.v1')).toBe('1');
  });

  it('„Pomiń" ends it, and it stays ended', async () => {
    anchor('anchor-one', {});
    render();
    await settle();
    click('tutorial-skip');
    await settle();
    expect(q('tutorial-overlay')).toBeNull();
  });
});

describe('§29 — the spotlight', () => {
  it('scrolls the element into view and cuts the dim to its own box and radius', async () => {
    const el = anchor('anchor-one', { top: 100, left: 40, width: 300, height: 60 });
    render();
    await settle();
    expect(el.scrollIntoView).toHaveBeenCalled();
    const light = q('tutorial-spotlight') as HTMLElement | null;
    expect(light).not.toBeNull();
    // 8 px of padding on every side of the anchor's own rectangle.
    expect(light!.style.top).toBe('92px');
    expect(light!.style.left).toBe('32px');
    expect(light!.style.width).toBe('316px');
    expect(light!.style.height).toBe('76px');
    expect(light!.style.boxShadow).toContain('100vmax');
    expect(q('tutorial-overlay')?.getAttribute('data-tutorial-measured')).toBe('anchor-one');
  });

  it('measures on a timer as well as a frame, so a hidden tab still gets a spotlight', async () => {
    // A background tab throttles or stops requestAnimationFrame entirely; a
    // tutorial that never measured shows a dimmed screen with no lit element.
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = (() => 0) as typeof window.requestAnimationFrame;
    try {
      anchor('anchor-one', { top: 100, left: 40, width: 300, height: 60 });
      render();
      await settle();
      expect(q('tutorial-overlay')?.getAttribute('data-tutorial-measured')).toBe('anchor-one');
      expect(q('tutorial-spotlight')).not.toBeNull();
    } finally {
      window.requestAnimationFrame = raf;
    }
  });

  it('changes nothing in the application — it only reads the DOM', async () => {
    const el = anchor('anchor-one', { top: 100, left: 40, width: 300, height: 60 });
    const before = el.outerHTML;
    render();
    await settle();
    click('tutorial-next');
    await settle();
    expect(el.outerHTML).toBe(before);
  });
});
