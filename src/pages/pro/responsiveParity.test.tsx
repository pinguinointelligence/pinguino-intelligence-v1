/**
 * ONE FUNCTIONAL MODEL, TWO RESPONSIVE PRESENTATIONS (owner rule, 2026-08-24).
 *
 * Mobile is not a second PINGÜINO. It may differ in layout, order, disclosure,
 * spacing, touch ergonomics and which controls are visible before tapping — and
 * in NOTHING else. These proofs are structural, so they fail the moment someone
 * starts a parallel mobile implementation of behaviour that already exists.
 *
 * The rule is enforced from three directions:
 *  1. the mobile presentation layer may not reach for state or the Engine;
 *  2. every mobile control must dispatch through the SAME action object the
 *     desktop row uses, with the same arguments;
 *  3. the marker is DERIVED state — it may never write recipe state.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

const mobile = read('features', 'ingredient-builder', 'IngredientLineControls.tsx');
const row = read('features', 'ingredient-builder', 'IngredientRow.tsx');
const tabs = read('features', 'pro-workbench', 'WorkbenchModuleTabs.tsx');
const surface = read('features', 'studio', 'StudioEngineSurface.tsx');
const markerStore = read('features', 'ingredient-builder', 'ingredientChangeStore.ts');
const markerModel = read('features', 'ingredient-builder', 'ingredientChangeHighlight.ts');

describe('no mobile business logic', () => {
  it('the mobile presentation layer never reaches for state or the Engine', () => {
    // Value imports only; `import type` is fine — types carry no behaviour.
    const valueImports = mobile
      .split('\n')
      .filter((line) => line.startsWith('import ') && !line.startsWith('import type'));
    for (const forbidden of [
      '@/stores/',
      'constraintStudioStore',
      'recipeStore',
      'useRecipeStore',
      'recipeProfileStore',
      'ingredientTableUxStore',
      'customerPriceStore',
      'calculateRecipe',
      'applyPipeline',
      'proposeCorrections',
    ]) {
      expect(valueImports.join('\n'), forbidden).not.toContain(forbidden);
    }
    // …and defines no arithmetic of its own beyond the desktop row's own clamp.
    expect(mobile).not.toMatch(/function\s+\w*(Rebalance|Recalc|Calculate|Solve)/i);
    expect(mobile).not.toContain('total_batch_g');
    expect(mobile).not.toContain('effective_grams');
  });

  it('no parallel mobile implementation of an existing capability exists', () => {
    for (const banned of [
      'mobileRecipeState',
      'mobileRebalance',
      'mobileSaveRecipe',
      'mobileProductionCalculation',
      'mobileMainIngredientLogic',
      'useMobileRecipe',
    ]) {
      expect(mobile, banned).not.toContain(banned);
      expect(row, banned).not.toContain(banned);
      expect(surface, banned).not.toContain(banned);
    }
  });
});

describe('mobile dispatches through the desktop action object', () => {
  it('grams, percent and lock use the same actions with the same arguments', () => {
    // Exactly the desktop row's own call shapes.
    for (const call of [
      'actions.setPlannedGrams(item.id, Math.max(0, next))',
      'actions.setPlannedPercent?.(item.id, next)',
      "actions.setLockType(item.id, gramsLocked ? 'unlocked' : 'grams')",
    ]) {
      expect(mobile, call).toContain(call);
    }
    // The lock toggle prefers the host-provided lock authority, like desktop.
    expect(mobile).toContain('lock.onToggle();');
  });

  it('the Main crown and the price write through the existing flows', () => {
    // The crown is routed to the row's own `setRole`, which owns the canonical
    // main/standard authority (setCustomerRole → setMainIngredient / …).
    expect(mobile).toContain('onSetRole(isMain ?');
    expect(row).toContain('onSetRole={setRole}');
    // The price editor is the SAME component and the SAME view object, so
    // onSave/onReset remain the existing customer-price persistence.
    expect(mobile).toContain('<CustomerPriceEditor view={priceView} />');
    expect(row).toContain('priceView={resolvedPriceView}');
  });

  it('the options list is one model rendered in two placements', () => {
    expect(row.match(/const optionsList = \(/g)).toHaveLength(1);
    expect(row).toContain('menu={optionsList}');
    expect(mobile).toContain('menu: ReactNode');
  });

  it('module navigation only chooses which existing surface is visible', () => {
    // One tab component, one route authority — no mobile Recipe/Monitor/
    // Production/Label of its own.
    expect(tabs).toContain("variant?: 'header' | 'bottom'");
    expect(surface).toContain('variant="bottom"');
    // The mobile panel renders the SAME RecipeProfilePanel as the desktop pane.
    expect(surface.match(/<RecipeProfilePanel/g)?.length).toBeGreaterThanOrEqual(2);
    expect(surface).not.toMatch(/MobileMonitor|MobileProduction|MobileLabel/);
  });
});

describe('the change marker is derived UI state only', () => {
  it('never writes recipe state, versions or Engine input', () => {
    for (const forbidden of [
      'setPlannedGrams',
      'setPlannedPercent',
      'setLockType',
      'setMainIngredient',
      'saveRecipe',
      'commitPreview',
      'calculateRecipe',
    ]) {
      expect(markerStore, forbidden).not.toContain(forbidden);
      expect(markerModel, forbidden).not.toContain(forbidden);
    }
    // It reads the canonical dirty flag; it does not replace it.
    expect(markerStore).toContain('useRecipeStore((state) => state.dirty)');
    expect(markerStore).not.toContain('useRecipeStore.setState');
  });

  it('is versioned so a format change can never light every row up', () => {
    expect(markerStore).toContain('version: SIGNATURE_FORMAT_VERSION');
    expect(markerStore).toContain('migrate: () => ({ baselineByLineId: {} })');
  });

  it('compares at the precision the row shows', () => {
    expect(markerModel).toContain('input.plannedGrams.toFixed(1)');
    expect(markerModel).not.toContain('toFixed(3)');
  });
});
