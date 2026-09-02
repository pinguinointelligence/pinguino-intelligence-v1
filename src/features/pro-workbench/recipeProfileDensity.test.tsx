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

    // OWNER FROZEN PRO VISUAL supersedes the V2.1 boxed-detent band. Measured
    // from the frozen authority: a 4 px rail, white 2x8 ticks at 0/25/50/75/100,
    // a 16 px thumb in a white ring, and the numerals in their own row BELOW
    // the track instead of inside the mark. The state model is untouched —
    // five detents, radiogroup and arrow keys are all still asserted elsewhere.
    expect(axes).not.toContain('xl:min-h-[66px]');
    expect(axes).toContain('[&+&]:border-t [&+&]:border-[var(--g-line)]');

    expect(axes).toContain('absolute inset-x-0 top-[11px] h-1 rounded-full bg-[var(--g-rail-track)]');
    expect(axes).toContain("`${((detent + 2) / 4) * 100}%`");
    expect(axes).toContain('top-[9px] -ml-px h-2 w-0.5');
    expect(axes).toContain('top-[5px] -ml-2 size-4 rounded-full shadow-[0_0_0_3px_#fff]');
    // A 26 px target on a 16 px mark: the thing you press is bigger than the
    // thing you see, which is the opposite of the old 28 px numeral button.
    expect(axes).toContain('-ml-[13px] size-[26px]');
    // The numerals live in their own row and the chosen one is ink, not white
    // on orange (see directionDetentContrast.test.ts for the ratios).
    expect(axes).toContain("'font-bold text-[var(--g-ink)]'");

    // The chosen position is still the one orange mark in the panel.
    expect((axes.match(/bg-\[#f58a07\]/g) ?? []).length).toBe(1);
    // The section carries no card of its own; the heading is a quiet eyebrow
    // closed by a hairline that runs to the column edge.
    expect(axes).not.toContain('rounded-[10px] border border-[var(--g-line)] bg-white');
    expect(axes).toContain('tracking-[0.16em] text-[var(--g-text-muted)] uppercase');
    expect(axes).toContain('h-px flex-1 bg-[var(--g-line)]');
  });

  it('lays Settings out as ONE three-row, two-column grid of 46 px fields', () => {
    const settings = read('WorkbenchSettingsLine.tsx');
    const theme = read('../../styles/theme-pro-light.css');

    // Six cells in the approved reading order: confirmation/type, then
    // machine/serving, then batch/mode. Batch and Tryb are ordinary cells of
    // the same grid — never a separate three-row sub-grid pinned to row 1.
    expect(settings).toContain('profile-settings-grid grid grid-cols-2 items-stretch gap-2');
    // Was 2 — batch card + strategy card. The batch card is removed with its
    // field (owner authority 2026-09-02), so the mode card is the only one left.
    expect(settings.match(/data-settings-final-card=/g)).toHaveLength(1);
    expect(settings.match(/data-settings-label=/g)).toHaveLength(1);
    expect(settings.match(/data-settings-control=/g)).toHaveLength(1);
    // SUPERSEDED, owner authority 2026-09-02 (final Settings contract): the
    // order-5 cell was the target-batch card and is removed with the field.
    expect(settings).not.toContain('order-5');
    // SUPERSEDED, owner authority 2026-09-02 (approved desktop PDF §5): the
    // sixth cell was the duplicated `Baza receptury` readout and is REMOVED.
    // The grid is now the four approved fields plus the batch row; nothing may
    // reintroduce a read-only sixth tile.
    expect(settings).not.toContain('order-6');
    expect(settings).not.toContain('profile-settings-base-readout');
    expect(settings).toContain('lg:h-[46px]');
    expect(settings.includes('profile-settings-final-row')).toBe(false);
    expect(theme.includes('grid-template-rows: subgrid')).toBe(false);

    // The confirmation control is still GRAPHITE and still never orange.
    // SUPERSEDED, owner authority 2026-09-02 (approved desktop PDF §8): it now
    // lives INSIDE expanded Settings as „Potwierdź zmiany", to the right of the
    // permanent „Zapisz jako domyślne", and it is a filled graphite pill again
    // because in that footer it is the one primary — it no longer sits in the
    // band header competing with Przelicz. What is still protected: graphite,
    // never the accent.
    expect(settings).toContain('bg-[var(--g-graphite)] px-5');
    expect(settings).toContain('data-testid="profile-settings-save-default"');
    expect(settings.includes('bg-[#f58a07] px-3 text-xs font-semibold text-white')).toBe(false);
    // ...and the panel itself no longer carries the ivory card. Settings is a
    // band in the display column; only a real CONFLICT still takes a surface.
    expect(settings).not.toContain("'border-[var(--g-line)] bg-[var(--g-ivory)]'");
    expect(settings).toContain("'border-0 bg-transparent p-0'");
    expect(settings).toContain('border-status-error/45 bg-status-error/[0.035]');
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
