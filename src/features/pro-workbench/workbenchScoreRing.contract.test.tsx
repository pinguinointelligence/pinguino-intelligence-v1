import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TenPointScore } from '@/features/recipe-score';
import { WorkbenchScoreDisplay } from './WorkbenchScoreDisplay';
import {
  SCORE_RING_NO_DATA_TONE,
  WORKBENCH_SCORE_RING_TONES,
} from './workbenchScoreRingTones';

/**
 * The owner-approved Score ring is a VISUAL contract only. These tests pin the exact
 * approved colours, the 36 × 36 px / 2 px geometry and the absence of a visual "/10",
 * and prove the treatment reads the existing score rather than computing one.
 */

const render = (score: TenPointScore | null) =>
  renderToStaticMarkup(
    <WorkbenchScoreDisplay
      score={score}
      label="Dopasowanie"
      preview={false}
      onOpenLearning={() => undefined}
    />,
  );

const APPROVED: ReadonlyArray<readonly [TenPointScore, string]> = [
  [10, '#51ad3e'],
  [9, '#70ba43'],
  [8, '#9dc43e'],
  [7, '#ddcb32'],
  [6, '#f0ad26'],
  [5, '#f58a07'],
];

describe('Score ring approved colours', () => {
  it.each(APPROVED)('score %i uses exactly %s', (score, color) => {
    expect(WORKBENCH_SCORE_RING_TONES[score].color).toBe(color);
    expect(render(score)).toContain(`border-color:${color}`);
  });

  it.each([4, 3, 2, 1] as const)('score %i keeps the lowest approved orange', (score) => {
    expect(WORKBENCH_SCORE_RING_TONES[score].color).toBe('#f58a07');
    expect(render(score)).toContain('border-color:#f58a07');
  });

  it('renders the no-data ring in the approved neutral', () => {
    expect(SCORE_RING_NO_DATA_TONE.color).toBe('#dcd8cf');
    const html = render(null);
    expect(html).toContain('border-color:#dcd8cf');
    expect(html).toContain('data-score="no-data"');
  });

  it('introduces no colour beyond the approved set', () => {
    const approved = new Set([...APPROVED.map(([, color]) => color), '#f58a07', '#dcd8cf']);
    for (const tone of Object.values(WORKBENCH_SCORE_RING_TONES)) {
      expect(approved.has(tone.color)).toBe(true);
    }
    expect(approved.has(SCORE_RING_NO_DATA_TONE.color)).toBe(true);
  });

  it('uses no gradient', () => {
    for (const score of [10, 7, 1] as const) {
      expect(render(score)).not.toContain('gradient');
    }
  });
});

describe('Score ring geometry', () => {
  it.each([10, 8, 5, 1, null] as const)('score %s keeps the 36 px ring with a 2 px stroke', (score) => {
    const html = render(score);
    // size-9 = 2.25rem = 36 px; border-2 = 2 px.
    expect(html).toMatch(/class="[^"]*\bsize-9\b/);
    expect(html).toMatch(/class="[^"]*\bborder-2\b/);
    expect(html).toMatch(/class="[^"]*\brounded-full\b/);
    expect(html).not.toMatch(/border-\[3px\]/);
  });
});

describe('Score ring numeral', () => {
  it.each([10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const)('shows %i without a visual /10', (score) => {
    const html = render(score);
    const ring = html.match(/data-testid="workbench-score-ring"[^>]*>([^<]*)</);
    expect(ring?.[1]).toBe(String(score));
    expect(ring?.[1]).not.toContain('/10');
  });

  it('shows an em dash rather than a fabricated number when there is no score', () => {
    const ring = render(null).match(/data-testid="workbench-score-ring"[^>]*>([^<]*)</);
    expect(ring?.[1]).toBe('—');
    expect(ring?.[1]).not.toContain('0');
  });

  it('keeps the scale available to assistive technology even though it is not drawn', () => {
    expect(render(8)).toContain('8 na 10');
  });
});

describe('Score ring does not touch Score logic', () => {
  it('renders exactly the score it is handed', () => {
    for (const score of [10, 6, 1] as const) {
      expect(render(score)).toContain(`data-score="${score}"`);
    }
  });

  it('imports no engine, solver or score calculation', async () => {
    const [display, tones] = await Promise.all([
      import('./WorkbenchScoreDisplay?raw'),
      import('./workbenchScoreRingTones?raw'),
    ]);
    // Guard against a vacuous pass: the raw sources must actually have loaded.
    expect(display.default).toContain('WorkbenchScoreDisplay');
    expect(tones.default).toContain('#51ad3e');
    for (const source of [display.default, tones.default]) {
      expect(source).not.toMatch(/computeScore|calculateScore|scoreRecipe|@\/engine/);
    }
  });
});
