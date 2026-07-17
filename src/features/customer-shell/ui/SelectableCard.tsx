import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { color, elevation, focusRing, motion, radius, type } from './tokens';

interface SelectableCardProps {
  title: string;
  description?: string;
  /** Optional leading visual (glyph / small image). */
  leading?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  /** Semantics: single-choice (radio) vs multi-choice (checkbox). */
  role?: 'radio' | 'checkbox';
  className?: string;
}

/**
 * A large tappable choice card with an unmistakable selected state on the LIGHT
 * surface (spec §21.2 / audit #29): full-strength ink border doubled by a ring,
 * a clearly visible fill tint, and a filled check — never colour alone. Full-card
 * hit area, keyboard focusable.
 */
export function SelectableCard({
  title,
  description,
  leading,
  selected = false,
  disabled = false,
  onSelect,
  role = 'radio',
  className,
}: SelectableCardProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'relative flex w-full items-start gap-3 border p-4 text-left',
        radius.card,
        motion.base,
        focusRing,
        // Surface and tint are mutually exclusive: emitting `bg-paper` alongside
        // the selected tint let the opaque paper background win in the stylesheet
        // cascade, silently erasing the tint (root cause behind audit #29).
        selected
          ? `border-ink ring-1 ring-ink ${color.surfaceTintSelected} ${elevation.card}`
          : `${color.surface} border-ink/12 hover:border-ink/30`,
        disabled ? 'cursor-not-allowed opacity-50' : 'active:scale-[0.99]',
        className,
      )}
    >
      {leading ? <span className="mt-0.5 shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className={cn('block', type.bodyStrong, color.textPrimary)}>{title}</span>
        {description ? (
          <span className={cn('mt-1 block', type.secondary, color.textSecondary)}>{description}</span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid h-6 w-6 shrink-0 place-items-center border',
          role === 'radio' ? 'rounded-full' : 'rounded-md',
          selected ? 'border-ink bg-ink text-paper' : 'border-ink/25 text-transparent',
          motion.base,
        )}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path
            d="M3.5 8.5l3 3 6-7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  );
}
