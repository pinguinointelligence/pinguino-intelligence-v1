/**
 * Machine onboarding view models — §8.2 tile honesty (conflicted families
 * visible but DISABLED with the honest note), search, display names, the
 * derived „Zalecany wsad PINGÜINO” presentation (never a manufacturer
 * figure), the owner split notice with verbatim copy, and the §7.3 context
 * view rules.
 */
import { describe, expect, it } from 'vitest';
import {
  KITCHENAID_5KSMICM,
  MACHINE_CATALOG,
  MACHINE_CATALOG_VERSION,
  MAGIMIX_GELATO_EXPERT,
  NINJA_CREAMI_DELUXE_NC502EU,
  NINJA_CREAMI_NC302EU,
  NINJA_CREAMI_SCOOP_SWIRL_NC7,
  buildCustomMachineProfile,
  deriveMachineSetup,
} from '@/features/machine-catalog';
import { machineOnboardingCopy as copy, pluralPojemniki } from './machineOnboardingCopy';
import {
  autoConfigLines,
  buildMachineContextView,
  buildMachineTileViews,
  containerSplitNotice,
  formatGrams,
  machineDisplayName,
  presentBatchSuggestion,
  searchMachineTiles,
} from './machineViews';
import { buildMachinePreferenceRecord, withCustomContainer } from './preferenceContracts';

const NOW = '2026-07-17T12:00:00.000Z';

function recordFor(profileId: string) {
  const profile = MACHINE_CATALOG.find((p) => p.id === profileId);
  if (!profile) throw new Error(`unknown profile ${profileId}`);
  const record = buildMachinePreferenceRecord({
    profile,
    isCustom: false,
    setAt: NOW,
    catalogVersion: MACHINE_CATALOG_VERSION,
  });
  if (record === null) throw new Error('expected a record');
  return record;
}

/* ------------------------------------------------------------------ */
/* §8.2 tiles                                                          */
/* ------------------------------------------------------------------ */

describe('§8.2 tile views — honesty', () => {
  const views = buildMachineTileViews();

  it('keeps the spec family order and ends with the escape tile', () => {
    expect(views.map((v) => v.label)).toEqual([
      'Ninja CREAMi',
      'Ninja CREAMi Deluxe',
      'Ninja CREAMi Scoop & Swirl',
      'Moulinex Freezi',
      'Sage / Breville Smart Scoop',
      'Magimix Gelato Expert',
      'Cuisinart ICE-100',
      'KitchenAid Ice Cream Maker',
      'Cuisinart z misą chłodzoną',
      'Nie widzę mojej maszyny',
    ]);
    expect(views[views.length - 1]?.selectable).toBe(true);
  });

  it('OWNER FINAL DECISION — both Ninja families are SELECTABLE (no note, no block)', () => {
    for (const label of ['Ninja CREAMi', 'Ninja CREAMi Deluxe']) {
      const view = views.find((v) => v.label === label);
      expect(view?.selectable, label).toBe(true);
      expect(view?.note, label).toBeNull();
      expect(view?.selectableProfiles.length, label).toBe(1);
    }
    // The closed retail-page disputes carry NO blocking conflict entries.
    expect(NINJA_CREAMI_NC302EU.sourceConflicts ?? []).toEqual([]);
    expect(NINJA_CREAMI_DELUXE_NC502EU.sourceConflicts ?? []).toEqual([]);
  });

  it('Sage stays visible but DISABLED with the honest verification note', () => {
    const sage = views.find((v) => v.label === 'Sage / Breville Smart Scoop');
    expect(sage?.selectable).toBe(false);
    expect(sage?.note).toBe(copy.tiles.unavailableNote);
  });

  it('the offered tiles are exactly the activatable machines of the final decision', () => {
    const selectable = views.filter((v) => v.selectable && v.kind === 'catalog_family');
    expect(selectable.map((v) => v.label)).toEqual([
      'Ninja CREAMi',
      'Ninja CREAMi Deluxe',
      'Ninja CREAMi Scoop & Swirl',
      'Moulinex Freezi',
      'Magimix Gelato Expert',
      'Cuisinart ICE-100',
      'KitchenAid Ice Cream Maker',
      'Cuisinart z misą chłodzoną',
    ]);
  });

  it('only the frozen-bowl Cuisinart tile needs model disambiguation', () => {
    expect(views.filter((v) => v.needsDisambiguation).map((v) => v.label)).toEqual([
      'Cuisinart z misą chłodzoną',
    ]);
  });

  it('a tampered inactive record disables its family tile', () => {
    const tamperedCatalog = MACHINE_CATALOG.map((p) =>
      p.id === NINJA_CREAMI_SCOOP_SWIRL_NC7.id ? { ...p, active: false } : p,
    );
    const tampered = buildMachineTileViews(undefined, tamperedCatalog);
    const swirl = tampered.find((v) => v.label === 'Ninja CREAMi Scoop & Swirl');
    expect(swirl?.selectable).toBe(false);
    expect(swirl?.note).toBe(copy.tiles.unavailableNote);
  });
});

