/** @vitest-environment jsdom */
/**
 * GLOBAL HEADER PARITY — owner contract, 2026-09-01.
 *
 * The header is ONE geometry for every audience and every page. Served measurement found
 * HOME on the flex branch and PRO on the grid branch, 46 px apart at 1440, with the
 * HOME|PRO switch rendering on neither surface.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HomeProSwitch } from '@/features/home-creator/ui/HomeProSwitch';
import { APP_HEADER_ROW, APP_PAGE_WORKSPACE } from '@/features/shell/shellGeometry';
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
    // SUPERSEDED, owner 2026-09-02 (option A). The two-track grid moved OFF the
    // header row into a centred, scaled band, so the hamburger, the wordmark and
    // the login keep the page's full width on EVERY route — measured 32 / 96 / 32
    // px identically on Shop and PRO — while HOME | PRO and the module strip stay
    // on the workbench column edge inside that band.
    expect(shell).toContain('APP_HEADER_CANVAS');
    expect(shell).toContain('xl:col-start-1 xl:row-start-1');
  });

  it('anchors non-workbench actions to the work column, never the viewport edge', () => {
    // The trailing group is now inside the centred band, still `ml-auto`.
    expect(shell).toContain('ml-auto flex min-w-0 items-center');
  });

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

describe('ONE page gutter — a page may not re-scope the global header', () => {
  /**
   * Served forensic, 2026-09-02. The authenticated PRO workbench sat at
   * hamburger x = 12 / logo x = 76 while every other surface sat at 28.8 / 92.8.
   * `.gellatti-pro-workbench` wraps the shell and redeclared the INHERITED
   * `--pro-page-gutter` as 24 px, so the one header row resolved 24 instead of
   * the global 57.6 at 1440. `w-[calc(100%-var(--pro-page-gutter))]` + `mx-auto`
   * makes the auto margin exactly `gutter / 2`, so the residual was
   * (57.6 - 24) / 2 = 16.8 px — the measured delta, to the pixel.
   *
   * The header therefore has ONE gutter authority: `:root` in `tokens.css`.
   * Any other stylesheet that declares the token can silently move the
   * hamburger, the wordmark and HOME | PRO on whatever pages it scopes.
   */
  // Comments in these files DISCUSS the token by name — this contract is about
  // declarations, so strip them first (a plain substring match reports the
  // explanatory comment below as an offender).
  const rules = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
  const declares = (css: string) => /--pro-page-gutter\s*:/.test(rules(css));

  it('declares the gutter only at :root, in tokens.css', () => {
    const tokens = rules(readFileSync('src/styles/tokens.css', 'utf8'));
    const declarations = tokens.match(/--pro-page-gutter\s*:/g) ?? [];
    expect(declarations).toHaveLength(1);
    expect(tokens).toContain('--pro-page-gutter: clamp(2rem, 4vw, 4rem)');
  });

  it('lets no other stylesheet redeclare it', () => {
    const offenders = readdirSync('src/styles')
      .filter((file) => file.endsWith('.css') && file !== 'tokens.css')
      .filter((file) => declares(readFileSync(`src/styles/${file}`, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('keeps the workbench scope free of it — that scope wraps the shell', () => {
    const v21 = rules(readFileSync('src/styles/gellatti-v2-1.css', 'utf8'));
    const scope = v21.slice(v21.indexOf('.gellatti-pro-workbench {'));
    expect(scope.slice(0, scope.indexOf('}'))).not.toMatch(/--pro-page-gutter\s*:/);
  });

  it('gives the workbench actions box no mobile gap of its own', () => {
    /**
     * Served, 2026-09-02: the authenticated workbench's switch sat exactly ONE
     * left-cluster gap right of every destination's — +12 px at 390 (`gap-3`)
     * and +20 px at 768 (`sm:gap-5`). Below `xl` every child of `ProTopActions`
     * is itself hidden, so the box rendered at zero width — and a zero-width
     * FLEX ITEM still takes a gap. It must not be a flex item down there.
     */
    expect(shell).toContain('<div className="hidden min-w-0 items-center xl:flex">{actions}</div>');
  });

  it('still resolves the header and the workspace through that one token', () => {
    expect(APP_HEADER_ROW).toContain('xl:w-[calc(100%-var(--pro-page-gutter))]');
    expect(APP_PAGE_WORKSPACE).toContain('xl:w-[calc(100%-var(--pro-page-gutter))]');
    // mx-auto is what turns the token into the page origin: margin = gutter / 2.
    expect(APP_HEADER_ROW).toContain('mx-auto');
  });
});

describe('the header canvas cannot silently swallow its own controls', () => {
  const shell = readFileSync(resolve(import.meta.dirname, 'AppShell.tsx'), 'utf8');
  const geometry = readFileSync(resolve(import.meta.dirname, 'shellGeometry.ts'), 'utf8');

  /* OWNER QA 2026-09-03 — the regression this locks out.

     The header canvas is `pointer-events-none` so its transparent band cannot
     intercept clicks meant for the page beneath. That makes every control
     placed on it inert until it opts back in. HOME | PRO opted in; the module
     tab strip did not, so Receptura / Monitor / Produkcja / Etykieta rendered
     perfectly and were completely dead to the mouse on every desktop PRO page.
     Measured before the fix: `pointer-events: none` on each tab, and
     `elementFromPoint` at a tab's own centre returning the HEADER.

     Nothing about the strip's appearance changed when it broke, and no test
     looked at pointer events, which is exactly why it reached staging. */
  it('every child group placed on the canvas re-enables pointer events', () => {
    expect(geometry).toContain('xl:pointer-events-none');
    const canvasBlock = shell.slice(shell.indexOf('APP_HEADER_CANVAS'));
    const region = canvasBlock.slice(0, canvasBlock.indexOf('</header>'));
    // The two groups the canvas carries: the actions/switch column, and the
    // workbench module strip. Both must opt in.
    expect((region.match(/pointer-events-auto/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(shell).toContain('data-testid="app-header-workbench-chrome"');
    expect(shell).toMatch(
      /pointer-events-auto contents"\s*data-testid="app-header-workbench-chrome"/,
    );
  });
});
