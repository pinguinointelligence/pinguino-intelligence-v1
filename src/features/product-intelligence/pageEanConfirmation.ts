/**
 * DETERMINISTIC EXACT-GTIN CONFIRMATION — the server reads the page itself.
 *
 * `intimport-enrich` asks the research model to report, per fact, the barcode PRINTED on the
 * source page (`sourceStatedEan`). Measured on the owner's phone scans of 2026-09-07 18:50 UTC,
 * across EIGHT external sources in two sessions, the model returned that code exactly ONCE.
 * Everything else came back empty and was therefore classified OTHER_WEB, so its ingredient text
 * earned nothing — session 6a3673a7 stopped at 79.4 instead of 86.4 purely for want of the
 * confirmation.
 *
 * Whether a language model happens to copy a number off a page is not a property of the evidence.
 * This module makes the confirmation a property of the evidence: the server fetches the page and
 * looks for the scanned code itself, and records HOW it found it. The model's claim survives only
 * as a weaker, corroborating signal — it can never substitute for the server having looked.
 *
 * SAFETY. Every fetched page is UNTRUSTED DATA. It is scanned for a barcode; nothing in it is ever
 * executed, and no link, script or instruction found inside it is ever followed. The fetch is
 * bounded on all four axes that matter — scheme (http/https only), time, bytes, and redirects —
 * and every failure is quiet: an unreachable page simply yields no confirmation, never an error and
 * never a promotion.
 */

/** How the confirmation was established. `model_reported` is the model's word, not the server's. */
export type EanConfirmationMethod =
  | 'json_ld'
  | 'microdata'
  | 'page_text'
  | 'raw_html'
  | 'url'
  | 'server_enrichment_unfetchable'
  | 'model_reported';

/**
 * The methods the SERVER established for itself, strongest-evidence-first in the order they are
 * attempted. `model_reported` is deliberately absent: this list is what may promote a source.
 *
 * `raw_html` is last of the page readings and was added after a measurement, not a hunch. Probing
 * the eight sources behind the owner's two test EANs found the code present on `aecoctrade.es`
 * for BOTH products — and in neither case in JSON-LD, microdata or visible text. It sits in a
 * `<script>` state blob, which the four earlier methods deliberately skip. Skipping it left
 * `7340222800464` with no confirmable source at all while its code was sitting in bytes the
 * server had already downloaded.
 *
 * `server_enrichment_unfetchable` is not a page reading. See `resolveSourceEanConfirmation`.
 */
export const SERVER_EAN_CONFIRMATION_METHODS: readonly EanConfirmationMethod[] = Object.freeze([
  'url',
  'json_ld',
  'microdata',
  'page_text',
  'raw_html',
  'server_enrichment_unfetchable',
]);

export const EAN_CONFIRMATION_METHODS: readonly EanConfirmationMethod[] = Object.freeze([
  ...SERVER_EAN_CONFIRMATION_METHODS,
  'model_reported',
]);

export function isEanConfirmationMethod(value: unknown): value is EanConfirmationMethod {
  return (
    typeof value === 'string' && (EAN_CONFIRMATION_METHODS as readonly string[]).includes(value)
  );
}

/**
 * True only for a confirmation the server read for itself. Every reader that decides whether a
 * source may be promoted must ask this rather than testing for a string, so the model's word can
 * never be mistaken for the server's.
 */
export function isServerEanConfirmation(method: unknown): boolean {
  return (
    typeof method === 'string' &&
    (SERVER_EAN_CONFIRMATION_METHODS as readonly string[]).includes(method)
  );
}

export interface PageEanConfirmation {
  /** How the code was found. */
  method: EanConfirmationMethod;
  /** The scanned code, digits only, as confirmed. */
  gtin: string;
  /** The page the confirmation is about. */
  url: string | null;
  /** When the confirmation was established. */
  confirmedAt: string;
}

/* ── GTIN identity ────────────────────────────────────────────────────────── */

const MIN_GTIN_LENGTH = 8;
const MAX_GTIN_LENGTH = 14;

/** Digits only. Never validates a check digit — that is the scanner's job, not this module's. */
export function normalizeGtin(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).replace(/\D/g, '');
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

const withoutLeadingZeros = (digits: string): string => digits.replace(/^0+(?=\d)/, '');

