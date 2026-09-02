import notoBoldDataUrl from '@/assets/fonts/NotoSans-Bold.ttf?inline';
import notoRegularDataUrl from '@/assets/fonts/NotoSans-Regular.ttf?inline';
import type { PDFFont, PDFImage, PDFPage, RGB } from 'pdf-lib';
import type { RenderOptions } from 'bwip-js/browser';
import type { MasterLabelData } from './masterLabel';
import { buildLabelPreflight, packageQuantityForDisplay } from './masterLabel';
import type { MasterLabelPrintOptions } from './masterLabelPrint';
import {
  amountPerServing,
  percentDailyValue,
  roundCanadaCalories,
  roundCanadaCholesterolMg,
  roundCanadaFatGrams,
  roundCanadaIronMg,
  roundCanadaMg,
  roundCanadaPotassiumCalciumMg,
  roundCanadaProteinGrams,
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
  resolveUsFormatFamily,
} from './regulatoryNutrition';
import {
  allergenDisplayValues,
  allergenEmphasisTerms,
  ingredientDeclarationText,
  primaryText,
  textFor,
} from './renderers/shared';
import { normalizeConfirmedGtin } from './machineCodes';
import { responsibleBusinessDetails } from './businessAuthority';
import { canadianFrenchAllergenName } from './allergenTaxonomy';
import { resolveMasterLabelLogoUrl } from './labelBrand';
import { WORLD_INFORMATIONAL_WARNING_LINES } from './worldUniversal';

const POINTS_PER_MM = 72 / 25.4;
const MAX_RASTER_DPI = 600;

export interface MasterLabelPdfArtifact {
  bytes: Uint8Array;
  filename: string;
  pageCount: number;
  widthMm: number;
  heightMm: number;
  rasterDpi: number;
  textMode: 'embedded_vector';
}

export interface PdfRasterAsset {
  bytes: Uint8Array;
  mimeType: 'image/png' | 'image/jpeg';
}

export interface MasterLabelPdfOptions extends MasterLabelPrintOptions {
  download?: boolean;
  logo?: PdfRasterAsset | null;
  canadaFop?: PdfRasterAsset | null;
  machineCodes?: Array<PdfRasterAsset & { kind: 'qr' | 'lot' | 'gtin' }>;
}

interface PdfFonts {
  regular: PDFFont;
  bold: PDFFont;
}

interface DrawContext {
  page: PDFPage;
  fonts: PdfFonts;
  width: number;
  height: number;
  margin: number;
  y: number;
  baseFont: number;
  colors: { black: RGB; white: RGB };
}

interface PdfNutritionRow {
  label: string;
  value: string;
  dv?: string;
  containerValue?: string;
  containerDv?: string;
  indent?: number;
}

const mmToPoints = (millimetres: number): number => millimetres * POINTS_PER_MM;

const safePdfDate = (value: string): Date => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date('2000-01-01T00:00:00.000Z');
};

const filenamePart = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const usNetContentsText = (data: MasterLabelData): string => {
  const quantity = data.packageQuantity;
  if (quantity?.netWeightG && quantity.netWeightG > 0) {
    return `NET WT ${(quantity.netWeightG / 28.349523125).toFixed(1)} OZ (${quantity.netWeightG.toFixed(0)} g)`;
  }
  if (quantity?.netVolumeMl && quantity.netVolumeMl > 0) {
    return `NET ${(quantity.netVolumeMl / 29.5735295625).toFixed(1)} FL OZ (${quantity.netVolumeMl.toFixed(0)} mL)`;
  }
  return 'NET CONTENTS —';
};

