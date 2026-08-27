import { describe, expect, it } from 'vitest';
import type { CurrentRecipeResultAuthority } from './currentRecipeResultAuthority';
import { friendlyLabRecipeJourneyState } from './friendlyLabRecipeJourney';

const authority = (
  patch: Partial<CurrentRecipeResultAuthority> = {},
): CurrentRecipeResultAuthority => ({
  state: 'STALE',
  ready: false,
  draftRevision: 17,
  recipeFingerprint: 'recipe',
  behaviorFingerprint: 'behavior',
  resultReference: 'result',
  moduleGates: {} as CurrentRecipeResultAuthority['moduleGates'],
  blockedModules: [],
  blockedLineIds: [],
  ...patch,
});

describe('Friendly Lab Recipe journey presentation state', () => {
  it('keeps a fresh starter honest even when background ProductBehavior already makes authority ready', () => {
    expect(
      friendlyLabRecipeJourneyState({
        currentResultAuthority: authority({ state: 'CURRENT', ready: true }),
        awaitingRecalculation: false,
        hasNewRecipeStarter: true,
        appliedHistoryCount: 0,
        recalculationTerminal: null,
        legacyInspection: false,
      }),
    ).toBe('INITIAL');
  });

  it('uses the skeleton state only while the real recalculation or Apply operation is working', () => {
    expect(
      friendlyLabRecipeJourneyState({
        currentResultAuthority: authority({ state: 'LOADING' }),
        awaitingRecalculation: true,
        hasNewRecipeStarter: true,
        appliedHistoryCount: 0,
        recalculationTerminal: { state: 'WORKING' },
        legacyInspection: false,
      }),
    ).toBe('WORKING');
  });

  it('publishes CURRENT only after a real completed result, including a no-change result', () => {
    expect(
      friendlyLabRecipeJourneyState({
        currentResultAuthority: authority({ state: 'CURRENT', ready: true }),
        awaitingRecalculation: false,
        hasNewRecipeStarter: true,
        appliedHistoryCount: 0,
        recalculationTerminal: { state: 'NO_CHANGE_NEEDED' },
        legacyInspection: false,
      }),
    ).toBe('CURRENT');
  });

  it('distinguishes an edited current recipe from a blocked result', () => {
    expect(
      friendlyLabRecipeJourneyState({
        currentResultAuthority: authority({ blockedModules: ['NUTRITION'] }),
        awaitingRecalculation: true,
        hasNewRecipeStarter: false,
        appliedHistoryCount: 0,
        recalculationTerminal: null,
        legacyInspection: false,
      }),
    ).toBe('STALE');

    expect(
      friendlyLabRecipeJourneyState({
        currentResultAuthority: authority({ blockedModules: ['NUTRITION'] }),
        awaitingRecalculation: false,
        hasNewRecipeStarter: false,
        appliedHistoryCount: 0,
        recalculationTerminal: {
          state: 'ERROR',
          messagePl: 'Nie udało się przeliczyć receptury.',
        },
        legacyInspection: false,
      }),
    ).toBe('BLOCKED');
  });
});
