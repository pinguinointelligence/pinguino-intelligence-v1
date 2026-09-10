import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifySourceAuthority } from './sourceAuthority';
import {
  confirmEanOnPageDetailed,
  createPageEanConfirmationCache,
  findGtinInHtml,
  isPubliclyRoutableHost,
  isServerEanConfirmation,
  rawHtmlNamesGtin,
  readPageForEanConfirmation,
  resolveSourceEanConfirmation,
  strongerEanConfirmation,
  type PageFetcher,
} from './pageEanConfirmation';

/*
  THE OWNER'S CONTRACT OF 2026-09-07, CASE BY CASE.

  Every case here is a measurement from the two live test articles, not an invention:

    Sport 001 `7340222800457` — its only ingredient-bearing source, latiendaencasa.es, answers a
      server fetch with `HTTP 403 Access Denied` (577 bytes). The research model DID report the
      code for it. Refusing that source withdraws the seven ingredient points that take the product
      from 89.4 to 96.4.

    Sport 002 `7340222800464` — none of its four sources report a code, two answer 403, and one,
      aecoctrade.es, carries the exact code inside a `<script>` state blob. Reading only visible
      text left it with nothing while the code sat in bytes already downloaded.

  So the rule has to be additive and it has to distinguish "read and silent" from "refused".
*/

const SPORT_001 = '7340222800457';
const SPORT_002 = '7340222800464';
const RETAILER =
  'https://www.latiendaencasa.es/supermercado/0110118623902220-vitamin-well-sport-001/';
const AECOC = 'https://www.aecoctrade.es/es/producto/mbMn6pOV9OBU8iCEZDxsQk';

const html = (body: string) => `<!doctype html><html><body>${body}</body></html>`;

/** A fetcher that answers exactly one scripted response, then fails any further hop. */
const respondWith =
  (init: { status?: number; body?: string; type?: string }): PageFetcher =>
  async () =>
    new Response(init.body ?? '', {
      status: init.status ?? 200,
      headers: { 'content-type': init.type ?? 'text/html; charset=utf-8' },
    });

const forbidden: PageFetcher = async () =>
  new Response('<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD></HTML>', {
    status: 403,
    headers: { 'content-type': 'text/html' },
  });