const decodeDataUrl = (value: string): Uint8Array => {
  const comma = value.indexOf(',');
  const payload = comma >= 0 ? value.slice(comma + 1) : value;
  const binary = globalThis.atob(payload);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export function masterLabelPdfFilename(data: MasterLabelData, draft = false): string {
  const prefix = draft ? 'gellatti-draft' : 'gellatti-label';
  const identity = filenamePart(data.lotCode || data.masterLabelId) || 'snapshot';
  return `${prefix}-${identity}-${data.market.toLowerCase()}-${data.size.widthMm}x${data.size.heightMm}mm.pdf`;
}

export function masterLabelPdfGeometry(data: MasterLabelData): {
  widthPoints: number;
  heightPoints: number;
  rasterDpi: number;
  copies: number;
} {
  return {
    widthPoints: mmToPoints(data.size.widthMm),
    heightPoints: mmToPoints(data.size.heightMm),
    rasterDpi: Math.min(MAX_RASTER_DPI, Math.max(203, data.printer.dpi)),
    copies: Math.max(1, Math.floor(data.printer.copies ?? data.copies)),
  };
}

const lineHeight = (size: number): number => size * 1.28;

function assertPdfSpace(context: DrawContext, height: number): void {
  if (context.y - height < context.margin) {
    throw new Error(
      'PDF_LAYOUT_OVERFLOW: Ten format jest za mały dla tej etykiety. Wybierz większy rozmiar.',
    );
  }
}

function splitText(text: string, font: PDFFont, size: number, maximumWidth: number): string[] {
  const paragraphs = text.split(/\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maximumWidth) {
        line = candidate;
      } else if (line) {
        lines.push(line);
        line = word;
      } else {
        let fragment = '';
        for (const character of word) {
          const next = fragment + character;
          if (font.widthOfTextAtSize(next, size) > maximumWidth && fragment) {
            lines.push(fragment);
            fragment = character;
          } else {
            fragment = next;
          }
        }
        line = fragment;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawWrapped(
  context: DrawContext,
  text: string,
  options: { font?: PDFFont; size?: number; indent?: number; after?: number } = {},
): void {
  const font = options.font ?? context.fonts.regular;
  const size = options.size ?? context.baseFont;
  const indent = options.indent ?? 0;
  const maximumWidth = context.width - context.margin * 2 - indent;
  const lines = splitText(text, font, size, maximumWidth);
  const required = lines.length * lineHeight(size) + (options.after ?? 0);
  assertPdfSpace(context, required);
  for (const line of lines) {
    context.page.drawText(line, {
      x: context.margin + indent,
      y: context.y - size,
      size,
      font,
    });
    context.y -= lineHeight(size);
  }
  context.y -= options.after ?? 0;
}

function drawRule(context: DrawContext, thickness = 0.5, after = 3): void {
  assertPdfSpace(context, thickness + after);
  context.page.drawLine({
    start: { x: context.margin, y: context.y },
    end: { x: context.width - context.margin, y: context.y },
    thickness,
  });
  context.y -= thickness + after;
}

function normalizeMatch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
    .toLowerCase();
}

function drawAllergenRichText(
  context: DrawContext,
  prefix: string,
  declaration: string,
  terms: readonly string[],
): void {
  const words = `${prefix}${declaration}`.split(/(\s+)/);
  const normalizedTerms = terms.map(normalizeMatch).filter(Boolean);
  const maximumX = context.width - context.margin;
  let x = context.margin;
  let y = context.y - context.baseFont;
  assertPdfSpace(context, lineHeight(context.baseFont));
  for (const word of words) {
    const key = normalizeMatch(word);
    const bold = Boolean(key) && normalizedTerms.some((term) => key === term || key.includes(term));
    const font = bold || word === prefix ? context.fonts.bold : context.fonts.regular;
    const width = font.widthOfTextAtSize(word, context.baseFont);
    if (x + width > maximumX && word.trim()) {
      x = context.margin;
      context.y -= lineHeight(context.baseFont);
      y = context.y - context.baseFont;
      assertPdfSpace(context, lineHeight(context.baseFont));
    }
    context.page.drawText(word, { x, y, size: context.baseFont, font });
    x += width;
  }
  context.y -= lineHeight(context.baseFont) + 2;
}

function nutritionRows(data: MasterLabelData): PdfNutritionRow[] {
  const source = data.nutritionSource;
  if (!source || source.saturated_fat_g === null || source.sugars_g === null) return [];
  if (data.market === 'EU' || data.market === 'UK' || data.market === 'WORLD') {
    const rows: PdfNutritionRow[] = [
      {
        label: 'Energy',
        value: `${Math.round(data.regulatoryNutrition.energyKjPer100g ?? source.kcal * 4.184)} kJ / ${Math.round(source.kcal)} kcal`,
      },
      { label: 'Tłuszcz', value: `${source.fat_g.toFixed(1)} g` },
      { label: 'Of which saturates', value: `${source.saturated_fat_g.toFixed(1)} g`, indent: 1 },
      { label: 'Węglowodany', value: `${source.carbohydrate_g.toFixed(1)} g` },
      { label: 'Of which sugars', value: `${source.sugars_g.toFixed(1)} g`, indent: 1 },
    ];
    if (source.fiber_g !== null)
      rows.push({ label: 'Błonnik', value: `${source.fiber_g.toFixed(1)} g` });
    rows.push({ label: 'Protein', value: `${source.protein_g.toFixed(1)} g` });
    rows.push({ label: 'Salt', value: `${source.salt_g.toFixed(2)} g` });
    return rows;
  }
  const facts = data.regulatoryNutrition;
  const serving = facts.servingQuantityG ?? 0;
  const amount = (value: number | null | undefined): number =>
    amountPerServing(value ?? null, serving) ?? 0;
  if (data.market === 'AU_NZ') {
    const values: Array<[string, number, string]> = [
      ['Energy', facts.energyKjPer100g ?? 0, 'kJ'],
      ['Protein', source.protein_g, 'g'],
      ['Fat, total', source.fat_g, 'g'],
      ['- saturated', source.saturated_fat_g, 'g'],
      ['Carbohydrate', source.carbohydrate_g, 'g'],
      ['- sugars', source.sugars_g, 'g'],
      ['Sodium', facts.sodiumMgPer100g ?? 0, 'mg'],
    ];
    return values.map(([label, per100, unit]) => ({
      label,
      value: `${((per100 * serving) / 100).toFixed(unit === 'g' ? 1 : 0)} ${unit}`,
      containerValue: `${per100.toFixed(unit === 'g' ? 1 : 0)} ${unit}`,
    }));
  }
  if (data.market === 'US') {
    const build = (quantityG: number): PdfNutritionRow[] => {
      const value = (nutrient: number | null | undefined): number =>
        amountPerServing(nutrient ?? null, quantityG) ?? 0;
      const fat = value(source.fat_g);
      const sat = value(source.saturated_fat_g);
      const trans = value(facts.transFatGPer100g);
      const cholesterol = value(facts.cholesterolMgPer100g);
      const sodium = value(facts.sodiumMgPer100g);
      const carbohydrate = value(source.carbohydrate_g);
      const fibre = value(source.fiber_g);
      const sugars = value(source.sugars_g);
      const added = value(facts.addedSugarsGPer100g);
      return [
        {
          label: 'Total Fat',
          value: `${roundUsFatGrams(fat)}g`,
          dv: `${percentDailyValue(fat, 78)}%`,
        },
        {
          label: 'Saturated Fat',
          value: `${roundUsFatGrams(sat)}g`,
          dv: `${percentDailyValue(sat, 20)}%`,
          indent: 1,
        },
        { label: 'Trans Fat', value: `${roundUsFatGrams(trans)}g`, indent: 1 },
        {
          label: 'Cholesterol',
          value: `${roundUsCholesterolMg(cholesterol)}mg`,
          dv: `${percentDailyValue(cholesterol, 300)}%`,
        },
        {
          label: 'Sodium',
          value: `${roundUsSodiumMg(sodium)}mg`,
          dv: `${percentDailyValue(sodium, 2300)}%`,
        },
        {
          label: 'Total Carbohydrate',
          value: `${roundUsWholeGram(carbohydrate)}g`,
          dv: `${percentDailyValue(carbohydrate, 275)}%`,
        },
        {
          label: 'Dietary Fiber',
          value: `${roundUsWholeGram(fibre)}g`,
          dv: `${percentDailyValue(fibre, 28)}%`,
          indent: 1,
        },
        { label: 'Total Sugars', value: `${roundUsWholeGram(sugars)}g`, indent: 1 },
        {
          label: 'Includes',
          value: `${roundUsWholeGram(added)}g Added Sugars`,
          dv: `${percentDailyValue(added, 50)}%`,
          indent: 2,
        },
        { label: 'Protein', value: `${roundUsWholeGram(value(source.protein_g))}g` },
        {
          label: 'Vitamin D',
          value: `${roundUsVitaminDMcg(value(facts.vitaminDMcgPer100g))}mcg`,
          dv: `${roundUsVitaminMineralPercentDv(value(facts.vitaminDMcgPer100g), 20)}%`,
        },
        {
          label: 'Calcium',
          value: `${roundUsCalciumMg(value(facts.calciumMgPer100g))}mg`,
          dv: `${roundUsVitaminMineralPercentDv(value(facts.calciumMgPer100g), 1300)}%`,
        },
        {
          label: 'Iron',
          value: `${roundUsIronMg(value(facts.ironMgPer100g))}mg`,
          dv: `${roundUsVitaminMineralPercentDv(value(facts.ironMgPer100g), 18)}%`,
        },
        {
          label: 'Potassium',
          value: `${roundUsPotassiumMg(value(facts.potassiumMgPer100g))}mg`,
          dv: `${roundUsVitaminMineralPercentDv(value(facts.potassiumMgPer100g), 4700)}%`,
        },
      ];
    };
    const rows = build(serving);
    if (resolveUsFormatFamily(facts, data.packageQuantity?.netWeightG ?? null) === 'dual_column') {
      const container = build(data.packageQuantity?.netWeightG ?? serving);
      return rows.map((row, index) => ({
        ...row,
        containerValue: container[index]?.value,
        containerDv: container[index]?.dv,
      }));
    }
    return rows;
  }
  const fat = amount(source.fat_g);
  const sat = amount(source.saturated_fat_g);
  const trans = amount(facts.transFatGPer100g);
  const sugars = amount(source.sugars_g);
  const sodium = amount(facts.sodiumMgPer100g);
  return [
    {
      label: 'Fat / Lipides',
      value: `${roundCanadaFatGrams(fat)} g`,
      dv: `${percentDailyValue(fat, 75)} %`,
    },
    {
      label: 'Saturated / saturés',
      value: `${roundCanadaFatGrams(sat)} g`,
      dv: `${percentDailyValue(sat + trans, 20)} %`,
      indent: 1,
    },
    { label: '+ Trans / trans', value: `${roundCanadaFatGrams(trans)} g`, indent: 1 },
    { label: 'Carbohydrate / Glucides', value: `${Math.round(amount(source.carbohydrate_g))} g` },
    {
      label: 'Fibre / Fibres',
      value: `${Math.round(amount(source.fiber_g))} g`,
      dv: `${percentDailyValue(amount(source.fiber_g), 28)} %`,
      indent: 1,
    },
    {
      label: 'Sugars / Sucres',
      value: `${Math.round(sugars)} g`,
      dv: `${percentDailyValue(sugars, 100)} %`,
      indent: 1,
    },
    {
      label: 'Protein / Protéines',
      value: `${roundCanadaProteinGrams(amount(source.protein_g))} g`,
    },
    {
      label: 'Cholesterol / Cholestérol',
      value: `${roundCanadaCholesterolMg(amount(facts.cholesterolMgPer100g))} mg`,
    },
    {
      label: 'Sodium',
      value: `${roundCanadaMg(sodium)} mg`,
      dv: `${percentDailyValue(sodium, 2300)} %`,
    },
    {
      label: 'Potassium',
      value: `${roundCanadaPotassiumCalciumMg(amount(facts.potassiumMgPer100g))} mg`,
      dv: `${percentDailyValue(amount(facts.potassiumMgPer100g), 3400)} %`,
    },
    {
      label: 'Calcium',
      value: `${roundCanadaPotassiumCalciumMg(amount(facts.calciumMgPer100g))} mg`,
      dv: `${percentDailyValue(amount(facts.calciumMgPer100g), 1300)} %`,
    },
    {
      label: 'Iron / Fer',
      value: `${roundCanadaIronMg(amount(facts.ironMgPer100g))} mg`,
      dv: `${percentDailyValue(amount(facts.ironMgPer100g), 18)} %`,
    },
  ];
}

function drawNutrition(context: DrawContext, data: MasterLabelData): void {
  const rows = nutritionRows(data);
  if (rows.length === 0) return;
  const usFormat =
    data.market === 'US'
      ? resolveUsFormatFamily(data.regulatoryNutrition, data.packageQuantity?.netWeightG ?? null)
      : null;
  if (data.market === 'US' && (usFormat === 'linear' || usFormat === 'tabular')) {
    const serving = data.regulatoryNutrition.servingQuantityG ?? 0;
    const servingText = textFor(data.regulatoryNutrition.servingDescription, 'en');
    const servings = roundUsServingsPerContainer(
      data.regulatoryNutrition.servingsPerContainer ?? 0,
    );
    const servingsLine =
      servings === '1' ? '1 serving per container' : `About ${servings} servings per container`;
    const calories = roundUsCalories(
      amountPerServing(data.nutritionSource?.kcal ?? 0, serving) ?? 0,
    );
    drawRule(context, 1.5, 1);
    drawWrapped(context, 'Nutrition Facts', { font: context.fonts.bold, size: 12, after: 1 });
    if (usFormat === 'linear') {
      const line = [
        servingsLine,
        `Serving size ${servingText} (${Math.round(serving)}g)`,
        `Calories ${calories}`,
        ...rows.map(
          (row) => `${row.label} ${row.value}${row.dv === undefined ? '' : ` ${row.dv} DV`}`,
        ),
      ].join(' · ');
      drawWrapped(context, line, { size: 5.5, after: 1 });
      drawWrapped(context, '% DV = % Daily Value', { size: 5.5, after: 2 });
      return;
    }
    drawWrapped(
      context,
      `${servingsLine} · Serving size ${servingText} (${Math.round(serving)}g) · Calories ${calories}`,
      { font: context.fonts.bold, size: 6, after: 1 },
    );
    drawRule(context, 0.7, 1);
    const midpoint = Math.ceil(rows.length / 2);
    const leftRows = rows.slice(0, midpoint);
    const rightRows = rows.slice(midpoint);
    const columnWidth = (context.width - context.margin * 2 - 6) / 2;
    const rowSize = 5.5;
    const rowHeight = lineHeight(rowSize) + 0.5;
    assertPdfSpace(context, Math.max(leftRows.length, rightRows.length) * rowHeight + 9);
    for (let index = 0; index < Math.max(leftRows.length, rightRows.length); index += 1) {
      for (const [column, row] of [leftRows[index], rightRows[index]].entries()) {
        if (!row) continue;
        const text = `${row.label} ${row.value}${row.dv ? ` ${row.dv}` : ''}`;
        context.page.drawText(text, {
          x: context.margin + column * (columnWidth + 6),
          y: context.y - rowSize,
          size: rowSize,
          font: context.fonts.regular,
          maxWidth: columnWidth,
        });
      }
      context.y -= rowHeight;
    }
    drawRule(context, 0.7, 1);
    drawWrapped(context, '% DV = % Daily Value', { size: 5.5, after: 2 });
    return;
  }
  const prescribed = data.market === 'US' || data.market === 'CA';
  const title =
    data.market === 'US'
      ? 'Nutrition Facts'
      : data.market === 'CA'
        ? 'Nutrition Facts\nValeur nutritive'
        : data.market === 'AU_NZ'
          ? 'NUTRITION INFORMATION'
          : data.market === 'WORLD'
            ? 'Nutrition per 100 g'
            : data.market === 'UK'
              ? 'Typical values per 100 g'
              : 'Nutrition declaration per 100 g';
  if (prescribed) {
    drawRule(context, 2.4, 2);
    drawWrapped(context, title, {
      font: context.fonts.bold,
      size: data.market === 'US' ? 20 : 13,
      after: 1,
    });
    const serving = data.regulatoryNutrition.servingQuantityG ?? 0;
    if (data.market === 'US') {
      const dual =
        resolveUsFormatFamily(
          data.regulatoryNutrition,
          data.packageQuantity?.netWeightG ?? null,
        ) === 'dual_column';
      const servings = roundUsServingsPerContainer(
        data.regulatoryNutrition.servingsPerContainer ?? 0,
      );
      drawWrapped(
        context,
        servings === '1' ? '1 serving per container' : `About ${servings} servings per container`,
        { size: 8 },
      );
      drawWrapped(
        context,
        `Serving size ${textFor(data.regulatoryNutrition.servingDescription, 'en')} (${Math.round(serving)}g)`,
        { font: context.fonts.bold, size: 8 },
      );
      drawRule(context, 2.2, 1);
      if (dual) {
        drawWrapped(context, 'Per serving                         Per container', {
          font: context.fonts.bold,
          size: 6,
        });
      }
      const servingCalories = roundUsCalories(
        amountPerServing(data.nutritionSource?.kcal ?? 0, serving) ?? 0,
      );
      const containerCalories = roundUsCalories(
        amountPerServing(
          data.nutritionSource?.kcal ?? 0,
          data.packageQuantity?.netWeightG ?? serving,
        ) ?? 0,
      );
      drawWrapped(
        context,
        dual
          ? `Calories                       ${servingCalories}                    ${containerCalories}`
          : `Calories ${servingCalories}`,
        { font: context.fonts.bold, size: 16 },
      );
    } else {
      drawWrapped(
        context,
        `Per ${textFor(data.regulatoryNutrition.servingDescription, 'en')} (${Math.round(data.regulatoryNutrition.servingVolumeMl ?? 0)} mL) / pour ${textFor(data.regulatoryNutrition.servingDescription, 'fr')} (${Math.round(data.regulatoryNutrition.servingVolumeMl ?? 0)} mL)`,
        { size: 7 },
      );
      drawRule(context, 1.4, 1);
      drawWrapped(
        context,
        `Calories ${roundCanadaCalories(amountPerServing(data.nutritionSource?.kcal ?? 0, serving) ?? 0)}`,
        { font: context.fonts.bold, size: 12 },
      );
    }
    drawWrapped(
      context,
      data.market === 'US' ? '% Daily Value*' : '% Daily Value* / % valeur quotidienne*',
      {
        font: context.fonts.bold,
        size: 6,
      },
    );
  } else {
    drawRule(context, 1, 2);
    drawWrapped(context, title, { font: context.fonts.bold, size: context.baseFont + 1, after: 1 });
    if (data.market === 'AU_NZ') {
      drawWrapped(
        context,
        `Servings per package: ${Math.round(data.regulatoryNutrition.servingsPerContainer ?? 0)} · Serving size: ${Math.round(data.regulatoryNutrition.servingQuantityG ?? 0)} g`,
        { size: context.baseFont },
      );
      const size = Math.max(5.5, context.baseFont - 0.5);
      const contentWidth = context.width - context.margin * 2;
      const servingHeader = 'Avg qty per serving';
      const per100Header = 'Avg qty per 100 g';
      const servingWidth = context.fonts.bold.widthOfTextAtSize(servingHeader, size);
      const per100Width = context.fonts.bold.widthOfTextAtSize(per100Header, size);
      assertPdfSpace(context, lineHeight(size) + 1);
      context.page.drawText(servingHeader, {
        x: context.margin + contentWidth * 0.7 - servingWidth - 3,
        y: context.y - size,
        size,
        font: context.fonts.bold,
      });
      context.page.drawText(per100Header, {
        x: context.width - context.margin - per100Width,
        y: context.y - size,
        size,
        font: context.fonts.bold,
      });
      context.y -= lineHeight(size) + 1;
    }
  }
  for (const row of rows) {
    const size = prescribed ? 7 : context.baseFont;
    const valueText = `${row.value}${row.dv ? ` ${row.dv}` : ''}`;
    const valueWidth = context.fonts.bold.widthOfTextAtSize(valueText, size);
    const labelX = context.margin + (row.indent ?? 0) * 7;
    const rowHeight = lineHeight(size) + 1;
    assertPdfSpace(context, rowHeight);
    context.page.drawLine({
      start: { x: context.margin, y: context.y },
      end: { x: context.width - context.margin, y: context.y },
      thickness: 0.35,
    });
    context.page.drawText(row.label, {
      x: labelX,
      y: context.y - size,
      size,
      font: row.indent ? context.fonts.regular : context.fonts.bold,
    });
    if (row.containerValue) {
      const containerText = `${row.containerValue}${row.containerDv ? ` ${row.containerDv}` : ''}`;
      const containerWidth = context.fonts.bold.widthOfTextAtSize(containerText, size);
      const midpoint = context.margin + (context.width - context.margin * 2) * 0.7;
      context.page.drawText(valueText, {
        x: midpoint - valueWidth - 3,
        y: context.y - size,
        size,
        font: context.fonts.bold,
      });
      context.page.drawText(containerText, {
        x: context.width - context.margin - containerWidth,
        y: context.y - size,
        size,
        font: context.fonts.bold,
      });
    } else {
      context.page.drawText(valueText, {
        x: context.width - context.margin - valueWidth,
        y: context.y - size,
        size,
        font: context.fonts.bold,
      });
    }
    context.y -= rowHeight;
  }
  if (data.market === 'US') {
    drawRule(context, 1.4, 1);
    drawWrapped(
      context,
      '* The % Daily Value (DV) tells you how much a nutrient in a serving of food contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.',
      { size: 5.5, after: 2 },
    );
  } else if (data.market === 'CA') {
    drawRule(context, 1.4, 1);
    drawWrapped(
      context,
      '* 5% or less is a little, 15% or more is a lot / 5 % ou moins c’est peu, 15 % ou plus c’est beaucoup',
      { size: 5.5, after: 2 },
    );
  } else {
    context.y -= 2;
  }
}

async function embedRaster(
  pdf: import('pdf-lib').PDFDocument,
  asset: PdfRasterAsset,
): Promise<PDFImage> {
  return asset.mimeType === 'image/png' ? pdf.embedPng(asset.bytes) : pdf.embedJpg(asset.bytes);
}

async function drawRasterAssets(
  context: DrawContext,
  pdf: import('pdf-lib').PDFDocument,
  options: MasterLabelPdfOptions,
): Promise<void> {
  const assets = options.machineCodes ?? [];
  if (assets.length === 0) return;
  const height = mmToPoints(16);
  assertPdfSpace(context, height + 3);
  const gap = 4;
  const available = context.width - context.margin * 2 - gap * (assets.length - 1);
  const cellWidth = available / assets.length;
  for (const [index, asset] of assets.entries()) {
    const image = await embedRaster(pdf, asset);
    const scale = Math.min(cellWidth / image.width, height / image.height);
    context.page.drawImage(image, {
      x: context.margin + index * (cellWidth + gap),
      y: context.y - image.height * scale,
      width: image.width * scale,
      height: image.height * scale,
    });
  }
  context.y -= height + 3;
}

async function drawLabelPage(
  context: DrawContext,
  data: MasterLabelData,
  pdf: import('pdf-lib').PDFDocument,
  options: MasterLabelPdfOptions,
): Promise<void> {
  context.page.drawRectangle({
    x: 0.5,
    y: 0.5,
    width: context.width - 1,
    height: context.height - 1,
    color: context.colors.white,
    borderColor: context.colors.black,
    borderWidth: 0.7,
  });
  if (options.draft) {
    context.page.drawText('DRAFT · NIE DO SPRZEDAŻY', {
      x: context.margin,
      y: context.height / 2,
      size: 14,
      font: context.fonts.bold,
      opacity: 0.2,
    });
  }
  if (data.market === 'WORLD') {
    drawRule(context, 1, 2);
    drawWrapped(context, WORLD_INFORMATIONAL_WARNING_LINES[0], {
      font: context.fonts.bold,
      size: Math.max(8, context.baseFont + 0.5),
      after: 1,
    });
    drawWrapped(context, WORLD_INFORMATIONAL_WARNING_LINES[1], {
      font: context.fonts.bold,
      size: Math.max(7, context.baseFont),
      after: 2,
    });
    drawRule(context, 1, 3);
  }
  if (options.logo) {
    const logo = await embedRaster(pdf, options.logo);
    const maxWidth = mmToPoints(22);
    const maxHeight = mmToPoints(13);
    const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height);
    const logoHeight = logo.height * scale;
    const logoY =
      data.market === 'WORLD'
        ? context.y - logoHeight
        : context.height - context.margin - logoHeight;
    context.page.drawImage(logo, {
      x: context.width - context.margin - logo.width * scale,
      y: logoY,
      width: logo.width * scale,
      height: logoHeight,
    });
    if (data.market === 'WORLD') context.y -= logoHeight + 3;
  }
  const languages = data.market === 'CA' ? ['en', 'fr'] : data.labelLanguages;
  const product = primaryText(data.productName, languages);
  const legal = primaryText(data.legalProductName, languages);
  if (data.market === 'CA') {
    for (const language of languages) {
      drawWrapped(context, textFor(data.productName, language), {
        font: context.fonts.bold,
        size: Math.max(11, context.baseFont * 1.45),
      });
      drawWrapped(context, textFor(data.legalProductName, language), {
        size: context.baseFont,
        after: 1,
      });
    }
  } else if (data.market === 'US') {
    drawWrapped(context, legal || product, {
      font: context.fonts.bold,
      size: Math.max(13, context.baseFont * 1.7),
    });
    if (data.businessName)
      drawWrapped(context, data.businessName, { size: context.baseFont, after: 2 });
  } else {
    drawWrapped(context, product, {
      font: context.fonts.bold,
      size: Math.max(13, context.baseFont * 1.7),
    });
    if (legal) drawWrapped(context, legal, { size: context.baseFont, after: 2 });
  }
  drawRule(context, data.market === 'US' ? 1.5 : 0.7, 3);
  for (const language of languages) {
    drawAllergenRichText(
      context,
      language === 'fr' ? 'Ingrédients : ' : 'Ingredients: ',
      ingredientDeclarationText(data, language),
      allergenEmphasisTerms(data),
    );
  }
  const allergens = allergenDisplayValues(data);
  if (allergens.length > 0) {
    const allergenStatement =
      data.market === 'CA'
        ? `${allergens.join(', ')} / ${allergens.map(canadianFrenchAllergenName).join(', ')}`
        : allergens.join(', ');
    drawWrapped(
      context,
      `${data.market === 'CA' ? 'Contains / Contient' : 'Contains'}: ${allergenStatement}`,
      {
        font: context.fonts.bold,
        after: 2,
      },
    );
  }
  drawNutrition(context, data);
  drawWrapped(
    context,
    data.market === 'US'
      ? usNetContentsText(data)
      : `${data.market === 'CA' ? 'Net quantity / Quantité nette' : 'Net quantity'}: ${packageQuantityForDisplay(data)}`,
    { font: context.fonts.bold },
  );
  if (
    (data.market === 'EU' || data.market === 'UK') &&
    data.alcoholDeclarationApplicability === 'required_beverage_over_1_2' &&
    data.alcoholDeclarationReviewed
  ) {
    drawWrapped(context, `Actual alcohol: ${data.alcoholByVolumePercent}% vol`, {
      font: context.fonts.bold,
    });
  }
  drawWrapped(context, `LOT: ${data.lotCode} · Production: ${data.productionDate}`);
  if (data.dateMark.date) {
    drawWrapped(
      context,
      `${data.dateMark.kind === 'use_by' ? 'Use by' : 'Best before'}: ${data.dateMark.date}`,
    );
  }
  for (const language of languages) {
    const storage = textFor(data.storageInstructions, language);
    if (storage)
      drawWrapped(context, `${language === 'fr' ? 'Conservation' : 'Storage'}: ${storage}`);
  }
  if (
    (data.market === 'AU_NZ' && data.jurisdictionContext?.auNzCountry === 'AU') ||
    data.enabledOptionalFields.includes('origin')
  ) {
    const origin = primaryText(data.origin, languages);
    if (origin) drawWrapped(context, `Origin: ${origin}`);
  }
  const responsible = responsibleBusinessDetails(data);
  const business = [
    data.businessName,
    responsible.name,
    responsible.address,
    responsible.countryCode,
  ]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' · ');
  if (business) drawWrapped(context, business, { size: Math.max(6, context.baseFont - 0.5) });
  if (options.canadaFop && data.market === 'CA') {
    const fop = await embedRaster(pdf, options.canadaFop);
    const max = mmToPoints(28);
    const scale = Math.min(max / fop.width, max / fop.height);
    assertPdfSpace(context, fop.height * scale + 2);
    context.page.drawImage(fop, {
      x: context.margin,
      y: context.y - fop.height * scale,
      width: fop.width * scale,
      height: fop.height * scale,
    });
    context.y -= fop.height * scale + 2;
  }
  await drawRasterAssets(context, pdf, options);
}

