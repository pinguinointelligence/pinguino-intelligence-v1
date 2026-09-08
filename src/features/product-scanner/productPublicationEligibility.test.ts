import { describe, expect, it } from 'vitest';
import {
  assessProductPublicationIdentity,
  publicationIdentityEligibilityFromScanResult,
  publicationIdentityEligibilityFromStoredProductFacts,
} from './productPublicationEligibility';

const exactRegistryFacts = (displayName: string, brand: string, ean: string) => ({
  identity: { displayName, brand, quantity: '500 ml' },
  barcodes: [{ value: ean }],
  externalSources: [
    {
      sourceType: 'barcode_registry',
      url: `https://world.openfoodfacts.org/product/${ean}`,
      sourceAuthorityClass: 'STRUCTURED_PRODUCT_DATABASE',
      sourceStatedEan: ean,
      fieldsUsed: ['identity.displayName', 'identity.brand', 'identity.quantity'],
    },
  ],
});

describe('PRODUCT_PUBLICATION_IDENTITY_V1', () => {
  it('rejects the SOL-052 brand/company-only identity even when it came from an exact registry URL', () => {
    expect(
      publicationIdentityEligibilityFromScanResult(
        exactRegistryFacts('Vitamin well', 'Vitamin Well AB', '7350042718481'),
      ),
    ).toMatchObject({
      eligible: false,
      reasonCodes: expect.arrayContaining(['NAME_EQUALS_BRAND_OR_MANUFACTURER']),
    });
  });

  it('accepts the exact Refresh line identity backed by the scanned GTIN', () => {
    expect(
      publicationIdentityEligibilityFromScanResult(
        exactRegistryFacts('Vitamin Well Refresh Lemon–Kiwi', 'Vitamin Well AB', '7350042718481'),
      ),
    ).toMatchObject({ eligible: true, exactSkuIdentity: true });
  });

  it('does not accept an unrelated web title, Mapper estimate, or an invented user-confirmed origin', () => {
    expect(
      assessProductPublicationIdentity({
        displayName: 'Vitamin Well Refresh',
        brand: 'Vitamin Well',
        fieldProvenance: {
          displayName: { source: 'web_search', exactGtinMatch: false, sourceUrl: 'https://x.test' },
        },
      }).reasonCodes,
    ).toContain('EXACT_EAN_PROVENANCE_REQUIRED');
    expect(
      assessProductPublicationIdentity({
        displayName: 'Vitamin Well Refresh',
        brand: 'Vitamin Well',
        fieldProvenance: {
          displayName: { source: 'mapper_estimate', exactGtinMatch: true, sourceUrl: null },
        },
      }).eligible,
    ).toBe(false);
    expect(
      publicationIdentityEligibilityFromScanResult({
        identity: { displayName: 'Vitamin Well Refresh', brand: 'Vitamin Well' },
      }).eligible,
    ).toBe(false);
  });

  it.each([
    ['Vitamin Well Sport 001', 'Vitamin Well', '7340222800457'],
    ['Vitamin Well Sport 002', 'Vitamin Well', '7340222800464'],
    ['Vitamin Well Hydrate', 'Vitamin Well', '7350042715213'],
    ['Milka Choco Brownie', 'Milka', '7622210669315'],
    ['Cacao puro desgrasado en polvo', 'La Chocolatera', '8410109121551'],
  ])('preserves accepted exact-SKU flow %s', (displayName, brand, ean) => {
    expect(
      publicationIdentityEligibilityFromScanResult(exactRegistryFacts(displayName, brand, ean)),
    ).toMatchObject({ eligible: true });
  });

  it('accepts direct front-label identity and rejects merely present unprovenanced identity', () => {
    expect(
      publicationIdentityEligibilityFromScanResult({
        identity: { displayName: 'Vitamin Well Refresh Lemon Kiwi', brand: 'Vitamin Well' },
        evidence: [
          { field: 'identity.displayName', source: 'label', confidence: 'high' },
          { field: 'identity.brand', source: 'label', confidence: 'high' },
        ],
      }).eligible,
    ).toBe(true);
    expect(
      publicationIdentityEligibilityFromScanResult({
        identity: { displayName: 'Vitamin Well Refresh Lemon Kiwi', brand: 'Vitamin Well' },
      }).eligible,
    ).toBe(false);
  });

  it('preserves legacy catalogue identities by name quality without weakening new scan provenance', () => {
    expect(
      publicationIdentityEligibilityFromStoredProductFacts({
        identity: { displayName: 'Cacao puro desgrasado en polvo', brand: 'La Chocolatera' },
      }).eligible,
    ).toBe(true);
    expect(
      publicationIdentityEligibilityFromStoredProductFacts({
        identity: { displayName: 'Vitamin well', brand: 'Vitamin Well AB' },
      }).eligible,
    ).toBe(false);
  });

  it('reuses the backend-stamped field provenance on the next exact-EAN scan', () => {
    const stored = {
      identity: { displayName: 'Vitamin Well Refresh Lemon Kiwi', brand: 'Vitamin Well' },
      publicationEligibility: {
        version: 'PRODUCT_PUBLICATION_IDENTITY_V1',
        eligible: true,
        fieldProvenance: {
          displayName: { source: 'user_confirmed', exactGtinMatch: true, sourceUrl: null },
        },
      },
    };
    expect(publicationIdentityEligibilityFromStoredProductFacts(stored).eligible).toBe(true);
    expect(
      publicationIdentityEligibilityFromStoredProductFacts({
        ...stored,
        publicationEligibility: { ...stored.publicationEligibility, version: 'UNKNOWN_VERSION' },
      }).eligible,
    ).toBe(false);
    expect(
      publicationIdentityEligibilityFromStoredProductFacts({
        ...stored,
        publicationEligibility: { ...stored.publicationEligibility, eligible: false },
      }).eligible,
    ).toBe(false);
  });
});
