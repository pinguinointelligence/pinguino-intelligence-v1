/**
 * Machine preference — record builder honesty (derived grams with provenance
 * / honest none; §8.6 fields), the corrupt-safe parser, and the versioned
 * device-local (localStorage) adapter round-trip.
 */
import { describe, expect, it } from 'vitest';
import {
  KITCHENAID_5KSMICM,
  MACHINE_CATALOG_VERSION,
  MAGIMIX_GELATO_EXPERT,
  NINJA_CREAMI_NC302EU,
  NINJA_CREAMI_SCOOP_SWIRL_NC7,
  HOME_BATCH_RULE_VERSION,
  buildCustomMachineProfile,
  type HomeMachineProfile,
} from '@/features/machine-catalog';
import {
  MACHINE_PREFERENCE_SCHEMA_VERSION,
  buildMachinePreferenceRecord,
  parseMachinePreferenceRecord,
  type MachinePreferenceRecord,
} from './preferenceContracts';
import {
  MACHINE_PREFERENCE_STORAGE_KEY,
  MachinePreferenceWriteError,
  localStorageMachinePreferenceStore,
  userScopedMachineKey,
  type StorageLike,
} from './localStorageMachinePreferenceStore';

const NOW = '2026-07-17T12:00:00.000Z';

function buildFor(profile: HomeMachineProfile, isCustom = false): MachinePreferenceRecord {
  const record = buildMachinePreferenceRecord({
    profile,
    isCustom,
    setAt: NOW,
    catalogVersion: MACHINE_CATALOG_VERSION,
  });
  if (record === null) throw new Error('expected a record');
  return record;
}

