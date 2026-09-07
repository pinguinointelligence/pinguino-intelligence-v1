import { describe, expect, it } from 'vitest';
import { customerProductProfileProposal } from '../../../supabase/functions/_shared/customerProductProfile';
import {
  SPORT_001_EAN,
  SPORT_002_EAN,
  sport001ScanResult,
  sport002ScanResult,
  withAuthority,
} from './__fixtures__/ownerScanSessions';

/*
  The bridge, held against the owner's real 2026-09-07 sessions.

  classifySourceAuthority runs on the server inside intimport-enrich and writes
  `sourceAuthorityClass` onto each source row. Everything below asserts what the scan path does
  with it — and, just as importantly, what it refuses to do with a class it cannot tie to the
  scanned code.
*/
const OFF = 'world.openfoodfacts.org';
const ECI = 'elcorteingles.es';
const LTC = 'latiendaencasa.es';
const VW = 'vitaminwell.com';

const recognition = {
  ingredientFamily: 'unknown',
  isTechnicalProduct: false,
} as never;

/** The proposal needs the scanned GTIN; it is taken from the fixture, never invented. */
const propose = (scanResult: { barcodes: Array<{ value: string }> }) =>
  customerProductProfileProposal({
    scanResult,
    recognition,
    recognitionEvidence: { gtin: scanResult.barcodes[0].value } as never,
  });

describe('source provenance bridge', () => {
  it('keeps a registry record that names the scanned EAN as a product declaration', () => {
    const proposal = propose(
      withAuthority(sport002ScanResult(), { [OFF]: 'STRUCTURED_PRODUCT_DATABASE' }),
    );
    // Open Food Facts resolved by the exact GTIN: its panel is the product's own declaration.
    expect(proposal?.evidenceProvenance.fat?.sourceAuthorityClass).toBe(
      'STRUCTURED_PRODUCT_DATABASE',
    );
    expect(proposal?.declaredBasis.fat_percent).toBe('product_declared');
  });

  it('treats a published 0 as a value, not as missing data', () => {
    const proposal = propose(
      withAuthority(sport002ScanResult(), { [OFF]: 'STRUCTURED_PRODUCT_DATABASE' }),
    );
    // Sport 002 is sugar free. Its macros really are zero and must be declared as zero.
    expect(proposal?.declared.fat_percent).toBe(0);
    expect(proposal?.declared.carbohydrate_percent).toBe(0);
    expect(proposal?.declared.total_sugars_percent).toBe(0);
    expect(proposal?.declared.protein_percent).toBe(0);
    // ...while a genuinely non-zero one is untouched.
    expect(proposal?.declared.salt_percent).toBeCloseTo(0.1175, 4);
  });

  it('refuses a trusted class on a page that does not name the scanned code', () => {
    // El Corte Inglés is a real retailer, but this URL carries an internal article number, not
    // the EAN. A reputable domain is not proof that the page is the right article — which is the
    // exact way Sport 001 and Sport 002 could contaminate each other.
    const proposal = propose(
      withAuthority(sport002ScanResult(), { [ECI]: 'AUTHORITATIVE_RETAILER' }),
    );
    expect(proposal?.evidenceProvenance.ingredients).toBeUndefined();
  });

  it('gives no credit at all to a class the server never assigned', () => {
    const proposal = propose(sport002ScanResult());
    expect(Object.keys(proposal?.evidenceProvenance ?? {})).toHaveLength(0);
  });

  it('cannot be told by the client that a source is trusted', () => {
    // A browser-shaped payload naming its own authority on a page that is not the scanned code.
    const forged = withAuthority(sport002ScanResult(), { [ECI]: 'OFFICIAL_MANUFACTURER' });
    expect(propose(forged)?.evidenceProvenance.ingredients).toBeUndefined();
    // And an authority string that is simply not one the server can issue.
    const nonsense = withAuthority(sport002ScanResult(), { [OFF]: 'TOTALLY_TRUSTED' });
    expect(propose(nonsense)?.evidenceProvenance.fat).toBeUndefined();
  });

  it('never lets the two products share a field', () => {
    const one = propose(withAuthority(sport001ScanResult(), { [OFF]: 'STRUCTURED_PRODUCT_DATABASE' }));
    const two = propose(withAuthority(sport002ScanResult(), { [OFF]: 'STRUCTURED_PRODUCT_DATABASE' }));
    // Sport 001 has sugar, Sport 002 does not. If a fixture or a cache ever crossed them, this is
    // where it shows.
    expect(one?.declared.total_sugars_percent).toBeCloseTo(5.5, 4);
    expect(two?.declared.total_sugars_percent).toBe(0);
    expect(one?.declaredNutritionBasis).toBe('per_100ml');
    expect(two?.declaredNutritionBasis).toBe('per_100g');
  });

  it('marks nothing as user-entered when the customer entered nothing', () => {
    for (const result of [sport001ScanResult(), sport002ScanResult()]) {
      const proposal = propose(withAuthority(result, { [OFF]: 'STRUCTURED_PRODUCT_DATABASE' }));
      expect(Object.values(proposal?.declaredBasis ?? {})).not.toContain('user_confirmed');
      expect(Object.values(proposal?.evidence.fields ?? {})).not.toContain('user_confirmed');
    }
  });

  it('leaves the manufacturer page a declaration source without needing the code in its URL', () => {
    // vitaminwell.com is the maker speaking about its own product; that was always admitted and
    // this change must not narrow it.
    const proposal = propose(withAuthority(sport002ScanResult(), { [VW]: 'OFFICIAL_MANUFACTURER' }));
    expect(proposal?.evidence.fields.technicalParameters).toBe('manufacturer');
  });

  it('carries the registry class for Sport 001 too, on its own EAN', () => {
    const proposal = propose(
      withAuthority(sport001ScanResult(), { [OFF]: 'STRUCTURED_PRODUCT_DATABASE', [LTC]: 'AUTHORITATIVE_RETAILER' }),
    );
    expect(proposal?.evidenceProvenance.sugars?.sourceUrl).toContain(SPORT_001_EAN);
    expect(proposal?.evidenceProvenance.sugars?.sourceUrl).not.toContain(SPORT_002_EAN);
    // latiendaencasa carries an internal article number, not the EAN — same refusal as ECI.
    expect(proposal?.evidenceProvenance.ingredients).toBeUndefined();
  });
});
