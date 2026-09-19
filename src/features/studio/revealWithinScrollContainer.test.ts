// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nearestScrollContainer, revealWithinScrollContainer } from './revealWithinScrollContainer';

const SETTINGS = '[data-testid="workbench-settings-line"]';

function rect(top: number, height = 40): DOMRect {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: 320,
    width: 320,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** A scroll container whose child sits `offset` px below its own top, like real layout. */
function scroller(top: number, contentOffset: number) {
  const box = document.createElement('div');
  box.style.overflowY = 'auto';
  Object.defineProperty(box, 'scrollHeight', { value: 2000, configurable: true });
  Object.defineProperty(box, 'clientHeight', { value: 600, configurable: true });
  Object.defineProperty(box, 'scrollTop', { value: 0, writable: true, configurable: true });
  box.getBoundingClientRect = () => rect(top, 600);
  const target = document.createElement('section');
  target.dataset.testid = 'workbench-settings-line';
  target.getBoundingClientRect = () => rect(top + contentOffset - box.scrollTop);
  box.append(target);
  return { box, target };
}

describe('PRO MOBILE UX v2 · A3 — landing on the settings', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('reveals the copy inside the VISIBLE container, not the hidden twin that comes first', () => {
    const hiddenColumn = document.createElement('aside');
    const twin = document.createElement('section');
    twin.dataset.testid = 'workbench-settings-line';
    hiddenColumn.append(twin);
    const sheet = document.createElement('section');
    const { box, target } = scroller(80, 900);
    sheet.append(box);
    document.body.append(hiddenColumn, sheet);
    // A document-wide lookup finds the twin — the old behaviour on a phone.
    expect(document.querySelector(SETTINGS)).toBe(twin);

    const settled = vi.fn();
    revealWithinScrollContainer({ container: sheet, selector: SETTINGS, onSettled: settled });
    vi.advanceTimersByTime(500);

    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledWith(target);
  });

  it('scrolls the target to the top of its own scroll container, keeping the offset', () => {
    const sheet = document.createElement('section');
    const { box } = scroller(80, 900);
    sheet.append(box);
    document.body.append(sheet);

    revealWithinScrollContainer({ container: sheet, selector: SETTINGS, offset: 12 });
    vi.advanceTimersByTime(500);

    expect(box.scrollTop).toBe(900 - 12);
  });

  it('waits for a target that renders only after the sheet has opened', () => {
    const sheet = document.createElement('section');
    document.body.append(sheet);
    const settled = vi.fn();
    revealWithinScrollContainer({ container: sheet, selector: SETTINGS, onSettled: settled });

    vi.advanceTimersByTime(200);
    expect(settled).not.toHaveBeenCalled();
    const { box, target } = scroller(80, 700);
    sheet.append(box);
    vi.advanceTimersByTime(500);

    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledWith(target);
  });

  it('gives up quietly when the target never appears, and stops when cancelled', () => {
    const sheet = document.createElement('section');
    document.body.append(sheet);
    const settled = vi.fn();
    revealWithinScrollContainer({ container: sheet, selector: SETTINGS, onSettled: settled });
    vi.advanceTimersByTime(3000);
    expect(settled).not.toHaveBeenCalled();

    const cancel = revealWithinScrollContainer({
      container: sheet,
      selector: SETTINGS,
      onSettled: settled,
    });
    cancel();
    sheet.append(scroller(80, 700).box);
    vi.advanceTimersByTime(3000);
    expect(settled).not.toHaveBeenCalled();
  });

  it('finds no scroll container when nothing between the target and the boundary scrolls', () => {
    const boundary = document.createElement('section');
    const plain = document.createElement('div');
    const target = document.createElement('p');
    plain.append(target);
    boundary.append(plain);
    document.body.append(boundary);
    expect(nearestScrollContainer(target, boundary)).toBeNull();
  });
});
