/**
 * Pure, dependency-free CSV/delimited parser (RFC-4180-ish).
 *
 * parseCsv(text) -> string[][]: EVERY cell stays a STRING — values are never
 * coerced to numbers, so leading zeros in codes like "0049000028911" survive
 * verbatim. Handles a leading BOM, LF + CRLF (+ lone CR) line endings, quoted
 * cells, commas and newlines INSIDE quotes, and escaped quotes (""). A trailing
 * newline does not emit a spurious empty final row. No file IO, no browser File
 * API, no third-party package.
 */
export function parseCsv(text: string): string[][] {
  // strip a leading UTF-8 BOM if present
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let started = false; // any content seen for the pending record (field/comma/quote)
  const n = input.length;
  let i = 0;

  while (i < n) {
    const ch = input.charAt(i);

    if (inQuotes) {
      if (ch === '"') {
        if (input.charAt(i + 1) === '"') {
          field += '"'; // an escaped quote
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      started = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      started = true;
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input.charAt(i + 1) === '\n') i += 1; // CRLF
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      started = false;
      i += 1;
      continue;
    }

    field += ch;
    started = true;
    i += 1;
  }

  // flush the final pending record (file without a trailing newline)
  if (started || field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
