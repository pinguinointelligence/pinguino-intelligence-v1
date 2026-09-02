/**
 * OWNER-LOCKED CONTRACT — a saved recipe always has a legal path to Production.
 *
 * PC-06, proven on staging `36a3b7f4` and again on `c7344691`: a saved Sorbet
 * could never reach Production. The three surfaces contradicted one another and
 * the customer had no move at all.
 *
 *   Produkcja : "WYMAGA RECEPTURY WYKONAWCZEJ · Najpierw przelicz recepturę"
 *   Przelicz  : "To najbliższy osiągalny wynik … receptura nie została zmieniona"
 *   ZAPISZ    : disabled — nothing changed, so there is nothing to save
 *
 * No Direction change was requested. The two disagreeing authorities were
 * `productionRecipeLifecycleState` (which demanded a recalculation whenever the
 * practical audit was absent) and `buildOptimizePreview` (which had no
 * applicable change to make). 361 of 722 saved versions on staging carried no
 * practical audit, so the loop was reachable across half the library; a Sorbet,
 * whose recalculation legitimately has nothing to do, could never leave it.
 *
 * THE LOCKED BEHAVIOUR: an untouched saved version whose grams are whole is its
 * own executable evidence. Everything else that made a recipe stale still does.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import {
  productionRecipeLifecycleState,
  type ProductionRecipeLifecycleState,
} from '@/features/production-workspace/productionReadinessState';
import {
  attachPracticalRecipeAudit,
  readPracticalRecipeAudit,
} from '@/features/practical-recipe/practicalRecipe';
import { readSource } from './sourceContract';

const FP = 'saved-production-fingerprint';

/** Minimal but real inputs, one per profile, in whole grams. */
const line = (id: string, grams: number, lock: RecipeInput['items'][number]['lock_type'] = 'unlocked') => ({
  id,
  ingredient: {
    id,
    name: id,
    category: 'other' as const,
    composition: {},
  } as unknown as RecipeInput['items'][number]['ingredient'],
  planned_grams: grams,
  actual_grams: null,
  lock_type: lock,
});

const recipeFor = (
  category: RecipeInput['category'],
  items: RecipeInput['items'],
): RecipeInput => ({
  mode: 'classic',
  category,
  target_temperature_c: -12,
  target_batch_grams: items.reduce((sum, item) => sum + item.planned_grams, 0),
  machine_capacity_grams: null,
  items,
  goals: {
    formulation_strategy: 'optimal',
    direction_targets_active: true,
    direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
  },
});

/** The exact PC-06 shape: Sorbet, fruit Main held, whole grams, nothing edited. */
const SORBET_FIXTURE = recipeFor('sorbet', [
  line('water', 161),
  line('sucrose', 90),
  line('dextrose', 90),
  line('inulin', 55),
  line('tara_gum', 4),
  line('PI-ING-000406', 600, 'main'),
]);

const GELATO_FIXTURE = recipeFor('milk_gelato', [
  line('milk_3_5', 670),
  line('cream_30', 130),
  line('skimmed_milk', 35),
  line('sucrose', 130),
  line('dextrose', 30),
  line('tara_gum', 5),
]);

const VEGAN_FIXTURE = recipeFor('vegan_gelato', [
  line('water', 397),
  line('oat_drink', 250),
  line('coconut_oil', 53),
  line('sucrose', 145),
  line('dextrose', 100),
  line('inulin', 53),
  line('tara_gum', 2),
]);

const PROTEIN_FIXTURE = recipeFor('protein_gelato', [
  line('milk_3_5', 522),
  line('cream_30', 114),
  line('protein_wpc', 81),
  line('water', 104),
  line('sucrose', 71),
  line('dextrose', 106),
  line('tara_gum', 2),
]);

/** A version reopened from the library: saved, unedited, no pending work. */
const reopenedSavedVersion = (
  input: RecipeInput,
  options: { withAudit: boolean; calculationStale?: boolean } = { withAudit: false },
): ProductionRecipeLifecycleState => {
  const saved = options.withAudit
    ? attachPracticalRecipeAudit(input, input, '2026-08-30T09:00:00.000Z')
    : input;
  return productionRecipeLifecycleState({
    workingInput: saved,
    practicalAudit: readPracticalRecipeAudit(saved),
    calculationStale: options.calculationStale ?? false,
    currentProductionFingerprint: FP,
    savedProductionFingerprint: FP,
    savedVersionId: 'version-1',
  });
};

