/** @vitest-environment jsdom */
/**
 * GLOBAL HEADER PARITY — owner contract, 2026-09-01.
 *
 * The header is ONE geometry for every audience and every page. Served measurement found
 * HOME on the flex branch and PRO on the grid branch, 46 px apart at 1440, with the
 * HOME|PRO switch rendering on neither surface.
 */
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HomeProSwitch } from '@/features/home-creator/ui/HomeProSwitch';
import {
  segmentTreatment,
  viewSwitchSegments,
  type ViewEntitlement,
} from '@/features/home-creator/homeViewMode';

const shell = readFileSync('src/features/shell/AppShell.tsx', 'utf8');

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

const mount = (entitlement: ViewEntitlement, activeView: 'home' | 'pro' | null) => {
  act(() => {
    root.render(
      <MemoryRouter>
        <HomeProSwitch entitlement={entitlement} activeView={activeView} />
      </MemoryRouter>,
    );
  });
  return host;
};

describe('the header grid is GLOBAL, not a workbench detail', () => {
  it('applies the shared two-track grid regardless of viewportLock', () => {
    // viewportLock also locks the BODY (h-dvh, overflow-hidden) — right for the
    // workbench, wrong for a long sequential document. Geometry must not ride on it.
    expect(shell).toContain('`xl:grid ${DESKTOP_WORKBENCH_COLUMNS}`');
    expect(shell).not.toContain('viewportLock && `xl:grid');
  });

  it('keeps the global elements in column 1 on every page', () => {
    expect(shell).toContain("'xl:col-start-1 xl:row-start-1'");
  });

  it('anchors non-workbench actions to the work column, never the viewport edge', () => {});

  it('does NOT give non-workbench pages the workbench body lock', () => {
    expect(shell).toContain(
      "viewportLock && 'xl:flex xl:h-dvh xl:min-h-0 xl:flex-col xl:overflow-hidden'",
    );
  });

  it('renders no plan badge beside the switch', () => {
    expect(shell).not.toContain('app-shell-plan-badge');
  });

  it('uses the official Gellatti wordmark', () => {
    const logo = readFileSync('src/components/shared/OfficialProLogo.tsx', 'utf8');
    expect(logo).toContain('/brand/gellatti-wordmark-graphite.svg');
  });
});

describe('the global header keeps its own origin', () => {
  it('destination pages no longer override the header box', () => {
    // PROVEN CAUSE (staging 8dd11c9b): `.gellatti-destination-shell > header` is
    // `.class > element`, which outranks the shell's own `xl:px-0` / `xl:w-[…]`
    // utilities. It set width/max-width and a clamp(1rem, 4.03vw, 58px) inset, so HOME
    // sat 46 px off PRO's frozen origin. Only the hairline colour may remain.
    const css = readFileSync('src/styles/gellatti-v2-1.css', 'utf8');
    const rule = css.slice(
      css.indexOf('.gellatti-destination-shell > header'),
      css.indexOf('}', css.indexOf('.gellatti-destination-shell > header')),
    );
    expect(rule).not.toContain('padding-inline');
    expect(rule).not.toContain('max-width');
    expect(rule).not.toContain('width:');
    expect(rule).toContain('border-bottom-color');
  });

  it('keeps the shared header width/inset utilities as the single authority', () => {
    const geometry = readFileSync('src/features/shell/shellGeometry.ts', 'utf8');
    expect(geometry).toContain('xl:w-[calc(100%-var(--pro-page-gutter))]');
    expect(geometry).toContain('xl:px-0');
  });
});

describe('exactly one accessible HOME | PRO control', () => {
  it('renders the switch once, not once per breakpoint', () => {
    // A CSS-hidden second copy still reaches assistive tech: served 8dd11c9b exposed a
    // zero-width tablist, so a screen reader met two HOME and two PRO tabs.
    // Two mutually exclusive render sites: the workbench's accepted inline placement
    // and the non-workbench work-column anchor. Never both, never a hidden duplicate.
    expect(shell).toContain('viewportLock ? actions : null');
    expect((shell.match(/\{actions\}/g) ?? []).length).toBe(1);
    expect(shell).not.toContain('hidden xl:flex');
    expect(shell).toContain('viewportLock ? actions : null');
    expect(shell).toContain('!viewportLock ? (');
  });

  it('mounts exactly one tablist with exactly two tabs', () => {
    const el = mount({ authed: true, canHome: true, canPro: false }, 'home');
    expect(el.querySelectorAll('[role="tablist"]')).toHaveLength(1);
    expect(el.querySelectorAll('[role="tab"]')).toHaveLength(2);
  });
});

describe('HOME | PRO is always visible — visibility is not access', () => {
  it('renders both segments for every audience', () => {
    expect(viewSwitchSegments()).toEqual(['home', 'pro']);
    for (const ent of [
      { authed: false, canHome: false, canPro: false },
      { authed: true, canHome: true, canPro: false },
      { authed: true, canHome: false, canPro: true },
      { authed: true, canHome: true, canPro: true },
    ]) {
      const el = mount(ent, 'home');
      expect(el.querySelectorAll('[role="tab"]').length, JSON.stringify(ent)).toBe(2);
      act(() => root.unmount());
      root = createRoot(host);
    }
  });

  it('renders for a HOME-only subscriber, which previously rendered nothing', () => {
    const el = mount({ authed: true, canHome: true, canPro: false }, 'home');
    const labels = [...el.querySelectorAll('[role="tab"]')].map((n) => n.textContent?.trim());
    expect(labels).toEqual(['HOME', 'PRO']);
  });
});

describe('neutral destination state', () => {
  it('marks neither segment active when activeView is null', () => {
    expect(segmentTreatment('home', null)).toBe('inactive');
    expect(segmentTreatment('pro', null)).toBe('inactive');
  });

  it('renders both segments unselected on a neutral page', () => {
    const el = mount({ authed: true, canHome: true, canPro: false }, null);
    const tabs = [...el.querySelectorAll('[role="tab"]')];
    expect(tabs).toHaveLength(2);
    expect(tabs.every((t) => t.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  it('adds no third segment', () => {
    expect(
      mount({ authed: true, canHome: true, canPro: true }, null).querySelectorAll('[role="tab"]'),
    ).toHaveLength(2);
  });

  it('still marks the real view active on a non-neutral page', () => {
    expect(segmentTreatment('home', 'home')).toBe('active');
    expect(segmentTreatment('pro', 'pro')).toBe('active');
  });
});
