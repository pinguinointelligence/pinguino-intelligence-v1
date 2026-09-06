import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  classifySourceAuthority,
  domainMatchesEntity,
  sourceDomain,
  SOURCE_AUTHORITY_RANK,
} from './sourceAuthority';

/**
 * §9's core complaint: a `Primary Source URL` plus a `Checked At` date was being
 * treated as manufacturer authority. A URL and a date prove the owner looked
 * something up — never that the page belonged to the maker.
 */
describe('source authority is classified from the actual source', () => {
  it('recognizes an official manufacturer domain', () => {
    const result = classifySourceAuthority({
      url: 'https://www.comprital.com/prodotti/albicocca',
      brand: 'Comprital',
      manufacturer: 'Comprital S.p.A.',
      ownerProvided: true,
    });
    expect(result.authority).toBe('OFFICIAL_MANUFACTURER');
    expect(result.evidenceSource).toBe('manufacturer');
    expect(result.domain).toBe('comprital.com');
  });

  it('treats an official technical PDF as the strongest technical source', () => {
    const result = classifySourceAuthority({
      url: 'https://comprital.com/docs/albicocca-tds.pdf',
      manufacturer: 'Comprital S.p.A.',
    });
    expect(result.authority).toBe('OFFICIAL_TECHNICAL_PDF');
    expect(SOURCE_AUTHORITY_RANK.OFFICIAL_TECHNICAL_PDF).toBeGreaterThan(
      SOURCE_AUTHORITY_RANK.OFFICIAL_MANUFACTURER,
    );
  });

  it('recognizes an official brand domain when brand and manufacturer differ', () => {
    const result = classifySourceAuthority({
      url: 'https://kamis.pl/produkty/kurkuma',
      brand: 'Kamis',
      manufacturer: 'McCormick Polska S.A.',
    });
    expect(result.authority).toBe('OFFICIAL_BRAND');
  });

  it('classifies a retailer URL as a retailer, not a manufacturer', () => {
    const result = classifySourceAuthority({
      url: 'https://zakupy.biedronka.pl/kamis-kurkuma-20-g-0000006944.html',
      brand: 'Kamis',
      manufacturer: 'McCormick Polska S.A.',
      ownerProvided: true,
    });
    expect(result.authority).toBe('AUTHORITATIVE_RETAILER');
    expect(result.evidenceSource).toBe('retailer');
  });

  it('does NOT promote an arbitrary owner URL to manufacturer authority', () => {
    // The exact regression: a URL exists and a Checked At date exists.
    const result = classifySourceAuthority({
      url: 'https://some-catalogue.example/p/12345',
      brand: 'Testowa Marka',
      manufacturer: 'Nieznany Producent',
      ownerProvided: true,
    });
    expect(result.authority).toBe('OWNER_PROVIDED_SOURCE');
    expect(result.authority).not.toBe('OFFICIAL_MANUFACTURER');
    expect(SOURCE_AUTHORITY_RANK[result.authority]).toBeLessThan(
      SOURCE_AUTHORITY_RANK.OFFICIAL_MANUFACTURER,
    );
  });

  it('recognizes a structured product/GTIN database', () => {
    const result = classifySourceAuthority({
      url: 'https://world.openfoodfacts.org/product/59024',
    });
    expect(result.authority).toBe('STRUCTURED_PRODUCT_DATABASE');
    expect(result.evidenceSource).toBe('barcode_registry');
  });

  it('puts an unknown domain in a low tier rather than guessing', () => {
    const found = classifySourceAuthority({ url: 'https://random-recipes.example/post/1' });
    expect(found.authority).toBe('OTHER_WEB');
    expect(found.evidenceSource).toBe('web_search');
  });

  it.each([
    'https://gelato-blog.blogspot.com/2020/x',
    'https://www.reddit.com/r/icecream/comments/x',
    'https://forum.example.org/thread/9',
  ])('never treats %s as authoritative', (url) => {
    expect(SOURCE_AUTHORITY_RANK[classifySourceAuthority({ url }).authority]).toBeLessThanOrEqual(
      SOURCE_AUTHORITY_RANK.OTHER_WEB,
    );
  });

  it('returns UNKNOWN for an unusable address', () => {
    for (const url of [null, '', 'not-a-url', 'javascript:alert(1)', 'ftp://x/y']) {
      expect(classifySourceAuthority({ url }).authority).toBe('UNKNOWN');
    }
  });

  it('keeps a PDF on an unverified CDN below official tiers', () => {
    const result = classifySourceAuthority({
      url: 'https://cdn.unknown-host.example/files/spec.pdf',
      manufacturer: 'Comprital S.p.A.',
    });
    expect(result.authority).toBe('OTHER_WEB');
  });

  it('preserves the owner source with its true provenance class', () => {
    const result = classifySourceAuthority({
      url: 'https://zakupy.biedronka.pl/x.html',
      ownerProvided: true,
    });
    expect(result.domain).toBe('zakupy.biedronka.pl');
    expect(result.reasons.join(' ')).toContain('sprzedawca');
  });
});

