import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import {
  migrateProductionSessionStore,
  productionSessionAddressKey,
  productionSessionForAddress,
  useProductionSessionStore,
} from './productionSessionStore';

const recipe = (): RecipeInput => ({
  items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
  mode: 'classic',
  category: DEFAULT_PRESET.category,
  target_temperature_c: DEFAULT_PRESET.target_temperature_c,
  target_batch_grams: DEFAULT_PRESET.target_batch_grams,
  machine_capacity_grams: null,
});

const start = () =>
  useProductionSessionStore.getState().startNewSession({
    ownerUserId: 'owner-a',
    source: {
      recipeId: 'recipe-a',
      recipeVersionId: 'version-a',
      recipeVersionNumber: 1,
      recipeName: 'A',
    },
    plannedInput: recipe(),
    now: '2026-08-09T10:00:00.000Z',
    sessionId: 'run-a',
  });

describe('production session store', () => {
  beforeEach(() => useProductionSessionStore.getState().clear());

  it('survives component/tab remounts without implicitly replacing an active run', () => {
    start();
    const first = useProductionSessionStore.getState().session!;
    const line = first.lines[0]!;
    useProductionSessionStore.getState().setDraftActual(line.lineId, line.plannedGrams + 2);
    useProductionSessionStore.getState().confirmLine(line.lineId, '2026-08-09T10:01:00.000Z');

    // A render/remount does not call any store mutation. Only the explicit start action
    // may replace this session; the workspace separately blocks a stale fingerprint.
    const restored = useProductionSessionStore.getState().session!;
    expect(restored.sessionId).toBe('run-a');
    expect(restored.lines[0]!.physicalAddedGrams).toBe(line.plannedGrams + 2);
  });

  it('clears owner-bound data explicitly', () => {
    start();
    expect(useProductionSessionStore.getState().session?.ownerUserId).toBe('owner-a');
    useProductionSessionStore.getState().clear();
    expect(useProductionSessionStore.getState().session).toBeNull();
    expect(useProductionSessionStore.getState().sessionsById).toEqual({});
    expect(useProductionSessionStore.getState().selectedSessionIdByAddress).toEqual({});
    expect(useProductionSessionStore.getState().activeAddressKey).toBeNull();
  });

  it('restores one server-authoritative run without archiving the same local identity', () => {
    start();
    const durable = {
      ...structuredClone(useProductionSessionStore.getState().session!),
      startedAt: '2026-08-09T09:59:00.000Z',
    };
    useProductionSessionStore.getState().restoreDurableSession(durable);
    expect(useProductionSessionStore.getState().session?.startedAt).toBe(
      '2026-08-09T09:59:00.000Z',
    );
    expect(useProductionSessionStore.getState().archivedSessions).toHaveLength(0);
  });

  it('keeps parallel runs indexed by UUID without locally archiving the prior run', () => {
    start();
    useProductionSessionStore.getState().startNewSession({
      ownerUserId: 'owner-b',
      source: {
        recipeId: 'recipe-b',
        recipeVersionId: 'version-b',
        recipeVersionNumber: 1,
        recipeName: 'B',
      },
      plannedInput: recipe(),
      now: '2026-08-09T11:00:00.000Z',
      sessionId: 'run-b',
    });

    expect(useProductionSessionStore.getState().session).toMatchObject({
      sessionId: 'run-b',
      ownerUserId: 'owner-b',
    });
    expect(useProductionSessionStore.getState().archivedSessions).toHaveLength(0);
    expect(Object.keys(useProductionSessionStore.getState().sessionsById).sort()).toEqual([
      'run-a',
      'run-b',
    ]);
  });

  it('archives a stale session without destroying its frozen physical record', () => {
    start();
    const original = structuredClone(useProductionSessionStore.getState().session!);
    useProductionSessionStore.getState().archiveCurrentSession();

    expect(useProductionSessionStore.getState().session).toBeNull();
    expect(useProductionSessionStore.getState().archivedSessions).toEqual([original]);
  });

  it('accepts only a server-confirmed replacement for the same durable run', () => {
    start();
    const current = useProductionSessionStore.getState().session!;
    useProductionSessionStore.getState().replaceSession({
      ...current,
      internalProductionNote: 'server-confirmed',
    });
    expect(useProductionSessionStore.getState().session?.internalProductionNote).toBe(
      'server-confirmed',
    );
    expect(() =>
      useProductionSessionStore.getState().replaceSession({
        ...current,
        sessionId: 'different-run',
      }),
    ).toThrow(/different Production run/);
  });

  it('upgrades a persisted v4 session with zeroed durable revision bases', () => {
    start();
    const current = structuredClone(useProductionSessionStore.getState().session!);
    const legacy = structuredClone(current) as Omit<
      typeof current,
      'durableRescueRevision' | 'durableActualRevision'
    > &
      Partial<Pick<typeof current, 'durableRescueRevision' | 'durableActualRevision'>>;
    delete legacy.durableRescueRevision;
    delete legacy.durableActualRevision;
    const migrated = migrateProductionSessionStore({ session: legacy, archivedSessions: [] }, 4);

    expect(migrated.session).toBeNull();
    expect(migrated.sessionsById[current.sessionId]).toMatchObject({
      durableRescueRevision: 0,
      durableActualRevision: 0,
    });
  });

  it('upgrades a persisted v6 session without losing the accepted degassing state', () => {
    start();
    const current = structuredClone(useProductionSessionStore.getState().session!);
    const legacy = structuredClone(current) as typeof current & {
      lastDeviationDecision?: typeof current.lastDeviationDecision;
    };
    Reflect.deleteProperty(legacy, 'lastDeviationDecision');
    for (const line of [...legacy.lines, ...legacy.addonLines]) {
      Reflect.deleteProperty(line, 'draftActualEdited');
    }
    legacy.degassingRequired = true;
    legacy.degassingAcknowledged = true;
    legacy.degassingAcknowledgedAt = '2026-08-25T09:00:00.000Z';
    legacy.carbonatedProductIds = ['carbonated-product-1'];

    const migrated = migrateProductionSessionStore({ session: legacy, archivedSessions: [] }, 6);

    expect(migrated.session).toBeNull();
    expect(migrated.sessionsById[current.sessionId]).toMatchObject({
      lastDeviationDecision: null,
      degassingRequired: true,
      degassingAcknowledged: true,
      degassingAcknowledgedAt: '2026-08-25T09:00:00.000Z',
      carbonatedProductIds: ['carbonated-product-1'],
    });
    expect(
      [
        ...migrated.sessionsById[current.sessionId]!.lines,
        ...migrated.sessionsById[current.sessionId]!.addonLines,
      ].every((line) => line.draftActualEdited === false),
    ).toBe(true);
  });

  it('ignores a legacy singleton when the open recipe/version address is different', () => {
    start();
    const state = useProductionSessionStore.getState();

    expect(
      productionSessionForAddress(state, {
        ownerUserId: 'owner-a',
        recipeId: 'recipe-b',
        recipeVersionId: 'version-b',
      }),
    ).toBeNull();
    expect(state.sessionsById['run-a']).toEqual(state.session);
  });

  it('switches C01 ↔ C02 by exact address and preserves both run UUIDs', () => {
    start();
    const runA = useProductionSessionStore.getState().session!;
    useProductionSessionStore.getState().startNewSession({
      ownerUserId: 'owner-a',
      source: {
        recipeId: 'recipe-c02',
        recipeVersionId: 'version-c02',
        recipeVersionNumber: 1,
        recipeName: 'C02',
      },
      plannedInput: recipe(),
      now: '2026-09-08T11:00:00.000Z',
      sessionId: 'run-b',
    });
    const runB = useProductionSessionStore.getState().session!;

    useProductionSessionStore.getState().activateSessionForAddress({
      ownerUserId: 'owner-a',
      recipeId: 'recipe-a',
      recipeVersionId: 'version-a',
    });
    expect(useProductionSessionStore.getState().session).toEqual(runA);

    useProductionSessionStore.getState().activateSessionForAddress({
      ownerUserId: 'owner-a',
      recipeId: 'recipe-c02',
      recipeVersionId: 'version-c02',
    });
    expect(useProductionSessionStore.getState().session).toEqual(runB);
    expect(useProductionSessionStore.getState().archivedSessions).toEqual([]);
  });

  it('rehydrates two tabs from the same persisted index without swapping C01 and C02', () => {
    start();
    const runA = useProductionSessionStore.getState().session!;
    useProductionSessionStore.getState().startNewSession({
      ownerUserId: 'owner-a',
      source: {
        recipeId: 'recipe-c02',
        recipeVersionId: 'version-c02',
        recipeVersionNumber: 1,
        recipeName: 'C02',
      },
      plannedInput: recipe(),
      now: '2026-09-08T11:00:00.000Z',
      sessionId: 'run-b',
    });
    const runB = useProductionSessionStore.getState().session!;
    const persisted = {
      session: null,
      activeAddressKey: null,
      sessionsById: structuredClone(useProductionSessionStore.getState().sessionsById),
      selectedSessionIdByAddress: structuredClone(
        useProductionSessionStore.getState().selectedSessionIdByAddress,
      ),
    };

    expect(
      productionSessionForAddress(persisted, {
        ownerUserId: 'owner-a',
        recipeId: 'recipe-a',
        recipeVersionId: 'version-a',
      }),
    ).toEqual(runA);
    expect(
      productionSessionForAddress(persisted, {
        ownerUserId: 'owner-a',
        recipeId: 'recipe-c02',
        recipeVersionId: 'version-c02',
      }),
    ).toEqual(runB);
  });

  it('discards a late C01 recovery after C02 became the active projection', () => {
    start();
    const runABefore = structuredClone(useProductionSessionStore.getState().session!);
    const lateRunA = {
      ...runABefore,
      internalProductionNote: 'late C01 response',
    };
    useProductionSessionStore.getState().startNewSession({
      ownerUserId: 'owner-a',
      source: {
        recipeId: 'recipe-c02',
        recipeVersionId: 'version-c02',
        recipeVersionNumber: 1,
        recipeName: 'C02',
      },
      plannedInput: recipe(),
      now: '2026-09-08T11:00:00.000Z',
      sessionId: 'run-b',
    });
    const runB = useProductionSessionStore.getState().session!;

    useProductionSessionStore.getState().restoreDurableSession(lateRunA, {
      ownerUserId: 'owner-a',
      recipeId: 'recipe-a',
      recipeVersionId: 'version-a',
    });

    expect(useProductionSessionStore.getState().session).toEqual(runB);
    expect(useProductionSessionStore.getState().sessionsById['run-a']).toEqual(runABefore);
  });

  it('does not repopulate the cleared account projection from a late response', () => {
    start();
    const lateRun = structuredClone(useProductionSessionStore.getState().session!);
    const address = {
      ownerUserId: 'owner-a',
      recipeId: 'recipe-a',
      recipeVersionId: 'version-a',
    };

    useProductionSessionStore.getState().clear();
    useProductionSessionStore.getState().restoreDurableSession(lateRun, address);

    expect(useProductionSessionStore.getState().session).toBeNull();
    expect(useProductionSessionStore.getState().sessionsById).toEqual({});
  });

  it('migrates the v9 singleton into an exact address pointer without activating it', () => {
    start();
    const legacy = structuredClone(useProductionSessionStore.getState().session!);
    const migrated = migrateProductionSessionStore({ session: legacy, archivedSessions: [] }, 9);
    const address = {
      ownerUserId: 'owner-a',
      recipeId: 'recipe-a',
      recipeVersionId: 'version-a',
    };

    expect(migrated.session).toBeNull();
    expect(migrated.sessionsById).toEqual({ 'run-a': legacy });
    expect(migrated.selectedSessionIdByAddress[productionSessionAddressKey(address)]).toBe('run-a');
  });

  it('does not expose a browser action that can apply a local Rescue candidate', () => {
    start();
    expect('applyVerifiedRescue' in useProductionSessionStore.getState()).toBe(false);
  });
});
