/**
 * HOME-UX-ADD-INGREDIENT — owner correction, 2026-08-31.
 *
 * "After the user has added the first ingredient, it is not visually obvious how to add
 * another one." The controls existed, but below sweetness, Przelicz and a paragraph, so
 * they read as unrelated to the list they act on. That placement fix still holds.
 *
 * ── PARTLY SUPERSEDED BY OWNER — 2026-09-02 ──────────────────────────────────────
 * The 2026-08-31 answer used the round ICON trigger with a `max-sm:hidden` text hint
 * beside it. Served, that read as "two anonymous circular + buttons", and on mobile the
 * only label was hidden. The owner replaced the icon variant with the canonical PILL
 * trigger, so each action reads „Dodaj składnik" / „Dodaj topping" at every width.
 *
 * What survives: the affordance still sits with the list, is still ONE per section, and
 * still opens the canonical picker with no HOME selection logic. What is superseded:
 * the icon variant and the desktop-only label — the two cases below record that.
 * ─────────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const section = readFileSync('src/features/home-creator/ui/HomeRecipeSection.tsx', 'utf8');
const picker = readFileSync('src/features/ingredient-builder/ProductPickerPopover.tsx', 'utf8');

describe('the add-ingredient affordance is attached to the ingredient list', () => {
  it('sits immediately after the list, before sweetness', () => {
    const listEnd = section.indexOf('</ul>');
    const addControls = section.indexOf('data-testid="home-add-controls"');
    const sweetness = section.indexOf('data-testid="home-sweetness"');
    expect(listEnd).toBeGreaterThan(-1);
    expect(addControls).toBeGreaterThan(listEnd);
    expect(addControls).toBeLessThan(sweetness);
  });

  it('is ONE control for the section, not one per row', () => {
    expect(section.match(/data-testid="home-add-ingredient"/g) ?? []).toHaveLength(1);
    // The row body must not sprout its own add control.
    const rowStart = section.indexOf('data-testid="home-recipe-line"');
    const rowEnd = section.indexOf('</ul>');
    expect(section.slice(rowStart, rowEnd)).not.toContain('home-add-ingredient');
  });

  it('invokes the canonical picker and adds no selection logic of its own', () => {
    expect(section).toContain('<ProductPickerPopover');
    expect(section).toContain('scope="BASE_FORMULATION"');
    for (const forbidden of [
      'searchCanonicalMapperIngredients',
      'getEngineApprovedIngredientById',
    ]) {
      expect(section, forbidden).not.toContain(forbidden);
    }
  });

  it('carries the label "Dodaj składnik" as visible text, not only as an aria-label', () => {
    expect(section).toContain('triggerLabel={homeCreatorCopy.recipe.addIngredient}');
    expect(picker).toContain('aria-label={label}');
  });

  it('SUPERSEDED 2026-09-02: the label is no longer desktop-only', () => {
    // Was: expect(section).toContain('max-sm:hidden') — the mobile user saw a bare `+`.
    expect(section).not.toContain('max-sm:hidden text-[13px]');
  });

  it('gives toppings the analogous affordance', () => {
    expect(section.match(/data-testid="home-add-topping"/g) ?? []).toHaveLength(1);
    expect(section).toContain('triggerLabel={homeCreatorCopy.recipe.addTopping}');
  });
});

describe('the trigger family', () => {
  it('uses the shared round icon button, not a large orange CTA', () => {
    expect(picker).toContain('iconButtonClasses(triggerSize)');
    const iconBranch = picker.slice(
      picker.indexOf("triggerVariant === 'icon'"),
      picker.indexOf('</button>'),
    );
    expect(iconBranch).not.toMatch(/bg-\[var\(--g-orange\)\]/);
    expect(iconBranch).not.toContain("buttonClasses('orange'");
  });

  it('SUPERSEDED 2026-09-02: HOME uses the labelled pill, not the anonymous icon', () => {
    // Was: expect(section).toContain('triggerVariant="icon"').
    expect(section).not.toContain('triggerVariant="icon"');
    expect(section.match(/triggerVariant="pill"/g) ?? []).toHaveLength(2);
    // The pill keeps its own 44 px target; the compact refinement size is not used here.
    expect(section).not.toContain('triggerSize="sm"');
  });

  it('keeps the orange focus treatment via the shared ring', () => {
    const styles = readFileSync('src/components/ui/buttonStyles.ts', 'utf8');
    expect(styles).toContain('pro-focus-ring');
  });

  it('leaves every existing caller on the pill trigger', () => {
    expect(picker).toContain("triggerVariant = 'pill'");
    for (const caller of [
      'src/features/ingredient-builder/IngredientBuilder.tsx',
      'src/features/ingredient-builder/ToppingRow.tsx',
    ]) {
      expect(readFileSync(caller, 'utf8'), caller).not.toContain('triggerVariant');
    }
  });
});
