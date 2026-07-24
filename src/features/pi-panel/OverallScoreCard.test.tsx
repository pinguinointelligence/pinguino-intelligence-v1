/**
 * OverallScoreCard — ACCEPTANCE ADDENDUM (2) public score pins (owner decision
 * 2026-07-24, DELIBERATELY superseding the §15.1 blended headline):
 *
 *  - the headline INTEGER is „Dopasowanie techniczne" 1–10 derived from the
 *    technical/band dimension (`recipeTechnicalFit`) — all native approved
 *    bands in range ⇒ EXACTLY 10/10; degrades honestly with violations;
 *  - cost and subjective flavor are SEPARATE labeled dimensions — never mixed
 *    into the technical integer, still integer-only (no fake precision);
 *  - the former „{overall} / 100" display and any RAW 0–100 sub-score floats
 *    stay banned; provisional profiles keep „Ocena częściowa / prowizoryczna".
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeResult } from '@/engine';
import {
  buildCustomerResult,
  createCustomerFlow,
  selectServingMode,
  setBatchGrams,
  setProductType,
} from '@/features/customer-flow';
import {
  MATCH_SCORE_LABELS,
  MATCH_SCORE_NO_DATA_LABEL,
  recipeTechnicalFit,
} from '@/features/recipe-score';
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

describe('OverallScoreCard — „Dopasowanie techniczne" headline (ADDENDUM 2)', () => {
  it('renders „Dopasowanie techniczne", the integer X/10 and the exact verdict', () => {
    const result = realResult();
    const html = renderToStaticMarkup(<OverallScoreCard result={result} mode="classic" />);
    const text = visibleText(html);
    expect(text).toContain('Dopasowanie techniczne');
    const match = text.match(/([1-9]|10)\/10/);
    expect(match).not.toBeNull();
    const score = Number(match![1]) as keyof typeof MATCH_SCORE_LABELS;
    expect(text).toContain(MATCH_SCORE_LABELS[score]);
    // The headline agrees with the TECHNICAL adapter, never the blend.
    expect(score).toBe(recipeTechnicalFit(result).score);
  });

  it('all native bands in range ⇒ the headline is EXACTLY 10/10 (the T17 rule)', () => {
    const result = realResult();
    const html = renderToStaticMarkup(<OverallScoreCard result={result} mode="classic" />);
    if (detectViolations(result).length === 0) {
      expect(visibleText(html)).toContain('10/10');
      // The blended overall (<100) would have rounded lower — the split holds.
      expect(result.scores!.overall).toBeLessThan(100);
    } else {
      // The fixture recipe carries violations → the headline must stay below 10.
      expect(visibleText(html)).not.toContain('10/10');
    }
  });

  it('flavor and cost render as SEPARATE labeled dimensions (never in the headline)', () => {
    const html = renderToStaticMarkup(<OverallScoreCard result={realResult()} mode="classic" />);
    expect(html).toContain('data-testid="score-dimensions"');
    const text = visibleText(html);
    expect(text).toContain('Profil smakowy (subiektywny)');
    expect(text).toContain('Koszt (komercyjny)');
    expect(text).toContain('Wymiary dodatkowe (poza oceną techniczną)');
  });

  it('NEVER renders / 100, percent or decimal scores, and no raw sub-score floats', () => {
    const html = renderToStaticMarkup(<OverallScoreCard result={realResult()} mode="classic" />);
    const text = visibleText(html);
    expect(text).not.toMatch(/\/\s*100\b/); // the old "{overall} / 100" is banned
    expect(text).not.toMatch(/\d\s*%/);
    expect(text).not.toMatch(/\d[.,]\d\s*\/\s*10/); // no „8,7/10"
    // Raw English sub-score captions stay gone (§22 scoring internals).
    for (const legacy of ['Technical', 'Flavor', 'Cost']) {
      expect(text).not.toContain(legacy);
    }
    // No stray raw 0–100 float leaks: every digit run is a 1–10 integer or "10".
    const digits = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
    for (const d of digits) {
      expect(Number(d.replace(',', '.'))).toBeLessThanOrEqual(10);
    }
  });

  it('carries the a11y number+verdict and the technical tooltip (10/10 = all native bands)', () => {
    const html = renderToStaticMarkup(<OverallScoreCard result={realResult()} mode="classic" />);
    expect(html).toMatch(/aria-label="Dopasowanie techniczne: ([1-9]|10) na 10 — /);
    expect(html).toContain('wszystkie natywne zatwierdzone zakresy');
    expect(html).toContain('Nie jest to gwarancja laboratoryjna');
  });

  it('null scores → the honest „Brak danych" row (never a fake 0)', () => {
    const result: RecipeResult = { ...realResult(), scores: null };
    const text = visibleText(renderToStaticMarkup(<OverallScoreCard result={result} mode="classic" />));
    expect(text).toContain(MATCH_SCORE_NO_DATA_LABEL);
    expect(text).toContain('—');
    expect(text).not.toMatch(/\d\/10/);
  });

  // Owner P0 (truthful score): unassessed axes NEVER masquerade as assessed.
  it('provisional profile (some „Brak oceny" axes) → „Oceniono N z M obszarów" + partial note', () => {
    const base = realResult();
    const result: RecipeResult = {
      ...base,
      indicators: base.indicators.map((ind, i) => (i < 2 ? { ...ind, band: null } : ind)),
    };
    const html = renderToStaticMarkup(<OverallScoreCard result={result} mode="classic" />);
    expect(html).toContain('data-testid="score-coverage"');
    const text = visibleText(html);
    const assessed = base.indicators.length - 2;
    expect(text).toContain(`Oceniono ${assessed} z ${base.indicators.length} obszarów.`);
    expect(text).toContain('częściowa');
    // The integer score itself is unchanged — coverage is disclosed, not spun.
    expect(text).toMatch(/([1-9]|10)\/10/);
  });

  it('fully banded result with no fallbacks → NO coverage note (nothing to disclose)', () => {
    const base = realResult();
    const result: RecipeResult = {
      ...base,
      indicators: base.indicators.map((ind) => ({
        ...ind,
        category_fallback: false,
        temperature_fallback: false,
      })),
    };
    const html = renderToStaticMarkup(<OverallScoreCard result={result} mode="classic" />);
    expect(html).not.toContain('data-testid="score-coverage"');
  });
});
