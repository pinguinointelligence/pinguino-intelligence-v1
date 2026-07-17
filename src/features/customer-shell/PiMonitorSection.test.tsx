/**
 * Monitor receptury (§13 Monitor Home) — public-rendering pins (UIUX Slice D):
 * 1–10-only score (never /100, never %, never decimals), Złoty Zakres 5-state
 * TEXT rows, §13.3 machine checklist, §20.5 separation (no Pro-audience
 * indicators on the Home monitor) and Demo numeric redaction.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import {
  buildCustomerResult,
  createCustomerFlow,
  selectServingMode,
  setBatchGrams,
  setProductType,
} from '@/features/customer-flow';
import type { IngredientResolutionSummary, PiMonitorPersona } from '@/features/pi-monitor';
import { GOLDEN_RANGE_STATE_TEXT } from '@/features/recipe-score';
import { PiMonitorSection } from './PiMonitorSection';

/** A real calculated vanilla-gelato recipeInput via the sanctioned bridge. */
function realRecipeInput(): RecipeInput {
  let s = createCustomerFlow({ text: 'lody waniliowe' });
  s = setProductType(s, 'gelato');
  s = selectServingMode(s, 'temp_minus_12');
  s = setBatchGrams(s, 1000);
  const input = buildCustomerResult(s).recipeInput;
  if (input === null) throw new Error('fixture: expected a calculated recipe');
  return input;
}

const RESOLVED: IngredientResolutionSummary = { allResolved: true, unresolvedCount: 0, unresolvedNames: [] };

const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

function renderSection(opts: {
  persona: PiMonitorPersona;
  gramsVisible: boolean;
  machine?: { name: string; batchFit: 'recommended_active' | 'custom' | 'custom_above' | 'none' } | null;
  recipeInput?: RecipeInput | null;
}) {
  return renderToStaticMarkup(
    <PiMonitorSection
      summary={RESOLVED}
      gramsVisible={opts.gramsVisible}
      recipeInput={opts.recipeInput === undefined ? realRecipeInput() : opts.recipeInput}
      persona={opts.persona}
      machineContext={opts.machine ?? null}
    />,
  );
}

describe('PiMonitorSection — §13 Monitor Home content', () => {
  it('shows the Monitor name, a 1–10 score with the §15.1 verdict, traits and stability', () => {
    const html = renderSection({ persona: 'home', gramsVisible: true });
    const text = visibleText(html);
    expect(text).toContain('Monitor receptury');
    expect(text).toMatch(/([1-9]|10)\/10/); // integer 1–10 display
    expect(text).toMatch(/dopasowana|optimum|korekty|niezbalansowana|przebudowy/i); // a §15.1 verdict
    for (const label of ['Słodycz', 'Miękkość', 'Kremowość', 'Pełnia', 'Stabilność']) {
      expect(text).toContain(label);
    }
    // At least one Złoty Zakres state TEXT is rendered (§15.3 — never color alone).
    const stateTexts = Object.values(GOLDEN_RANGE_STATE_TEXT).map((s) => s.text);
    expect(stateTexts.some((t) => text.includes(t))).toBe(true);
  });

  it('NEVER renders /100, percent scores or decimal scores (owner §15.1 decision)', () => {
    const html = renderSection({ persona: 'home', gramsVisible: true });
    const text = visibleText(html);
    expect(text).not.toMatch(/\/\s*100\b/);
    expect(text).not.toMatch(/\d\s*%/);
    expect(text).not.toMatch(/\d[.,]\d\s*\/\s*10/); // no „8,7/10"
  });

  it('keeps §20.5 separation — no Pro-audience indicators on the Home monitor', () => {
    const text = visibleText(renderSection({ persona: 'home', gramsVisible: true }));
    expect(text).not.toContain('Pewność danych');
    expect(text).not.toContain('Gotowość produkcyjna');
  });

  it('renders the §13.3 checklist for a saved machine with the recommended amount', () => {
    const text = visibleText(
      renderSection({
        persona: 'home',
        gramsVisible: true,
        machine: { name: 'Ninja CREAMi Deluxe', batchFit: 'recommended_active' },
      }),
    );
    expect(text).toContain('Dopasowana do Ninja CREAMi Deluxe');
    expect(text).toContain('Właściwa ilość dla pojemnika');
  });

  it('Demo: no digits beyond the public 1–10 score (grams/bands never leak)', () => {
    const html = renderSection({ persona: 'demo', gramsVisible: false, machine: null });
    const text = visibleText(html);
    const withoutScore = text.replace(/([1-9]|10)\/10/g, ' ');
    expect(withoutScore).not.toMatch(/\d/);
  });

  it('no calculated recipe → honest no-data score and the calculated-note', () => {
    const text = visibleText(
      renderSection({ persona: 'home', gramsVisible: true, recipeInput: null }),
    );
    expect(text).toContain('Brak wystarczających danych do oceny');
    expect(text).toContain('Monitor receptury dokładnie przeliczy recepturę');
  });

  it('§16 stepped preference controls stay (three steps, never a numeric slider)', () => {
    const text = visibleText(renderSection({ persona: 'home', gramsVisible: true }));
    for (const step of ['Mniej słodkie', 'Bez zmian', 'Bardziej słodkie', 'Bardziej kremowe', 'Pełniejsza']) {
      expect(text).toContain(step);
    }
    expect(text).toContain('Przelicz z PI');
  });
});
