import { cn } from '@/lib/cn';

interface IvoryLogoMarkProps {
  /** Pixel size of the square mark. */
  size?: number;
  /** Color follows the surface: ivory on charcoal, ink on paper. */
  tone?: 'ivory' | 'ink';
  className?: string;
}

/**
 * Interim abstract penguin curve (matches the favicon). Replace the path when
 * the official SVG mark arrives (Masterplan §3, risk #10).
 */
export function IvoryLogoMark({ size = 24, tone = 'ivory', className }: IvoryLogoMarkProps) {
  return (
    <img
      src="/brand/favicon.svg"
      alt=""
      width={size}
      height={size}
      aria-hidden
      data-logo-asset="/brand/favicon.svg"
      className={cn('shrink-0 object-contain', tone === 'ivory' ? 'opacity-100' : 'opacity-100', className)}
    />
  );
}
