import { printLabelHtml } from '@/data/label/downloadCsv';
import type { MasterLabelData } from './masterLabel';
import { buildLabelPreflight } from './masterLabel';
import { marketProfile } from './marketProfiles';
import { amountPerServing, assessCanadaFop, percentDailyValue } from './regulatoryNutrition';
import { PRINTER_PROFILES } from './printerProfiles';

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const textFor = (value: Record<string, string>, language: string): string =>
  value[language]?.trim() ?? Object.values(value).find((text) => text?.trim()) ?? '';

const primaryText = (value: Record<string, string>, languages: readonly string[]): string =>
  languages.map((language) => value[language]).find((text) => text?.trim()) ?? '';

const n = (value: number | null, digits = 1): string =>
  value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits).replace(/\.0$/, '');

const ingredientDeclaration = (data: MasterLabelData, language: string): string =>
  data.ingredients
    .map((ingredient) => {
      const name = escapeHtml(textFor(ingredient.names, language));
      const factualPercent = `${ingredient.percent.toFixed(1).replace(/\.0$/, '')}%`;
      const declared = ingredient.sourceAllergensText?.trim();
      return declared && !/^none[_ ]declared$/i.test(declared)
        ? `<strong>${name}</strong> (${factualPercent})`
        : `${name} (${factualPercent})`;
    })
    .join(', ');

const safeAllergens = (data: MasterLabelData): string[] =>
  [...new Set([...data.allergens.declared, ...data.allergens.labelStatements])].filter(
    (value) => !/^none[_ ]declared$/i.test(value.trim()),
  );

function euNutrition(data: MasterLabelData, heading: string): string {
  const rows =
    data.nutritionDeclaration?.rows
      .filter((row) => row.key !== 'alcohol')
      .map(
        (row) =>
          `<tr class="${row.indented ? 'indent' : ''}"><th>${escapeHtml(row.label)}</th><td>${escapeHtml(row.valueDisplay ?? '—')}</td></tr>`,
      )
      .join('') ?? '';
  return `<table class="nutrition eu"><caption>${escapeHtml(heading)}</caption><tbody>${rows}</tbody></table>`;
}

function usNutritionFacts(data: MasterLabelData): string {
  const source = data.nutritionSource!;
  const facts = data.regulatoryNutrition;
  const serving = facts.servingQuantityG!;
  const calories = amountPerServing(source.kcal, serving)!;
  const fat = amountPerServing(source.fat_g, serving)!;
  const saturated = amountPerServing(source.saturated_fat_g, serving)!;
  const trans = amountPerServing(facts.transFatGPer100g, serving)!;
  const cholesterol = amountPerServing(facts.cholesterolMgPer100g, serving)!;
  const sodium = amountPerServing(facts.sodiumMgPer100g, serving)!;
  const carbohydrate = amountPerServing(source.carbohydrate_g, serving)!;
  const fibre = amountPerServing(source.fiber_g, serving)!;
  const sugars = amountPerServing(source.sugars_g, serving)!;
  const added = amountPerServing(facts.addedSugarsGPer100g, serving)!;
  const protein = amountPerServing(source.protein_g, serving)!;
  const vitaminD = amountPerServing(facts.vitaminDMcgPer100g, serving)!;
  const calcium = amountPerServing(facts.calciumMgPer100g, serving)!;
  const iron = amountPerServing(facts.ironMgPer100g, serving)!;
  const potassium = amountPerServing(facts.potassiumMgPer100g, serving)!;
  const row = (label: string, amount: string, dv?: number, indent = false) =>
    `<tr class="${indent ? 'indent' : ''}"><th>${label} <span>${amount}</span></th><td>${dv === undefined ? '' : `${dv}%`}</td></tr>`;
  return `<section class="nutrition-facts us"><h2>Nutrition Facts</h2><p>${n(facts.servingsPerContainer, 0)} servings per container</p><p class="serving"><strong>Serving size</strong><strong>${escapeHtml(textFor(facts.servingDescription, 'en'))} (${n(serving, 0)}g)</strong></p><div class="calories"><span>Calories</span><strong>${Math.round(calories)}</strong></div><p class="dv">% Daily Value*</p><table><tbody>${row('Total Fat', `${n(fat)}g`, percentDailyValue(fat, 78))}${row('Saturated Fat', `${n(saturated)}g`, percentDailyValue(saturated, 20), true)}${row('<i>Trans</i> Fat', `${n(trans)}g`, undefined, true)}${row('Cholesterol', `${n(cholesterol, 0)}mg`, percentDailyValue(cholesterol, 300))}${row('Sodium', `${n(sodium, 0)}mg`, percentDailyValue(sodium, 2300))}${row('Total Carbohydrate', `${n(carbohydrate)}g`, percentDailyValue(carbohydrate, 275))}${row('Dietary Fiber', `${n(fibre)}g`, percentDailyValue(fibre, 28), true)}${row('Total Sugars', `${n(sugars)}g`, undefined, true)}${row('Includes Added Sugars', `${n(added)}g`, percentDailyValue(added, 50), true)}${row('Protein', `${n(protein)}g`)}${row('Vitamin D', `${n(vitaminD)}mcg`, percentDailyValue(vitaminD, 20))}${row('Calcium', `${n(calcium, 0)}mg`, percentDailyValue(calcium, 1300))}${row('Iron', `${n(iron)}mg`, percentDailyValue(iron, 18))}${row('Potassium', `${n(potassium, 0)}mg`, percentDailyValue(potassium, 4700))}</tbody></table><small>* Percent Daily Values are based on a 2,000 calorie diet.</small></section>`;
}