/** Simple in-memory Storage double (vitest runs in a node environment). */
function fakeStorage(initial: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

describe('buildMachinePreferenceRecord — §8.6 fields, honest batch', () => {
  it('catalog machine (NC7): mode, market, capacity snapshot and DERIVED grams with provenance', () => {
    const record = buildFor(NINJA_CREAMI_SCOOP_SWIRL_NC7);
    expect(record.schemaVersion).toBe(MACHINE_PREFERENCE_SCHEMA_VERSION);
    expect(record.selection).toEqual({
      kind: 'catalog',
      machineProfileId: 'ninja-creami-scoop-swirl-nc7-eu-es',
    });
    expect(record.market).toBe('EU/ES');
    expect(record.resolvedTechnology).toBe('respin_soft');
    expect(record.resolvedVisibleMode).toBe('ninja_swirl');
    expect(record.capacity).toEqual({
      vesselCapacityMl: 480,
      maximumLiquidMixMl: null,
      workingCapacityMl: null,
      manufacturerMaxMixGrams: null,
      vesselCount: null,
      maxFillDefinedByManufacturer: false,
    });
    expect(record.defaultBatch).toEqual({
      kind: 'grams',
      grams: 460,
      source: 'respin_vessel_ml',
      safetyFactorApplied: 0.95,
      ruleVersion: HOME_BATCH_RULE_VERSION,
      estimated: false,
    });
    expect(record.setAt).toBe(NOW);
    expect(record.catalogVersion).toBe(MACHINE_CATALOG_VERSION);
  });

  it('KitchenAid saves the official-max-mix-derived grams; Magimix saves an honest none', () => {
    expect(buildFor(KITCHENAID_5KSMICM).defaultBatch).toEqual({
      kind: 'grams',
      grams: 1330,
      source: 'maximum_liquid_mix_ml',
      safetyFactorApplied: 0.95,
      ruleVersion: HOME_BATCH_RULE_VERSION,
      estimated: false,
    });
    expect(buildFor(MAGIMIX_GELATO_EXPERT).defaultBatch).toEqual({ kind: 'none' });
  });

  it('a conflicted machine saves NO grams (never an invented number)', () => {
    // Owner final decision closed the REAL Ninja disputes (they now derive
    // grams) — the rule is probed with a synthetic conflicted record.
    const probe = {
      ...NINJA_CREAMI_NC302EU,
      id: 'probe-conflicted',
      specificationStatus: 'conflicting_sources' as const,
      sourceConflicts: [
        { field: 'vesselCapacityMl' as const, candidatesMl: [473, 450], note: 'probe' },
      ],
      active: false,
    };
    expect(buildFor(probe).defaultBatch).toEqual({ kind: 'none' });
    // And the real record now saves the owner-pinned derivation.
    expect(buildFor(NINJA_CREAMI_NC302EU).defaultBatch).toMatchObject({ kind: 'grams', grams: 450 });
  });

  it('a custom machine embeds the user_declared profile and the ESTIMATED derived grams', () => {
    const custom = buildCustomMachineProfile({
      behaviorAnswerId: 'freeze_mixture_first',
      market: 'ES',
      brand: 'Acme',
      vesselCapacity: { value: 473, unit: 'ml' },
    });
    if (custom.outcome !== 'profile') throw new Error('expected profile');
    const record = buildFor(custom.profile, true);
    expect(record.selection.kind).toBe('custom');
    if (record.selection.kind !== 'custom') throw new Error('expected custom');
    expect(record.selection.customProfile.specificationSource).toBe('user_declared');
    expect(record.defaultBatch).toEqual({
      kind: 'grams',
      grams: 450,
      source: 'respin_vessel_ml',
      safetyFactorApplied: 0.95,
      ruleVersion: HOME_BATCH_RULE_VERSION,
      estimated: true,
    });
  });
});

/* ------------------------------------------------------------------ */
/* Parser — corrupt-data safety                                        */
/* ------------------------------------------------------------------ */

describe('parseMachinePreferenceRecord — strict, corrupt-safe', () => {
  const valid = buildFor(NINJA_CREAMI_SCOOP_SWIRL_NC7);

  it('round-trips a valid record through JSON', () => {
    expect(parseMachinePreferenceRecord(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
  });

  it('rejects unknown schema versions, wrong shapes and nonsense values', () => {
    expect(parseMachinePreferenceRecord(null)).toBeNull();
    expect(parseMachinePreferenceRecord('gibberish')).toBeNull();
    expect(parseMachinePreferenceRecord({})).toBeNull();
    expect(parseMachinePreferenceRecord({ ...valid, schemaVersion: 999 })).toBeNull();
    expect(parseMachinePreferenceRecord({ ...valid, market: '' })).toBeNull();
    expect(parseMachinePreferenceRecord({ ...valid, resolvedTechnology: 'continuous_soft_serve' })).toBeNull();
    // Technology/mode mismatch is corruption, not something to repair.
    expect(parseMachinePreferenceRecord({ ...valid, resolvedVisibleMode: 'fresh' })).toBeNull();
    expect(parseMachinePreferenceRecord({ ...valid, setAt: 'not-a-date' })).toBeNull();
    expect(parseMachinePreferenceRecord({ ...valid, catalogVersion: '' })).toBeNull();
  });

  it('rejects malformed batch shapes (bad source, bad factor pairing, negative grams)', () => {
    const withBatch = (defaultBatch: unknown) => ({ ...valid, defaultBatch });
    expect(parseMachinePreferenceRecord(withBatch({ kind: 'grams', grams: -1 }))).toBeNull();
    expect(
      parseMachinePreferenceRecord(
        withBatch({
          kind: 'grams',
          grams: 460,
          source: 'made_up_source',
          safetyFactorApplied: 0.95,
          ruleVersion: 'x',
          estimated: false,
        }),
      ),
    ).toBeNull();
    // Rule-1 grams must be factor-less; factor sources must carry the factor.
    expect(
      parseMachinePreferenceRecord(
        withBatch({
          kind: 'grams',
          grams: 500,
          source: 'manufacturer_max_mix_grams',
          safetyFactorApplied: 0.95,
          ruleVersion: 'x',
          estimated: false,
        }),
      ),
    ).toBeNull();
    expect(
      parseMachinePreferenceRecord(
        withBatch({
          kind: 'grams',
          grams: 460,
          source: 'respin_vessel_ml',
          safetyFactorApplied: null,
          ruleVersion: 'x',
          estimated: false,
        }),
      ),
    ).toBeNull();
    expect(parseMachinePreferenceRecord(withBatch({ kind: 'ml_suggestion', ml: 900 }))).toBeNull();
  });

  it('rejects a custom selection whose embedded profile fails the catalog invariants', () => {
    const custom = buildCustomMachineProfile({
      behaviorAnswerId: 'machine_cools_itself',
      market: 'ES',
    });
    if (custom.outcome !== 'profile') throw new Error('expected profile');
    const record = buildFor(custom.profile, true);
    const raw = JSON.parse(JSON.stringify(record)) as {
      selection: { customProfile: { preFreezeTarget: string; specificationSource: string } };
    };
    raw.selection.customProfile.preFreezeTarget = 'bowl'; // compressor + bowl = invalid
    expect(parseMachinePreferenceRecord(raw)).toBeNull();
    const raw2 = JSON.parse(JSON.stringify(record)) as {
      selection: { customProfile: { specificationSource: string } };
    };
    raw2.selection.customProfile.specificationSource = 'manufacturer_official'; // custom must be user_declared
    expect(parseMachinePreferenceRecord(raw2)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* localStorage adapter                                                */
/* ------------------------------------------------------------------ */

describe('localStorage adapter — versioned key, round-trip, corruption safety', () => {
  const record = buildFor(NINJA_CREAMI_SCOOP_SWIRL_NC7);

  it('uses the versioned key and round-trips save → load → clear', async () => {
    const storage = fakeStorage();
    const store = localStorageMachinePreferenceStore(storage);
    expect(await store.load()).toBeNull();
    await store.save(record);
    expect(storage.map.has(MACHINE_PREFERENCE_STORAGE_KEY)).toBe(true);
    expect(await store.load()).toEqual(record);
    await store.clear();
    expect(await store.load()).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  it('corrupt JSON loads as null AND the poison entry is removed', async () => {
    const storage = fakeStorage({ [MACHINE_PREFERENCE_STORAGE_KEY]: '{not json' });
    const store = localStorageMachinePreferenceStore(storage);
    expect(await store.load()).toBeNull();
    expect(storage.map.has(MACHINE_PREFERENCE_STORAGE_KEY)).toBe(false);
  });

  it('a foreign/stale shape loads as null and is removed (never repaired)', async () => {
    const storage = fakeStorage({
      [MACHINE_PREFERENCE_STORAGE_KEY]: JSON.stringify({ schemaVersion: 0, hello: 'world' }),
    });
    const store = localStorageMachinePreferenceStore(storage);
    expect(await store.load()).toBeNull();
    expect(storage.map.has(MACHINE_PREFERENCE_STORAGE_KEY)).toBe(false);
  });

  it('a throwing storage loads as null; saving without storage throws the typed error', async () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const store = localStorageMachinePreferenceStore(throwing);
    expect(await store.load()).toBeNull();
    await expect(store.save(record)).rejects.toBeInstanceOf(MachinePreferenceWriteError);

    const absent = localStorageMachinePreferenceStore(null);
    expect(await absent.load()).toBeNull();
    await expect(absent.save(record)).rejects.toBeInstanceOf(MachinePreferenceWriteError);
    await absent.clear(); // no-throw
  });
});

/* ------------------------------------------------------------------ */
/* User-scoped device key — one account's machine never leaks to       */
/* another on the SAME browser (owner P0 2026-07-18).                  */
/* ------------------------------------------------------------------ */

describe('userScopedMachineKey — per-account device isolation', () => {
  const machine = buildFor(NINJA_CREAMI_SCOOP_SWIRL_NC7);

  it('anonymous sessions keep the legacy unscoped key (no forced re-onboarding)', () => {
    expect(userScopedMachineKey(null)).toBe(MACHINE_PREFERENCE_STORAGE_KEY);
    expect(userScopedMachineKey(undefined)).toBe(MACHINE_PREFERENCE_STORAGE_KEY);
  });

  it('a signed-in user gets a namespaced key distinct from other users and from anon', () => {
    const keyA = userScopedMachineKey('user-a');
    const keyB = userScopedMachineKey('user-b');
    expect(keyA).toBe(`${MACHINE_PREFERENCE_STORAGE_KEY}::user-a`);
    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(MACHINE_PREFERENCE_STORAGE_KEY);
  });

  it("REGRESSION: Home's saved machine is invisible under Pro's key on the same browser", async () => {
    // The owner-proven bug: log in as Home, pick Ninja CREAMi, log in as Pro on
    // the same device → Pro inherited Home's machine because the key was global.
    // With the scoped key, the same physical storage keeps the two accounts apart.
    const storage = fakeStorage();
    const homeStore = localStorageMachinePreferenceStore(storage, userScopedMachineKey('home-user'));
    const proStore = localStorageMachinePreferenceStore(storage, userScopedMachineKey('pro-user'));

    await homeStore.save(machine);
    expect(await homeStore.load()).toEqual(machine); // Home still sees its own machine
    expect(await proStore.load()).toBeNull(); // Pro does NOT inherit it

    // The two records coexist under distinct keys; clearing one leaves the other.
    await proStore.save(machine);
    await homeStore.clear();
    expect(await homeStore.load()).toBeNull();
    expect(await proStore.load()).toEqual(machine);
  });
});
