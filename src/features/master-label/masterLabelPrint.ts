import { printLabelHtml } from '@/data/label/downloadCsv';
import type { MasterLabelData } from './masterLabel';
import { buildLabelPreflight } from './masterLabel';
import { marketProfile } from './marketProfiles';

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const primaryText = (value: Record<string, string>, languages: readonly string[]): string =>
  languages.map((language) => value[language]).find((text) => text?.trim()) ?? '';

export function buildMasterLabelPrintHtml(data: MasterLabelData): string {
  const preflight = buildLabelPreflight(data);
  if (!preflight.readyForSystemPrint) {
    throw new Error('Master Label preflight is incomplete.');
  }
  const profile = marketProfile(data.market);
  const productName = primaryText(data.productName, data.labelLanguages);
  const legalName = primaryText(data.legalProductName, data.labelLanguages);
  const storage = primaryText(data.storageInstructions, data.labelLanguages);
  const note = primaryText(data.customerNote, data.labelLanguages);
  const ingredients = data.ingredients
    .map((ingredient) => primaryText(ingredient.names, data.labelLanguages))
    .join(', ');
  const allergens = data.allergens.declared.length > 0
    ? `<p><strong>Alergeny:</strong> ${escapeHtml(data.allergens.declared.join(', '))}</p>`
    : '<p><strong>Alergeny:</strong> dane składników zweryfikowane przez użytkownika</p>';
  const nutrition = data.nutritionDeclaration?.rows
    .map((row) => `<tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(row.valueDisplay ?? '—')}</td></tr>`)
    .join('') ?? '';
  const label = `<article class="label"><header><strong>${escapeHtml(productName)}</strong><small>${escapeHtml(legalName)}</small></header><p><strong>Składniki:</strong> ${escapeHtml(ingredients)}</p>${allergens}<table>${nutrition}</table><dl><div><dt>Masa netto</dt><dd>${data.netQuantityG} g</dd></div><div><dt>LOT</dt><dd>${escapeHtml(data.lotCode)}</dd></div><div><dt>${data.dateMark.kind === 'use_by' ? 'Należy spożyć do' : 'Najlepiej spożyć przed'}</dt><dd>${escapeHtml(data.dateMark.date ?? '')}</dd></div><div><dt>Przechowywanie</dt><dd>${escapeHtml(storage)}</dd></div></dl><footer>${escapeHtml(data.operator.operatorName)} · ${escapeHtml(data.operator.address)}${note ? `<p>${escapeHtml(note)}</p>` : ''}<small>${escapeHtml(profile.label)} · ${escapeHtml(data.marketProfileVersion)}</small></footer></article>`;
  const copies = Array.from({ length: Math.max(1, Math.floor(data.copies)) }, () => label).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(productName)}</title><style>@page{margin:8mm}.sheet{display:flex;flex-wrap:wrap;gap:4mm}.label{box-sizing:border-box;width:${data.size.widthMm}mm;height:${data.size.heightMm}mm;overflow:hidden;border:1px solid #111;padding:4mm;font:10px/1.25 Arial,sans-serif;break-inside:avoid;${data.format === 'round' ? 'border-radius:50%;padding:10mm;' : ''}}header{display:flex;flex-direction:column;border-bottom:2px solid #111;padding-bottom:2mm;margin-bottom:2mm}header strong{font-size:15px}small{font-size:8px;color:#555}p{margin:1.5mm 0}table{width:100%;border-collapse:collapse}th,td{padding:.5mm 0;border-bottom:1px solid #ddd;text-align:left}td{text-align:right}dl{margin:2mm 0}dl div{display:flex;justify-content:space-between}dt,dd{margin:0}footer{border-top:1px solid #111;padding-top:2mm}</style></head><body><main class="sheet">${copies}</main></body></html>`;
}

export function printMasterLabel(data: MasterLabelData): void {
  printLabelHtml(buildMasterLabelPrintHtml(data));
}
