import { validateBarcode } from '@/features/product-scanner/barcode';
import {
  PRODUCT_SCAN_SCHEMA_VERSION,
  type ProductScanExternalSource,
  type ProductScanResult,
} from '@/features/product-scanner/contracts';
import { parseCsv } from '@/lib/csv';

export const TEXTIMPORT_ADAPTER_VERSION = 'gellatti_textimport_adapter_v1' as const;

export interface TextImportRow {
  rowIndex: number;
  cells: Record<string, string>;
}

export interface TextImportAdapterOutput {
  adapterVersion: typeof TEXTIMPORT_ADAPTER_VERSION;
  sourceRowId: string | null;
  scannerInput: ProductScanResult;
  ignoredColumns: string[];
}

export class TextImportAdapterError extends Error {
  constructor(
    readonly rowIndex: number,
    readonly field: string,
    message: string,
  ) {
    super(`TEXTIMPORT row ${rowIndex}, ${field}: ${message}`);
    this.name = 'TextImportAdapterError';
  }
}

const MISSING = new Set([
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

const text = (value: string | undefined): string | null => {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return MISSING.has(trimmed.toLocaleLowerCase('pl')) ? null : trimmed;
};

function tabularRows(value: string): string[][] {
  if (!value.split(/\r?\n/, 1)[0]?.includes('\t')) return parseCsv(value);
  return value
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .filter((line, index, lines) => line !== '' || index < lines.length - 1)
    .map((line) => line.split('\t'));
}

export function parseTextImportTable(value: string): TextImportRow[] {
  const grid = tabularRows(value);
  const headers = (grid[0] ?? []).map((header) => header.trim());
  if (headers.length === 0 || headers.every((header) => header === '')) {
    throw new TextImportAdapterError(0, 'header', 'a header row is required');
  }
  const duplicates = headers.filter(
    (header, index) => header !== '' && headers.indexOf(header) !== index,
  );
  if (duplicates.length > 0) {
    throw new TextImportAdapterError(
      0,
      'header',
      `duplicate column ${JSON.stringify(duplicates[0])}`,
    );
  }

  return grid.slice(1).flatMap((values, index) => {
    if (values.every((value) => value.trim() === '')) return [];
    return [
      {
        rowIndex: index + 1,
        cells: Object.fromEntries(headers.map((header, offset) => [header, values[offset] ?? ''])),
      },
    ];
  });
}

function numberCell(row: TextImportRow, field: string): number | null {
  const value = text(row.cells[field]);
  if (value === null) return null;
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    throw new TextImportAdapterError(row.rowIndex, field, 'expected a finite number or UNKNOWN');
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new TextImportAdapterError(row.rowIndex, field, 'expected a finite number or UNKNOWN');
  }
  return parsed;
}

function unitCell(row: TextImportRow): ProductScanResult['package']['unit'] {
  const value = text(row.cells['Net Quantity Unit']);
  if (value === null) return null;
  const normalized = value.toLocaleLowerCase('pl');
  if (normalized === 'g' || normalized === 'kg' || normalized === 'ml' || normalized === 'l') {
    return normalized;
  }
  throw new TextImportAdapterError(
    row.rowIndex,
    'Net Quantity Unit',
    'expected g, kg, ml, l or UNKNOWN',
  );
}

function basisCell(row: TextImportRow): ProductScanResult['nutrition']['basis'] {
  const value = text(row.cells['Nutrition Basis']);
  if (value === null) return null;
  const compact = value.toLocaleLowerCase('pl').replace(/[^a-z0-9]+/g, '');
  if (compact.includes('100ml')) return 'per_100ml';
  if (compact.includes('100g')) return 'per_100g';
  throw new TextImportAdapterError(
    row.rowIndex,
    'Nutrition Basis',
    'expected a per-100 g or per-100 ml declaration',
  );
}

const listCell = (value: string | undefined): string[] => {
  const present = text(value);
  if (present === null) return [];
  return [
    ...new Set(
      present
        .split(';')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
};

function booleanCell(row: TextImportRow, field: string): boolean {
  const value = text(row.cells[field]);
  if (value === null) return false;
  const normalized = value.toLocaleLowerCase('pl');
  if (['true', 'yes', '1', 'tak'].includes(normalized)) return true;
  if (['false', 'no', '0', 'nie'].includes(normalized)) return false;
  throw new TextImportAdapterError(row.rowIndex, field, 'expected true or false');
}

function barcodeCell(row: TextImportRow): ProductScanResult['barcodes'] {
  const value = text(row.cells['EAN / GTIN']);
  if (value === null) return [];
  const validated = validateBarcode(value);
  if (!validated) {
    throw new TextImportAdapterError(row.rowIndex, 'EAN / GTIN', 'invalid barcode checksum');
  }
  return [{ value: validated.value, format: validated.format }];
}

const SOURCE_TYPES = new Set<ProductScanExternalSource['sourceType']>([
  'barcode_registry',
  'manufacturer',
  'retailer',
  'web_search',
]);

function externalSources(row: TextImportRow): ProductScanResult['externalSources'] {
  const rawType = text(row.cells['Evidence Source Type']);
  if (rawType === null) return [];
  const sourceType = rawType.toLocaleLowerCase('en') as ProductScanExternalSource['sourceType'];
  if (!SOURCE_TYPES.has(sourceType)) {
    throw new TextImportAdapterError(
      row.rowIndex,
      'Evidence Source Type',
      'expected barcode_registry, manufacturer, retailer or web_search',
    );
  }
  const url = text(row.cells['Evidence Source URL']) ?? text(row.cells['Primary Source URL']);
  if (url !== null && !/^https:\/\//i.test(url)) {
    throw new TextImportAdapterError(row.rowIndex, 'Evidence Source URL', 'expected an HTTPS URL');
  }
  return [
    {
      sourceType,
      url,
      title: text(row.cells['Evidence Source Title']),
      fieldsUsed: listCell(row.cells['Evidence Fields']),
    },
  ];
}

const CONSUMED_COLUMNS = new Set([
  'Product ID',
  'Country Code',
  'Category',
  'Brand',
  'Product Name Original',
  'Variant Original',
  'Manufacturer',
  'Net Quantity Value',
  'Net Quantity Unit',
  'Net Quantity Text',
  'Ingredients Original',
  'Allergens',
  'May Contain Allergens',
  'Claims',
  'Storage Instructions',
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
  'Explicitly Unbranded',
  'Label Languages',
  'Professional Dosage',
  'Technical Parameters',
  'Primary Source URL',
  'Evidence Source Type',
  'Evidence Source URL',
  'Evidence Source Title',
  'Evidence Fields',
]);

export function adaptTextImportRow(row: TextImportRow): TextImportAdapterOutput {
  const displayName = text(row.cells['Product Name Original']);
  const netQuantity = numberCell(row, 'Net Quantity Value');
  const unit = unitCell(row);
  const explicitNetQuantityText = text(row.cells['Net Quantity Text']);
  const scannerInput: ProductScanResult = {
    schemaVersion: PRODUCT_SCAN_SCHEMA_VERSION,
    identity: {
      displayName,
      originalName: displayName,
      brand: text(row.cells.Brand),
      explicitlyUnbranded: booleanCell(row, 'Explicitly Unbranded'),
      category: text(row.cells.Category),
      variant: text(row.cells['Variant Original']),
      countryOfOrigin: text(row.cells['Country of Origin']),
      labelLanguages: listCell(row.cells['Label Languages']),
    },
    package: {
      netQuantity,
      unit,
      netQuantityText:
        explicitNetQuantityText ??
        (netQuantity !== null && unit !== null ? `${netQuantity} ${unit}` : null),
    },
    barcodes: barcodeCell(row),
    nutrition: {
      basis: basisCell(row),
      energyKj: numberCell(row, 'Energy kJ'),
      energyKcal: numberCell(row, 'Energy kcal'),
      fat: numberCell(row, 'Fat g'),
      saturatedFat: numberCell(row, 'Saturated Fat g'),
      carbohydrate: numberCell(row, 'Carbohydrates g'),
      sugars: numberCell(row, 'Sugars g'),
      protein: numberCell(row, 'Protein g'),
      salt: numberCell(row, 'Salt g'),
      fibre: numberCell(row, 'Fibre g'),
    },
    productionDeclarations: {
      alcoholAbv: null,
      cocoaButterPercent: null,
      cocoaSolidsPercent: null,
      fruitContentPercent: null,
      brix: null,
      concentrationText: null,
      dosageText: text(row.cells['Professional Dosage']),
      technicalParametersText: text(row.cells['Technical Parameters']),
      formDeclaration: null,
    },
    ingredientsText: text(row.cells['Ingredients Original']),
    allergensText: text(row.cells.Allergens),
    mayContainAllergens: listCell(row.cells['May Contain Allergens']),
    claims: listCell(row.cells.Claims),
    storageInstructions: text(row.cells['Storage Instructions']),
    manufacturer: text(row.cells.Manufacturer),
    externalSources: externalSources(row),
    evidence: [],
    missingFields: [],
    conflicts: [],
    warnings: [],
  };

  return {
    adapterVersion: TEXTIMPORT_ADAPTER_VERSION,
    sourceRowId: text(row.cells['Product ID']),
    scannerInput,
    ignoredColumns: Object.keys(row.cells).filter(
      (column) => !CONSUMED_COLUMNS.has(column) && text(row.cells[column]) !== null,
    ),
  };
}