function canadaNutritionFacts(data: MasterLabelData): string {
  const source = data.nutritionSource!;
  const facts = data.regulatoryNutrition;
  const serving = facts.servingQuantityG!;
  const amount = (value: number | null) => amountPerServing(value, serving)!;
  const calories = amount(source.kcal);
  const fat = amount(source.fat_g);
  const saturated = amount(source.saturated_fat_g);
  const trans = amount(facts.transFatGPer100g);
  const cholesterol = amount(facts.cholesterolMgPer100g);
  const sodium = amount(facts.sodiumMgPer100g);
  const carbohydrate = amount(source.carbohydrate_g);
  const fibre = amount(source.fiber_g);
  const sugars = amount(source.sugars_g);
  const protein = amount(source.protein_g);
  const potassium = amount(facts.potassiumMgPer100g);
  const calcium = amount(facts.calciumMgPer100g);
  const iron = amount(facts.ironMgPer100g);
  const row = (label: string, amountText: string, dv?: number, indent = false) =>
    `<tr class="${indent ? 'indent' : ''}"><th>${label} <span>${amountText}</span></th><td>${dv === undefined ? '' : `${dv} %`}</td></tr>`;
  return `<section class="nutrition-facts ca"><h2>Nutrition Facts<br><span>Valeur nutritive</span></h2><p class="serving">Per ${escapeHtml(textFor(facts.servingDescription, 'en'))} (${n(serving, 0)} g)<br>pour ${escapeHtml(textFor(facts.servingDescription, 'fr'))} (${n(serving, 0)} g)</p><div class="calories"><span>Calories</span><strong>${Math.round(calories)}</strong></div><p class="dv">% Daily Value* / % valeur quotidienne*</p><table><tbody>${row('Fat / Lipides', `${n(fat)} g`, percentDailyValue(fat, 75))}${row('Saturated / saturés', `${n(saturated)} g`, percentDailyValue(saturated + trans, 20), true)}${row('+ Trans / trans', `${n(trans)} g`, undefined, true)}${row('Carbohydrate / Glucides', `${n(carbohydrate)} g`)}${row('Fibre / Fibres', `${n(fibre)} g`, percentDailyValue(fibre, 28), true)}${row('Sugars / Sucres', `${n(sugars)} g`, percentDailyValue(sugars, 100), true)}${row('Protein / Protéines', `${n(protein)} g`)}${row('Cholesterol / Cholestérol', `${n(cholesterol, 0)} mg`)}${row('Sodium', `${n(sodium, 0)} mg`, percentDailyValue(sodium, 2300))}${row('Potassium', `${n(potassium, 0)} mg`, percentDailyValue(potassium, 3400))}${row('Calcium', `${n(calcium, 0)} mg`, percentDailyValue(calcium, 1300))}${row('Iron / Fer', `${n(iron)} mg`, percentDailyValue(iron, 18))}</tbody></table><small>* 5% or less is a little, 15% or more is a lot<br>* 5 % ou moins c'est peu, 15 % ou plus c'est beaucoup</small></section>`;
}

