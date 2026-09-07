import type { MasterLabelData } from '../masterLabel';
import { gtinBarcodeSvg, lotBarcodeSvg, normalizeConfirmedGtin, qrCodeSvg } from '../machineCodes';
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
import { worldInformationalWarningHtml } from '../worldUniversal';

const neutralGram = (value: number): string => `${value.toFixed(1)} g`;

export function renderWorldNutrition(data: MasterLabelData): string {
  const nutrition = data.nutritionSource;
  if (!nutrition || nutrition.sugars_g === null) return '';
  const rows: Array<[string, string, boolean]> = [
    [
      'Energy',
      `${Math.round(nutrition.kcal * 4.184)} kJ / ${Math.round(nutrition.kcal)} kcal`,
      false,
    ],
    ['Fat', neutralGram(nutrition.fat_g), false],
    ['Carbohydrate', neutralGram(nutrition.carbohydrate_g), false],
  ];
  if (nutrition.saturated_fat_g !== null) {
    rows.splice(2, 0, ['of which saturates', neutralGram(nutrition.saturated_fat_g), true]);
  }
  if (nutrition.sugars_g !== null) {
    rows.push(['of which sugars', neutralGram(nutrition.sugars_g), true]);
  }
  if (nutrition.fiber_g !== null) rows.push(['Fibre', neutralGram(nutrition.fiber_g), false]);
  rows.push(['Protein', neutralGram(nutrition.protein_g), false]);
  rows.push(['Salt', `${nutrition.salt_g.toFixed(2)} g`, false]);
  return `<table class="nutrition-table world-nutrition"><caption>Nutrition per 100 g</caption><tbody>${rows
    .map(
      ([label, value, indent]) =>
        `<tr class="${indent ? 'indent' : ''}"><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

function machineCodesHtml(data: MasterLabelData): string {
  const qr = data.enabledOptionalFields.includes('qr_code') ? qrCodeSvg(data.qrCodeValue) : null;
  const lot = data.enabledOptionalFields.includes('lot_barcode')
    ? lotBarcodeSvg(data.lotCode)
    : null;
  const gtin = data.enabledOptionalFields.includes('gtin') ? gtinBarcodeSvg(data.gtin) : null;
  const confirmedGtin = normalizeConfirmedGtin(data.gtin);
  const codes = [
    qr ? `<div class="machine-code qr">${qr}</div>` : '',
    lot ? `<div class="machine-code lot">${lot}</div>` : '',
    gtin
      ? `<div class="machine-code gtin">${gtin}<small>GTIN ${escapeHtml(confirmedGtin ?? '')}</small></div>`
      : '',
  ].filter(Boolean);
  return codes.length ? `<div class="machine-codes">${codes.join('')}</div>` : '';
}

export function renderWorldLabel(data: MasterLabelData): string {
  const languages = data.labelLanguages.length > 0 ? data.labelLanguages : ['en'];
  const product = primaryText(data.productName, languages);
  const description = primaryText(data.shortDescription ?? {}, languages);
  const optionalDescription =
    data.enabledOptionalFields.includes('short_description') && description
      ? `<p class="short-description">${escapeHtml(description)}</p>`
      : '';
  const ingredients = ingredientDeclarationHtml(data, languages[0] ?? 'en');
  const identity =
    product || optionalDescription
      ? `<header class="identity">${product ? `<h1>${escapeHtml(product)}</h1>` : ''}${optionalDescription}</header>`
      : '';
  return `<section class="market-renderer world-renderer" data-universal-profile="informational" data-regulatory-renderer="world-neutral-v1">${worldInformationalWarningHtml()}${identity}${ingredients ? `<p class="ingredients"><strong>Ingredients:</strong> ${ingredients}</p>` : ''}${allergenStatementHtml(data)}${renderWorldNutrition(data)}${netQuantityHtml(data, 'Net weight')}${traceabilityHtml(data)}${storageHtml(data, languages)}${originHtml(data, languages)}${businessHtml(data)}${data.enabledOptionalFields.includes('internal_article_id') && data.internalArticleId ? `<p class="article-id">Article ID: ${escapeHtml(data.internalArticleId)}</p>` : ''}${machineCodesHtml(data)}</section>`;
}
