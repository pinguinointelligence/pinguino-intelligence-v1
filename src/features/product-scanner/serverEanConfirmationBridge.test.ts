/**
 * THE CARRY: from the server's own reading of a page to the row a later reader sees.
 *
 * `intimport-enrich` establishes the exact-EAN confirmation server-side and records HOW. If that
 * method is dropped on the way onto the externalSources row, the row says a code was confirmed
 * without saying by whom — and a model's claim becomes indistinguishable from a page the server
 * actually opened. This file is the gate on that carry, plus the source contract that the edge
 * function feeds `classifySourceAuthority` from the server confirmation and from nothing else.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scanResultFromLookupFacts } from '../../../supabase/functions/_shared/productScanner';
import { isServerEanConfirmation } from '../product-intelligence/pageEanConfirmation';

const EDGE = new URL('../../../supabase/functions/intimport-enrich/index.ts', import.meta.url);
const edgeSource = readFileSync(EDGE, 'utf8');

const SPORT_001 = '7340222800457';
const PAGE = 'https://www.elcorteingles.es/supermercado/0110190100000001/';

const fact = (over: Record<string, unknown> = {}) => ({
  field: 'ingredients',
  value: 'Woda, kwas cytrynowy, witaminy',
  sourceUrl: PAGE,
  sourceTitle: 'Vitamin Well Sport',
  sourceAuthorityClass: 'AUTHORITATIVE_RETAILER',
  sourceStatedEan: SPORT_001,
  ...over,
});

const sourceRow = (over: Record<string, unknown> = {}) =>
  (
    scanResultFromLookupFacts([fact(over)])?.externalSources as
      | Record<string, unknown>[]
      | undefined
  )?.[0];

describe('the externalSources row carries how the code was confirmed', () => {
  it('records a server reading as the server’s, with when', () => {
    const row = sourceRow({
      sourceEanConfirmationMethod: 'page_text',
      sourceEanConfirmedAt: '2026-09-07T18:50:00.000Z',
    });
    expect(row?.sourceEanConfirmationMethod).toBe('page_text');
    expect(row?.sourceEanConfirmedAt).toBe('2026-09-07T18:50:00.000Z');
    expect(row?.sourceStatedEan).toBe(SPORT_001);
    expect(row?.sourceAuthorityClass).toBe('AUTHORITATIVE_RETAILER');
    expect(isServerEanConfirmation(row?.sourceEanConfirmationMethod)).toBe(true);
  });

  it.each(['json_ld', 'microdata', 'page_text', 'url'])(
    'carries %s through unchanged',
    (method) => {
      expect(sourceRow({ sourceEanConfirmationMethod: method })?.sourceEanConfirmationMethod).toBe(
        method,
      );
    },
  );

  it('keeps the model’s word distinguishable from the server’s', () => {
    const row = sourceRow({ sourceEanConfirmationMethod: 'model_reported' });
    expect(row?.sourceEanConfirmationMethod).toBe('model_reported');
    // Same row shape, different worth: a reader can tell the two apart without guessing.
    expect(isServerEanConfirmation(row?.sourceEanConfirmationMethod)).toBe(false);
  });

  it('drops a method nothing on the server can issue', () => {
    for (const forged of ['server_verified', 'TRUSTED', '', 42, null, {}]) {
      expect(sourceRow({ sourceEanConfirmationMethod: forged })?.sourceEanConfirmationMethod).toBe(
        null,
      );
    }
  });

  it('leaves a fact with no confirmation exactly as it was', () => {
    const row = sourceRow();
    expect(row?.sourceEanConfirmationMethod).toBe(null);
    expect(row?.sourceEanConfirmedAt).toBe(null);
    // The pre-existing carry is untouched.
    expect(row?.sourceStatedEan).toBe(SPORT_001);
    expect(row?.fieldsUsed).toContain('ingredientsText');
  });
});

describe('the edge function confirms the code itself', () => {
  it('imports the confirmation with the .ts extension Deno needs to load it', () => {
    // A value import from src/ without an explicit extension deploys as a hard failure, and
    // nothing in CI can see it: `tsc -b` does not type-check the Deno tree.
    expect(edgeSource).toContain("from '../_shared/pageEanConfirmation.ts'");
    expect(edgeSource).toContain('confirmEanOnPage');
    expect(edgeSource).toContain('createPageEanConfirmationCache');
  });

  it('feeds the authority classifier from the SERVER confirmation, never the model claim', () => {
    expect(edgeSource).toContain('exactEanConfirmedOnPage: confirmed.exactEanConfirmedOnPage');
    // The superseded comparison trusted whatever the model reported...
    expect(edgeSource).not.toContain('statedEan.length >= 8 && scannedEan.length >= 8');
    // ...against a field the identity object never had, so it was false for every source ever
    // classified. The scanned code now comes from the identity that actually exists.
    expect(edgeSource).not.toContain('identity.gtin');
    expect(edgeSource).toContain('const scannedEan = normalizeGtin(identity.barcode)');
  });

  it('resolves each page once per invocation', () => {
    /*
      The dedupe moved into `confirmPagesForFacts`, which is now shared by the fresh answer and the
      cache read — that sharing is the point, so the pin follows it rather than the old inline site.
    */
    expect(edgeSource).toContain('const cache = createPageEanConfirmationCache()');
    expect(edgeSource).toMatch(/new Set\(\s*rows/);
    expect(edgeSource).toContain('MAX_CONFIRMED_PAGES');
    expect(edgeSource).toContain('await confirmPagesForFacts(factRows,');
    expect(edgeSource).toContain('await confirmPagesForFacts(cachedRows,');
  });

  it('records the method and the moment on every fact', () => {
    // `classifyFactSource` now returns the confirmation alongside the class, so one value
    // carries both and the two can no longer drift apart.
    expect(edgeSource).toContain('sourceEanConfirmationMethod: authority.confirmation?.method');
    expect(edgeSource).toContain('sourceEanConfirmedAt: authority.confirmation?.confirmedAt');
    expect(edgeSource).toContain('sourceStatedEan: authority.statedEan');
  });

  it('still classifies authority server-side from the real URL', () => {
    // The rule this change must not weaken: the model never says what kind of source it used.
    expect(edgeSource).toContain('classifySourceAuthority(');
    expect(edgeSource).toContain('ownerProvided: false');
  });
});

describe('the reader that re-derives a stored authority can still reproduce it', () => {
  const submit = readFileSync(
    new URL('../../../supabase/functions/catalog-submit/index.ts', import.meta.url),
    'utf8',
  );

  it('replays the server confirmation instead of voiding the submission', () => {
    /*
      catalog-submit refuses an enrichment ledger row whose stored authority it cannot reproduce
      from the URL — `fact.sourceAuthorityClass !== authority.authority` returns null for the WHOLE
      submission. A source promoted by a confirmed code would fail exactly there, silently dropping
      every web fact the import paid for, so the same confirmation is replayed on that side.
    */
    expect(submit).toContain("from '../_shared/pageEanConfirmation.ts'");
    expect(submit).toContain('exactEanConfirmedOnPage: storedServerEanConfirmationHolds({');
    expect(submit).toContain('fact.sourceAuthorityClass !== authority.authority');
  });
});
