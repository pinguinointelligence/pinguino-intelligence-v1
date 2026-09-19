// Reader for GELLATTI_BAZA_GELATO_75_KRAJOW_v23_SYNC_FINAL.xlsx.
//
// v23 keeps the v12 layout for every sheet the v12 parser reads. The layout
// below is DERIVED from the v12 specs (workbookV12.mjs); only these differ:
// - four renamed headers: 05_PR_ING_ARTYKULY!R, 23_TARA_75!J and !AC,
//   24_TARA_PRZELICZENIA!H (same column, same field, new convention wording);
// - 27_CHECKLIST_AKTYWNA gained per-version decision columns v13…v23 (Y:BP);
// - the current trail is 83_SYNC_V23 / 84_POZOSTALE_V23, with 85_USA_TARA_V23
//   (US exact TDS values), 86_DOWODY_V23 (v23 sources) and 88_KONTROLA_V23
//   (owner controls).
// The v11/v12 trail sheets (36, 37, 39, 40) remain in the workbook as history.
// Only 39_SYNC_V12 is still read, for the alternative leads it records; the
// v12 open-gap list 40_POZOSTALE_V12 is never re-applied.

import {
  V12_LAYOUT,
  cellAt,
  column as c,
  expectCell,
  extendColumns,
  normalizeHeader,
  parseWorkbookLayout,
  readDashboardState,
  retitleColumns,
  sheetGrid,
  sheetsUsedByLayout,
} from './workbookV12.mjs';

export const V23_WORKBOOK = Object.freeze({
  basename: 'GELLATTI_BAZA_GELATO_75_KRAJOW_v23_SYNC_FINAL.xlsx',
  sha256: '37afaf6f98bad68d2768c02562f130f0502ba875d3ae4a08f51f420b82de16b4',
});

/** 00_DASHBOARD!A2 must name the v23 checkpoint; anything else is another workbook state. */
export const V23_DASHBOARD_CHECKPOINT = 'CHECKPOINT 83_SYNC_V23 / 84_POZOSTALE_V23';

// 27_CHECKLIST_AKTYWNA: per-version decision columns (date, decision, sources,
// remaining scope). v11 and v12 reuse the fields the v12 spec already reads.
const CHECKLIST_VERSION_COLUMNS = [
  ['v13', ['Y', 'Synchronizacja v13'], ['Z', 'Decyzja v13'], ['AA', 'Źródło / podstawa v13'], ['AB', 'Pozostałe poza doborem']],
  ['v14', ['AC', 'Synchronizacja v14'], ['AD', 'Decyzja v14'], ['AE', 'Źródło / podstawa v14'], ['AF', 'Pozostałe poza doborem']],
  ['v15', ['AG', 'Synchronizacja v15'], ['AH', 'Decyzja v15'], ['AI', 'Źródło / podstawa v15'], ['AJ', 'Pozostałe poza doborem']],
  ['v16', ['AK', 'Sync v16 — data'], ['AL', 'Decyzja v16 — exact produkt i 7/7 NIP'], ['AM', 'Dowody v16 — źródła'], ['AN', 'Poza doborem — istniejące bramki']],
  ['v17', ['AO', 'Sync v17 — data'], ['AP', 'Decyzja v17 — exact produkt i 7/7 NIP'], ['AQ', 'Dowody v17 — źródła'], ['AR', 'Poza doborem — istniejące bramki']],
  ['v18', ['AS', 'Sync v18 — data'], ['AT', 'Decyzja v18 — exact produkt i NIP 7/7'], ['AU', 'Dowody v18 — źródła'], ['AV', 'Poza doborem — istniejące bramki']],
  ['v19', ['AW', 'Sync v19 — data'], ['AX', 'Decyzja v19 — exact produkt/NIP'], ['AY', 'Dowody v19 — źródła'], ['AZ', 'Poza doborem — istniejące bramki']],
  ['v20', ['BA', 'Sync v20 — data'], ['BB', 'Decyzja v20 — exact produkt/NIP'], ['BC', 'Dowody v20 — źródła'], ['BD', 'Poza doborem — istniejące bramki']],
  ['v21', ['BE', 'Sync v21 — data'], ['BF', 'Decyzja v21 — exact produkt i dane'], ['BG', 'Źródła v21'], ['BH', 'Pozostałe poza doborem']],
  ['v22', ['BI', 'Sync v22 — data'], ['BJ', 'Decyzja v22'], ['BK', 'Źródła v22'], ['BL', 'Warunek pozostający / zakres']],
  ['v23', ['BM', 'Sync v23 — data'], ['BN', 'Decyzja v23'], ['BO', 'Źródła v23'], ['BP', 'Zakres i wyłączenie transportu']],
];

