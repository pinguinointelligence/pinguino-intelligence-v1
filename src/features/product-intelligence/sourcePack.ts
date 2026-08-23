/**
 * Source packs — research the source, not the product.
 *
 * Researching 820 products independently is the expensive way to be wrong. A
 * manufacturer's catalogue page or technical PDF usually covers dozens of their
 * products at once, so the unit of research is the SOURCE, not the row: open
 * Comprital's catalogue once and it answers for every Comprital paste in the
 * file.
 *
 * A pack therefore groups products that share an official origin, records which
 * fields are still missing across that group, and carries the strongest entry
 * points the owner already supplied. Nothing here performs research or spends
 * anything — it decides what would be worth asking, and what it would cost.
 *
 * Packs are keyed by the strongest identity available, in order:
 *   official domain (proved from a real URL) → manufacturer → brand
 * A product with none of those gets its own singleton pack, because there is no
 * evidence it shares a source with anything else.
 *
 * Pure and deterministic: no DB, no network, no AI, no clock.
 */
import { classifySourceAuthority, type SourceAuthorityClass } from './sourceAuthority';
import { officialDomainFor } from './researchPlan';
import type { ProductEvidenceField } from './productEvidenceConfidence';
import type { WorkingNumericField } from './productFieldTruth';

export type SourcePackKeyKind = 'official_domain' | 'manufacturer' | 'brand' | 'unattributed';

export interface SourcePackMember {
  /** The owner's own Product ID, for traceability back to the file. */
  sourceProductId: string | null;
  rowIndex: number;
  name: string | null;
  /** Numeric working fields this product still lacks. */
  missingNumeric: readonly WorkingNumericField[];
  /** Evidence fields the local pass could not satisfy. */
  missingEvidence: readonly ProductEvidenceField[];
  knownSourceUrl: string | null;
  technicalPdfUrl: string | null;
  /** The identity this product declared — kept so entry-point authority can be
   * judged against the company that actually claims the URL. */
  brand: string | null;
  manufacturer: string | null;
}

export interface SourcePackEntryPoint {
  kind: 'technical_pdf' | 'primary_source';
  url: string;
  /** How the authority classifier rates this URL. Ranking, not a veto. */
  authority: SourceAuthorityClass;
  /** True only for manufacturer/brand/technical-PDF grade sources. */
  official: boolean;
  products: number;
}

export interface SourcePack {
  key: string;
  kind: SourcePackKeyKind;
  /** Owner-readable label. */
  label: string;
  /** The domain the pack considers official, when one was proved. */
  officialDomain: string | null;
  members: SourcePackMember[];
  /**
   * Distinct official entry points across the group, strongest first. These are
   * URLs the owner already recorded — never guessed.
   */
  entryPoints: SourcePackEntryPoint[];
  /** Union of everything the group still needs. */
  missingNumeric: WorkingNumericField[];
  missingEvidence: ProductEvidenceField[];
  /** Members that still need something. A pack of satisfied products costs nothing. */
  membersNeedingResearch: number;
}

export interface SourcePackInput {
  sourceProductId: string | null;
  rowIndex: number;
  name: string | null;
  brand: string | null;
  manufacturer: string | null;
  knownSourceUrl: string | null;
  technicalPdfUrl: string | null;
  missingNumeric: readonly WorkingNumericField[];
  missingEvidence: readonly ProductEvidenceField[];
}

/** Entry-point classes that count as the source speaking for itself. */
const OFFICIAL_ENTRY_CLASSES = new Set<SourceAuthorityClass>([
  'OFFICIAL_MANUFACTURER',
  'OFFICIAL_BRAND',
  'OFFICIAL_TECHNICAL_PDF',
]);

const normalize = (value: string | null | undefined): string =>
  (value ?? '').trim().toLocaleLowerCase('pl');

/**
 * Decide which source a product belongs to.
 *
 * An official domain is only used when the authority classifier, judging a real
 * URL against the declared brand or manufacturer, calls it official — a domain
 * is never inferred from a company name, so two unrelated firms cannot be merged
 * because their names look similar.
 */
export function packKeyFor(
  input: SourcePackInput,
): { key: string; kind: SourcePackKeyKind; label: string; officialDomain: string | null } {
  const officialDomain = officialDomainFor({
    brand: input.brand,
    manufacturer: input.manufacturer,
    name: input.name,
    variant: null,
    barcode: null,
    netQuantity: null,
    knownSourceUrl: input.knownSourceUrl,
    technicalPdfUrl: input.technicalPdfUrl,
    missingFields: input.missingEvidence,
  });
  if (officialDomain) {
    return {
      key: `domain:${officialDomain}`,
      kind: 'official_domain',
      label: officialDomain,
      officialDomain,
    };
  }
  const manufacturer = normalize(input.manufacturer);
  if (manufacturer) {
    return {
      key: `manufacturer:${manufacturer}`,
      kind: 'manufacturer',
      label: input.manufacturer!.trim(),
      officialDomain: null,
    };
  }
  const brand = normalize(input.brand);
  if (brand) {
    return { key: `brand:${brand}`, kind: 'brand', label: input.brand!.trim(), officialDomain: null };
  }
  // No shared origin evidence: a singleton, so it can never borrow another
  // product's source pack by accident.
  return {
    key: `unattributed:${input.sourceProductId ?? input.rowIndex}`,
    kind: 'unattributed',
    label: input.name ?? `wiersz ${input.rowIndex}`,
    officialDomain: null,
  };
}

