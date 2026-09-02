/**
 * XLSX → INTIMPORT input adapter.
 *
 * An owner should not have to re-save their catalogue as CSV before importing
 * it. This is ONLY an input adapter: a workbook is turned into exactly the CSV
 * text the existing 36-column parser already reads, and everything downstream —
 * validation, Product Intelligence, the Mapper, dedup and the import itself —
 * runs unchanged and cannot tell which format it came from.
 *
 * Pure: no IO, no network. The caller supplies the bytes.
 */
import * as xlsx from 'xlsx';
import { INTIMPORT_COLUMNS } from './intimport';
import {
  parseOwnerProductClassification,
  type OwnerProductClassification,
} from '@/features/product-intelligence/ownerProductClassification';

export const OWNER_SEMANTIC_SHEET = '14_SEMANTIC_CLASSIFICATION';
const OWNER_MASTER_SHEET = '01_PRODUCTS_MASTER';
export const OWNER_SEMANTIC_POPULATION = 731;

/**
 * The floor for a sheet to be an INTIMPORT sheet at all. Deliberately low: it
 * only has to exclude the neighbouring sheets that share a handful of generic
 * columns (Offers, Evidence, Stores each carry 3-4).
 *
 * WHICH sheet is then chosen is decided by COVERAGE rather than by this number,
 * because a threshold is guesswork the moment a workbook changes shape. The
 * owner's own file makes the point: „Products" carries all 36 canonical
 * headers and the partial „Import View" carries 23, so the winner is obvious by
 * comparison and would be a coin-toss under any fixed cut-off near 20.
 */
const REQUIRED_HEADER_MATCHES = 12;

const normalizeHeader = (value: unknown): string =>
  String(value ?? '')
    .replace(/\uFEFF/g, '')
    .trim()
    .toLowerCase();

const CANONICAL_HEADERS = new Set(INTIMPORT_COLUMNS.map((column) => normalizeHeader(column)));

/** The recognised INTIMPORT headers present in a sheet's first row. */
export function intimportHeaderMatches(sheet: xlsx.WorkSheet): number {
  const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  const header = rows[0];
  if (!Array.isArray(header)) return 0;
  const seen = new Set<string>();
  for (const cell of header) {
    const name = normalizeHeader(cell);
    if (CANONICAL_HEADERS.has(name)) seen.add(name);
  }
  return seen.size;
}

export interface IntimportWorkbookSheets {
  /** Sheets carrying the INTIMPORT header row, best match first. */
  candidates: string[];
  /** The best candidate covers strictly more of the schema than any other. */
  bestIsUnambiguous: boolean;
  /** Every sheet in the workbook, for a selector. */
  all: string[];
}

const objectRows = (sheet: xlsx.WorkSheet, headerRow: number): Record<string, unknown>[] => {
  const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    raw: true,
  });
  const headers = (rows[headerRow - 1] ?? []).map((cell) => String(cell ?? '').trim());
  return rows.slice(headerRow).flatMap((row) => {
    if (
      !Array.isArray(row) ||
      row.every((cell) => cell === null || cell === undefined || cell === '')
    ) {
      return [];
    }
    return [Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null]))];
  });
};

const joinedText = (...values: unknown[]): string | null => {
  const entries = values
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .map((value) => value.trim());
  return entries.length > 0 ? entries.join(' | ') : null;
};

