import type { MasterLabelData } from '../masterLabel';
import {
  allergenDisplayValues,
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
  const allergens = allergenDisplayValues(data);
  const region = data.jurisdictionContext?.ukRegion ?? 'unresolved';
  const ppds = data.packagingContext === 'ppds';
  const alcohol =
    data.alcoholDeclarationApplicability === 'required_beverage_over_1_2' &&
    data.alcoholDeclarationReviewed
      ? `<div><span>Actual alcohol</span><strong>${data.alcoholByVolumePercent}% vol</strong></div>`
      : '';
  return `<section class="market-renderer uk-renderer ${ppds ? 'ppds' : 'prepacked'}" data-regulatory-renderer="uk-label-v2" data-uk-region="${region}"><header class="identity"><h1>${escapeHtml(product)}</h1><p>${escapeHtml(legalName)}</p>${ppds ? '<strong class="context-mark">PPDS · full ingredients and emphasised allergens</strong>' : ''}</header><p class="ingredients" lang="en"><strong>Ingredients:</strong> ${ingredientDeclarationHtml(data, 'en')}</p>${allergens.length ? `<p class="contains"><strong>Contains:</strong> ${escapeHtml(allergens.join(', '))}</p>` : ''}${renderEuNutrition(data).replace('Nutrition declaration', 'Typical values')}<div class="same-field-of-vision">${netQuantityHtml(data)}${alcohol}</div>${traceabilityHtml(data)}${storageHtml(data, ['en'])}${businessHtml(data)}<small class="jurisdiction-note">${region === 'NI' ? 'Northern Ireland · NI/EU responsible business address rules' : 'Great Britain · UK responsible business address rules'}</small></section>`;
}
