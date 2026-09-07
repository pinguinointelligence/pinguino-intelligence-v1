import type { MasterLabelData } from '../masterLabel';
import {
  allergenStatementHtml,
  businessHtml,
  escapeHtml,
  ingredientDeclarationHtml,
  netQuantityHtml,
  originHtml,
  primaryText,
  storageHtml,
  traceabilityHtml,
} from './shared';

const euGram = (value: number): string => {
  if (value === 0) return '0 g';
  if (value >= 10) return `${Math.round(value)} g`;
  if (value >= 0.5) return `${value.toFixed(1)} g`;
  return `${value.toFixed(2)} g`;
};

const euSalt = (value: number): string => {
  if (value < 0.0125) return '0 g';
  return value >= 1 ? `${value.toFixed(1)} g` : `${value.toFixed(2)} g`;
};

export function renderEuNutrition(data: MasterLabelData): string {
  const nutrition = data.nutritionSource;
  if (!nutrition) return '';
  const energyKj = data.regulatoryNutrition.energyKjPer100g;
  const rows: Array<[string, string, boolean]> = [];
  if (energyKj !== null && energyKj !== undefined) {
    rows.push(['Energy', `${Math.round(energyKj)} kJ / ${Math.round(nutrition.kcal)} kcal`, false]);
  }
  rows.push(['Fat', euGram(nutrition.fat_g), false]);
  if (nutrition.saturated_fat_g !== null) {
    rows.push(['of which saturates', euGram(nutrition.saturated_fat_g), true]);
  }
  rows.push(['Carbohydrate', euGram(nutrition.carbohydrate_g), false]);
  if (nutrition.sugars_g !== null) {
    rows.push(['of which sugars', euGram(nutrition.sugars_g), true]);
  }
  if (nutrition.fiber_g !== null) rows.push(['Fibre', euGram(nutrition.fiber_g), false]);
  rows.push(['Protein', euGram(nutrition.protein_g), false]);
  rows.push(['Salt', euSalt(nutrition.salt_g), false]);
  return `<table class="nutrition-table eu-nutrition"><caption>Nutrition declaration · per 100 g</caption><tbody>${rows
    .map(
      ([label, value, indent]) =>
        `<tr class="${indent ? 'indent' : ''}"><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

export function renderEuLabel(data: MasterLabelData): string {
  const languages = data.labelLanguages;
  const product = primaryText(data.productName, languages);
  const legalName = primaryText(data.legalProductName, languages);
  const ingredientBlocks = languages
    .map((language) => {
      const declaration = ingredientDeclarationHtml(data, language);
      return declaration
        ? `<p class="ingredients" lang="${escapeHtml(language)}"><strong>Ingredients:</strong> ${declaration}</p>`
        : '';
    })
    .join('');
  const alcohol =
    data.alcoholDeclarationApplicability === 'required_beverage_over_1_2' &&
    data.alcoholDeclarationReviewed
      ? `<div><span>Actual alcohol</span><strong>${data.alcoholByVolumePercent}% vol</strong></div>`
      : '';
  const quantityAndAlcohol = `${netQuantityHtml(data)}${alcohol}`;
  const identity =
    product || legalName
      ? `<header class="identity">${product ? `<h1>${escapeHtml(product)}</h1>` : ''}${legalName ? `<p>${escapeHtml(legalName)}</p>` : ''}</header>`
      : '';
  return `<section class="market-renderer eu-renderer" data-regulatory-renderer="eu-label-v2" data-eu-destination="${escapeHtml(data.jurisdictionContext?.euDestinationCountryCode ?? '')}">${identity}${ingredientBlocks}${allergenStatementHtml(data)}${renderEuNutrition(data)}${quantityAndAlcohol ? `<div class="same-field-of-vision">${quantityAndAlcohol}</div>` : ''}${traceabilityHtml(data)}${storageHtml(data, languages)}${originHtml(data, languages)}${businessHtml(data)}</section>`;
}
