import type { SVGProps } from 'react';
import { cn } from '@/lib/cn';
import {
  ChocolateIcon,
  DairyIcon,
  DryIcon,
  FavoritesIcon,
  FreshIcon,
  FruitsIcon,
  NutsIcon,
  PastesIcon,
  type PinguinoIconProps,
} from '@/components/icons/PinguinoIcons';
import type { IngredientCategorySymbolId } from './ingredientCategorySymbols';

export interface IngredientCategoryIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  symbol: IngredientCategorySymbolId;
  /** Force the monochrome rendering used where colour would be noise. */
  monochrome?: boolean;
}

/**
 * The category mark shown beside an ingredient and on the picker filters.
 *
 * It now delegates to the ONE approved PINGÜINO icon set
 * (`components/icons/PinguinoIcons`) instead of carrying its own drawings, so
 * desktop rows, mobile rows, the picker and the mobile sheet cannot drift apart
 * — only size changes responsively.
 *
 * `all` and `other` are NOT covered by the approved reference sheet. They keep
 * their existing neutral marks and are reported as needing an approved design;
 * inventing a look for them here would break the "one designer's hand" rule.
 */
const APPROVED: Partial<
  Record<IngredientCategorySymbolId, (props: PinguinoIconProps) => React.ReactElement>
> = {
  favorites: FavoritesIcon,
  fresh: FreshIcon,
  dairy: DairyIcon,
  dry: DryIcon,
  chocolate: ChocolateIcon,
  fruit: FruitsIcon,
  nuts: NutsIcon,
  paste: PastesIcon,
};

export function IngredientCategoryIcon({
  symbol,
  className,
  monochrome = false,
  ...props
}: IngredientCategoryIconProps) {
  const Approved = APPROVED[symbol];
  if (Approved) {
    return (
      <Approved
        {...(props as PinguinoIconProps)}
        tone={monochrome ? 'current' : undefined}
        data-category-symbol={symbol}
        className={cn('size-4 shrink-0', className)}
      />
    );
  }

  // AWAITING APPROVED DESIGN — `all` (picker "wszystkie" filter) and `other`
  // (unmatched category fallback). Deliberately neutral placeholders.
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      data-category-symbol={symbol}
      data-icon-status="awaiting-approved-design"
      className={cn('size-4 shrink-0', className)}
      {...props}
    >
      {symbol === 'all' ? (
        <g {...common}>
          <rect x="3" y="3" width="5" height="5" rx="1" />
          <rect x="12" y="3" width="5" height="5" rx="1" />
          <rect x="3" y="12" width="5" height="5" rx="1" />
          <rect x="12" y="12" width="5" height="5" rx="1" />
        </g>
      ) : (
        <g {...common}>
          <path d="m10 2.8 6.2 3.5v7.4L10 17.2l-6.2-3.5V6.3L10 2.8Z" />
          <path d="m3.8 6.3 6.2 3.5 6.2-3.5M10 9.8v7.4" />
        </g>
      )}
    </svg>
  );
}
