import { describe, expect, it } from 'vitest';
import { HOME_CREATOR_COPY_BY_LOCALE, homeCreatorCopy } from './homeCreatorCopy';
import { homeRecalculationVerdict } from './homeRecalculationVerdict';

describe('what the customer reads after "Przelicz i popraw" (SOL-039)', () => {
  it('a run that changes nothing says so — it is never silent', () => {
    // owner QA 2026-09-06: 16 s of waiting and an empty screen
    expect(homeRecalculationVerdict({ state: 'NO_CHANGE_NEEDED' })).toBe(
      homeCreatorCopy.recipe.recalcNoChange,
    );
    expect(homeRecalculationVerdict({ state: 'BEST_ACHIEVABLE' })).toBe(
      homeCreatorCopy.recipe.recalcBestAchievable,
    );
  });

  it('stays silent while the run is going, when the preview is on screen, and after a cancel', () => {
    expect(homeRecalculationVerdict({ state: 'WORKING' })).toBeNull();
    expect(homeRecalculationVerdict({ state: 'PREVIEW_READY' })).toBeNull();
    expect(homeRecalculationVerdict({ state: 'CANCELLED' })).toBeNull();
    expect(homeRecalculationVerdict(null)).toBeNull();
  });

  it('a refusal keeps its verdict and names what the customer can do', () => {
    expect(
      homeRecalculationVerdict({
        state: 'LOCK_CHANGE_REQUIRED',
        code: 'impossible_under_constraints',
      }),
    ).toBe(homeCreatorCopy.recipe.recalcLocked);
    expect(
      homeRecalculationVerdict({
        state: 'PRODUCT_GRAMS_REQUIRED',
        code: 'missing_required_role',
        lineIds: ['line-1'],
      }),
    ).toBe(homeCreatorCopy.recipe.recalcNeedsGrams);
    expect(
      homeRecalculationVerdict({
        state: 'PRODUCT_DATA_REQUIRED',
        code: 'product_behavior_invalid',
        lineIds: ['line-1'],
      }),
    ).toBe(homeCreatorCopy.recipe.recalcNeedsProductData);
  });

  it('a technical sentence from the shared pipeline never reaches a HOME screen', () => {
    expect(
      homeRecalculationVerdict({
        state: 'ERROR',
        messagePl: 'Brak aktualnego snapshotu ProductBehavior dla wersji PI-ING-001655.',
      }),
    ).toBe(homeCreatorCopy.recipe.unresolvedProduct);
    // a sentence already written for the customer is passed through unchanged
    expect(
      homeRecalculationVerdict({
        state: 'TIMEOUT',
        messagePl: 'Nie udało się zakończyć przeliczenia. Twoja receptura nie została zmieniona.',
      }),
    ).toBe('Nie udało się zakończyć przeliczenia. Twoja receptura nie została zmieniona.');
  });

  it('speaks the locale it is given', () => {
    expect(
      homeRecalculationVerdict({ state: 'NO_CHANGE_NEEDED' }, HOME_CREATOR_COPY_BY_LOCALE.en),
    ).toBe(HOME_CREATOR_COPY_BY_LOCALE.en.recipe.recalcNoChange);
  });
});
