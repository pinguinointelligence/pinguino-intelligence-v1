import type { MasterLabelData } from '../masterLabel';
import {
  amountPerServing,
  percentDailyValue,
  resolveUsFormatFamily,
  roundUsCalories,
  roundUsCalciumMg,
  roundUsCholesterolMg,
  roundUsFatGrams,
  roundUsIronMg,
  roundUsPotassiumMg,
  roundUsSodiumMg,
  roundUsServingsPerContainer,
  roundUsVitaminDMcg,
  roundUsVitaminMineralPercentDv,
  roundUsWholeGram,
} from '../regulatoryNutrition';
import {
  allergenDisplayValues,
  businessHtml,
  escapeHtml,
  ingredientDeclarationHtml,
  primaryText,
  storageHtml,
  textFor,
  traceabilityHtml,
} from './shared';

const US_DV = Object.freeze({
  fat: 78,
  saturatedFat: 20,
  cholesterol: 300,
  sodium: 2300,
  carbohydrate: 275,
  fibre: 28,
  addedSugars: 50,
  vitaminD: 20,
  calcium: 1300,
  iron: 18,
  potassium: 4700,
});

const display = (value: number | '<1' | '<5', unit: string): string => `${value}${unit}`;

const netContents = (data: MasterLabelData): string => {
  const quantity = data.packageQuantity;
  if (!quantity) return 'NET WT —';
  if (quantity.netWeightG && quantity.netWeightG > 0) {
    const oz = quantity.netWeightG / 28.349523125;
    return `NET WT ${oz.toFixed(1)} OZ (${quantity.netWeightG.toFixed(0)} g)`;
  }
  if (quantity.netVolumeMl && quantity.netVolumeMl > 0) {
    const flOz = quantity.netVolumeMl / 29.5735295625;
    return `NET ${flOz.toFixed(1)} FL OZ (${quantity.netVolumeMl.toFixed(0)} mL)`;
  }
  return 'NET WT —';
};

interface FdaRow {
  label: string;
  amount: string;
  dv?: number;
  indent?: 1 | 2;
  italic?: boolean;
}

