import type { MasterLabelData } from '../masterLabel';
import {
  allergenStatementHtml,
  businessHtml,
  escapeHtml,
  ingredientDeclarationHtml,
  netQuantityHtml,
  numberText,
  originHtml,
  perServing,
  primaryText,
  storageHtml,
  traceabilityHtml,
} from './shared';

export function renderFsanZNutritionPanel(data: MasterLabelData): string {
  const source = data.nutritionSource;
  const facts = data.regulatoryNutrition;
  const serving = facts.servingQuantityG;
  if (!source) return '';
  const hasServing = serving !== null && serving !== undefined && serving > 0;
  const rows: Array<[string, number, string, number]> = [
    ['Protein', source.protein_g, 'g', 1],
    ['Fat, total', source.fat_g, 'g', 1],
    ['Carbohydrate', source.carbohydrate_g, 'g', 1],
  ];
  if (facts.energyKjPer100g !== null && facts.energyKjPer100g !== undefined) {
    rows.unshift(['Energy', facts.energyKjPer100g, 'kJ', 0]);
  }
  if (source.saturated_fat_g !== null) {
    rows.splice(
      rows.findIndex(([label]) => label === 'Carbohydrate'),
      0,
      ['- saturated', source.saturated_fat_g, 'g', 1],
    );
  }
  if (source.sugars_g !== null) rows.push(['- sugars', source.sugars_g, 'g', 1]);
  if (facts.sodiumMgPer100g !== null && facts.sodiumMgPer100g !== undefined) {
    rows.push(['Sodium', facts.sodiumMgPer100g, 'mg', 0]);
  }
  const servingFacts = hasServing
    ? `<tr><th colspan="3">${facts.servingsPerContainer !== null && facts.servingsPerContainer !== undefined ? `Servings per package: ${numberText(facts.servingsPerContainer, 0)}<br>` : ''}Serving size: ${numberText(serving, 0)} g</th></tr>`
    : '';
  return `<table class="nutrition-table fsanz-nip"><caption>NUTRITION INFORMATION</caption><thead>${servingFacts}<tr><th>Average quantity</th>${hasServing ? '<th>per serving</th>' : ''}<th>per 100 g</th></tr></thead><tbody>${rows
    .map(
      ([label, per100, unit, digits]) =>
        `<tr><th>${escapeHtml(label)}</th>${hasServing ? `<td>${numberText(perServing(per100, serving), digits)} ${unit}</td>` : ''}<td>${numberText(per100, digits)} ${unit}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

export function renderAuNzLabel(data: MasterLabelData): string {
  const product = primaryText(data.productName, ['en']);
  const description = primaryText(data.legalProductName, ['en']);
  const ingredients = ingredientDeclarationHtml(data, 'en');
  const country = data.jurisdictionContext?.auNzCountry ?? 'unresolved';
  const identity =
    product || description
      ? `<header class="identity">${product ? `<h1>${escapeHtml(product)}</h1>` : ''}${description ? `<p>${escapeHtml(description)}</p>` : ''}</header>`
      : '';
  return `<section class="market-renderer au-nz-renderer" data-regulatory-renderer="fsanz-nip-v2" data-country-context="${country}">${identity}${ingredients ? `<p class="ingredients"><strong>Ingredients:</strong> ${ingredients}</p>` : ''}${allergenStatementHtml(data)}${renderFsanZNutritionPanel(data)}${netQuantityHtml(data)}${traceabilityHtml(data)}${storageHtml(data, ['en'])}${originHtml(data, ['en'])}${businessHtml(data)}</section>`;
}
