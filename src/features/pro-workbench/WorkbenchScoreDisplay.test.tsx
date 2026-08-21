import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TenPointScore } from '@/features/recipe-score';
import { WorkbenchScoreDisplay } from './WorkbenchScoreDisplay';
import { WORKBENCH_SCORE_RING_TONES } from './workbenchScoreRingTones';

const REFERENCED_SCORES = [10, 9, 8, 7, 6, 5] as const satisfies readonly TenPointScore[];

const visibleText = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('WorkbenchScoreDisplay owner-reference ring', () => {
  it.each(REFERENCED_SCORES)('renders score %i with its centralized ring token', (score) => {
    const tone = WORKBENCH_SCORE_RING_TONES[score];
    const html = renderToStaticMarkup(
      <WorkbenchScoreDisplay
        score={score}
        label={`Ocena ${score}`}
        preview={false}
        onOpenLearning={() => undefined}
      />,
    );

    expect(html).toContain(`data-score="${score}"`);
    expect(html).toContain(`data-score-tone="${tone.token}"`);
    expect(html).toContain(`border-color:${tone.color}`);
  });

  it('keeps the current heading and verbal state while removing visual /10', () => {
    const html = renderToStaticMarkup(
      <WorkbenchScoreDisplay
        score={10}
        label="Wyjątkowo dobrze dopasowana"
        preview={false}
        onOpenLearning={() => undefined}
      />,
    );
    const text = visibleText(html);

    expect(text).toContain('Wynik aktualny');
    expect(text).toContain('Wyjątkowo dobrze dopasowana');
    expect(text).not.toContain('/10');
  });

  it('provides a meaningful number, scale and verdict to assistive technology', () => {
    const html = renderToStaticMarkup(
      <WorkbenchScoreDisplay
        score={9}
        label="Świetnie dopasowana"
        preview={false}
        onOpenLearning={() => undefined}
      />,
    );

    expect(html).toContain(
      'aria-label="Dopasowanie techniczne receptury — Wynik aktualny: 9 na 10 — Świetnie dopasowana"',
    );
  });

  it('keeps the dock control compact, circular and safe at narrow widths', () => {
    const html = renderToStaticMarkup(
      <WorkbenchScoreDisplay
        score={8}
        label="Bardzo dobrze dopasowana"
        preview={false}
        onOpenLearning={() => undefined}
      />,
    );

    expect(html).toMatch(/class="[^"]*h-11[^"]*max-w-full[^"]*shrink-0/);
    expect(html).toMatch(/class="[^"]*size-9[^"]*shrink-0[^"]*rounded-full[^"]*border-2/);
    expect(html).toContain('class="hidden min-w-0 sm:block"');
    expect(html).toContain('block truncate text-[10px]');
    expect(html).not.toMatch(/min-h-|h-(?:12|14|16|20)/);
  });
});