function auNzNutritionPanel(data: MasterLabelData): string {
  const source = data.nutritionSource!;
  const facts = data.regulatoryNutrition;
  const serving = facts.servingQuantityG!;
  const rows: Array<[string, number, string]> = [
    ['Energy', source.kcal * 4.184, 'kJ'],
    ['Protein', source.protein_g, 'g'],
    ['Fat, total', source.fat_g, 'g'],
    ['- saturated', source.saturated_fat_g!, 'g'],
    ['Carbohydrate', source.carbohydrate_g, 'g'],
    ['- sugars', source.sugars_g!, 'g'],
    ['Sodium', facts.sodiumMgPer100g!, 'mg'],
  ];
  return `<table class="nutrition au"><caption>NUTRITION INFORMATION</caption><thead><tr><th>Servings per package: ${n(facts.servingsPerContainer, 0)}<br>Serving size: ${n(serving, 0)} g</th><th>Quantity per serving</th><th>Quantity per 100 g</th></tr></thead><tbody>${rows.map(([label, per100, unit]) => `<tr><th>${label}</th><td>${n((per100 * serving) / 100)} ${unit}</td><td>${n(per100)} ${unit}</td></tr>`).join('')}</tbody></table>`;
}

function nutritionFor(data: MasterLabelData): string {
  switch (data.market) {
    case 'US':
      return usNutritionFacts(data);
    case 'CA':
      return canadaNutritionFacts(data);
    case 'AU_NZ':
      return auNzNutritionPanel(data);
    case 'UK':
      return euNutrition(data, 'Typical values per 100 g');
    default:
      return euNutrition(data, 'Wartość odżywcza w 100 g');
  }
}

function fopFor(data: MasterLabelData): string {
  if (data.market !== 'CA') return '';
  const assessment = assessCanadaFop(data.nutritionSource, data.regulatoryNutrition);
  if (assessment.state !== 'required' || !data.regulatoryNutrition.canadaFopAssetId) return '';
  return `<img class="canada-fop" src="/labels/canada-fop/${escapeHtml(data.regulatoryNutrition.canadaFopAssetId)}.svg" alt="Health Canada front-of-package nutrition symbol">`;
}

export interface MasterLabelPrintOptions {
  draft?: boolean;
  calibration?: boolean;
}

