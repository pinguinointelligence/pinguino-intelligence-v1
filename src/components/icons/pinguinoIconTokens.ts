/**
 * PINGÜINO approved icon palette (owner reference sheet, 2026-08-24).
 *
 * ONE definition per semantic family, so the same concept is always the same
 * colour wherever it appears — Monitor module, ingredient row, picker filter,
 * mobile sheet. The blue/orange/magenta/green values are the ones the Pro
 * workbench already shipped (they are the same family the reference sheet was
 * drawn in); red-pink and warm brown are added for the families that had no
 * token yet.
 *
 * Presentation only. Nothing here participates in Engine math, classification
 * or filtering — an icon colour never decides a status.
 */
export const PINGUINO_ICON_COLOR = {
  /** Sweetness · Favorites · Fruits */
  redPink: '#ef3b5b',
  /** Hardness · Water & solids · Dairy */
  blue: '#1676f3',
  /** Freezing — the reference draws the snowflake a step lighter than Hardness */
  blueLight: '#3f9bf5',
  /** Fat & creaminess · Nuts */
  orange: '#f58a07',
  /** Protein & structure · Pastes */
  magenta: '#bb1684',
  /** Stability & risks · Fresh */
  green: '#18a83a',
  /** Dry · Chocolate */
  brown: '#7d5a3c',
} as const;

export type PinguinoIconColor = keyof typeof PINGUINO_ICON_COLOR;

/** The reference sheet's pale circular container — never a dashboard button. */
export const PINGUINO_ICON_CIRCLE =
  'grid place-items-center rounded-full border border-ink/[0.06] bg-stone-50';
