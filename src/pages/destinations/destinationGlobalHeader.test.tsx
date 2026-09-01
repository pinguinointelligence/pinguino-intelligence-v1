/** @vitest-environment jsdom */
/**
 * WORK WITH US — the destination surface consumes the GLOBAL header.
 *
 * Written after a clean git merge produced a silently broken header: #68 added
 * `actions={<DestinationHomeProSwitch />}` while #77 added `actions={headerActions}`
 * to the SAME `AppShell` call. Neither side conflicted textually, so the merge
 * succeeded; in JSX the later prop wins, so every Work With Us route shipped with
 * no HOME | PRO switch at all.
 *
 * Typecheck, build and eslint were all green on that file — a duplicate JSX prop
 * is not an error in this repo's lint config. Only rendering catches it, which is
 * why this contract mounts the surface instead of reading its source.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DestinationSurface } from '@/components/shared/DestinationSurface';

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

/** A signed-out visitor — the audience these public marketing routes are for. */
const mountSurface = () => {
  act(() => {
    root.render(
      <MemoryRouter>
        <DestinationSurface eyebrow="Współpraca" title="Maszyny" blurb="Test" bare>
          <p>lane body</p>
        </DestinationSurface>
      </MemoryRouter>,
    );
  });
  return host;
};

describe('a destination route wears the global header', () => {
  it('renders the HOME | PRO switch when the page names no header actions', () => {
    // The regression: `headerActions` undefined silently won over the default,
    // so a route that names nothing rendered no switch at all.
    const tabs = [...mountSurface().querySelectorAll('[role="tab"]')];
    expect(tabs.length).toBeGreaterThan(0);
    expect([...new Set(tabs.map((t) => t.textContent?.trim()))]).toEqual(['HOME', 'PRO']);
  });

  it('presents the switch NEUTRAL — a marketing page is neither HOME nor PRO', () => {
    const tabs = [...mountSurface().querySelectorAll('[role="tab"]')];
    expect(tabs.every((t) => t.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  it('renders the responsive PAIR, of which exactly one is ever visible', () => {
    // AppShell (#76) places a non-workbench page's actions at the trailing edge of
    // the work column above xl, and in the wrapping trailing group below it. Both
    // copies exist in the DOM by design; the guard is that their visibility is
    // mutually exclusive, so a visitor never sees two switches saying the same thing.
    const lists = [...mountSurface().querySelectorAll('[role="tablist"]')];
    expect(lists).toHaveLength(2);

    const visibility = lists.map((list) => {
      const desktopOnly = list.closest('.hidden.xl\\:flex') !== null;
      const belowXlOnly = list.closest('.xl\\:hidden') !== null;
      return { desktopOnly, belowXlOnly };
    });
    expect(visibility.filter((v) => v.desktopOnly && !v.belowXlOnly)).toHaveLength(1);
    expect(visibility.filter((v) => v.belowXlOnly && !v.desktopOnly)).toHaveLength(1);
  });
});
