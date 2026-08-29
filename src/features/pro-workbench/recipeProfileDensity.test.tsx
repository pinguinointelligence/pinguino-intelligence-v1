/**
 * Recipe profile visual density contract — GELLATTI V2.1.
 *
 * The numbers below are MEASURED from the owner-approved interactive preview
 * (`gellatti-global-page-preview-gate-20260828-v2-1`) at its 1440 × 900
 * reference viewport, not chosen here. The contract exists because an earlier
 * density pass silently applied only part of its own edits: the grid changed,
 * the controls did not, and the served build kept the old geometry. A
 * source-level contract makes that failure impossible to repeat unnoticed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(resolve(import.meta.dirname, file), 'utf8');

describe('Recipe profile visual density contract', () => {
  it('puts the five detents ON one rail, not five detached circles', () => {
    const axes = read('ProfileDirectionAxes.tsx');

    // The approved axis band: 66 px, one hairline, 9 px corner.
    expect(axes).toContain(
      'className="rounded-[9px] border border-[var(--g-line)] bg-transparent px-2.5 py-2.5 xl:min-h-[66px]"',
    );
    // A REAL rail behind the detents (owner §12), inset to the outer centres.
    expect(axes).toContain('h-[2px] -translate-y-1/2 bg-[var(--g-rail-track)]');
    expect(axes).toContain('right-[14px] left-[14px]');
    expect(axes).toContain('grid h-7 grid-cols-5');
    // 28 px detents on a 272 px scale.
    expect(axes).toContain('size-7');
    expect(axes).toContain(
      'min-[520px]:grid-cols-[minmax(86px,1fr)_minmax(0,272px)_minmax(86px,1fr)]',
    );
    // The active detent is the one orange mark in the panel.
    expect(axes).toContain("'border-[#f58a07] bg-[#f58a07] text-white'");
    // The card itself: 10 px corner, one hairline, 18 px title.
    expect(axes).toContain(
      "'rounded-[10px] border border-[var(--g-line)] bg-white px-4 py-4 shadow-none'",
    );
    expect(axes).toContain('text-[18px] leading-[20px] font-bold');
  });

  it('lays Settings out as ONE three-row, two-column grid of 46 px fields', () => {
    const settings = read('WorkbenchSettingsLine.tsx');
    const theme = read('../../styles/theme-pro-light.css');

    // Six cells in the approved reading order: confirmation/type, then
    // machine/serving, then batch/mode. Batch and Tryb are ordinary cells of
    // the same grid — never a separate three-row sub-grid pinned to row 1.
    expect(settings).toContain('profile-settings-grid grid grid-cols-2 items-stretch gap-2');
    expect(settings.match(/data-settings-final-card=/g)).toHaveLength(2);
    expect(settings.match(/data-settings-label=/g)).toHaveLength(2);
    expect(settings.match(/data-settings-control=/g)).toHaveLength(2);
    expect(settings).toContain(
      "'order-5 lg:flex lg:h-[46px] lg:flex-col lg:justify-center lg:py-0'",
    );
    expect(settings).toContain('order-6');
    expect(settings).toContain('lg:h-[46px]');
    expect(settings.includes('profile-settings-final-row')).toBe(false);
    expect(theme.includes('grid-template-rows: subgrid')).toBe(false);

    // The approved confirmation control is GRAPHITE, not orange (owner §13),
    // and the panel itself is the ivory Settings surface.
    expect(settings).toContain('bg-[var(--g-graphite)]');
    expect(settings.includes('bg-[#f58a07] px-3 text-xs font-semibold text-white')).toBe(false);
    expect(settings).toContain("'border-[var(--g-line)] bg-[var(--g-ivory)]'");
  });

  it('keeps the Monitor row on ONE line at the approved 520 px display column', () => {
    const theme = read('../../styles/theme-pro-light.css');

    // icon | metric | badge | rail | fixed value | chevron (owner §16).
    expect(theme).toContain('grid-template-columns: 30px minmax(0, 1fr) 46px 114px 96px 14px;');
    expect(theme).toContain('min-width: 96px;');
    // The two-row reflow belongs to the phone sheet, not to the 520 px column.
    expect(theme).toContain('@container right-pane (max-width: 420px)');
    expect(theme.includes('@container right-pane (max-width: 540px)')).toBe(false);
  });

  it('keeps the same Recipe profile surface reachable from the mobile cockpit', () => {
    const surface = read('../studio/StudioEngineSurface.tsx');

    expect(surface).toContain('data-testid="mobile-cockpit-sheet"');
    expect(surface.match(/<RecipeProfilePanel/g)).toHaveLength(2);
    expect(surface).toContain("setMobileCockpitState({ activeTab: 'profile', open: true })");
  });
});
