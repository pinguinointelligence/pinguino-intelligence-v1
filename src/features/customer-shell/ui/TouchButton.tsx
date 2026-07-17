import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import {
  touchButtonClasses,
  type TouchButtonSize,
  type TouchButtonVariant,
} from './tokens';

export type { TouchButtonVariant, TouchButtonSize };

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
 * shows a visible keyboard focus ring, keeps disabled labels READABLE (§21.2 /
 * audit #17) and eases on press. The class recipe lives in `tokens.ts`
 * (`touchButtonClasses`) so link-shaped CTAs share it. Presentational only.
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
      className={cn(touchButtonClasses(variant, size, block), className)}
      {...rest}
    >
      {leading ? <span aria-hidden className="shrink-0">{leading}</span> : null}
      {children}
    </button>
  );
}
