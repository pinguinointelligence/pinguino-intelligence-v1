/**
 * §15 — CHANGING ONLY THE VIEWPORT MUST NOT CHANGE ANY FUNCTIONAL INPUT.
 *
 * The suspicion this answers is serious: that mobile might be wired to
 * different settings, a different machine, or a different Engine payload than
 * desktop. The strongest possible answer is structural rather than anecdotal —
 * if no viewport signal can reach the calculation path, no viewport can change
 * the result, on any recipe, forever.
 *
 * So this pins the SHAPE of the data path rather than one captured example:
 *  1. the Engine input is a pure function of the canonical recipe store;
 *  2. no breakpoint/media signal feeds a functional value anywhere in `src`;
 *  3. there is exactly one Engine invocation, shared by both presentations.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(full) && !full.includes('.test.') ? [full] : [];
  });
}

describe('responsive invariant', () => {
  const studioResult = read('features', 'studio', 'useStudioResult.ts');

  it('the Engine input is built only from the canonical recipe store', () => {
    // Every field in the memo comes from useRecipeStore / useCustomerPriceStore.
    for (const field of [
      'mode',
      'formulation_strategy',
      'category',
      'target_temperature_c',
      'target_batch_grams',
      'machine_capacity_grams',
      'machine_capacity_source',
      'flavor_intensity',
      'cost_priority',
      'direction_targets',
      'direction_targets_active',
      'items',
    ]) {
      expect(studioResult, field).toContain(`useRecipeStore((state) => state.${field})`);
    }
    // …and nothing viewport-shaped is anywhere near it.
    for (const banned of ['matchMedia', 'innerWidth', 'isMobile', 'breakpoint', 'window.']) {
      expect(studioResult, banned).not.toContain(banned);
    }
  });

  it('no viewport signal anywhere in src feeds a functional value', () => {
    /**
     * The three legitimate viewport readers, each PRESENTATION-only:
     *  - AutoConfigTransition: prefers-reduced-motion (animation)
     *  - StudioEngineSurface:  which surface hosts the cockpit (modal behaviour)
     *  - ProductPickerPopover / productPickerViewport: popover placement
     * Anything else must justify itself by being added here deliberately.
     */
    const ALLOWED = [
      'machine-onboarding/ui/AutoConfigTransition.tsx',
      'studio/StudioEngineSurface.tsx',
      'studio/mobileCockpitModal.ts',
      'ingredient-builder/ProductPickerPopover.tsx',
      'ingredient-builder/productPickerViewport.ts',
      'components/ui/HoverPreview.tsx',
    ];
    const offenders = sourceFiles(join(SRC, 'features'))
      .concat(sourceFiles(join(SRC, 'stores')))
      .concat(sourceFiles(join(SRC, 'engine')))
      .filter((file) => /matchMedia|window\.innerWidth|isMobile\b/.test(readFileSync(file, 'utf8')))
      .map((file) => file.replace(`${SRC}/`, ''))
      .filter((file) => !ALLOWED.some((allowed) => file.endsWith(allowed)));
    expect(offenders).toEqual([]);
  });

  it('neither the stores nor the Engine can observe a viewport at all', () => {
    for (const dir of ['stores', 'engine']) {
      for (const file of sourceFiles(join(SRC, dir))) {
        const source = readFileSync(file, 'utf8');
        for (const banned of ['matchMedia', 'innerWidth', 'isMobile'])
          expect(source, `${file} → ${banned}`).not.toContain(banned);
      }
    }
  });

  it('ONE Engine invocation is shared by both presentations', () => {
    const file = read('features', 'studio', 'StudioEngineSurface.tsx');
    // Scoped to the workbench itself — the below-fold review zone is a separate
    // component with its own (identical, store-derived) read.
    const surface = file.slice(0, file.indexOf('export function StudioReviewZone'));
    // A single planning result, handed to the desktop pane and the mobile sheet.
    expect(surface.match(/useStudioResult\(/g)).toHaveLength(1);
    expect(surface.match(/<RecipeProfilePanel/g)?.length).toBe(2);
    // Both receive the same computed objects — not their own calculations.
    expect(surface.match(/result=\{result\}/g)?.length).toBe(2);
    expect(surface.match(/input=\{input\}/g)?.length).toBe(2);
    expect(surface).not.toContain('calculateRecipe(');
  });

  it('the mobile viewport flag drives modal behaviour only, never a value', () => {
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');
    const uses = surface.split('\n').filter((line) => line.includes('mobileViewport'));
    for (const line of uses) {
      expect(
        /useState|setMobileViewport|shouldActivateMobileCockpitModal|mobileCockpitOpen && mobileViewport|shouldRevealProductionWeighingOnNarrowViewport|\[activeTab, mobileCockpitOpen, mobileViewport\]/.test(
          line,
        ) || line.trim() === 'mobileViewport,',
        line.trim(),
      ).toBe(true);
    }
  });
});
