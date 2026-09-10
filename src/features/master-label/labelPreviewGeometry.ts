export const CSS_PIXELS_PER_MM = 96 / 25.4;

export function fitLabelPreviewScale(availableWidthPx: number | null, widthMm: number): number {
  if (!availableWidthPx || availableWidthPx <= 0 || widthMm <= 0) return 1;
  return Math.min(1, availableWidthPx / (widthMm * CSS_PIXELS_PER_MM));
}
