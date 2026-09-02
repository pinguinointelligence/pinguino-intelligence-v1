/**
 * Library metadata comes from the SAVED recipe, never from initialization defaults (owner v1.4).
 *
 * Pinned against the exact staging row the owner screenshotted — `QA Protein v2 -12C`
 * (saved_recipes 1d14a107-9284-4b04-9e7a-1454c6ec9c53, saved 2026-08-22T23:29:59.494922Z):
 * `product_type` NULL, `serving_profile` NULL, `active_engine_label` = migration 0001's
 * `'−11°C Engine'` default, while `recipe_input` carried the whole truth
 * (`pinguino_profile_v1.visibleProductType = protein`, `formulationStrategy = eco`,
 * `servingModeId = temp_minus_12`, `targetTemperatureC = -12`).
 */
import { describe, expect, it } from 'vitest';
import {
  readSavedRecipeMetadata,
  savedRecipeColumnsFromInput,
  savedRecipeMetadataLabels,
} from './savedRecipeMetadata';

/** Byte-shaped like the staging row (only the fields this module reads). */
const QA_PROTEIN_V2_INPUT = {
  items: [],
  mode: 'classic',
  category: 'protein_gelato',
  target_temperature_c: -12,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  goals: { formulation_strategy: 'eco', direction_targets_active: false },
  pinguino_profile_v1: {
    visibleProductType: 'protein',
    mode: 'classic',
    formulationStrategy: 'eco',
    targetBatchGrams: 1000,
    machineKind: 'professional',
    machineId: null,
    machineLabel: 'Profesjonalna',
    servingModeId: 'temp_minus_12',
    targetTemperatureC: -12,
    machineCapacityGrams: null,
    directionTargets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
  },
};
/** The three columns the canonical save path never wrote — exactly as they are on staging today. */
const QA_PROTEIN_V2_COLUMNS = {
  product_type: null,
  serving_profile: null,
  active_engine_label: '−11°C Engine',
  batch_grams: 1000,
};

describe('savedRecipeMetadata — the owner reproducer', () => {
  it('reads TYP / TRYB / temperature from the persisted state, not the NULL columns', () => {
    const metadata = readSavedRecipeMetadata(QA_PROTEIN_V2_INPUT, QA_PROTEIN_V2_COLUMNS);
    expect(metadata.productType).toBe('protein');
    expect(metadata.formulationStrategy).toBe('eco');
    expect(metadata.servingModeId).toBe('temp_minus_12');
    expect(metadata.temperatureC).toBe(-12);
    expect(metadata.batchGrams).toBe(1000);
  });

  it('renders Protein / ECO / −12°C / 1000 g — never „—" and never „−11°C Engine"', () => {
    const labels = savedRecipeMetadataLabels(
      readSavedRecipeMetadata(QA_PROTEIN_V2_INPUT, QA_PROTEIN_V2_COLUMNS),
      QA_PROTEIN_V2_COLUMNS.active_engine_label,
    );
    expect(labels).toEqual({
      productType: 'Proteinowe',
      mode: 'ECO',
      engine: '−12°C',
      batch: '1000 g',
    });
    expect(Object.values(labels)).not.toContain('—');
    expect(labels.engine).not.toContain('−11');
  });

  it('a −12°C save can never display as the −11°C engine, whatever the stale column says', () => {
    for (const stale of ['−11°C Engine', '−13°C Engine', null]) {
      const labels = savedRecipeMetadataLabels(
        readSavedRecipeMetadata(QA_PROTEIN_V2_INPUT, {
          ...QA_PROTEIN_V2_COLUMNS,
          active_engine_label: stale,
        }),
        stale,
      );
      expect(labels.engine).toBe('−12°C');
    }
  });
});

describe('savedRecipeMetadata — derivation rules', () => {
  it('derives the product type from the Engine category when the sidecar is absent (legacy save)', () => {
    for (const [category, expected] of [
      ['milk_gelato', 'gelato'],
      ['sorbet', 'sorbet'],
      ['vegan_gelato', 'vegan'],
      ['protein_gelato', 'protein'],
    ] as const) {
      expect(readSavedRecipeMetadata({ category, target_temperature_c: -11 }).productType).toBe(
        expected,
      );
    }
  });

  it('falls back to goals.formulation_strategy when the sidecar is absent', () => {
    expect(
      readSavedRecipeMetadata({ goals: { formulation_strategy: 'optimal' } }).formulationStrategy,
    ).toBe('optimal');
  });

  it('rejects a non-canonical strategy rather than displaying it', () => {
    expect(
      readSavedRecipeMetadata({ goals: { formulation_strategy: 'premium' } }).formulationStrategy,
    ).toBeNull();
    expect(savedRecipeMetadataLabels(readSavedRecipeMetadata({})).mode).toBe('—');
  });

  it('keeps „Świeże" a serving choice, not a temperature', () => {
    const metadata = readSavedRecipeMetadata({
      target_temperature_c: -11,
      pinguino_profile_v1: {
        visibleProductType: 'gelato',
        servingModeId: 'fresh',
        targetTemperatureC: -11,
      },
    });
    expect(savedRecipeMetadataLabels(metadata).engine).toBe('Świeże');
  });

  it('shows „—" only when the persisted state genuinely cannot answer', () => {
    expect(savedRecipeMetadataLabels(readSavedRecipeMetadata({}))).toEqual({
      productType: '—',
      mode: '—',
      engine: '—',
      batch: '—',
    });
  });

  it('tolerates malformed / non-object recipe_input without throwing', () => {
    for (const broken of [null, undefined, 'nonsense', 42, []]) {
      expect(() => readSavedRecipeMetadata(broken)).not.toThrow();
      expect(readSavedRecipeMetadata(broken).productType).toBeNull();
    }
  });
});

describe('savedRecipeColumnsFromInput — the save path stops writing defaults', () => {
  it('mirrors the saved state into the three denormalized columns', () => {
    expect(savedRecipeColumnsFromInput(QA_PROTEIN_V2_INPUT)).toEqual({
      product_type: 'protein',
      serving_profile: 'temp_minus_12',
      active_engine_label: 'Silnik −12°C',
    });
  });

  it('never writes NULL over a known product type or serving mode', () => {
    const columns = savedRecipeColumnsFromInput(QA_PROTEIN_V2_INPUT);
    expect(columns.product_type).not.toBeNull();
    expect(columns.serving_profile).not.toBeNull();
  });
});
