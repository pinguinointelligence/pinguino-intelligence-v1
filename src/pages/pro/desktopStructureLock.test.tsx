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
    const shell = read('features', 'shell', 'AppShell.tsx');
    // The page origin / gutter / width contract now lives in ONE shared module,
    // so every authenticated screen measures from the Production master.
    const geometry = read('features', 'shell', 'shellGeometry.ts');

    expect(page).toContain('maxWidthClass="max-w-[1776px]"');
    expect(page).toContain('max-w-[1776px]');
    expect(page).toContain('data-testid="pro-plan-indicator"');
    expect(page).toContain('xl:w-[calc(100%-var(--pro-page-gutter))]');
    // V2.1 §8: the strip is anchored by the ONE shared display-column recipe.
    expect(page).toContain('DESKTOP_TAB_STRIP');
    expect(geometry).toContain('xl:w-[calc(100%-var(--pro-page-gutter))]');
    expect(geometry).toContain('xl:px-0');
    expect(geometry).toContain("APP_SHELL_MAX_WIDTH_CLASS = 'max-w-[1776px]'");
    expect(shell).toContain('APP_HEADER_ROW');
    // V2.1 §8: ONE shared split, reused by the header row and the body, whose
    // display track is an explicit length so the tab strip cannot drift.
    expect(shell).toContain('DESKTOP_WORKBENCH_COLUMNS');
    expect(surface).toContain('DESKTOP_WORKBENCH_COLUMNS');
    expect(surface).toContain('xl:grid xl:h-full');
    expect(surface).not.toContain('pro-workbench-body-max');
    expect(surface).not.toContain('xl:flex-none');
    expect(surface).not.toContain('2xl:w-[1761px]');
    expect(surface).not.toContain('2xl:grid-cols-[1062px_635px]');
  });

  it('anchors one recipe action dock beside the Base and Topping pickers', () => {
    const builder = read('features', 'ingredient-builder', 'IngredientBuilder.tsx');
    expect(builder).toContain('data-testid="ingredient-add-slot"');
    expect(builder).toContain('data-testid="ingredient-action-slot"');
    expect(builder).toContain('{recipeActionDock}');
    expect(builder).not.toContain('data-testid="ingredient-add-toolbar"');
    expect(builder).not.toContain('2xl:grid-cols-[minmax(300px,1fr)_222px_260px_76px_44px]');
    expect(builder).not.toContain('placeholder="Szukaj skÅ‚adnikÃ³w');
  });

  it('uses the full opaque editor-pane picker with fixed search/footer and internal results scroll', () => {
    const picker = read('features', 'ingredient-builder', 'ProductPickerPopover.tsx');
    expect(picker).toContain('useLayoutEffect');
    expect(picker).toContain('data-picker-position');
    expect(picker).toContain('\'[data-testid="workbench-editor-pane"]\'');
    expect(picker).toContain('data-testid="product-picker-clear"');
    expect(picker).toContain('product-picker-results h-full overflow-y-auto');
    expect(picker).toContain('left: editor.left');
    expect(picker).toContain('const top = Math.max(84, editor.top)');
    expect(picker).toContain('width: editor.width');
    expect(picker).toContain('height,');
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

  it('keeps two approved Direction rows and Settings above the collapsed Nutrition/Cost summary', () => {
    const profile = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    expect(profile).toContain('data-profile-layout="stacked"');
    expect(profile).toContain('data-testid="profile-nutrition-card"');
    expect(profile).toContain('data-testid="profile-cost-card"');
    expect(profile).toContain('data-testid="profile-nutrition-cost-summary"');
    expect(profile).not.toContain('2xl:grid-cols-[331px_273px]');
    expect(profile).not.toContain('2xl:h-[369px]');
    expect(profile).not.toContain('2xl:h-[371px]');
    expect(profile).not.toContain('2xl:h-[204px]');
    expect(profile).not.toContain('2xl:h-[206px]');
    expect(profile).toContain('NutritionCostProfileGrid');
  });

  it('offers the Crown trigger and Main badge in one fixed slot while preserving role authority', () => {
    const row = read('features', 'ingredient-builder', 'IngredientRow.tsx');
    expect(row).toContain('data-testid={`row-main-slot-${item.id}`}');
    expect(row).toContain('testId={`row-main-trigger-${item.id}`}');
    expect(row).toContain('testId={`row-main-badge-${item.id}`}');
    expect(row).toContain("onClick={() => setRole('main')}");
    expect(row).toContain("onClick={() => setRole('standard')}");
    expect(row).toContain('MainRoleTrigger');
  });
});