describe('the server decides, and it can tell refusal from absence', () => {
  it('Sport 002: an exact code inside a <script> blob is confirmed, without executing anything', async () => {
    // The shape aecoctrade.es actually serves: a hydration blob, no JSON-LD, no microdata,
    // nothing in visible text.
    const page = html(
      `<div id="root"></div><script>window.__NUXT__={data:{product:{ean:"${SPORT_002}",name:"Sport 002"}}}</script>`,
    );
    expect(rawHtmlNamesGtin(page, SPORT_002)).toBe(true);
    expect(findGtinInHtml(page, SPORT_002)).toBe('raw_html');

    const outcome = await confirmEanOnPageDetailed({
      url: AECOC,
      gtin: SPORT_002,
      fetchImpl: respondWith({ body: page }),
      cache: createPageEanConfirmationCache(),
    });
    expect(outcome.unreadable).toBe(false);
    expect(outcome.confirmation?.method).toBe('raw_html');
    expect(isServerEanConfirmation(outcome.confirmation?.method)).toBe(true);

    const verdict = resolveSourceEanConfirmation({
      serverConfirmation: outcome.confirmation,
      scannedGtin: SPORT_002,
      url: AECOC,
    });
    expect(verdict.exactEanConfirmedOnPage).toBe(true);
    expect(
      classifySourceAuthority({
        url: AECOC,
        exactEanConfirmedOnPage: verdict.exactEanConfirmedOnPage,
      }).authority,
    ).toBe('AUTHORITATIVE_RETAILER');
  });

  it('Sport 001: a 403 retailer plus a matching server-enrichment code stays trusted', async () => {
    const outcome = await confirmEanOnPageDetailed({
      url: RETAILER,
      gtin: SPORT_001,
      fetchImpl: forbidden,
      cache: createPageEanConfirmationCache(),
    });
    expect(outcome.confirmation).toBeNull();
    expect(outcome.unreadable).toBe(true);

    const verdict = resolveSourceEanConfirmation({
      serverConfirmation: null,
      modelStatedEan: SPORT_001,
      scannedGtin: SPORT_001,
      pageUnreadable: true,
      url: RETAILER,
    });
    expect(verdict.confirmation?.method).toBe('server_enrichment_unfetchable');
    expect(verdict.exactEanConfirmedOnPage).toBe(true);
    expect(
      classifySourceAuthority({
        url: RETAILER,
        exactEanConfirmedOnPage: verdict.exactEanConfirmedOnPage,
      }).authority,
    ).toBe('AUTHORITATIVE_RETAILER');
  });

  it('a page the server COULD read and which is silent does not promote on the model word alone', async () => {
    const outcome = await confirmEanOnPageDetailed({
      url: RETAILER,
      gtin: SPORT_001,
      fetchImpl: respondWith({ body: html('<p>Bebida refrescante 500 ml</p>') }),
      cache: createPageEanConfirmationCache(),
    });
    expect(outcome.unreadable).toBe(false);
    const verdict = resolveSourceEanConfirmation({
      serverConfirmation: outcome.confirmation,
      modelStatedEan: SPORT_001,
      scannedGtin: SPORT_001,
      pageUnreadable: outcome.unreadable,
      url: RETAILER,
    });
    // Read, and it does not name the code. That is an absence, and absence never promotes.
    expect(verdict.confirmation?.method).toBe('model_reported');
    expect(verdict.exactEanConfirmedOnPage).toBe(false);
  });

  it('no code anywhere stays OTHER_WEB', async () => {
    const outcome = await confirmEanOnPageDetailed({
      url: AECOC,
      gtin: SPORT_002,
      fetchImpl: respondWith({ body: html('<p>Producto sin identificador</p>') }),
      cache: createPageEanConfirmationCache(),
    });
    const verdict = resolveSourceEanConfirmation({
      serverConfirmation: outcome.confirmation,
      scannedGtin: SPORT_002,
      pageUnreadable: outcome.unreadable,
      url: AECOC,
    });
    expect(verdict.exactEanConfirmedOnPage).toBe(false);
    expect(classifySourceAuthority({ url: AECOC, exactEanConfirmedOnPage: false }).authority).toBe(
      'OTHER_WEB',
    );
  });

  it('a DIFFERENT code on the page stays OTHER_WEB — including on a 403', async () => {
    const page = html(`<script>{"ean":"${SPORT_001}"}</script>`);
    expect(findGtinInHtml(page, SPORT_002)).toBeNull();

    // And the auxiliary path is just as strict: the wrong code proves nothing when refused either.
    const verdict = resolveSourceEanConfirmation({
      serverConfirmation: null,
      modelStatedEan: SPORT_001,
      scannedGtin: SPORT_002,
      pageUnreadable: true,
      url: RETAILER,
    });
    expect(verdict.confirmation).toBeNull();
    expect(verdict.exactEanConfirmedOnPage).toBe(false);
  });

  it('the code as a FRAGMENT of a longer number never counts', () => {
    for (const body of [
      `<script>{"sku":"99${SPORT_002}"}</script>`,
      `<script>{"sku":"${SPORT_002}0001"}</script>`,
      `<p>Art. 123${SPORT_002}456</p>`,
    ]) {
      const page = html(body);
      expect(rawHtmlNamesGtin(page, SPORT_002)).toBe(false);
      expect(findGtinInHtml(page, SPORT_002)).toBeNull();
    }
    // The genuine article, in the same shape, still matches — so the guard is not just refusing all.
    expect(rawHtmlNamesGtin(html(`<script>{"sku":"${SPORT_002}"}</script>`), SPORT_002)).toBe(true);
  });

  it('a client cannot hand in a confirmation, a class, or a stated code', () => {
    /*
      The only route from a request body into the authority decision would be a field the edge
      function reads off `body` and forwards. It reads exactly two — `identity` and `fields` — and
      `sourceStatedEan` is parsed from the PROVIDER response. These greps are the guard, because
      the type system cannot express "this value did not come from the client".
    */
    const enrich = readFileSync(
      resolve(process.cwd(), 'supabase/functions/intimport-enrich/index.ts'),
      'utf8',
    );
    expect(enrich).not.toMatch(/body\.\s*sourceStatedEan/);
    expect(enrich).not.toMatch(/body\.\s*sourceAuthorityClass/);
    expect(enrich).not.toMatch(/body\.\s*exactEanConfirmedOnPage/);
    expect(enrich).not.toMatch(/body\.\s*eanConfirmation/);
    // The scanned code is read from the identity the server built, never from a loose body field.
    expect(enrich).toContain('normalizeGtin(identity.barcode)');
    // And promotion is only ever fed by the resolver's verdict.
    expect(enrich).toContain('exactEanConfirmedOnPage: confirmed.exactEanConfirmedOnPage');
  });

  it('evidence never goes backwards when a later look is weaker', () => {
    const at = '2026-09-07T18:50:57.000Z';
    const strong = { method: 'json_ld' as const, gtin: SPORT_002, url: AECOC, confirmedAt: at };
    const weaker = {
      method: 'server_enrichment_unfetchable' as const,
      gtin: SPORT_002,
      url: AECOC,
      confirmedAt: '2026-09-07T21:30:00.000Z',
    };
    // A later 403, or a lookup that stops quoting the code, must not unmake what was read.
    expect(strongerEanConfirmation(strong, weaker)).toBe(strong);
    expect(strongerEanConfirmation(strong, null)).toBe(strong);
    // Genuinely stronger evidence does replace it.
    expect(strongerEanConfirmation(weaker, strong)).toBe(strong);
    // Equal strength keeps the first reading, whose timestamp already means something.
    const sameRank = { ...strong, confirmedAt: '2026-09-08T00:00:00.000Z' };
    expect(strongerEanConfirmation(strong, sameRank)).toBe(strong);
    // A record about a DIFFERENT article is not a downgrade of this one.
    expect(strongerEanConfirmation(strong, { ...strong, gtin: SPORT_001 })).toBe(strong);
  });
});

