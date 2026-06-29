/**
 * Pure source-ranking + conflict-detection for product enrichment. When the same field is
 * offered by several sources (producer tech sheet, official producer page, retailer catalog,
 * barcode DB, public composition DB, weak/unknown), this decides which value wins, flags
 * conflicts, and lowers confidence accordingly — WITHOUT silently overwriting a stronger
 * source with a weaker one, and without ever calling out (no network here — interfaces only).
 *
 *   - PURE: no DB, no service, no network, no secrets, no IO. Deterministic.
 *   - HONEST: a higher-priority source always wins; disagreement between sources lowers
 *     confidence and is recorded; an empty input resolves to null at zero confidence.
 */

/** Source kinds in descending trust order. */
export type EnrichmentSource =
  | 'producer_tech_sheet'
  | 'producer_official'
  | 'retailer'
  | 'barcode_db'
  | 'public_composition_db'
  | 'weak';

/** Trust weight per source (higher = more trusted). */
export const SOURCE_PRIORITY: Record<EnrichmentSource, number> = {
  producer_tech_sheet: 6,
  producer_official: 5,
  retailer: 4,
  barcode_db: 3,
  public_composition_db: 2,
  weak: 1,
};

/** Base confidence (0..1) contributed by the winning source alone (before conflict penalty). */
const SOURCE_CONFIDENCE: Record<EnrichmentSource, number> = {
  producer_tech_sheet: 0.95,
  producer_official: 0.85,
  retailer: 0.6,
  barcode_db: 0.5,
  public_composition_db: 0.4,
  weak: 0.2,
};

export interface SourcedValue<T> {
  value: T;
  source: EnrichmentSource;
}

export interface FieldResolution<T> {
  value: T | null;
  source: EnrichmentSource | null;
  /** true when two sources offered genuinely different values. */
  conflict: boolean;
  conflict_reasons: string[];
  /** 0..1 internal confidence (never a customer-facing percentage). */
  confidence: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Resolve one field across candidate sourced values. The highest-priority source wins. If a
 * comparably- or higher-trusted *other* source disagrees, that's a conflict: it is recorded
 * and the confidence is penalised. `eq` customises equality (default strict ===; pass a
 * tolerance comparator for numbers). Never overwrites the winner with a weaker source.
 */
export function resolveSourcedField<T>(
  candidates: ReadonlyArray<SourcedValue<T>>,
  eq: (a: T, b: T) => boolean = (a, b) => a === b,
): FieldResolution<T> {
  if (candidates.length === 0) {
    return { value: null, source: null, conflict: false, conflict_reasons: [], confidence: 0 };
  }
  // winner = highest-priority source (stable: first wins on a tie).
  const winner = candidates.reduce((best, c) =>
    SOURCE_PRIORITY[c.source] > SOURCE_PRIORITY[best.source] ? c : best,
  );

  const conflict_reasons: string[] = [];
  for (const c of candidates) {
    if (c === winner) continue;
    if (!eq(c.value, winner.value)) {
      conflict_reasons.push(
        `${c.source} (${String(c.value)}) disagrees with ${winner.source} (${String(winner.value)})`,
      );
    }
  }
  const conflict = conflict_reasons.length > 0;
  // confidence: winner's base, minus a penalty per conflicting source (more painful when the
  // disagreeing source is comparably trusted), floored at 0.1 when there is any value.
  let confidence = SOURCE_CONFIDENCE[winner.source];
  for (const c of candidates) {
    if (c === winner || eq(c.value, winner.value)) continue;
    const closeness = SOURCE_PRIORITY[c.source] / SOURCE_PRIORITY[winner.source];
    confidence -= 0.15 * closeness;
  }
  confidence = Math.max(0.1, Math.min(1, confidence));

  return { value: winner.value, source: winner.source, conflict, conflict_reasons, confidence: round2(confidence) };
}

/** A numeric equality with absolute tolerance (pp) — for composition fields. */
export const withinTolerance = (tol: number) => (a: number, b: number): boolean => Math.abs(a - b) <= tol;
