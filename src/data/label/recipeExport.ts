/**
 * Recipe export builders (Labels & Exports, file-first / client-only).
 *
 * buildRecipeCsv        — RFC-4180 CSV (ingredient lines + per-100 g nutrition
 *                         block + honest cost block). Own quoting: `@/lib/csv`
 *                         is parse-only, so serialization lives here.
 * buildPrintableLabelHtml — a self-contained printable label (inline CSS only,
 *                         no <script>, no external CSS/PDF library).
 * buildCostBlock        — display lines for cost; blank when the cost is
 *                         incomplete, never a fabricated number.
 *
 * Every builder consumes the engine's RESULT output and never recomputes recipe
 * math. All builders are pure strings/data — the DOM side-effects (download,
 * print window) live in ./downloadCsv.
 */
import { copy } from '@/copy/en';
import type { RecipeResult } from '@/engine';
import { buildIngredientStatement } from './ingredientStatement';
import { buildNutritionDeclaration } from './nutritionLabel';

export interface LabelLine {
  label: string;
  /** Rendered value; null = blank (not available / incomplete). */
  valueDisplay: string | null;
}

/* ── Cost ─────────────────────────────────────────────────────────────────── */

function money(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : `€${value.toFixed(2)}`;
}

/**
 * Cost display lines from the engine's honest cost state. When a cost is unknown
 * (incomplete recipe) the line is blank (valueDisplay null) — never a fake 0.
 */
export function buildCostBlock(result: RecipeResult): LabelLine[] {
  const m = copy.studio.metrics;
  const costs = result.costs;
  return [
    { label: m.costPerKg, valueDisplay: money(costs?.cost_per_kg) },
    { label: m.serving60, valueDisplay: money(costs?.cost_per_serving_60g) },
    { label: m.serving70, valueDisplay: money(costs?.cost_per_serving_70g) },
    { label: m.serving80, valueDisplay: money(costs?.cost_per_serving_80g) },
  ];
}

/* ── CSV (RFC-4180, own quoting) ──────────────────────────────────────────── */

/** Quote a cell only when it contains a comma, quote or newline; escape `"`→`""`. */
function quoteCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toRow(cells: string[]): string {
  return cells.map(quoteCell).join(',');
}

/**
 * Build an RFC-4180 CSV export: ingredient lines (EU QUID descending order),
 * a per-100 g nutrition block, and a cost block. Blank cells (never fake
 * numbers) stand in for not-available nutrition and incomplete costs. Rows are
 * CRLF-joined; round-trips through `parseCsv` from `@/lib/csv`.
 */
export function buildRecipeCsv(result: RecipeResult): string {
  const rows: string[][] = [];

  // Ingredient statement.
  rows.push(['Ingredient', 'Grams', 'Percent']);
  for (const entry of buildIngredientStatement(result)) {
    rows.push([entry.name, String(entry.grams), String(entry.percent)]);
  }

  // Per-100 g nutrition block.
  rows.push([]);
  rows.push(['Nutrition (per 100 g)', 'Value']);
  const declaration = buildNutritionDeclaration(result.nutrition_per_100g);
  if (declaration) {
    for (const row of declaration.rows) {
      rows.push([row.label, row.valueDisplay ?? '']);
    }
  }

  // Cost block (blank when incomplete).
  rows.push([]);
  rows.push(['Cost', 'Value']);
  for (const line of buildCostBlock(result)) {
    rows.push([line.label, line.valueDisplay ?? '']);
  }

  return rows.map(toRow).join('\r\n');
}

/* ── Printable label (self-contained HTML) ────────────────────────────────── */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const LABEL_PRINT_CSS = [
  'body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;max-width:520px}',
  'h1{font-size:18px;margin:0 0 2px}',
  'p.sample{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#666;margin:0 0 16px}',
  'h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #111;padding-bottom:4px;margin:20px 0 8px}',
  'table{width:100%;border-collapse:collapse;font-size:13px}',
  'th,td{text-align:left;padding:3px 0;border-bottom:1px solid #ddd}',
  'td{text-align:right}',
  'tr.sub th{padding-left:16px;font-weight:normal;color:#444}',
  'p.body{font-size:12px;line-height:1.5;color:#333}',
].join('');

/**
 * Build a self-contained, printable label document (inline CSS only). Contains
 * the nutrition declaration, the ingredient statement, a cost block and the
 * honest allergen note. No <script>, no external stylesheet, no PDF library.
 */
export function buildPrintableLabelHtml(result: RecipeResult): string {
  const l = copy.nav.label;
  const na = l.notAvailable;

  const declaration = buildNutritionDeclaration(result.nutrition_per_100g);
  const nutritionRows = declaration
    ? declaration.rows
        .map(
          (row) =>
            `<tr${row.indented ? ' class="sub"' : ''}><th>${escapeHtml(row.label)}</th>` +
            `<td>${escapeHtml(row.valueDisplay ?? na)}</td></tr>`,
        )
        .join('')
    : `<tr><td>${escapeHtml(na)}</td></tr>`;

  const ingredients = buildIngredientStatement(result)
    .map((entry) => `${escapeHtml(entry.name)} (${entry.percent}%)`)
    .join(', ');

  const costRows = buildCostBlock(result)
    .map(
      (line) =>
        `<tr><th>${escapeHtml(line.label)}</th><td>${escapeHtml(line.valueDisplay ?? '—')}</td></tr>`,
    )
    .join('');

  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    `<title>${escapeHtml(l.title)}</title><style>${LABEL_PRINT_CSS}</style></head><body>` +
    `<h1>${escapeHtml(l.title)}</h1>` +
    `<p class="sample">${escapeHtml(l.sampleHeading)}</p>` +
    `<h2>${escapeHtml(l.nutrition)} — ${escapeHtml(copy.studio.metrics.nutritionTitle)}</h2>` +
    `<table>${nutritionRows}</table>` +
    `<h2>${escapeHtml(l.statement)}</h2>` +
    `<p class="body">${ingredients}</p>` +
    `<h2>${escapeHtml(copy.studio.metrics.costTitle)}</h2>` +
    `<table>${costRows}</table>` +
    `<p class="body">${escapeHtml(l.allergenNote)}</p>` +
    '</body></html>'
  );
}
