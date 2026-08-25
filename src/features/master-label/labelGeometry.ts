import { marketProfile, type MarketProfileCode } from './marketProfiles';

const MM_PER_POINT = 25.4 / 72;
const NOTO_SANS_X_HEIGHT_RATIO = 0.536;

export const PRACTICAL_LABEL_SIZES = Object.freeze([
  { id: '50x30', widthMm: 50, heightMm: 30 },
  { id: '70x50', widthMm: 70, heightMm: 50 },
  { id: '80x50', widthMm: 80, heightMm: 50 },
  { id: '100x50', widthMm: 100, heightMm: 50 },
  { id: '100x70', widthMm: 100, heightMm: 70 },
  { id: '102x152', widthMm: 102, heightMm: 152 },
  { id: '104x200', widthMm: 104, heightMm: 200 },
]);

export interface LabelGeometryInput {
  market: MarketProfileCode;
  widthMm: number;
  heightMm: number;
  marginMm: number;
  format: 'rectangle' | 'round';
  productName: string;
  ingredientDeclarations: readonly string[];
  allergenStatement: string;
  businessText: string;
  storageText: string;
  languageCount: number;
  nutritionRowCount: number;
  packagingContext?: 'prepacked' | 'ppds' | 'loose_non_prepacked';
  availableDisplaySurfaceCm2?: number | null;
  canadaFopRequired?: boolean;
  usDualColumn?: boolean;
  optionalMachineCodeCount?: number;
}

export interface LabelGeometryResult {
  fits: boolean;
  baseFontPt: number;
  xHeightMm: number;
  requiredHeightMm: number;
  availableHeightMm: number;
  estimatedLineCount: number;
  nutritionHeightMm: number;
  reason: string;
}

export function minimumBaseFontPt(
  market: MarketProfileCode,
  availableDisplaySurfaceCm2?: number | null,
): number {
  const minimum = marketProfile(market).minimumTypography;
  const xHeight =
    availableDisplaySurfaceCm2 !== null &&
    availableDisplaySurfaceCm2 !== undefined &&
    availableDisplaySurfaceCm2 < 80 &&
    minimum.smallPackageXHeightMm
      ? minimum.smallPackageXHeightMm
      : minimum.xHeightMm;
  const fromXHeight = xHeight > 0 ? xHeight / (MM_PER_POINT * NOTO_SANS_X_HEIGHT_RATIO) : 0;
  return Math.max(minimum.minimumPointSize ?? 0, fromXHeight, 6);
}

const estimatedCharsPerLine = (usableWidthMm: number, fontPt: number): number =>
  Math.max(8, Math.floor(usableWidthMm / (fontPt * MM_PER_POINT * 0.52)));

const wrappedLines = (text: string, charsPerLine: number): number => {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / charsPerLine));
};

function nutritionHeight(input: LabelGeometryInput, lineHeightMm: number): number {
  switch (input.market) {
    case 'US':
      return input.usDualColumn ? 116 : 88;
    case 'CA':
      return 96 + (input.canadaFopRequired ? 29 : 0);
    case 'AU_NZ':
      return Math.max(42, (input.nutritionRowCount + 3) * lineHeightMm);
    case 'EU':
    case 'UK':
    case 'WORLD':
      return Math.max(30, (input.nutritionRowCount + 2) * lineHeightMm);
  }
}

export function assessLabelGeometry(input: LabelGeometryInput): LabelGeometryResult {
  const baseFontPt = minimumBaseFontPt(input.market, input.availableDisplaySurfaceCm2);
  const xHeightMm = baseFontPt * MM_PER_POINT * NOTO_SANS_X_HEIGHT_RATIO;
  const lineHeightMm = baseFontPt * MM_PER_POINT * 1.28;
  const horizontalPadding = Math.max(4, input.marginMm * 2 + (input.format === 'round' ? 12 : 4));
  const usableWidthMm = Math.max(1, input.widthMm - horizontalPadding);
  const charsPerLine = estimatedCharsPerLine(usableWidthMm, baseFontPt);
  const languageMultiplier = input.market === 'CA' ? 2 : Math.max(1, input.languageCount);
  const ingredientText = input.ingredientDeclarations.join(', ');
  const ingredientLines = wrappedLines(ingredientText, charsPerLine) * languageMultiplier;
  const productLines = wrappedLines(input.productName, Math.max(8, charsPerLine - 8));
  const allergenLines = wrappedLines(input.allergenStatement, charsPerLine);
  const businessLines = wrappedLines(input.businessText, charsPerLine);
  const storageLines = wrappedLines(input.storageText, charsPerLine);
  const traceabilityLines = 3;
  const optionalCodesHeight = (input.optionalMachineCodeCount ?? 0) > 0 ? 19 : 0;
  const fixedSpacingMm = input.market === 'US' || input.market === 'CA' ? 23 : 17;
  const estimatedLineCount =
    ingredientLines +
    productLines +
    allergenLines +
    businessLines +
    storageLines +
    traceabilityLines;
  const nutritionHeightMm = nutritionHeight(input, lineHeightMm);
  const requiredHeightMm =
    fixedSpacingMm + estimatedLineCount * lineHeightMm + nutritionHeightMm + optionalCodesHeight;
  const shapePenalty = input.format === 'round' ? input.heightMm * 0.22 : 0;
  const availableHeightMm = Math.max(
    0,
    input.heightMm - Math.max(4, input.marginMm * 2 + 4) - shapePenalty,
  );
  const fits = requiredHeightMm <= availableHeightMm;
  return {
    fits,
    baseFontPt,
    xHeightMm,
    requiredHeightMm,
    availableHeightMm,
    estimatedLineCount,
    nutritionHeightMm,
    reason: fits
      ? `Zawartość mieści się przy ${baseFontPt.toFixed(2)} pt (x-height ${xHeightMm.toFixed(2)} mm).`
      : 'Ten format jest za mały dla tej etykiety. Wybierz większy rozmiar.',
  };
}

export function smallestValidLabelSize(
  input: Omit<LabelGeometryInput, 'widthMm' | 'heightMm'>,
  maximumWidthMm = Number.POSITIVE_INFINITY,
): { widthMm: number; heightMm: number } | null {
  const candidates = [...PRACTICAL_LABEL_SIZES]
    .filter((size) => size.widthMm <= maximumWidthMm)
    .sort((a, b) => a.widthMm * a.heightMm - b.widthMm * b.heightMm);
  return (
    candidates.find(
      (size) =>
        assessLabelGeometry({ ...input, widthMm: size.widthMm, heightMm: size.heightMm }).fits,
    ) ?? null
  );
}
