/**
 * recipe-score — three-indicator separation tests (SPEC §20.5).
 * The contract table (three distinct indicators, audiences per spec), the
 * data-confidence status mapping (order + honesty, never a lab claim), and the
 * production-readiness vocabulary (each state has text; monotone derivation).
 */
import { describe, expect, it } from 'vitest';
import type { ProductStatus } from '@/data/products/productRow';
import { formatProductStatusLabel } from '@/data/products/productStatusDecision';
import {
  DATA_CONFIDENCE_DISCLAIMER,
  DATA_CONFIDENCE_LEVELS,
  PRODUCTION_READINESS_ORDER,
  PRODUCTION_READINESS_TEXT,
  READINESS_THRESHOLDS,
  RECIPE_INDICATOR_CONTRACTS,
  RECIPE_INDICATOR_KINDS,
  dataConfidence,
  productionReadiness,
  type DataConfidenceSubject,
} from './indicatorSeparation';
import type { TenPointScore } from './recipeMatchScore';

describe('the §20.5 separation contract — three indicators, never conflated', () => {
  it('declares exactly the three kinds, each with a distinct meaning', () => {
    expect([...RECIPE_INDICATOR_KINDS].sort()).toEqual([
      'data_confidence',
      'match_score',
      'production_readiness',
    ]);
    const names = new Set<string>();
    const meanings = new Set<string>();
    for (const kind of RECIPE_INDICATOR_KINDS) {
      const contract = RECIPE_INDICATOR_CONTRACTS[kind];
      expect(contract.kind).toBe(kind);
      expect(contract.name.length).toBeGreaterThan(0);
      expect(contract.meaning.length).toBeGreaterThan(0);
      names.add(contract.name);
      meanings.add(contract.meaning);
    }
    expect(names.size).toBe(3);
    expect(meanings.size).toBe(3);
  });

  it('uses the exact §20.5 Polish table (names, meanings, audiences)', () => {
    expect(RECIPE_INDICATOR_CONTRACTS.match_score).toMatchObject({
      name: 'Dopasowanie receptury',
      meaning: 'Jak dobrze wynik odpowiada produktowi, trybowi i założeniom.',
      audience: 'home_and_pro',
    });
    expect(RECIPE_INDICATOR_CONTRACTS.data_confidence).toMatchObject({
      name: 'Pewność danych',
      meaning: 'Jak kompletne i zweryfikowane są dane składników i profilu.',
      audience: 'mainly_pro',
    });
    expect(RECIPE_INDICATOR_CONTRACTS.production_readiness).toMatchObject({
      name: 'Gotowość produkcyjna',
      meaning: 'Czy receptura jest gotowa, wymaga testu, czy jest eksperymentalna.',
      audience: 'pro_only',
    });
  });
});

describe('dataConfidence — statuses → 1–10-or-status (§20.5)', () => {
  it('maps every subject in the existing vocabulary', () => {
    expect(dataConfidence('verified_reference')).toMatchObject({ level: 10, statusLabel: 'Verified' });
    expect(dataConfidence('pi_verified')).toMatchObject({ level: 9, statusLabel: 'PI Verified' });
    expect(dataConfidence('pi_calculated')).toMatchObject({ level: 7, statusLabel: 'PI Calculated' });
    expect(dataConfidence('manual_adjusted')).toMatchObject({ level: 6, statusLabel: 'Manual Adjusted' });
    expect(dataConfidence('pi_generated')).toMatchObject({ level: 5, statusLabel: 'PI Generated' });
  });

  it('internal states carry NO level and NO customer label — an honest status text instead', () => {
    for (const subject of ['draft', 'rejected'] as const) {
      const presentation = dataConfidence(subject);
      expect(presentation.level).toBeNull();
      expect(presentation.statusLabel).toBeNull();
      expect(presentation.text.length).toBeGreaterThan(0);
    }
  });

  it('preserves the honest provenance ORDER (the contract; exact levels are calibration-pending)', () => {
    const levels = DATA_CONFIDENCE_LEVELS;
    expect(levels.verified_reference!).toBeGreaterThanOrEqual(levels.pi_verified!);
    expect(levels.pi_verified!).toBeGreaterThan(levels.pi_calculated!);
    expect(levels.pi_calculated!).toBeGreaterThan(levels.manual_adjusted!);
    expect(levels.manual_adjusted!).toBeGreaterThan(levels.pi_generated!);
    for (const level of [levels.verified_reference, levels.pi_verified, levels.pi_calculated, levels.manual_adjusted, levels.pi_generated]) {
      expect(level!).toBeGreaterThanOrEqual(1);
      expect(level!).toBeLessThanOrEqual(10);
      expect(Number.isInteger(level)).toBe(true);
    }
  });

  it('reuses formatProductStatusLabel as the single label source for product statuses', () => {
    const productStatuses: ProductStatus[] = ['draft', 'pi_calculated', 'pi_generated', 'manual_adjusted', 'pi_verified', 'rejected'];
    for (const status of productStatuses) {
      expect(dataConfidence(status).statusLabel).toBe(formatProductStatusLabel(status));
    }
  });

  it('never pretends to be a laboratory result and never shows percentages', () => {
    const subjects: DataConfidenceSubject[] = ['verified_reference', 'pi_verified', 'pi_calculated', 'manual_adjusted', 'pi_generated', 'draft', 'rejected'];
    for (const subject of subjects) {
      const presentation = dataConfidence(subject);
      expect(presentation.disclaimer).toBe(DATA_CONFIDENCE_DISCLAIMER);
      expect(presentation.disclaimer).toContain('nie jest wynikiem laboratoryjnym');
      for (const text of [presentation.text, presentation.disclaimer]) {
        expect(text).not.toContain('%');
        expect(text).not.toMatch(/procent/i);
        expect(text).not.toMatch(/laboratoryjnie potwierdzon/i);
      }
      expect(presentation.textKey).toBe(`recipe-score.data-confidence.${subject}`);
    }
  });
});

