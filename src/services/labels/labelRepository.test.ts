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
import { buildMasterLabelData, type MasterLabelData } from '@/features/master-label/masterLabel';
import { completeRegulatoryFacts } from '@/features/master-label/masterLabelTestFixture';
import { marketProfile, type MarketProfileCode } from '@/features/master-label/marketProfiles';
import { buildNutritionDeclaration } from '@/data/label/nutritionLabel';
import {
  defaultAccountLabelProfile,
  inMemoryLabelRepository,
  resetInMemoryLabelRepositoryForTests,
  type AccountLabelProfile,
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

function printReadyActualLabel(
  snapshot: ProductionCompletionSnapshot,
  profile: AccountLabelProfile,
  market: MarketProfileCode,
  masterLabelId: string,
): MasterLabelData {
  const languages = marketProfile(market).requiredLanguages.length
    ? [...marketProfile(market).requiredLanguages]
    : profile.labelLanguages;
  const raw = buildMasterLabelData({
    masterLabelId,
    snapshot,
    market,
    uiLanguage: profile.uiLanguage,
    labelLanguages: languages,
    facilityDefaults: profile.facilityDefaults,
    businessName: profile.businessName,
    logoPath: profile.logoPath,
    enabledOptionalFields: profile.enabledOptionalFields,
  });
  const text = (value: string) =>
    Object.fromEntries(languages.map((language) => [language, value]));
  const size = { widthMm: 104, heightMm: market === 'US' ? 180 : 152 };
  const nutritionSource = raw.nutritionSource
    ? {
        ...raw.nutritionSource,
        saturated_fat_g: raw.nutritionSource.saturated_fat_g ?? 0,
        sugars_g: raw.nutritionSource.sugars_g ?? 0,
        fiber_g: raw.nutritionSource.fiber_g ?? 0,
      }
    : null;
  return {
    ...raw,
    legalProductName: text('Frozen dairy dessert'),
    allergens: { ...raw.allergens, reviewedByUser: true },
    nutritionSource,
    nutritionDeclaration: buildNutritionDeclaration(nutritionSource),
    packageQuantity: {
      value: 500,
      unit: 'g',
      netWeightG: 500,
      netVolumeMl: null,
      source: 'selected_fill',
      confirmedAt: '2026-08-24T11:05:00.000Z',
    },
    netQuantityG: 500,
    dateMark: {
      kind: 'best_before',
      date: '2027-02-24',
      basis: 'manual',
      reviewedByUser: true,
    },
    storageInstructions: text('Keep frozen at -18°C or below.'),
    origin: text('Made in Spain.'),
    regulatoryNutrition: {
      ...completeRegulatoryFacts(languages),
      sodiumMgPer100g: raw.regulatoryNutrition.sodiumMgPer100g,
    },
    size,
    printer: { ...raw.printer, widthMm: size.widthMm, heightMm: size.heightMm },
    jurisdictionContext: {
      euDestinationCountryCode: 'ES',
      ukRegion: 'GB',
      auNzCountry: 'NZ',
      usSaleContext: 'interstate_retail',
    },
    regulatoryReview: {
      translations: true,
      ingredientOrderAndQuid: true,
      marketSpecific: true,
    },
    preflightAcknowledged: true,
  };
}

describe('LabelRepository account and immutable history authority', () => {
  beforeEach(() => resetInMemoryLabelRepositoryForTests());

  it('isolates Account Label Profiles by owner and rejects cross-owner writes', async () => {
    const ownerA = inMemoryLabelRepository('owner-a');
    const ownerB = inMemoryLabelRepository('owner-b');
    const profileA: AccountLabelProfile = {
      ...defaultAccountLabelProfile('owner-a'),
      businessName: 'Gellatti A',
      logoPath: 'owner-a/logo-a.png',
    };
    await ownerA.saveAccountProfile(profileA);

    expect((await ownerA.getAccountProfile())?.businessName).toBe('Gellatti A');
    expect(await ownerB.getAccountProfile()).toBeNull();
    await expect(ownerB.saveAccountProfile(profileA)).rejects.toThrow(/innego konta/);
  });

  it('persists optional-field choices while mandatory fields remain market-owned', async () => {
    const repository = inMemoryLabelRepository('owner-a');
    await repository.saveAccountProfile({
      ...defaultAccountLabelProfile('owner-a'),
      market: 'US',
      enabledOptionalFields: ['origin'],
    });
    const reloaded = await repository.getAccountProfile();
    expect(reloaded?.enabledOptionalFields).toEqual(['origin']);
    expect(reloaded?.market).toBe('US');
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
    const profileA: AccountLabelProfile = {
      ...defaultAccountLabelProfile('owner-a'),
      market: 'EU' as const,
      businessName: 'Business A',
      logoPath: 'owner-a/logo-a.png',
      enabledOptionalFields: ['logo', 'origin'],
      facilityDefaults: {
        ...defaultAccountLabelProfile('owner-a').facilityDefaults,
        operatorName: 'Business A',
        address: '1 Test Street, Madrid',
        countryCode: 'ES',
      },
    };
    await repository.saveAccountProfile(profileA);
    const snapshotA = completedSnapshot('owner-a', 'run-a');
    await repository.freezeCompletedSnapshot(snapshotA);
    const labelA = printReadyActualLabel(snapshotA, profileA, profileA.market, 'label-a');
    const savedA = await repository.saveRunLabelSnapshot(labelA);

    const profileB: AccountLabelProfile = {
      ...profileA,
      market: 'US' as const,
      businessName: 'Business B',
      logoPath: 'owner-a/logo-b.png',
      labelLanguages: ['en'],
    };
    await repository.saveAccountProfile(profileB);
    const snapshotB = completedSnapshot('owner-a', 'run-b');
    await repository.freezeCompletedSnapshot(snapshotB);
    const labelB = printReadyActualLabel(snapshotB, profileB, profileB.market, 'label-b');
    await repository.saveRunLabelSnapshot(labelB);

    expect(await repository.getRunLabelSnapshot('run-a')).toMatchObject({
      logoPath: 'owner-a/logo-a.png',
      label: {
        market: 'EU',
        businessName: 'Business A',
        logoPath: 'owner-a/logo-a.png',
        lotCode: snapshotA.lotCode,
      },
      accountProfileSnapshot: { enabledOptionalFields: ['logo', 'origin'] },
    });
    expect(await repository.getRunLabelSnapshot('run-b')).toMatchObject({
      logoPath: 'owner-a/logo-b.png',
      label: { market: 'US', businessName: 'Business B', logoPath: 'owner-a/logo-b.png' },
    });
    const versionTwo = await repository.saveRunLabelSnapshot({
      ...labelA,
      businessName: 'Business A · regulatory revision',
    });
    expect(versionTwo).toMatchObject({ runId: 'run-a', version: 2 });
    expect(versionTwo.snapshotId).not.toBe(savedA.snapshotId);
    expect((await repository.getRunLabelSnapshotById(savedA.snapshotId))?.label.businessName).toBe(
      'Business A',
    );
    expect((await repository.getRunLabelSnapshot('run-a'))?.version).toBe(2);
    expect(await inMemoryLabelRepository('owner-b').listRunLabelSnapshots()).toEqual([]);
  });
});