describe('the fetch cannot be pointed at our own infrastructure', () => {
  it('refuses private, loopback, link-local and metadata addresses', () => {
    for (const host of [
      '127.0.0.1',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.254',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '100.64.0.1', // CGNAT
      '0.0.0.0',
      '255.255.255.255',
      '2130706433', // 127.0.0.1 as a bare integer
      'localhost',
      'db.internal',
      'printer.local',
      '::1',
      '[::1]',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
    ]) {
      expect(isPubliclyRoutableHost(host), host).toBe(false);
    }
  });

  it('still allows ordinary public hosts', () => {
    for (const host of ['www.aecoctrade.es', 'example.com', '93.184.216.34', '2606:2800:220:1::']) {
      expect(isPubliclyRoutableHost(host), host).toBe(true);
    }
  });

  it('refuses a redirect that lands on a private address, and reports it as unreadable', async () => {
    const hops: string[] = [];
    const redirector: PageFetcher = async (target) => {
      hops.push(target);
      return new Response('', {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/' },
      });
    };
    const read = await readPageForEanConfirmation('https://shop.example.com/p/1', {
      fetchImpl: redirector,
    });
    expect(read.html).toBeNull();
    expect(read.unreadable).toBe(true);
    // The metadata address is never requested — the hop is refused before the second fetch.
    expect(hops).toEqual(['https://shop.example.com/p/1']);
  });

  it('refuses a non-http scheme outright, without a request', async () => {
    let called = false;
    const read = await readPageForEanConfirmation('file:///etc/passwd', {
      fetchImpl: async () => {
        called = true;
        return new Response('');
      },
    });
    expect(called).toBe(false);
    expect(read.unreadable).toBe(true);
  });
});
