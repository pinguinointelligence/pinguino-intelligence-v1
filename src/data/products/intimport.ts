/**
 * INTIMPORT — the official Gellatti bulk CSV format (36 fixed columns).
 *
 * A DEDICATED, DETERMINISTIC parser for one owner-controlled contract; deliberately NOT a
 * universal spreadsheet guesser. It reuses the existing pure primitives (parseCsv, the
 * barcode checksum authority, the category mapping) and feeds the SAME canonical product
 * identity the Scanner feeds — there is no INTIMPORT-only product database.
 *
 *   • PURE — no DB, no network, no AI, no file IO, no paid enrichment. Deterministic.
 *     Parse/preview is free by construction: nothing here can trigger a paid call.
 *   • HONEST — `not_found` / `not_applicable` / blank mean UNKNOWN, never 0. A real 0
 *     stays 0. EAN/GTIN stays a STRING (leading zeros preserved). Nothing is dropped:
 *     all 36 official fields are retained as source evidence even when the product UI
 *     exposes no field for them.
 *   • SAFE — source `Product Status` is metadata, never Engine/Production authority.
 */
import { parseCsv } from '@/lib/csv';
import { mapDatasetCategory } from '@/data/ingredients/categoryMapping';
import { validateBarcode, barcodeLookupCandidates } from '@/features/product-scanner/barcode';
import { parseNumeric } from '@/data/products/productTableParser';
import type { ProductInsert } from '@/data/products/productRow';

/** The official 36-column contract, in official order. These names ARE the contract. */
export const INTIMPORT_COLUMNS = [
  'Product ID',
  'Country Code',
  'Category',
  'Subcategory',
  'Product Type',
  'Brand',
  'Product Name Original',
  'Product Name English',
  'Variant Original',
  'Variant English',
  'Manufacturer',
  'Net Quantity Value',
  'Net Quantity Unit',
  'Package Count',
  'Ingredients Original',
  'Ingredients English',
  'Allergens',
  'Nutrition Basis',
  'Energy kJ',
  'Energy kcal',
  'Fat g',
  'Saturated Fat g',
  'Carbohydrates g',
  'Sugars g',
  'Fibre g',
  'Protein g',
  'Salt g',
  'EAN / GTIN',
  'Country of Origin',
  'Professional Dosage',
  'Technical Parameters',
  'Technical PDF URL',
  'Primary Source URL',
  'Product Status',
  'Checked At',
  'Notes',
] as const;

export type IntimportColumn = (typeof INTIMPORT_COLUMNS)[number];

/** Evidence/quality state of one parsed row. */
export type IntimportRowState =
  | 'EXISTING'
  | 'READY'
  | 'ENRICHMENT_REQUIRED'
  | 'REVIEW_REQUIRED'
  | 'INVALID'
  | 'DUPLICATE';

/** Explicit "we looked and there is no value" markers. All mean UNKNOWN — never 0. */
const MISSING_TOKENS = new Set([
  '',
  'not_found',
  'not found',
  'not_applicable',
  'not applicable',
  'n/a',
  'na',
  'null',
  'none',
  'unknown',
  'nieznane',
  'brak',
  '-',
  '—',
]);

/** true when a raw cell explicitly carries no value. */
export function isMissingValue(raw: string | null | undefined): boolean {
  return raw == null || MISSING_TOKENS.has(raw.trim().toLowerCase());
}

/** A present cell trimmed, or null when the cell explicitly carries no value. */
export function intimportText(raw: string | null | undefined): string | null {
  return isMissingValue(raw) ? null : raw!.trim();
}

/**
 * Numeric cell. An explicit missing marker is UNKNOWN and is NOT a parser error (it
 * produces no warning); a real `0` stays `0`; unparseable text warns and stays null.
 */
export function intimportNumber(raw: string | null | undefined): {
  value: number | null;
  warning: string | null;
} {
  if (isMissingValue(raw)) return { value: null, warning: null };
  return parseNumeric(raw);
}

/** Per-100 g and per-100 ml are different bases; only per-100 g maps to the g-based fields. */
export type IntimportNutritionBasis = 'per_100g' | 'per_100ml' | null;

/** Normalize the free-text basis cell ("100 g", "W 100 g", "per 100 g", "100 ml", …). */
export function normalizeNutritionBasis(raw: string | null | undefined): IntimportNutritionBasis {
  const text = intimportText(raw);
  if (!text) return null;
  const compact = text.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (compact.includes('100ml')) return 'per_100ml';
  if (compact.includes('100g')) return 'per_100g';
  return null;
}