describe('§8.2 search', () => {
  const views = buildMachineTileViews();

  it('matches by label, brand and model code; keeps the escape tile visible', () => {
    const byModel = searchMachineTiles(views, 'nc302');
    expect(byModel.map((v) => v.label)).toEqual(['Ninja CREAMi', 'Nie widzę mojej maszyny']);

    const byBrand = searchMachineTiles(views, 'kitchen');
    expect(byBrand.map((v) => v.label)).toContain('KitchenAid Ice Cream Maker');

    const diacritics = searchMachineTiles(views, 'misą');
    expect(diacritics.map((v) => v.label)).toContain('Cuisinart z misą chłodzoną');
    const noDiacritics = searchMachineTiles(views, 'misa');
    expect(noDiacritics.map((v) => v.label)).toContain('Cuisinart z misą chłodzoną');
  });

  it('empty query returns everything; a disabled family stays findable (honest note intact)', () => {
    expect(searchMachineTiles(views, '')).toEqual(views);
    const sage = searchMachineTiles(views, 'bci600');
    expect(sage.map((v) => v.label)).toContain('Sage / Breville Smart Scoop');
    expect(sage.find((v) => v.label.startsWith('Sage'))?.selectable).toBe(false);
    expect(sage.find((v) => v.label.startsWith('Sage'))?.note).toBe(copy.tiles.unavailableNote);
    // Owner final decision: the Deluxe is selectable — findable with NO note.
    const deluxe = searchMachineTiles(views, 'nc502');
    expect(deluxe.find((v) => v.label === 'Ninja CREAMi Deluxe')?.note).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Display names                                                       */
/* ------------------------------------------------------------------ */

describe('machine display names — customer-facing, never technology codes', () => {
  it('catalog machines read as brand + family', () => {
    expect(machineDisplayName(NINJA_CREAMI_DELUXE_NC502EU)).toBe('Ninja CREAMi Deluxe');
    expect(machineDisplayName(MAGIMIX_GELATO_EXPERT)).toBe('Magimix Gelato Expert');
  });

  it('custom machines use brand + model, with an honest generic fallback', () => {
    const named = buildCustomMachineProfile({
      behaviorAnswerId: 'machine_cools_itself',
      market: 'ES',
      brand: 'Acme',
      model: 'G-2000',
    });
    if (named.outcome !== 'profile') throw new Error('expected profile');
    expect(machineDisplayName(named.profile)).toBe('Acme G-2000');

    const anonymous = buildCustomMachineProfile({ behaviorAnswerId: 'machine_cools_itself', market: 'ES' });
    if (anonymous.outcome !== 'profile') throw new Error('expected profile');
    expect(machineDisplayName(anonymous.profile)).toBe(copy.profile.customName);
  });
});

/* ------------------------------------------------------------------ */
/* Batch presentation + split                                          */
/* ------------------------------------------------------------------ */

describe('batch presentation — owner framing, honest none', () => {
  it('derived grams present as „Zalecany wsad PINGÜINO” — never as a capacity', () => {
    const nc7 = presentBatchSuggestion(deriveMachineSetup(NINJA_CREAMI_SCOOP_SWIRL_NC7));
    expect(nc7).toEqual({
      kind: 'pinguino_grams',
      label: 'Zalecany wsad PINGÜINO',
      text: '460 g',
      note: null, // official source — not estimated
    });
    const kitchenAid = presentBatchSuggestion(deriveMachineSetup(KITCHENAID_5KSMICM));
    expect(kitchenAid).toMatchObject({ kind: 'pinguino_grams', text: '1330 g' });
  });

  it('user-declared capacity carries the honest ESTIMATED note', () => {
    const custom = buildCustomMachineProfile({
      behaviorAnswerId: 'freeze_mixture_first',
      market: 'ES',
      vesselCapacity: { value: 473, unit: 'ml' },
    });
    if (custom.outcome !== 'profile') throw new Error('expected profile');
    const presentation = presentBatchSuggestion(deriveMachineSetup(custom.profile));
    expect(presentation).toEqual({
      kind: 'pinguino_grams',
      label: 'Zalecany wsad PINGÜINO',
      text: '450 g',
      note: copy.batch.estimatedNote,
    });
  });

  it('a conflicted machine presents the honest verification note (probe; real records derive)', () => {
    const probe = {
      ...NINJA_CREAMI_NC302EU,
      id: 'probe-conflicted-presentation',
      specificationStatus: 'conflicting_sources' as const,
      sourceConflicts: [
        { field: 'vesselCapacityMl' as const, candidatesMl: [473, 450], note: 'probe' },
      ],
      active: false,
    };
    const p = presentBatchSuggestion(deriveMachineSetup(probe));
    expect(p).toEqual({ kind: 'user_choice', text: copy.batch.conflictNote });
    expect(JSON.stringify(p)).not.toContain('450');
    // Owner final decision: the REAL record presents the pinned 450 g proposal.
    const real = presentBatchSuggestion(deriveMachineSetup(NINJA_CREAMI_NC302EU));
    expect(real).toMatchObject({ kind: 'pinguino_grams', label: copy.batch.recommendedLabel });
  });

  it('a bowl-only machine presents the honest user-choice note', () => {
    const p = presentBatchSuggestion(deriveMachineSetup(MAGIMIX_GELATO_EXPERT));
    expect(p).toEqual({ kind: 'user_choice', text: copy.batch.userChoiceNote });
  });
});

describe('container split notice — owner verbatim copy', () => {
  it('900 g @ 450 g: exact owner message + detail', () => {
    const notice = containerSplitNotice(900, 450);
    expect(notice?.message).toBe('Ta ilość wymaga 2 pojemników. PINGÜINO podzieli recepturę automatycznie.');
    expect(notice?.detail).toBe('2 pojemniki po 450 g');
    expect(notice?.plan.containers).toBe(2);
  });

  it('1000 g @ 450 g → 3 even containers (~333,3 g); 1350 → 3 × 450', () => {
    const thousand = containerSplitNotice(1000, 450);
    expect(thousand?.plan.containers).toBe(3);
    expect(thousand?.message).toBe(
      'Ta ilość wymaga 3 pojemników. PINGÜINO podzieli recepturę automatycznie.',
    );
    expect(thousand?.detail).toBe('3 pojemniki po 333,3 g');
    expect(containerSplitNotice(1350, 450)?.detail).toBe('3 pojemniki po 450 g');
  });

  it('no notice within one container, without a limit, or for invalid requests', () => {
    expect(containerSplitNotice(450, 450)).toBeNull();
    expect(containerSplitNotice(200, 450)).toBeNull();
    expect(containerSplitNotice(900, null)).toBeNull();
    expect(containerSplitNotice(0, 450)).toBeNull();
  });

  it('Polish plural + gram formatting for the detail phrase', () => {
    expect(pluralPojemniki(2)).toBe('pojemniki');
    expect(pluralPojemniki(4)).toBe('pojemniki');
    expect(pluralPojemniki(5)).toBe('pojemników');
    expect(pluralPojemniki(12)).toBe('pojemników');
    expect(pluralPojemniki(22)).toBe('pojemniki');
    expect(formatGrams(450)).toBe('450');
    expect(formatGrams(333.3)).toBe('333,3');
  });
});

/* ------------------------------------------------------------------ */
/* §8.5 lines                                                          */
/* ------------------------------------------------------------------ */

describe('§8.5 auto-config lines — honest amount variant', () => {
  it('a trustworthy amount uses the spec line', () => {
    expect(autoConfigLines(deriveMachineSetup(NINJA_CREAMI_SCOOP_SWIRL_NC7))).toEqual([
      'Rozpoznano urządzenie',
      'Ustawiono właściwą ilość',
      'Dopasowano sposób przygotowania',
      'Przygotowano Studio',
    ]);
  });

  it('no trustworthy amount → the honest user-choice line (never a fake claim)', () => {
    const lines = autoConfigLines(deriveMachineSetup(MAGIMIX_GELATO_EXPERT));
    expect(lines[1]).toBe(copy.autoConfig.amountUserChoice);
    expect(lines).not.toContain(copy.autoConfig.amountSet);
  });
});

/* ------------------------------------------------------------------ */
/* §7.3 context view + §8.6 profile view                               */
/* ------------------------------------------------------------------ */

describe('§7.3 context view — vessel from the catalog record OR the user’s own container', () => {
  it('NC7: name + catalog vessel + carried derived grams', () => {
    const view = buildMachineContextView(recordFor(NINJA_CREAMI_SCOOP_SWIRL_NC7.id));
    expect(view).toEqual({
      name: 'Ninja CREAMi Scoop & Swirl',
      vesselMl: 480,
      recommendedBatchGrams: 460,
    });
  });

  it('a declared own container overrides the catalog vessel + its recommendation (§8)', () => {
    const own = withCustomContainer(
      recordFor(NINJA_CREAMI_DELUXE_NC502EU.id),
      { capacityMl: 500, recommendedBatchGrams: 470 },
      '2026-07-17T13:00:00.000Z',
    );
    if (own === null) throw new Error('expected record');
    const view = buildMachineContextView(own);
    expect(view?.vesselMl).toBe(500); // the user's own container, not the 706 catalog figure
    expect(view?.recommendedBatchGrams).toBe(470);
  });

  it('a machine without a vessel figure yields name-only (null vessel)', () => {
    const view = buildMachineContextView(recordFor(KITCHENAID_5KSMICM.id));
    expect(view?.name).toBe('KitchenAid Ice Cream Maker');
    expect(view?.vesselMl).toBeNull();
    expect(view?.recommendedBatchGrams).toBe(1330); // carried for batch surfaces only
  });

  it('a saved Deluxe record shows the vessel and the owner-pinned 670 g (final decision)', () => {
    const view = buildMachineContextView(recordFor(NINJA_CREAMI_DELUXE_NC502EU.id));
    expect(view).toEqual({
      name: 'Ninja CREAMi Deluxe',
      vesselMl: 706,
      recommendedBatchGrams: 670,
    });
  });

  it('a stale catalog id resolves to null — never invented data', () => {
    const record = recordFor(NINJA_CREAMI_SCOOP_SWIRL_NC7.id);
    expect(buildMachineContextView(record, [])).toBeNull();
  });
});

// The §8.6 profile SECTION view moved to machineSettingsView.ts with the owner
// hotfix (2026-07-17) — its pins live in machineSettings.test.ts.
