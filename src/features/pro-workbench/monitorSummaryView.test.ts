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
  overSweetStarter,
} from '@/features/recipe-constraints/constraintFixtures';
import { recipeTechnicalFit } from '@/features/recipe-score';
import {
  buildMonitorAssessment,
  buildMonitorPrimarySignal,
  buildStabilizationProvenance,
  monitorScoreView,
} from './monitorSummaryView';

const m = copy.monitorPi.summary;

describe('monitorScoreView — THE one score seam', () => {
  it('presents exactly the CANONICAL technical-fit adapter (owner CURRENT-DRAFT P0, Phase 5)', () => {
    // ONE CANONICAL SCORE: the Monitor headline used to read the engine's
    // mode-weighted `overall` blend while every other public surface read the
    // addendum-2 technical dimension — the owner's „modal 9/10 vs Monitor
    // 8/10". The seam now reads the SAME adapter as everyone else.
    const result = calculateRecipe(starterMilkBase());
    const { match } = monitorScoreView(result);
    expect(match).toEqual(recipeTechnicalFit(result));
    expect(match.score).not.toBeNull();
    expect(match.display).toMatch(/^\d{1,2}\/10$/);
  });

  it('the Monitor and the recalculation modal can NEVER show two integers for one draft', () => {
    for (const rec of [starterMilkBase(), overSweetStarter(220)]) {
      const result = calculateRecipe(rec);
      // The modal / OverallScoreCard / status-badge path…
      const canonical = recipeTechnicalFit(result);
      // …and the Monitor headline path.
      expect(monitorScoreView(result).match.score).toBe(canonical.score);
      expect(monitorScoreView(result).match.display).toBe(canonical.display);
    }
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
