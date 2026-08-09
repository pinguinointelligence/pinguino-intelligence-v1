import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { useProductionSessionStore } from './productionSessionStore';

const recipe = (): RecipeInput => ({
  items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
  mode: 'classic',
  category: DEFAULT_PRESET.category,
  target_temperature_c: DEFAULT_PRESET.target_temperature_c,
  target_batch_grams: DEFAULT_PRESET.target_batch_grams,
  machine_capacity_grams: null,
});

const start = () =>
  useProductionSessionStore.getState().ensureSession({
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

  it('survives component/tab remounts and refuses to replace an active run', () => {
    start();
    const first = useProductionSessionStore.getState().session!;
    const line = first.lines[0]!;
    useProductionSessionStore.getState().setDraftActual(line.lineId, line.plannedGrams + 2);
    useProductionSessionStore.getState().confirmLine(line.lineId, '2026-08-09T10:01:00.000Z');

    useProductionSessionStore.getState().ensureSession({
      ownerUserId: 'owner-a',
      source: { ...first.source, recipeName: 'changed draft' },
      plannedInput: { ...recipe(), target_batch_grams: 2000 },
      now: '2026-08-09T10:02:00.000Z',
      sessionId: 'must-not-replace',
    });
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

  it('never reuses an in-progress session owned by another account', () => {
    start();
    useProductionSessionStore.getState().ensureSession({
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
  });
});
