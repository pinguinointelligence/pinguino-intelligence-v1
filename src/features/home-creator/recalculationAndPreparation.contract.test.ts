/**
 * SOL-039 / SOL-040 — the two HOME repairs are not decorations.
 *
 * The owner asked for proof that the verdict comes from the real pipeline (never a timer, never a
 * stale result) and that the "let's make it" stage reads the CURRENT recipe rather than a snapshot,
 * invents no production record and can be left.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { homeRecalculationVerdict } from './homeRecalculationVerdict';
import { homePreparationSteps } from './homePreparationSteps';

const STORE = readFileSync('src/features/constraint-studio/constraintStudioStore.ts', 'utf8');
const PANEL = readFileSync('src/features/home-creator/ui/HomeRecalculate.tsx', 'utf8');
const SECTION = readFileSync('src/features/home-creator/ui/HomePreparationSection.tsx', 'utf8');
const PAGE = readFileSync('src/pages/home/HomeCreatorPage.tsx', 'utf8');

describe('SOL-039 — the verdict is the pipeline’s own, and never stale', () => {
  it('a run in flight says nothing at all', () => {
    expect(homeRecalculationVerdict({ state: 'WORKING' })).toBeNull();
  });

  it('every run blanks the previous verdict before it starts', () => {
    const begin = STORE.slice(
      STORE.indexOf('export function beginPiRecalculation'),
      STORE.indexOf('export function beginPiRecalculation') + 700,
    );
    expect(begin).toContain("recalculationTerminal: { state: 'WORKING' }");
  });

  it('a material recipe edit clears it, so the customer never reads a verdict about an older recipe', () => {
    const cleared = STORE.slice(STORE.indexOf('const CLEAR_STAGED = {'));
    expect(cleared.slice(0, cleared.indexOf('};'))).toContain('recalculationTerminal: null');
    // and the subscriber spreads exactly that set on a Base technical change
    expect(STORE).toContain('const stagedPatch = baseTechnicalChanged && !previewCurrent');
  });

  it('the panel reads the store, not a timer of its own', () => {
    expect(PANEL).toContain('useConstraintStudioStore((state) => state.recalculationTerminal)');
    expect(PANEL).not.toMatch(/setTimeout|setInterval/);
    // the run itself is the existing canonical entry point
    expect(PANEL).toContain('runPiRecalculationWithTerminal()');
  });
});

describe('SOL-040 — the preparation stage is the current recipe, and nothing more', () => {
  it('the page hands it the live recipe, not a captured snapshot', () => {
    const mount = PAGE.slice(
      PAGE.indexOf('<HomePreparationSection'),
      PAGE.indexOf('<HomePreparationSection') + 300,
    );
    expect(mount).toContain('items={recipe.items}');
    expect(mount).toContain('toppings={recipe.toppings}');
  });

  it('it starts no production run, calls no engine and writes nothing', () => {
    expect(SECTION).not.toMatch(
      /useProductionWorkspace|productionSession|calculateRecipe|supabase/,
    );
    expect(SECTION).not.toMatch(/useRecipeStore\.getState\(\)\.(add|remove|set)/);
  });

  it('the customer can go back to the recipe', () => {
    expect(SECTION).toContain('onBack');
    expect(PAGE).toContain("onBack={() => scrollToStage('recipe')}");
  });

  it('the steps follow the recipe that is passed in, every time', () => {
    const first = homePreparationSteps(
      [{ id: 'a', ingredient: { id: 'i', name: 'MILK' }, planned_grams: 500 }] as never,
      [],
    );
    const second = homePreparationSteps(
      [{ id: 'a', ingredient: { id: 'i', name: 'MILK' }, planned_grams: 640 }] as never,
      [{ id: 't', ingredient: { id: 'j', name: 'Sante' }, planned_grams: 30 }] as never,
    );
    expect(first.map((s) => s.grams)).toEqual([500]);
    expect(second.map((s) => [s.name, s.grams, s.stage])).toEqual([
      ['MILK', 640, 'base'],
      ['Sante', 30, 'topping'],
    ]);
  });
});
