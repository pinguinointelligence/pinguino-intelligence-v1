import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TenPointScore } from '@/features/recipe-score';
import { ScoreRing } from './ScoreRing';
import {
  SCORE_RING_GEOMETRY,
  SCORE_RING_NO_DATA_TONE,
  WORKBENCH_SCORE_RING_TONES,
} from './workbenchScoreRingTones';

const render = (score: TenPointScore | null) => renderToStaticMarkup(<ScoreRing score={score} />);

/** The coloured arc length the markup actually asks the browser to draw. */
const arcLength = (html: string): number | null => {
  const match = html.match(/data-arc-length="([\d.]+)"/);
  return match ? Number(match[1]) : null;
};

const C = SCORE_RING_GEOMETRY.circumference;

describe('Score ring draws real progress', () => {
  it.each([
    [10, 1.0],
    [9, 0.9],
    [8, 0.8],
    [7, 0.7],
    [6, 0.6],
    [5, 0.5],
    [4, 0.4],
    [3, 0.3],
    [2, 0.2],
    [1, 0.1],
  ] as const)('score %i colours %f of the circumference', (score, fraction) => {
    const html = render(score);
    expect(html).toContain(`data-score-progress="${fraction.toFixed(2)}"`);
    expect(arcLength(html)).toBeCloseTo(C * fraction, 1);
  });

  it('leaves the remainder on the neutral track', () => {
    const html = render(5);
    // The full neutral circle is always drawn underneath …
    expect(html).toContain(`stroke="${SCORE_RING_NO_DATA_TONE.color}"`);
    // … and the coloured arc covers only half, so the other half reads as grey.
    const dash = html.match(/stroke-dasharray="([\d.]+) ([\d.]+)"/);
    expect(dash).not.toBeNull();
    const coloured = Number(dash![1]);
    const gap = Number(dash![2]);
    expect(coloured).toBeCloseTo(gap, 1);
    expect(coloured + gap).toBeCloseTo(C, 1);
  });

  it('never draws a full coloured circle for a partial score', () => {
    for (const score of [9, 8, 7, 6, 5, 4, 3, 2, 1] as const) {
      expect(arcLength(render(score))!).toBeLessThan(C - 0.5);
    }
    // Only a 10 closes the ring.
    expect(arcLength(render(10))!).toBeCloseTo(C, 1);
  });

  it('draws only the neutral track when there is no score', () => {
    const html = render(null);
    expect(html).toContain('data-score-progress="0.00"');
    expect(html).not.toContain('data-arc-length');
    expect(html).toContain(`stroke="${SCORE_RING_NO_DATA_TONE.color}"`);
    expect(html).toContain('—');
  });

  it('starts the arc at the top of the circle', () => {
    expect(render(5)).toMatch(/class="[^"]*-rotate-90/);
  });
});

describe('Score ring keeps the accepted visual contract', () => {
  it.each([
    [10, '#51ad3e'],
    [9, '#70ba43'],
    [8, '#9dc43e'],
    [7, '#ddcb32'],
    [6, '#f0ad26'],
    [5, '#f58a07'],
  ] as const)('score %i uses exactly %s for the coloured arc', (score, color) => {
    expect(WORKBENCH_SCORE_RING_TONES[score].color).toBe(color);
    expect(render(score)).toContain(`stroke="${color}"`);
  });

  it.each([4, 3, 2, 1] as const)('score %i keeps the lowest approved orange', (score) => {
    expect(render(score)).toContain('stroke="#f58a07"');
  });

  it('keeps the Monitor ring at its current 36 px size and 2 px stroke', () => {
    expect(SCORE_RING_GEOMETRY.size).toBe(36);
    expect(SCORE_RING_GEOMETRY.stroke).toBe(2);
    const html = render(7);
    expect(html).toMatch(/class="[^"]*\bsize-9\b/);
    expect(html).toContain('stroke-width="2"');
    expect(html).toContain('viewBox="0 0 36 36"');
  });

  it('shows the bare numeral with no visible /10', () => {
    for (const score of [10, 7, 1] as const) {
      const html = render(score);
      expect(html).not.toContain('/10');
      expect(html).toContain(`>${score}<`);
    }
  });
});
