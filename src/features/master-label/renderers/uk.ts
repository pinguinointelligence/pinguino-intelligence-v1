import type { MasterLabelData } from '../masterLabel';
import {
  allergenStatementHtml,
  businessHtml,
  escapeHtml,
  ingredientDeclarationHtml,
  netQuantityHtml,
  primaryText,
  storageHtml,
  traceabilityHtml,
} from './shared';
import { renderEuNutrition } from './eu';

export function renderUkLabel(data: MasterLabelData): string {
  const product = primaryText(data.productName, data.labelLanguages);
  const legalName = primaryText(data.legalProductName, data.labelLanguages);
  const ingredients = ingredientDeclarationHtml(data, 'en');
  const region = data.jurisdictionContext?.ukRegion ?? 'unresolved';
  const ppds = data.packagingContext === 'ppds';
  const alcohol =
    data.alcoholDeclarationApplicability === 'required_beverage_over_1_2' &&
    data.alcoholDeclarationReviewed
      ? `<div><span>Actual alcohol</span><strong>${data.alcoholByVolumePercent}% vol</strong></div>`
      : '';
  const quantityAndAlcohol = `${netQuantityHtml(data)}${alcohol}`;
  const jurisdictionNote =
    region === 'NI'
      ? 'Northern Ireland · NI/EU responsible business address rules'
      : region === 'GB'
        ? 'Great Britain · UK responsible business address rules'
        : '';
  const identity =
    product || legalName || ppds
      ? `<header class="identity">${product ? `<h1>${escapeHtml(product)}</h1>` : ''}${legalName ? `<p>${escapeHtml(legalName)}</p>` : ''}${ppds ? '<strong class="context-mark">PPDS · full ingredients and emphasised allergens</strong>' : ''}</header>`
      : '';
  return `<section class="market-renderer uk-renderer ${ppds ? 'ppds' : 'prepacked'}" data-regulatory-renderer="uk-label-v2" data-uk-region="${region}">${identity}${ingredients ? `<p class="ingredients" lang="en"><strong>Ingredients:</strong> ${ingredients}</p>` : ''}${allergenStatementHtml(data)}${renderEuNutrition(data).replace('Nutrition declaration', 'Typical values')}${quantityAndAlcohol ? `<div class="same-field-of-vision">${quantityAndAlcohol}</div>` : ''}${traceabilityHtml(data)}${storageHtml(data, ['en'])}${businessHtml(data)}${jurisdictionNote ? `<small class="jurisdiction-note">${jurisdictionNote}</small>` : ''}</section>`;
}
