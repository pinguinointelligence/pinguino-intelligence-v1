/**
 * PINGÜINO PRO CORE — capability-gated exports (PURE strings/data, no DOM/IO).
 *
 * Reuses the existing label/recipe CSV builder (`@/data/label/recipeExport`) for the recipe body
 * and adds a cost-snapshot sheet. Exports are capability-gated: a plan without `canExport` is
 * refused, and exact grams (plus batch-tied money) are redacted unless `canViewExactGrams` — so an
 * export can never leak exact grams without that capability. Costs are shown at their own currency
 * only; nothing is ever converted.
 */
import { buildRecipeCsv } from '@/data/label/recipeExport';
import type { RecipeResult } from '@/engine';
import type { ExportCapabilities, RecipeCostSnapshot } from './costContracts';

const REDACTED = '—';

/** Quote a CSV cell only when it contains a comma, quote or newline; escape `"`→`""` (RFC-4180). */
function quoteCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
const toRow = (cells: string[]): string => cells.map(quoteCell).join(',');

/** Refuse export entirely for a plan without the export capability (e.g. Demo). */
export function assertCanExport(caps: ExportCapabilities): void {
  if (!caps.canExport) throw new Error('This plan cannot export recipes.');
}

const money = (value: number | null): string => (value === null ? '' : value.toFixed(4));

/**
 * Build a cost-snapshot CSV. Grams and batch-tied money (line cost, total) are redacted unless
 * `canViewExactGrams`; the per-kg unit price and currency remain. Refused without `canExport`.
 */
export function buildCostSnapshotCsv(snapshot: RecipeCostSnapshot, caps: ExportCapabilities): string {
  assertCanExport(caps);
  const exact = caps.canViewExactGrams;
  const cur = snapshot.currency;
  const rows: string[][] = [];
  rows.push(['Ingredient', 'Grams', `Cost/kg (${cur})`, `Line cost (${cur})`, 'State']);
  for (const line of snapshot.lines) {
    rows.push([
      line.ingredientName,
      exact ? String(line.grams) : REDACTED,
      money(line.costPerKg),
      exact ? money(line.lineCost) : REDACTED,
      line.state,
    ]);
  }
  rows.push([]);
  rows.push(['Total cost', exact ? money(snapshot.totalCost) : REDACTED]);
  rows.push([`Cost per kg (${cur})`, money(snapshot.costPerKg)]);
  rows.push(['Basis', snapshot.basis]);
  rows.push(['Complete', snapshot.complete ? 'yes' : 'no']);
  rows.push(['Engine', `${snapshot.engineVersion}/${snapshot.configVersion}`]);
  return rows.map(toRow).join('\r\n');
}

/**
 * Recipe label/nutrition/cost CSV — reuses the canonical `buildRecipeCsv` for plans that may see
 * exact grams. Refused without `canExport`; refused for a non-exact plan (the canonical builder is
 * exact-grams by construction, so we never emit a half-redacted recipe body).
 */
export function buildRecipeLabelCsv(result: RecipeResult, caps: ExportCapabilities): string {
  assertCanExport(caps);
  if (!caps.canViewExactGrams) {
    throw new Error('This plan cannot export exact-gram recipe sheets.');
  }
  return buildRecipeCsv(result);
}
