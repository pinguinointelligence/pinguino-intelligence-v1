import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { focusRing, motion, radius, touch, type } from './tokens';

export type TouchButtonVariant = 'primary' | 'secondary' | 'quiet';
export type TouchButtonSize = 'md' | 'lg';

const VARIANTS: Record<TouchButtonVariant, string> = {
  // Ink on paper — the single high-emphasis action.
  primary: 'bg-ink text-paper hover:bg-ink-soft active:bg-ink-soft disabled:bg-ink/30',
  // Hairline outline — secondary action.
  secondary:
    'bg-paper text-ink border border-ink/15 hover:border-ink/40 active:bg-ink/[0.03] disabled:border-ink/10 disabled:text-ink/30',
  // Text-only — tertiary / inline action.
  quiet: 'bg-transparent text-ink hover:bg-ink/[0.04] active:bg-ink/[0.06] disabled:text-ink/30',
};

const SIZES: Record<TouchButtonSize, string> = {
  md: `${touch.control} px-6`,
  lg: `${touch.controlLarge} px-7`,
};

interface TouchButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: TouchButtonVariant;
  size?: TouchButtonSize;
  /** Stretch to fill its container (default on mobile CTAs). */
  block?: boolean;
  /** Optional leading glyph (decorative). */
  leading?: ReactNode;
}

/**
 * Primary tap-first button. Meets the 52px (md) / 56px (lg) touch-target minimum,
 * shows a visible keyboard focus ring, and eases on press. Presentational only.
 */
export function TouchButton({
  variant = 'primary',
  size = 'md',
  block = false,
  leading,
  className,
  type: htmlType = 'button',
  children,
  ...rest
}: TouchButtonProps) {
  return (
    <button
      type={htmlType}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium',
        type.body,
        radius.control,
        SIZES[size],
        VARIANTS[variant],
        motion.base,
        focusRing,
        'active:scale-[0.99] disabled:cursor-not-allowed disabled:active:scale-100',
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {leading ? <span aria-hidden className="shrink-0">{leading}</span> : null}
      {children}
    </button>
  );
}
