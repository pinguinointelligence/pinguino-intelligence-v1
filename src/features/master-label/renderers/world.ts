import type { MasterLabelData } from '../masterLabel';
import { gtinBarcodeSvg, lotBarcodeSvg, normalizeConfirmedGtin, qrCodeSvg } from '../machineCodes';
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

const neutralGram = (value: number): string => `${value.toFixed(1)} g`;

export function renderWorldNutrition(data: MasterLabelData): string {
  const nutrition = data.nutritionSource;
  if (!nutrition || nutrition.saturated_fat_g === null || nutrition.sugars_g === null) return '';
  const rows: Array<[string, string, boolean]> = [
    [
      'Energy',
      `${Math.round(nutrition.kcal * 4.184)} kJ / ${Math.round(nutrition.kcal)} kcal`,
      false,
    ],
    ['Fat', neutralGram(nutrition.fat_g), false],
    ['of which saturates', neutralGram(nutrition.saturated_fat_g), true],
    ['Carbohydrate', neutralGram(nutrition.carbohydrate_g), false],
    ['of which sugars', neutralGram(nutrition.sugars_g), true],
  ];
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
  const allergens = allergenDisplayValues(data);
  const optionalDescription =
    data.enabledOptionalFields.includes('short_description') && description
      ? `<p class="short-description">${escapeHtml(description)}</p>`
      : '';
  return `<section class="market-renderer world-renderer" data-universal-profile="informational" data-regulatory-renderer="world-neutral-v1"><header class="identity"><h1>${escapeHtml(product)}</h1>${optionalDescription}</header><p class="ingredients"><strong>Ingredients:</strong> ${ingredientDeclarationHtml(data, languages[0] ?? 'en')}</p>${allergens.length ? `<p class="contains"><strong>Contains:</strong> ${escapeHtml(allergens.join(', '))}</p>` : ''}${data.allergens.mayContain.length ? `<p class="may-contain"><strong>May contain:</strong> ${escapeHtml(data.allergens.mayContain.join(', '))}</p>` : ''}${renderWorldNutrition(data)}${netQuantityHtml(data, 'Net weight')}${traceabilityHtml(data)}${storageHtml(data, languages)}${originHtml(data, languages)}${businessHtml(data)}${data.enabledOptionalFields.includes('internal_article_id') && data.internalArticleId ? `<p class="article-id">Article ID: ${escapeHtml(data.internalArticleId)}</p>` : ''}${machineCodesHtml(data)}</section>`;
}
