/**
 * Owner QA 2026-09-06 — „Wszystkie składniki dodane przez `Dodaj składnik`
 * automatycznie dostają koronę. Produkty dodane przez `Dodaj topping` nigdy nie
 * dostają korony."
 *
 * There were two add paths and only one of them asked. The intent-chip path called
 * `setMainIngredient`; the picker path (`Dodaj składnik`) never did — so the SAME
 * product arrived crowned or bare depending only on how it was added.
 *
 * Source contracts, because the defect is which call each path makes.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/pages/home/HomeCreatorPage.tsx', 'utf8');
const intent = readFileSync('src/features/home-creator/useHomeIntentIngredients.ts', 'utf8');

/** `addIngredientLine` — the one place the picker path creates a Base line. */
const addLine = page.slice(
  page.indexOf('const addIngredientLine = useCallback('),
  page.indexOf('const handleAddTopping = useCallback('),
);

/** `handleAddTopping` — the one place either path creates a topping. */
const addTopping = page.slice(
  page.indexOf('const handleAddTopping = useCallback('),
  page.indexOf('const handleAddIngredient = useCallback('),
);

describe('Dodaj składnik offers the crown', () => {
  it('asks the canonical Main authority on the picker path', () => {
    expect(addLine).toContain('setMainIngredient(added.lineId)');
  });

  it('never crowns a line it did not create', () => {
    // A duplicate returns the EXISTING line id; crowning it would silently move Main
    // onto a line the customer did not just add.
    expect(addLine).toContain("if (added.status === 'duplicate') return;");
    expect(addLine.indexOf("if (added.status === 'duplicate') return;")).toBeLessThan(
      addLine.indexOf('setMainIngredient(added.lineId)'),
    );
  });

  it('asks the store rather than deciding Main itself', () => {
    // HOME owns no Main rule (§54). It may only offer the crown.
    expect(addLine).not.toContain("lock_type: 'main'");
    expect(addLine).not.toContain('MAIN_CAPABLE');
  });

  it('uses the same authority the intent path uses — one crown rule, not two', () => {
    expect(intent).toContain('setMainIngredient(added.lineId)');
  });
});

describe('Dodaj topping never crowns', () => {
  it('creates the topping without touching Main', () => {
    expect(addTopping).toContain('addTopping(ingredient, 0)');
    expect(addTopping).not.toContain('setMainIngredient');
    expect(addTopping).not.toContain('setLockType');
  });

  it('keeps the topping path out of the recipe lines entirely', () => {
    expect(addTopping).not.toContain('addIngredient(');
  });

  it('does not crown on the intent path either', () => {
    const open = intent.indexOf("if (role === 'topping') {");
    expect(open).toBeGreaterThan(-1);
    // The branch ends at its own closing brace, which sits at the same indentation.
    const toppingBranch = intent.slice(open, intent.indexOf('\n      }\n', open));
    expect(toppingBranch).toContain('addTopping(');
    expect(toppingBranch).not.toContain('setMainIngredient');
  });
});