/**
 * Two digit strings name the same article. GTIN-8/12/13/14 are one identifier padded to different
 * widths, so `07340222800457` and `7340222800457` are the same code — while anything shorter than
 * 8 or longer than 14 digits is not a GTIN at all and can never match. That length ceiling is also
 * what stops a long internal article number from swallowing a real code.
 */
export function gtinDigitsMatch(candidate: string, gtin: string): boolean {
  if (candidate.length < MIN_GTIN_LENGTH || candidate.length > MAX_GTIN_LENGTH) return false;
  if (gtin.length < MIN_GTIN_LENGTH || gtin.length > MAX_GTIN_LENGTH) return false;
  return withoutLeadingZeros(candidate) === withoutLeadingZeros(gtin);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/* ── digits in human text ─────────────────────────────────────────────────── */

/**
 * Separators a page puts INSIDE a printed code: `7 340222 800457` (the grouping under a barcode),
 * `7-340222-800457`, `7.340222.800457`. Collapsed only between two digits, so a code is never
 * assembled out of two unrelated numbers that merely sit next to a hyphen.
 */
const SEPARATOR_INSIDE_A_NUMBER = /(?<=\d)[\s\u00a0\u202f._/\u2010-\u2015-]+(?=\d)/g;

/**
 * Every maximal digit run in one piece of text, read twice: as written, and with in-number
 * separators collapsed. Both readings are needed and neither is sufficient — `EAN 7 340222 800457`
 * is only a code once collapsed, while `100 g 7340222800457` is only a code as written (collapsing
 * would fuse it into a 16-digit number, which the length ceiling then refuses).
 */
function digitRuns(segment: string): string[] {
  const asWritten = segment.match(/\d+/g) ?? [];
  const collapsed = segment.replace(SEPARATOR_INSIDE_A_NUMBER, '').match(/\d+/g) ?? [];
  return [...asWritten, ...collapsed];
}

const textNamesGtin = (segment: string, gtin: string): boolean =>
  digitRuns(segment).some((run) => gtinDigitsMatch(run, gtin));

/** A scalar, or an array of scalars, from structured data. */
function scalarDigitsMatch(value: unknown, gtin: string): boolean {
  if (Array.isArray(value)) return value.some((entry) => scalarDigitsMatch(entry, gtin));
  if (typeof value === 'number') return gtinDigitsMatch(normalizeGtin(value), gtin);
  if (typeof value !== 'string') return false;
  // `7340222800457`, `EAN 7340222800457`, `ean:7340222800457`, `SKU-7340222800457`.
  return textNamesGtin(value, gtin);
}

/* ── 1. the page's own address ────────────────────────────────────────────── */

/**
 * The GTIN in the URL PATH — how a registry addresses a record
 * (`world.openfoodfacts.org/product/7340222800457`). The path is the address of the resource; a
 * QUERY is a request, so `?q=7340222800457` is a search for the code, not a page about it, and is
 * deliberately not accepted here.
 */
export function urlNamesGtin(url: string, gtin: string): boolean {
  const normalized = normalizeGtin(gtin);
  if (normalized.length < MIN_GTIN_LENGTH) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(parsed.protocol)) return false;
  return decodeURIComponentSafe(parsed.pathname)
    .split('/')
    .some((segment) => textNamesGtin(segment, normalized));
}

const decodeURIComponentSafe = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/* ── 2. JSON-LD / schema.org ──────────────────────────────────────────────── */

const JSON_LD_BLOCK =
  /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;

/** The GTIN vocabulary schema.org puts on a Product (and on the Offer nested inside it). */
const PRODUCT_GTIN_KEYS: ReadonlySet<string> = new Set([
  'gtin',
  'gtin8',
  'gtin12',
  'gtin13',
  'gtin14',
  'sku',
  'mpn',
]);

/**
 * Relations that point at a DIFFERENT article. A page may legitimately describe accessories and
 * near-neighbours, and crediting their codes to this page is exactly how two sibling products with
 * adjacent EANs contaminate each other.
 */
const OTHER_PRODUCT_RELATIONS: ReadonlySet<string> = new Set([
  'isrelatedto',
  'issimilarto',
  'isaccessoryorsparepartfor',
  'isconsumablefor',
]);

const MAX_JSON_DEPTH = 10;

