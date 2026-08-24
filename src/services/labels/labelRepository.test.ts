import { beforeEach, describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import {
  completeProductionSession,
  confirmProductionLine,
  createProductionSession,
  type ProductionCompletionSnapshot,
} from '@/features/production-workspace/productionSession';
import { buildMasterLabelData } from '@/features/master-label/masterLabel';
import {
  defaultAccountLabelProfile,
  inMemoryLabelRepository,
  resetInMemoryLabelRepositoryForTests,
} from './labelRepository';

function completedSnapshot(ownerUserId: string, sessionId: string): ProductionCompletionSnapshot {
  const input: RecipeInput = {
    items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
    mode: DEFAULT_PRESET.mode,
    category: DEFAULT_PRESET.category,
    target_temperature_c: DEFAULT_PRESET.target_temperature_c,
    target_batch_grams: DEFAULT_PRESET.target_batch_grams,
    machine_capacity_grams: null,
  };
  let session = createProductionSession({
    sessionId,
    ownerUserId,
    source: {
      recipeId: `recipe:${ownerUserId}`,
      recipeVersionId: `version:${sessionId}`,
      recipeVersionNumber: 1,
      recipeName: `Gelato ${sessionId}`,
    },
    plannedInput: input,
    plannedComposition: {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: input.items.map((item) => item.id),
      toppings: [],
      behaviorSnapshots: productBehaviorTestSnapshots(input),
      migrationAmbiguities: [],
    },
    startedAt: '2026-08-24T10:00:00.000Z',
  });
  for (const [index, line] of session.lines.entries()) {
    session = confirmProductionLine(
      session,
      line.lineId,
      `2026-08-24T10:${String(index + 1).padStart(2, '0')}:00.000Z`,
    );
  }
  return completeProductionSession(
    session,
    calculateRecipe(input),
    '2026-08-24T11:00:00.000Z',
    ownerUserId,
  ).completionSnapshot!;
}

describe('LabelRepository account and immutable history authority', () => {
  beforeEach(() => resetInMemoryLabelRepositoryForTests());

  it('isolates Account Label Profiles by owner and rejects cross-owner writes', async () => {
    const ownerA = inMemoryLabelRepository('owner-a');
    const ownerB = inMemoryLabelRepository('owner-b');
    const profileA = {
      ...defaultAccountLabelProfile('owner-a'),
      businessName: 'Gellatti A',
      logoPath: 'owner-a/logo-a.png',
    };
    await ownerA.saveAccountProfile(profileA);

    expect((await ownerA.getAccountProfile())?.businessName).toBe('Gellatti A');
    expect(await ownerB.getAccountProfile()).toBeNull();
    await expect(ownerB.saveAccountProfile(profileA)).rejects.toThrow(/innego konta/);
  });

  it('keeps completed snapshots owner-scoped, cloned and immutable', async () => {
    const ownerA = inMemoryLabelRepository('owner-a');
    const ownerB = inMemoryLabelRepository('owner-b');
    const snapshot = completedSnapshot('owner-a', 'run-a');
    await ownerA.freezeCompletedSnapshot(snapshot);

    snapshot.source.recipeName = 'Mutated caller object';
    expect((await ownerA.getCompletedSnapshot('run-a'))?.source.recipeName).toBe('Gelato run-a');
    expect(await ownerB.getCompletedSnapshot('run-a')).toBeNull();
    await expect(ownerB.freezeCompletedSnapshot(snapshot)).rejects.toThrow(/another account/);
    await expect(ownerA.freezeCompletedSnapshot(snapshot)).rejects.toThrow(/immutable/);
  });

  it('preserves Label A after future account defaults and Logo B change', async () => {
    const repository = inMemoryLabelRepository('owner-a');
    const profileA = {
      ...defaultAccountLabelProfile('owner-a'),
      market: 'EU' as const,
      businessName: 'Business A',
      logoPath: 'owner-a/logo-a.png',
    };
    await repository.saveAccountProfile(profileA);
    const snapshotA = completedSnapshot('owner-a', 'run-a');
    await repository.freezeCompletedSnapshot(snapshotA);
    const labelA = buildMasterLabelData({
      masterLabelId: 'label-a',
      snapshot: snapshotA,
      market: profileA.market,
      uiLanguage: profileA.uiLanguage,
      labelLanguages: profileA.labelLanguages,
      facilityDefaults: profileA.facilityDefaults,
      businessName: profileA.businessName,
      logoPath: profileA.logoPath,
    });
    await repository.saveRunLabelSnapshot(labelA);

    const profileB = {
      ...profileA,
      market: 'US' as const,
      businessName: 'Business B',
      logoPath: 'owner-a/logo-b.png',
    };
    await repository.saveAccountProfile(profileB);
    const snapshotB = completedSnapshot('owner-a', 'run-b');
    await repository.freezeCompletedSnapshot(snapshotB);
    const labelB = buildMasterLabelData({
      masterLabelId: 'label-b',
      snapshot: snapshotB,
      market: profileB.market,
      uiLanguage: profileB.uiLanguage,
      labelLanguages: profileB.labelLanguages,
      facilityDefaults: profileB.facilityDefaults,
      businessName: profileB.businessName,
      logoPath: profileB.logoPath,
    });
    await repository.saveRunLabelSnapshot(labelB);

    expect(await repository.getRunLabelSnapshot('run-a')).toMatchObject({
      logoPath: 'owner-a/logo-a.png',
      label: { market: 'EU', businessName: 'Business A', logoPath: 'owner-a/logo-a.png' },
    });
    expect(await repository.getRunLabelSnapshot('run-b')).toMatchObject({
      logoPath: 'owner-a/logo-b.png',
      label: { market: 'US', businessName: 'Business B', logoPath: 'owner-a/logo-b.png' },
    });
    await expect(
      repository.saveRunLabelSnapshot({ ...labelA, businessName: 'Rewrite old label' }),
    ).rejects.toThrow(/immutable/);
    expect(await inMemoryLabelRepository('owner-b').listRunLabelSnapshots()).toEqual([]);
  });
});
