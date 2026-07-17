/**
 * „Moja maszyna” settings + the user's own default batch — OWNER HOTFIX
 * (2026-07-17: „PILNA POPRAWKA UX — PROFIL MASZYNY I EDYCJA DOMYŚLNEGO WSADU”).
 *
 * Pins the owner's §11 test list end-to-end on the REAL catalog + real record
 * machinery (no hand-built fixtures):
 *   1. picking the Deluxe shows the 670 g recommendation;
 *   2. the default-batch field is editable;
 *   3–5. the user can set 600 g, saving persists it, reloading shows 600 g;
 *   6. a new recipe starts from 600 g;
 *   7. „Przywróć zalecany wsad” restores 670 g;
 *   8. changing one recipe's amount never rewrites the profile;
 *   9. „Zapisz jako domyślną” changes it deliberately;
 *  10–11. above the recommendation → warning, no block, keep-mine preserved;
 *  12. „Przejdź do receptury” is offered;
 *  13. the manufacturer's 706 ml is not editable without „Używam innego pojemnika”.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  MACHINE_CATALOG_VERSION,
  NINJA_CREAMI_DELUXE_NC502EU,
  NINJA_CREAMI_SCOOP_SWIRL_NC7,
} from '@/features/machine-catalog';
import { createCustomerFlow, resolveBatch } from '@/features/customer-flow';
import { applyMachineRecordToFlow } from '@/features/customer-shell/machineFlowBridge';
import { machineOnboardingCopy as copy } from './machineOnboardingCopy';
import {
  buildMachineSettingsView,
  parseGramsInput,
  suggestRecommendedGramsForContainer,
} from './machineSettingsView';
import {
  buildMachinePreferenceRecord,
  effectiveDefaultBatchGrams,
  parseMachinePreferenceRecord,
  recommendedBatchGramsOf,
  usesCustomDefaultBatch,
  withCustomContainer,
  withUserDefaultBatch,
  type MachinePreferenceRecord,
} from './preferenceContracts';
import { localStorageMachinePreferenceStore, type StorageLike } from './localStorageMachinePreferenceStore';
import { deriveBatchGuidance } from './batchGuidance';
import { MachineProfileSection } from './ui/MachineProfileSection';
import { MachineAdjustBatchStep } from './ui/MachineAdjustBatchStep';

const NOW = '2026-07-17T12:00:00.000Z';
const LATER = '2026-07-17T13:30:00.000Z';

const deluxeRecord = (): MachinePreferenceRecord => {
  const record = buildMachinePreferenceRecord({
    profile: NINJA_CREAMI_DELUXE_NC502EU,
    isCustom: false,
    setAt: NOW,
    catalogVersion: MACHINE_CATALOG_VERSION,
  });
  if (record === null) throw new Error('expected a Deluxe record');
  return record;
};

/** A real in-memory Storage — the adapter's own parse/serialize path runs. */
function memoryStorage(): StorageLike & { dump: () => string | null } {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_k, v) => {
      value = v;
    },
    removeItem: () => {
      value = null;
    },
    dump: () => value,
  };
}

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const noop = () => undefined;
const okSave = async () => true;

/* ------------------------------------------------------------------ */
/* Owner tests 1–2 — the recommendation and the editable field         */
/* ------------------------------------------------------------------ */

describe('owner test 1–2 — Deluxe proposes 670 g in an EDITABLE field', () => {
  it('the settings view carries 706 ml (read-only) + the 670 g proposal', () => {
    const view = buildMachineSettingsView(deluxeRecord());
    expect(view?.container).toEqual({
      label: copy.settings.manufacturerCapacityLabel,
      capacityMl: 706,
      editable: false, // owner test 13 — a model parameter, not a user setting
    });
    expect(view?.recommendedGrams).toBe(670);
    expect(view?.userDefaultGrams).toBe(670); // prefill follows the proposal
    expect(view?.usesOwnDefault).toBe(false);
  });

  it('renders the manufacturer figure, the proposal and an editable own-default input', () => {
    const view = buildMachineSettingsView(deluxeRecord());
    if (view === null) throw new Error('expected view');
    const html = render(
      <MachineProfileSection view={view} onSetUp={noop} onChange={noop} onSave={okSave} onGoToRecipe={noop} />,
    );
    expect(html).toContain(`${copy.settings.manufacturerCapacityLabel}`);
    expect(html).toContain('706 ml');
    expect(html).toContain(copy.batch.recommendedLabel);
    expect(html).toContain('670 g');
    // The user's own default is a real, enabled input seeded with 670.
    expect(html).toContain(copy.settings.userDefaultLabel);
    expect(html).toMatch(/<input[^>]+value="670"/);
    expect(html).not.toMatch(/<input[^>]+value="670"[^>]*disabled/);
  });

  it('parses gram input honestly (comma decimals, empty = follow the proposal)', () => {
    expect(parseGramsInput('600')).toBe(600);
    expect(parseGramsInput('333,3')).toBe(333.3);
    expect(parseGramsInput('')).toBeNull();
    expect(parseGramsInput('0')).toBe('invalid');
    expect(parseGramsInput('-5')).toBe('invalid');
    expect(parseGramsInput('abc')).toBe('invalid');
  });
});

