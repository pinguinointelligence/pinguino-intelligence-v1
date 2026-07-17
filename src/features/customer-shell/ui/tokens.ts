/**
 * Customer-shell design tokens (SCOPED — presentational only).
 *
 * LIGHT-FIRST (binding owner decision, UIUX master Slice A, spec §21.1 +
 * audit finding #4): the customer surface is a bright, premium, highly readable
 * product — white paper surfaces, near-black ink text, hairline borders, large
 * type, generous whitespace, big touch targets, clear selected states and
 * restrained motion. The previous scoped DARK remap (`customerDarkVars` /
 * `customerDarkPageBg` CSS-variable overrides + the `DarkShell` wrapper) has been
 * REMOVED — every class below is light-native and renders against the global
 * light theme (`src/styles/tokens.css`). Dark is no longer applied anywhere on
 * the customer shell; a darker Monitor Pro focal panel INSIDE the light app is a
 * later, separate slice and must not be rebuilt from here.
 *
 * This module does NOT edit the global Tailwind theme or index.css — it COMPOSES
 * the already-defined brand utilities (ink / paper / stone / status-* / gold)
 * into named, reusable class strings.
 *
 * Contrast policy (on white `paper` / near-white `stone-50` surfaces): primary
 * text is near-black `ink` (~17:1). Secondary text is `stone-600` (~7:1).
 * `stone-500` (~4.9:1) is the FLOOR for informative text (muted labels);
 * `stone-400` is reserved for placeholders / decorative glyphs only — never for
 * content the user must read. Status hues tint borders/backgrounds; the text on
 * a tinted notice stays in the readable stone/ink tiers (spec §15.3 — every
 * state carries text, never colour alone).
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
  /** Selected-card fill — clearly visible on white, never a 2% difference (§21.2). */
  surfaceTintSelected: 'bg-ink/[0.06]',

  borderHairline: 'border-ink/10',
  borderStrong: 'border-ink/20',
  borderSelected: 'border-ink',

  /** Desaturated laboratory status tones (never candy). */
  statusIdeal: 'text-status-ideal',
  statusRisky: 'text-status-risky',
  statusError: 'text-status-error',
} as const;

/* ------------------------------------------------------------------ *
 * Status notice surfaces (light)                                     *
 * ------------------------------------------------------------------ */

/**
 * Tinted status notices for the LIGHT surface (audit finding #26 — no raw
 * Tailwind ambers/emeralds). The status hue carries the border + wash only;
 * body text stays in the readable stone/ink tiers so contrast holds on white
 * and the state is never colour-alone (§15.3, §21.5).
 */
export const notice = {
  /** Positive / resolved (status-ideal wash). */
  ideal: 'border border-status-ideal/40 bg-status-ideal/10',
  /** Needs attention / blocked (status-risky wash — desaturated amber). */
  risky: 'border border-status-risky/40 bg-status-risky/10',
  /** Real problem (status-error wash). */
  error: 'border border-status-error/40 bg-status-error/10',
  /** Neutral informational inset. */
  neutral: 'border border-ink/10 bg-stone-50',
  /** Readable body-text tier for tinted notices. */
  text: 'text-stone-700',
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

/* ------------------------------------------------------------------ *
 * TouchButton recipe (shared with link-shaped CTAs)                   *
 * ------------------------------------------------------------------ */

export type TouchButtonVariant = 'primary' | 'secondary' | 'quiet';
export type TouchButtonSize = 'md' | 'lg';

/**
 * Disabled states (spec §21.2 / audit #17): unmistakably inactive, but the label
 * stays READABLE — solid quiet greys with ≥4.5:1 text contrast, never a washed
 * 30%-alpha fill with invisible text. Hover styles are explicitly neutralised
 * while disabled so the button cannot “light up” under the pointer.
 */
export const touchButtonVariants: Record<TouchButtonVariant, string> = {
  // Ink on paper — the single high-emphasis action.
  primary:
    'bg-ink text-paper hover:bg-ink-soft active:bg-ink-soft disabled:bg-stone-200 disabled:text-stone-600 disabled:hover:bg-stone-200',
  // Hairline outline — secondary action.
  secondary:
    'bg-paper text-ink border border-ink/15 hover:border-ink/40 active:bg-ink/[0.03] disabled:border-ink/10 disabled:text-stone-500 disabled:hover:border-ink/10',
  // Text-only — tertiary / inline action.
  quiet:
    'bg-transparent text-ink hover:bg-ink/[0.04] active:bg-ink/[0.06] disabled:text-stone-500 disabled:hover:bg-transparent',
};

export const touchButtonSizes: Record<TouchButtonSize, string> = {
  md: `${touch.control} px-6`,
  lg: `${touch.controlLarge} px-7`,
};

/**
 * The complete TouchButton class recipe — one button system (§21.1). Used by the
 * `TouchButton` component AND by link-shaped CTAs (e.g. the public landing's
 * router `Link`s) so navigation controls render EXACTLY like buttons.
 */
export function touchButtonClasses(
  variant: TouchButtonVariant = 'primary',
  size: TouchButtonSize = 'md',
  block = false,
): string {
  return [
    'inline-flex items-center justify-center gap-2 font-medium',
    type.body,
    radius.control,
    touchButtonSizes[size],
    touchButtonVariants[variant],
    motion.base,
    focusRing,
    'active:scale-[0.99] disabled:cursor-not-allowed disabled:active:scale-100',
    block ? 'w-full' : '',
  ]
    .filter(Boolean)
    .join(' ');
}
