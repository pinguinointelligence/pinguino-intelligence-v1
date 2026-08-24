import { describe, expect, it } from 'vitest';
import { classifyCarbonation, type CarbonationEvidence } from './carbonation';

const exact = (
  assertion: string,
  source: CarbonationEvidence['source'] = 'EXACT_LABEL',
): CarbonationEvidence => ({
  source,
  assertion,
  assertionPath: 'ingredientsText',
  sourceUrl: null,
  sourceDomain: null,
  sourceAuthorityClass: null,
  evidenceReceipt: null,
  retrievedAt: null,
});

describe('canonical carbonation classification', () => {
  it.each(['cola', 'soda', 'drink', 'Cola Zero'])('does not guess from a name: %s', (name) => {
    expect(classifyCarbonation([exact(name)])).toMatchObject({
      status: 'UNKNOWN',
      decision: 'NO_EXACT_ASSERTION',
    });
  });

  it('accepts an explicit exact-label carbon dioxide declaration', () => {
    expect(classifyCarbonation([exact('Składniki: woda, dwutlenek węgla, aromaty')])).toMatchObject(
      { status: 'CARBONATED', decision: 'EXPLICIT_CARBONATED_ASSERTION' },
    );
  });

  it('accepts a reliable exact non-carbonated declaration', () => {
    expect(
      classifyCarbonation([
        exact('Produkt niegazowany', 'EXACT_AUTHORITATIVE_RETAILER'),
      ]),
    ).toMatchObject({
      status: 'NON_CARBONATED',
      decision: 'EXPLICIT_NON_CARBONATED_ASSERTION',
    });
  });

  it('fails closed when exact sources conflict', () => {
    expect(
      classifyCarbonation([
        exact('carbonated beverage'),
        exact('non-carbonated beverage', 'EXACT_MANUFACTURER'),
      ]),
    ).toMatchObject({ status: 'UNKNOWN', decision: 'CONFLICTING_EXACT_ASSERTIONS' });
  });
});
