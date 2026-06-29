/**
 * Pure product table parser (Mapper Slice D5C1) — the FIRST step of unified product
 * intake. It turns a parsed table (CSV today; the same shape works for any tabular
 * source) into honest `ProductInsert` candidates. ONE pipeline: customer uploads and
 * Colin/Mercadona catalogs all flow through this same parser — the only difference is
 * the intake `source` (which selects `source_type` and, later, vendor header aliases).
 * There is NO separate Colin system.
 *
 *   • PURE — no DB access, no data-layer client, no services, no engine, no IO, no
 *     file API, no AI, no network, no third-party package. Deterministic.
 *   • HONEST — EAN/barcode stay raw STRINGS (leading zeros preserved, never numbers);
 *     a real numeric 0 stays 0 while a blank/garbage cell becomes NULL (omitted) with
 *     a warning — never a fake 0. Unknown categories map to a canonical bucket WITH a
 *     warning (never silently invented). No npac_value; DB-computed columns
 *     (product_code, ean/barcode normalized) are NEVER mapped (excluded by ProductInsert).
 *
 * Persisting these candidates (createProductWithIdentity, dedupe tallies, optional
 * matching) is the D5C2 import SERVICE — this module performs no writes.
 */
import { parseCsv } from '@/lib/csv';
import { mapDatasetCategory } from '@/data/ingredients/categoryMapping';
import { mapProductSubcategory } from '@/data/products/productSubcategoryMapping';
import type { ProductBooleanOrUnknown, ProductInsert, ProductSourceType } from '@/data/products/productRow';

/** Which intake channel a table arrived through. Selects source_type (and, later,
 * vendor-specific header aliases). NOT a separate system — one parser, many sources. */
export type ProductIntakeSource = 'generic' | 'mercadona' | 'colin';

export type ProductIntakeStatus = 'valid' | 'warning' | 'skip';

export interface ProductIntakeCandidate {
  rowIndex: number;
  status: ProductIntakeStatus;
  /** The mapped insert. For a `skip` row it is informational only (must not be created). */
  insert: ProductInsert;
  warnings: string[];
  skipReason: string | null;
}

export interface ProductIntakeResult {
  total: number;
  valid: number;
  warnings: number;
  skipped: number;
  candidates: ProductIntakeCandidate[];
}

/** Intake source -> the products.source_type it stamps. */
const SOURCE_TYPE_BY_PROFILE: Record<ProductIntakeSource, ProductSourceType> = {
  generic: 'catalog_import',
  mercadona: 'mercadona',
  colin: 'colin_catalog',
};

/** Only fields that exist on ProductInsert can be a mapping target — `keyof ProductInsert`
 * structurally forbids ever mapping a DB-computed column (product_code / normalized EAN). */
type ProductInsertField = keyof ProductInsert;
type FieldKind = 'string' | 'ean' | 'numeric' | 'boolean' | 'category';
interface FieldSpec {
  field: ProductInsertField;
  kind: FieldKind;
}

/**
 * GENERIC canonical-header alias map (keys are normalized headers). Deliberately
 * conservative — it does not guess aggressively. EXTENSION POINT: vendor-specific
 * Mercadona / Colin column names are added here once real sample headers are provided;
 * they map to the SAME ProductInsert fields (no separate code path).
 */