const typeIsProduct = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(typeIsProduct);
  if (typeof value !== 'string') return false;
  const local = (value.split(/[/#]/).pop() ?? '').toLowerCase();
  // `Product`, `ProductModel`, `ProductGroup`, `IndividualProduct`.
  return local.startsWith('product') || local.endsWith('product');
};

function jsonLdNamesGtin(
  value: unknown,
  gtin: string,
  insideProduct: boolean,
  depth: number,
): boolean {
  if (depth > MAX_JSON_DEPTH) return false;
  if (Array.isArray(value)) {
    return value.some((entry) => jsonLdNamesGtin(entry, gtin, insideProduct, depth + 1));
  }
  if (!isRecord(value)) return false;
  const product = insideProduct || typeIsProduct(value['@type']);
  for (const [key, entry] of Object.entries(value)) {
    const name = key.toLowerCase();
    if (OTHER_PRODUCT_RELATIONS.has(name)) continue;
    if (product && PRODUCT_GTIN_KEYS.has(name) && scalarDigitsMatch(entry, gtin)) return true;
    if (jsonLdNamesGtin(entry, gtin, product, depth + 1)) return true;
  }
  return false;
}

/** `<!--`, `//<![CDATA[` and friends wrapped around a JSON-LD payload. */
const unwrapJsonLd = (raw: string): string =>
  raw
    .replace(/^\s*<!--/, '')
    .replace(/-->\s*$/, '')
    .replace(/^\s*(?:\/\/|\/\*)?\s*<!\[CDATA\[/, '')
    .replace(/\]\]>\s*(?:\*\/|\/\/)?\s*$/, '')
    .trim();

/** Malformed JSON-LD is skipped, never thrown and never partially trusted. */
export function jsonLdNamesGtinInHtml(html: string, gtin: string): boolean {
  for (const match of html.matchAll(JSON_LD_BLOCK)) {
    const raw = unwrapJsonLd(match[1] ?? '');
    if (raw === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (jsonLdNamesGtin(parsed, gtin, false, 0)) return true;
  }
  return false;
}

/* ── 3. microdata, OpenGraph and data attributes ──────────────────────────── */

/**
 * Key names a page uses for a barcode in structured markup: `itemprop="gtin13"`,
 * `<meta property="product:ean">`, `<meta name="og:upc">`, `data-gtin13`, `data-ean`.
 */
const GTIN_KEY_NAMES: ReadonlySet<string> = new Set([
  ...PRODUCT_GTIN_KEYS,
  'ean',
  'ean8',
  'ean13',
  'upc',
  'upca',
  'barcode',
]);

/** `product:ean` → `ean`, `data-gtin13` → `gtin13`, `og:upc` → `upc`. */
const looksLikeGtinKey = (key: string): boolean => {
  const local =
    key
      .toLowerCase()
      .split(/[:._-]/)
      .pop() ?? '';
  return GTIN_KEY_NAMES.has(local);
};

const TAG = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:\s[^<>]*)?)\/?>/g;
const ATTRIBUTE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/g;

function attributesOf(raw: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of raw.matchAll(ATTRIBUTE)) {
    const name = (match[1] ?? '').toLowerCase();
    if (name !== '') attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

/** The text immediately inside an element, for `<span itemprop="gtin13">7340222800457</span>`. */
const MICRODATA_TEXT_WINDOW = 128;

export function microdataNamesGtin(html: string, gtin: string): boolean {
  for (const match of html.matchAll(TAG)) {
    const tag = (match[1] ?? '').toLowerCase();
    const attributes = attributesOf(match[2] ?? '');

    // Any attribute whose NAME is the barcode vocabulary: data-gtin13="…", ean="…".
    for (const [name, value] of attributes) {
      if (name === 'itemprop' || name === 'property' || name === 'name' || name === 'content') {
        continue;
      }
      if (looksLikeGtinKey(name) && textNamesGtin(value, gtin)) return true;
    }

    const itemprop = attributes.get('itemprop');
    const metaKey = tag === 'meta' ? (attributes.get('property') ?? attributes.get('name')) : null;
    const key = itemprop ?? metaKey;
    if (key === undefined || key === null || !looksLikeGtinKey(key)) continue;

    const content = attributes.get('content');
    if (content !== undefined && textNamesGtin(content, gtin)) return true;
    if (content === undefined) {
      const start = (match.index ?? 0) + match[0].length;
      const inner = html.slice(start, start + MICRODATA_TEXT_WINDOW).split('<')[0] ?? '';
      if (textNamesGtin(inner, gtin)) return true;
    }
  }
  return false;
}

/* ── 4. the page text itself ──────────────────────────────────────────────── */

const THIN_ENTITIES = /&(?:nbsp|#160|#xa0|#xA0);/g;
const INVISIBLE_ENTITIES = /&(?:shy|#173|#xad|#xAD);/g;

/**
 * The visible text, split at every tag. Splitting matters: `<td>734</td><td>0222800457</td>` must
 * never be read as one code, and it cannot be, because the two cells are separate segments.
 * Script and style bodies are removed — they are code, not what the page says.
 */
export function pageTextNamesGtin(html: string, gtin: string): boolean {
  const visible = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(THIN_ENTITIES, ' ')
    .replace(INVISIBLE_ENTITIES, '');
  return visible.split(/<[^>]*>/).some((segment) => textNamesGtin(segment, gtin));
}

/**
 * THE LAST PAGE READING: the bytes as delivered, `<script>` bodies included.
 *
 * No JavaScript is executed and nothing is evaluated — this is a text scan of what was already
 * downloaded, held to the same digit-boundary and GTIN-validity rules as every other method, so a
 * code embedded in a longer number still cannot match.
 *
 * It is last because it is the weakest reading: a hydration blob may carry codes for products the
 * page merely links to, where `json_ld` can tell a product from its `isRelatedTo` neighbours. That
 * is an acceptable floor here — the exact scanned GTIN appearing in the page's own bytes means the
 * page names that product, and this page was chosen by research as a source FOR that product.
 *
 * Known limit, stated rather than hidden: a `7`-escaped code inside a JSON string is not
 * found. Unescaping arbitrary blobs would mean parsing them, which is the thing this avoids.
 */
export function rawHtmlNamesGtin(html: string, gtin: string): boolean {
  const bytes = html
    // A comment is not delivered content; excluding it costs nothing and removes a whole class of
    // stale codes left behind in markup.
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(THIN_ENTITIES, ' ')
    .replace(INVISIBLE_ENTITIES, '');
  return textNamesGtin(bytes, gtin);
}

/**
 * Collect every GTIN this page declares as ITS OWN product identity — the same walk as
 * `jsonLdNamesGtin`, so `isRelatedTo` and its siblings are skipped in exactly the same way.
 */
function jsonLdProductGtins(value: unknown, insideProduct: boolean, depth: number): string[] {
  if (depth > MAX_JSON_DEPTH) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => jsonLdProductGtins(entry, insideProduct, depth + 1));
  }
  if (!isRecord(value)) return [];
  const product = insideProduct || typeIsProduct(value['@type']);
  const found: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    const name = key.toLowerCase();
    if (OTHER_PRODUCT_RELATIONS.has(name)) continue;
    if (product && PRODUCT_GTIN_KEYS.has(name)) {
      for (const candidate of Array.isArray(entry) ? entry : [entry]) {
        const digits = normalizeGtin(candidate);
        if (digits.length >= MIN_GTIN_LENGTH && digits.length <= MAX_GTIN_LENGTH) {
          found.push(digits);
        }
      }
    }
    found.push(...jsonLdProductGtins(entry, product, depth + 1));
  }
  return found;
}

/**
 * THE ONE GUARD `raw_html` CANNOT DO WITHOUT.
 *
 * Sport 001 and Sport 002 are shelf neighbours, and retailers list them on each other's pages. A
 * scan of the raw bytes cannot tell "this page IS the article" from "this page MENTIONS it", so on
 * its own it would happily confirm `7340222800457` against a page whose structured data says, in
 * as many words, that it is about `7340222800464`.
 *
 * When the page states its own product identity and that identity is a different article, the raw
 * reading is refused. When it declares nothing — the ordinary case for the hydration blobs this
 * method exists to read — there is nothing to contradict and the reading stands.
 */
export function declaresADifferentProduct(html: string, gtin: string): boolean {
  const wanted = normalizeGtin(gtin);
  if (wanted.length < MIN_GTIN_LENGTH) return false;
  const declared: string[] = [];
  for (const match of html.matchAll(JSON_LD_BLOCK)) {
    const raw = unwrapJsonLd(match[1] ?? '');
    if (raw === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    declared.push(...jsonLdProductGtins(parsed, false, 0));
  }
  if (declared.length === 0) return false;
  return !declared.some((candidate) => gtinDigitsMatch(candidate, wanted));
}

/**
 * The whole page scan, in the order the owner's decision fixes: structured data first, because a
 * declared `gtin13` is the page stating its identity, then the text a human would read, and only
 * then the raw bytes. Returns the method that hit, or null.
 */
export function findGtinInHtml(html: string, gtin: string): EanConfirmationMethod | null {
  const normalized = normalizeGtin(gtin);
  if (normalized.length < MIN_GTIN_LENGTH || html === '') return null;
  if (jsonLdNamesGtinInHtml(html, normalized)) return 'json_ld';
  if (microdataNamesGtin(html, normalized)) return 'microdata';
  if (pageTextNamesGtin(html, normalized)) return 'page_text';
  if (!declaresADifferentProduct(html, normalized) && rawHtmlNamesGtin(html, normalized)) {
    return 'raw_html';
  }
  return null;
}

/* ── the bounded fetch ────────────────────────────────────────────────────── */

export interface PageFetchLimits {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
}

/**
 * Deliberately small. This runs inside an edge function that is already paying for a research call,
 * so a slow page must cost a few seconds, never the request.
 */
export const DEFAULT_PAGE_FETCH_LIMITS: PageFetchLimits = Object.freeze({
  timeoutMs: 5_000,
  maxBytes: 512 * 1024,
  maxRedirects: 2,
});

export type PageFetcher = (url: string, init: RequestInit) => Promise<Response>;

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

/*
  SSRF. This module turns a URL chosen by a research model into a fetch made from inside our own
  infrastructure — the classic shape of a server-side request forgery. The protocol check alone is
  not enough: `http://169.254.169.254/` is perfectly valid http.

  Every hop is checked, not just the first, because a redirect is a second attacker-chosen address.

  Honest limit: this refuses ADDRESSES, and a hostname that resolves to a private IP (DNS
  rebinding) still passes. Refusing that needs resolution before connect, which the edge runtime
  does not expose. The bounded reader, the omitted credentials and the text-only content type keep
  the value of such a request close to nil, and it is written down here rather than implied.
*/
const BLOCKED_HOST_NAMES = /^(?:localhost|.*\.localhost|.*\.internal|.*\.local|.*\.home\.arpa)$/i;

export function isPubliclyRoutableHost(hostname: string): boolean {
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (host === '' || BLOCKED_HOST_NAMES.test(host)) return false;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [a, b] = ipv4.slice(1, 3).map(Number) as [number, number];
    if (ipv4.slice(1).some((part) => Number(part) > 255)) return false;
    if (a === 0 || a === 10 || a === 127) return false; // this network, private, loopback
    if (a === 169 && b === 254) return false; // link-local, and 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return false; // private
    if (a === 192 && b === 168) return false; // private
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
    if (a === 192 && b === 0) return false; // IETF protocol assignments / 192.0.0.0-192.0.2.255
    if (a >= 224) return false; // multicast and reserved, including 255.255.255.255
    return true;
  }

  // A bare number or a partial dotted form is a valid IPv4 spelling to most resolvers
  // (`http://2130706433/` is 127.0.0.1). Anything numeric that is not a full dotted quad is out.
  if (/^[0-9]+$/.test(host) || /^[0-9.]+$/.test(host)) return false;

  if (host.includes(':')) {
    // IPv6. Refuse loopback (::1), unspecified (::), unique-local (fc00::/7) and link-local
    // (fe80::/10). IPv4-mapped forms are re-checked as IPv4.
    if (host === '::' || host === '::1') return false;
    const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(host);
    if (mapped) return isPubliclyRoutableHost(mapped[1]!);
    if (/^f[cd][0-9a-f]{2}:/i.test(host)) return false;
    if (/^fe[89ab][0-9a-f]:/i.test(host)) return false;
    return true;
  }
  return true;
}

/** Anything that is not text cannot state a barcode in a form this module reads. */
const READABLE_CONTENT_TYPE = /(?:^|\s)(?:text\/|application\/(?:xhtml\+xml|ld\+json|json))/i;

const USER_AGENT = 'GellattiProductVerifier/1.0 (+server-side GTIN confirmation)';

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    return (await response.text()).slice(0, maxBytes);
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
      }
    }
  } finally {
    // Stop the transfer the moment the cap is reached; nothing beyond it is ever read.
    await reader.cancel().catch(() => undefined);
  }
  const merged = new Uint8Array(Math.min(received, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= merged.length) break;
    merged.set(chunk.subarray(0, merged.length - offset), offset);
    offset += chunk.length;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

/**
 * Fetch one page under hard bounds, or return null. NEVER throws: an unreachable, oversized,
 * non-http(s), binary or redirect-looping page simply yields nothing to confirm with.
 */
export async function fetchPageForEanConfirmation(
  url: string,
  options: { fetchImpl?: PageFetcher; limits?: Partial<PageFetchLimits> } = {},
): Promise<string | null> {
  return (await readPageForEanConfirmation(url, options)).html;
}

/**
 * WHY A REFUSAL IS NOT THE SAME AS AN ABSENCE.
 *
 * `fetchPageForEanConfirmation` answers `null` for a page that would not load AND for a page that
 * loaded and said nothing — and those two mean opposite things. A page the server READ and which
 * does not carry the code is evidence against; a page the server was FORBIDDEN to read is no
 * evidence at all, and must not be treated as a denial.
 *
 * This matters in production, not in theory. Of the eight sources behind the owner's two test
 * EANs, the two that actually carry ingredient data — `latiendaencasa.es` and `elcorteingles.es` —
 * both answer a server fetch with `HTTP 403 Access Denied`. Collapsing that into "no code here"
 * would have silently withdrawn the only working source for `7340222800457`.
 */
export interface PageReadResult {
  html: string | null;
  /** True when the server never got to see the page: blocked, unreachable, refused, timed out. */
  unreadable: boolean;
  status: number | null;
}

export async function readPageForEanConfirmation(
  url: string,
  options: { fetchImpl?: PageFetcher; limits?: Partial<PageFetchLimits> } = {},
): Promise<PageReadResult> {
  const refused = (status: number | null = null): PageReadResult => ({
    html: null,
    unreadable: true,
    status,
  });
  const limits = { ...DEFAULT_PAGE_FETCH_LIMITS, ...options.limits };
  const fetchImpl = options.fetchImpl ?? ((target, init) => fetch(target, init));
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    return refused();
  }
  if (!/^https?:$/.test(current.protocol)) return refused();
  if (!isPubliclyRoutableHost(current.hostname)) return refused();

  try {
    for (let hop = 0; hop <= limits.maxRedirects; hop += 1) {
      const response = await fetchImpl(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        // A page found by research is not the user's session: no cookies, no credentials.
        credentials: 'omit',
        referrer: '',
        signal: AbortSignal.timeout(limits.timeoutMs),
        headers: {
          accept: 'text/html,application/xhtml+xml,application/ld+json;q=0.9,text/plain;q=0.8',
          'accept-language': '*',
          'user-agent': USER_AGENT,
        },
      });
      if (REDIRECT_STATUS.has(response.status)) {
        const location = response.headers.get('location');
        if (!location) return refused(response.status);
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          return refused(response.status);
        }
        // A redirect is a second attacker-chosen address, so both checks run again on every hop.
        if (!/^https?:$/.test(next.protocol)) return refused(response.status);
        if (!isPubliclyRoutableHost(next.hostname)) return refused(response.status);
        current = next;
        continue;
      }
      if (!response.ok) return refused(response.status);
      const contentType = response.headers.get('content-type');
      if (contentType && !READABLE_CONTENT_TYPE.test(contentType)) return refused(response.status);
      // Read, and therefore answerable: an absent code here really is an absence.
      return {
        html: await readBounded(response, limits.maxBytes),
        unreadable: false,
        status: response.status,
      };
    }
  } catch {
    return refused();
  }
  // More redirects than allowed.
  return refused();
}

