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
 * Contrast policy (on white `paper` / `--g-ivory` surfaces): primary text is
 * near-black `--g-ink` (18.9:1). Secondary is `--g-text-secondary` (5.99:1).
 * `--g-text-muted` (4.72:1) is the FLOOR for informative text (muted labels);
 * `--g-drag` (2.45:1) is reserved for placeholders / decorative glyphs only —
 * never for content the user must read. These replaced the stone tiers
 * (7.63 / 4.80 / 2.52:1) so the customer shell draws from the same palette as
 * the rest of the product; every informative tier stays above AA. Status hues tint borders/backgrounds; the text on
 * a tinted notice stays in the readable stone/ink tiers (spec §15.3 — every
 * state carries text, never colour alone).
 */

/* ------------------------------------------------------------------ *
 * Raw numeric specs (documentation + tests; not classes)             *
 * ------------------------------------------------------------------ */

export const customerSpec = {
  /** Current-PRO body density projected onto the customer surface. */
  bodyPrimaryPx: 13,
  /** Current-PRO mobile touch target; desktop compacts to 40 px. */
  controlMinHeightPx: 44,
  /** The accepted 44 px current-PRO medium action. */
  controlLargeHeightPx: 44,
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
  display: 'text-[28px] leading-[1.08] font-semibold tracking-[-0.035em]',
  /** Section / card title. */
  title: 'text-[16px] leading-tight font-semibold tracking-[-0.015em]',
  /** Sub-heading inside a card. */
  heading: 'text-[14px] leading-snug font-semibold',
  /** Compact readable body inherited from current PRO. */
  body: 'text-[13px] leading-relaxed',
  /** Primary body, emphasised. */
  bodyStrong: 'text-[13px] leading-relaxed font-semibold',
  /** Secondary supporting copy. */
  secondary: 'text-[12px] leading-relaxed',
  /** Caption / metadata. */
  caption: 'text-[10px] leading-normal',
  /** Human sentence-case label; uppercase is reserved for real codes. */
  label: 'text-[11px] font-semibold',
  /** Tabular numeric readout (grams, temperature). */
  numeric: 'font-mono text-[13px] tabular-nums',
} as const;

/* ------------------------------------------------------------------ *
 * Semantic colour classes                                            *
 * ------------------------------------------------------------------ */

export const color = {
  textPrimary: 'text-ink',
  textSecondary: 'text-[var(--g-text-secondary)]',
  textMuted: 'text-[var(--g-text-muted)]',
  textPlaceholder: 'text-[var(--g-drag)]',
  textInverse: 'text-paper',

  surface: 'bg-paper',
  surfaceSunken: 'bg-[var(--g-ivory)]',
  /** Selected-card fill — clearly visible on white, never a 2% difference (§21.2). */
  surfaceTintSelected: 'bg-ink/[0.06]',

  borderHairline: 'border-[var(--g-line)]',
  borderStrong: 'border-[var(--g-line-strong)]',
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
  neutral: 'border border-[var(--g-line)] bg-[var(--g-ivory)]',
  /** Readable body-text tier for tinted notices. */
  text: 'text-[var(--g-ink)]',
} as const;

/* ------------------------------------------------------------------ *
 * Radius / elevation / motion                                        *
 * ------------------------------------------------------------------ */

export const radius = {
  control: 'rounded-xl', // 12px — inputs, buttons
  card: 'rounded-xl', // 12px — the current-PRO rectangular language
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
  /** 44px at 390; the source current-PRO desktop action is 40px. */
  control: 'min-h-11 sm:min-h-10',
  /** Current-PRO medium action remains 44px; it is not a new global default. */
  controlLarge: 'min-h-11',
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
    'bg-ink text-paper hover:bg-ink-soft active:bg-ink-soft disabled:bg-[var(--g-line-quiet)] disabled:text-[var(--g-lock)] disabled:hover:bg-[var(--g-line-quiet)]',
  // Hairline outline — secondary action.
  secondary:
    'bg-paper text-ink border border-[var(--g-line)] hover:border-[var(--g-ink)]/40 active:bg-ink/[0.03] disabled:border-[var(--g-line)] disabled:text-[var(--g-text-muted)] disabled:hover:border-[var(--g-line)]',
  // Text-only — tertiary / inline action.
  quiet:
    'bg-transparent text-ink hover:bg-ink/[0.04] active:bg-ink/[0.06] disabled:text-[var(--g-text-muted)] disabled:hover:bg-transparent',
};

export const touchButtonSizes: Record<TouchButtonSize, string> = {
  md: `${touch.control} px-4`,
  lg: `${touch.controlLarge} px-5`,
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