export interface IntimportCandidate {
  /** 1-based data-row number as the owner sees it in the spreadsheet. */
  rowIndex: number;
  state: IntimportRowState;
  /** Source "Product ID" — provenance only, never a Gellatti identity. */
  sourceProductId: string | null;
  countryCode: string | null;
  displayName: string | null;
  /** Checksum-valid GTIN digits, or null when absent/invalid. */
  ean: string | null;
  /** Exactly what the CSV held, preserved verbatim (leading zeros included). */
  eanRaw: string | null;
  sourceCategory: string | null;
  sourceSubcategory: string | null;
  nutritionBasis: IntimportNutritionBasis;
  insert: ProductInsert;
  /** All 36 official fields, sentinel-normalized. Nothing is thrown away. */
  source: Record<IntimportColumn, string | null>;
  warnings: string[];
  /** Why this row landed in its state, in owner-readable terms. */
  reasons: string[];
  /** Row number of the earlier row this duplicates, when state is DUPLICATE. */
  duplicateOfRow: number | null;
  /** Canonical product this row already exists as, when state is EXISTING. */
  existingProductId: string | null;
}

/**
 * The canonical products this file is compared against. Supplied by the caller so the
 * parser stays pure: Mapper canonical identity, Live Overlay and imported products all
 * resolve through the same two lookups.
 */
export interface IntimportExistingIndex {
  /** Canonical product id for any equivalent GTIN form, or null. */
  byBarcode?: (lookupValues: readonly string[]) => string | null;
  /** Canonical product id for a deterministic identity key, or null. */
  byIdentity?: (identityKey: string) => string | null;
}

export interface IntimportSummary {
  rows: number;
  countries: string[];
  uniqueProducts: number;
  existing: number;
  duplicates: number;
  ready: number;
  enrichmentRequired: number;
  reviewRequired: number;
  invalid: number;
}

export interface IntimportResult {
  format: 'INTIMPORT';
  headerOk: boolean;
  missingColumns: IntimportColumn[];
  /** Columns present in the file that are not part of the official contract. */
  unexpectedColumns: string[];
  summary: IntimportSummary;
  candidates: IntimportCandidate[];
}

/**
 * Canonical GTIN key. EAN-8, UPC-A and EAN-13 are the same code padded differently, so
 * every form is left-padded to 14 digits before comparison — "049000028911" and
 * "0049000028911" are one product, not two.
 */
export function canonicalGtin(digits: string): string {
  return digits.padStart(14, '0');
}

