/**
 * INTIMPORT same-file identity preflight (§15) — who is who, before anything is
 * written.
 *
 * The catalogue resolves a product's canonical identity from its EAN when it has
 * one, and otherwise from brand + name + category + package size. That fallback
 * is a WEAK fingerprint: two genuinely different products can share all four. In
 * the Polish file three Comprital pairs do — `Speedy Classic` and the vegan
 * `Speedy Trilogy` share a name, a size and a category, yet differ in line,
 * dosage, process and description.
 *
 * The rule this module enforces: a weaker fingerprint must NEVER merge two rows
 * when a stronger identity key proves they are different. Identity strength runs
 *
 *   1. EAN / GTIN
 *   2. manufacturer article / product code
 *   3. stable source Product ID
 *   4. brand + canonical identity + variant + package
 *   5. weaker normalized fingerprint
 *
 * Nothing here changes a display name. Identity and presentation are separate
 * concerns: the canonical name stays as the accepted naming produced it, and
 * distinctness is carried by identity keys instead.
 *
 * Pure and deterministic — no IO, no DB, no Mapper, no network. Every row is
 * classified into exactly one bucket, so input count always equals the sum of
 * the buckets and no row can be silently lost.
 */
import type { IntimportCandidate } from '@/data/products/intimport';

export type IntimportRowClass =
  | 'NEW_CANONICAL_PRODUCT'
  | 'EXISTING_CANONICAL_REUSE'
  | 'EXACT_DUPLICATE'
  | 'IDENTITY_COLLISION_RESOLVED_AS_DISTINCT'
  | 'POSSIBLE_DUPLICATE_REVIEW'
  | 'IDENTITY_CONFLICT';

export interface IntimportRowIdentity {
  /** Normalized GTIN digits, when the row carries one. Strength 1. */
  ean: string | null;
  /** Manufacturer article code, as printed by the source. Strength 2. */
  manufacturerCode: string | null;
  /** The source's own stable row identifier. Strength 3. */
  sourceProductId: string | null;
  /** The catalogue's own fallback identity: brand|name|category|packageSize. */
  canonicalIdentity: string;
}

export interface IntimportDedupRow {
  rowIndex: number;
  displayName: string | null;
  identity: IntimportRowIdentity;
  classification: IntimportRowClass;
  /** Plain-language reason, for the preflight screen and the audit trail. */
  reason: string;
  /** Row index this row was judged against, when the judgement involved another row. */
  relatedRowIndex: number | null;
  /**
   * The catalogue's fallback identity would merge this row into another, and a
   * stronger key proved that wrong. The write MUST force a distinct canonical
   * product for it rather than letting the fingerprint decide.
   */
  forceDistinct: boolean;
}

export interface IntimportDedupPlan {
  rows: IntimportDedupRow[];
  counts: Record<IntimportRowClass, number>;
  totalInput: number;
  /** Sum of every bucket. Equal to totalInput, or the plan is not honest. */
  totalAccounted: number;
}

const norm = (value: string | null | undefined): string =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Digits only — a GTIN is a number, however the column spelled it. */
const normEan = (value: string | null | undefined): string | null => {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
};

/**
 * The manufacturer's own article code, which the source prints inside its
 * technical-parameter text (`Kod producenta: P1237 | Linia: ...`). It is read,
 * never invented: when the column does not state one, there is none.
 */
export function manufacturerCodeOf(technicalParameters: string | null): string | null {
  if (!technicalParameters) return null;
  const match =
    /(?:kod producenta|kod prod\.|article code|art\. code|product code)\s*:\s*([^|;]+)/i.exec(
      technicalParameters,
    );
  const code = match?.[1]?.trim();
  return code ? code : null;
}

/** Mirrors the catalogue's own fallback identity, field for field. */
export function canonicalIdentityOf(candidate: IntimportCandidate): string {
  const insert = candidate.insert as Record<string, unknown>;
  const name = (insert.product_name_display ?? insert.product_name_internal) as string | null;
  return [
    norm(insert.brand as string | null),
    norm(name),
    norm(insert.product_category as string | null),
    norm(insert.package_size as string | null),
  ].join('|');
}