/**
 * Decision groups of one checklist row, oldest first. The builder takes the
 * newest group with a decision as the case's latest decision.
 */
export const CHECKLIST_DECISION_GROUPS = Object.freeze([
  Object.freeze({ version: 'v11', date: null, decision: 'decisionV11', sources: 'evidenceV11', remaining: 'scopeV11', columns: 'O:Q' }),
  Object.freeze({ version: 'v12', date: 'syncV12', decision: 'decisionV12', sources: 'basisV12', remaining: 'remainingOutsideSelection', columns: 'U:X' }),
  ...CHECKLIST_VERSION_COLUMNS.map(([version, date, decision, sources, remaining]) =>
    Object.freeze({
      version,
      date: `${version}Date`,
      decision: `${version}Decision`,
      sources: `${version}Sources`,
      remaining: `${version}Remaining`,
      columns: `${date[0]}:${remaining[0]}`,
    }),
  ),
]);

const CHECKLIST_EXTRA_COLUMNS = Object.fromEntries([
  ['scopeV11', c('Q', 'Zakres')],
  ...CHECKLIST_VERSION_COLUMNS.flatMap(([version, date, decision, sources, remaining]) => [
    [`${version}Date`, c(...date)],
    [`${version}Decision`, c(...decision)],
    [`${version}Sources`, c(...sources)],
    [`${version}Remaining`, c(...remaining)],
  ]),
]);

/**
 * A header-checked block of contiguous rows: reading stops at the first row
 * whose column A is empty, so a sheet with several stacked tables is read one
 * table at a time. A row whose key fails `keyTest` is layout drift.
 */
function readBlock(workbook, { sheet, headerRow, columns, keyTest }) {
  const grid = sheetGrid(workbook, sheet);
  for (const [field, entry] of Object.entries(columns)) {
    const actual = normalizeHeader(cellAt(grid, headerRow, entry.col));
    if (actual !== normalizeHeader(entry.header)) {
      throw new Error(
        `Layout drift in ${sheet}!${entry.col}${headerRow} (${field}): expected "${entry.header}", found "${actual}".`,
      );
    }
  }
  const rows = [];
  for (let rowNumber = headerRow + 1; rowNumber <= grid.lastRow; rowNumber += 1) {
    const key = cellAt(grid, rowNumber, 'A');
    if (key === null) break;
    if (keyTest && !keyTest(key)) {
      throw new Error(`Layout drift in ${sheet}!A${rowNumber}: unexpected row key "${key}".`);
    }
    const values = {};
    for (const [field, entry] of Object.entries(columns)) values[field] = cellAt(grid, rowNumber, entry.col);
    rows.push({ sheet, rowNumber, ref: `${sheet}!A${rowNumber}:${grid.lastColumnLetter}${rowNumber}`, values });
  }
  const lastRow = rows.length > 0 ? rows.at(-1).rowNumber : headerRow;
  return { grid, rows, ref: `${sheet}!A${headerRow}:${grid.lastColumnLetter}${lastRow}` };
}