function drawCalibrationPage(context: DrawContext, data: MasterLabelData): void {
  context.page.drawRectangle({
    x: 1,
    y: 1,
    width: context.width - 2,
    height: context.height - 2,
    color: context.colors.white,
    borderColor: context.colors.black,
    borderWidth: 2,
  });
  const inset = mmToPoints(data.printer.marginMm);
  context.page.drawRectangle({
    x: inset,
    y: inset,
    width: context.width - inset * 2,
    height: context.height - inset * 2,
    color: context.colors.white,
    borderColor: context.colors.black,
    borderWidth: 0.5,
    borderDashArray: [3, 3],
  });
  const cross = (x: number, y: number) => {
    context.page.drawLine({ start: { x: x - 8, y }, end: { x: x + 8, y }, thickness: 0.6 });
    context.page.drawLine({ start: { x, y: y - 8 }, end: { x, y: y + 8 }, thickness: 0.6 });
  };
  cross(inset, inset);
  cross(context.width - inset, inset);
  cross(inset, context.height - inset);
  cross(context.width - inset, context.height - inset);
  context.y = context.height / 2 + 30;
  drawWrapped(context, 'DRUK TESTOWY / CALIBRATION', { font: context.fonts.bold, size: 12 });
  drawWrapped(context, `${data.printer.profileId} · ${data.printer.dpi} dpi`);
  drawWrapped(context, `${data.size.widthMm} × ${data.size.heightMm} mm`);
  drawWrapped(context, `Margin ${data.printer.marginMm} mm · ${data.printer.orientation}`);
}

