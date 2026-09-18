/**
 * Owner 2026-09-17 (kiwi): the page must USE the add door for an idea recognised while a
 * recipe is already on screen, and must report an element that reached no line.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(join(process.cwd(), 'src/pages/home/HomeCreatorPage.tsx'), 'utf8');

describe('KIWI-02 — the recognised idea reaches the open recipe', () => {
  it('adds every recognised element missing from an existing recipe, through the add door', () => {
    expect(page).toContain('const addIdeaChipsToOpenRecipe = useCallback(async () => {');
    expect(page).toContain('if (!useHomeDraftStore.getState().recipeReady) return;');
    expect(page).toContain('for (const chip of missingIdeaProducts()) {');
    expect(page).toContain('const outcome = await intentIngredients.addResolvedChip(chip);');
    // §B: no automatic amount means the customer is asked, never skipped.
    expect(page).toContain('askAmountFor(outcome);');
    // The CTA runs it after resolution.
    expect(page).toContain('await addIdeaChipsToOpenRecipe();');
  });

  it('never presents a recipe as ready while an element of the idea has no line', () => {
    expect(page).toMatch(
      /const missing = missingIdeaProducts\(\);\s+if \(missing\.length > 0\) \{/,
    );
    expect(page).toContain('Ta receptura nie zawiera jeszcze:');
  });

  it('KIWI-07: the presence check and the add door read the SAME role precedence', () => {
    const hook = readFileSync(
      join(process.cwd(), 'src/features/home-creator/useHomeIntentIngredients.ts'),
      'utf8',
    );
    expect(page).toContain('draftNow.usageAnswersByChipId');
    expect(hook).toContain(
      "useHomeDraftStore.getState().usageAnswersByChipId[chip.id] ?? chip.role ?? 'ingredient'",
    );
  });

  it('keeps ONE add door for the idea — no second insertion mechanism, no product ids', () => {
    const body = page.slice(
      page.indexOf('const addIdeaChipsToOpenRecipe'),
      page.indexOf('§58 — the picked product'),
    );
    // Inside this path only the existing chip door adds a line; the store's own
    // `addIngredient` stays where the confirmed-amount dialog already used it.
    expect(body).not.toContain('addIngredient(');
    expect(body).not.toMatch(/\bgrams\s*[:=]\s*\d/);
    expect(page).not.toMatch(/PI-ING-\d/);
  });
});

describe('KIWI-11 — a refusal is shown, not retried in a loop', () => {
  it('routes every failure and every start through the one tested gate', () => {
    // The page holds NO private copy of the rule: no ad-hoc key comparison, and no
    // failure path that quietly clears the memory the effect reads.
    expect(page).not.toMatch(/lastGeneratedFor|failedGenerationFor/);
    // Every failure path records the failure the same way (three of them today).
    expect(page.match(/generation\.current = generationFailed\(generation\.current\);/g)?.length).toBe(
      3,
    );
    // The effect asks the gate instead of comparing keys itself.
    expect(page).toContain('mayGenerate(key, generation.current)');
    expect(page).toContain('generation.current = generationStarted(key, generation.current);');
    // Pressing the CTA is a real retry.
    expect(page).toMatch(/submitIntent\(\);\s+\/\/[^\n]*\n\s+generation\.current = generationRetried\(\);/);
  });
});
