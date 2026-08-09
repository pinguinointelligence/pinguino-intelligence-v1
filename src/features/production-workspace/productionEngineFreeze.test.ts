import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import {
  buildFinalActualInput,
  confirmProductionLine,
  createProductionSession,
  setDraftActualGrams,
} from './productionSession';

describe('Production UI Engine freeze', () => {
  it('keeps identical raw Engine metrics for the same actual production vector', () => {
    const planned: RecipeInput = {
      items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
      mode: 'classic',
      category: DEFAULT_PRESET.category,
      target_temperature_c: DEFAULT_PRESET.target_temperature_c,
      target_batch_grams: DEFAULT_PRESET.target_batch_grams,
      machine_capacity_grams: null,
    };
    let session = createProductionSession({
      sessionId: 'freeze-run',
      ownerUserId: 'owner',
      source: {
        recipeId: 'recipe',
        recipeVersionId: 'version',
        recipeVersionNumber: 1,
        recipeName: 'Freeze fixture',
      },
      plannedInput: planned,
      startedAt: '2026-08-09T10:00:00.000Z',
    });
    const vector = planned.items.map((item, index) => item.planned_grams + (index === 0 ? 2 : index === 1 ? -2 : 0));
    for (const [index, line] of session.lines.entries()) {
      session = setDraftActualGrams(session, line.lineId, vector[index]!);
      session = confirmProductionLine(session, line.lineId, `2026-08-09T10:0${index}:00.000Z`);
    }
    const throughWorkspace = calculateRecipe(buildFinalActualInput(session));
    const direct = calculateRecipe({
      ...planned,
      target_batch_grams: vector.reduce((sum, grams) => sum + grams, 0),
      items: planned.items.map((item, index) => ({
        ...item,
        actual_grams: vector[index]!,
        lock_type: 'already_added',
      })),
    });
    expect({
      total: throughWorkspace.total_batch_g,
      totals: throughWorkspace.totals,
      percentages: throughWorkspace.percentages,
      sugar: throughWorkspace.sugar,
      pod: throughWorkspace.pod_points,
      pac: throughWorkspace.pac_points,
      npac: throughWorkspace.npac_points,
      ice: throughWorkspace.ice_fraction_percent,
      nutrition: throughWorkspace.nutrition_per_100g,
      indicators: throughWorkspace.indicators,
      scores: throughWorkspace.scores,
    }).toEqual({
      total: direct.total_batch_g,
      totals: direct.totals,
      percentages: direct.percentages,
      sugar: direct.sugar,
      pod: direct.pod_points,
      pac: direct.pac_points,
      npac: direct.npac_points,
      ice: direct.ice_fraction_percent,
      nutrition: direct.nutrition_per_100g,
      indicators: direct.indicators,
      scores: direct.scores,
    });
  });
});