const masterToIntimport = (master: Record<string, unknown>): Record<string, unknown> => ({
  'Product ID': master.source_product_id,
  'Country Code': master.market_country_code,
  Category: master.source_category,
  Subcategory: master.source_subcategory,
  'Product Type': master.product_type ?? master.source_product_type,
  Brand: master.brand,
  'Product Name Original': master.product_name_original,
  'Product Name English': master.product_name_english,
  'Variant Original': master.variant_original,
  'Variant English': master.variant_english,
  Manufacturer: master.manufacturer,
  'Net Quantity Value': master.total_net_quantity_value ?? master.unit_quantity_value,
  'Net Quantity Unit': master.total_net_quantity_unit ?? master.unit_quantity_unit,
  'Package Count': master.package_count,
  'Ingredients Original': master.ingredients_original,
  'Ingredients English': master.ingredients_english,
  Allergens: master.allergens,
  'Nutrition Basis': master.nutrition_basis_normalized ?? master.nutrition_basis_raw,
  'Energy kJ': master.energy_kj,
  'Energy kcal': master.energy_kcal,
  'Fat g': master.fat_g,
  'Saturated Fat g': master.saturated_fat_g,
  'Carbohydrates g': master.carbohydrates_g,
  'Sugars g': master.sugars_g,
  'Fibre g': master.fibre_g,
  'Protein g': master.protein_g,
  'Salt g': master.salt_g,
  'EAN / GTIN': master.ean_gtin,
  'Country of Origin': master.country_of_origin,
  'Professional Dosage': master.dosage_raw,
  'Technical Parameters': joinedText(
    typeof master.manufacturer_product_code === 'string'
      ? `Kod producenta: ${master.manufacturer_product_code}`
      : null,
    master.usage_instructions,
  ),
  'Technical PDF URL': master.technical_pdf_url,
  'Primary Source URL': master.primary_source_url,
  'Product Status': master.source_record_status,
  'Checked At': master.checked_at ?? master.source_checked_at,
  Notes: joinedText(master.notes, master.source_notes),
});

export interface OwnerClassifiedWorkbookInput {
  csv: string;
  sheet: typeof OWNER_SEMANTIC_SHEET;
  population: number;
  ownerClassifications: OwnerProductClassification[];
}

/** Join the owner's retained semantic population to its full evidence rows.
 * The semantic sheet decides membership/order (731), while the master supplies
 * existing facts. No row from the discarded 820 population can leak in. */
export function ownerClassifiedWorkbookToInput(
  workbook: xlsx.WorkBook,
): OwnerClassifiedWorkbookInput {
  const semanticSheet = workbook.Sheets[OWNER_SEMANTIC_SHEET];
  const masterSheet = workbook.Sheets[OWNER_MASTER_SHEET];
  if (!semanticSheet || !masterSheet) {
    throw new Error(
      `Arkusz ${OWNER_SEMANTIC_SHEET} wymaga sąsiedniego arkusza ${OWNER_MASTER_SHEET}.`,
    );
  }
  const semanticRows = objectRows(semanticSheet, 2);
  if (semanticRows.length !== OWNER_SEMANTIC_POPULATION) {
    throw new Error(
      `Arkusz ${OWNER_SEMANTIC_SHEET} ma ${semanticRows.length} produktów; wymagane jest dokładnie ${OWNER_SEMANTIC_POPULATION}.`,
    );
  }
  const masterRows = objectRows(masterSheet, 1);
  const masterById = new Map(
    masterRows.flatMap((row) => {
      const id = typeof row.source_product_id === 'string' ? row.source_product_id.trim() : '';
      return id ? [[id, row] as const] : [];
    }),
  );
  const seen = new Set<string>();
  const ownerClassifications: OwnerProductClassification[] = [];
  const importRows: Record<string, unknown>[] = [];
  for (const semantic of semanticRows) {
    const owner = parseOwnerProductClassification(semantic);
    if (!owner) throw new Error('Nieprawidłowy wiersz właścicielskiej klasyfikacji semantycznej.');
    if (seen.has(owner.sourceProductId)) {
      throw new Error(
        `Duplikat source_product_id w ${OWNER_SEMANTIC_SHEET}: ${owner.sourceProductId}`,
      );
    }
    seen.add(owner.sourceProductId);
    const master = masterById.get(owner.sourceProductId);
    if (!master) throw new Error(`Brak danych źródłowych dla ${owner.sourceProductId}.`);
    ownerClassifications.push(owner);
    importRows.push(masterToIntimport(master));
  }
  const sheet = xlsx.utils.json_to_sheet(importRows, {
    header: [...INTIMPORT_COLUMNS],
    skipHeader: false,
  });
  return {
    csv: xlsx.utils.sheet_to_csv(sheet, { blankrows: false, rawNumbers: true }),
    sheet: OWNER_SEMANTIC_SHEET,
    population: importRows.length,
    ownerClassifications,
  };
}

