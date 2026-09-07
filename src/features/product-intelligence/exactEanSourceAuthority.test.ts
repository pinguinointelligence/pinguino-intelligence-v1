import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifySourceAuthority } from './sourceAuthority';

/*
  A page that names the scanned article is an authoritative retailer for it, whatever its domain.

  This test exists because the previous one did NOT cover this boundary. It handed
  `sourceAuthorityClass` to the profile directly in a fixture, so it proved what the scan path does
  with a class — and never that the class is produced. Meanwhile the producer was reading
  `identity.gtin` from an object whose field is `barcode`, so `exactEanConfirmedOnPage` was false on
  every call and every source came back OTHER_WEB.

  The owner's session 6a3673a7-7d0e-45a7-b070-668197266f93 (EAN 7340222800457) shows the cost:
  latiendaencasa.es was persisted with `sourceStatedEan: 7340222800457` — the right code, read from
  the page — and still scored OTHER_WEB, so the ingredient text earned nothing and the product
  stopped at 79.4 instead of 86.4.
*/
const ECI =
  'https://www.elcorteingles.es/supermercado/B001018623902212-vitamin-well-sport-002-500-ml/';

describe('a page that names the scanned code speaks for that product', () => {
  it('is an authoritative retailer once the server has matched the code', () => {
    const verdict = classifySourceAuthority({ url: ECI, exactEanConfirmedOnPage: true });
    expect(verdict.authority).toBe('AUTHORITATIVE_RETAILER');
  });

  it('is nothing of the sort without that match', () => {
    // Same page, same domain — reputation alone never promotes it.
    expect(classifySourceAuthority({ url: ECI }).authority).toBe('OTHER_WEB');
    expect(classifySourceAuthority({ url: ECI, exactEanConfirmedOnPage: false }).authority).toBe(
      'OTHER_WEB',
    );
  });

  it('still refuses a forum or a social host that happens to quote the code', () => {
    for (const url of [
      'https://www.reddit.com/r/gelato/comments/abc/vitamin-well/',
      'https://forum.example.com/thread/7340222800464',
      'https://some.blogspot.com/2026/09/vitamin-well.html',
    ]) {
      expect(classifySourceAuthority({ url, exactEanConfirmedOnPage: true }).authority).not.toBe(
        'AUTHORITATIVE_RETAILER',
      );
    }
  });

  it('does not demote a manufacturer page that never states a barcode', () => {
    const verdict = classifySourceAuthority({
      url: 'https://www.vitaminwell.com/product/electrolytes-sugar-free/',
      brand: 'Vitamin Well',
    });
    expect(verdict.authority).toBe('OFFICIAL_BRAND');
  });

  it('reads the scanned code from the field that actually holds it', () => {
    /*
      The bug was a name, not a rule, and no type or test could see it: `identity` in
      intimport-enrich is an untyped object literal, so `identity.gtin` was simply `undefined`.
      Pinning the property name is the only thing that would have caught it.
    */
    const enrich = readFileSync(
      resolve(process.cwd(), 'supabase/functions/intimport-enrich/index.ts'),
      'utf8',
    );
    /*
      The NAME is what this pins, not the expression around it. It was written as
      `String(identity.barcode ?? '')`; the server-side confirmation now normalizes the same
      property through `normalizeGtin`. Matching the property rather than one spelling of the
      normalizer keeps the contract exactly as strong while surviving that kind of change.
    */
    expect(enrich).toMatch(/const scannedEan = \w+\(identity\.barcode\b/);
    expect(enrich).not.toContain('identity.gtin');
  });
});
