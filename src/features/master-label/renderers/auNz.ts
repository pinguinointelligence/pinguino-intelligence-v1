import type { MasterLabelData } from '../masterLabel';
import {
  allergenDisplayValues,
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
  if (!source || !serving || source.saturated_fat_g === null || source.sugars_g === null) return '';
  const sodium = facts.sodiumMgPer100g ?? 0;
  const rows: Array<[string, number, string, number]> = [
    ['Energy', facts.energyKjPer100g ?? 0, 'kJ', 0],
    ['Protein', source.protein_g, 'g', 1],
    ['Fat, total', source.fat_g, 'g', 1],
    ['- saturated', source.saturated_fat_g, 'g', 1],
    ['Carbohydrate', source.carbohydrate_g, 'g', 1],
    ['- sugars', source.sugars_g, 'g', 1],
    ['Sodium', sodium, 'mg', 0],
  ];
  return `<table class="nutrition-table fsanz-nip"><caption>NUTRITION INFORMATION</caption><thead><tr><th colspan="3">Servings per package: ${numberText(facts.servingsPerContainer, 0)}<br>Serving size: ${numberText(serving, 0)} g</th></tr><tr><th>Average quantity</th><th>per serving</th><th>per 100 g</th></tr></thead><tbody>${rows
    .map(
      ([label, per100, unit, digits]) =>
        `<tr><th>${escapeHtml(label)}</th><td>${numberText(perServing(per100, serving), digits)} ${unit}</td><td>${numberText(per100, digits)} ${unit}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

export function renderAuNzLabel(data: MasterLabelData): string {
  const product = primaryText(data.productName, ['en']);
  const description = primaryText(data.legalProductName, ['en']);
  const allergens = allergenDisplayValues(data);
  const country = data.jurisdictionContext?.auNzCountry ?? 'unresolved';
  return `<section class="market-renderer au-nz-renderer" data-regulatory-renderer="fsanz-nip-v2" data-country-context="${country}"><header class="identity"><h1>${escapeHtml(product)}</h1><p>${escapeHtml(description)}</p></header><p class="ingredients"><strong>Ingredients:</strong> ${ingredientDeclarationHtml(data, 'en')}</p>${allergens.length ? `<p class="contains peal"><strong>Contains: ${escapeHtml(allergens.join(', '))}</strong></p>` : ''}${renderFsanZNutritionPanel(data)}${netQuantityHtml(data)}${traceabilityHtml(data)}${storageHtml(data, ['en'])}${originHtml(data, ['en'])}${businessHtml(data)}</section>`;
}