export function identityOf(candidate: IntimportCandidate): IntimportRowIdentity {
  const insert = candidate.insert as Record<string, unknown>;
  return {
    ean: normEan((insert.ean_code as string | null) ?? candidate.ean),
    manufacturerCode: manufacturerCodeOf(candidate.source['Technical Parameters']),
    sourceProductId: candidate.sourceProductId ? candidate.sourceProductId.trim() : null,
    canonicalIdentity: canonicalIdentityOf(candidate),
  };
}

/**
 * Two rows are the SAME product only when a strong key says so. Sharing a
 * normalized name is not evidence of that and never decides it here.
 */
function strongKeyAgreement(
  a: IntimportRowIdentity,
  b: IntimportRowIdentity,
): 'ean' | 'manufacturer_code' | 'source_product_id' | null {
  if (a.ean && b.ean && a.ean === b.ean) return 'ean';
  if (
    a.manufacturerCode &&
    b.manufacturerCode &&
    norm(a.manufacturerCode) === norm(b.manufacturerCode)
  ) {
    return 'manufacturer_code';
  }
  if (
    a.sourceProductId &&
    b.sourceProductId &&
    norm(a.sourceProductId) === norm(b.sourceProductId)
  ) {
    return 'source_product_id';
  }
  return null;
}

/** A stronger key that positively DISPROVES sameness: both rows state one, and they differ. */
function strongKeyDisagreement(
  a: IntimportRowIdentity,
  b: IntimportRowIdentity,
): 'ean' | 'manufacturer_code' | 'source_product_id' | null {
  if (a.ean && b.ean && a.ean !== b.ean) return 'ean';
  if (
    a.manufacturerCode &&
    b.manufacturerCode &&
    norm(a.manufacturerCode) !== norm(b.manufacturerCode)
  ) {
    return 'manufacturer_code';
  }
  if (
    a.sourceProductId &&
    b.sourceProductId &&
    norm(a.sourceProductId) !== norm(b.sourceProductId)
  ) {
    return 'source_product_id';
  }
  return null;
}

const KEY_LABEL: Record<'ean' | 'manufacturer_code' | 'source_product_id', string> = {
  ean: 'EAN',
  manufacturer_code: 'Kod producenta',
  source_product_id: 'ID produktu źródłowego',
};

export interface IntimportDedupOptions {
  /**
   * Identity keys the catalogue already holds — EANs as `ean:<digits>` and
   * fallback identities verbatim. A row matching one of these is a reuse, not a
   * creation, which is what makes a second import of the same file idempotent.
   */
  knownIdentities?: ReadonlySet<string>;
}