export const HEADER_ALIASES: Record<string, FieldSpec> = {
  // identity
  brand: { field: 'brand', kind: 'string' },
  supplier: { field: 'supplier', kind: 'string' },
  manufacturer: { field: 'supplier', kind: 'string' },
  product_name: { field: 'product_name_display', kind: 'string' },
  name: { field: 'product_name_display', kind: 'string' },
  title: { field: 'product_name_display', kind: 'string' },
  product_name_display: { field: 'product_name_display', kind: 'string' },
  display_name: { field: 'product_name_display', kind: 'string' },
  product_name_internal: { field: 'product_name_internal', kind: 'string' },
  internal_name: { field: 'product_name_internal', kind: 'string' },
  category: { field: 'product_category', kind: 'category' },
  product_category: { field: 'product_category', kind: 'category' },
  subcategory: { field: 'product_subcategory', kind: 'string' },
  product_subcategory: { field: 'product_subcategory', kind: 'string' },
  country: { field: 'country', kind: 'string' },
  origin: { field: 'country', kind: 'string' },
  // codes — verbatim strings (leading zeros preserved)
  ean: { field: 'ean_code', kind: 'ean' },
  ean_code: { field: 'ean_code', kind: 'ean' },
  ean13: { field: 'ean_code', kind: 'ean' },
  gtin: { field: 'ean_code', kind: 'ean' },
  barcode: { field: 'barcode', kind: 'ean' },
  upc: { field: 'barcode', kind: 'ean' },
  // urls / size
  package_size: { field: 'package_size', kind: 'string' },
  package: { field: 'package_size', kind: 'string' },
  pack_size: { field: 'package_size', kind: 'string' },
  size: { field: 'package_size', kind: 'string' },
  net_weight: { field: 'package_size', kind: 'string' },
  format: { field: 'package_size', kind: 'string' },
  source_url: { field: 'source_url', kind: 'string' },
  product_url: { field: 'product_url', kind: 'string' },
  url: { field: 'product_url', kind: 'string' },
  link: { field: 'product_url', kind: 'string' },
  mercadona_url: { field: 'product_url', kind: 'string' },
  // cost — a BARE "price" header is intentionally NOT mapped (D5C4B): it is ambiguous
  // (pack / shelf price vs per-unit) and must never feed cost_per_kg. Map an explicit
  // per-unit header instead: price_per_kg / price_per_kg_l (€/kg or €/L) / cost_per_kg / cost.
  cost_per_kg: { field: 'cost_per_kg', kind: 'numeric' },
  price_per_kg: { field: 'cost_per_kg', kind: 'numeric' },
  price_per_kg_l: { field: 'cost_per_kg', kind: 'numeric' },
  cost: { field: 'cost_per_kg', kind: 'numeric' },
  currency: { field: 'currency', kind: 'string' },
  // nutrition (per 100 g)
  kcal_per_100g: { field: 'kcal_per_100g', kind: 'numeric' },
  kcal: { field: 'kcal_per_100g', kind: 'numeric' },
  kcal_100g: { field: 'kcal_per_100g', kind: 'numeric' },
  calories: { field: 'kcal_per_100g', kind: 'numeric' },
  energy_kcal: { field: 'kcal_per_100g', kind: 'numeric' },
  water: { field: 'water_percent', kind: 'numeric' },
  water_percent: { field: 'water_percent', kind: 'numeric' },
  fat: { field: 'fat_percent', kind: 'numeric' },
  total_fat: { field: 'fat_percent', kind: 'numeric' },
  fat_percent: { field: 'fat_percent', kind: 'numeric' },
  fat_100g: { field: 'fat_percent', kind: 'numeric' },
  saturated_fat: { field: 'saturated_fat_percent', kind: 'numeric' },
  saturates: { field: 'saturated_fat_percent', kind: 'numeric' },
  saturated_fat_percent: { field: 'saturated_fat_percent', kind: 'numeric' },
  sat_fat_100g: { field: 'saturated_fat_percent', kind: 'numeric' },
  protein: { field: 'protein_percent', kind: 'numeric' },
  protein_percent: { field: 'protein_percent', kind: 'numeric' },
  protein_100g: { field: 'protein_percent', kind: 'numeric' },
  carbohydrate: { field: 'carbohydrate_percent', kind: 'numeric' },
  carbohydrates: { field: 'carbohydrate_percent', kind: 'numeric' },
  carbs: { field: 'carbohydrate_percent', kind: 'numeric' },
  carbohydrate_percent: { field: 'carbohydrate_percent', kind: 'numeric' },
  carbs_100g: { field: 'carbohydrate_percent', kind: 'numeric' },
  sugars: { field: 'total_sugars_percent', kind: 'numeric' },
  sugar: { field: 'total_sugars_percent', kind: 'numeric' },
  total_sugars: { field: 'total_sugars_percent', kind: 'numeric' },
  total_sugars_percent: { field: 'total_sugars_percent', kind: 'numeric' },
  sugars_100g: { field: 'total_sugars_percent', kind: 'numeric' },
  solids: { field: 'total_solids_percent', kind: 'numeric' },
  total_solids: { field: 'total_solids_percent', kind: 'numeric' },
  total_solids_percent: { field: 'total_solids_percent', kind: 'numeric' },
  fiber: { field: 'fiber_percent', kind: 'numeric' },
  fibre: { field: 'fiber_percent', kind: 'numeric' },
  fiber_percent: { field: 'fiber_percent', kind: 'numeric' },
  salt: { field: 'salt_percent', kind: 'numeric' },
  salt_percent: { field: 'salt_percent', kind: 'numeric' },
  salt_100g: { field: 'salt_percent', kind: 'numeric' },
  alcohol: { field: 'alcohol_percent', kind: 'numeric' },
  alcohol_percent: { field: 'alcohol_percent', kind: 'numeric' },
  // text
  allergens: { field: 'allergens', kind: 'string' },
  allergen: { field: 'allergens', kind: 'string' },
  ingredients: { field: 'detected_text', kind: 'string' },
  ingredients_text: { field: 'detected_text', kind: 'string' },
  ingredient_list: { field: 'detected_text', kind: 'string' },
  ingredients_key: { field: 'detected_text', kind: 'string' },
  catalog_source: { field: 'catalog_source', kind: 'string' },
  catalog: { field: 'catalog_source', kind: 'string' },
  // tri-state booleans ('true' | 'false' | 'unknown')
  vegan: { field: 'vegan', kind: 'boolean' },
  dairy_free: { field: 'dairy_free', kind: 'boolean' },
  lactose_free: { field: 'dairy_free', kind: 'boolean' },
  gluten_free: { field: 'gluten_free', kind: 'boolean' },
  contains_alcohol: { field: 'contains_alcohol', kind: 'boolean' },
};