/** Deterministic identity for a row with no usable barcode: brand + name + variant + size. */
export function intimportIdentityKey(parts: {
  brand: string | null;
  name: string | null;
  variant: string | null;
  netQuantity: string | null;
  unit: string | null;
}): string {
  const norm = (value: string | null): string =>
    (value ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return [
    norm(parts.brand),
    norm(parts.name),
    norm(parts.variant),
    norm(parts.netQuantity),
    norm(parts.unit),
  ].join('|');
}

/** Nutrition columns that map to the per-100 g product fields. */
const NUTRITION_FIELDS: readonly (readonly [IntimportColumn, keyof ProductInsert])[] = [
  ['Energy kcal', 'kcal_per_100g'],
  ['Fat g', 'fat_percent'],
  ['Saturated Fat g', 'saturated_fat_percent'],
  ['Carbohydrates g', 'carbohydrate_percent'],
  ['Sugars g', 'total_sugars_percent'],
  ['Fibre g', 'fiber_percent'],
  ['Protein g', 'protein_percent'],
  ['Salt g', 'salt_percent'],
];

/** Core fields an owner needs before a product is usable without enrichment. */
const CORE_NUTRITION: readonly IntimportColumn[] = [
  'Energy kcal',
  'Fat g',
  'Carbohydrates g',
  'Protein g',
];

function assign(insert: ProductInsert, field: keyof ProductInsert, value: unknown): void {
  (insert as Record<string, unknown>)[field] = value;
}

/** Map one official INTIMPORT row. Pure; performs no lookups and no writes. */
/**
 * The canonical product name: the source name, plus the source's own variant when
 * the name does not already carry it.
 *
 * Three name concepts stay distinct — RAW is the untouched source column (kept in
 * `source`), CANONICAL/DISPLAY is this, and the English name remains available as
 * `product_name_internal`. This composes only text the file already supplied, so a
 * product's meaning is preserved rather than reinterpreted.
 */
export function canonicalProductName(name: string | null, variant: string | null): string | null {
  if (!name || !variant) return name;
  const needle = variant.toLowerCase().trim();
  if (!needle || name.toLowerCase().includes(needle)) return name;
  return `${name} ${variant}`;
}

export function mapIntimportRow(row: Record<string, string>, rowIndex: number): IntimportCandidate {
  const source = {} as Record<IntimportColumn, string | null>;
  for (const column of INTIMPORT_COLUMNS) source[column] = intimportText(row[column]);

  const warnings: string[] = [];
  const reasons: string[] = [];
  const insert: ProductInsert = {};

  // ── identity ────────────────────────────────────────────────────────────────
  const nameOriginal = source['Product Name Original'];
  const nameEnglish = source['Product Name English'];
  // A row has a valid name when EITHER language column carries one. Original is the
  // preferred display; English is a genuine fallback, never a "missing name".
  const rawName = nameOriginal ?? nameEnglish;
  // Commercial identity includes the variant. The catalogue's non-EAN identity is
  // brand + name + package size, so a name that drops the variant silently merges
  // genuinely different products — "Twaróg klinek Delikate" chudy / półtłusty /
  // tłusty are three formulations, not one. Only 57 of the Polish file's 820 rows
  // carry an EAN, so the name is what keeps the other 763 apart.
  //
  // The variant is appended in the SOURCE's own words: this restates identity, it
  // never invents or reinterprets it. Skipped when the name already carries the
  // variant, so nothing is said twice.
  const variant = source['Variant Original'] ?? source['Variant English'];
  const displayName = canonicalProductName(rawName, variant);
  if (displayName) assign(insert, 'product_name_display', displayName);
  if (nameEnglish && nameEnglish !== displayName) {
    assign(insert, 'product_name_internal', nameEnglish);
  }

  const brand = source.Brand;
  if (brand) assign(insert, 'brand', brand);
  if (source.Manufacturer) assign(insert, 'supplier', source.Manufacturer);
  if (source['Country Code']) assign(insert, 'country', source['Country Code']);

  // ── category: preserved as source truth, mapped only where a mapping exists ──
  const sourceCategory = source.Category;
  const sourceSubcategory = source.Subcategory;
  if (sourceSubcategory) assign(insert, 'product_subcategory', sourceSubcategory);
  if (sourceCategory) {
    const mapped = mapDatasetCategory(sourceCategory);
    assign(insert, 'product_category', mapped.category);
    if (!mapped.exact) {
      // An unmapped source category is a review signal, never a reason to destroy a row.
      warnings.push(`category "${sourceCategory}" has no exact mapping — ${mapped.reason}`);
    }
  }

  // ── package ─────────────────────────────────────────────────────────────────
  const netQuantity = source['Net Quantity Value'];
  const netUnit = source['Net Quantity Unit'];
  const packageCount = source['Package Count'];
  const packageSize = [netQuantity, netUnit].filter(Boolean).join(' ').trim();
  if (packageSize) {
    const count = packageCount && packageCount !== '1' ? ` × ${packageCount}` : '';
    assign(insert, 'package_size', `${packageSize}${count}`);
  }

  // ── text evidence ───────────────────────────────────────────────────────────
  if (source['Ingredients Original'])
    assign(insert, 'detected_text', source['Ingredients Original']);
  else if (source['Ingredients English'])
    assign(insert, 'detected_text', source['Ingredients English']);
  if (source.Allergens) assign(insert, 'allergens', source.Allergens);
  if (source['Professional Dosage']) assign(insert, 'usage_notes', source['Professional Dosage']);
  if (source['Technical Parameters'])
    assign(insert, 'engine_notes', source['Technical Parameters']);
  if (source['Primary Source URL']) assign(insert, 'source_url', source['Primary Source URL']);
  if (source['Technical PDF URL']) assign(insert, 'product_url', source['Technical PDF URL']);

  // ── nutrition ───────────────────────────────────────────────────────────────
  const nutritionBasis = normalizeNutritionBasis(source['Nutrition Basis']);
  if (source['Nutrition Basis'] && nutritionBasis === null) {
    warnings.push(`unrecognized nutrition basis "${source['Nutrition Basis']}"`);
  }
  let mappedNutrition = 0;
  for (const [column, field] of NUTRITION_FIELDS) {
    const { value, warning } = intimportNumber(row[column]);
    if (warning) warnings.push(`${column}: ${warning}`);
    if (value === null) continue;
    mappedNutrition += 1;
    // The g-based product fields are defined per 100 g. A per-100 ml declaration is a
    // different basis and is NOT converted here — inventing a density would be a lie.
    if (nutritionBasis === 'per_100g') assign(insert, field, value);
  }
  if (mappedNutrition > 0 && nutritionBasis !== 'per_100g') {
    reasons.push(
      nutritionBasis === 'per_100ml'
        ? 'nutrition declared per 100 ml — needs density before it can be used per 100 g'
        : 'nutrition present without a recognized per-100 g basis',
    );
  }

  // ── EAN / GTIN — a STRING, validated by the existing checksum authority ──────
  const eanRaw = source['EAN / GTIN'];
  let ean: string | null = null;
  if (eanRaw) {
    assign(insert, 'ean_code', eanRaw); // verbatim; leading zeros preserved
    const valid = validateBarcode(eanRaw);
    if (valid) ean = valid.lookupValue;
    else warnings.push(`EAN / GTIN "${eanRaw}" fails checksum — kept, but not used as identity`);
  }

  // INTIMPORT is one ingestion channel into the existing catalog intake surface.
  assign(insert, 'source_type', 'catalog_import');
  assign(insert, 'catalog_source', 'INTIMPORT');

  // Every official field is retained, including those the product UI cannot show.
  assign(insert, 'extracted_json', { intimport: { version: 1, fields: source } });

  // ── state ───────────────────────────────────────────────────────────────────
  let state: IntimportRowState;
  if (!displayName && !brand) {
    state = 'INVALID';
    reasons.push('no product name and no brand — no usable identity');
  } else {
    if (!displayName) reasons.push('missing product name');
    if (!brand) reasons.push('missing brand');
    const missingCore = CORE_NUTRITION.filter((column) => isMissingValue(row[column]));
    const hasIngredients = Boolean(source['Ingredients Original'] ?? source['Ingredients English']);
    if (!hasIngredients) reasons.push('missing ingredients');
    if (missingCore.length > 0) reasons.push(`missing nutrition: ${missingCore.join(', ')}`);
    if (reasons.length === 0) state = 'READY';
    else if (!displayName || !brand) state = 'REVIEW_REQUIRED';
    else state = 'ENRICHMENT_REQUIRED';
  }

  return {
    rowIndex,
    state,
    sourceProductId: source['Product ID'],
    countryCode: source['Country Code'],
    displayName,
    ean,
    eanRaw,
    sourceCategory,
    sourceSubcategory,
    nutritionBasis,
    insert,
    source,
    warnings,
    reasons,
    duplicateOfRow: null,
    existingProductId: null,
  };
}

/**
 * Parse an official INTIMPORT CSV. Deterministic and free: header validation, field
 * parsing, normalization, identity, in-file dedupe and canonical existing-product
 * comparison. NOTHING here performs a paid call.
 */
export function parseINTIMPORT(
  text: string,
  existing: IntimportExistingIndex = {},
): IntimportResult {
  const grid = parseCsv(text);
  const headers = (grid[0] ?? []).map((header) => header.trim());
  const headerSet = new Set(headers);
  const missingColumns = INTIMPORT_COLUMNS.filter((column) => !headerSet.has(column));
  const official = new Set<string>(INTIMPORT_COLUMNS);
  const unexpectedColumns = headers.filter((header) => header !== '' && !official.has(header));
  const headerOk = missingColumns.length === 0 && unexpectedColumns.length === 0;

  const candidates: IntimportCandidate[] = [];
  for (let line = 1; line < grid.length; line += 1) {
    const cells = grid[line] ?? [];
    if (cells.every((cell) => cell.trim() === '')) continue;
    const row: Record<string, string> = {};
    headers.forEach((header, column) => {
      row[header] = cells[column] ?? '';
    });
    candidates.push(mapIntimportRow(row, line));
  }

  // ── deduplication ───────────────────────────────────────────────────────────
  // A: within this file. B: against the canonical Gellatti products. A checksum-valid
  // GTIN is the strongest identity; without one, the deterministic identity key is used.
  // Ambiguity is never fuzzy-merged — it becomes REVIEW_REQUIRED.
  const seenBarcode = new Map<string, number>();
  const seenSourceId = new Map<string, number>();
  const seenIdentity = new Map<string, number>();
  for (const candidate of candidates) {
    if (candidate.state === 'INVALID') continue;

    const lookupValues = candidate.ean
      ? barcodeLookupCandidates({
          value: candidate.ean,
          format:
            candidate.ean.length === 8 ? 'EAN_8' : candidate.ean.length === 12 ? 'UPC_A' : 'EAN_13',
          lookupValue: candidate.ean,
        })
      : [];

    const identityKey = intimportIdentityKey({
      brand: candidate.source.Brand,
      name: candidate.displayName,
      variant: candidate.source['Variant Original'] ?? candidate.source['Variant English'],
      netQuantity: candidate.source['Net Quantity Value'],
      unit: candidate.source['Net Quantity Unit'],
    });

    // A checksum-valid GTIN is the strongest identity; fall back to the deterministic key.
    const byBarcode =
      lookupValues.length > 0 && existing.byBarcode ? existing.byBarcode(lookupValues) : null;
    const existingId = byBarcode ?? (existing.byIdentity ? existing.byIdentity(identityKey) : null);
    if (existingId) {
      candidate.state = 'EXISTING';
      candidate.existingProductId = existingId;
      candidate.reasons.push('already a canonical Gellatti product');
      continue;
    }

    // A checksum-valid GTIN proves sameness outright.
    if (candidate.ean) {
      const key = canonicalGtin(candidate.ean);
      const first = seenBarcode.get(key);
      if (first !== undefined) {
        candidate.state = 'DUPLICATE';
        candidate.duplicateOfRow = first;
        candidate.reasons.push(`same GTIN as row ${first}`);
        continue;
      }
      seenBarcode.set(key, candidate.rowIndex);
      continue;
    }

    // The source's own Product ID repeating is the same source record twice.
    if (candidate.sourceProductId) {
      const first = seenSourceId.get(candidate.sourceProductId);
      if (first !== undefined) {
        candidate.state = 'DUPLICATE';
        candidate.duplicateOfRow = first;
        candidate.reasons.push(`same source Product ID as row ${first}`);
        continue;
      }
      seenSourceId.set(candidate.sourceProductId, candidate.rowIndex);
    }

    // No barcode: only a fully specified identity may claim in-file uniqueness. A key
    // that is mostly empty is too weak to say anything about two rows.
    if (identityKey.replace(/\|/g, '').trim() === '') continue;
    const first = seenIdentity.get(identityKey);
    if (first === undefined) {
      seenIdentity.set(identityKey, candidate.rowIndex);
      continue;
    }
    // Matching brand/name/size with no GTIN is NOT proof of sameness. When the source
    // gave the two rows different Product IDs they may well be distinct variants, so
    // this is escalated for a human instead of being fuzzy-merged away.
    const twin = candidates.find((other) => other.rowIndex === first);
    if (candidate.sourceProductId && twin?.sourceProductId !== candidate.sourceProductId) {
      candidate.state = 'REVIEW_REQUIRED';
      candidate.duplicateOfRow = first;
      candidate.reasons.push(
        `same brand/name/size as row ${first} but a different source Product ID and no GTIN — cannot tell whether these are one product or two variants`,
      );
      continue;
    }
    candidate.state = 'DUPLICATE';
    candidate.duplicateOfRow = first;
    candidate.reasons.push(`same brand/name/size as row ${first} and no GTIN to tell them apart`);
  }

  const count = (state: IntimportRowState): number =>
    candidates.filter((candidate) => candidate.state === state).length;
  const duplicates = count('DUPLICATE');
  const existingCount = count('EXISTING');

  return {
    format: 'INTIMPORT',
    headerOk,
    missingColumns,
    unexpectedColumns,
    summary: {
      rows: candidates.length,
      countries: [
        ...new Set(candidates.map((c) => c.countryCode).filter((c): c is string => Boolean(c))),
      ].sort(),
      uniqueProducts: candidates.length - duplicates,
      existing: existingCount,
      duplicates,
      ready: count('READY'),
      enrichmentRequired: count('ENRICHMENT_REQUIRED'),
      reviewRequired: count('REVIEW_REQUIRED'),
      invalid: count('INVALID'),
    },
    candidates,
  };
}