export function buildMasterLabelPrintHtml(
  data: MasterLabelData,
  logoUrl?: string | null,
  options: MasterLabelPrintOptions = {},
): string {
  const preflight = buildLabelPreflight(data);
  if (!options.draft && !options.calibration && !preflight.readyForSystemPrint) {
    throw new Error('Master Label preflight is incomplete.');
  }
  const profile = marketProfile(data.market);
  const printer = PRINTER_PROFILES[data.printer.profileId];
  const languages = data.market === 'CA' ? ['en', 'fr'] : data.labelLanguages;
  const productName = primaryText(data.productName, languages);
  const legalName = primaryText(data.legalProductName, languages);
  const storage = primaryText(data.storageInstructions, languages);
  const note = primaryText(data.customerNote, languages);
  const origin = primaryText(data.origin, languages);
  const allergens = safeAllergens(data);
  const logo =
    logoUrl && data.enabledOptionalFields.includes('logo')
      ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="">`
      : '';
  const languageBlocks = languages
    .map((language) => {
      const heading = data.market === 'CA' && language === 'fr' ? 'Ingrédients' : 'Ingredients';
      return `<p lang="${escapeHtml(language)}"><strong>${heading}:</strong> ${ingredientDeclaration(data, language)}</p>`;
    })
    .join('');
  const allergenLabel =
    data.market === 'CA' ? 'Contains / Contient' : data.market === 'US' ? 'Contains' : 'Alergeny';
  const allergenBlock =
    allergens.length > 0
      ? `<p class="allergens"><strong>${allergenLabel}:</strong> ${escapeHtml(allergens.join('; '))}</p>`
      : '';
  const optionalOrigin =
    origin && data.enabledOptionalFields.includes('origin')
      ? `<div><dt>Origin</dt><dd>${escapeHtml(origin)}</dd></div>`
      : '';
  const optionalNote =
    note && data.enabledOptionalFields.includes('customer_note')
      ? `<p>${escapeHtml(note)}</p>`
      : '';
  const watermark = options.draft
    ? '<div class="draft-watermark" aria-label="Draft - not for sale">DRAFT<br>NIE DO SPRZEDAŻY</div>'
    : '';
  const calibration = options.calibration
    ? `<article class="label calibration"><div class="calibration-cross tl"></div><div class="calibration-cross br"></div><strong>DRUK TESTOWY</strong><p>${escapeHtml(printer.manufacturer)} ${escapeHtml(printer.model)}</p><p>${data.size.widthMm} × ${data.size.heightMm} mm · ${data.printer.dpi} dpi</p><p>Margines: ${data.printer.marginMm} mm · ${data.printer.orientation}</p></article>`
    : '';
  const marketNutritionReady =
    preflight.items.find((item) => item.field === 'market_nutrition')?.status === 'ready';
  const nutrition = marketNutritionReady
    ? nutritionFor(data)
    : '<section class="nutrition-placeholder"><strong>Nutrition</strong><p>DRAFT — brak kompletnych danych rynku.</p></section>';
  const label =
    calibration ||
    `<article class="label" data-market-layout="${profile.consumerLayout}" data-packaging-context="${data.packagingContext}">${watermark}<div class="market">${escapeHtml(profile.label)} · ${escapeHtml(profile.jurisdiction)} · ${escapeHtml(data.purpose)} · ${escapeHtml(data.packagingContext)}</div><header><span><strong>${escapeHtml(productName)}</strong><small>${escapeHtml(legalName)}</small><small>${escapeHtml(data.businessName)}</small></span>${logo}${fopFor(data)}</header>${languageBlocks}${allergenBlock}${nutrition}<dl><div><dt>${data.market === 'CA' ? 'Net quantity / Quantité nette' : 'Net quantity'}</dt><dd>${data.netQuantityG ?? '—'} g</dd></div><div><dt>LOT</dt><dd>${escapeHtml(data.lotCode)}</dd></div><div><dt>${data.dateMark.kind === 'use_by' ? 'Use by' : 'Best before'}</dt><dd>${escapeHtml(data.dateMark.date ?? '')}</dd></div><div><dt>Storage</dt><dd>${escapeHtml(storage)}</dd></div>${optionalOrigin}</dl><footer>${escapeHtml(data.operator.operatorName)} · ${escapeHtml(data.operator.address)}${optionalNote}<small>${escapeHtml(data.marketProfileVersion)} · run ${escapeHtml(data.sourceCompletionSessionId)}</small></footer></article>`;
  const copies = Array.from(
    { length: Math.max(1, Math.floor(data.printer.copies ?? data.copies)) },
    () => label,
  ).join('');
  const pageSize =
    data.printer.profileId === 'system_a4_letter'
      ? 'A4'
      : `${data.size.widthMm}mm ${data.size.heightMm}mm`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(options.calibration ? 'Druk testowy' : productName)}</title><style>@page{size:${pageSize};margin:${data.printer.marginMm}mm}*{box-sizing:border-box}body{margin:0;color:#111;background:#fff;font-family:Arial,"Helvetica Neue",sans-serif}.sheet{display:flex;flex-wrap:wrap;gap:4mm}.label{position:relative;width:${data.size.widthMm}mm;height:${data.size.heightMm}mm;overflow:hidden;border:.25mm solid #111;padding:4mm;font-size:9pt;line-height:1.2;break-inside:avoid;${data.format === 'round' ? 'border-radius:50%;padding:10mm;' : ''}}.market{border-bottom:.2mm solid #888;padding-bottom:1mm;margin-bottom:2mm;font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em}header{display:flex;align-items:flex-start;justify-content:space-between;gap:3mm;border-bottom:.5mm solid #111;padding-bottom:2mm;margin-bottom:2mm}header span{display:flex;flex-direction:column}header>span>strong{font-size:15pt}.logo{max-width:22mm;max-height:12mm;object-fit:contain}.canada-fop{width:28mm;height:auto}small{font-size:6.5pt}p{margin:1.5mm 0}.allergens{border-block:.2mm solid #111;padding:1mm 0}.nutrition{width:100%;border-collapse:collapse}.nutrition-placeholder{border:.4mm dashed #8a5b23;padding:2mm;color:#8a5b23}.nutrition caption{text-align:left;font-weight:700;padding:1mm 0}.nutrition th,.nutrition td{padding:.45mm 0;border-bottom:.15mm solid #aaa;text-align:left}.nutrition td{text-align:right}.nutrition .indent th{padding-left:3mm}.nutrition-facts{border:1mm solid #111;padding:1.4mm;font-family:Arial,"Helvetica Neue",sans-serif}.nutrition-facts h2{margin:0;border-bottom:2.5mm solid #111;font-size:20pt;line-height:.9}.nutrition-facts h2 span{font-size:14pt}.nutrition-facts p{margin:.5mm 0}.nutrition-facts .serving{display:flex;justify-content:space-between;border-bottom:1.5mm solid #111}.nutrition-facts.ca .serving{display:block}.nutrition-facts .calories{display:flex;align-items:end;justify-content:space-between;border-bottom:1mm solid #111;font-size:12pt;font-weight:700}.nutrition-facts .calories strong{font-size:24pt;line-height:1}.nutrition-facts .dv{text-align:right;font-weight:700}.nutrition-facts table{width:100%;border-collapse:collapse}.nutrition-facts th,.nutrition-facts td{border-top:.2mm solid #111;text-align:left;padding:.4mm 0}.nutrition-facts td{text-align:right;font-weight:700}.nutrition-facts .indent th{padding-left:3mm;font-weight:400}.nutrition.au thead{border-block:1mm solid #111}.nutrition.au th,.nutrition.au td{border:.2mm solid #111;padding:.8mm}dl{margin:2mm 0}dl div{display:flex;justify-content:space-between;gap:3mm}dt,dd{margin:0}footer{border-top:.25mm solid #111;padding-top:2mm;display:flex;flex-direction:column}.draft-watermark{position:absolute;inset:35% -10%;z-index:5;transform:rotate(-22deg);border-block:1.5mm solid rgba(140,20,20,.25);color:rgba(140,20,20,.24);font-size:23pt;font-weight:900;text-align:center;pointer-events:none}.calibration{display:grid;place-content:center;text-align:center;border:1mm solid #111}.calibration-cross{position:absolute;width:8mm;height:8mm}.calibration-cross:before,.calibration-cross:after{content:"";position:absolute;background:#111}.calibration-cross:before{left:50%;width:.3mm;height:100%}.calibration-cross:after{top:50%;width:100%;height:.3mm}.calibration-cross.tl{top:2mm;left:2mm}.calibration-cross.br{right:2mm;bottom:2mm}</style></head><body><main class="sheet">${copies}</main></body></html>`;
}

export function printMasterLabel(
  data: MasterLabelData,
  logoUrl?: string | null,
  options?: MasterLabelPrintOptions,
): void {
  printLabelHtml(buildMasterLabelPrintHtml(data, logoUrl, options));
}
