/**
 * SERVER-SIDE EXACT-EAN CONFIRMATION.
 *
 * Held against the shapes real product pages actually have — a schema.org Product, a retailer page
 * that prints the code in a specification table, a page that names a SIBLING article, a host that
 * does not answer, and markup that is simply broken. The rule under all of them is one sentence:
 * a source may only be promoted on a code the SERVER read for itself.
 *
 * The owner's sessions of 2026-09-07 are the reason. Across eight external sources in two scans the
 * research model reported the printed barcode ONCE; session 6a3673a7 (EAN 7340222800457) stopped at
 * 79.4 instead of 86.4 purely for want of that confirmation.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PAGE_FETCH_LIMITS,
  EAN_CONFIRMATION_METHODS,
  SERVER_EAN_CONFIRMATION_METHODS,
  confirmEanOnPage,
  createPageEanConfirmationCache,
  fetchPageForEanConfirmation,
  findGtinInHtml,
  jsonLdNamesGtinInHtml,
  gtinDigitsMatch,
  isEanConfirmationMethod,
  isServerEanConfirmation,
  normalizeGtin,
  resolveSourceEanConfirmation,
  storedServerEanConfirmationHolds,
  urlNamesGtin,
  type PageFetcher,
} from './pageEanConfirmation';
import { classifySourceAuthority } from './sourceAuthority';

/** The owner's two real articles. Adjacent codes, different products — the contamination risk. */
const SPORT_001 = '7340222800457';
const SPORT_002 = '7340222800464';

const RETAILER = 'https://www.elcorteingles.es/supermercado/0110190100000001/';
const NOW = () => new Date('2026-09-07T18:50:00.000Z');

/** A fetch that answers from a fixed map and refuses everything else, like a real host would. */
const stubFetch = (
  pages: Record<string, { body?: string; status?: number; headers?: Record<string, string> }>,
): PageFetcher =>
  vi.fn(async (url: string) => {
    const page = pages[url];
    if (!page) throw new Error('ENOTFOUND');
    const status = page.status ?? 200;
    return new Response(status === 204 || status >= 300 ? null : (page.body ?? ''), {
      status,
      headers: { 'content-type': 'text/html; charset=utf-8', ...(page.headers ?? {}) },
    });
  });

/* ── real page shapes ─────────────────────────────────────────────────────── */

const jsonLdPage = (gtin: string) => `<!doctype html>
<html lang="es"><head>
<title>Vitamin Well Sport</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Vitamin Well Sport",
 "brand":{"@type":"Brand","name":"Vitamin Well"},
 "gtin13":"${gtin}",
 "offers":{"@type":"Offer","price":"2.49","priceCurrency":"EUR"}}
</script>
</head><body><h1>Vitamin Well Sport</h1></body></html>`;

/** The code lives only in the specification table a human reads. */
const bodyTextPage = (gtin: string) => `<!doctype html>
<html><body>
<h1>Vitamin Well Sport</h1>
<table class="ficha"><tbody>
<tr><th>Marca</th><td>Vitamin Well</td></tr>
<tr><th>EAN</th><td>${gtin}</td></tr>
<tr><th>Contenido</th><td>500 ml</td></tr>
</tbody></table>
</body></html>`;