export function renderFdaNutritionFacts(data: MasterLabelData): string {
  const source = data.nutritionSource;
  const facts = data.regulatoryNutrition;
  const serving = facts.servingQuantityG;
  if (!source || !serving || source.saturated_fat_g === null || source.sugars_g === null) return '';
  const format = resolveUsFormatFamily(facts, data.packageQuantity?.netWeightG ?? null);
  const buildRows = (quantityG: number): FdaRow[] => {
    const amount = (value: number | null | undefined): number =>
      amountPerServing(value ?? null, quantityG) ?? 0;
    const fat = amount(source.fat_g);
    const saturated = amount(source.saturated_fat_g);
    const trans = amount(facts.transFatGPer100g);
    const cholesterol = amount(facts.cholesterolMgPer100g);
    const sodium = amount(facts.sodiumMgPer100g);
    const carbohydrate = amount(source.carbohydrate_g);
    const fibre = amount(source.fiber_g);
    const sugars = amount(source.sugars_g);
    const added = amount(facts.addedSugarsGPer100g);
    const protein = amount(source.protein_g);
    const vitaminD = amount(facts.vitaminDMcgPer100g);
    const calcium = amount(facts.calciumMgPer100g);
    const iron = amount(facts.ironMgPer100g);
    const potassium = amount(facts.potassiumMgPer100g);
    const cholesterolRounded = roundUsCholesterolMg(cholesterol);
    return [
      {
        label: 'Total Fat',
        amount: display(roundUsFatGrams(fat), 'g'),
        dv: percentDailyValue(fat, US_DV.fat),
      },
      {
        label: 'Saturated Fat',
        amount: display(roundUsFatGrams(saturated), 'g'),
        dv: percentDailyValue(saturated, US_DV.saturatedFat),
        indent: 1,
      },
      { label: 'Trans Fat', amount: display(roundUsFatGrams(trans), 'g'), indent: 1, italic: true },
      {
        label: 'Cholesterol',
        amount: display(cholesterolRounded, 'mg'),
        dv: percentDailyValue(cholesterol, US_DV.cholesterol),
      },
      {
        label: 'Sodium',
        amount: display(roundUsSodiumMg(sodium), 'mg'),
        dv: percentDailyValue(sodium, US_DV.sodium),
      },
      {
        label: 'Total Carbohydrate',
        amount: display(roundUsWholeGram(carbohydrate), 'g'),
        dv: percentDailyValue(carbohydrate, US_DV.carbohydrate),
      },
      {
        label: 'Dietary Fiber',
        amount: display(roundUsWholeGram(fibre), 'g'),
        dv: percentDailyValue(fibre, US_DV.fibre),
        indent: 1,
      },
      { label: 'Total Sugars', amount: display(roundUsWholeGram(sugars), 'g'), indent: 1 },
      {
        label: 'Includes',
        amount: `${display(roundUsWholeGram(added), 'g')} Added Sugars`,
        dv: percentDailyValue(added, US_DV.addedSugars),
        indent: 2,
      },
      { label: 'Protein', amount: display(roundUsWholeGram(protein), 'g') },
      {
        label: 'Vitamin D',
        amount: `${roundUsVitaminDMcg(vitaminD)}mcg`,
        dv: roundUsVitaminMineralPercentDv(vitaminD, US_DV.vitaminD),
      },
      {
        label: 'Calcium',
        amount: `${roundUsCalciumMg(calcium)}mg`,
        dv: roundUsVitaminMineralPercentDv(calcium, US_DV.calcium),
      },
      {
        label: 'Iron',
        amount: `${roundUsIronMg(iron)}mg`,
        dv: roundUsVitaminMineralPercentDv(iron, US_DV.iron),
      },
      {
        label: 'Potassium',
        amount: `${roundUsPotassiumMg(potassium)}mg`,
        dv: roundUsVitaminMineralPercentDv(potassium, US_DV.potassium),
      },
    ];
  };
  const rows = buildRows(serving);
  const packageWeight = data.packageQuantity?.netWeightG ?? serving;
  const containerRows = format === 'dual_column' ? buildRows(packageWeight) : [];
  const rowHtml = rows
    .map((row, index) => {
      const container = containerRows[index];
      return format === 'dual_column'
        ? `<tr class="indent-${row.indent ?? 0}"><th>${row.italic ? '<i>' : ''}${escapeHtml(row.label)}${row.italic ? '</i>' : ''}</th><td>${escapeHtml(row.amount)}${row.dv === undefined ? '' : ` · ${row.dv}%`}</td><td>${escapeHtml(container?.amount ?? '')}${container?.dv === undefined ? '' : ` · ${container.dv}%`}</td></tr>`
        : `<tr class="indent-${row.indent ?? 0}"><th>${row.italic ? '<i>' : ''}${escapeHtml(row.label)}${row.italic ? '</i>' : ''} <span>${escapeHtml(row.amount)}</span></th><td>${row.dv === undefined ? '' : `${row.dv}%`}</td></tr>`;
    })
    .join('');
  const servingText = textFor(facts.servingDescription, 'en') || '2/3 cup';
  const servings = roundUsServingsPerContainer(facts.servingsPerContainer ?? 0);
  const servingsLine =
    servings === '1' ? '1 serving per container' : `About ${servings} servings per container`;
  const dualHeading =
    format === 'dual_column'
      ? '<div class="dual-column-heading"><span></span><strong>Per serving</strong><strong>Per container</strong></div>'
      : '';
  const servingCalories = roundUsCalories(amountPerServing(source.kcal, serving) ?? 0);
  const packageCalories = roundUsCalories(amountPerServing(source.kcal, packageWeight) ?? 0);
  const caloriesHtml =
    format === 'dual_column'
      ? `<div class="calories dual"><span>Calories</span><strong>${servingCalories}</strong><strong>${packageCalories}</strong></div>`
      : `<div class="calories"><span>Calories</span><strong>${servingCalories}</strong></div>`;
  if (format === 'linear') {
    const nutrients = rows
      .map(
        (row) =>
          `<span><strong>${escapeHtml(row.label)}</strong> ${escapeHtml(row.amount)}${row.dv === undefined ? '' : ` ${row.dv}% DV`}</span>`,
      )
      .join(' · ');
    return `<section class="nutrition-facts us fda compact linear format-linear" data-format-family="linear"><h2>Nutrition Facts</h2><p class="linear-facts"><strong>${escapeHtml(servingsLine)}</strong> · <strong>Serving size</strong> ${escapeHtml(servingText)} (${Math.round(serving)}g) · <strong>Calories ${servingCalories}</strong> · ${nutrients}</p><small>% DV = % Daily Value</small></section>`;
  }
  if (format === 'tabular') {
    const midpoint = Math.ceil(rows.length / 2);
    const compactTable = (items: FdaRow[]) =>
      `<table><tbody>${items
        .map(
          (row) =>
            `<tr><th>${escapeHtml(row.label)} ${escapeHtml(row.amount)}</th><td>${row.dv === undefined ? '' : `${row.dv}%`}</td></tr>`,
        )
        .join('')}</tbody></table>`;
    return `<section class="nutrition-facts us fda compact tabular format-tabular" data-format-family="tabular"><div class="tabular-heading"><h2>Nutrition Facts</h2><div><strong>${escapeHtml(servingsLine)}</strong><br><strong>Serving size</strong> ${escapeHtml(servingText)} (${Math.round(serving)}g)</div><div><span>Calories</span><strong>${servingCalories}</strong></div></div><p class="daily-value">% Daily Value*</p><div class="tabular-columns">${compactTable(rows.slice(0, midpoint))}${compactTable(rows.slice(midpoint))}</div><small>% DV = % Daily Value</small></section>`;
  }
  return `<section class="nutrition-facts us fda format-${format}" data-format-family="${format}"><h2>Nutrition Facts</h2><p class="servings">${escapeHtml(servingsLine)}</p><p class="serving-size"><strong>Serving size</strong><strong>${escapeHtml(servingText)} (${Math.round(serving)}g)</strong></p>${dualHeading}${format === 'dual_column' ? '' : '<div class="amount-heading">Amount per serving</div>'}${caloriesHtml}<p class="daily-value">% Daily Value*</p><table><tbody>${rowHtml}</tbody></table><small class="fda-footnote">* The % Daily Value (DV) tells you how much a nutrient in a serving of food contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.</small></section>`;
}

export function renderUsLabel(data: MasterLabelData): string {
  const product = primaryText(data.productName, ['en']);
  const identity = primaryText(data.legalProductName, ['en']);
  const allergens = allergenDisplayValues(data);
  return `<section class="market-renderer us-renderer" data-regulatory-renderer="fda-nutrition-facts-v2"><div class="principal-display-panel"><h1>${escapeHtml(identity || product)}</h1><p class="brand-name">${escapeHtml(data.businessName || product)}</p><strong class="us-net-contents">${escapeHtml(netContents(data))}</strong></div>${renderFdaNutritionFacts(data)}<p class="ingredients"><strong>Ingredients:</strong> ${ingredientDeclarationHtml(data, 'en')}</p>${allergens.length ? `<p class="contains"><strong>Contains:</strong> ${escapeHtml(allergens.join(', '))}</p>` : ''}${storageHtml(data, ['en'])}${traceabilityHtml(data)}${businessHtml(data)}</section>`;
}