/* ── the confirmation itself ──────────────────────────────────────────────── */

/**
 * Per (url, gtin), for ONE enrich invocation. Holds the in-flight promise, so several facts citing
 * the same page fetch it once even when they are resolved concurrently.
 */
export type PageEanConfirmationCache = Map<string, Promise<PageEanConfirmationOutcome>>;

export const createPageEanConfirmationCache = (): PageEanConfirmationCache => new Map();

export interface ConfirmEanOnPageInput {
  url: string;
  /** The code that was actually scanned. */
  gtin: string;
  fetchImpl?: PageFetcher;
  limits?: Partial<PageFetchLimits>;
  cache?: PageEanConfirmationCache;
  now?: () => Date;
}

/**
 * Does this page name the scanned article? Answered by the server, from the page — the URL first
 * because it costs no request at all, then the fetched document.
 */
export interface PageEanConfirmationOutcome {
  confirmation: PageEanConfirmation | null;
  /**
   * True when the server never got to SEE the page. Carried on the RESULT rather than in a
   * module-level map: an edge function isolate is reused across requests, so per-URL state parked
   * outside the call would leak between customers and grow without bound.
   */
  unreadable: boolean;
}

export async function confirmEanOnPageDetailed(
  input: ConfirmEanOnPageInput,
): Promise<PageEanConfirmationOutcome> {
  const gtin = normalizeGtin(input.gtin);
  const url = typeof input.url === 'string' ? input.url.trim() : '';
  if (gtin.length < MIN_GTIN_LENGTH || url === '') {
    return { confirmation: null, unreadable: false };
  }

  const key = `${url}|${gtin}`;
  const cached = input.cache?.get(key);
  if (cached) return await cached;

  const run = (async (): Promise<PageEanConfirmationOutcome> => {
    const at = (input.now ?? (() => new Date()))().toISOString();
    if (urlNamesGtin(url, gtin)) {
      return { confirmation: { method: 'url', gtin, url, confirmedAt: at }, unreadable: false };
    }
    const read = await readPageForEanConfirmation(url, {
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
      ...(input.limits ? { limits: input.limits } : {}),
    });
    if (read.html === null) return { confirmation: null, unreadable: read.unreadable };
    const method = findGtinInHtml(read.html, gtin);
    return {
      confirmation: method ? { method, gtin, url, confirmedAt: at } : null,
      unreadable: false,
    };
  })();

  input.cache?.set(key, run);
  return await run;
}