export function intimportWorkbookSheets(data: ArrayBuffer | Uint8Array): IntimportWorkbookSheets {
  const workbook = xlsx.read(data, { type: 'array' });
  if (workbook.Sheets[OWNER_SEMANTIC_SHEET] && workbook.Sheets[OWNER_MASTER_SHEET]) {
    return {
      candidates: [OWNER_SEMANTIC_SHEET],
      bestIsUnambiguous: true,
      all: workbook.SheetNames,
    };
  }
  const scored = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    return { name, matches: sheet ? intimportHeaderMatches(sheet) : 0 };
  });
  const ranked = scored
    .filter((entry) => entry.matches >= REQUIRED_HEADER_MATCHES)
    .sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name));
  return {
    candidates: ranked.map((entry) => entry.name),
    // A single best sheet is not a guess: it carries strictly more of the
    // schema than anything else in the book. Only a TIE is ambiguous.
    bestIsUnambiguous:
      ranked.length > 0 && (ranked.length === 1 || ranked[0]!.matches > ranked[1]!.matches),
    all: workbook.SheetNames,
  };
}

export class IntimportSheetAmbiguousError extends Error {
  constructor(readonly sheets: string[]) {
    super(`Wybierz arkusz: ${sheets.join(', ')}`);
    this.name = 'IntimportSheetAmbiguousError';
  }
}

/**
 * The workbook as canonical INTIMPORT CSV.
 *
 * Numbers are emitted RAW, not as the sheet displays them. A cell holding 14
 * displays as „14.00" under a two-decimal format, and package size is part of
 * the catalogue's canonical identity — so display formatting would make the
 * same product a different product depending on which file it arrived in, and
 * a re-import would duplicate the catalogue rather than reuse it. On the
 * owner's file that was 788 rows: „14.00 g × 1.00" against „14 g".
 *
 * When several sheets carry the INTIMPORT headers this REFUSES to guess and
 * asks the caller to choose.
 */
export function intimportWorkbookToCsv(
  data: ArrayBuffer | Uint8Array,
  sheetName?: string,
): {
  csv: string;
  sheet: string;
  candidates: string[];
  ownerClassifications: OwnerProductClassification[];
} {
  const workbook = xlsx.read(data, { type: 'array' });
  const { candidates, bestIsUnambiguous, all } = intimportWorkbookSheets(data);

  let chosen = sheetName;
  if (!chosen) {
    if (bestIsUnambiguous) chosen = candidates[0];
    else if (candidates.length > 1) throw new IntimportSheetAmbiguousError(candidates);
    else if (all.length === 1) chosen = all[0];
    else throw new IntimportSheetAmbiguousError(all);
  }

  if (chosen === OWNER_SEMANTIC_SHEET) {
    const classified = ownerClassifiedWorkbookToInput(workbook);
    return { ...classified, candidates };
  }

  const sheet = workbook.Sheets[chosen!];
  if (!sheet) throw new Error(`Arkusz „${chosen}" nie istnieje w tym pliku.`);
  const csv = xlsx.utils.sheet_to_csv(sheet, { blankrows: false, rawNumbers: true });
  return { csv, sheet: chosen!, candidates, ownerClassifications: [] };
}

/** True when the file should be read as a workbook rather than as text. */
export function isWorkbookFile(name: string, type?: string): boolean {
  return (
    /\.xlsx$/i.test(name) ||
    /\.xlsm$/i.test(name) ||
    type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}