/** trim -> lowercase -> collapse any run of non-alphanumerics to a single underscore. */
export function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function resolveHeader(raw: string): FieldSpec | null {
  return HEADER_ALIASES[normalizeHeader(raw)] ?? null;
}

/**
 * Parse a numeric cell HONESTLY. blank -> null (no warning); "0" -> 0 (real zero);
 * "12.5" -> 12.5; EU "12,5" -> 12.5 (a single decimal comma with 1-2 fraction digits);
 * an ambiguous value (mixed . and , , or comma-grouping like "1,234") or non-numeric
 * garbage -> null + warning. Never a fake 0.
 */
export function parseNumeric(raw: string | null | undefined): { value: number | null; warning: string | null } {
  if (raw == null) return { value: null, warning: null };
  const s = raw.trim();
  if (s === '') return { value: null, warning: null };

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    return { value: null, warning: `ambiguous number "${raw}" (mixed "," and "." separators) ignored` };
  }
  let normalized = s;
  if (hasComma) {
    if (/^[+-]?\d+,\d{1,2}$/.test(s)) {
      normalized = s.replace(',', '.'); // unambiguous EU decimal comma
    } else {
      return { value: null, warning: `ambiguous number "${raw}" (unclear thousands/decimal comma) ignored` };
    }
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return { value: null, warning: `non-numeric value "${raw}" ignored` };
  return { value: n, warning: null };
}

/** Parse a tri-state product boolean. Recognizes common variants; blank -> null;
 * unrecognized -> null + warning (never silently coerced). */
export function parseProductBoolean(
  raw: string | null | undefined,
): { value: ProductBooleanOrUnknown | null; warning: string | null } {
  if (raw == null) return { value: null, warning: null };
  const s = raw.trim().toLowerCase();
  if (s === '') return { value: null, warning: null };
  if (['true', 'yes', 'y', '1'].includes(s)) return { value: 'true', warning: null };
  if (['false', 'no', 'n', '0'].includes(s)) return { value: 'false', warning: null };
  if (['unknown', '?', 'na', 'n/a'].includes(s)) return { value: 'unknown', warning: null };
  return { value: null, warning: `unrecognized boolean value "${raw}" ignored` };
}

/** Assign a mapped value to a (compile-time-valid) ProductInsert field. */
function assign(insert: ProductInsert, field: ProductInsertField, value: string | number): void {
  (insert as Record<string, unknown>)[field] = value;
}

/**
 * Map one raw table row (keyed by raw header) to a ProductInsert candidate for the given
 * intake source. Pure + deterministic. Sets source_type from the source profile; never
 * sets a product code or normalized column. A row with no brand AND no product name is a
 * `skip` (no usable identity); a row missing only one of them is a `warning`.
 */
