/**
 * Customer-shell design tokens (SCOPED — presentational only).
 *
 * A mobile-first, Apple-flavoured customer surface: white/light premium, large
 * type, generous whitespace, big touch targets, clear selected states, restrained
 * motion. This module does NOT edit the global Tailwind theme or index.css — it
 * COMPOSES the already-defined brand utilities (ink / paper / stone / ivory /
 * status-*) into named, reusable class strings scoped to `customer-shell`.
 *
 * Reused global tokens (from src/styles/tokens.css): `ink` (#101113),
 * `paper` (#ffffff), `ivory` (#efe9dc), `status-ideal|risky|error`, `--font-mono`,
 * plus Tailwind's built-in `stone-*` grey ramp. No new colours are introduced.
 *
 * Contrast policy: primary text uses `ink` on `paper` (~19:1). Secondary text
 * never goes lighter than `stone-500` (~4.6:1 on white — AA for body). `stone-400`
 * is reserved for placeholders / decorative glyphs only.
 */

/* ------------------------------------------------------------------ *
 * Raw numeric specs (documentation + tests; not classes)             *
 * ------------------------------------------------------------------ */

export const customerSpec = {
  /** Comfortable primary body size on mobile. */
  bodyPrimaryPx: 17,
  /** Minimum height for primary interactive controls (buttons, inputs). */
  controlMinHeightPx: 52,
  /** Large / hero control height (sticky CTA, primary submit). */
  controlLargeHeightPx: 56,
  /** Minimum square tap target for icon-only controls (WCAG 2.5.5-conscious). */
  tapTargetPx: 44,
  /** Content max-width on the widest breakpoint (reads as a product, not a dashboard). */
  contentMaxWidthPx: 640,
  /** Reference small-phone viewports that must never horizontally scroll. */
  minViewportsPx: [390, 430] as const,
} as const;

/* ------------------------------------------------------------------ *
 * Typography scale (mobile-first; scales up at `sm:`)                 *
 * ------------------------------------------------------------------ */

export const type = {
  /** Page hero. */
  display: 'text-[28px] leading-[1.15] font-light tracking-tight sm:text-[34px]',
  /** Section / card title. */
  title: 'text-[22px] leading-[1.2] font-medium tracking-tight',
  /** Sub-heading inside a card. */
  heading: 'text-[19px] leading-snug font-medium',
  /** Primary body — comfortable on mobile (>=17px). */
  body: 'text-[17px] leading-relaxed',
  /** Primary body, emphasised. */
  bodyStrong: 'text-[17px] leading-relaxed font-medium',
  /** Secondary supporting copy. */
  secondary: 'text-[15px] leading-relaxed',
  /** Caption / metadata. */
  caption: 'text-[13px] leading-normal',
  /** Uppercase eyebrow label (echoes the wordmark tracking). */
  label: 'text-[12px] font-medium uppercase tracking-[0.14em]',
  /** Tabular numeric readout (grams, temperature). */
  numeric: 'font-mono text-[15px] tabular-nums',
} as const;

/* ------------------------------------------------------------------ *
 * Semantic colour classes                                            *
 * ------------------------------------------------------------------ */

export const color = {
  textPrimary: 'text-ink',
  textSecondary: 'text-stone-600',
  textMuted: 'text-stone-500',
  textPlaceholder: 'text-stone-400',
  textInverse: 'text-paper',

  surface: 'bg-paper',
  surfaceSunken: 'bg-stone-50',
  surfaceTintSelected: 'bg-ink/[0.035]',

  borderHairline: 'border-ink/10',
  borderStrong: 'border-ink/20',
  borderSelected: 'border-ink',

  /** Desaturated laboratory status tones (never candy). */
  statusIdeal: 'text-status-ideal',
  statusRisky: 'text-status-risky',
  statusError: 'text-status-error',
} as const;

/* ------------------------------------------------------------------ *
 * Radius / elevation / motion                                        *
 * ------------------------------------------------------------------ */

export const radius = {
  control: 'rounded-xl', // 12px — inputs, buttons
  card: 'rounded-2xl', // 16px — cards
  sheet: 'rounded-t-3xl', // 24px — bottom sheet top corners
  pill: 'rounded-full', // chips, mic button
} as const;

export const elevation = {
  none: '',
  /** Quiet resting card — hairline border does most of the work. */
  card: 'shadow-[0_1px_2px_rgba(16,17,19,0.05)]',
  /** Lifted (pressed selectable, floating CTA bar). */
  raised: 'shadow-[0_6px_20px_rgba(16,17,19,0.10)]',
  /** Bottom sheet. */
  sheet: 'shadow-[0_-8px_40px_rgba(16,17,19,0.16)]',
} as const;

/** Restrained motion — always paired with `motion-reduce:*` opt-outs. */
export const motion = {
  base: 'transition duration-200 ease-out motion-reduce:transition-none',
  transform: 'transition-transform duration-200 ease-out motion-reduce:transition-none',
} as const;

/* ------------------------------------------------------------------ *
 * Interaction: focus + touch targets                                 *
 * ------------------------------------------------------------------ */

/** High-contrast keyboard focus ring (ink on paper). Applied to interactive els. */
export const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper';

export const touch = {
  /** Primary control minimum height (52px). */
  control: 'min-h-[52px]',
  /** Large control (56px). */
  controlLarge: 'min-h-[56px]',
  /** Square icon-only tap target (44px). */
  iconTarget: 'min-h-[44px] min-w-[44px]',
} as const;

/* ------------------------------------------------------------------ *
 * Safe-area (iPhone-style bottom inset)                              *
 * ------------------------------------------------------------------ */

export const safeArea = {
  /** Bottom padding that respects the home-indicator inset, with a sane floor. */
  bottom: 'pb-[max(env(safe-area-inset-bottom),16px)]',
  /** Just the inset (no floor) — for stacking under a fixed bar. */
  bottomRaw: 'pb-[env(safe-area-inset-bottom)]',
  /** Horizontal insets for notch/edge devices. */
  x: 'px-[max(env(safe-area-inset-left),0px)] pr-[max(env(safe-area-inset-right),0px)]',
} as const;

/* ------------------------------------------------------------------ *
 * Composed recipes reused by several components                      *
 * ------------------------------------------------------------------ */

/** A resting content card: hairline frame + quiet shadow on paper. */
export const cardShell = `${color.surface} border ${color.borderHairline} ${radius.card} ${elevation.card}`;

/** An interactive surface (selectable / tappable) — base state. */
export const interactiveSurface = `${cardShell} ${motion.base} ${focusRing} active:scale-[0.99]`;
