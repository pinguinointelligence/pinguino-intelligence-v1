import { describe, expect, it } from 'vitest';
import {
  EMPTY_COUNTS,
  MAX_CUSTOMERS_PER_PLAN,
  MONTHS_PER_YEAR,
  calculateAffiliateCommission,
  isCustomTermsMode,
  normalizeCount,
  normalizeCounts,
} from './affiliateCalculator';
import { publicRate } from './publicRateAuthority';

describe('affiliate calculator', () => {
  it('is zero for zero customers', () => {
    const result = calculateAffiliateCommission('standard', EMPTY_COUNTS);
    expect(result.monthlyFromMonthlyCents).toBe(0);
    expect(result.fromAnnualRenewalsCents).toBe(0);
    expect(result.totalPerYearCents).toBe(0);
    expect(result.averagePerMonthCents).toBe(0);
  });

  it('computes the owner formula for Standard', () => {
    // 10 HOME monthly, 5 PRO monthly, 4 HOME annual, 3 PRO annual
    const result = calculateAffiliateCommission('standard', {
      homeMonthly: 10,
      proMonthly: 5,
      homeAnnual: 4,
      proAnnual: 3,
    });
    // A: 10×199 + 5×499 = 1990 + 2495 = 4485 cents / month
    expect(result.monthlyFromMonthlyCents).toBe(4485);
    // B: 4×900 + 3×2900 = 3600 + 8700 = 12300 cents / year
    expect(result.fromAnnualRenewalsCents).toBe(12300);
    // C: 4485×12 + 12300 = 53820 + 12300 = 66120
    expect(result.totalPerYearCents).toBe(66120);
    // D: 66120 / 12 = 5510
    expect(result.averagePerMonthCents).toBe(5510);
  });

  it('computes the owner formula for Gold', () => {
    const result = calculateAffiliateCommission('gold', {
      homeMonthly: 10,
      proMonthly: 5,
      homeAnnual: 4,
      proAnnual: 3,
    });
    // A: 10×249 + 5×599 = 2490 + 2995 = 5485
    expect(result.monthlyFromMonthlyCents).toBe(5485);
    // B: 4×1400 + 3×3900 = 5600 + 11700 = 17300
    expect(result.fromAnnualRenewalsCents).toBe(17300);
    expect(result.totalPerYearCents).toBe(5485 * 12 + 17300);
  });

  it('always pays Gold at least as much as Standard for the same customers', () => {
    const counts = { homeMonthly: 40, proMonthly: 25, homeAnnual: 30, proAnnual: 5 };
    const standard = calculateAffiliateCommission('standard', counts);
    const gold = calculateAffiliateCommission('gold', counts);
    expect(gold.totalPerYearCents).toBeGreaterThan(standard.totalPerYearCents);
  });

  it('keeps the monthly component and the annual average distinct', () => {
    // Annual-only customers earn nothing in the "per month from monthly plans"
    // line, but still contribute to the yearly total and its average.
    const result = calculateAffiliateCommission('standard', { homeAnnual: 12 });
    expect(result.monthlyFromMonthlyCents).toBe(0);
    expect(result.fromAnnualRenewalsCents).toBe(12 * 900);
    expect(result.totalPerYearCents).toBe(12 * 900);
    expect(result.averagePerMonthCents).toBe(900);
  });

  it('derives the yearly total from the twelve monthly renewals', () => {
    const counts = { proMonthly: 7 };
    const result = calculateAffiliateCommission('standard', counts);
    expect(result.totalPerYearCents).toBe(
      result.monthlyFromMonthlyCents * MONTHS_PER_YEAR + result.fromAnnualRenewalsCents,
    );
    expect(result.monthlyFromMonthlyCents).toBe(
      7 * publicRate('standard', 'pro', 'monthly').amountCents,
    );
  });

  describe('input normalisation', () => {
    it('treats empty, negative, NaN and non-numeric input as zero', () => {
      expect(normalizeCount('')).toBe(0);
      expect(normalizeCount(-3)).toBe(0);
      expect(normalizeCount(Number.NaN)).toBe(0);
      expect(normalizeCount('abc')).toBe(0);
      expect(normalizeCount(undefined)).toBe(0);
      expect(normalizeCount(null)).toBe(0);
      expect(normalizeCount(Number.NEGATIVE_INFINITY)).toBe(0);
    });

    it('floors fractional counts — half a customer is not a customer', () => {
      expect(normalizeCount(2.7)).toBe(2);
      expect(normalizeCount('3.99')).toBe(3);
    });

    it('caps absurd input so the arithmetic stays in safe integers', () => {
      expect(normalizeCount(Number.POSITIVE_INFINITY)).toBe(MAX_CUSTOMERS_PER_PLAN);
      expect(normalizeCount(1e30)).toBe(MAX_CUSTOMERS_PER_PLAN);
      const result = calculateAffiliateCommission('gold', {
        homeMonthly: 1e30,
        proMonthly: 1e30,
        homeAnnual: 1e30,
        proAnnual: 1e30,
      });
      expect(Number.isSafeInteger(result.totalPerYearCents)).toBe(true);
      expect(Number.isSafeInteger(result.averagePerMonthCents)).toBe(true);
    });

    it('normalises a partial form state to four counts', () => {
      expect(normalizeCounts({ proAnnual: 4 })).toEqual({
        homeMonthly: 0,
        homeAnnual: 0,
        proMonthly: 0,
        proAnnual: 4,
      });
    });

    it('accepts raw form state directly', () => {
      const result = calculateAffiliateCommission('standard', {
        homeMonthly: Number.NaN,
        proMonthly: -2,
      });
      expect(result.totalPerYearCents).toBe(0);
    });
  });

  describe('Elite', () => {
    it('is a mode with no rate, not a tier the calculator can price', () => {
      expect(isCustomTermsMode('elite')).toBe(true);
      expect(isCustomTermsMode('standard')).toBe(false);
      expect(isCustomTermsMode('gold')).toBe(false);
    });

    it('never appears in a produced estimate', () => {
      for (const tier of ['standard', 'gold'] as const) {
        expect(calculateAffiliateCommission(tier, { proAnnual: 1 }).tier).not.toBe('elite');
      }
    });
  });
});
