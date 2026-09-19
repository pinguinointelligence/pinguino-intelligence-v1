/** @vitest-environment jsdom */
/**
 * DESIGN V3.0 — correction VII, „GLOBAL HEADER … stale widoczny".
 *
 * „nagłówek zawsze u góry — nie odjeżdża z treścią, nie znika przy przewijaniu w dół …
 * Treść przewija się pod nim, ale pierwszy fragment strony i tytuły sekcji po przewinięciu
 * do nich nie chowają się pod nagłówkiem (np. `scroll-padding-top` = wysokość nagłówka)."
 *
 * SERVED WALK 2026-09-18 (staging 918bead6, phone 375×812): the HOME creator asked for the
 * pinned header — `HomeCreatorPage` passed `stickyHeader`, which puts Tailwind's `sticky`
 * on the row — but the header still scrolled away, measured at `position: relative`,
 * `top: -500` after a 500 px scroll. `.app-shell-header-row` and `.sticky` are both single
 * classes, so the later rule won on source order alone and the opt-in was decorative.
 *
 * OWNER 2026-09-18: „jeżeli ekran używa globalnego Gellatti headera, header jest pinned
 * domyślnie" — HOME, PRO, Shop, Receptury, Community, Konto and the rest of the user-facing
 * screens, with no per-page sticky hack. Excluded: the marketing landing page and the auth
 * modal (neither wears this header at all) and Admin, which opts out explicitly.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { AppShell } from './AppShell';

const read = (path: string) => readFileSync(resolve('src', path), 'utf8');
/* Judge declarations, not prose: the stylesheet discusses these selectors by name. */
const rules = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const block = (css: string, selector: string) => {
  const start = css.indexOf(`${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start) + 1);
};

const v21 = rules(read('styles/gellatti-v2-1.css'));
const shell = read('features/shell/AppShell.tsx');

describe('the pinned global header (correction VII)', () => {
  it('beats the row base rule wherever the shell pins', () => {
    // The base row stays `relative`, which is what the opt-out still gets.
    expect(block(v21, '.app-shell-header-row')).toMatch(/position:\s*relative/);
    // Two classes settle the cascade, so source order stops deciding it.
    expect(block(v21, '.app-shell-header-row.sticky')).toMatch(/position:\s*sticky/);
  });

  it('pins from the one shared header, and pins by DEFAULT', () => {
    expect(shell).toContain("pinnedHeader && 'sticky top-0 z-40 bg-paper'");
    expect(shell).toContain('pinnedHeader = true,');
    // The pinned header must be opaque — content scrolls UNDER it, not through it.
    expect(shell).toContain('bg-paper');
  });
});

/**
 * The owner asked for ONE authority, not a sticky hack per page. This walks every file
 * that mounts the shared shell and holds the exclusion list to exactly what the owner
 * named, so a new page cannot quietly opt itself out and Admin cannot quietly opt back in.
 */
const OPTED_OUT = ['pages/admin/AdminWorkspacePage.tsx'];
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [path] : [];
  });
}
const sourceFiles = walk(resolve('src'));

describe('every screen wearing the global header is pinned by default', () => {
  const mounts = sourceFiles.filter((path) => {
    const source = readFileSync(path, 'utf8');
    return /<AppShell[\s>]/.test(source) && !/\.test\.tsx$/.test(path);
  });

  it('finds the shell mounted by the surfaces this contract is about', () => {
    const paths = mounts.map((path) => relative(resolve('src'), path));
    // HOME, PRO, Receptury, the destination wrapper behind Shop / Community / Konto.
    for (const expected of [
      'pages/home/HomeCreatorPage.tsx',
      'pages/pro/ProWorkspacePage.tsx',
      'pages/recipes/MyRecipesPage.tsx',
      'components/shared/DestinationSurface.tsx',
      'pages/admin/AdminWorkspacePage.tsx',
    ]) {
      expect(paths).toContain(expected);
    }
  });

  it('lets only the owner-named exclusions opt out', () => {
    const optingOut = mounts
      .filter((path) => /pinnedHeader=\{false\}/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(resolve('src'), path));
    expect(optingOut.sort()).toEqual(OPTED_OUT);
  });

  it('never reintroduces a per-page sticky hack on the header row', () => {
    for (const path of mounts) {
      const source = readFileSync(path, 'utf8');
      expect(source, relative(resolve('src'), path)).not.toMatch(
        /app-shell-header-row[^'"]*sticky|sticky[^'"]*app-shell-header-row/,
      );
    }
  });
});

let host: HTMLDivElement;
let root: Root;
/* jsdom reports 0 for every box, so the header's height is staged — the numbers themselves
   are verified in the browser (65 px phone, 73 px at 1440). Restored after each test. */
const realRect = HTMLElement.prototype.getBoundingClientRect;
beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = function stagedRect(this: HTMLElement) {
    return { ...new DOMRect(), height: this.tagName === 'HEADER' ? 65 : 0 } as DOMRect;
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.documentElement.style.scrollPaddingTop = '';
  HTMLElement.prototype.getBoundingClientRect = realRect;
});

const mount = (pinnedHeader?: boolean) => {
  act(() => {
    root.render(
      <MemoryRouter>
        <AppShell pinnedHeader={pinnedHeader}>
          <p>body</p>
        </AppShell>
      </MemoryRouter>,
    );
  });
};

/** The wrapper Shop, Receptury, Community and Konto all wear. */
const mountDestination = (route: string) => {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[route]}>
        <DestinationSurface eyebrow="GELLATTI" title="Test" blurb="Test" bare>
          <p>body</p>
        </DestinationSurface>
      </MemoryRouter>,
    );
  });
};

const headerClasses = () => host.querySelector('header')?.className ?? '';

/**
 * The owner named HOME, PRO, Shop, Receptury and Community/Konto. HOME, PRO and
 * „Moje receptury" mount `AppShell` themselves and take the default; the other three
 * reach it through `DestinationSurface`. Both paths are RENDERED here, because a
 * duplicate or dropped prop is not a type error and only a render catches it.
 */
describe('the surfaces the owner named are pinned', () => {
  it('pins the shared shell when a page names nothing — HOME, PRO, Moje receptury', () => {
    mount();
    expect(headerClasses()).toContain('sticky');
    expect(headerClasses()).toContain('top-0');
    expect(headerClasses()).toContain('bg-paper');
  });

  for (const [surface, route] of [
    ['Shop', '/shop'],
    ['Receptury', '/recipes'],
    ['Community', '/community'],
    ['Konto', '/account'],
  ] as const) {
    it(`pins ${surface}, which reaches the shell through the destination surface`, () => {
      mountDestination(route);
      expect(headerClasses()).toContain('sticky');
      expect(headerClasses()).toContain('top-0');
    });
  }

  it('leaves the opt-out on the plain relative row', () => {
    mount(false);
    expect(headerClasses()).not.toContain('sticky');
  });
});

describe('section headings never hide under the pinned header', () => {
  it('reserves the measured header height as the page scroll padding', () => {
    mount(true);
    expect(host.querySelector('header')).not.toBeNull();
    expect(document.documentElement.style.scrollPaddingTop).toBe('65px');
  });

  it('leaves the page scroll padding alone when the header is not pinned', () => {
    mount(false);
    expect(document.documentElement.style.scrollPaddingTop).toBe('');
  });

  it('clears the reservation when the shell unmounts', () => {
    mount(true);
    act(() => root.unmount());
    root = createRoot(host);
    expect(document.documentElement.style.scrollPaddingTop).toBe('');
  });
});

/**
 * Correction XIII: a HOME sheet is „maks. wysokość = miejsce pod nagłówkiem". `homeLayer.css`
 * had to guess that room as a literal 64 px — already wrong at every measured breakpoint
 * (65 px phone, 69 px at 1024, 73 px at 1440) and wrong by the whole notch on a real phone,
 * where `env(safe-area-inset-top)` grows the row and the sheet slid under the header.
 */
describe('a HOME sheet stops below the header it must stop below', () => {
  it('publishes the measured header height as the sheet ceiling', () => {
    mount(true);
    expect(document.documentElement.style.getPropertyValue('--home-layer-top')).toBe('65px');
  });

  it('publishes it on every page, pinned header or not — the sheet is not HOME-only', () => {
    mount(false);
    expect(document.documentElement.style.getPropertyValue('--home-layer-top')).toBe('65px');
  });

  it('keeps the literal 64 px only as the stylesheet fallback', () => {
    const css = rules(read('components/ui/homeLayer.css'));
    expect(block(css, '.home-layer-panel')).toContain('var(--home-layer-top, 64px)');
  });

  it('drops the ceiling when the shell unmounts', () => {
    mount(true);
    act(() => root.unmount());
    root = createRoot(host);
    expect(document.documentElement.style.getPropertyValue('--home-layer-top')).toBe('');
  });
});
