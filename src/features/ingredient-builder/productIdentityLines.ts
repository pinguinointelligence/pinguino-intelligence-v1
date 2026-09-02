/**
 * The approved two-line product identity (Gellatti V2.1, Recipe §9).
 *
 * The catalog label a product carries is a single canonical string — for
 * example `MILK 3.5% · Milk · Chilled`. The approved preview renders it as two
 * lines: the product NAME on the first, its own qualifier on the second.
 *
 * This is a PRESENTATION split and nothing else. The canonical name is never
 * rewritten, re-cased, persisted or sent anywhere in split form; both halves
 * are derived on render and the full string stays in the DOM for assistive
 * technology and for the hover preview. Nothing here reaches the engine, the
 * Mapper, pricing, the label or persistence.
 */

/** The separator the catalog uses between a product name and its qualifiers. */
const SEPARATOR = '·';

export interface ProductIdentityLines {
  /** First line — the product name. */
  name: string;
  /** Second line — the remaining qualifier, or null when the label has none. */
  qualifier: string | null;
}

export function productIdentityLines(label: string): ProductIdentityLines {
  const raw = label.trim();
  const index = raw.indexOf(SEPARATOR);
  if (index < 0) return { name: raw, qualifier: null };

  const name = raw.slice(0, index).trim();
  const qualifier = raw.slice(index + SEPARATOR.length).trim();
  // A leading separator, or a label that is only a separator, is not a split:
  // the row must never render an empty first line.
  if (name.length === 0) return { name: raw, qualifier: null };
  return { name, qualifier: qualifier.length > 0 ? qualifier : null };
}
