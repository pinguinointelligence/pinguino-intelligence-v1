import type { MasterLabelData } from '../masterLabel';
import {
  allergenDisplayValues,
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
  const rows: Array<[string, string, boolean]> = [
    [
      'Energy',
      `${energyKj === null || energyKj === undefined ? '—' : Math.round(energyKj)} kJ / ${Math.round(nutrition.kcal)} kcal`,
      false,
    ],
    ['Fat', euGram(nutrition.fat_g), false],
    [
      'of which saturates',
      nutrition.saturated_fat_g === null ? '—' : euGram(nutrition.saturated_fat_g),
      true,
    ],
    ['Carbohydrate', euGram(nutrition.carbohydrate_g), false],
    ['of which sugars', nutrition.sugars_g === null ? '—' : euGram(nutrition.sugars_g), true],
  ];
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
  const allergens = allergenDisplayValues(data);
  const ingredientBlocks = languages
    .map(
      (language) =>
        `<p class="ingredients" lang="${escapeHtml(language)}"><strong>Ingredients:</strong> ${ingredientDeclarationHtml(data, language)}</p>`,
    )
    .join('');
  const alcohol =
    data.alcoholDeclarationApplicability === 'required_beverage_over_1_2' &&
    data.alcoholDeclarationReviewed
      ? `<div><span>Actual alcohol</span><strong>${data.alcoholByVolumePercent}% vol</strong></div>`
      : '';
  return `<section class="market-renderer eu-renderer" data-regulatory-renderer="eu-label-v2" data-eu-destination="${escapeHtml(data.jurisdictionContext?.euDestinationCountryCode ?? '')}"><header class="identity"><h1>${escapeHtml(product)}</h1><p>${escapeHtml(legalName)}</p></header>${ingredientBlocks}${allergens.length ? `<p class="contains"><strong>Allergens:</strong> ${escapeHtml(allergens.join(', '))}</p>` : ''}${renderEuNutrition(data)}<div class="same-field-of-vision">${netQuantityHtml(data)}${alcohol}</div>${traceabilityHtml(data)}${storageHtml(data, languages)}${originHtml(data, languages)}${businessHtml(data)}</section>`;
}