/** The same question, for callers that only need the answer and not why it is missing. */
export async function confirmEanOnPage(
  input: ConfirmEanOnPageInput,
): Promise<PageEanConfirmation | null> {
  return (await confirmEanOnPageDetailed(input)).confirmation;
}

/* ── precedence: what the server read outranks what the model said ────────── */

export interface SourceEanConfirmationInput {
  /** What the server established for itself, or null when it could not. */
  serverConfirmation: PageEanConfirmation | null;
  /** The barcode the research model claims is printed on that page. */
  modelStatedEan?: string | null;
  /** The code that was actually scanned. */
  scannedGtin?: string | null;
  /**
   * True when the server never got to SEE the page (403, unreachable, timed out, refused address)
   * — as opposed to having read it and found no code. Only the former lets a matching
   * server-enrichment barcode stand in as auxiliary confirmation.
   */
  pageUnreadable?: boolean;
  url?: string | null;
  now?: () => Date;
}

export interface SourceEanConfirmationVerdict {
  /** What is recorded on the fact — including, when that is all there is, the model's word. */
  confirmation: PageEanConfirmation | null;
  /**
   * The ONLY input `classifySourceAuthority` may be given. True exclusively for a confirmation the
   * server read itself, so a page nobody could fetch is never promoted on a model's say-so.
   */
  exactEanConfirmedOnPage: boolean;
  /** The barcode this page states, digits only — the server's reading when it has one. */
  statedEan: string;
}

