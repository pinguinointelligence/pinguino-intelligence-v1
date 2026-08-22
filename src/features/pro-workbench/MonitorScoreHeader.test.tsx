import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import {
  starterLine,
  starterMilkBase,
  withGrams,
} from '@/features/recipe-constraints/constraintFixtures';
import { MonitorScoreHeader } from './MonitorScoreHeader';
import { monitorScoreComparison } from './monitorLiveScore';

const comparisonFor = (current: RecipeInput, proposal?: RecipeInput) =>
  monitorScoreComparison({
    input: current,
    result: calculateRecipe(current),
    previewInput: proposal ?? null,
    previewResult: proposal ? calculateRecipe(proposal) : null,
  });

const render = (current: RecipeInput, proposal?: RecipeInput, stale = false) =>
  renderToStaticMarkup(
    <MonitorScoreHeader comparison={comparisonFor(current, proposal)} stale={stale} />,
  );

const visibleText = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const broken = () => withGrams(starterMilkBase(), starterLine('sucrose'), 420);

describe('Monitor score header — current recipe', () => {
  it('renders the live current score with its verdict', () => {
    const html = render(starterMilkBase());
    expect(html).toContain('data-testid="monitor-score-header"');
    expect(html).toContain('data-testid="monitor-score-current"');
    expect(visibleText(html)).toContain('Wynik aktualny');
    expect(visibleText(html)).toContain('Wyjątkowo dobrze dopasowana');
  });

  it('shows no visible /10 anywhere in the header', () => {
    for (const input of [starterMilkBase(), broken()]) {
      expect(visibleText(render(input))).not.toContain('/10');
      expect(visibleText(render(input, starterMilkBase()))).not.toContain('/10');
    }
  });

  it('keeps the accepted 36 px / 2 px ring contract', () => {
    const html = render(broken(), starterMilkBase());
    const rings = html.match(/data-testid="monitor-score-ring-(current|proposed)"/g) ?? [];
    expect(rings).toHaveLength(2);
    expect(html).toMatch(/class="[^"]*\bsize-9\b/);
    expect(html).toMatch(/class="[^"]*\bborder-2\b/);
    expect(html).toMatch(/class="[^"]*\brounded-full\b/);
    expect(html).not.toMatch(/border-\[3px\]/);
  });

  it('reports the score it is showing for the served QA ledger', () => {
    expect(render(starterMilkBase())).toContain('data-current-score="10"');
    expect(render(broken())).toContain('data-current-score="3"');
  });

  it('marks a stale evaluation without claiming the recipe was recalculated', () => {
    const stale = render(starterMilkBase(), undefined, true);
    expect(stale).toContain('data-stale="true"');
    expect(visibleText(stale)).toContain('Oczekuje na przeliczenie');
    // The live score is still shown — a stale recipe is not an unscored recipe.
    expect(stale).toContain('data-current-score="10"');
    const fresh = render(starterMilkBase());
    expect(fresh).toContain('data-stale="false"');
    expect(visibleText(fresh)).not.toContain('Oczekuje na przeliczenie');
  });
});

describe('Monitor score header — Gellatti proposal', () => {
  it('shows current → proposal when a valid candidate exists', () => {
    const html = render(broken(), starterMilkBase());
    expect(html).toContain('data-testid="monitor-score-proposed"');
    expect(html).toContain('data-testid="monitor-score-arrow"');
    expect(html).toContain('data-current-score="3"');
    expect(html).toContain('data-proposed-score="10"');
    const text = visibleText(html);
    expect(text).toContain('Wynik aktualny');
    expect(text).toContain('Po korekcie Gellatti');
  });

  it('shows no proposal block when the preview is cancelled', () => {
    const html = render(broken());
    expect(html).not.toContain('data-testid="monitor-score-proposed"');
    expect(html).not.toContain('data-testid="monitor-score-arrow"');
    expect(visibleText(html)).not.toContain('Po korekcie Gellatti');
  });

  it('drops the comparison after the proposal has been applied', () => {
    // Current recipe IS the proposal now.
    const html = render(starterMilkBase(), starterMilkBase());
    expect(html).not.toContain('data-testid="monitor-score-proposed"');
    expect(html).toContain('data-current-score="10"');
  });

  it('renders two independent rings, not one giant card', () => {
    const html = render(broken(), starterMilkBase());
    // One compact row; no nested card containers.
    expect((html.match(/data-testid="monitor-score-header"/g) ?? []).length).toBe(1);
    expect(html).toMatch(/flex-wrap/);
  });
});

describe('Monitor score header — accessibility and layout', () => {
  it('labels both scores in words rather than by ring colour alone', () => {
    const html = render(broken(), starterMilkBase());
    expect(html).toContain('Wynik aktualny receptury: 3 na 10');
    expect(html).toContain('Wynik propozycji Gellatti: 10 na 10');
  });

  it('states the honest reason in words when there is no score', () => {
    const base = starterMilkBase();
    const draft: RecipeInput = {
      ...base,
      items: [...base.items, { ...base.items[0]!, id: 'draft', planned_grams: 0 }],
    };
    const html = render(draft);
    expect(html).toContain('data-current-score="awaiting_grams"');
    expect(visibleText(html)).toContain('Uzupełnij gramaturę składnika');
    expect(visibleText(html)).not.toContain('/10');
  });

  it('wraps instead of overflowing on a narrow viewport', () => {
    const html = render(broken(), starterMilkBase());
    // The row wraps and each side may shrink; nothing forces horizontal scroll.
    expect(html).toMatch(/flex-wrap/);
    expect((html.match(/min-w-0/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).not.toMatch(/overflow-x-scroll|whitespace-nowrap/);
  });
});
