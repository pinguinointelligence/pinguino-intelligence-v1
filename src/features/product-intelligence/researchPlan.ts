/**
 * Deterministic research planning — decide WHERE to look before spending.
 *
 * The first paid run produced zero manufacturer-grade facts across ten products,
 * even for Comprital rows whose own `Primary Source URL` already pointed at
 * `comprital.pl`. Three things caused that, and all three were planning failures
 * rather than model failures:
 *
 *   1. the owner's `Primary Source URL` was passed inside an identity blob with
 *      no instruction to consult it, so it read as trivia rather than evidence;
 *   2. `Technical PDF URL` was never sent to the provider at all;
 *   3. the only tool offered was an unrestricted `web_search`, which is the wrong
 *      primitive for "read this known page" — search rankings favour SEO
 *      aggregators, which is exactly what came back.
 *
 * This module fixes the planning half: it produces an ordered, explicit list of
 * sources to try, strongest first, with hard domain restrictions where an
 * official source is actually known. It never fabricates a domain and never
 * upgrades a retailer to manufacturer authority.
 *
 * Pure and deterministic: no network, no AI, no clock.
 */
import { classifySourceAuthority, sourceDomain } from './sourceAuthority';
import type { ProductEvidenceField } from './productEvidenceConfidence';

/** How a single research attempt should be carried out. */
export type ResearchStepKind =
  /** Open a specific official URL the owner already supplied. */
  | 'OWNER_OFFICIAL_URL'
  /** Open the supplied official technical/specification PDF. */
  | 'OWNER_TECHNICAL_PDF'
  /** Search, hard-restricted to the manufacturer's/brand's own domain. */
  | 'OFFICIAL_DOMAIN_SEARCH'
  /** Look the exact GTIN up in structured product databases. */
  | 'GTIN_LOOKUP'
  /** Search, restricted to recognized retailers. */
  | 'RETAILER_SEARCH'
  /** Unrestricted search — genuinely the last resort. */
  | 'OPEN_WEB_SEARCH';

export interface ResearchStep {
  kind: ResearchStepKind;
  /** The exact URL to open, when the step names one. */
  url: string | null;
  /**
   * Domains the provider may use for this step. An empty array means
   * unrestricted; a non-empty array is a HARD restriction, not a preference.
   */
  allowedDomains: string[];
  /** Owner-readable reason this step was chosen. */
  reason: string;
}

export interface ResearchPlanInput {
  brand: string | null;
  manufacturer: string | null;
  name: string | null;
  variant: string | null;
  barcode: string | null;
  netQuantity: string | null;
  /** INTIMPORT `Primary Source URL`. */
  knownSourceUrl: string | null;
  /** INTIMPORT `Technical PDF URL`. */
  technicalPdfUrl: string | null;
  /** Fields still missing — nothing else may be researched. */
  missingFields: readonly ProductEvidenceField[];
}

export interface ResearchPlan {
  steps: ResearchStep[];
  /** True when the plan starts from evidence the owner already supplied. */
  startsFromOwnerOfficialSource: boolean;
  /** The domain the plan considers official for this product, if any. */
  officialDomain: string | null;
}

/** Structured GTIN/product databases worth an exact-code lookup. */
const GTIN_DATABASES = ['world.openfoodfacts.org', 'openfoodfacts.org', 'gs1.org'];

/** Recognized retailers, used only as a restricted fallback tier. */
const RETAILERS = [
  'zakupy.biedronka.pl',
  'biedronka.pl',
  'zakupy.auchan.pl',
  'auchan.pl',
  'carrefour.pl',
  'frisco.pl',
  'rossmann.pl',
];

const OFFICIAL_CLASSES = new Set([
  'OFFICIAL_MANUFACTURER',
  'OFFICIAL_BRAND',
  'OFFICIAL_TECHNICAL_PDF',
]);

/**
 * Establish the product's official domain from evidence already in the row —
 * never guessed from the company name alone. A domain only counts as official
 * when the classifier, judging the real URL against the declared brand or
 * manufacturer, says so.
 */
export function officialDomainFor(input: ResearchPlanInput): string | null {
  for (const url of [input.knownSourceUrl, input.technicalPdfUrl]) {
    if (!url) continue;
    const assessment = classifySourceAuthority({
      url,
      brand: input.brand,
      manufacturer: input.manufacturer,
      ownerProvided: true,
    });
    if (OFFICIAL_CLASSES.has(assessment.authority)) return assessment.domain;
  }
  return null;
}