/**
 * The precedence rule, in one place.
 *
 *   server read the code on the page  → confirmed, and the source may be promoted
 *   only the model says so            → recorded as `model_reported`, NO promotion
 *   neither                           → nothing, and the model's unmatched claim is still carried
 *                                       verbatim for a later reader, exactly as before
 *
 * A `url` confirmation deliberately does not overwrite `statedEan`: the server proved the page is
 * ADDRESSED by the scanned code, which is not the same as having read that code printed on it.
 */
export function resolveSourceEanConfirmation(
  input: SourceEanConfirmationInput,
): SourceEanConfirmationVerdict {
  const scanned = normalizeGtin(input.scannedGtin);
  const stated = normalizeGtin(input.modelStatedEan);
  const server = input.serverConfirmation;

  if (server && isServerEanConfirmation(server.method)) {
    return {
      confirmation: server,
      exactEanConfirmedOnPage: true,
      statedEan: server.method === 'url' ? stated : server.gtin,
    };
  }

  const statedMatchesScanned =
    scanned.length >= MIN_GTIN_LENGTH &&
    stated.length >= MIN_GTIN_LENGTH &&
    gtinDigitsMatch(stated, scanned);

  /*
    THE PAGE NOBODY IS ALLOWED TO READ.

    `latiendaencasa.es` and `elcorteingles.es` — the only two of eight sources that carry the
    ingredient text the score depends on — answer a server fetch with `HTTP 403 Access Denied`.
    Bot protection is not a statement about the product. Refusing to credit them would withdraw
    working evidence for a reason that has nothing to do with evidence.

    So when the server could not READ the page, and the barcode reported for it matches the scanned
    code exactly, that is kept as auxiliary confirmation and DOES promote. The narrowness is the
    whole point:

      - it applies ONLY when the page was unreadable. A page the server read and which does not
        name the code is an absence, and stays `model_reported` with no promotion;
      - `modelStatedEan` must reach here from the server's OWN enrichment call. A value that came
        in on a client request is never passed to this function — `intimport-enrich` reads it from
        the provider's response, and nothing on the request body can reach it;
      - a mismatched or missing code promotes nothing, unreadable or not.
  */
  if (input.pageUnreadable === true && statedMatchesScanned) {
    return {
      confirmation: {
        method: 'server_enrichment_unfetchable',
        gtin: stated,
        url: input.url ?? null,
        confirmedAt: (input.now ?? (() => new Date()))().toISOString(),
      },
      exactEanConfirmedOnPage: true,
      statedEan: stated,
    };
  }

  if (statedMatchesScanned) {
    return {
      confirmation: {
        method: 'model_reported',
        gtin: stated,
        url: input.url ?? null,
        confirmedAt: (input.now ?? (() => new Date()))().toISOString(),
      },
      // The page was readable and did not name the code. The model's word corroborates; it never
      // promotes on its own.
      exactEanConfirmedOnPage: false,
      statedEan: stated,
    };
  }
  return { confirmation: null, exactEanConfirmedOnPage: false, statedEan: stated };
}

