import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

describe('desktop Profile structure lock', () => {
  it('locks the normalized 2048 desktop composition to the raster target', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');

    expect(page).toContain('maxWidthClass="max-w-[1776px]"');
    expect(page).toContain('max-w-[1776px]');
    expect(page).toContain('data-testid="pro-plan-indicator"');
    expect(surface).toContain('2xl:w-[1761px]');
    expect(surface).toContain('2xl:grid-cols-[1062px_635px]');
    expect(surface).toContain('2xl:gap-16');
    expect(surface).toContain('2xl:ml-0.5');
    expect(surface).toContain('2xl:-mt-0.5');
    expect(surface).toContain('lg:h-[min(742px,calc(100dvh-210px))]');
  });

  it('anchors the compact Base action to the table controls without a permanent search field', () => {
    const builder = read('features', 'ingredient-builder', 'IngredientBuilder.tsx');
    expect(builder).toContain('data-testid="ingredient-add-toolbar"');
    expect(builder).toContain('data-testid="pro-recalc-state"');
    expect(builder).toContain('data-testid="pro-workbar-recalc"');
    expect(builder).toContain('2xl:grid-cols-[minmax(300px,1fr)_222px_260px_76px_44px]');
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
  });

  it('keeps the six Direction rows and Settings above aligned Nutrition and Cost cards', () => {
    const profile = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    expect(profile).toContain('data-profile-layout="2x2"');
    expect(profile).toContain('data-testid="profile-nutrition-card"');
    expect(profile).toContain('data-testid="profile-cost-card"');
    expect(profile).toContain('xl:grid-cols-[1.08fr_0.92fr]');
    expect(profile).toContain('2xl:grid-cols-[331px_273px]');
    expect(profile).toContain('2xl:h-[369px]');
    expect(profile).toContain('2xl:h-[371px]');
    expect(profile).toContain('2xl:h-[204px]');
    expect(profile).toContain('2xl:h-[206px]');
    expect(profile).toContain('NutritionCostProfileGrid');
  });

  it('offers the Main crown inline while preserving the existing role authority', () => {
    const row = read('features', 'ingredient-builder', 'IngredientRow.tsx');
    expect(row).toContain('data-testid={`row-main-toggle-${item.id}`}');
    expect(row).toContain("setRole(isMain ? 'standard' : 'main')");
    expect(row).toContain('aria-pressed={isMain}');
  });
});
