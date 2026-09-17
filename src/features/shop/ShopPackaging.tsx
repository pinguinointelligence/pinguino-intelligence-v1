import { useState } from 'react';
import { cn } from '@/lib/cn';
import { SHOP_SINGLE_PLACEHOLDER_SKUS, SHOP_SINGLE_PLACEHOLDER_SRC } from './shopStarterShots';

/**
 * The image frame for a single ingredient.
 *
 * The frame holds the slot at the approved size (--g-ivory, radius 8), so the
 * row never moves with what it shows. OWNER DECISION 2026-09-12, scoped
 * 2026-09-17: the seven physical singles named in `SHOP_SINGLE_PLACEHOLDER_SKUS`
 * show the owner's placeholder photo, and any other single keeps the empty
 * reserved outline. An article's own `imageUrl` always wins. The picture is
 * illustrative, never the article, so the frame stays decorative (`aria-hidden`,
 * `alt=""`): the name beside it names the product.
 *
 * The placeholder is a transparent PNG of a white pouch, drawn whole: contained,
 * never cropped, stretched or blended, so the pouch keeps its own white on the
 * ivory ground. A photo that fails to load falls back to the placeholder (for
 * the seven), then to the empty outline — never a broken image.
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
  const placeholder = SHOP_SINGLE_PLACEHOLDER_SKUS.includes(sku)
    ? SHOP_SINGLE_PLACEHOLDER_SRC
    : null;
  const src = [imageUrl, placeholder].find(
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