/**
 * EVIDENCE DOES NOT GO BACKWARDS.
 *
 * A second look at the same page can be weaker than the first for reasons that say nothing about
 * the product: the retailer started returning 403, the fetch timed out, the research model stopped
 * quoting the barcode. None of that unmakes a code the server once read there.
 *
 * So a stored confirmation is only replaced by a STRICTLY stronger one, ranked by how the code was
 * established. Equal strength keeps the earlier record, because the first reading is the one with
 * a `confirmedAt` that already means something.
 */
const CONFIRMATION_STRENGTH: Readonly<Record<EanConfirmationMethod, number>> = Object.freeze({
  json_ld: 6,
  microdata: 5,
  page_text: 4,
  raw_html: 3,
  url: 3,
  server_enrichment_unfetchable: 2,
  model_reported: 1,
});

export function strongerEanConfirmation(
  prior: PageEanConfirmation | null,
  next: PageEanConfirmation | null,
): PageEanConfirmation | null {
  if (!prior) return next;
  if (!next) return prior;
  // A confirmation for a different code is not a downgrade of this one; it is about another
  // product entirely, and the record we hold for THIS code stands.
  if (!gtinDigitsMatch(next.gtin, prior.gtin)) return prior;
  const priorRank = CONFIRMATION_STRENGTH[prior.method] ?? 0;
  const nextRank = CONFIRMATION_STRENGTH[next.method] ?? 0;
  return nextRank > priorRank ? next : prior;
}

/**
 * REPLAY, for a reader holding a stored fact rather than a live page.
 *
 * `catalog-submit` re-derives every web fact's authority from the URL before it will trust the
 * enrichment ledger row, and a class it cannot reproduce voids the whole submission. Once the
 * server can promote a source on a confirmed code, that re-derivation needs the same input — but
 * it must not simply believe the stored method either. So both must hold: the ledger says the
 * SERVER confirmed it, AND the stored evidence still agrees with the product being submitted —
 * the URL names the code, or the code the server read is that code. No network, no new authority.
 */
export function storedServerEanConfirmationHolds(input: {
  method: unknown;
  /** The barcode the stored fact says the page states. */
  statedEan?: string | null;
  url?: string | null;
  /** The product's own code, as the caller knows it now. */
  gtin?: string | null;
}): boolean {
  if (!isServerEanConfirmation(input.method)) return false;
  const gtin = normalizeGtin(input.gtin);
  if (gtin.length < MIN_GTIN_LENGTH) return false;
  const stated = normalizeGtin(input.statedEan);
  if (stated.length >= MIN_GTIN_LENGTH && gtinDigitsMatch(stated, gtin)) return true;
  return typeof input.url === 'string' && urlNamesGtin(input.url, gtin);
}
