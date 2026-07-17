/**
 * UserMonitorPro (§14) — render pins: modular layout (six cards + §14.2
 * modules + Dostosuj widok), §20.5 TEXT statuses, §14.4 tooltips, the
 * serving-temperature label with the typographic minus, and the §15.1 ban
 * (no /100, no percent-scores) on the Pro monitor surface.
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
import { UserMonitorPro } from './UserMonitorPro';

function realResult(): RecipeResult {
  let s = createCustomerFlow({ text: 'lody waniliowe' });
  s = setProductType(s, 'gelato');
  s = selectServingMode(s, 'temp_minus_12');
  s = setBatchGrams(s, 1000);
  const input = buildCustomerResult(s).recipeInput;
  if (input === null) throw new Error('fixture: expected a calculated recipe');
  return calculateRecipe(input);
}

const render = () =>
  renderToStaticMarkup(<UserMonitorPro result={realResult()} servingTemperatureC={-12} />);

const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

describe('UserMonitorPro — §14 modular monitor', () => {
  it('renders the panel, §14.1 status, six summary cards and the default modules', () => {
    const text = visibleText(render());
    expect(text).toContain('Monitor Pro');
    expect(text).toMatch(/Gotowa|Test rekomendowany|Wymaga korekty/);
    for (const card of ['Struktura', 'Miękkość', 'Słodycz', 'Kremowość', 'Pełnia', 'Stabilność']) {
      expect(text).toContain(card);
    }
    for (const module of ['Zachowanie w temperaturze', 'Cukry i słodycz', 'Białka i struktura', 'Stabilizacja']) {
      expect(text).toContain(module);
    }
    // Tryb Expert defaults OFF (§14.2/9) — its title only appears in Dostosuj widok.
    expect(text).toContain('Dostosuj widok');
    expect(text).toContain('Przywróć domyślny układ');
  });

  it('shows the §20.5 TEXT statuses (Pewność danych + Gotowość produkcyjna), separate from the score', () => {
    const text = visibleText(render());
    expect(text).toContain('Pewność danych');
    expect(text).toContain('Gotowość produkcyjna');
    expect(text).toContain('nie jest wynikiem laboratoryjnym');
    // The 1–10 score is NOT rendered here — it lives on the score card (§20.5
    // separation: three indicators never merged into one block of numbers).
    expect(text).not.toMatch(/\d\/10/);
  });

  it('labels the serving temperature with the typographic minus (§11.2, audit #27)', () => {
    const text = visibleText(render());
    expect(text).toContain('Temperatura serwowania');
    expect(text).toContain('−12°C'); // U+2212, never the ASCII hyphen
    expect(text).not.toContain('-12°C');
  });

  it('keeps §14.4 technical terms as tooltips, not labels', () => {
    const html = render();
    expect(html).toContain('title="POD"');
    expect(html).toContain('Odczuwalna słodycz');
    expect(html).toContain('title="Ice fraction"');
    expect(html).toContain('Poziom zamrożenia');
  });

  it('never renders /100 or percent-style scores (§15.1)', () => {
    const text = visibleText(render());
    expect(text).not.toMatch(/\/\s*100\b/);
    expect(text).not.toMatch(/%\s*poprawności/i);
  });

  it('offers pin controls for banded metrics (§14.3 pinning) and module toggles', () => {
    const html = render();
    expect(html).toMatch(/aria-label="Przypnij: /);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('Układ zapisuje się na tym urządzeniu.');
  });
});
