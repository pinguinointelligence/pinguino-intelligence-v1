import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type MetricSize = 'sm' | 'md' | 'lg';

const SIZES: Record<MetricSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-2xl',
};

interface MetricValueProps extends HTMLAttributes<HTMLSpanElement> {
  value: number | string;
  /** Decimal places for numeric values. Display default is 0.1 precision (Masterplan §12). */
  precision?: number;
  unit?: string;
  size?: MetricSize;
}

/** Laboratory number display — mono, tabular numerals (Design Lock §3). */
export function MetricValue({
  value,
  precision = 1,
  unit,
  size = 'md',
  className,
  ...rest
}: MetricValueProps) {
  const formatted = typeof value === 'number' ? value.toFixed(precision) : value;
  return (
    <span
      className={cn('font-mono font-medium tabular-nums text-ink', SIZES[size], className)}
      {...rest}
    >
      {formatted}
      {unit ? <span className="ml-1 text-[0.8em] font-normal text-stone-500">{unit}</span> : null}
    </span>
  );
}
