/**
 * PINGÜINO — Protein presentation helpers (Protein Engine v2).
 *
 * Protein % is an OUTPUT and is displayed read-only. There is no control, no
 * slider, no input and no target anywhere in this layer.
 */

/** Deterministic Polish percent formatter (comma decimal, one decimal place). */
export const formatProteinPercentPl = (percent: number): string =>
  `${(Math.round(percent * 10) / 10).toFixed(1).replace('.', ',')}%`;

/** The compact label shown next to the Score ring: „Białko 8,4%”. */
export const proteinContentLabelPl = (percent: number): string =>
  `Białko ${formatProteinPercentPl(percent)}`;