/** Group products into packs. Order is stable: first appearance wins. */
export function buildSourcePacks(inputs: readonly SourcePackInput[]): SourcePack[] {
  const packs = new Map<string, SourcePack>();

  for (const input of inputs) {
    const { key, kind, label, officialDomain } = packKeyFor(input);
    let pack = packs.get(key);
    if (!pack) {
      pack = {
        key,
        kind,
        label,
        officialDomain,
        members: [],
        entryPoints: [],
        missingNumeric: [],
        missingEvidence: [],
        membersNeedingResearch: 0,
      };
      packs.set(key, pack);
    }
    pack.members.push({
      sourceProductId: input.sourceProductId,
      rowIndex: input.rowIndex,
      name: input.name,
      missingNumeric: input.missingNumeric,
      missingEvidence: input.missingEvidence,
      knownSourceUrl: input.knownSourceUrl,
      technicalPdfUrl: input.technicalPdfUrl,
      brand: input.brand,
      manufacturer: input.manufacturer,
    });
  }

  for (const pack of packs.values()) {
    const numeric = new Set<WorkingNumericField>();
    const evidence = new Set<ProductEvidenceField>();
    const entries = new Map<string, SourcePackEntryPoint>();

    for (const member of pack.members) {
      const needs = member.missingNumeric.length > 0 || member.missingEvidence.length > 0;
      if (needs) pack.membersNeedingResearch += 1;
      for (const field of member.missingNumeric) numeric.add(field);
      for (const field of member.missingEvidence) evidence.add(field);

      const add = (kind: 'technical_pdf' | 'primary_source', url: string | null): void => {
        if (!url) return;
        const assessment = classifySourceAuthority({
          url,
          brand: member.brand,
          manufacturer: member.manufacturer,
          ownerProvided: true,
        });
        if (assessment.authority === 'UNKNOWN') return;
        const existing = entries.get(url);
        if (existing) {
          existing.products += 1;
          return;
        }
        // A retailer listing is genuinely weaker evidence than a manufacturer
        // page, but it is still a real source the owner recorded and it sits in
        // the research ladder. It is ranked below official rather than dropped —
        // and never described as official just because it landed in this pack.
        entries.set(url, {
          kind,
          url,
          authority: assessment.authority,
          official: OFFICIAL_ENTRY_CLASSES.has(assessment.authority),
          products: 1,
        });
      };
      add('technical_pdf', member.technicalPdfUrl);
      add('primary_source', member.knownSourceUrl);
    }

    pack.missingNumeric = [...numeric];
    pack.missingEvidence = [...evidence];
    pack.entryPoints = [...entries.values()].sort(
      (a, b) =>
        Number(b.official) - Number(a.official) ||
        b.products - a.products ||
        (a.kind === b.kind ? a.url.localeCompare(b.url) : a.kind === 'technical_pdf' ? -1 : 1),
    );
  }

  return [...packs.values()].sort(
    (a, b) => b.membersNeedingResearch - a.membersNeedingResearch || a.key.localeCompare(b.key),
  );
}

export interface SourcePackPlan {
  packs: SourcePack[];
  totalProducts: number;
  productsNeedingResearch: number;
  /** Packs that would actually be opened. */
  packsNeedingResearch: number;
  /** Packs with a genuinely official entry point the owner already supplied. */
  packsWithOfficialEntryPoint: number;
  /** Packs whose only recorded sources are retailer or weaker. */
  packsWithOnlyWeakEntryPoints: number;
  /**
   * Upper bound on external calls if each pack needing research is opened once
   * per entry point, capped. This is what the source-pack strategy BUYS: the
   * comparison against one-call-per-product is the whole argument for it.
   */
  estimatedCallsPackStrategy: number;
  estimatedCallsPerProductStrategy: number;
}

/** How many entry points are worth opening for one pack. */
export const MAX_ENTRY_POINTS_PER_PACK = 2;
/** Worst case per product if each were researched alone. */
export const CALLS_PER_PRODUCT_IF_UNGROUPED = 2;

export function planSourcePacks(inputs: readonly SourcePackInput[]): SourcePackPlan {
  const packs = buildSourcePacks(inputs);
  const needing = packs.filter((pack) => pack.membersNeedingResearch > 0);
  const productsNeedingResearch = packs.reduce(
    (sum, pack) => sum + pack.membersNeedingResearch,
    0,
  );
  return {
    packs,
    totalProducts: inputs.length,
    productsNeedingResearch,
    packsNeedingResearch: needing.length,
    packsWithOfficialEntryPoint: needing.filter((pack) =>
      pack.entryPoints.some((entry) => entry.official),
    ).length,
    packsWithOnlyWeakEntryPoints: needing.filter(
      (pack) => pack.entryPoints.length > 0 && !pack.entryPoints.some((entry) => entry.official),
    ).length,
    estimatedCallsPackStrategy: needing.reduce(
      (sum, pack) => sum + Math.max(1, Math.min(pack.entryPoints.length, MAX_ENTRY_POINTS_PER_PACK)),
      0,
    ),
    estimatedCallsPerProductStrategy: productsNeedingResearch * CALLS_PER_PRODUCT_IF_UNGROUPED,
  };
}
