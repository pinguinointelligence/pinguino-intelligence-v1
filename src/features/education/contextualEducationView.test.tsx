import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { educationCopy } from '@/copy/education.pl';
import { ContextualEducationView } from './ContextualEducationView';
import { processReasonText } from './processReasonText';

const source = readFileSync(resolve(import.meta.dirname, 'ContextualEducationView.tsx'), 'utf8');

describe('contextual education runtime surface', () => {
  it('opens the canonical nine-step Knowledge Tour by default instead of the retired hub', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/pro']}>
        <ContextualEducationView input={starterMilkBase()} audience="pro" onBack={() => {}} />
      </MemoryRouter>,
    );
    expect(html).toContain('data-testid="profile-education-view"');
    expect(html).toContain('← Wróć do receptury');
    expect(html).toContain('data-testid="knowledge-tour"');
    expect(html).toContain('data-layout="embedded"');
    expect(html).toContain('src="/guide/01.png"');
    expect(html.match(/class="knowledge-tour__dot"/g)).toHaveLength(9);
    expect(html).not.toContain('data-testid="contextual-learning-hub"');
    expect(html).not.toContain('data-testid="education-entry"');
    expect(html).not.toContain('Wiedza o recepturze');
  });

  it('uses the same canonical embedded tour for Home without a separate hub path', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/home']}>
        <ContextualEducationView input={starterMilkBase()} audience="home" onBack={() => {}} />
      </MemoryRouter>,
    );
    expect(html).toContain('data-testid="knowledge-tour"');
    expect(html).toContain('data-layout="embedded"');
    expect(html.match(/class="knowledge-tour__dot"/g)).toHaveLength(9);
    expect(html).not.toContain('data-testid="contextual-learning-hub"');
  });

  it('reserves the available mobile panel height while sizing the desktop surface to content', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/pro']}>
        <ContextualEducationView input={starterMilkBase()} audience="pro" onBack={() => {}} />
      </MemoryRouter>,
    );

    expect(html).toContain('grid min-h-0');
    expect(html).toContain('flex-1');
    expect(html).toContain('grid-rows-[auto_minmax(0,1fr)]');
    expect(html).toContain('data-tour-host-slot="back-entry"');
    expect(html).toContain('w-full');
    // PRO MOBILE UX v2 · A2: 4.75rem stays the fallback; the mobile cockpit
    // sheet no longer runs under the bottom stack and sets the overlap to 0.
    expect(html).toContain('bottom-[var(--pro-bottom-chrome-overlap,4.75rem)]');
    expect(html).toContain('min-[70rem]:grid-rows-[auto_auto]');
  });

  it('implements tap/click controls and no hover-only lesson path', () => {
    expect(source).toContain('onClick={onBack}');
    expect(source).toContain('<KnowledgeTour layout="embedded"');
    expect(source).toContain('<details');
    expect(source).toContain('min-h-10');
    expect(source).not.toContain('onMouseEnter');
  });

  it('preserves every direct contextual lesson without routing through the tour', () => {
    const renderLesson = (initialLesson: 'process' | 'machine' | 'ingredients' | 'sugar') =>
      renderToStaticMarkup(
        <ContextualEducationView
          input={starterMilkBase()}
          audience="pro"
          initialLesson={initialLesson}
          onBack={() => {}}
        />,
      );

    for (const lesson of ['process', 'machine'] as const) {
      const html = renderLesson(lesson);
      expect(html).toContain('data-testid="process-knowledge"');
      expect(html).not.toContain('data-testid="knowledge-tour"');
    }

    expect(renderLesson('ingredients')).toContain('data-testid="actual-recipe-knowledge"');
    expect(renderLesson('sugar')).toContain('data-testid="advanced-recipe-knowledge"');
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