describe('what the server reads on the page', () => {
  it('confirms a schema.org Product that declares gtin13', async () => {
    const fetchImpl = stubFetch({ [RETAILER]: { body: jsonLdPage(SPORT_001) } });
    const confirmation = await confirmEanOnPage({
      url: RETAILER,
      gtin: SPORT_001,
      fetchImpl,
      now: NOW,
    });
    expect(confirmation).toEqual({
      method: 'json_ld',
      gtin: SPORT_001,
      url: RETAILER,
      confirmedAt: '2026-09-07T18:50:00.000Z',
    });
  });

  it('confirms a page where the code appears only in the body text', async () => {
    const fetchImpl = stubFetch({ [RETAILER]: { body: bodyTextPage(SPORT_001) } });
    const confirmation = await confirmEanOnPage({ url: RETAILER, gtin: SPORT_001, fetchImpl });
    expect(confirmation?.method).toBe('page_text');
    expect(confirmation?.gtin).toBe(SPORT_001);
  });

  it('reads the grouped form printed under a barcode', () => {
    // `7 340222 800457` and `7-340222-800457` are the same code, printed the way the label prints it.
    expect(findGtinInHtml('<p>EAN: 7 340222 800457</p>', SPORT_001)).toBe('page_text');
    expect(findGtinInHtml('<p>EAN 7-340222-800457</p>', SPORT_001)).toBe('page_text');
    expect(findGtinInHtml(`<p>EAN: ${SPORT_001}</p>`, SPORT_001)).toBe('page_text');
  });

  it('never assembles a code out of two separate cells', () => {
    // Splitting at every tag is what prevents it; without that these two cells would fuse.
    expect(findGtinInHtml('<td>734</td><td>0222800457</td>', SPORT_001)).toBeNull();
  });

  it('reads microdata and OpenGraph declarations', () => {
    expect(findGtinInHtml(`<span itemprop="gtin13">${SPORT_001}</span>`, SPORT_001)).toBe(
      'microdata',
    );
    expect(findGtinInHtml(`<meta itemprop="gtin13" content="${SPORT_001}">`, SPORT_001)).toBe(
      'microdata',
    );
    expect(findGtinInHtml(`<meta property="product:ean" content="${SPORT_001}">`, SPORT_001)).toBe(
      'microdata',
    );
    expect(findGtinInHtml(`<div data-gtin13="${SPORT_001}">Sport</div>`, SPORT_001)).toBe(
      'microdata',
    );
  });

  it('prefers structured data over the text, and says which it used', () => {
    const both = `${jsonLdPage(SPORT_001)}<p>EAN ${SPORT_001}</p>`;
    expect(findGtinInHtml(both, SPORT_001)).toBe('json_ld');
    expect(
      findGtinInHtml(
        `<meta property="product:ean" content="${SPORT_001}"><p>${SPORT_001}</p>`,
        SPORT_001,
      ),
    ).toBe('microdata');
  });

  it('treats a GTIN-14 padded form as the same article', () => {
    expect(findGtinInHtml(`<p>GTIN: 0${SPORT_001}</p>`, SPORT_001)).toBe('page_text');
    expect(gtinDigitsMatch(`0${SPORT_001}`, SPORT_001)).toBe(true);
  });

  it('refuses a longer internal article number that merely contains the code', () => {
    expect(findGtinInHtml(`<p>Ref. 45${SPORT_001}77</p>`, SPORT_001)).toBeNull();
    expect(gtinDigitsMatch(`45${SPORT_001}77`, SPORT_001)).toBe(false);
  });
});

/* ── the sibling article ──────────────────────────────────────────────────── */

describe('a page about a different product', () => {
  it('does not confirm, however well-formed it is', async () => {
    const fetchImpl = stubFetch({ [RETAILER]: { body: jsonLdPage(SPORT_002) } });
    // Sport 002's page is a perfectly good Product page. It is simply not this article.
    expect(await confirmEanOnPage({ url: RETAILER, gtin: SPORT_001, fetchImpl })).toBeNull();
    expect(findGtinInHtml(bodyTextPage(SPORT_002), SPORT_001)).toBeNull();
  });

  it('does not confirm from a related-product block', () => {
    const html = `<script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","name":"Sport 002","gtin13":"${SPORT_002}",
       "isRelatedTo":{"@type":"Product","name":"Sport 001","gtin13":"${SPORT_001}"}}
    </script>`;
    // The page names Sport 001 as a neighbour, not as itself. That is how two adjacent EANs
    // contaminate each other.
    expect(findGtinInHtml(html, SPORT_001)).toBeNull();
    expect(findGtinInHtml(html, SPORT_002)).toBe('json_ld');
  });

  it('does not confirm a gtin declared outside any product AS json_ld', () => {
    const html = `<script type="application/ld+json">
      {"@context":"https://schema.org","@type":"WebPage","gtin13":"${SPORT_001}"}
    </script>`;
    // Still not a product declaration, so `json_ld` refuses it.
    expect(jsonLdNamesGtinInHtml(html, SPORT_001)).toBe(false);
    /*
      It IS, however, the exact code sitting in the page's own bytes with nothing contradicting it,
      and since the owner's decision of 2026-09-07 the raw reading is additive rather than a last
      resort. So the page confirms — one rung lower, and the method says which rung.
    */
    expect(findGtinInHtml(html, SPORT_001)).toBe('raw_html');
  });
});

