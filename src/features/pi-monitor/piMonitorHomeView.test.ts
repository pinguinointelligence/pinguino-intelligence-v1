/**
 * Monitor Home view model (SPEC §13) — golden-range 5-state TEXT rows, honest
 * stability status, machine checklist and the §22 no-numbers guarantee.
 * Uses a REAL engine result (canonical `calculateRecipe` via the customer-flow
 * bridge) — never a hand-faked indicator table.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeResult } from '@/engine';
import { calculateRecipe } from '@/engine';
import {
  buildCustomerResult,
  createCustomerFlow,
  selectServingMode,
  setBatchGrams,
  setProductType,
} from '@/features/customer-flow';
import { GOLDEN_RANGE_STATE_TEXT, MATCH_SCORE_LABELS } from '@/features/recipe-score';
import {
  MONITOR_HOME_CHECK_COPY,
  MONITOR_HOME_STEP_LABELS,
  MONITOR_HOME_TRAIT_LABELS,
  MONITOR_HOME_TRAIT_ORDER,
  buildMonitorHomeView,
} from './piMonitorHomeView';

/** A real calculated vanilla-gelato result via the sanctioned customer bridge. */
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

describe('buildMonitorHomeView — §13 traits as Złoty Zakres TEXT states', () => {
  it('renders the four consumer traits in order with plain labels (never technical compounds)', () => {
    const view = buildMonitorHomeView(realResult());
    expect(view.traits.map((t) => t.id)).toEqual([...MONITOR_HOME_TRAIT_ORDER]);
    expect(view.traits.map((t) => t.label)).toEqual(['Słodycz', 'Miękkość', 'Kremowość', 'Pełnia']);
    for (const label of Object.values(MONITOR_HOME_TRAIT_LABELS)) {
      expect(label).not.toMatch(/[–-]/); // no "Miękkość–twardość" style compounds (audit #12)
    }
  });

  it('every trait carries one of the five golden-range TEXTS (§15.3 — never color-only)', () => {
    const view = buildMonitorHomeView(realResult());
    for (const trait of view.traits) {
      expect(STATE_TEXTS).toContain(trait.reading.text);
      expect(trait.reading.text.length).toBeGreaterThan(0);
    }
    expect(STATE_TEXTS).toContain(view.stability.reading.text);
  });

  it('the 1–10 score reuses the §15.1 adapter (integer display + exact verdict)', () => {
    const view = buildMonitorHomeView(realResult());
    expect(view.score.score).not.toBeNull();
    expect(view.score.display).toMatch(/^([1-9]|10)\/10$/);
    expect(view.score.label).toBe(MATCH_SCORE_LABELS[view.score.score!]);
  });

  it('null result → honest no-data score, all-neutral traits, no structure check', () => {
    const view = buildMonitorHomeView(null);
    expect(view.score.score).toBeNull();
    expect(view.score.display).toBe('—');
    for (const trait of view.traits) {
      expect(trait.reading.state).toBe('neutral');
      expect(trait.reading.text).toBe(GOLDEN_RANGE_STATE_TEXT.neutral.text);
    }
    expect(view.stability.reading.state).toBe('neutral');
    expect(view.checks).toEqual([]);
  });

  it('carries NO numeric metric/band data anywhere (engine protection §22, §13.2)', () => {
    const view = buildMonitorHomeView(realResult(), { name: 'Ninja CREAMi Deluxe', batchFit: 'recommended_active' });
    const numbers: number[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === 'number') numbers.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(view);
    // The ONLY number in the whole view is the public 1–10 score (§4 safe teaser).
    expect(numbers).toEqual([view.score.score]);
  });
});

describe('buildMonitorHomeView — §13.3 machine checklist', () => {
  it('saved machine + recommended amount → the two calm checks', () => {
    const view = buildMonitorHomeView(realResult(), { name: 'Ninja CREAMi Deluxe', batchFit: 'recommended_active' });
    const texts = view.checks.map((c) => c.text);
    expect(texts).toContain('Dopasowana do Ninja CREAMi Deluxe');
    expect(texts).toContain(MONITOR_HOME_CHECK_COPY.batchRecommended);
    expect(view.checks.find((c) => c.id === 'machine')?.tone).toBe('ok');
  });

  it('amount above the recommendation → an honest attention row, never a fake check', () => {
    const view = buildMonitorHomeView(realResult(), { name: 'Ninja CREAMi', batchFit: 'custom_above' });
    const batch = view.checks.find((c) => c.id === 'batch');
    expect(batch?.text).toBe(MONITOR_HOME_CHECK_COPY.batchAbove);
    expect(batch?.tone).toBe('attention');
  });

  it('no machine recommendation (batchFit none) → no batch row at all', () => {
    const view = buildMonitorHomeView(realResult(), { name: 'Ninja CREAMi', batchFit: 'none' });
    expect(view.checks.some((c) => c.id === 'batch')).toBe(false);
  });

  it('no machine context → no machine/batch rows (Demo carries no machine claim)', () => {
    const view = buildMonitorHomeView(realResult(), null);
    expect(view.checks.some((c) => c.id === 'machine' || c.id === 'batch')).toBe(false);
  });
});

describe('MONITOR_HOME_STEP_LABELS — §16.1 consumer direction words', () => {
  it('covers all four traits with the verbatim §16.1 directions', () => {
    expect(MONITOR_HOME_STEP_LABELS.slodycz.decrease).toBe('Mniej słodkie');
    expect(MONITOR_HOME_STEP_LABELS.slodycz.increase).toBe('Bardziej słodkie');
    expect(MONITOR_HOME_STEP_LABELS.miekkosc.decrease).toBe('Twardsze');
    expect(MONITOR_HOME_STEP_LABELS.miekkosc.increase).toBe('Bardziej miękkie');
    expect(MONITOR_HOME_STEP_LABELS.kremowosc.increase).toBe('Bardziej kremowe');
    expect(MONITOR_HOME_STEP_LABELS.pelnia.increase).toBe('Pełniejsza');
    for (const trait of MONITOR_HOME_TRAIT_ORDER) {
      expect(MONITOR_HOME_STEP_LABELS[trait].keep).toBe('Bez zmian');
    }
  });
});
