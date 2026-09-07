import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifySourceAuthority } from './sourceAuthority';

/*
  A CACHE THAT STORES VERDICTS CANNOT BE FIXED BY FIXING THE CODE.

  `intimport-enrich` caches the provider's answer in `intimport_enrichment_usage`, keyed on
  `sha256(identity + fields + researchStep)`. The row holds the facts with `sourceAuthorityClass`
  already stamped on them, and the key says nothing about the code that did the stamping. So an
  identity that had been looked up once replayed its old verdict forever — for free, with no
  provider call, and therefore no signal that anything was stale.

  That is exactly what happened. The `identity.gtin` fix was deployed and verified in the deployed
  function body, and the very next served scan of `7340222800457` still reported every source as
  OTHER_WEB. Cache row 2026-09-07T18:50:57Z for that identity holds 14 facts whose
  `sourceStatedEan` is the scanned code and whose class is OTHER_WEB on all 14 — the old bug
  frozen in place, replayed verbatim.

  The previous test in exactEanSourceAuthority.test.ts could not see this: it proved the CLASSIFIER
  is right and that the FRESH path calls it with the right field. Neither statement is about the
  cache, and the cache is what the customer actually hits on every scan after the first.

  The fix re-derives the verdict when the row is read. The inputs are all present in it, and
  `classifySourceAuthority` is pure, so it costs nothing and needs no invalidation — where bumping
  a cache revision would have re-bought three web searches for every product ever scanned.
*/

const enrich = readFileSync(
  resolve(process.cwd(), 'supabase/functions/intimport-enrich/index.ts'),
  'utf8',
);

/** The shape the cache actually holds, taken from the row named above. */
const cachedFact = (overrides: Record<string, unknown> = {}) => ({
  field: 'ingredients',
  value: 'agua, azúcar, corrector de acidez (ácido cítrico), aromas',
  sourceUrl: 'https://www.latiendaencasa.es/supermercado/0110118623902220-vitamin-well-bebida',
  sourceStatedEan: '7340222800457',
  sourceAuthorityClass: 'OTHER_WEB',
  evidenceSource: 'web_search',
  ...overrides,
});

describe('a cached source verdict is re-derived, never replayed', () => {
  it('promotes the exact page the cache had recorded as OTHER_WEB', () => {
    const fact = cachedFact();
    const verdict = classifySourceAuthority({
      url: fact.sourceUrl,
      exactEanConfirmedOnPage: fact.sourceStatedEan === '7340222800457',
    });
    expect(fact.sourceAuthorityClass).toBe('OTHER_WEB');
    expect(verdict.authority).toBe('AUTHORITATIVE_RETAILER');
  });

  it('does not promote a cached fact whose stated code is a different product', () => {
    const fact = cachedFact({ sourceStatedEan: '7340222800464' });
    expect(
      classifySourceAuthority({
        url: fact.sourceUrl,
        exactEanConfirmedOnPage: fact.sourceStatedEan === '7340222800457',
      }).authority,
    ).toBe('OTHER_WEB');
  });

  it('leaves a cached fact alone when the page stated no code at all', () => {
    const fact = cachedFact({ sourceStatedEan: null });
    expect(
      classifySourceAuthority({
        url: fact.sourceUrl,
        exactEanConfirmedOnPage:
          typeof fact.sourceStatedEan === 'string' && fact.sourceStatedEan === '7340222800457',
      }).authority,
    ).toBe('OTHER_WEB');
  });

  it('routes both the fresh path and the cache read through ONE classifier', () => {
    // Two call sites, one function. Inlining the rule in the fresh path is precisely how the
    // cache was left behind, so the count is the guard.
    const calls = enrich.match(/classifyFactSource\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3); // definition + fresh path + cache path
    expect(enrich).toMatch(/function classifyFactSource\(/);
    // The cache branch must actually rewrite what it returns, not pass the row through.
    expect(enrich).toContain('cachedResult.facts = cachedRows.map(');
    /*
      And it must gather the SAME page evidence a fresh answer does. Two of the confirmation
      methods cannot be derived from a stored row at all — `raw_html` needs the page's bytes, and
      `server_enrichment_unfetchable` needs to know the page is still refusing to be read — so a
      cache read that skipped this would leave every previously scanned product frozen at its first
      score. Reading pages costs HTTP; it never costs a provider call.
    */
    // Formatting-insensitive: prettier may wrap the call across lines.
    expect(enrich).toMatch(/await confirmPagesForFacts\(\s*cachedRows\s*,/);
    /*
      And the classifier must still read the property that actually holds the scanned code. Pinned
      by NAME rather than by one spelling: the read is now `normalizeGtin(identity.barcode)`, and
      what matters is that it is `barcode` and not some other property of an untyped literal.
    */
    expect(enrich).toMatch(/normalizeGtin\(identity\.barcode\)/);
    expect(enrich).not.toMatch(/identity\.gtin\b/);
  });

  it('re-derives rather than invalidating, so a cache hit still costs nothing', () => {
    // `calls: 0` on the cache branch is the paid-call contract; re-deriving must not disturb it.
    const branch = enrich.slice(
      enrich.indexOf('if (cached?.result_json)'),
      enrich.indexOf('const askedFor ='),
    );
    expect(branch).toContain('calls: 0');
    expect(branch).toContain('cacheHit: true');
    // Nothing on this path may reach the provider.
    expect(branch).not.toContain('fetch(`${openAiBase}');
  });
});