/**
 * Creates deterministic, exact-mm PDF pages with embedded Noto Sans text.
 * The legacy raster argument is accepted for source compatibility but is never
 * used for label text; only explicit logo/code/FOP assets may be raster.
 */
export async function composeMasterLabelPdf(
  data: MasterLabelData,
  _legacyRasterBytes?: Uint8Array | null,
  options: MasterLabelPdfOptions = {},
): Promise<MasterLabelPdfArtifact> {
  const [{ PDFDocument, rgb }, fontkitModule] = await Promise.all([
    import('pdf-lib'),
    import('@pdf-lib/fontkit'),
  ]);
  const preflight = buildLabelPreflight(data);
  if (!options.draft && !options.calibration && !preflight.readyForSystemPrint) {
    throw new Error('Master Label preflight is incomplete.');
  }
  const geometry = masterLabelPdfGeometry(data);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkitModule.default);
  const [regular, bold] = await Promise.all([
    pdf.embedFont(decodeDataUrl(notoRegularDataUrl), {
      subset: false,
      customName: 'GellattiNotoSansRegular',
    }),
    pdf.embedFont(decodeDataUrl(notoBoldDataUrl), {
      subset: false,
      customName: 'GellattiNotoSansBold',
    }),
  ]);
  const frozenDate = safePdfDate(data.sourceCompletedAt);
  const title = `${options.draft ? 'DRAFT - ' : ''}${data.lotCode} - ${data.market}`;
  pdf.setTitle(title);
  pdf.setAuthor(data.businessName || data.operator.operatorName || 'Gellatti');
  pdf.setSubject(
    `${data.size.widthMm} x ${data.size.heightMm} mm; ${data.printer.profileId}; ${data.printer.dpi} dpi; embedded vector text`,
  );
  pdf.setCreator('Gellatti Master Label');
  pdf.setProducer('Gellatti Master Label PDF');
  pdf.setCreationDate(frozenDate);
  pdf.setModificationDate(frozenDate);

  const copies = options.calibration ? 1 : geometry.copies;
  for (let copy = 0; copy < copies; copy += 1) {
    const page = pdf.addPage([geometry.widthPoints, geometry.heightPoints]);
    // PDF pages are conceptually transparent. Explicit paper white prevents
    // thermal/preview renderers that flatten transparency to black from
    // producing an unreadable black page.
    page.drawRectangle({
      x: 0,
      y: 0,
      width: geometry.widthPoints,
      height: geometry.heightPoints,
      color: rgb(1, 1, 1),
    });
    const context: DrawContext = {
      page,
      fonts: { regular, bold },
      width: geometry.widthPoints,
      height: geometry.heightPoints,
      margin: mmToPoints(Math.max(2, data.printer.marginMm + 1)),
      y: geometry.heightPoints - mmToPoints(Math.max(2, data.printer.marginMm + 1)),
      baseFont: preflight.geometry.baseFontPt,
      colors: { black: rgb(0, 0, 0), white: rgb(1, 1, 1) },
    };
    if (options.calibration) drawCalibrationPage(context, data);
    else await drawLabelPage(context, data, pdf, options);
  }

  const bytes = await pdf.save({ addDefaultPage: false, useObjectStreams: false });
  return {
    bytes,
    filename: masterLabelPdfFilename(data, Boolean(options.draft)),
    pageCount: copies,
    widthMm: data.size.widthMm,
    heightMm: data.size.heightMm,
    rasterDpi: geometry.rasterDpi,
    textMode: 'embedded_vector',
  };
}

