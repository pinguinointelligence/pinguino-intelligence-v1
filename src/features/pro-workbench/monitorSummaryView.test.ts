/**
 * Monitor PI summary view-model — B5 truthful states + the score seam (Agent M).
 *
 * Real engine results only (no hand-built indicator objects): the native starter
 * milk base, a sugar-starved variant (native violated bands), the nut_gelato
 * profile (category_fallback → provisional) and an empty recipe (insufficient).
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, type ProductCategory } from '@/engine';
import { copy } from '@/copy/en';
import {
  starterMilkBase,
  starterLine,
  withGrams,
  alcoholAndSugarHeavyJimBeam,
} from '@/features/recipe-constraints/constraintFixtures';
import { recipeMatchScore } from '@/features/recipe-score';
import {
  buildMonitorAssessment,
  buildMonitorPrimarySignal,
  buildStabilizationProvenance,
  monitorScoreView,
} from './monitorSummaryView';

const m = copy.monitorPi.summary;

describe('monitorScoreView — THE one score seam', () => {
  it('presents exactly the §15.1 adapter output (1–10 integer, label, aria)', () => {
    const result = calculateRecipe(starterMilkBase());
    const { match } = monitorScoreView(result);
    expect(match).toEqual(recipeMatchScore(result.scores));
    expect(match.score).not.toBeNull();
    expect(match.display).toMatch(/^\d{1,2}\/10$/);
  });
});

describe('buildMonitorAssessment — B5 truthful states', () => {
  it('insufficient: empty recipe → the EXACT sentence, never a blank state', () => {
    const empty = calculateRecipe({ ...starterMilkBase(), items: [] });
    const view = buildMonitorAssessment(empty);
    expect(view.state).toBe('insufficient');
    expect(view.headline).toBe('Brak wystarczających danych do oceny.');
    expect(view.violatedBands).toEqual([]);
  });

  it('native: the starter milk base carries the native headline + real coverage', () => {
    const view = buildMonitorAssessment(calculateRecipe(starterMilkBase()));
    expect(view.state).toBe('native');
    expect(view.headline).toBe(m.assessmentNative);
    expect(view.totalCount).toBeGreaterThan(0);
    expect(view.assessedCount).toBeGreaterThan(0);
    expect(view.coverageText).toContain(String(view.assessedCount));
  });

  it('native violated bands: sugar-starved base lists the EXACT violated band values', () => {
    const starved = calculateRecipe(withGrams(starterMilkBase(), starterLine('sucrose'), 10));
    const view = buildMonitorAssessment(starved);
    expect(view.state).toBe('native');
    expect(view.violatedBands.length).toBeGreaterThan(0);
    for (const band of view.violatedBands) {
      // The band values are the engine's own, and the value really sits outside them.
      expect(band.bandMin).toBeLessThan(band.bandMax);
      expect(band.value < band.bandMin || band.value > band.bandMax).toBe(true);
      expect(band.side).toBe(band.value < band.bandMin ? 'below' : 'above');
      expect(band.label.length).toBeGreaterThan(0);
    }
  });

  it('provisional: an unseeded profile (nut_gelato → milk fallback bands) carries the exact state + source + reason', () => {
    const provisional = calculateRecipe({
      ...starterMilkBase(),
      category: 'nut_gelato' as ProductCategory,
    });
    expect(provisional.indicators.some((i) => i.category_fallback === true)).toBe(true); // fixture sanity
    const view = buildMonitorAssessment(provisional);
    expect(view.state).toBe('provisional');
    expect(view.headline).toBe('Ocena częściowa / prowizoryczna');
    expect(view.sourceText).toBe(m.provisionalSource.category);
    expect(view.reasonText).toBe(m.provisionalReason);
    expect(view.coverageText).not.toBeNull();
  });

  it('in-band native recipe carries the honest all-in-band sentence (10 over 10 stays the adapter job)', () => {
    const view = buildMonitorAssessment(calculateRecipe(starterMilkBase()));
    if (view.violatedBands.length === 0) {
      expect(view.withinBandsText).toBe(m.withinBands);
    } else {
      expect(view.withinBandsText).toBeNull();
    }
  });
});

describe('buildMonitorPrimarySignal — one primary warning/success', () => {
  it('no warnings → the honest success line', () => {
    const result = calculateRecipe(starterMilkBase());
    const signal = buildMonitorPrimarySignal(result);
    if (result.warnings.length === 0) {
      expect(signal).toEqual({ kind: 'ok', severity: null, text: m.primaryOk });
    } else {
      expect(signal.kind).toBe('warning');
    }
  });

  it('alcohol-heavy recipe → the WORST engine warning text, by severity', () => {
    const result = calculateRecipe(alcoholAndSugarHeavyJimBeam());
    expect(result.warnings.length).toBeGreaterThan(0); // fixture sanity
    const signal = buildMonitorPrimarySignal(result);
    expect(signal.kind).toBe('warning');
    const worst = Math.max(
      ...result.warnings.map((w) => ({ info: 0, warning: 1, critical: 2 })[w.severity]),
    );
    expect(({ info: 0, warning: 1, critical: 2 })[signal.severity ?? 'info']).toBe(worst);
    expect(signal.text.length).toBeGreaterThan(0);
  });
});

describe('buildStabilizationProvenance — the B1 provenance sentence', () => {
  it('is never empty and matches one of the three honest forms', () => {
    const sentences = [
      buildStabilizationProvenance(starterMilkBase()),
      buildStabilizationProvenance({ ...starterMilkBase(), items: [] }),
    ];
    for (const sentence of sentences) {
      expect(sentence.length).toBeGreaterThan(0);
      expect(
        sentence === copy.monitorPi.stabilization.provenanceNone ||
          sentence === copy.monitorPi.stabilization.provenanceUnapproved ||
          /okien dozowania/.test(sentence),
      ).toBe(true);
    }
  });
});
