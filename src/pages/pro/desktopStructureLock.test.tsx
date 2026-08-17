import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mobileProductPickerRect } from '@/features/ingredient-builder/productPickerViewport';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

describe('responsive Pro workbench structure', () => {
  it('keeps the premium desktop composition fluid instead of locking it to one raster', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');

    expect(page).toContain('maxWidthClass="max-w-[1776px]"');
    expect(page).toContain('max-w-[1776px]');
    expect(page).toContain('data-testid="pro-plan-indicator"');
    expect(page).toContain('xl:w-[calc(100%-var(--pro-page-gutter))]');
    expect(surface).toContain('xl:grid-cols-[minmax(0,1.62fr)_minmax(360px,1fr)]');
    expect(surface).toContain('xl:gap-[var(--pro-workbench-gap)]');
    expect(surface).toContain('xl:max-h-[var(--pro-workbench-body-max)]');
    expect(surface).not.toContain('xl:flex-none');
    expect(surface).not.toContain('2xl:w-[1761px]');
    expect(surface).not.toContain('2xl:grid-cols-[1062px_635px]');
  });

  it('anchors the compact Base action to the table controls without a permanent search field', () => {
    const builder = read('features', 'ingredient-builder', 'IngredientBuilder.tsx');
    expect(builder).toContain('data-testid="ingredient-add-toolbar"');
    expect(builder).toContain('data-testid="pro-recalc-state"');
    expect(builder).toContain('data-testid="pro-workbar-recalc"');
    expect(builder).toContain(
      'md:grid-cols-[minmax(180px,1.5fr)_minmax(174px,.85fr)_minmax(202px,1fr)_96px_44px]',
    );
    expect(builder).not.toContain('2xl:grid-cols-[minmax(300px,1fr)_222px_260px_76px_44px]');
    expect(builder).not.toContain('placeholder="Szukaj skÅ‚adnikÃ³w');
  });

  it('uses the exact anchored 499 by 480 picker with a fixed search/footer and internal results scroll', () => {
    const picker = read('features', 'ingredient-builder', 'ProductPickerPopover.tsx');
    expect(picker).toContain('useLayoutEffect');
    expect(picker).toContain('data-picker-position');
    expect(picker).toContain('DESKTOP_PICKER_WIDTH = 499');
    expect(picker).toContain('DESKTOP_PICKER_HEIGHT = 480');
    expect(picker).toContain('DESKTOP_PICKER_GAP = 12');
    expect(picker).toContain('data-testid="product-picker-clear"');
    expect(picker).toContain('product-picker-results h-full overflow-y-auto');
    expect(picker).toContain('left: trigger.left');
    expect(picker).toContain('const top = trigger.bottom + DESKTOP_PICKER_GAP');
    expect(picker).toContain("window.matchMedia('(min-width: 1280px)')");
    expect(picker).toContain(
      "data-picker-position={anchored ? 'anchored' : 'keyboard-safe-sheet'}",
    );
    expect(picker).toContain("window.visualViewport?.addEventListener('resize', updatePosition)");
  });

  it('keeps the mobile picker inside the visual viewport when a software keyboard opens', () => {
    expect(
      mobileProductPickerRect({
        innerWidth: 390,
        innerHeight: 844,
        visualHeight: 410,
        visualOffsetTop: 0,
      }),
    ).toEqual({ left: 8, top: 8, width: 374, height: 394, bottom: 442 });
    expect(
      mobileProductPickerRect({
        innerWidth: 390,
        innerHeight: 844,
        visualHeight: 410,
        visualOffsetTop: 80,
      }),
    ).toEqual({ left: 8, top: 88, width: 374, height: 394, bottom: 362 });
    expect(
      mobileProductPickerRect({
        innerWidth: 844,
        innerHeight: 390,
        visualWidth: 620,
        visualHeight: 310,
        visualOffsetLeft: 112,
        visualOffsetTop: 0,
      }),
    ).toEqual({ left: 120, top: 8, width: 604, height: 294, bottom: 88 });
    expect(
      mobileProductPickerRect({
        innerWidth: 390,
        innerHeight: 844,
        visualHeight: 120,
        visualOffsetTop: 200,
      }),
    ).toEqual({ left: 8, top: 208, width: 374, height: 104, bottom: 532 });
  });

  it('keeps the six Direction rows and Settings above aligned Nutrition and Cost cards', () => {
    const profile = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    expect(profile).toContain('data-profile-layout="2x2"');
    expect(profile).toContain('data-testid="profile-nutrition-card"');
    expect(profile).toContain('data-testid="profile-cost-card"');
    expect(profile).toContain('2xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]');
    expect(profile).not.toContain('2xl:grid-cols-[331px_273px]');
    expect(profile).not.toContain('2xl:h-[369px]');
    expect(profile).not.toContain('2xl:h-[371px]');
    expect(profile).not.toContain('2xl:h-[204px]');
    expect(profile).not.toContain('2xl:h-[206px]');
    expect(profile).toContain('NutritionCostProfileGrid');
  });

  it('offers the Main crown inline while preserving the existing role authority', () => {
    const row = read('features', 'ingredient-builder', 'IngredientRow.tsx');
    expect(row).toContain('data-testid={`row-main-toggle-${item.id}`}');
    expect(row).toContain("setRole(isMain ? 'standard' : 'main')");
    expect(row).toContain('aria-pressed={isMain}');
  });
});
