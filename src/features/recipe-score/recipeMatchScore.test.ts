/**
 * recipe-score — „Dopasowanie receptury" 1–10 adapter tests (SPEC §15.1–§15.2).
 * Monotonicity, boundary rounding, the null/no-data path, the exact label table,
 * no percentages, and adapter purity (engine output is never mutated).
 */
import { describe, expect, it } from 'vitest';
import type { RecipeScores } from '@/engine';
import {
  MATCH_SCORE_DISPLAY_NAME,
  MATCH_SCORE_LABELS,
  MATCH_SCORE_NO_DATA_LABEL,
  MATCH_SCORE_TOOLTIPS,
  recipeMatchScore,
} from './recipeMatchScore';

const scores = (overall: number, rest: Partial<RecipeScores> = {}): RecipeScores => ({
  technical: rest.technical ?? overall,
  flavor: rest.flavor ?? overall,
  cost: rest.cost === undefined ? overall : rest.cost,
  overall,
});

describe('recipeMatchScore — §15.1 exact label table', () => {
  const TABLE: Array<[number, number, string]> = [
    [100, 10, 'Wyjątkowo dobrze dopasowana'],
    [90, 9, 'Świetnie dopasowana'],
    [80, 8, 'Bardzo dobrze dopasowana'],
    [70, 7, 'Dobrze dopasowana'],
    [60, 6, 'Blisko optimum'],
    [50, 5, 'Wymaga korekty'],
    [40, 4, 'Wyraźnie niezbalansowana'],
    [30, 3, 'Wyraźnie niezbalansowana'],
    [20, 2, 'Wymaga przebudowy'],
    [10, 1, 'Wymaga przebudowy'],
  ];

  it.each(TABLE)('overall %d → %d with the exact Polish label', (overall, expected, label) => {
    const result = recipeMatchScore(scores(overall));
    expect(result.score).toBe(expected);
    expect(result.label).toBe(label);
    expect(result.display).toBe(`${expected}/10`);
  });

  it('covers all ten scores in the exported label table (3–4 and 1–2 share rows)', () => {
    expect(Object.keys(MATCH_SCORE_LABELS)).toHaveLength(10);
    expect(MATCH_SCORE_LABELS[4]).toBe(MATCH_SCORE_LABELS[3]);
    expect(MATCH_SCORE_LABELS[2]).toBe(MATCH_SCORE_LABELS[1]);
    for (const label of Object.values(MATCH_SCORE_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('uses the §15.1 public name, not a correctness percent', () => {
    expect(MATCH_SCORE_DISPLAY_NAME).toBe('Dopasowanie receptury');
  });
});

describe('recipeMatchScore — null / no-data path (§15.1 „Brak danych")', () => {
  it('null scores (e.g. zero-mass batch) → null score with the exact no-data label', () => {
    const result = recipeMatchScore(null);
    expect(result.score).toBeNull();
    expect(result.label).toBe('Brak wystarczających danych do oceny');
    expect(result.label).toBe(MATCH_SCORE_NO_DATA_LABEL);
    expect(result.display).toBe('—');
    expect(result.tooltipKey).toBe('recipe-score.match.tooltip.no-data');
  });

  it('undefined and non-finite overall are honest no-data, never a fake 1', () => {
    for (const input of [undefined, null, scores(Number.NaN), scores(Infinity), scores(-Infinity)]) {
      const result = recipeMatchScore(input);
      expect(result.score).toBeNull();
      expect(result.label).toBe(MATCH_SCORE_NO_DATA_LABEL);
    }
  });

  it('unknown cost does NOT null the presentation (engine already renormalized overall)', () => {
    const result = recipeMatchScore(scores(72, { cost: null }));
    expect(result.score).toBe(7);
  });
});

describe('recipeMatchScore — §15.2 mapping: monotonic, stable, integer-only', () => {
  it('is monotone: a higher underlying overall never presents lower on 1–10', () => {
    let previous = 0;
    for (let overall = 0; overall <= 100; overall += 0.25) {
      const { score } = recipeMatchScore(scores(overall));
      expect(score).not.toBeNull();
      expect(score!).toBeGreaterThanOrEqual(previous);
      previous = score!;
    }
    // and it spans the full public scale across the engine's 0–100 domain
    expect(recipeMatchScore(scores(0)).score).toBe(1);
    expect(recipeMatchScore(scores(100)).score).toBe(10);
  });

  it('is stable: the same overall always yields the identical presentation', () => {
    const a = recipeMatchScore(scores(63.7));
    const b = recipeMatchScore(scores(63.7));
    expect(a).toEqual(b);
  });

  it('reads overall ONLY — never re-derives mode weighting from components', () => {
    const weightedOneWay = recipeMatchScore(scores(64, { technical: 90, flavor: 20, cost: 80 }));
    const weightedOtherWay = recipeMatchScore(scores(64, { technical: 20, flavor: 95, cost: null }));
    expect(weightedOneWay).toEqual(weightedOtherWay);
  });

  it('rounds at the documented boundaries (half-up at multiples of 5)', () => {
    expect(recipeMatchScore(scores(94.999)).score).toBe(9);
    expect(recipeMatchScore(scores(95)).score).toBe(10);
    expect(recipeMatchScore(scores(85)).score).toBe(9);
    expect(recipeMatchScore(scores(84.999)).score).toBe(8);
    expect(recipeMatchScore(scores(45)).score).toBe(5);
    expect(recipeMatchScore(scores(44.999)).score).toBe(4);
    expect(recipeMatchScore(scores(15)).score).toBe(2);
    expect(recipeMatchScore(scores(14.999)).score).toBe(1);
  });

  it('clamps to 1..10 — the floor is 1, never 0, and defensive out-of-range stays in scale', () => {
    expect(recipeMatchScore(scores(0)).score).toBe(1);
    expect(recipeMatchScore(scores(4.999)).score).toBe(1);
    expect(recipeMatchScore(scores(-5)).score).toBe(1);
    expect(recipeMatchScore(scores(140)).score).toBe(10);
  });

  it('presents integers only — never decimals like „8,7/10"', () => {
    for (let overall = 0; overall <= 100; overall += 1.37) {
      const result = recipeMatchScore(scores(overall));
      expect(Number.isInteger(result.score)).toBe(true);
      expect(result.display).toMatch(/^(10|[1-9])\/10$/);
      expect(result.display).not.toMatch(/[.,]/);
    }
  });
});

describe('recipeMatchScore — presentation hygiene', () => {
  it('never emits percentage strings anywhere (§15.1: points, not a percent)', () => {
    const outputs: string[] = [];
    for (const input of [null, scores(0), scores(37.5), scores(94), scores(100)]) {
      const result = recipeMatchScore(input);
      outputs.push(result.label, result.display, result.ariaText, MATCH_SCORE_TOOLTIPS[result.tooltipKey]);
    }
    outputs.push(MATCH_SCORE_DISPLAY_NAME, ...Object.values(MATCH_SCORE_LABELS));
    for (const text of outputs) {
      expect(text).not.toContain('%');
      expect(text).not.toMatch(/procent/i);
    }
  });

  it('tooltip contract: the scored tooltip states 10/10 is not a laboratory guarantee', () => {
    const result = recipeMatchScore(scores(100));
    expect(result.tooltipKey).toBe('recipe-score.match.tooltip');
    expect(MATCH_SCORE_TOOLTIPS[result.tooltipKey]).toContain('nie jest gwarancją laboratoryjną');
  });

  it('aria text carries both the number and the verbal label (§21.5)', () => {
    const result = recipeMatchScore(scores(90));
    expect(result.ariaText).toContain('9 na 10');
    expect(result.ariaText).toContain('Świetnie dopasowana');
  });

  it('never mutates the engine output (frozen input passes untouched)', () => {
    const input = Object.freeze(scores(66.6, { cost: null }));
    const snapshot = { ...input };
    expect(() => recipeMatchScore(input)).not.toThrow();
    expect(input).toEqual(snapshot);
  });
});
