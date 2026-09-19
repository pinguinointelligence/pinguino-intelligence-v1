/** @vitest-environment jsdom */
/**
 * DESIGN V3.0 — correction VII, „GLOBAL HEADER … Kierunek HOME/PRO (zaakceptowany)".
 *
 * „przełącznik zmniejszony i odchudzony do skali przycisku konta … Zmieniają się wysokość
 * kapsuły, wielkość napisów, odstępy, proporcje czarnego zaznaczenia i delikatność linii.
 * Zostają obie opcje, jednoznaczne zaznaczenie aktywnej, działanie (`HomeProSwitch`) i
 * wygodny dotyk. Bez nowych kolorów, cieni i mocniejszych obwódek."
 *
 * Measurements the design states, and the convention it states them in: the capsule is
 * measured whole, so 1 px border + 2 px padding + segment.
 *
 *   phone           capsule 28  segment 22  10 px / 600  0.06 em  sides 8 px
 *   iPad + desktop  capsule 30  segment 24  10.5 px / 600  0.07 em  sides 10 px
 *   line #ebe6dd · active segment black · touch target 44 px
 *
 * The design names the geometry it replaces — „dotychczasowy przełącznik aplikacji na
 * desktopie miał 38 px wysokości i 11 px pogrubione napisy z odstępem 0,14 em" — which is
 * exactly 1 + 2 + 32 + 2 + 1 from the old `sm:min-h-[32px]`. That arithmetic is what makes
 * the two numbers comparable, so this file pins the segment heights the capsule is built
 * from rather than a rendered pixel height jsdom does not compute.
 *
 * What this file does NOT touch: `HomeProSwitch` behaviour. Navigation, the unsaved-guard
 * prompt, entitlement handling and the "exactly one switch per route" contract keep their
 * own tests (`singleGlobalSwitch.test.tsx`, `unsavedGuard.runtime.test.tsx`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HomeProSwitch } from '@/features/home-creator/ui/HomeProSwitch';
import type { ViewEntitlement } from '@/features/home-creator/homeViewMode';

/** A signed-in PRO subscriber: both segments render and both are reachable. */
const PRO: ViewEntitlement = { authed: true, canHome: true, canPro: true };

const source = readFileSync(
  resolve('src/features/home-creator/ui/HomeProSwitch.tsx'),
  'utf8',
);
/**
 * Judge declarations, not prose (the convention `stickyGlobalHeader.test.tsx` uses): the
 * component's own comments name the geometry they replaced, so a negative assertion read
 * against the raw file would fail on the explanation rather than on the code.
 */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mount = (activeView: 'home' | 'pro' | null = 'pro') =>
  act(() => {
    root.render(
      <MemoryRouter>
        <HomeProSwitch entitlement={PRO} activeView={activeView} />
      </MemoryRouter>,
    );
  });

const capsule = () => host.querySelector<HTMLElement>('[data-testid="home-pro-switch"]')!;
const segment = (name: 'home' | 'pro') =>
  host.querySelector<HTMLElement>(`[data-testid="home-pro-switch-${name}"]`)!;

describe('the compact HOME | PRO switch (correction VII)', () => {
  it('sizes the phone segment to 22 px and the sm segment to 24 px — capsule 28 and 30', () => {
    // The capsule carries 1 px of border and 2 px of padding on each side, so the segment
    // heights below are the design's 28 and 30 minus that frame.
    expect(source).toContain("'h-[22px] px-2 text-[10px] tracking-[0.06em]'");
    expect(source).toContain("'sm:h-[24px] sm:px-2.5 sm:text-[10.5px] sm:tracking-[0.07em]'");
    // the frame the arithmetic depends on
    expect(source).toContain('rounded-full border p-0.5');
  });

  it('drops the old desktop geometry the design names (38 px, bold 11 px, 0.14 em)', () => {
    expect(code).not.toContain('min-h-[26px]');
    expect(code).not.toContain('sm:min-h-[32px]');
    expect(code).not.toContain('sm:text-[11px]');
    expect(code).not.toContain('tracking-[0.14em]');
    expect(code).not.toContain('font-bold');
  });

  it('writes the labels at weight 600, not bold', () => {
    expect(source).toContain("'rounded-full font-semibold transition-colors'");
  });

  it('gives each segment a 44 px touch target from an invisible vertical extension', () => {
    // 22 + 11 + 11 and 24 + 10 + 10 both land on 44.
    expect(source).toContain("after:absolute after:inset-x-0 after:-inset-y-[11px]");
    expect(source).toContain("'sm:after:-inset-y-[10px]'");
    // an absolute pseudo-element needs a positioned segment
    expect(source).toContain("'relative'");
    // …and the capsule must not clip it away
    expect(code).not.toContain('overflow-hidden');
  });

  it('uses the delicate #ebe6dd line, no shadow and no heavier border', () => {
    expect(source).toContain("const SWITCH_LINE = '#ebe6dd'");
    expect(source).toContain('borderColor: SWITCH_LINE');
    expect(code).not.toContain('--g-line-strong');
    expect(code).not.toMatch(/shadow-/);
    expect(code).not.toContain('border-2');
  });

  it('still renders both options, marks the active one black, and keeps the test ids', async () => {
    await mount('pro');
    expect(capsule()).not.toBeNull();
    expect(segment('home')).not.toBeNull();
    expect(segment('pro')).not.toBeNull();
    expect(segment('pro').getAttribute('aria-selected')).toBe('true');
    expect(segment('home').getAttribute('aria-selected')).toBe('false');
    // the active treatment is the black fill; the inactive one paints no background
    expect(segment('pro').style.background).not.toBe('transparent');
    expect(segment('home').style.background).toBe('transparent');
  });

  it('reverses cleanly when HOME is the active view, and neutral marks neither', async () => {
    await mount('home');
    expect(segment('home').getAttribute('aria-selected')).toBe('true');
    expect(segment('pro').getAttribute('aria-selected')).toBe('false');

    await mount(null);
    expect(capsule().getAttribute('data-neutral')).toBe('true');
    expect(segment('home').getAttribute('aria-selected')).toBe('false');
    expect(segment('pro').getAttribute('aria-selected')).toBe('false');
  });
});
