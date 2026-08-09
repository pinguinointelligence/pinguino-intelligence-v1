import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { ContextualEducationView } from './ContextualEducationView';

const source = readFileSync(resolve(import.meta.dirname, 'ContextualEducationView.tsx'), 'utf8');

describe('contextual education runtime surface', () => {
  it('replaces the duplicate score tutorial with a recipe-learning hub', () => {
    const html = renderToStaticMarkup(
      <ContextualEducationView input={starterMilkBase()} audience="pro" onBack={() => {}} />,
    );
    expect(html).toContain('data-testid="profile-education-view"');
    expect(html).toContain('← Wróć do receptury');
    expect(html).toContain('CO WARTO WIEDZIEĆ O TEJ RECEPTURZE?');
    expect(html.match(/data-testid="contextual-card"/g)).toHaveLength(3);
    expect(html.match(/data-testid="education-entry"/g)).toHaveLength(3);
    expect(html).not.toContain('education-ice-cockpit');
    expect(html).not.toContain('Wynik jakości');
    expect(html).not.toMatch(/Dlaczego \d+\/10/);
  });

  it('uses the same surface with Home-first preparation order', () => {
    const html = renderToStaticMarkup(
      <ContextualEducationView input={starterMilkBase()} audience="home" onBack={() => {}} />,
    );
    const process = html.indexOf('Jak je przygotować?');
    const ingredients = html.indexOf('Co robią składniki?');
    const behavior = html.indexOf('Dlaczego lody zachowują się tak?');
    expect(process).toBeGreaterThan(-1);
    expect(ingredients).toBeGreaterThan(process);
    expect(behavior).toBeGreaterThan(ingredients);
  });

  it('implements tap/click controls and no hover-only lesson path', () => {
    expect(source).toContain('onClick={() => onOpen');
    expect(source).toContain('onClick={() => setEffectId');
    expect(source).toContain('min-h-10');
    expect(source).toContain('min-h-11');
    expect(source).not.toContain('onMouseEnter');
  });

  it('uses original causal chips and qualitative dots, not a competitor-like bar profile', () => {
    expect(source).toContain('data-testid="ingredient-effect-chip"');
    expect(source).toContain('education-causal-chain');
    expect(source).toContain('RelativeDots');
    expect(source).not.toContain('IndicatorBar');
    expect(source).not.toContain('ingredient-horizontal-bar');
  });

  it('contains no protected ranges, solver weights or hidden correction algorithms', () => {
    expect(source).not.toContain('target_bands');
    expect(source).not.toContain('TARGET_BANDS');
    expect(source).not.toContain('solver');
    expect(source).not.toContain('CorrectionPanel');
    expect(source).not.toContain('calculateRecipe');
  });
});
