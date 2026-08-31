/**
 * HOME ENTRY — OWNER FROZEN, 2026-08-31.
 *
 * Copy, structure and hierarchy of the first screen. Frozen means a change here should
 * fail loudly rather than drift.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOME_CREATOR_COPY_BY_LOCALE, homeCreatorCopy } from '../homeCreatorCopy';

const en = HOME_CREATOR_COPY_BY_LOCALE.en;

const intent = readFileSync('src/features/home-creator/ui/HomeIntentSection.tsx', 'utf8');

describe('frozen copy', () => {
  it('keeps the exact approved strings', () => {
    expect(homeCreatorCopy.intent.headline).toBe('Stwórz własne lody. Jak profesjonalista.');
    expect(homeCreatorCopy.intent.question).toBe('Jakie lody robimy dzisiaj?');
    expect(homeCreatorCopy.intent.placeholder).toBe('Napisz, co chcesz zrobić…');
    expect(homeCreatorCopy.intent.cta).toBe('Stwórz swoją recepturę');
  });

  it('says Topping, never Posypka, in customer-facing HOME copy', () => {
    expect(homeCreatorCopy.recipe.topping).toBe('Topping');
    expect(homeCreatorCopy.recipe.addTopping).toBe('Dodaj topping');
    expect(homeCreatorCopy.intent.refineTopping).toBe('Topping');
    const pl = JSON.stringify(homeCreatorCopy);
    expect(pl.toLowerCase()).not.toContain('posypk');
  });

  it('keeps both locales complete', () => {
    expect(en.intent.refineIngredient).toBeTruthy();
    expect(en.intent.refineTopping).toBe('Topping');
  });
});

describe('frozen structure', () => {
  it('shows refinement ONLY once an idea exists', () => {
    // The refinement row lives inside the `chips.length > 0` branch, so the empty first
    // screen keeps only the text input, Powiedz and Zeskanuj.
    const chipsBranch = intent.slice(
      intent.indexOf('{chips.length > 0 ? ('),
      intent.indexOf('data-testid="home-intent-cta"'),
    );
    expect(chipsBranch).toContain('data-testid="home-intent-refine"');
  });

  it('never puts the add controls inside the empty input surface', () => {
    // Slice the RENDERED input surface, not the file: the picker import legitimately
    // sits at the top and an index-from-zero slice would fail on the import alone.
    const inputSurface = intent.slice(
      intent.indexOf('data-testid="home-intent-input"'),
      intent.indexOf('{chips.length > 0 ? ('),
    );
    expect(inputSurface).not.toContain('home-intent-refine');
    expect(inputSurface).not.toContain('<ProductPickerPopover');
  });

  it('places refinement BEFORE the primary CTA', () => {
    expect(intent.indexOf('data-testid="home-intent-refine"')).toBeLessThan(
      intent.indexOf('data-testid="home-intent-cta"'),
    );
  });
});

describe('frozen hierarchy — refinement stays subordinate', () => {
  it('uses the same light icon family, one size smaller, never an orange fill', () => {
    expect(intent).toContain('triggerVariant="icon"');
    expect(intent).toContain('triggerSize="sm"');
    expect(intent).not.toContain('var(--g-orange)');
    expect(intent).not.toContain("buttonClasses('orange'");
  });

  it('does not create another button family', () => {
    const refineRow = intent.slice(
      intent.indexOf('data-testid="home-intent-refine"'),
      intent.indexOf('data-testid="home-intent-cta"'),
    );
    // Only the canonical picker trigger plus a plain text label.
    expect(refineRow).not.toContain('rounded-full px-');
    expect(refineRow).not.toContain('min-h-[52px]');
  });

  it('opens the canonical pickers and adds no selection logic', () => {
    expect(intent).toContain('scope="BASE_FORMULATION"');
    expect(intent).toContain('scope="POST_PROCESS_ADDON"');
    expect(intent).toContain('behaviorContext={behaviorContext}');
    for (const forbidden of [
      'searchCanonicalMapperIngredients',
      'getEngineApprovedIngredientById',
    ]) {
      expect(intent, forbidden).not.toContain(forbidden);
    }
  });
});