function triggerPdfDownload(artifact: MasterLabelPdfArtifact): void {
  const pdfBuffer = Uint8Array.from(artifact.bytes).buffer;
  const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = artifact.filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function imageUrlToPng(url: string): Promise<PdfRasterAsset> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, image.naturalWidth);
  canvas.height = Math.max(1, image.naturalHeight);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Nie utworzono kontekstu obrazu PDF.');
  context.drawImage(image, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Nie utworzono obrazu PDF.'))),
      'image/png',
    ),
  );
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: 'image/png' };
}

async function buildMachineCodeAssets(
  data: MasterLabelData,
): Promise<MasterLabelPdfOptions['machineCodes']> {
  const { toCanvas } = await import('bwip-js/browser');
  const requests: Array<{ kind: 'qr' | 'lot' | 'gtin'; options: RenderOptions }> = [];
  if (data.enabledOptionalFields.includes('qr_code') && data.qrCodeValue?.trim()) {
    requests.push({
      kind: 'qr',
      options: { bcid: 'qrcode', text: data.qrCodeValue.trim(), scale: 3 },
    });
  }
  if (data.enabledOptionalFields.includes('lot_barcode') && data.lotCode.trim()) {
    requests.push({
      kind: 'lot',
      options: { bcid: 'code128', text: data.lotCode, includetext: true, scale: 3, height: 10 },
    });
  }
  const gtin = data.enabledOptionalFields.includes('gtin')
    ? normalizeConfirmedGtin(data.gtin)
    : null;
  if (gtin) {
    requests.push({
      kind: 'gtin',
      options: {
        bcid:
          gtin.length === 8
            ? 'ean8'
            : gtin.length === 12
              ? 'upca'
              : gtin.length === 14
                ? 'itf14'
                : 'ean13',
        text: gtin,
        includetext: true,
        scale: 3,
        height: 10,
      },
    });
  }
  return Promise.all(
    requests.map(async (request) => {
      const canvas = document.createElement('canvas');
      await toCanvas(canvas, request.options);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('Nie utworzono kodu PDF.'))),
          'image/png',
        ),
      );
      return {
        kind: request.kind,
        bytes: new Uint8Array(await blob.arrayBuffer()),
        mimeType: 'image/png' as const,
      };
    }),
  );
}