const numberCell = (sheet, row, field) => {
  const value = row.values[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Layout drift in ${row.ref}: ${field} must be a number, found "${value}".`);
  }
  return value;
};

function readSyncV23(workbook) {
  const sheet = '83_SYNC_V23';
  const summary = readBlock(workbook, {
    sheet,
    headerRow: 5,
    columns: {
      scope: c('A', 'Zakres'),
      before: c('B', 'Przed v23'),
      closed: c('C', 'Zamknięto'),
      remaining: c('D', 'Pozostało'),
      state: c('E', 'Stan'),
      controlSource: c('F', 'Źródło kontroli'),
      date: c('G', 'Data'),
      notes: c('H', 'Uwagi'),
    },
  });
  const grid = summary.grid;
  expectCell(grid, sheet, 'A1', 'GELLATTI | v23 SYNC');
  const CASE_HEADER_ROW = 20;
  expectCell(grid, sheet, `A${CASE_HEADER_ROW}`, 'ID');
  const lastSummaryRow = summary.rows.at(-1)?.rowNumber ?? 5;
  const notes = [];
  for (let rowNumber = lastSummaryRow + 1; rowNumber < CASE_HEADER_ROW; rowNumber += 1) {
    const text = cellAt(grid, rowNumber, 'A');
    if (text !== null) notes.push({ ref: `${sheet}!A${rowNumber}`, text: String(text) });
  }
  const cases = readBlock(workbook, {
    sheet,
    headerRow: CASE_HEADER_ROW,
    keyTest: (value) => /^R\d+-\d{3}$/.test(String(value)),
    columns: {
      id: c('A', 'ID'),
      country: c('B', 'Kraj'),
      role: c('C', 'Rola'),
      previousProduct: c('D', 'Poprzedni produkt'),
      selectedProduct: c('E', 'Wybrany produkt'),
      productKey: c('F', 'Klucz produktu'),
      result: c('G', 'Wynik'),
      sources: c('H', 'Źródła'),
    },
  });
  const rows = summary.rows.map((row) => ({
    ...row,
    values: {
      ...row.values,
      before: numberCell(sheet, row, 'before'),
      closed: numberCell(sheet, row, 'closed'),
      remaining: numberCell(sheet, row, 'remaining'),
    },
  }));
  if (!rows.some((row) => row.values.scope === 'Przypadki')) {
    throw new Error(`Layout drift in ${summary.ref}: no "Przypadki" summary row.`);
  }
  return {
    ref: summary.ref,
    casesRef: cases.ref,
    title: cellAt(grid, 1, 'A'),
    purpose: cellAt(grid, 2, 'A'),
    summary: rows,
    notes,
    cases: cases.rows,
  };
}

function readRemainingV23(workbook) {
  const sheet = '84_POZOSTALE_V23';
  const summary = readBlock(workbook, {
    sheet,
    headerRow: 5,
    columns: {
      item: c('A', 'Pozycja'),
      count: c('B', 'Liczba'),
      scope: c('C', 'Zakres'),
      state: c('D', 'Stan'),
      source: c('E', 'Źródło'),
      caveat: c('F', 'Zastrzeżenie'),
    },
  });
  expectCell(summary.grid, sheet, 'A1', 'v23 | POZOSTAŁE PRZYPADKI');
  const openRow = summary.rows.find((row) => row.values.item === 'Otwarte / zablokowane');
  if (!openRow) throw new Error(`Layout drift in ${summary.ref}: no "Otwarte / zablokowane" row.`);
  const total = numberCell(sheet, openRow, 'count');
  if (total !== 0) {
    // v23 lists no per-case table of open cases. A non-zero count would need
    // one, so it is refused instead of being read as "nothing open".
    throw new Error(
      `${sheet} reports ${total} open/blocked case(s) but has no per-case table this reader understands; refusing.`,
    );
  }
  const dependencies = readBlock(workbook, {
    sheet,
    headerRow: 9,
    keyTest: (value) => /^R\d+-G\d{2}$/.test(String(value)),
    columns: {
      id: c('A', 'ID'),
      kind: c('B', 'Rodzaj'),
      task: c('C', 'Zadanie'),
      status: c('D', 'Status'),
      whySeparate: c('E', 'Dlaczego oddzielnie'),
      notDone: c('F', 'Nie wykonano'),
    },
  });
  return {
    ref: summary.ref,
    openRowRef: openRow.ref,
    dependenciesRef: dependencies.ref,
    title: cellAt(summary.grid, 1, 'A'),
    note: cellAt(summary.grid, 2, 'A'),
    summary: summary.rows,
    total,
    openRow: openRow.values,
    rows: [],
    dependencies: dependencies.rows,
  };
}

function readUsTaraV23(workbook) {
  const sheet = '85_USA_TARA_V23';
  const block = readBlock(workbook, {
    sheet,
    headerRow: 5,
    columns: {
      field: c('A', 'Pole'),
      value: c('B', 'Wartość'),
      unit: c('C', 'Jednostka / zakres'),
      meaning: c('D', 'Znaczenie'),
      source: c('E', 'Źródło'),
    },
  });
  return {
    ref: block.ref,
    title: cellAt(block.grid, 1, 'A'),
    note: cellAt(block.grid, 2, 'A'),
    fields: block.rows,
  };
}

function readEvidenceV23(workbook) {
  const block = readBlock(workbook, {
    sheet: '86_DOWODY_V23',
    headerRow: 5,
    keyTest: (value) => /^V23-S\d{2}$/.test(String(value)),
    columns: {
      id: c('A', 'ID'),
      area: c('B', 'Obszar'),
      name: c('C', 'Nazwa'),
      scope: c('D', 'Zakres'),
      evidenceType: c('E', 'Typ'),
      url: c('F', 'Źródło'),
      auditDate: c('G', 'Data'),
      limitation: c('H', 'Ograniczenie'),
    },
  });
  return { ref: block.ref, note: cellAt(block.grid, 2, 'A'), rows: block.rows };
}

function readControlsV23(workbook) {
  const block = readBlock(workbook, {
    sheet: '88_KONTROLA_V23',
    headerRow: 5,
    keyTest: (value) => typeof value === 'number',
    columns: {
      number: c('A', 'Lp.'),
      control: c('B', 'Kontrola'),
      result: c('C', 'Wynik'),
      evidence: c('D', 'Dowód / wynik'),
    },
  });
  return { ref: block.ref, note: cellAt(block.grid, 2, 'A'), rows: block.rows };
}

function readDashboardV23(workbook) {
  const dashboard = readDashboardState(workbook);
  if (!String(dashboard.state ?? '').startsWith(V23_DASHBOARD_CHECKPOINT)) {
    throw new Error(
      `Layout drift in 00_DASHBOARD!A2: expected the "${V23_DASHBOARD_CHECKPOINT}" checkpoint, found "${dashboard.state}".`,
    );
  }
  return dashboard;
}

const { selectionSheets, calculationSheets, tables } = V12_LAYOUT;

export const V23_LAYOUT = Object.freeze({
  selectionSheets: {
    ...selectionSheets,
    STABILIZER: retitleColumns(selectionSheets.STABILIZER, {
      carbohydrate: 'Węglowodany wg konwencji AD (g/100g)',
      fibre: 'Błonnik deklarowany wg rynku (g/100g)',
    }),
  },
  calculationSheets: {
    ...calculationSheets,
    STABILIZER: retitleColumns(calculationSheets.STABILIZER, { carbohydrate: 'Węglowodany wg źródła' }),
  },
  tables: {
    base: tables.base,
    countries: tables.countries,
    regions: tables.regions,
    coverage: tables.coverage,
    articles: retitleColumns(tables.articles, { carbohydrate: 'Węglowodany wg konwencji źródła %' }),
    sources: tables.sources,
    blockers: tables.blockers,
    rules: tables.rules,
    checklist: extendColumns(tables.checklist, CHECKLIST_EXTRA_COLUMNS),
    deAtProducts: tables.deAtProducts,
    // History inside v23: read only for the alternative leads it records.
    syncV12: tables.syncV12,
  },
  readers: {
    syncV23: readSyncV23,
    remainingV23: readRemainingV23,
    usTaraV23: readUsTaraV23,
    evidenceV23: readEvidenceV23,
    controlsV23: readControlsV23,
  },
  dashboard: readDashboardV23,
  extraSheets: ['00_DASHBOARD', '83_SYNC_V23', '84_POZOSTALE_V23', '85_USA_TARA_V23', '86_DOWODY_V23', '88_KONTROLA_V23'],
});

/** Parses every sheet the v23 country-product layer depends on. */
export function parseWorkbookV23(buffer) {
  return parseWorkbookLayout(buffer, V23_LAYOUT);
}

/** Sheets read by parseWorkbookV23, in workbook order. */
export function sheetsUsedByV23(sheetNames) {
  return sheetsUsedByLayout(V23_LAYOUT, sheetNames);
}
