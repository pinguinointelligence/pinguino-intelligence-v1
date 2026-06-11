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
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden
      className={cn(tone === 'ivory' ? 'text-ivory' : 'text-ink', className)}
    >
      <path
        d="M40.5 10.5c-9 3.5-15.5 12-16.5 22-.7 7.5 1.8 14.5 6.2 19.5.9 1 2.6.3 2.2-1-1.9-6.5-2.6-13.4-.6-20.3 1.9-6.4 5.8-11.9 10.4-15.6 1.4-1.2.3-3.2-1.7-4.6z"
        fill="currentColor"
      />
    </svg>
  );
}
