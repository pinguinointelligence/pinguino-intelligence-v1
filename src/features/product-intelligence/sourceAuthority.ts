/**
 * Source authority classification — WHERE a fact came from decides how much it
 * is worth, and that must be established from the ACTUAL source, never assumed.
 *
 * A previous cut credited every owner-export row at manufacturer strength simply
 * because it carried a `Primary Source URL` and a `Checked At` date. That is
 * wrong: a URL plus a date proves the owner looked something up, not that the
 * page was the manufacturer's. A retailer listing and a manufacturer technical
 * PDF are both "a URL with a date", and they are not the same evidence.
 *
 * This module classifies a source from its actual URL/domain/content type, and
 * an unrecognized domain stays OWNER_PROVIDED_SOURCE — deliberately below
 * manufacturer/brand tiers — rather than being promoted on faith.
 *
 * Pure and deterministic: no network, no DNS, no AI.
 */
/** Evidence tiers, mirrored from the canonical confidence engine. */
export type SourceEvidenceTier =
  | 'manufacturer'
  | 'barcode_registry'
  | 'retailer'
  | 'web_search'
  | 'source_file';

export type SourceAuthorityClass =
  /** The manufacturer's own site, or a technical-document host they publish on. */
  | 'OFFICIAL_MANUFACTURER'
  /** The brand's own site, where brand and manufacturer differ. */
  | 'OFFICIAL_BRAND'
  /** A specification/TDS PDF published under an official domain. */
  | 'OFFICIAL_TECHNICAL_PDF'
  /**
   * A retailer's own page for a brand that retailer OWNS. For a private label
   * the seller is also the brand owner, so the page is first-party for that
   * brand — and only for that brand.
   */
  | 'OFFICIAL_PRIVATE_LABEL'
  /** A major retailer showing the exact labelled product. */
  | 'AUTHORITATIVE_RETAILER'
  /** A structured product/GTIN database. */
  | 'STRUCTURED_PRODUCT_DATABASE'
  /** The owner supplied this URL, but it is not recognizably official. */
  | 'OWNER_PROVIDED_SOURCE'
  /** Some other page on the open web. */
  | 'OTHER_WEB'
  | 'UNKNOWN';

export interface SourceAuthorityAssessment {
  authority: SourceAuthorityClass;
  /** The evidence tier this source may contribute at. */
  evidenceSource: SourceEvidenceTier;
  domain: string | null;
  /** Owner-readable justification — never a bare label. */
  reasons: string[];
}

/** Known authoritative retailers/marketplaces that show real labelled products. */
const RETAILER_DOMAINS = [
  'biedronka.pl',
  'zakupy.biedronka.pl',
  'carrefour.pl',
  'auchan.pl',
  'frisco.pl',
  'rossmann.pl',
  'mercadona.es',
  'tesco.com',
  'sainsburys.co.uk',
  'amazon.',
  'allegro.pl',
];

/** Structured GTIN / product databases. */
const PRODUCT_DATABASE_DOMAINS = [
  'openfoodfacts.org',
  'world.openfoodfacts.org',
  'gs1.org',
  'gepir.gs1.org',
  'barcodelookup.com',
  'upcitemdb.com',
];

/** Hosts manufacturers commonly publish technical documents on. */
const TECHNICAL_DOCUMENT_HOSTS = ['cdn.', 'assets.', 'docs.', 'media.', 'files.'];

const NON_OFFICIAL_HINTS = [
  'blogspot.',
  'wordpress.',
  'medium.com',
  'pinterest.',
  'facebook.',
  'reddit.',
  'quora.',
  'forum',
  'wiki',
];

/** Extract a lowercase hostname without `www.`, or null when unparseable. */
export function sourceDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Accept an owner domain given either bare (`biedronka.pl`) or as a URL. */
const asDomain = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.includes('://')) return sourceDomain(trimmed);
  return trimmed.replace(/^www\./, '').replace(/\/.*$/, '') || null;
};