describe('productionReadiness — ready / test_recommended / experimental (Pro)', () => {
  it('exposes exactly three readiness states, each with label AND text', () => {
    expect([...PRODUCTION_READINESS_ORDER].sort()).toEqual(['experimental', 'ready', 'test_recommended']);
    for (const readiness of PRODUCTION_READINESS_ORDER) {
      const vocab = PRODUCTION_READINESS_TEXT[readiness];
      expect(vocab.readiness).toBe(readiness);
      expect(vocab.label.length).toBeGreaterThan(0);
      expect(vocab.text.length).toBeGreaterThan(0);
      expect(vocab.textKey).toBe(`recipe-score.readiness.${readiness}`);
      expect(vocab.label).not.toContain('%');
      expect(vocab.text).not.toContain('%');
    }
  });

  it('missing data is honestly experimental — never a fake ready', () => {
    expect(productionReadiness({ matchScore: null, dataConfidenceLevel: null }).readiness).toBe('experimental');
    expect(productionReadiness({ matchScore: 10, dataConfidenceLevel: null }).readiness).toBe('experimental');
    expect(productionReadiness({ matchScore: null, dataConfidenceLevel: 10 }).readiness).toBe('experimental');
  });

  it('applies the documented calibration-pending thresholds', () => {
    const { ready, test_recommended } = READINESS_THRESHOLDS;
    expect(productionReadiness({ matchScore: ready.minMatchScore as TenPointScore, dataConfidenceLevel: ready.minDataConfidence as TenPointScore }).readiness).toBe('ready');
    expect(productionReadiness({ matchScore: 10, dataConfidenceLevel: 10 }).readiness).toBe('ready');
    expect(productionReadiness({ matchScore: 7, dataConfidenceLevel: 7 }).readiness).toBe('test_recommended');
    expect(productionReadiness({ matchScore: test_recommended.minMatchScore as TenPointScore, dataConfidenceLevel: test_recommended.minDataConfidence as TenPointScore }).readiness).toBe('test_recommended');
    expect(productionReadiness({ matchScore: 8, dataConfidenceLevel: 5 }).readiness).toBe('test_recommended'); // high match, weak data ≠ ready
    expect(productionReadiness({ matchScore: 5, dataConfidenceLevel: 10 }).readiness).toBe('experimental'); // strong data cannot rescue a weak match
    expect(productionReadiness({ matchScore: 6, dataConfidenceLevel: 4 }).readiness).toBe('experimental');
  });

  it('is monotone in both inputs — better inputs never lower readiness', () => {
    const rank = (readiness: string) => PRODUCTION_READINESS_ORDER.indexOf(readiness as never);
    const scale = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
    for (const match of scale) {
      for (const confidence of scale) {
        const here = rank(productionReadiness({ matchScore: match, dataConfidenceLevel: confidence }).readiness);
        if (match < 10) {
          const bumpMatch = rank(productionReadiness({ matchScore: (match + 1) as TenPointScore, dataConfidenceLevel: confidence }).readiness);
          expect(bumpMatch).toBeGreaterThanOrEqual(here);
        }
        if (confidence < 10) {
          const bumpConfidence = rank(productionReadiness({ matchScore: match, dataConfidenceLevel: (confidence + 1) as TenPointScore }).readiness);
          expect(bumpConfidence).toBeGreaterThanOrEqual(here);
        }
      }
    }
  });

  it('never mutates its input', () => {
    const input = Object.freeze({ matchScore: 8 as TenPointScore, dataConfidenceLevel: 7 as TenPointScore });
    expect(() => productionReadiness(input)).not.toThrow();
    expect(input).toEqual({ matchScore: 8, dataConfidenceLevel: 7 });
  });
});