export async function downloadMasterLabelPdf(
  data: MasterLabelData,
  logoUrl?: string | null,
  options: MasterLabelPdfOptions = {},
): Promise<MasterLabelPdfArtifact> {
  const preflight = buildLabelPreflight(data);
  if (!options.draft && !options.calibration && !preflight.readyForSystemPrint) {
    throw new Error('Master Label preflight is incomplete.');
  }
  const outputLogoUrl = resolveMasterLabelLogoUrl(data, logoUrl);
  const [logo, machineCodes, canadaFop] = await Promise.all([
    outputLogoUrl && data.enabledOptionalFields.includes('logo')
      ? imageUrlToPng(outputLogoUrl)
      : null,
    buildMachineCodeAssets(data),
    data.market === 'CA' &&
    data.regulatoryNutrition.canadaFopAssetId &&
    data.regulatoryNutrition.canadaFopAssetPackageVersion
      ? imageUrlToPng(
          `/regulatory/canada-fop/${encodeURIComponent(data.regulatoryNutrition.canadaFopAssetId)}.svg`,
        )
      : null,
  ]);
  const artifact = await composeMasterLabelPdf(data, null, {
    ...options,
    logo,
    machineCodes,
    canadaFop,
  });
  if (options.download !== false) triggerPdfDownload(artifact);
  return artifact;
}
