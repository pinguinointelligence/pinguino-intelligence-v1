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

    /* OWNER AUTHORITY 2026-09-03 supersedes the rail. The approved reference
       shows five DOTS with the segment between the neutral centre and the
       chosen detent filled — a bipolar instrument that says which way you went
       and how far. The old form was a continuous 4 px rail with white ticks
       punched through it and a numeral row underneath, which read as a volume
       slider and cost four lines per axis. The state model is untouched: five
       detents, radiogroup and arrow keys are all still asserted elsewhere. */
    expect(axes).not.toContain('xl:min-h-[66px]');
    expect(axes).not.toContain('absolute inset-x-0 top-[11px] h-1 rounded-full');
    expect(axes).toContain("`${((detent + 2) / 4) * 100}%`");
    /* OWNER 2026-09-03: the dots are a RAMP, not five identical marks — the
       size is what tells you which way the axis runs, so it is computed per
       detent rather than fixed in a class. */
    expect(axes).toContain('const DOT_PX = [5, 6.5, 8, 9.5, 11] as const');
    expect(axes).toContain('const THUMB_PX = [13, 14.5, 16, 17.5, 19] as const');
    expect(axes).toContain('width: d, height: d, marginLeft: -d / 2, top: 13 - d / 2');
    // Mirrored for Twardość, where the engine runs soft -> firm left to right.
    expect(axes).toContain('ascending ? detent + 2 : 2 - detent');
    expect(axes).toContain("ascending={axis === 'sweetness'}");
    // The fill runs centre → position, never end → position.
    /* OWNER 2026-09-03: the detents are CONNECTED. Five loose dots stopped
       reading as one instrument, and the orange stroke stopped reading as a
       segment of anything. The rail is a shade lighter than the dots so the
       positions still stand out on it, and it is rendered FIRST so the fill,
       the neutral ring and the thumb all paint over it. */
    const railAt = axes.indexOf('absolute inset-x-0 top-[11.5px] h-[3px] rounded-full bg-[var(--g-line)]');
    expect(railAt).toBeGreaterThan(-1);
    expect(railAt).toBeLessThan(axes.indexOf('style={{ left: fillLeft, width: fillWidth }}'));
    expect(railAt).toBeLessThan(axes.indexOf('left: at(position),'));
    expect(axes).toContain("const fillLeft = position >= 0 ? '50%' : at(position);");
    expect(axes).toContain('const fillWidth = `${Math.abs(position) * 25}%`;');
    expect(axes).toContain("rounded-full shadow-[0_0_0_3px_#fff] transition-[left,width,height");
    // A 26 px target on a 16 px mark: the thing you press is bigger than the
    // thing you see, which is the opposite of the old 28 px numeral button.
    expect(axes).toContain('-ml-[13px] size-[26px]');
    /* One row per axis: name on the left, track on the right. `contents` puts
       both rows in the SAME grid, so the two tracks share one x under any
       translation — two nested grids would align only in Polish. */
    expect(axes).toContain('className="contents"');
    expect(axes).toContain('grid-cols-[minmax(104px,max-content)_1fr]');

    /* The accent is spent on the CHOSEN POSITION and on nothing else. It now
       paints two elements — the fill and the thumb — but they are one
       continuous mark: the fill ends exactly where the thumb sits, so what a
       reader sees is a single orange stroke from neutral to the choice. Both
       uses are paired with the blocked-axis tint, which is how the assertion
       below proves neither of them is decoration somewhere else. */
    const accent = axes.match(/bg-\[#f58a07\]/g) ?? [];
    const blocked = axes.match(/bg-\[#fcd6a8\]/g) ?? [];
    expect(accent.length).toBe(2);
    expect(blocked.length).toBe(accent.length);
    /* Every accent use is REACHED THROUGH the disabled ternary, so neither can
       become decoration that survives on a blocked axis. Matched as a pairing
       rather than as one literal string: the thumb branch also carries the
       blocked outline, and asserting the exact characters would fail the next
       time that branch gains a class it should be allowed to gain. */
    for (const m of axes.matchAll(/bg-\[#f58a07\]/g)) {
      const before = axes.slice(Math.max(0, m.index - 220), m.index);
      expect(before, 'accent not guarded by the disabled ternary').toMatch(/disabled\s*\?/);
      expect(before).toContain('#fcd6a8');
    }
    /* The section is a BOX with a notched legend (owner reference 2026-09-03),
       not an eyebrow closed by a hairline running to the column edge. */
    expect(axes).not.toContain('rounded-[10px] border border-[var(--g-line)] bg-white');
    expect(axes).not.toContain('h-px flex-1 bg-[var(--g-line)]');
    expect(axes).toContain('pro-legend-box');
    expect(axes).toContain('data-band-legend');
    expect(axes).toContain('tracking-[0.16em] text-[var(--g-text-muted)] uppercase');
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
    /* OWNER AUTHORITY 2026-09-03: Settings is a BOX whose label is notched
       into its own top border — the same make as DOSTOSUJ RECEPTURĘ above and
       WIEDZA below. It was a band (eyebrow + hairline) wrapped around a second
       bordered button, i.e. two nested rectangles for one group. The ivory
       card it replaced earlier stays refused, and a real CONFLICT still
       recolours the box rather than adding another surface. */
    expect(settings).not.toContain("'border-[var(--g-line)] bg-[var(--g-ivory)]'");
    expect(settings).not.toContain('data-band-eyebrow');
    expect(settings).toContain('pro-legend-box');
    expect(settings).toContain('data-band-legend');
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
