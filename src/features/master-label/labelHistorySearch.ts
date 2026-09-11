/**
 * §40 — finding a label you already printed.
 *
 * One field, two things people actually remember: what the ice cream was called
 * and the LOT on the tub. Both match on a FRAGMENT, because someone reading a
 * lot code off a frosted label types the part they can still make out, and both
 * ignore case and surrounding whitespace.
 *
 * Deliberately plain: this searches the records the signed-in user already has
 * in front of them. No AI, no Mapper, no network — those answer a different
 * question ("what product is this?"), and asking them here would make a local
 * lookup slow, chargeable and occasionally wrong.
 */
import type { MasterLabelData } from './masterLabel';

export interface LabelHistoryRecord {
  readonly snapshotId: string;
  readonly label: Pick<MasterLabelData, 'productName' | 'legalProductName' | 'lotCode'>;
}

/** Every name a label carries, in every language it was rendered in. */
function searchableNames(label: LabelHistoryRecord['label']): string[] {
  return [...Object.values(label.productName ?? {}), ...Object.values(label.legalProductName ?? {})]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/**
 * Fold to a comparable form: case-insensitive, and accent-insensitive so
 * „truskawka" is found by someone who typed it without the Polish keyboard.
 * `NFD` + combining-mark strip is the standard fold and needs no table.
 */
const fold = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** True when this record answers the query. An empty query matches everything. */
export function labelHistoryMatches(record: LabelHistoryRecord, query: string): boolean {
  const needle = fold(query);
  if (needle.length === 0) return true;
  const lot = fold(record.label.lotCode ?? '');
  if (lot.length > 0 && lot.includes(needle)) return true;
  return searchableNames(record.label).some((name) => fold(name).includes(needle));
}

/** The visible history, filtered. Order is preserved — newest stays newest. */
export function filterLabelHistory<T extends LabelHistoryRecord>(
  records: readonly T[],
  query: string,
): T[] {
  return records.filter((record) => labelHistoryMatches(record, query));
}