export function mapRowToProductInsert(
  row: Record<string, string>,
  source: ProductIntakeSource = 'generic',
  rowIndex = 0,
): ProductIntakeCandidate {
  const insert: ProductInsert = {};
  const warnings: string[] = [];

  // Assign a mapped value; if two distinct columns target the SAME field, warn rather
  // than silently overwriting (the last non-blank value wins).
  const assignedFields = new Set<ProductInsertField>();
  const setField = (field: ProductInsertField, value: string | number): void => {
    if (assignedFields.has(field)) {
      warnings.push(`duplicate column mapping to "${String(field)}" — keeping the last value`);
    }
    assignedFields.add(field);
    assign(insert, field, value);
  };

  for (const [rawHeader, rawValue] of Object.entries(row)) {
    const value = rawValue ?? '';
    const spec = resolveHeader(rawHeader);
    if (!spec) {
      if (value.trim() !== '') warnings.push(`unknown column "${rawHeader}" ignored`);
      continue;
    }
    switch (spec.kind) {
      case 'string':
      case 'ean': {
        const v = value.trim(); // whitespace only — leading zeros in codes are preserved
        if (v !== '') setField(spec.field, v);
        break;
      }
      case 'numeric': {
        const { value: num, warning } = parseNumeric(value);
        if (warning) warnings.push(`${spec.field}: ${warning}`);
        if (num !== null) setField(spec.field, num);
        break;
      }
      case 'boolean': {
        const { value: b, warning } = parseProductBoolean(value);
        if (warning) warnings.push(`${spec.field}: ${warning}`);
        if (b !== null) setField(spec.field, b);
        break;
      }
      case 'category': {
        const v = value.trim();
        if (v !== '') {
          const match = mapDatasetCategory(v);
          setField(spec.field, match.category);
          if (!match.exact) warnings.push(`category: ${match.reason}`);
        }
        break;
      }
    }
  }

  // Category fallback (import enrichment): when NO explicit product_category was mapped
  // (no category column, or it was blank), derive it from the richer product_subcategory
  // via the pure mapProductSubcategory. An explicit category ALWAYS wins; an unknown or
  // ambiguous subcategory leaves product_category NULL — never guessed. No DB, no Mapper
  // matching, no reference-base read here: this only fills the product's own category.
  if (insert.product_category === undefined && typeof insert.product_subcategory === 'string') {
    const sub = mapProductSubcategory(insert.product_subcategory);
    if (sub.category !== null) {
      assign(insert, 'product_category', sub.category);
      warnings.push(
        `product_category derived from subcategory "${insert.product_subcategory}" → ${sub.category} (${sub.confidence})`,
      );
    } else {
      warnings.push(`product_category left null (${sub.reason})`);
    }
  }

  // stamp the intake source type (profile-driven; never inferred from content)
  assign(insert, 'source_type', SOURCE_TYPE_BY_PROFILE[source]);

  // EAN sanity (keep the raw value regardless — only warn)
  const ean = insert.ean_code;
  if (typeof ean === 'string') {
    const digits = ean.replace(/\D+/g, '');
    if (digits.length === 0) warnings.push('ean_code: no digits found');
    else if (digits.length < 8) warnings.push(`ean_code: only ${digits.length} digits (looks short)`);
  }

  // identity validation
  const brand = typeof insert.brand === 'string' ? insert.brand.trim() : '';
  const nameDisplay = typeof insert.product_name_display === 'string' ? insert.product_name_display.trim() : '';
  const nameInternal = typeof insert.product_name_internal === 'string' ? insert.product_name_internal.trim() : '';
  const hasBrand = brand !== '';
  const hasName = nameDisplay !== '' || nameInternal !== '';

  let status: ProductIntakeStatus;
  let skipReason: string | null = null;
  if (!hasBrand && !hasName) {
    status = 'skip';
    skipReason = 'no brand and no product name — no usable identity';
  } else {
    if (!hasBrand) warnings.push('missing brand');
    if (!hasName) warnings.push('missing product name');
    status = warnings.length > 0 ? 'warning' : 'valid';
  }

  return { rowIndex, status, insert, warnings, skipReason };
}

/**
 * Parse a full delimited table (CSV text) into intake candidates for one source.
 * Pure: parses the text, maps every non-blank data row, and tallies valid/warning/skip.
 * Persistence + dedupe (created/existing) is the D5C2 import service, not here.
 */
export function parseProductTable(text: string, source: ProductIntakeSource = 'generic'): ProductIntakeResult {
  const grid = parseCsv(text);
  if (grid.length === 0) return { total: 0, valid: 0, warnings: 0, skipped: 0, candidates: [] };

  const headers = grid[0] ?? [];
  const candidates: ProductIntakeCandidate[] = [];
  for (let r = 1; r < grid.length; r += 1) {
    const cells = grid[r] ?? [];
    if (cells.every((c) => c.trim() === '')) continue; // skip blank lines
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    candidates.push(mapRowToProductInsert(row, source, r));
  }

  return {
    total: candidates.length,
    valid: candidates.filter((c) => c.status === 'valid').length,
    warnings: candidates.filter((c) => c.status === 'warning').length,
    skipped: candidates.filter((c) => c.status === 'skip').length,
    candidates,
  };
}