/**
 * Build the ordered research plan (§4: A → G).
 *
 * A. the supplied official Primary Source URL
 * B. the supplied official Technical PDF
 * C. the exact official manufacturer/brand domain
 * D. exact GTIN structured lookup
 * E. authoritative retailer
 * F/G. open web, last
 *
 * Steps A–D are never skipped when they are available.
 */
export function buildResearchPlan(input: ResearchPlanInput): ResearchPlan {
  const steps: ResearchStep[] = [];
  const officialDomain = officialDomainFor(input);

  const classify = (url: string | null) =>
    url
      ? classifySourceAuthority({
          url,
          brand: input.brand,
          manufacturer: input.manufacturer,
          ownerProvided: true,
        })
      : null;

  // B before A for technical products would be tempting, but the PDF is the
  // stronger document whenever it exists, so it leads when present.
  const pdf = classify(input.technicalPdfUrl);
  if (input.technicalPdfUrl && pdf && OFFICIAL_CLASSES.has(pdf.authority)) {
    steps.push({
      kind: 'OWNER_TECHNICAL_PDF',
      url: input.technicalPdfUrl,
      allowedDomains: pdf.domain ? [pdf.domain] : [],
      reason: `oficjalna karta techniczna producenta (${pdf.domain})`,
    });
  }

  const primary = classify(input.knownSourceUrl);
  if (input.knownSourceUrl && primary && OFFICIAL_CLASSES.has(primary.authority)) {
    steps.push({
      kind: 'OWNER_OFFICIAL_URL',
      url: input.knownSourceUrl,
      allowedDomains: primary.domain ? [primary.domain] : [],
      reason: `oficjalne źródło podane przez właściciela (${primary.domain})`,
    });
  }

  if (officialDomain && !steps.some((step) => step.allowedDomains.includes(officialDomain))) {
    steps.push({
      kind: 'OFFICIAL_DOMAIN_SEARCH',
      url: null,
      allowedDomains: [officialDomain],
      reason: `Wyszukiwanie ograniczone do oficjalnej domeny (${officialDomain})`,
    });
  } else if (officialDomain) {
    // The owner's URL may be a catalogue page rather than this exact product;
    // a domain-restricted search is the natural second attempt.
    steps.push({
      kind: 'OFFICIAL_DOMAIN_SEARCH',
      url: null,
      allowedDomains: [officialDomain],
      reason: `Wyszukiwanie dokładnego produktu w obrębie oficjalnej domeny (${officialDomain})`,
    });
  }

  if (input.barcode) {
    steps.push({
      kind: 'GTIN_LOOKUP',
      url: null,
      allowedDomains: [...GTIN_DATABASES],
      reason: `dokładne wyszukiwanie po GTIN ${input.barcode}`,
    });
  }

  // The owner's URL when it is NOT official still beats open web — it is at
  // least the page they actually transcribed from.
  if (input.knownSourceUrl && primary && !OFFICIAL_CLASSES.has(primary.authority)) {
    steps.push({
      kind: 'RETAILER_SEARCH',
      url: input.knownSourceUrl,
      allowedDomains: primary.domain ? [primary.domain] : [],
      reason: `Źródło podane przez właściciela (${primary.authority.toLowerCase()})`,
    });
  }

  steps.push({
    kind: 'RETAILER_SEARCH',
    url: null,
    allowedDomains: [...RETAILERS],
    reason: 'Wyszukiwanie u rozpoznanych sprzedawców',
  });

  steps.push({
    kind: 'OPEN_WEB_SEARCH',
    url: null,
    allowedDomains: [],
    reason: 'Ostateczność — otwarte wyszukiwanie',
  });

  return {
    steps,
    startsFromOwnerOfficialSource:
      steps[0]?.kind === 'OWNER_TECHNICAL_PDF' || steps[0]?.kind === 'OWNER_OFFICIAL_URL',
    officialDomain,
  };
}

/** True when the first planned step consults owner-supplied official evidence. */
export const plansOfficialFirst = (plan: ResearchPlan): boolean =>
  plan.startsFromOwnerOfficialSource ||
  plan.steps[0]?.kind === 'OFFICIAL_DOMAIN_SEARCH';

export { sourceDomain };
