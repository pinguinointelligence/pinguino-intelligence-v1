/**
 * Shared Mapper Base loader for the local dry runs.
 *
 * Reads the immutable CSV straight from disk and recomputes its sha256 every
 * time, so a run against a changed Mapper shows up in the report instead of
 * passing silently against a stale hard-coded fingerprint.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MapperKnowledgeRow } from '../mapperValueInference';
import { WORKING_NUMERIC_FIELDS, type WorkingNumericField } from '../productFieldTruth';

export const MAPPER_FILE = resolve(
  __dirname,
  '../../../../docs/ingredients/validation/mapper_basement.csv',
);

/** RFC-4180-ish parser: quotes, escaped quotes, embedded commas, CRLF, BOM. */
function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      /* ignore */
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const num = (value: string | undefined): number | null => {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export function loadMapperKnowledgeRows(): { rows: MapperKnowledgeRow[]; fingerprint: string } {
  const raw = readFileSync(MAPPER_FILE);
  const fingerprint = createHash('sha256').update(raw).digest('hex');
  const table = parseCsv(raw.toString('utf8'));
  const header = table[0] ?? [];
  const at = (row: string[], column: string): string | undefined => {
    const index = header.indexOf(column);
    return index === -1 ? undefined : row[index];
  };
  const rows: MapperKnowledgeRow[] = table.slice(1)
    .filter((row) => row.length >= header.length - 2 && (at(row, 'ingredient_id') ?? '') !== '')
    .map((row) => {
      const numericFields = Object.fromEntries(
        WORKING_NUMERIC_FIELDS.map((field) => [field, num(at(row, field))]),
      ) as Record<WorkingNumericField, number | null>;
      return {
        ingredient_id: at(row, 'ingredient_id') ?? '',
        ingredient_name_internal: at(row, 'ingredient_name_internal') ?? '',
        ingredient_name_display: at(row, 'ingredient_name_display') ?? null,
        brand: at(row, 'brand') ?? null,
        ingredient_category: at(row, 'ingredient_category') ?? null,
        ingredient_subcategory: at(row, 'ingredient_subcategory') ?? null,
        is_active: (at(row, 'is_active') ?? 'true').trim().toLowerCase() !== 'false',
        approved_for_base: (at(row, 'approved_for_base') ?? 'false').trim().toLowerCase() === 'true',
        approved_for_engines: (at(row, 'approved_for_engines') ?? 'false').trim().toLowerCase() === 'true',
        verification_status: at(row, 'verification_status') ?? null,
        ean_code: at(row, 'ean_code') ?? null,
        ...numericFields,
      };
    });
  return { rows, fingerprint };
}
