/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { SurfaceToneContext } from '@/components/ui/surface';
import { copy } from '@/copy/en';
import { LockedCalculatorPreview } from './LockedCalculatorPreview';
import { LockedNutritionPreview } from './LockedNutritionPreview';
import { LockedPIPreview } from './LockedPIPreview';
import { LockedScorePreview } from './LockedScorePreview';

/** Render a locked preview the way StudioPage does (shell tone, inside a router). */
function render(el: ReactElement): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <SurfaceToneContext.Provider value="shell">{el}</SurfaceToneContext.Provider>
    </MemoryRouter>,
  );
}

/** Strip tags + entities → only the visible text (class names / SVG paths live in attributes). */
const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ');

const PREVIEWS: Array<[string, ReactElement]> = [
  ['LockedCalculatorPreview', <LockedCalculatorPreview />],
  ['LockedPIPreview', <LockedPIPreview />],
  ['LockedNutritionPreview', <LockedNutritionPreview />],
  ['LockedScorePreview', <LockedScorePreview />],
];

describe('locked Free Preview previews — decorative only (Slice 2B)', () => {
  for (const [name, el] of PREVIEWS) {
    it(`${name} renders no numeric / exact values, only "—" placeholders`, () => {
      const html = render(el);
      expect(/\d/.test(visibleText(html)), `digit in ${name} visible text`).toBe(false);
      expect(html, `${name} should show a — placeholder`).toContain('—');
    });
  }

  it('LockedScorePreview carries the single Unlock PI Pro CTA linking to /subscription', () => {
    const html = render(<LockedScorePreview />);
    expect(html).toContain(copy.gate.unlockCta);
    expect(html).toContain(copy.studio.locked.cta);
    expect(html).toContain('href="/subscription"');
  });

  it('locked source files import no engine / result / real-panel symbols', () => {
    const dir = import.meta.dirname;
    const files = [
      'LockedPanel',
      'LockedCalculatorPreview',
      'LockedPIPreview',
      'LockedNutritionPreview',
      'LockedScorePreview',
    ];
    const forbidden = [
      /@\/engine/,
      /RecipeResult/,
      /CorrectionResult/,
      /useStudioResult/,
      /MetricValue/,
      /IngredientBuilder/,
      /PIPanel/,
      /OverallScoreCard/,
      /NutritionCostScorePanel/,
    ];
    for (const file of files) {
      const text = readFileSync(join(dir, `${file}.tsx`), 'utf8');
      // Scan import statements only — comments may legitimately mention these words.
      const imports = text
        .split('\n')
        .filter((line) => /^\s*import\b/.test(line))
        .join('\n');
      for (const re of forbidden) {
        expect(re.test(imports), `${file}.tsx must not import ${re}`).toBe(false);
      }
    }
  });
});
