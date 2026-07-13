import { cn } from '@/lib/cn';
import { radius } from './tokens';

interface SkeletonProps {
  className?: string;
  /** Border radius preset (defaults to a soft control radius). */
  rounded?: string;
}

/**
 * A single shimmering placeholder block. Neutral stone tint (never a low-contrast
 * ghost). Animation respects reduced-motion. Give it a width/height via className.
 */
export function Skeleton({ className, rounded = 'rounded-lg' }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        'bg-stone-200/70 motion-safe:animate-pulse',
        rounded,
        className,
      )}
    />
  );
}

/** A ready-recipe-card skeleton: reserves the same box as the real card (no shift). */
export function ReadyRecipeCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('flex flex-col overflow-hidden border border-ink/10', radius.card, className)}
      role="status"
      aria-label="Loading recipe"
    >
      <Skeleton rounded="rounded-none" className="w-full" />
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
      </div>
    </div>
  );
}

/** A stack of ingredient-row skeletons for a recipe detail view. */
export function IngredientListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading ingredients" className="divide-y divide-ink/10">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-4">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}
