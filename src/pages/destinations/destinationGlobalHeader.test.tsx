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

  it('renders exactly ONE accessible switch, not a responsive pair', () => {
    // SUPERSEDED. This used to assert a DOM pair whose visibility was mutually
    // exclusive. Served QA on 8dd11c9b showed why that is not enough: the CSS-hidden
    // copy still existed in the accessibility tree as a zero-width tablist, so a screen
    // reader met two HOME and two PRO tabs. Visual exclusivity is not exclusivity.
    const lists = [...mountSurface().querySelectorAll('[role="tablist"]')];
    expect(lists).toHaveLength(1);
    expect(lists[0]!.querySelectorAll('[role="tab"]')).toHaveLength(2);
  });
});
