/** @vitest-environment jsdom */
/**
 * DESIGN V3.0 — correction VII, „GLOBAL HEADER … stale widoczny".
 *
 * „nagłówek zawsze u góry — nie odjeżdża z treścią, nie znika przy przewijaniu w dół …
 * Treść przewija się pod nim, ale pierwszy fragment strony i tytuły sekcji po przewinięciu
 * do nich nie chowają się pod nagłówkiem (np. `scroll-padding-top` = wysokość nagłówka)."
 *
 * SERVED WALK 2026-09-18 (staging 918bead6, phone 375×812): the HOME creator asked for the
 * pinned header — `HomeCreatorPage` passes `stickyHeader`, which puts Tailwind's `sticky`
 * on the row — but the header still scrolled away, measured at `position: relative`,
 * `top: -500` after a 500 px scroll. `.app-shell-header-row` and `.sticky` are both single
 * classes, so the later rule won on source order alone and the opt-in was decorative.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  it('lets a page that asks for the pinned header beat the row base rule', () => {
    // The base row stays `relative` for every route that does NOT opt in.
    expect(block(v21, '.app-shell-header-row')).toMatch(/position:\s*relative/);
    // Two classes settle the cascade, so source order stops deciding it.
    expect(block(v21, '.app-shell-header-row.sticky')).toMatch(/position:\s*sticky/);
  });

  it('keeps the opt-in wired to the one shared header', () => {
    expect(shell).toContain("stickyHeader && 'sticky top-0 z-40 bg-paper'");
    // The pinned header must be opaque — content scrolls UNDER it, not through it.
    expect(shell).toContain('bg-paper');
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

const mount = (stickyHeader: boolean) => {
  act(() => {
    root.render(
      <MemoryRouter>
        <AppShell stickyHeader={stickyHeader}>
          <p>body</p>
        </AppShell>
      </MemoryRouter>,
    );
  });
};

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
