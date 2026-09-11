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
 *
 * PACKAGE 2A (closed 2026-09-11) re-expressed the owner's rule: a HOME draft is born
 * in AUTO, where every BASE line the customer adds IS a priority — invisibly, with no
 * crown on screen. Both add paths therefore ask for that AUTOMATIC priority through one
 * door, `grantAutomaticPriority`, which asks the same canonical Main authority on the
 * HOME surface and does nothing once the customer has crowned something themselves.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/pages/home/HomeCreatorPage.tsx', 'utf8');
const store = readFileSync('src/stores/recipeStore.ts', 'utf8');
/** The automatic door itself — the only thing either add path calls for a priority. */
const automaticDoor = store.slice(
  store.indexOf('grantAutomaticPriority: (lineId) => {'),
  store.indexOf('setStandardIngredient: (lineId) =>'),
);
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
  // Owner regression brief 2026-09-11: HOME's Crown rules are a HOME layer. Both
  // HOME add paths name the HOME surface, so nothing HOME decides can change the
  // PRO default (0 g + Crown -> 1 g for every profile).
  it('asks the canonical Main authority on the picker path', () => {
    expect(addLine).toContain('grantAutomaticPriority(added.lineId)');
    // The door is the canonical authority on the HOME surface, gated by AUTO — never
    // a second Main rule and never a crown the customer did not choose.
    expect(automaticDoor).toContain("if (get().priority_mode !== 'AUTO') return;");
    expect(automaticDoor).toContain("get().setMainIngredient(lineId, 'home');");
  });

  it('never crowns a line it did not create', () => {
    // A duplicate returns the EXISTING line id; crowning it would silently move Main
    // onto a line the customer did not just add.
    expect(addLine).toContain("if (added.status === 'duplicate') return;");
    const door = addLine.indexOf('grantAutomaticPriority(added.lineId)');
    expect(door).toBeGreaterThan(-1);
    expect(addLine.indexOf("if (added.status === 'duplicate') return;")).toBeLessThan(door);
  });

  it('asks the store rather than deciding Main itself', () => {
    // HOME owns no Main rule (§54). It may only offer the crown.
    expect(addLine).not.toContain("lock_type: 'main'");
    expect(addLine).not.toContain('MAIN_CAPABLE');
  });

  it('uses the same authority the intent path uses — one crown rule, not two', () => {
    expect(intent).toContain('grantAutomaticPriority(added.lineId)');
    expect(intent).not.toMatch(/setMainIngredient\(added\.lineId/);
    expect(addLine).not.toMatch(/setMainIngredient\(added\.lineId/);
  });
});

describe('Dodaj topping never crowns', () => {
  it('creates the topping without touching Main', () => {
    // OWNER OD-3: a new topping starts at 5 % of the current BASE mass.
    expect(addTopping).toContain(
      '.addTopping(ingredient, defaultHomeToppingGrams(useRecipeStore.getState().items))',
    );
    expect(addTopping).not.toContain('setMainIngredient');
    expect(addTopping).not.toContain('setLockType');
    // PACKAGE 2A: a topping is never a BASE priority and never ends AUTO.
    expect(addTopping).not.toContain('grantAutomaticPriority');
    expect(addTopping).not.toContain('setPriorityMode');
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
    expect(toppingBranch).not.toContain('grantAutomaticPriority');
    expect(toppingBranch).not.toContain('setPriorityMode');
  });
});