describe('OWNER-LOCKED — a saved recipe always has a legal path to Production', () => {
  /* 1 + 2 + 3 — the exact PC-06 fixture, reopened, reaches Production. */
  it('1-3. the PC-06 saved Sorbet reopens READY instead of demanding a pointless recalculation', () => {
    expect(reopenedSavedVersion(SORBET_FIXTURE)).toBe('READY');
  });

  /* 4 — currentness still rules when the recipe genuinely needs recalculating. */
  it('4. a pending recalculation still makes a saved recipe stale', () => {
    expect(reopenedSavedVersion(SORBET_FIXTURE, { withAudit: false, calculationStale: true })).toBe(
      'TECHNICALLY_STALE',
    );
    expect(reopenedSavedVersion(SORBET_FIXTURE, { withAudit: true, calculationStale: true })).toBe(
      'TECHNICALLY_STALE',
    );
  });

  /* 5 — the practical audit remains the primary evidence and still works. */
  it('5. an applied-and-saved recipe carrying its practical audit is READY', () => {
    expect(reopenedSavedVersion(SORBET_FIXTURE, { withAudit: true })).toBe('READY');
  });

  /* 6 — an edited draft is NOT a saved version and must not slip through. */
  it('6. an edited draft is never accepted as its own evidence', () => {
    const edited = {
      ...SORBET_FIXTURE,
      items: SORBET_FIXTURE.items.map((item, index) =>
        index === 0 ? { ...item, planned_grams: item.planned_grams + 1 } : item,
      ),
    };
    expect(
      productionRecipeLifecycleState({
        workingInput: edited,
        practicalAudit: null,
        calculationStale: false,
        currentProductionFingerprint: 'edited-fingerprint',
        savedProductionFingerprint: FP,
        savedVersionId: 'version-1',
      }),
    ).toBe('TECHNICALLY_STALE');
  });

  /* 7 — an unsaved draft has no version identity to appeal to. */
  it('7. an unsaved draft without an audit is still stale', () => {
    expect(
      productionRecipeLifecycleState({
        workingInput: SORBET_FIXTURE,
        practicalAudit: null,
        calculationStale: false,
        currentProductionFingerprint: FP,
        savedProductionFingerprint: null,
        savedVersionId: null,
      }),
    ).toBe('TECHNICALLY_STALE');
  });

  /* 8 — whole grams are checked, never assumed. */
  it('8. a fractional gram is never an executable recipe', () => {
    const fractional = {
      ...SORBET_FIXTURE,
      items: SORBET_FIXTURE.items.map((item, index) =>
        index === 1 ? { ...item, planned_grams: 90.4 } : item,
      ),
    };
    expect(
      productionRecipeLifecycleState({
        workingInput: fractional,
        practicalAudit: null,
        calculationStale: false,
        currentProductionFingerprint: FP,
        savedProductionFingerprint: FP,
        savedVersionId: 'version-1',
      }),
    ).toBe('TECHNICALLY_STALE');
  });

  /* 9-11 — the other three profiles behave identically. Sorbet is not special. */
  it('9-11. Gelato, Vegan and Protein reopen READY on the same rule', () => {
    for (const fixture of [GELATO_FIXTURE, VEGAN_FIXTURE, PROTEIN_FIXTURE]) {
      expect(reopenedSavedVersion(fixture)).toBe('READY');
      expect(reopenedSavedVersion(fixture, { withAudit: true })).toBe('READY');
    }
  });

  /* The contract itself: the dead loop must be unreachable. */
  it('never demands a recalculation from a clean, saved, whole-gram recipe', () => {
    for (const fixture of [SORBET_FIXTURE, GELATO_FIXTURE, VEGAN_FIXTURE, PROTEIN_FIXTURE]) {
      const state = reopenedSavedVersion(fixture);
      // If this ever returns TECHNICALLY_STALE again, Produkcja asks for a
      // recalculation that Przelicz has no move to make and ZAPISZ cannot save.
      expect(state, 'PC-06 dead loop is back').not.toBe('TECHNICALLY_STALE');
    }
  });

  /* Direction is untouched: readiness reads no Direction target at all. */
  it('reads no Direction target — readiness can never mutate a Direction axis', () => {
    const source = readSource('features', 'production-workspace', 'productionReadinessState.ts');
    expect(source).not.toContain('direction_targets');
    expect(source).not.toContain('sweetness');
    expect(source).not.toContain('softness');
  });

  /* The zero-gram invariant and the whole-gram requirement stay wired in. */
  it('keeps the accepted staleness reasons wired at the gate', () => {
    const source = readSource('features', 'production-workspace', 'productionReadinessState.ts');
    expect(source).toContain('input.calculationStale');
    expect(source).toContain('unusedZeroGramLineIds');
    expect(source).toContain('practicalRecipeAuditMatchesInput');
    expect(source).toContain('Number.isInteger(item.planned_grams)');
  });
});
