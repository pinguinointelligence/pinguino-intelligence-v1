import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateRecipe } from '@/engine';
import {
  starterLine,
  starterMilkBase,
  withGrams,
} from '@/features/recipe-constraints/constraintFixtures';
import { monitorLiveScore, monitorScoreComparison } from './monitorLiveScore';

/**
 * The two score surfaces have DIFFERENT jobs and must not be conflated:
 *
 *   Monitor       → LIVE current-recipe evaluation (diagnostic, updates while stale)
 *   Recipe footer → LIVE score plus a separate `Przelicz` action while stale
 *
 * These tests pin that separation at the source, where a regression would
 * otherwise only show up as a duplicated score on staging.
 */
const header = readFileSync(new URL('./WorkbenchIntelligenceHeader.tsx', import.meta.url), 'utf8');
const monitorSummary = readFileSync(new URL('./MonitorLiveSummary.tsx', import.meta.url), 'utf8');

/** The dock's render branch: score and freshness action are independently gated. */
const dockBranch = header.slice(
  header.indexOf("if (variant === 'dock')"),
  header.indexOf('return (', header.indexOf("if (variant === 'dock')") + 400),
);

describe('recipe footer keeps the formal calculation state machine', () => {
  it('keeps calculation freshness separate from live score visibility', () => {
    expect(header).toContain('currentResultAuthority.baseTechnicalReady');
    expect(header).toContain('const verifiedCurrent');
    expect(header).toContain("journeyState === 'CURRENT'");
    expect(header).toContain('const recalculateNeeded');
    const journey = readFileSync(new URL('./friendlyLabRecipeJourney.ts', import.meta.url), 'utf8');
    expect(journey).toContain(
      "if (input.awaitingRecalculation || input.calculatedForDraft) return 'STALE';",
    );
    expect(journey).toContain(
      "if (input.calculatedForDraft && !input.calculatedAuthorityCurrent) return 'STALE';",
    );
    expect(journey).toContain("if (firstRunStillOpen) return 'INITIAL';");
    const currentAuthority = readFileSync(
      new URL('./currentRecipeResultAuthority.ts', import.meta.url),
      'utf8',
    );
    expect(currentAuthority).toContain("'MONITOR'");
    expect(currentAuthority).toContain("'NUTRITION'");
    expect(currentAuthority).toContain("'COST'");
    expect(currentAuthority).toContain("'SUMMARY'");
  });

  it('keeps the live score visible while stale and renders Recalculate independently', () => {
    expect(dockBranch).toContain('{displayedMatch ? (');
    expect(dockBranch).toContain('{pending || recalculateNeeded ? (');
    expect(dockBranch).toContain('data-testid="pro-workbar-recalc"');
    expect(dockBranch).toContain('<WorkbenchScoreDisplay');
    expect((dockBranch.match(/<WorkbenchScoreDisplay/g) ?? []).length).toBe(1);
    expect((dockBranch.match(/data-testid="pro-workbar-recalc"/g) ?? []).length).toBe(1);
  });

  it('never binds the footer to the live diagnostic score', () => {
    expect(header).not.toContain('monitorLiveScore');
    expect(header).not.toContain('monitorScoreComparison');
    expect(header).not.toContain('MonitorScoreHeader');
  });
});

describe('Monitor owns the live score and the proposal comparison', () => {
  it('renders the live header from the canonical live seam', () => {
    expect(monitorSummary).toContain('MonitorScoreHeader');
    expect(monitorSummary).toContain('monitorScoreComparison');
  });

  it('keeps the before/after comparison out of the recipe footer', () => {
    expect(monitorSummary).toContain('previewInput');
    expect(header).not.toContain('Po korekcie Gellatti');
  });

  it('updates the live score while the recipe is formally stale', () => {
    // The Monitor seam takes no freshness flag at all — it cannot be silenced by one.
    const fresh = monitorLiveScore(starterMilkBase(), calculateRecipe(starterMilkBase()));
    const edited = withGrams(starterMilkBase(), starterLine('sucrose'), 420);
    const stale = monitorLiveScore(edited, calculateRecipe(edited));
    expect(fresh.score).toBe(10);
    expect(stale.score).toBe(3);
    expect(stale.score).not.toBe(fresh.score);
  });

  it('derives no freshness authority from the live diagnostic score', () => {
    const live = readFileSync(new URL('./monitorLiveScore.ts', import.meta.url), 'utf8');
    // Strip comments: the docblock deliberately explains where freshness lives.
    const code = live.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(
      /awaitingRecalculation|acknowledgeRecalculation|markRecalculationRequired/,
    );
    expect(code).not.toMatch(/productionReadiness|savedRecipeId|dirty/);
    expect(code).not.toMatch(/recipeProfileStore|useRecipeStore|constraintStudioStore/);
  });

  it('still shows the proposal only in the Monitor', () => {
    const current = withGrams(starterMilkBase(), starterLine('sucrose'), 420);
    const view = monitorScoreComparison({
      input: current,
      result: calculateRecipe(current),
      previewInput: starterMilkBase(),
      previewResult: calculateRecipe(starterMilkBase()),
    });
    expect(view.showComparison).toBe(true);
    expect(view.proposed?.score).toBe(10);
  });
});
