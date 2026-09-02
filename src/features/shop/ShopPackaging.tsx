import { cn } from '@/lib/cn';

/**
 * The reserved image frame for a single ingredient.
 *
 * No single-ingredient photography exists yet. This frame holds the slot at the
 * approved size so the layout does not move when the real shots arrive, and it
 * is deliberately almost invisible (--g-ivory, a hairline outline) so it reads as
 * pending rather than as a filled product tile. It must never be filled with
 * invented or substituted imagery.
 */
export function ShopReservedFrame({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'grid h-20 place-items-center rounded-[8px] bg-[var(--g-ivory)] sm:h-[94px]',
        className,
      )}
      data-testid="shop-reserved-frame"
      aria-hidden
    >
      <span className="block h-[38px] w-7 rounded-[5px] border border-[var(--g-line)] sm:h-[46px] sm:w-[34px]" />
    </div>
  );
}