const normalizeName = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/**
 * True when the domain plausibly belongs to the named company/brand — the
 * registrable label matches the normalized name (e.g. `comprital.com` for
 * "Comprital", `mccormick.pl` for "McCormick Polska S.A.").
 */
export function domainMatchesEntity(
  domain: string | null,
  entity: string | null | undefined,
): boolean {
  const name = normalizeName(entity);
  if (!domain || name.length < 4) return false;
  const label = domain.split('.')[0] ?? '';
  const normalizedLabel = normalizeName(label);
  if (normalizedLabel.length < 4) return false;
  // Match either direction: "comprital" vs "compritalpolska", but never a
  // 3-letter coincidence.
  return normalizedLabel.includes(name) || name.includes(normalizedLabel);
}

const includesAny = (domain: string, needles: readonly string[]): boolean =>
  needles.some((needle) => domain.includes(needle));

export interface SourceAuthorityInput {
  url: string | null | undefined;
  /** The product's declared brand, used to recognize an official brand domain. */
  brand?: string | null;
  /** The product's declared manufacturer. */
  manufacturer?: string | null;
  /** True when the URL was supplied by the owner's export rather than found by research. */
  ownerProvided?: boolean;
  /** Content type, when known — a PDF under an official domain is a spec sheet. */
  contentType?: string | null;
  /**
   * Proven private-label ownership: the retailer domain that OWNS this
   * product's brand. Supplied by the caller from evidence — never inferred from
   * the fact that a product is sold somewhere. Milka on a supermarket site is
   * still a retailer listing; that supermarket's own label is not.
   */
  privateLabelOwnerDomain?: string | null;
}

/** The evidence tier each authority class may contribute at. */
const TIER: Readonly<Record<SourceAuthorityClass, SourceEvidenceTier>> = Object.freeze({
  OFFICIAL_TECHNICAL_PDF: 'manufacturer',
  OFFICIAL_MANUFACTURER: 'manufacturer',
  OFFICIAL_BRAND: 'manufacturer',
  OFFICIAL_PRIVATE_LABEL: 'manufacturer',
  STRUCTURED_PRODUCT_DATABASE: 'barcode_registry',
  AUTHORITATIVE_RETAILER: 'retailer',
  OWNER_PROVIDED_SOURCE: 'retailer',
  OTHER_WEB: 'web_search',
  UNKNOWN: 'web_search',
});

/**
 * Classify one source. An owner-provided URL is NEVER promoted to manufacturer
 * authority on the strength of existing at all — it must actually look official.
 */
