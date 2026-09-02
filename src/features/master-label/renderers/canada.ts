import type { MasterLabelData } from '../masterLabel';
import { canadianFrenchAllergenName } from '../allergenTaxonomy';
import {
  amountPerServing,
  assessCanadaFop,
  percentDailyValue,
  roundCanadaCalories,
  roundCanadaCholesterolMg,
  roundCanadaFatGrams,
  roundCanadaIronMg,
  roundCanadaMg,
  roundCanadaPotassiumCalciumMg,
  roundCanadaProteinGrams,
} from '../regulatoryNutrition';
import {
  allergenDisplayValues,
  businessHtml,
  escapeHtml,
  ingredientDeclarationHtml,
  netQuantityHtml,
  primaryText,
  storageHtml,
  textFor,
  traceabilityHtml,
} from './shared';

const CANADA_DV = Object.freeze({
  fat: 75,
  saturatedAndTrans: 20,
  fibre: 28,
  sugars: 100,
  sodium: 2300,
  potassium: 3400,
  calcium: 1300,
  iron: 18,
});

export function renderCanadianNutritionFacts(data: MasterLabelData): string {
  const source = data.nutritionSource;
  const facts = data.regulatoryNutrition;
  const serving = facts.servingQuantityG;
  if (!source || !serving || source.saturated_fat_g === null || source.sugars_g === null) return '';
  const amount = (value: number | null | undefined): number =>
    amountPerServing(value ?? null, serving) ?? 0;
  const fat = amount(source.fat_g);
  const saturated = amount(source.saturated_fat_g);
  const trans = amount(facts.transFatGPer100g);
  const carbohydrate = amount(source.carbohydrate_g);
  const fibre = amount(source.fiber_g);
  const sugars = amount(source.sugars_g);
  const protein = amount(source.protein_g);
  const cholesterol = amount(facts.cholesterolMgPer100g);
  const sodium = amount(facts.sodiumMgPer100g);
  const potassium = amount(facts.potassiumMgPer100g);
  const calcium = amount(facts.calciumMgPer100g);
  const iron = amount(facts.ironMgPer100g);
  const row = (label: string, amountText: string, dv?: number, indent = false) =>
    `<tr class="${indent ? 'indent' : ''}"><th>${label} <span>${amountText}</span></th><td>${dv === undefined ? '' : `${dv} %`}</td></tr>`;
  const family = 'bilingual_standard';
  const servingVolume = facts.servingVolumeMl ? `${Math.round(facts.servingVolumeMl)} mL` : '— mL';
  return `<section class="nutrition-facts canada format-${family}" data-format-family="${family}" data-directory-figure="3.4(B)" data-software-footprint-cm2="29.7"><h2>Nutrition Facts<br><span>Valeur nutritive</span></h2><p class="serving">Per ${escapeHtml(textFor(facts.servingDescription, 'en'))} (${servingVolume})<br>pour ${escapeHtml(textFor(facts.servingDescription, 'fr'))} (${servingVolume})</p><div class="calories"><span>Calories</span><strong>${roundCanadaCalories(amount(source.kcal))}</strong></div><p class="daily-value">% Daily Value* / % valeur quotidienne*</p><table><tbody>${row('Fat / Lipides', `${roundCanadaFatGrams(fat)} g`, percentDailyValue(fat, CANADA_DV.fat))}${row('Saturated / saturés', `${roundCanadaFatGrams(saturated)} g`, percentDailyValue(saturated + trans, CANADA_DV.saturatedAndTrans), true)}${row('+ Trans / trans', `${roundCanadaFatGrams(trans)} g`, undefined, true)}${row('Carbohydrate / Glucides', `${Math.round(carbohydrate)} g`)}${row('Fibre / Fibres', `${Math.round(fibre)} g`, percentDailyValue(fibre, CANADA_DV.fibre), true)}${row('Sugars / Sucres', `${Math.round(sugars)} g`, percentDailyValue(sugars, CANADA_DV.sugars), true)}${row('Protein / Protéines', `${roundCanadaProteinGrams(protein)} g`)}${row('Cholesterol / Cholestérol', `${roundCanadaCholesterolMg(cholesterol)} mg`)}${row('Sodium', `${roundCanadaMg(sodium)} mg`, percentDailyValue(sodium, CANADA_DV.sodium))}${row('Potassium', `${roundCanadaPotassiumCalciumMg(potassium)} mg`, percentDailyValue(potassium, CANADA_DV.potassium))}${row('Calcium', `${roundCanadaPotassiumCalciumMg(calcium)} mg`, percentDailyValue(calcium, CANADA_DV.calcium))}${row('Iron / Fer', `${roundCanadaIronMg(iron)} mg`, percentDailyValue(iron, CANADA_DV.iron))}</tbody></table><small>* 5% or less is a little, 15% or more is a lot<br>* 5 % ou moins c'est peu, 15 % ou plus c'est beaucoup</small></section>`;
}

function canadaFopHtml(data: MasterLabelData): string {
  const assessment = assessCanadaFop(data.nutritionSource, data.regulatoryNutrition);
  const assetId = data.regulatoryNutrition.canadaFopAssetId;
  const packageVersion = data.regulatoryNutrition.canadaFopAssetPackageVersion;
  if (assessment.state !== 'required' || !assetId || !packageVersion) return '';
  return `<img class="canada-fop official-authority-asset" src="/regulatory/canada-fop/${encodeURIComponent(assetId)}.svg" alt="Health Canada front-of-package nutrition symbol" data-official-package-version="${escapeHtml(packageVersion)}">`;
}

export function renderCanadaLabel(data: MasterLabelData): string {
  const productEn = primaryText(data.productName, ['en']);
  const productFr = primaryText(data.productName, ['fr']);
  const commonEn = primaryText(data.legalProductName, ['en']);
  const commonFr = primaryText(data.legalProductName, ['fr']);
  const allergensEn = allergenDisplayValues(data);
  const allergensFr = allergensEn.map(canadianFrenchAllergenName);
  return `<section class="market-renderer canada-renderer" data-regulatory-renderer="canada-nft-v2"><header class="identity bilingual"><div lang="en"><h1>${escapeHtml(productEn)}</h1><p>${escapeHtml(commonEn)}</p></div><div lang="fr"><h1>${escapeHtml(productFr)}</h1><p>${escapeHtml(commonFr)}</p></div>${canadaFopHtml(data)}</header><p class="ingredients" lang="en"><strong>Ingredients:</strong> ${ingredientDeclarationHtml(data, 'en')}</p><p class="ingredients" lang="fr"><strong>Ingrédients:</strong> ${ingredientDeclarationHtml(data, 'fr')}</p>${allergensEn.length ? `<p class="contains"><strong>Contains / Contient:</strong> ${escapeHtml(allergensEn.join(', '))} / ${escapeHtml(allergensFr.join(', '))}</p>` : ''}${renderCanadianNutritionFacts(data)}${netQuantityHtml(data, 'Net quantity / Quantité nette')}${traceabilityHtml(data, true)}${storageHtml(data, ['en', 'fr'], ['Storage', 'Conservation'])}${businessHtml(data, true)}</section>`;
}
