import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { educationCopy } from '@/copy/education.pl';
import { ContextualEducationView } from './ContextualEducationView';
import { processReasonText } from './processReasonText';

const source = readFileSync(resolve(import.meta.dirname, 'ContextualEducationView.tsx'), 'utf8');

describe('contextual education runtime surface', () => {
  it('replaces the duplicate score tutorial with a recipe-learning hub', () => {
    const html = renderToStaticMarkup(
      <ContextualEducationView input={starterMilkBase()} audience="pro" onBack={() => {}} />,
    );
    expect(html).toContain('data-testid="profile-education-view"');
    expect(html).toContain('← Wróć do receptury');
    expect(html.match(/data-testid="education-entry"/g)).toHaveLength(3);
    expect(html).toContain('Twoja receptura w skrócie');
    expect(html).toContain('Jak ją przygotować');
    expect(html).toContain('Dowiedz się więcej');
    expect(html).not.toContain('data-testid="contextual-card"');
    expect(html).not.toContain('education-ice-cockpit');
    expect(html).not.toContain('Wynik jakości');
    expect(html).not.toMatch(/Dlaczego \d+\/10/);
    expect(html).not.toMatch(/\b1\s*\/\s*3\b/);
  });

  it('uses the same three-answer order for Home without a separate quiz path', () => {
    const html = renderToStaticMarkup(
      <ContextualEducationView input={starterMilkBase()} audience="home" onBack={() => {}} />,
    );
    const summary = html.indexOf('Twoja receptura w skrócie');
    const process = html.indexOf('Jak ją przygotować');
    const advanced = html.indexOf('Dowiedz się więcej');
    expect(summary).toBeGreaterThan(-1);
    expect(process).toBeGreaterThan(summary);
    expect(advanced).toBeGreaterThan(process);
    expect(html.match(/data-testid="education-entry"/g)).toHaveLength(3);
  });

  it('implements tap/click controls and no hover-only lesson path', () => {
    expect(source).toContain('onClick={() => onOpen');
    expect(source).toContain('<details');
    expect(source).toContain('min-h-16');
    expect(source).toContain('min-h-10');
    expect(source).not.toContain('onMouseEnter');
  });

  it('uses actual recipe facts and qualitative dots, not invented examples or bar profiles', () => {
    const input = starterMilkBase();
    const html = renderToStaticMarkup(
      <ContextualEducationView
        input={input}
        audience="pro"
        initialLesson="ingredients"
        onBack={() => {}}
      />,
    );
    for (const item of input.items) {
      expect(html).toContain(item.ingredient.name);
    }
    expect(html).not.toContain('Mango');
    expect(html).not.toContain('Pistacja');
    expect(source).toContain('RelativeDots');
    expect(source).not.toContain('IndicatorBar');
    expect(source).not.toContain('ingredient-horizontal-bar');
  });

  it('reuses the current machine instead of presenting another selection flow', () => {
    const html = renderToStaticMarkup(
      <ContextualEducationView
        input={starterMilkBase()}
        machineId="fresh"
        machineLabel="Maszyna profesjonalna"
        initialLesson="process"
        onBack={() => {}}
      />,
    );
    expect(html).toContain('data-testid="selected-machine-guide"');
    expect(html).toContain('Maszyna profesjonalna');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('Potwierdź wybór');
  });

  it('contains no protected ranges, solver weights or hidden correction algorithms', () => {
    expect(source).not.toContain('target_bands');
    expect(source).not.toContain('TARGET_BANDS');
    expect(source).not.toContain('solver');
    expect(source).not.toContain('CorrectionPanel');
    expect(source).not.toContain('calculateRecipe');
  });

  it('names each unresolved ingredient in the UNKNOWN explanation', () => {
    const names = new Map([
      ['PI-ING-000236', 'Mleko 3,5%'],
      ['PI-ING-000514', 'Sacharoza'],
    ]);
    expect(processReasonText('PI-ING-000236', 'Brak zweryfikowanego procesu.', names)).toBe(
      'Mleko 3,5% — Brak zweryfikowanego procesu.',
    );
    expect(processReasonText('PI-ING-UNKNOWN', 'Brak danych.', names)).toContain('PI-ING-UNKNOWN');
  });

  it('uses explicit human wording for every process outcome', () => {
    expect(educationCopy.process.statuses.cold_process_ok.title).toContain('na zimno');
    expect(educationCopy.process.statuses.heat_required_for_function.title).toContain(
      'technologicznie',
    );
    expect(educationCopy.process.statuses.heat_required_for_safety.title).toContain(
      'bezpieczeństwa',
    );
    expect(educationCopy.process.statuses.heat_required_for_both.title).toContain(
      'technologicznie i dla bezpieczeństwa',
    );
    // Process is informational: an unknown process is stated as missing
    // information, not as a failure the user has to resolve.
    expect(educationCopy.process.statuses.unknown.title).toContain('Brak informacji');
  });
});