export function planIntimportDedup(
  candidates: readonly IntimportCandidate[],
  options: IntimportDedupOptions = {},
): IntimportDedupPlan {
  const known = options.knownIdentities ?? new Set<string>();
  const rows: IntimportDedupRow[] = [];
  const counts: Record<IntimportRowClass, number> = {
    NEW_CANONICAL_PRODUCT: 0,
    EXISTING_CANONICAL_REUSE: 0,
    EXACT_DUPLICATE: 0,
    IDENTITY_COLLISION_RESOLVED_AS_DISTINCT: 0,
    POSSIBLE_DUPLICATE_REVIEW: 0,
    IDENTITY_CONFLICT: 0,
  };

  // Rows already accepted in this file, indexed by each key they can be found by.
  const byEan = new Map<string, IntimportDedupRow>();
  const byCode = new Map<string, IntimportDedupRow>();
  const bySourceId = new Map<string, IntimportDedupRow>();
  const byCanonical = new Map<string, IntimportDedupRow[]>();

  for (const candidate of candidates) {
    const identity = identityOf(candidate);
    const row: IntimportDedupRow = {
      rowIndex: candidate.rowIndex,
      displayName: candidate.displayName,
      identity,
      classification: 'NEW_CANONICAL_PRODUCT',
      reason: 'Nowy produkt kanoniczny',
      relatedRowIndex: null,
      forceDistinct: false,
    };

    // 1. A strong key agreeing with an earlier row: the same product, twice.
    const strongTwin =
      (identity.ean ? byEan.get(identity.ean) : undefined) ??
      (identity.manufacturerCode ? byCode.get(norm(identity.manufacturerCode)) : undefined) ??
      (identity.sourceProductId ? bySourceId.get(norm(identity.sourceProductId)) : undefined);

    if (strongTwin) {
      const agreement = strongKeyAgreement(identity, strongTwin.identity);
      const sameProduct = identity.canonicalIdentity === strongTwin.identity.canonicalIdentity;
      if (agreement && sameProduct) {
        row.classification = 'EXACT_DUPLICATE';
        row.reason = `ten sam ${KEY_LABEL[agreement]} i ta sama tożsamość co wiersz ${strongTwin.rowIndex}`;
      } else {
        // The same strong key on two different products is a source problem. It
        // is never resolved by guessing which one is right.
        row.classification = 'IDENTITY_CONFLICT';
        row.reason = agreement
          ? `ten sam ${KEY_LABEL[agreement]} co wiersz ${strongTwin.rowIndex}, ale inna tożsamość produktu`
          : `sprzeczne klucze tożsamości względem wiersza ${strongTwin.rowIndex}`;
      }
      row.relatedRowIndex = strongTwin.rowIndex;
      counts[row.classification] += 1;
      rows.push(row);
      continue;
    }

    // 2. The catalogue's fallback identity collides with an earlier row.
    const collisions = byCanonical.get(identity.canonicalIdentity);
    if (collisions && collisions.length > 0) {
      const first = collisions[0]!;
      const disagreement = strongKeyDisagreement(identity, first.identity);
      if (disagreement) {
        // Proven different by a stronger key. The fallback fingerprint does not
        // get to overrule that, so this row must be written as its own product.
        row.classification = 'IDENTITY_COLLISION_RESOLVED_AS_DISTINCT';
        row.reason = `ta sama tożsamość zapasowa co wiersz ${first.rowIndex}, ale inny ${KEY_LABEL[disagreement]} — to inny produkt`;
        row.forceDistinct = true;
      } else {
        // Same fingerprint and no stronger key either way: a human decides.
        row.classification = 'POSSIBLE_DUPLICATE_REVIEW';
        row.reason = `ta sama tożsamość zapasowa co wiersz ${first.rowIndex} i brak mocniejszego klucza, który by je rozróżnił`;
      }
      row.relatedRowIndex = first.rowIndex;
      collisions.push(row);
      if (identity.ean) byEan.set(identity.ean, row);
      if (identity.manufacturerCode) byCode.set(norm(identity.manufacturerCode), row);
      if (identity.sourceProductId) bySourceId.set(norm(identity.sourceProductId), row);
      counts[row.classification] += 1;
      rows.push(row);
      continue;
    }

    // 3. Already in the catalogue from an earlier import → reuse, not creation.
    const eanKey = identity.ean ? `ean:${identity.ean}` : null;
    if ((eanKey && known.has(eanKey)) || known.has(identity.canonicalIdentity)) {
      row.classification = 'EXISTING_CANONICAL_REUSE';
      row.reason = 'tożsamość już istnieje w katalogu — ponowne użycie, nie tworzenie';
    }

    if (identity.ean) byEan.set(identity.ean, row);
    if (identity.manufacturerCode) byCode.set(norm(identity.manufacturerCode), row);
    if (identity.sourceProductId) bySourceId.set(norm(identity.sourceProductId), row);
    byCanonical.set(identity.canonicalIdentity, [row]);
    counts[row.classification] += 1;
    rows.push(row);
  }

  const totalAccounted = (Object.values(counts) as number[]).reduce((sum, n) => sum + n, 0);
  return { rows, counts, totalInput: candidates.length, totalAccounted };
}
