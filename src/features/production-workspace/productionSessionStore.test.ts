import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { migrateProductionSessionStore, useProductionSessionStore } from './productionSessionStore';

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

  it('starts a different owner session only after an explicit start action', () => {
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
    expect(useProductionSessionStore.getState().archivedSessions).toHaveLength(1);
    expect(useProductionSessionStore.getState().archivedSessions[0]?.sessionId).toBe('run-a');
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
    const migrated = migrateProductionSessionStore(
      { session: legacy, archivedSessions: [] },
      4,
    ) as {
      session: typeof current;
    };

    expect(migrated.session).toMatchObject({
      durableRescueRevision: 0,
      durableActualRevision: 0,
    });
  });

  it('does not expose a browser action that can apply a local Rescue candidate', () => {
    start();
    expect('applyVerifiedRescue' in useProductionSessionStore.getState()).toBe(false);
  });
});
