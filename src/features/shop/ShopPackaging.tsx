import { useState } from 'react';
import { cn } from '@/lib/cn';
import {
  SHOP_SINGLE_OWN_PHOTOS,
  SHOP_SINGLE_PLACEHOLDER_SKUS,
  SHOP_SINGLE_PLACEHOLDER_SRC,
} from './shopStarterShots';

/**
 * The image frame for a single ingredient.
 *
 * The frame holds the slot at the approved size (--g-ivory, radius 8), so the
 * row never moves with what it shows. OWNER DECISION 2026-09-17: the seven
 * physical singles show their own photo (`SHOP_SINGLE_OWN_PHOTOS`); the shared
 * placeholder of 2026-09-12 stays behind them as the fallback, and any other
 * single keeps the empty reserved outline. An article's own `imageUrl` always
 * wins. The frame stays decorative (`aria-hidden`, `alt=""`): the name beside
 * it names the product, so the picture is never announced a second time.
 *
 * Every candidate is a transparent PNG of a white pouch, drawn whole: contained,
 * never cropped, stretched or blended, so the pouch keeps its own white on the
 * ivory ground. A picture that fails to load gives way to the next one —
 * `imageUrl`, own photo, placeholder (for the seven), then the empty outline —
 * never a broken image.
 */
export function ShopReservedFrame({
  sku,
  imageUrl,
  className,
}: {
  sku: string;
  imageUrl: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState<readonly string[]>([]);
  const ownPhoto = SHOP_SINGLE_OWN_PHOTOS.get(sku) ?? null;
  const placeholder = SHOP_SINGLE_PLACEHOLDER_SKUS.includes(sku)
    ? SHOP_SINGLE_PLACEHOLDER_SRC
    : null;
  const src = [imageUrl, ownPhoto, placeholder].find(
    (candidate): candidate is string => !!candidate && !failed.includes(candidate),
  );

  return (
    <div
      className={cn(
        'relative grid h-20 place-items-center overflow-hidden rounded-[8px] bg-[var(--g-ivory)] sm:h-[94px]',
        className,
      )}
      data-testid="shop-reserved-frame"
      aria-hidden
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed((previous) => [...previous, src])}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <span className="block h-[38px] w-7 rounded-[5px] border border-[var(--g-line)] sm:h-[46px] sm:w-[34px]" />
      )}
    </div>
  );
}
