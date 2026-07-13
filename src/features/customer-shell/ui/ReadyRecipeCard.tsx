import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { color, elevation, focusRing, motion, radius, type } from './tokens';
import { RecipeImage } from './RecipeImage';

interface ReadyRecipeCardProps {
  title: string;
  /** Short descriptor, e.g. "Pistachio · gelato". */
  subtitle?: string;
  imageSrc?: string | null;
  imageAlt: string;
  /** Quiet metadata line, e.g. "1 kg · 8 ingredients". */
  meta?: string;
  /** Optional status / badge slot (e.g. a StatusChip). */
  badge?: ReactNode;
  onOpen?: () => void;
  className?: string;
}

/**
 * A finished-recipe card for a browsing grid/list. Photo keeps its aspect ratio
 * and lazy-loads with an elegant missing-photo fallback (no layout shift). The
 * whole card is one tappable target.
 */
export function ReadyRecipeCard({
  title,
  subtitle,
  imageSrc,
  imageAlt,
  meta,
  badge,
  onOpen,
  className,
}: ReadyRecipeCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex w-full flex-col overflow-hidden border text-left',
        radius.card,
        color.surface,
        'border-ink/10',
        elevation.card,
        motion.base,
        focusRing,
        'hover:border-ink/25 active:scale-[0.995]',
        className,
      )}
    >
      <div className="relative">
        <RecipeImage src={imageSrc} alt={imageAlt} rounded="rounded-none" />
        {badge ? <span className="absolute left-3 top-3">{badge}</span> : null}
      </div>
      <span className="flex flex-col gap-1 p-4">
        <span className={cn('truncate', type.heading, color.textPrimary)}>{title}</span>
        {subtitle ? (
          <span className={cn('truncate', type.secondary, color.textSecondary)}>{subtitle}</span>
        ) : null}
        {meta ? <span className={cn('mt-1', type.caption, color.textMuted)}>{meta}</span> : null}
      </span>
    </button>
  );
}