describe('domain matching', () => {
  it('matches a company name to its registrable domain label', () => {
    expect(domainMatchesEntity('comprital.com', 'Comprital S.p.A.')).toBe(true);
    expect(domainMatchesEntity('comprital-polska.pl', 'Comprital')).toBe(true);
    expect(domainMatchesEntity('mccormick.pl', 'McCormick Polska S.A.')).toBe(true);
  });

  it('refuses short or coincidental matches', () => {
    expect(domainMatchesEntity('abc.com', 'ABC')).toBe(false);
    expect(domainMatchesEntity('biedronka.pl', 'Comprital')).toBe(false);
    expect(domainMatchesEntity(null, 'Comprital')).toBe(false);
  });

  it('extracts a normalized domain', () => {
    expect(sourceDomain('https://WWW.Comprital.com/x')).toBe('comprital.com');
    expect(sourceDomain('bogus')).toBeNull();
  });
});

describe('one implementation, shared by server and client', () => {
  it('has exactly one copy of the rules, which the Edge runtime re-exports', () => {
    const canonical = readFileSync(new URL('./sourceAuthority.ts', import.meta.url), 'utf8');
    const edgeShim = readFileSync(
      new URL('../../../supabase/functions/_shared/sourceAuthority.ts', import.meta.url),
      'utf8',
    );
    // The rules live here …
    expect(canonical).toMatch(/function classifySourceAuthority/);
    expect(canonical).toContain('RETAILER_DOMAINS');
    // … and the Edge module only re-exports them, never restates them.
    expect(edgeShim).toContain(
      "export * from '../../../src/features/product-intelligence/sourceAuthority.ts'",
    );
    expect(edgeShim).not.toMatch(/function classifySourceAuthority|RETAILER_DOMAINS/);
  });

  it('stays pure — the classifier reaches no backend of its own', () => {
    const canonical = readFileSync(new URL('./sourceAuthority.ts', import.meta.url), 'utf8');
    expect(canonical).not.toMatch(/fetch\(|import .* from/);
  });
});

describe('private-label ownership', () => {
  const BIEDRONKA = 'https://zakupy.biedronka.pl/gobio-gobio-mleko-1-l-0000008345.html';

  it('treats a retailer as first-party for a brand it actually owns', () => {
    const assessment = classifySourceAuthority({
      url: BIEDRONKA,
      brand: 'goBIO',
      manufacturer: 'Jeronimo Martins Polska S.A.',
      ownerProvided: true,
      privateLabelOwnerDomain: 'biedronka.pl',
    });
    expect(assessment.authority).toBe('OFFICIAL_PRIVATE_LABEL');
    expect(assessment.evidenceSource).toBe('manufacturer');
  });

  it('leaves the same domain a retailer for brands it does not own', () => {
    // The decisive case: an upgrade keyed on the domain alone would promote
    // every product the shop stocks, which is exactly the error being avoided.
    const assessment = classifySourceAuthority({
      url: 'https://zakupy.biedronka.pl/milka-milka-czekolada-mleczna-100-g-0000001234.html',
      brand: 'Milka',
      manufacturer: 'Mondelez Polska S.A.',
      ownerProvided: true,
    });
    expect(assessment.authority).toBe('AUTHORITATIVE_RETAILER');
  });

  it('does not upgrade when ownership names a different domain', () => {
    const assessment = classifySourceAuthority({
      url: BIEDRONKA,
      brand: 'goBIO',
      ownerProvided: true,
      privateLabelOwnerDomain: 'lidl.pl',
    });
    expect(assessment.authority).toBe('AUTHORITATIVE_RETAILER');
  });

  it('accepts the owner domain given as a bare host or a URL', () => {
    for (const owner of ['biedronka.pl', 'https://www.biedronka.pl/pl/gobio']) {
      expect(
        classifySourceAuthority({ url: BIEDRONKA, brand: 'goBIO', privateLabelOwnerDomain: owner })
          .authority,
      ).toBe('OFFICIAL_PRIVATE_LABEL');
    }
  });
});

describe('brand domains of multi-word brands', () => {
  it('recognizes vitaminwell.com as the official domain of "Vitamin Well"', () => {
    expect(domainMatchesEntity('vitaminwell.com', 'Vitamin Well')).toBe(true);
    expect(domainMatchesEntity('milka.com', 'Milka')).toBe(true);
    expect(domainMatchesEntity('elcorteingles.es', 'Vitamin Well')).toBe(false);
  });
});