/* ── broken pages ─────────────────────────────────────────────────────────── */

describe('a page the server cannot use', () => {
  it('yields no confirmation when the host does not answer', async () => {
    const fetchImpl: PageFetcher = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(
      await confirmEanOnPage({
        url: 'https://unreachable.example/p/1',
        gtin: SPORT_001,
        fetchImpl,
      }),
    ).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('yields no confirmation on 404, 403 or an empty body', async () => {
    for (const status of [403, 404, 500]) {
      const fetchImpl = stubFetch({ [RETAILER]: { status, body: bodyTextPage(SPORT_001) } });
      expect(await confirmEanOnPage({ url: RETAILER, gtin: SPORT_001, fetchImpl })).toBeNull();
    }
  });

  it('does not throw on malformed JSON-LD, and still reads the text underneath', () => {
    const broken = `<!doctype html><html><head>
      <script type="application/ld+json">{"@type":"Product","gtin13":</script>
      <script type="application/ld+json">   </script>
      </head><body><p>EAN ${SPORT_001}</p></body></html>`;
    expect(() => findGtinInHtml(broken, SPORT_001)).not.toThrow();
    expect(findGtinInHtml(broken, SPORT_001)).toBe('page_text');
    // Broken markup that mentions nothing still simply says nothing.
    expect(
      findGtinInHtml('<script type="application/ld+json">{oops</script>', SPORT_001),
    ).toBeNull();
  });

  it('reads a code inside a script, and still ignores one left in a comment', () => {
    /*
      REVERSED DELIBERATELY on 2026-09-07, and this is the measurement that reversed it.

      Probing all eight sources behind the owner's two test articles found the exact code on
      `aecoctrade.es` for BOTH — and in neither case in JSON-LD, microdata or visible text. It sits
      in a `<script>` hydration blob. With script bodies skipped, `7340222800464` had no
      confirmable source anywhere, while its code was in bytes the server had already downloaded.

      Nothing is executed to read it: this is a text scan of the delivered response, under the same
      digit-boundary and GTIN-length rules as every other method.

      A comment stays excluded. It is not delivered content, and excluding it costs nothing.
    */
    expect(findGtinInHtml(`<script>var x="${SPORT_001}";</script>`, SPORT_001)).toBe('raw_html');
    expect(findGtinInHtml(`<!-- ${SPORT_001} -->`, SPORT_001)).toBeNull();
  });
});

/* ── the bounded fetch ────────────────────────────────────────────────────── */

describe('the fetch is bounded and safe', () => {
  it('never fetches anything that is not http(s)', async () => {
    const fetchImpl: PageFetcher = vi.fn(async () => new Response('x'));
    for (const url of [
      'file:///etc/passwd',
      'data:text/html,<p>7340222800457</p>',
      'javascript:alert(1)',
      'ftp://example.com/p',
      'not a url',
    ]) {
      expect(await fetchPageForEanConfirmation(url, { fetchImpl })).toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('follows a couple of redirects and then stops', async () => {
    const hop = (to: string) => ({ status: 302, headers: { location: to } });
    const ok = { body: bodyTextPage(SPORT_001) };
    const twoHops = stubFetch({
      'https://a.example/1': hop('https://b.example/2'),
      'https://b.example/2': hop('https://c.example/3'),
      'https://c.example/3': ok,
    });
    expect(
      await confirmEanOnPage({ url: 'https://a.example/1', gtin: SPORT_001, fetchImpl: twoHops }),
    ).not.toBeNull();

    const threeHops = stubFetch({
      'https://a.example/1': hop('https://b.example/2'),
      'https://b.example/2': hop('https://c.example/3'),
      'https://c.example/3': hop('https://d.example/4'),
      'https://d.example/4': ok,
    });
    expect(
      await confirmEanOnPage({ url: 'https://a.example/1', gtin: SPORT_001, fetchImpl: threeHops }),
    ).toBeNull();
  });

  it('refuses a redirect that leaves http(s)', async () => {
    const fetchImpl = stubFetch({
      'https://a.example/1': { status: 302, headers: { location: 'file:///etc/passwd' } },
    });
    expect(await fetchPageForEanConfirmation('https://a.example/1', { fetchImpl })).toBeNull();
  });

  it('reads no more than the byte cap, so a huge page cannot confirm from beyond it', async () => {
    const filler = '<p>a</p>'.repeat(4000);
    const fetchImpl = stubFetch({ [RETAILER]: { body: `${filler}<p>EAN ${SPORT_001}</p>` } });
    const confirmation = await confirmEanOnPage({
      url: RETAILER,
      gtin: SPORT_001,
      fetchImpl,
      limits: { maxBytes: 1024 },
    });
    expect(confirmation).toBeNull();
    // The same page confirms once the cap is large enough to reach the code.
    expect(
      await confirmEanOnPage({
        url: RETAILER,
        gtin: SPORT_001,
        fetchImpl,
        limits: { maxBytes: 64 * 1024 },
      }),
    ).not.toBeNull();
  });

  it('refuses a body that is not text', async () => {
    const fetchImpl = stubFetch({
      [RETAILER]: {
        body: bodyTextPage(SPORT_001),
        headers: { 'content-type': 'application/pdf' },
      },
    });
    expect(await confirmEanOnPage({ url: RETAILER, gtin: SPORT_001, fetchImpl })).toBeNull();
  });

  it('keeps its limits small enough to cost seconds, never a request', () => {
    expect(DEFAULT_PAGE_FETCH_LIMITS.timeoutMs).toBeLessThanOrEqual(8_000);
    expect(DEFAULT_PAGE_FETCH_LIMITS.maxBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(DEFAULT_PAGE_FETCH_LIMITS.maxRedirects).toBeLessThanOrEqual(3);
  });

  it('sends no cookies and asks for no redirect it has not inspected', async () => {
    const fetchImpl: PageFetcher = vi.fn(async () => new Response(bodyTextPage(SPORT_001)));
    await fetchPageForEanConfirmation(RETAILER, { fetchImpl });
    const init = vi.mocked(fetchImpl).mock.calls[0]?.[1];
    expect(init?.redirect).toBe('manual');
    expect(init?.credentials).toBe('omit');
    expect(init?.method).toBe('GET');
  });
});

/* ── the page's own address ───────────────────────────────────────────────── */

describe('a URL that names the article', () => {
  it('confirms from the path without fetching anything at all', async () => {
    const fetchImpl: PageFetcher = vi.fn(async () => new Response(''));
    const confirmation = await confirmEanOnPage({
      url: `https://world.openfoodfacts.org/product/${SPORT_001}/vitamin-well-sport`,
      gtin: SPORT_001,
      fetchImpl,
    });
    expect(confirmation?.method).toBe('url');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not accept a search for the code as a page about it', () => {
    expect(urlNamesGtin(`https://shop.example/search?q=${SPORT_001}`, SPORT_001)).toBe(false);
    expect(urlNamesGtin(`https://shop.example/p/${SPORT_001}`, SPORT_001)).toBe(true);
    expect(urlNamesGtin(`https://shop.example/p/${SPORT_002}`, SPORT_001)).toBe(false);
  });
});

/* ── one fetch per page ───────────────────────────────────────────────────── */

describe('the per-invocation cache', () => {
  it('fetches the same page once however many facts cite it', async () => {
    const fetchImpl = stubFetch({ [RETAILER]: { body: bodyTextPage(SPORT_001) } });
    const cache = createPageEanConfirmationCache();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        confirmEanOnPage({ url: RETAILER, gtin: SPORT_001, fetchImpl, cache }),
      ),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r?.method === 'page_text')).toBe(true);
    // A different code is a different question, and is asked separately.
    await confirmEanOnPage({ url: RETAILER, gtin: SPORT_002, fetchImpl, cache });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

/* ── precedence: the server outranks the model ────────────────────────────── */

describe('precedence between the server and the model', () => {
  const serverConfirmation = {
    method: 'page_text' as const,
    gtin: SPORT_001,
    url: RETAILER,
    confirmedAt: '2026-09-07T18:50:00.000Z',
  };

  it('a server confirmation is what promotes, and it is recorded as the server’s', () => {
    const verdict = resolveSourceEanConfirmation({
      serverConfirmation,
      modelStatedEan: '',
      scannedGtin: SPORT_001,
      url: RETAILER,
    });
    expect(verdict.exactEanConfirmedOnPage).toBe(true);
    expect(verdict.confirmation?.method).toBe('page_text');
    expect(verdict.statedEan).toBe(SPORT_001);
    expect(isServerEanConfirmation(verdict.confirmation?.method)).toBe(true);
  });

  it('outranks the model even when the model reported the code too', () => {
    const verdict = resolveSourceEanConfirmation({
      serverConfirmation,
      modelStatedEan: SPORT_001,
      scannedGtin: SPORT_001,
      url: RETAILER,
    });
    // Corroboration does not change the record: what promoted the source is what the server read.
    expect(verdict.confirmation?.method).toBe('page_text');
    expect(verdict.exactEanConfirmedOnPage).toBe(true);
  });

  it('the model alone corroborates but never promotes', () => {
    const verdict = resolveSourceEanConfirmation({
      serverConfirmation: null,
      modelStatedEan: SPORT_001,
      scannedGtin: SPORT_001,
      url: RETAILER,
      now: NOW,
    });
    expect(verdict.confirmation?.method).toBe('model_reported');
    expect(verdict.confirmation?.confirmedAt).toBe('2026-09-07T18:50:00.000Z');
    expect(verdict.exactEanConfirmedOnPage).toBe(false);
    expect(isServerEanConfirmation(verdict.confirmation?.method)).toBe(false);
    // The claim itself is still carried, exactly as it always was.
    expect(verdict.statedEan).toBe(SPORT_001);
  });

  it('a page nobody could fetch and nobody could confirm gets nothing', () => {
    const verdict = resolveSourceEanConfirmation({
      serverConfirmation: null,
      modelStatedEan: '',
      scannedGtin: SPORT_001,
      url: RETAILER,
    });
    expect(verdict.confirmation).toBeNull();
    expect(verdict.exactEanConfirmedOnPage).toBe(false);
    expect(verdict.statedEan).toBe('');
  });

  it('a model claim about a DIFFERENT code is carried, never confirmed', () => {
    const verdict = resolveSourceEanConfirmation({
      serverConfirmation: null,
      modelStatedEan: SPORT_002,
      scannedGtin: SPORT_001,
      url: RETAILER,
    });
    expect(verdict.confirmation).toBeNull();
    expect(verdict.exactEanConfirmedOnPage).toBe(false);
    expect(verdict.statedEan).toBe(SPORT_002);
  });

  it('a url confirmation does not claim the page PRINTED the code', () => {
    const verdict = resolveSourceEanConfirmation({
      serverConfirmation: { method: 'url', gtin: SPORT_001, url: RETAILER, confirmedAt: 'now' },
      modelStatedEan: '',
      scannedGtin: SPORT_001,
      url: RETAILER,
    });
    // The server proved the page is ADDRESSED by the code, which is not the same as reading it
    // printed there — so `sourceStatedEan` stays empty rather than being manufactured.
    expect(verdict.exactEanConfirmedOnPage).toBe(true);
    expect(verdict.statedEan).toBe('');
  });
});

/* ── what reaches classifySourceAuthority ─────────────────────────────────── */

describe('the model’s word never produces AUTHORITATIVE_RETAILER', () => {
  const classify = (exactEanConfirmedOnPage: boolean) =>
    classifySourceAuthority({
      url: RETAILER,
      brand: 'Vitamin Well',
      manufacturer: null,
      ownerProvided: false,
      exactEanConfirmedOnPage,
    });

  it('leaves an unconfirmed retailer page exactly where it was', () => {
    const modelOnly = resolveSourceEanConfirmation({
      serverConfirmation: null,
      modelStatedEan: SPORT_001,
      scannedGtin: SPORT_001,
      url: RETAILER,
    });
    expect(classify(modelOnly.exactEanConfirmedOnPage).authority).toBe('OTHER_WEB');
  });

  it('promotes the same page once the server has read the code on it', async () => {
    const fetchImpl = stubFetch({ [RETAILER]: { body: bodyTextPage(SPORT_001) } });
    const verdict = resolveSourceEanConfirmation({
      serverConfirmation: await confirmEanOnPage({ url: RETAILER, gtin: SPORT_001, fetchImpl }),
      modelStatedEan: '',
      scannedGtin: SPORT_001,
      url: RETAILER,
    });
    // El Corte Inglés is not in RETAILER_DOMAINS and never will be — identity, not reputation,
    // is what makes this page usable, and the server established it.
    expect(classify(verdict.exactEanConfirmedOnPage).authority).toBe('AUTHORITATIVE_RETAILER');
  });
});

/* ── the vocabulary itself ────────────────────────────────────────────────── */

describe('the confirmation vocabulary', () => {
  it('names every method, and only the server\u2019s own may promote', () => {
    expect([...EAN_CONFIRMATION_METHODS].sort()).toEqual(
      [
        'json_ld',
        'microdata',
        'model_reported',
        'page_text',
        'raw_html',
        'server_enrichment_unfetchable',
        'url',
      ].sort(),
    );
    /*
      `raw_html` and `server_enrichment_unfetchable` joined the server list on 2026-09-07. Both are
      established BY THE SERVER — one by reading the delivered bytes, the other by matching the
      code the server's own enrichment call reported for a page it was forbidden to fetch. Neither
      can be supplied by a client, which is the property this list actually guards.

      `model_reported` remains the only method outside it: the model's unverified word.
    */
    expect([...SERVER_EAN_CONFIRMATION_METHODS].sort()).toEqual(
      [
        'json_ld',
        'microdata',
        'page_text',
        'raw_html',
        'server_enrichment_unfetchable',
        'url',
      ].sort(),
    );
    expect(isServerEanConfirmation('model_reported')).toBe(false);
    expect(isServerEanConfirmation('raw_html')).toBe(true);
    expect(isServerEanConfirmation('server_enrichment_unfetchable')).toBe(true);
  });
  it('refuses a method nothing in this repository can issue', () => {
    for (const forged of ['trusted', 'MODEL_REPORTED', '', null, undefined, 7]) {
      expect(isEanConfirmationMethod(forged)).toBe(false);
      expect(isServerEanConfirmation(forged)).toBe(false);
    }
  });

  it('normalizes a code the way every reader downstream does', () => {
    expect(normalizeGtin(' 7340222800457 ')).toBe(SPORT_001);
    expect(normalizeGtin('EAN 734-0222-800457')).toBe(SPORT_001);
    expect(normalizeGtin(null)).toBe('');
    expect(gtinDigitsMatch('1234567', '1234567')).toBe(false); // shorter than a GTIN-8
  });
});

/* ── replaying a stored confirmation ──────────────────────────────────────── */

describe('a stored confirmation, re-derived without the page', () => {
  it('holds when the server read that code and it is this product', () => {
    expect(
      storedServerEanConfirmationHolds({
        method: 'page_text',
        statedEan: SPORT_001,
        url: RETAILER,
        gtin: SPORT_001,
      }),
    ).toBe(true);
  });

  it('holds for a url confirmation because the address still names the code', () => {
    expect(
      storedServerEanConfirmationHolds({
        method: 'url',
        statedEan: '',
        url: `https://world.openfoodfacts.org/product/${SPORT_001}`,
        gtin: SPORT_001,
      }),
    ).toBe(true);
  });

  it('does not hold on the model’s word', () => {
    expect(
      storedServerEanConfirmationHolds({
        method: 'model_reported',
        statedEan: SPORT_001,
        url: RETAILER,
        gtin: SPORT_001,
      }),
    ).toBe(false);
  });

  it('does not hold for a different product, or with no product at all', () => {
    expect(
      storedServerEanConfirmationHolds({
        method: 'page_text',
        statedEan: SPORT_002,
        url: RETAILER,
        gtin: SPORT_001,
      }),
    ).toBe(false);
    expect(
      storedServerEanConfirmationHolds({ method: 'page_text', statedEan: SPORT_001, gtin: null }),
    ).toBe(false);
  });

  it('is not circular: a stored method alone proves nothing', () => {
    // The row claims the server read the code, but nothing on it names this article any more.
    expect(
      storedServerEanConfirmationHolds({
        method: 'json_ld',
        statedEan: '',
        url: RETAILER,
        gtin: SPORT_001,
      }),
    ).toBe(false);
  });
});
