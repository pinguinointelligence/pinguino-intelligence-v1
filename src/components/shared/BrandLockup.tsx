import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';

type Tone = 'ivory' | 'ink';
type Variant = 'horizontal' | 'stacked' | 'mark';

interface BrandLockupProps {
  /** Pixel height of the penguin mark. */
  size?: number;
  /** Color follows the surface: ivory on the black shell, ink on paper. */
  tone?: Tone;
  /** horizontal: mark + wordmark inline · stacked: mark over wordmark · mark: glyph only. */
  variant?: Variant;
  /** Show the INTELLIGENCE subline (stacked variant only). */
  showSub?: boolean;
  className?: string;
}

/**
 * PINGÜINO brand mark — TEMPORARY clean SVG approximation (ref:
 * public/brand/logo_reference.jpeg), to be replaced with the official vector later.
 * A slender line-art penguin facing right: one stroke for the back → crown → beak,
 * an inner stroke for the belly, tapering to a fine tail point. Uniform-weight (not
 * the calligraphic original). Renders in brand ivory via `currentColor`
 * (--color-ivory, #efe9dc); crisp at any size.
 */
export function PenguinMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/favicon.svg"
      alt=""
      width={size}
      height={size}
      aria-hidden
      data-logo-asset="/brand/favicon.svg"
      className={cn('shrink-0 object-contain', className)}
    />
  );
}

/** Full brand lockup — mark + PINGÜINO wordmark (and optional INTELLIGENCE subline). */
export function BrandLockup({
  size = 26,
  tone = 'ivory',
  variant = 'horizontal',
  showSub = false,
  className,
}: BrandLockupProps) {
  const toneClass = tone === 'ivory' ? 'text-ivory' : 'text-ink';

  if (variant === 'mark') {
    return <PenguinMark size={size} className={cn(toneClass, className)} />;
  }

  if (variant === 'stacked') {
    return (
      <span className={cn('inline-flex flex-col items-center gap-4', toneClass, className)}>
        <PenguinMark size={size} />
        <span className="flex flex-col items-center">
          <span className="text-[1.6rem] leading-none font-light tracking-wordmark">
            {copy.brand.name}
          </span>
          {showSub ? (
            <span className="mt-2 text-[0.6rem] leading-none font-light tracking-[0.5em] opacity-70">
              {copy.brand.sub}
            </span>
          ) : null}
        </span>
      </span>
    );
  }

  // horizontal
  return (
    <span className={cn('inline-flex items-center gap-3', toneClass, className)}>
      <PenguinMark size={size} />
      <span className="leading-none">
        <span className="block text-base font-light tracking-wordmark">{copy.brand.name}</span>
        {showSub ? (
          <span className="mt-1 block text-[0.5rem] font-light tracking-[0.45em] opacity-60">
            {copy.brand.sub}
          </span>
        ) : null}
      </span>
    </span>
  );
}
