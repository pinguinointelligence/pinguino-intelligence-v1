import type { SVGProps } from 'react';
import { cn } from '@/lib/cn';
import type { IngredientCategorySymbolId } from './ingredientCategorySymbols';

export interface IngredientCategoryIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  symbol: IngredientCategorySymbolId;
}

/** Decorative, stroke-based category mark shared by picker filters and rows. */
export function IngredientCategoryIcon({
  symbol,
  className,
  ...props
}: IngredientCategoryIconProps) {
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
      ) : symbol === 'favorites' ? (
        <path
          {...common}
          d="m10 2.8 2.05 4.15 4.58.67-3.31 3.22.78 4.56L10 13.25 5.9 15.4l.78-4.56-3.31-3.22 4.58-.67L10 2.8Z"
        />
      ) : symbol === 'fresh' ? (
        <g {...common}>
          <path d="M4 15.8c4.8-.5 8.3-3.5 10.6-9.4" />
          <path d="M6 12.8C2.8 11.5 3.1 7 4 4.2c2.9.3 6.7 1.4 7.1 4.5" />
          <path d="M11.2 9.4c.4-3.5 3.2-5.2 5.5-5.9.5 2.5.2 5.9-3 7.3" />
        </g>
      ) : symbol === 'dairy' ? (
        <g {...common}>
          <path d="M7 3.2h6M7.8 3.2v3L6.5 8.5v7.8c0 .6.5 1 1 1h5c.6 0 1-.4 1-1V8.5l-1.3-2.3v-3" />
          <path d="M6.5 10h7" />
        </g>
      ) : symbol === 'dry' ? (
        <g {...common}>
          <rect x="3" y="3" width="14" height="14" rx="2" />
          <path d="M7.5 3v14M12.5 3v14M3 7.5h14M3 12.5h14" />
        </g>
      ) : symbol === 'chocolate' ? (
        <g {...common}>
          <rect x="4" y="2.8" width="12" height="14.4" rx="2" />
          <path d="M10 2.8v14.4M4 7.6h12M4 12.4h12" />
        </g>
      ) : symbol === 'fruit' ? (
        <g {...common}>
          <path d="M10 6.8c-1.6-2.4-5.9-1.8-6.3 2.4-.5 4.8 3.2 8 6.3 8 3.1 0 6.8-3.2 6.3-8-.4-4.2-4.7-4.8-6.3-2.4Z" />
          <path d="M10 6.8c0-2 .7-3.2 2-4.2M10.8 4.2c1.8-1.2 3.5-.8 4.4.1-1.1 1.5-2.8 2-4.4-.1Z" />
        </g>
      ) : symbol === 'nuts' ? (
        <g {...common}>
          <path d="M10 3.1c3.1 0 5.7 3.3 5.7 7.3 0 4.2-2.7 6.5-5.7 6.5s-5.7-2.3-5.7-6.5C4.3 6.4 6.9 3.1 10 3.1Z" />
          <path d="M10 3.1c-.2 2.2-1.4 3.7-3.8 4.7M10 3.1c.2 2.2 1.4 3.7 3.8 4.7" />
        </g>
      ) : symbol === 'paste' ? (
        <g {...common}>
          <path d="M5.2 6.4h9.6l-.6 9.2c0 .9-.8 1.6-1.7 1.6h-5c-.9 0-1.7-.7-1.7-1.6l-.6-9.2Z" />
          <path d="M4.8 3.2h10.4v3.2H4.8zM7 10.2c1.6-.9 4.4-.9 6 0" />
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
