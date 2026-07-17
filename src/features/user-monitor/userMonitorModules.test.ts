/**
 * §14 modules + summary cards + §20.5 recipe-level statuses — built on a REAL
 * engine result. Pins: §14.4 friendly naming (technical term = tooltip only),
 * six §14.1 cards with Złoty Zakres TEXT, honest data-derivation for the
 * modules, and the three-indicator separation (confidence/readiness = TEXT,
 * never numbers, never merged with the 1–10 score).
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeResult } from '@/engine';
import {
  buildCustomerResult,
  createCustomerFlow,
  selectServingMode,
  setBatchGrams,
  setProductType,
} from '@/features/customer-flow';
import {
  GOLDEN_RANGE_STATE_TEXT,
  PRODUCTION_READINESS_TEXT,
  RECIPE_INDICATOR_CONTRACTS,
} from '@/features/recipe-score';
import {
  deriveMonitorStatusLine,
  deriveRecipeDataConfidence,
  deriveRecipeReadiness,
} from './recipeIndicatorStatuses';
import { USER_MONITOR_MODULE_ORDER } from './userMonitorLayout';
import {
  buildUserMonitorModules,
  buildUserMonitorSummaryCards,
  FRIENDLY_METRIC_PRESENTATION,
  SUMMARY_CARD_ORDER,
} from './userMonitorModules';

function realResult(): RecipeResult {
  let s = createCustomerFlow({ text: 'lody waniliowe' });
  s = setProductType(s, 'gelato');
  s = selectServingMode(s, 'temp_minus_12');
  s = setBatchGrams(s, 1000);
  const input = buildCustomerResult(s).recipeInput;
  if (input === null) throw new Error('fixture: expected a calculated recipe');
  return calculateRecipe(input);
}

const STATE_TEXTS = Object.values(GOLDEN_RANGE_STATE_TEXT).map((s) => s.text);

describe('buildUserMonitorModules — §14.2 grouping over existing result data', () => {
  it('builds all nine modules in the fixed §14.2 order', () => {
    const modules = buildUserMonitorModules(realResult(), -12);
    expect(modules.map((m) => m.id)).toEqual([...USER_MONITOR_MODULE_ORDER]);
    for (const module of modules) {
      expect(module.rows.length).toBeGreaterThan(0);
    }
  });

  it('uses §14.4 friendly names with the original technical term as the Expert term', () => {
    expect(FRIENDLY_METRIC_PRESENTATION.pod).toMatchObject({ label: 'Odczuwalna słodycz', expertTerm: 'POD' });
    expect(FRIENDLY_METRIC_PRESENTATION.ice_fraction).toMatchObject({ label: 'Poziom zamrożenia', expertTerm: 'Ice fraction' });
    expect(FRIENDLY_METRIC_PRESENTATION.total_solids).toMatchObject({ label: 'Ciała stałe / pełnia', expertTerm: 'Total solids' });
    expect(FRIENDLY_METRIC_PRESENTATION.lactose_sandiness_risk.label).toBe('Ryzyko krystalizacji laktozy');
    const modules = buildUserMonitorModules(realResult(), -12);
    const cukry = modules.find((m) => m.id === 'cukry')!;
    const pod = cukry.rows.find((r) => r.metric === 'pod')!;
    expect(pod.label).toBe('Odczuwalna słodycz');
    expect(pod.expertTerm).toBe('POD');
  });

  it('banded rows carry a Złoty Zakres TEXT reading; plain data rows carry none', () => {
    const modules = buildUserMonitorModules(realResult(), -12);
    for (const module of modules) {
      for (const row of module.rows) {
        if (row.metric !== null) {
          expect(row.reading).not.toBeNull();
          expect(STATE_TEXTS).toContain(row.reading!.text);
        } else {
          expect(row.reading).toBeNull();
        }
      }
    }
  });

  it('the Expert module keeps the ORIGINAL shorthands (POD/PAC/NPAC/Ice fraction)', () => {
    const modules = buildUserMonitorModules(realResult(), -12);
    const expert = modules.find((m) => m.id === 'expert')!;
    expect(expert.rows.map((r) => r.label)).toEqual(['POD', 'PAC', 'NPAC', 'Ice fraction']);
  });
});

describe('buildUserMonitorSummaryCards — the six §14.1 cards', () => {
  it('builds Struktura/Miękkość/Słodycz/Kremowość/Pełnia/Stabilność with TEXT readings', () => {
    const cards = buildUserMonitorSummaryCards(realResult());
    expect(cards.map((c) => c.id)).toEqual([...SUMMARY_CARD_ORDER]);
    expect(cards.map((c) => c.label)).toEqual([
      'Struktura',
      'Miękkość',
      'Słodycz',
      'Kremowość',
      'Pełnia',
      'Stabilność',
    ]);
    for (const card of cards) {
      expect(STATE_TEXTS).toContain(card.reading.text);
      expect(card.rows.length).toBeGreaterThan(0);
    }
  });
});

describe('§20.5 three-indicator separation — TEXT statuses, never numbers', () => {
  it('data confidence is a TEXT status under the §20.5 name, with the disclaimer', () => {
    const view = deriveRecipeDataConfidence(realResult());
    expect(view.name).toBe(RECIPE_INDICATOR_CONTRACTS.data_confidence.name);
    expect(view.text.length).toBeGreaterThan(0);
    expect(view.text).not.toMatch(/\d/); // TEXT, never a number
    expect(view.disclaimer).toContain('nie jest wynikiem laboratoryjnym');
  });

  it('the tier honestly mirrors the engine’s OWN provenance signals (no invented grade)', () => {
    const result = realResult();
    expect(result.warnings.some((w) => w.code === 'low_confidence_ingredient')).toBe(false);
    const estimatedProvenance =
      result.items.some((item) => !item.ingredient.is_verified) ||
      result.indicators.some(
        (i) => i.band_status === 'estimated' || i.category_fallback === true || i.temperature_fallback === true,
      );
    expect(deriveRecipeDataConfidence(result).tier).toBe(
      estimatedProvenance ? 'estimated_partial' : 'verified_complete',
    );
  });

  it('a low-confidence warning downgrades the tier (engine signal, no re-derived threshold)', () => {
    const result = realResult();
    const downgraded: RecipeResult = {
      ...result,
      warnings: [...result.warnings, { code: 'low_confidence_ingredient', severity: 'info' }],
    };
    expect(deriveRecipeDataConfidence(downgraded).tier).toBe('low_confidence');
  });

  it('readiness reuses productionReadiness and stays a TEXT status', () => {
    const view = deriveRecipeReadiness(realResult());
    expect(view.name).toBe(RECIPE_INDICATOR_CONTRACTS.production_readiness.name);
    expect(Object.values(PRODUCTION_READINESS_TEXT).map((t) => t.label)).toContain(
      view.readiness.label,
    );
    expect(view.readiness.label).not.toMatch(/\d/);
  });

  it('§14.1 status line maps onto gotowa / test rekomendowany / wymaga korekty', () => {
    const line = deriveMonitorStatusLine(realResult());
    expect(['Gotowa', 'Test rekomendowany', 'Wymaga korekty']).toContain(line.text);
    // No-score recipes are an honest „Brak danych do oceny".
    const noScores: RecipeResult = { ...realResult(), scores: null };
    expect(deriveMonitorStatusLine(noScores).text).toBe('Brak danych do oceny');
  });
});
