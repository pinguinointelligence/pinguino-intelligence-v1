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
    <svg
      viewBox="0 0 100 140"
      width={(size * 100) / 140}
      height={size}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={5.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Back → crown → beak (right-pointing) */}
      <path d="M46 120 C40 102 35 84 34 64 C33 45 37 30 47 25 C53 22 60 24 63 30 C65 33 69 33 73 35" />
      {/* Belly / front */}
      <path d="M48 118 C53 101 58 84 58 64 C58 46 55 33 50 28" />
    </svg>
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