export function classifySourceAuthority(
  input: SourceAuthorityInput,
): SourceAuthorityAssessment {
  const domain = sourceDomain(input.url);
  const reasons: string[] = [];

  if (!domain) {
    return {
      authority: 'UNKNOWN',
      evidenceSource: TIER.UNKNOWN,
      domain: null,
      reasons: ['brak możliwego do zweryfikowania adresu źródła'],
    };
  }

  const isPdf =
    /\.pdf($|\?)/i.test(input.url ?? '') || /application\/pdf/i.test(input.contentType ?? '');
  const matchesManufacturer = domainMatchesEntity(domain, input.manufacturer);
  const matchesBrand = domainMatchesEntity(domain, input.brand);
  const official = matchesManufacturer || matchesBrand;

  if (official && isPdf) {
    reasons.push('dokument PDF w oficjalnej domenie producenta/marki');
    return { authority: 'OFFICIAL_TECHNICAL_PDF', evidenceSource: TIER.OFFICIAL_TECHNICAL_PDF, domain, reasons };
  }
  if (matchesManufacturer) {
    reasons.push(`domena zgodna z producentem (${domain})`);
    return { authority: 'OFFICIAL_MANUFACTURER', evidenceSource: TIER.OFFICIAL_MANUFACTURER, domain, reasons };
  }
  if (matchesBrand) {
    reasons.push(`domena zgodna z marką (${domain})`);
    return { authority: 'OFFICIAL_BRAND', evidenceSource: TIER.OFFICIAL_BRAND, domain, reasons };
  }
  if (includesAny(domain, PRODUCT_DATABASE_DOMAINS)) {
    reasons.push('strukturalna baza produktów/GTIN');
    return {
      authority: 'STRUCTURED_PRODUCT_DATABASE',
      evidenceSource: TIER.STRUCTURED_PRODUCT_DATABASE,
      domain,
      reasons,
    };
  }
  if (includesAny(domain, RETAILER_DOMAINS)) {
    // A seller that owns the brand is speaking for its own product here. The
    // upgrade is keyed on the CALLER'S proven ownership, never on the domain:
    // the same site is first-party for its own label and a mere retailer for
    // everything else it stocks.
    const ownerDomain = asDomain(input.privateLabelOwnerDomain);
    if (ownerDomain && domain && (domain === ownerDomain || domain.endsWith(`.${ownerDomain}`))) {
      reasons.push(`sprzedawca jest właścicielem tej marki własnej (${ownerDomain})`);
      return {
        authority: 'OFFICIAL_PRIVATE_LABEL',
        evidenceSource: TIER.OFFICIAL_PRIVATE_LABEL,
        domain,
        reasons,
      };
    }
    reasons.push('rozpoznany sprzedawca detaliczny');
    return { authority: 'AUTHORITATIVE_RETAILER', evidenceSource: TIER.AUTHORITATIVE_RETAILER, domain, reasons };
  }
  if (isPdf && includesAny(domain, TECHNICAL_DOCUMENT_HOSTS)) {
    // A PDF on an unverified CDN is a document, but not provably the maker's.
    reasons.push('PDF na nierozpoznanym hoście dokumentów — brak potwierdzenia oficjalności');
    return { authority: 'OTHER_WEB', evidenceSource: TIER.OTHER_WEB, domain, reasons };
  }
  if (input.ownerProvided) {
    // The decisive rule: supplied by the owner, but not recognizably official.
    reasons.push('adres podany przez właściciela, bez potwierdzenia oficjalności domeny');
    return { authority: 'OWNER_PROVIDED_SOURCE', evidenceSource: TIER.OWNER_PROVIDED_SOURCE, domain, reasons };
  }
  if (includesAny(domain, NON_OFFICIAL_HINTS)) {
    reasons.push('blog/forum/serwis społecznościowy — najniższa wiarygodność');
    return { authority: 'OTHER_WEB', evidenceSource: TIER.OTHER_WEB, domain, reasons };
  }
  reasons.push('nierozpoznana domena');
  return { authority: 'OTHER_WEB', evidenceSource: TIER.OTHER_WEB, domain, reasons };
}

/** Ordering used to prefer the strongest source when several are available. */
export const SOURCE_AUTHORITY_RANK: Readonly<Record<SourceAuthorityClass, number>> = Object.freeze({
  OFFICIAL_TECHNICAL_PDF: 7,
  OFFICIAL_MANUFACTURER: 6,
  OFFICIAL_BRAND: 5,
  OFFICIAL_PRIVATE_LABEL: 5,
  STRUCTURED_PRODUCT_DATABASE: 4,
  AUTHORITATIVE_RETAILER: 3,
  OWNER_PROVIDED_SOURCE: 2,
  OTHER_WEB: 1,
  UNKNOWN: 0,
});

/** The preferred research order (§8), strongest first. */
export const PREFERRED_SOURCE_ORDER: readonly SourceAuthorityClass[] = [
  'OFFICIAL_MANUFACTURER',
  'OFFICIAL_TECHNICAL_PDF',
  'OFFICIAL_BRAND',
  'OFFICIAL_PRIVATE_LABEL',
  'STRUCTURED_PRODUCT_DATABASE',
  'AUTHORITATIVE_RETAILER',
  'OWNER_PROVIDED_SOURCE',
  'OTHER_WEB',
];
