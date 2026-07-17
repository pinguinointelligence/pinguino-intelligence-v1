/**
 * OverallScoreCard — §15.1 public score pins (UIUX Slice D, owner decision +
 * audit #9): the PUBLIC display is an INTEGER 1–10 „Dopasowanie receptury"
 * with the exact verdict. The former „{overall} / 100" display and the raw
 * technical/flavor/cost sub-score grid are gone (§15.1 bans certificate-style
 * precision; §22 keeps scoring internals out of the presentation).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeResult } from '@/engine';
import {
  buildCustomerResult,
  createCustomerFlow,
  selectServingMode,
  setBatchGrams,
  setProductType,
} from '@/features/customer-flow';
import { MATCH_SCORE_LABELS, MATCH_SCORE_NO_DATA_LABEL } from '@/features/recipe-score';
import { OverallScoreCard } from './OverallScoreCard';

function realResult(): RecipeResult {
  let s = createCustomerFlow({ text: 'lody waniliowe' });
  s = setProductType(s, 'gelato');
  s = selectServingMode(s, 'temp_minus_12');
  s = setBatchGrams(s, 1000);
  const input = buildCustomerResult(s).recipeInput;
  if (input === null) throw new Error('fixture: expected a calculated recipe');
  return calculateRecipe(input);
}

const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

describe('OverallScoreCard — 1–10 public display (§15.1)', () => {
  it('renders „Dopasowanie receptury", the integer X/10 and the exact verdict', () => {
    const result = realResult();
    const html = renderToStaticMarkup(<OverallScoreCard result={result} mode="classic" />);
    const text = visibleText(html);
    expect(text).toContain('Dopasowanie receptury');
    const match = text.match(/([1-9]|10)\/10/);
    expect(match).not.toBeNull();
    const score = Number(match![1]) as keyof typeof MATCH_SCORE_LABELS;
    expect(text).toContain(MATCH_SCORE_LABELS[score]);
    // The verdict must agree with the engine's own overall (adapter monotone).
    expect(score).toBe(Math.min(10, Math.max(1, Math.round((result.scores!.overall) / 10))));
  });

  it('NEVER renders / 100, percent or decimal scores, and no sub-score grid', () => {
    const html = renderToStaticMarkup(<OverallScoreCard result={realResult()} mode="classic" />);
    const text = visibleText(html);
    expect(text).not.toMatch(/\/\s*100\b/); // the old "{overall} / 100" is banned
    expect(text).not.toMatch(/\d\s*%/);
    expect(text).not.toMatch(/\d[.,]\d\s*\/\s*10/); // no „8,7/10"
    // Raw sub-scores are gone from the public card (§22 scoring internals).
    for (const legacy of ['Technical', 'Flavor', 'Cost']) {
      expect(text).not.toContain(legacy);
    }
    // No stray raw 0–100 float leaks: every digit run is the score or "10".
    const digits = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
    for (const d of digits) {
      expect(Number(d.replace(',', '.'))).toBeLessThanOrEqual(10);
    }
  });

  it('carries the a11y number+verdict and the not-a-lab-guarantee tooltip (§15.2, §21.5)', () => {
    const html = renderToStaticMarkup(<OverallScoreCard result={realResult()} mode="classic" />);
    expect(html).toMatch(/aria-label="Dopasowanie receptury: ([1-9]|10) na 10 — /);
    expect(html).toContain('nie jest gwarancją laboratoryjną');
  });

  it('null scores → the honest §15.1 „Brak danych" row (never a fake 0)', () => {
    const result: RecipeResult = { ...realResult(), scores: null };
    const text = visibleText(renderToStaticMarkup(<OverallScoreCard result={result} mode="classic" />));
    expect(text).toContain(MATCH_SCORE_NO_DATA_LABEL);
    expect(text).toContain('—');
    expect(text).not.toMatch(/\d\/10/);
  });
});
