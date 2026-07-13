import { useState } from 'react';
import { cn } from '@/lib/cn';
import { color, type } from './tokens';

interface RecipeImageProps {
  /** Photo URL. When absent or on load error, the elegant fallback is shown. */
  src?: string | null;
  /** Required alt text (empty string only if purely decorative). */
  alt: string;
  /** CSS aspect ratio to reserve, e.g. "4 / 3" (default) — prevents layout shift. */
  ratio?: string;
  /** Rounded corners preset applied to the frame. */
  rounded?: string;
  className?: string;
}

/**
 * Image frame that reserves its box BEFORE the photo loads (fixed aspect ratio),
 * so there is zero cumulative layout shift. Lazy-loads and async-decodes. If
 * `src` is missing or fails, a calm placeholder (glyph + "No photo") is shown —
 * never a broken-image icon.
 */
export function RecipeImage({
  src,
  alt,
  ratio = '4 / 3',
  rounded = 'rounded-xl',
  className,
}: RecipeImageProps) {
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(src) && !failed;

  return (
    <div
      className={cn('relative w-full overflow-hidden bg-stone-100', rounded, className)}
      style={{ aspectRatio: ratio }}
    >
      {showImg ? (
        <img
          src={src ?? undefined}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-stone-50">
          <div className="flex flex-col items-center gap-1.5 px-4 text-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect
                x="3"
                y="5"
                width="18"
                height="14"
                rx="2.5"
                stroke="currentColor"
                strokeWidth="1.4"
                className="text-stone-300"
              />
              <circle cx="8.5" cy="10" r="1.6" className="fill-stone-300" />
              <path
                d="M4 17l5-4.5 4 3 3-2.5 4 3.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-stone-300"
              />
            </svg>
            <span className={cn(type.caption, color.textMuted)}>Zdjęcie wkrótce</span>
          </div>
        </div>
      )}
    </div>
  );
}
