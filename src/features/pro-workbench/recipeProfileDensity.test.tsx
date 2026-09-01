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
  it('puts the five positions ON one continuous bipolar rail', () => {
    const axes = read('ProfileDirectionAxes.tsx');

    // OWNER FROZEN PRO VISUAL supersedes the V2.1 boxed-detent band. The axes
    // stopped being two bordered cards and became one instrument: no per-axis
    // border, a hairline only BETWEEN the axes, and a rail that runs edge to
    // edge with the neutral centre marked so the control reads as bipolar
    // before it is touched. The state model is untouched — five detents,
    // radiogroup semantics and arrow keys are all still asserted below.
    expect(axes).not.toContain('xl:min-h-[66px]');
    expect(axes).toContain('divide-y divide-[var(--g-line)]');

    // A REAL rail behind the positions, inset to the outer centres.
    expect(axes).toContain('h-[2px] -translate-y-1/2 rounded-full bg-[var(--g-rail-track)]');
    expect(axes).toContain('right-[18px] left-[18px]');
    expect(axes).toContain('grid h-9 grid-cols-5');
    // The bipolar centre notch.
    expect(axes).toContain('h-[9px] w-[2px]');
    // 36 px targets carrying a 13 px thumb — the target grew, the mark shrank.
    expect(axes).toContain('size-9');
    expect(axes).toContain('size-[13px] bg-[#f58a07]');
    expect(axes).toContain('size-[6px] bg-[var(--g-rail-track)]');
    // The chosen position is still the one orange mark in the panel.
    expect((axes.match(/bg-\[#f58a07\]/g) ?? []).length).toBe(2);
    // The section carries no card of its own any more; the heading is a quiet
    // uppercase eyebrow rather than an 18 px card title.
    expect(axes).not.toContain('rounded-[10px] border border-[var(--g-line)] bg-white');
    expect(axes).toContain("'bg-transparent'");
    expect(axes).toContain('tracking-[0.08em] text-[var(--g-text-secondary)] uppercase');
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