/* ------------------------------------------------------------------ */
/* Owner tests 3–5 — set 600 g, save, reload                           */
/* ------------------------------------------------------------------ */

describe('owner tests 3–5 — the user sets 600 g, it saves and survives a reload', () => {
  it('withUserDefaultBatch records 600 g and stamps updatedAt', () => {
    const next = withUserDefaultBatch(deluxeRecord(), 600, LATER);
    expect(next?.userDefaultBatchGrams).toBe(600);
    expect(next?.updatedAt).toBe(LATER);
    expect(next?.setAt).toBe(NOW); // the machine choice keeps its own timestamp
    // The recommendation is untouched — it is PINGÜINO's, not the user's.
    expect(recommendedBatchGramsOf(next!)).toBe(670);
    expect(effectiveDefaultBatchGrams(next!)).toBe(600);
    expect(usesCustomDefaultBatch(next!)).toBe(true);
  });

  it('the machine-change proposal follows §5 — effective default, NOT the raw recommendation (M1)', () => {
    // handleMachineChosen computes its proposal via effectiveDefaultBatchGrams
    // (the same contract machineFlowBridge uses). A record carrying the own
    // default the adjust step captured must propose THAT value, never the
    // recommendation the user just overrode.
    const changed = withUserDefaultBatch(deluxeRecord(), 600, LATER);
    if (changed === null) throw new Error('expected record');
    expect(effectiveDefaultBatchGrams(changed)).toBe(600);
    // The regression the reviewer found was a raw `defaultBatch.grams` read —
    // which would give 670. Guard that they genuinely differ here.
    expect(changed.defaultBatch.kind === 'grams' && changed.defaultBatch.grams).toBe(670);
    expect(effectiveDefaultBatchGrams(changed)).not.toBe(
      changed.defaultBatch.kind === 'grams' ? changed.defaultBatch.grams : null,
    );
  });

  it('a real save→reload round-trip through the device store returns 600 g', async () => {
    const storage = memoryStorage();
    const store = localStorageMachinePreferenceStore(storage);
    const saved = withUserDefaultBatch(deluxeRecord(), 600, LATER);
    if (saved === null) throw new Error('expected record');
    await store.save(saved);

    const reloaded = await store.load();
    expect(reloaded?.userDefaultBatchGrams).toBe(600);
    expect(effectiveDefaultBatchGrams(reloaded!)).toBe(600);
    expect(buildMachineSettingsView(reloaded!)?.userDefaultGrams).toBe(600);
    // Persisted separately from the recommendation (owner §9).
    const rawText = storage.dump();
    expect(rawText).not.toBeNull();
    const raw = JSON.parse(rawText!) as Record<string, unknown>;
    expect(raw.userDefaultBatchGrams).toBe(600);
    expect(raw.updatedAt).toBe(LATER);
    expect((raw.defaultBatch as { grams: number }).grams).toBe(670);
  });

  it('rejects a non-positive own default instead of coercing it', () => {
    expect(withUserDefaultBatch(deluxeRecord(), 0, LATER)).toBeNull();
    expect(withUserDefaultBatch(deluxeRecord(), Number.NaN, LATER)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Owner test 6 — a new recipe starts from the user's default          */
/* ------------------------------------------------------------------ */

describe('owner test 6 — a new recipe starts from 600 g, never re-imposing 670 g', () => {
  it('applyMachineRecordToFlow uses the saved own default', () => {
    const record = withUserDefaultBatch(deluxeRecord(), 600, LATER);
    if (record === null) throw new Error('expected record');
    const flow = applyMachineRecordToFlow(createCustomerFlow({ text: 'wanilia' }), record);
    expect(flow.explicitBatchGrams).toBe(600);
    expect(resolveBatch(flow).batchGrams).toBe(600);
  });

  it('falls back to the recommendation only while the user has set none', () => {
    const flow = applyMachineRecordToFlow(createCustomerFlow({ text: 'wanilia' }), deluxeRecord());
    expect(flow.explicitBatchGrams).toBe(670);
  });
});

/* ------------------------------------------------------------------ */
/* Owner test 7 — restore                                              */
/* ------------------------------------------------------------------ */

describe('owner test 7 — „Przywróć zalecany wsad” returns to 670 g', () => {
  it('saving the proposal back means "follow the recommendation", not "my own 670"', async () => {
    // The card normalizes value===recommendation to null, so the profile keeps
    // FOLLOWING the proposal (and moves with it) instead of freezing a number.
    const view = buildMachineSettingsView(deluxeRecord());
    if (view === null) throw new Error('expected view');
    let submitted: { userDefaultGrams: number | null } | null = null;
    const html = render(
      <MachineProfileSection
        view={view}
        onSetUp={noop}
        onChange={noop}
        onSave={async (s) => {
          submitted = s;
          return true;
        }}
        onGoToRecipe={noop}
      />,
    );
    // The field is seeded with the proposal on the first paint (no blank flash).
    expect(html).toMatch(/<input[^>]+value="670"/);
    // Same normalization the §4 adjust step applies (pinned on the pure layer):
    const restored = withUserDefaultBatch(deluxeRecord(), null, LATER);
    expect(restored?.userDefaultBatchGrams).toBeNull();
    expect(effectiveDefaultBatchGrams(restored!)).toBe(670);
    expect(submitted).toBeNull(); // static render performs no save
  });

  it('clearing the own default restores the recommendation as the effective value', () => {
    const custom = withUserDefaultBatch(deluxeRecord(), 600, LATER);
    if (custom === null) throw new Error('expected record');
    const restored = withUserDefaultBatch(custom, null, LATER);
    expect(restored?.userDefaultBatchGrams).toBeNull();
    expect(effectiveDefaultBatchGrams(restored!)).toBe(670);
    expect(usesCustomDefaultBatch(restored!)).toBe(false);
    expect(buildMachineSettingsView(restored!)?.userDefaultGrams).toBe(670);
  });
});

/* ------------------------------------------------------------------ */
/* Owner tests 8–9 — recipe amount vs profile                          */
/* ------------------------------------------------------------------ */

describe('owner tests 8–9 — a recipe amount never rewrites the profile by itself', () => {
  it('changing the flow batch leaves the saved record untouched', () => {
    const record = withUserDefaultBatch(deluxeRecord(), 670, LATER);
    if (record === null) throw new Error('expected record');
    const before = JSON.stringify(record);
    // A recipe-level change is a FLOW operation — the record is not an input.
    const flow = applyMachineRecordToFlow(createCustomerFlow({ text: 'wanilia' }), record);
    expect(flow.explicitBatchGrams).toBe(670);
    expect(JSON.stringify(record)).toBe(before);
  });

  it('„Zapisz jako domyślną” is the ONLY path that moves the profile to 800 g', () => {
    const record = deluxeRecord();
    const next = withUserDefaultBatch(record, 800, LATER);
    expect(record.userDefaultBatchGrams).toBeNull(); // the original is immutable
    expect(next?.userDefaultBatchGrams).toBe(800);
    expect(effectiveDefaultBatchGrams(next!)).toBe(800);
    // The owner's copy names the exact amount being made default.
    expect(copy.recipeAmount.saveAsDefault('800')).toBe('Zapisz 800 g jako mój domyślny wsad');
  });
});

/* ------------------------------------------------------------------ */
/* Owner tests 10–11 — above the recommendation warns, never blocks    */
/* ------------------------------------------------------------------ */

describe('owner tests 10–11 — above 670 g: warning + choices, never a block', () => {
  it('the guidance warns with three open choices and no forced split', () => {
    const guidance = deriveBatchGuidance({
      recommendedGrams: 670,
      currentGrams: 800,
      choice: 'undecided',
    });
    expect(guidance).toMatchObject({ kind: 'custom_above', recommendedGrams: 670 });
    if (guidance.kind !== 'custom_above') throw new Error('expected custom_above');
    expect(guidance.split).toBeNull();
  });

  it('at the saved (recommended) value there is NO warning — it is not noise', () => {
    const view = buildMachineSettingsView(deluxeRecord());
    if (view === null) throw new Error('expected view');
    const html = render(
      <MachineProfileSection view={view} onSetUp={noop} onChange={noop} onSave={okSave} onGoToRecipe={noop} />,
    );
    expect(html).not.toContain(copy.batch.aboveWarning);
  });

  it('RENDERS the exact warning + the three actions when the saved default is above the recommendation', () => {
    // The card seeds its field from the SAVED userDefaultGrams, so a record
    // whose own default (800) exceeds the recommendation (670) reaches the
    // above-recommendation warning at first paint — the static-markup harness
    // then proves the JSX actually emits it (adversarial review #1: the old
    // test asserted the warning was ABSENT and never covered the block).
    const view = buildMachineSettingsView(withUserDefaultBatch(deluxeRecord(), 800, LATER)!);
    if (view === null) throw new Error('expected view');
    expect(view.userDefaultGrams).toBe(800);
    expect(view.recommendedGrams).toBe(670);
    const html = render(
      <MachineProfileSection view={view} onSetUp={noop} onChange={noop} onSave={okSave} onGoToRecipe={noop} />,
    );
    expect(html).toContain(copy.batch.aboveWarning);
    expect(html).toContain(copy.batch.splitAction);
    expect(html).toContain(copy.batch.keepMine);
    expect(html).toContain(copy.batch.restoreShort);
    // …and the warning carries role="status" so a screen reader announces it.
    expect(html).toMatch(/role="status"[^>]*>Ta ilość przekracza/);
    // The save button is present and NOT disabled — a value above the
    // recommendation warns but never blocks the save (§7). React renders a
    // boolean `disabled` as `disabled=""`; check the save button's own opening
    // tag (Tailwind `disabled:` utility classes must not be mistaken for it).
    expect(html).toContain(copy.settings.save);
    const saveTag = html.match(new RegExp(`<button[^>]*>${copy.settings.save}<`))?.[0] ?? '';
    expect(saveTag).not.toContain('disabled=""');
  });

  it('„Pozostaw moją ilość” keeps the exact amount and still saves it', async () => {
    const guidance = deriveBatchGuidance({ recommendedGrams: 670, currentGrams: 800, choice: 'keep_mine' });
    expect(guidance).toMatchObject({ kind: 'custom_above', choice: 'keep_mine', split: null });
    // Saving an above-recommendation amount is accepted, never rejected.
    const saved = withUserDefaultBatch(deluxeRecord(), 800, LATER);
    expect(saved?.userDefaultBatchGrams).toBe(800);
    const storage = memoryStorage();
    const store = localStorageMachinePreferenceStore(storage);
    await store.save(saved!);
    expect((await store.load())?.userDefaultBatchGrams).toBe(800);
  });

  it('choosing the split proposes an even plan (1340 g @ 670 → 2 × 670)', () => {
    const guidance = deriveBatchGuidance({ recommendedGrams: 670, currentGrams: 1340, choice: 'split' });
    if (guidance.kind !== 'custom_above') throw new Error('expected custom_above');
    expect(guidance.split).toMatchObject({ containers: 2, gramsPerContainer: 670 });
  });
});

/* ------------------------------------------------------------------ */
/* Owner test 12 — the next action                                     */
/* ------------------------------------------------------------------ */

describe('owner test 12 — the settings screen always offers the next step', () => {
  it('renders „Przejdź do receptury” with a saved machine', () => {
    const view = buildMachineSettingsView(deluxeRecord());
    if (view === null) throw new Error('expected view');
    const html = render(
      <MachineProfileSection view={view} onSetUp={noop} onChange={noop} onSave={okSave} onGoToRecipe={noop} />,
    );
    expect(html).toContain(copy.settings.goToRecipe);
  });

  it('the §4 adjust step ends in an explicit save-and-continue action', () => {
    const html = render(
      <MachineAdjustBatchStep
        machineName="Ninja CREAMi Deluxe"
        containerMl={706}
        recommendedGrams={670}
        submitLabel={copy.settings.saveAndGoToRecipe}
        onSubmit={noop}
      />,
    );
    expect(html).toContain(copy.settings.adjustTitle);
    expect(html).toContain('706 ml');
    expect(html).toContain('670 g');
    expect(html).toContain(copy.settings.userDefaultLabel);
    expect(html).toContain(copy.settings.saveAndGoToRecipe);
  });
});

/* ------------------------------------------------------------------ */
/* Owner test 13 — the manufacturer capacity is not casually editable  */
/* ------------------------------------------------------------------ */

describe('owner test 13 — 706 ml is a model parameter, not a personal setting', () => {
  it('the manufacturer figure is not editable and is offered only behind the explicit action', () => {
    const view = buildMachineSettingsView(deluxeRecord());
    expect(view?.container?.editable).toBe(false);
    if (view === null) throw new Error('expected view');
    const html = render(
      <MachineProfileSection view={view} onSetUp={noop} onChange={noop} onSave={okSave} onGoToRecipe={noop} />,
    );
    // No input is seeded with the manufacturer capacity…
    expect(html).not.toMatch(/<input[^>]+value="706"/);
    // …and the own-container fields appear only after the explicit action.
    expect(html).toContain(copy.settings.useCustomContainer);
    expect(html).not.toContain(copy.settings.customCapacityFieldLabel);
  });

  it('a declared own container becomes editable, marks the config and drives the proposal', () => {
    const own = withCustomContainer(
      deluxeRecord(),
      { capacityMl: 500, recommendedBatchGrams: 470 },
      LATER,
    );
    if (own === null) throw new Error('expected record');
    const view = buildMachineSettingsView(own);
    expect(view?.container).toEqual({
      label: copy.settings.customCapacityLabel,
      capacityMl: 500,
      editable: true,
    });
    expect(view?.usesOwnContainer).toBe(true);
    // The user's own container drives the recommendation AND the split limit.
    expect(recommendedBatchGramsOf(own)).toBe(470);
    expect(view?.recommendedGrams).toBe(470);
  });

  it('proposes 95% of the declared container (the sanctioned ml→g rule only)', () => {
    expect(suggestRecommendedGramsForContainer(500)).toBe(480); // 475 → nearest 10
    expect(suggestRecommendedGramsForContainer(706)).toBe(670);
    expect(suggestRecommendedGramsForContainer(0)).toBeNull();
  });

  it('rejects a half-declared container instead of completing it with a guess', () => {
    expect(withCustomContainer(deluxeRecord(), { capacityMl: 0, recommendedBatchGrams: 470 }, LATER)).toBeNull();
    expect(withCustomContainer(deluxeRecord(), { capacityMl: 500, recommendedBatchGrams: -1 }, LATER)).toBeNull();
    expect(parseMachinePreferenceRecord({ ...deluxeRecord(), customContainer: { capacityMl: 500 } })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Record evolution — a saved machine is never silently dropped        */
/* ------------------------------------------------------------------ */

describe('schema evolution — v1 records upgrade, never re-onboard the user', () => {
  it('a pre-hotfix v1 record parses as v2 with explicit nulls (no invented values)', () => {
    const v2 = deluxeRecord();
    // The exact shape the deployed build wrote before this hotfix.
    const v1 = {
      schemaVersion: 1,
      selection: v2.selection,
      market: v2.market,
      resolvedTechnology: v2.resolvedTechnology,
      resolvedVisibleMode: v2.resolvedVisibleMode,
      capacity: v2.capacity,
      defaultBatch: v2.defaultBatch,
      setAt: v2.setAt,
      catalogVersion: v2.catalogVersion,
    };
    const parsed = parseMachinePreferenceRecord(v1);
    expect(parsed).not.toBeNull();
    expect(parsed?.schemaVersion).toBe(2);
    expect(parsed?.userDefaultBatchGrams).toBeNull();
    expect(parsed?.customContainer).toBeNull();
    expect(parsed?.updatedAt).toBe(v2.setAt); // no clock invented
    expect(effectiveDefaultBatchGrams(parsed!)).toBe(670);
  });

  it('a v2 record round-trips unchanged', () => {
    const record = withUserDefaultBatch(deluxeRecord(), 600, LATER);
    if (record === null) throw new Error('expected record');
    expect(parseMachinePreferenceRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
  });

  it('still rejects corrupt own-default values and unknown versions', () => {
    const base = deluxeRecord();
    expect(parseMachinePreferenceRecord({ ...base, userDefaultBatchGrams: 0 })).toBeNull();
    expect(parseMachinePreferenceRecord({ ...base, userDefaultBatchGrams: 'dużo' })).toBeNull();
    expect(parseMachinePreferenceRecord({ ...base, updatedAt: 'wczoraj' })).toBeNull();
    expect(parseMachinePreferenceRecord({ ...base, schemaVersion: 99 })).toBeNull();
  });

  it('a fresh NC7 record follows the recommendation until the user decides', () => {
    const nc7 = buildMachinePreferenceRecord({
      profile: NINJA_CREAMI_SCOOP_SWIRL_NC7,
      isCustom: false,
      setAt: NOW,
      catalogVersion: MACHINE_CATALOG_VERSION,
    });
    expect(nc7?.userDefaultBatchGrams).toBeNull();
    expect(nc7?.customContainer).toBeNull();
    expect(nc7?.updatedAt).toBe(NOW);
    expect(effectiveDefaultBatchGrams(nc7!)).toBe(460);
  });
});
