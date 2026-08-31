import { cn } from '@/lib/cn';

/**
 * The approved Gellatti packaging presentation.
 *
 * MASTER DESIGNBOOK §7 "Shop": the media side of the hero carries a real
 * packaging card — never an empty dark rectangle — and every product is shown
 * inside a dashed neutral packaging frame. Both are measured from the approved
 * V2.1 Shop screen (`index.html?preview=shop`):
 *
 *   hero pack card   260 × 333 · padding 28 · radius 8 · ivory #efe8dc
 *                    · 1px rgba(255,255,255,.18) on the graphite half
 *   packaging frame  1px DASHED · radius 10 · warm paper · min-height 230
 *   pouch            118 wide · padding 16 · white · radius 8 8 14 14
 *                    · 1px hairline · shadow 0 14px 34px rgb(16 17 19 / 10%)
 *
 * The wordmark is the official asset, never redrawn (Designbook §3).
 */

const WORDMARK = '/brand/gellatti-wordmark-graphite.svg';

function Wordmark({ className }: { className?: string }) {
  return (
    <img
      src={WORDMARK}
      alt=""
      width={1024}
      height={376}
      aria-hidden
      data-logo-asset={WORDMARK}
      className={cn('block object-contain', className)}
    />
  );
}

/**
 * The hero packaging card — the ivory pack standing on the graphite half.
 * `caption` carries a real mono fact about the pack, not a placeholder notice.
 */
export function ShopPackShot({
  title,
  caption,
}: {
  title: string;
  caption: string;
}) {
  return (
    <div
      className="grid min-h-[190px] place-items-center bg-[var(--g-graphite)] p-[26px]"
      data-testid="shop-pack-shot"
    >
      <div
        className="flex w-[260px] max-w-full flex-col rounded-[8px] border border-white/[0.18] bg-[var(--color-education-ivory)] p-7"
        style={{ minHeight: 333 }}
      >
        <span className="inline-flex w-fit bg-white px-1.5 py-1">
          <Wordmark className="h-[26px] w-[86px]" />
        </span>
        <strong className="mt-7 max-w-[9ch] text-[19px] leading-[1.15] font-bold tracking-[-0.02em] text-[var(--g-ink)]">
          {title}
        </strong>
        <span className="mt-auto pt-6 font-mono text-[11px] tracking-[0.04em] text-[var(--g-text-secondary)]">
          {caption}
        </span>
      </div>
    </div>
  );
}

/**
 * The product packaging frame used on every catalogue card and in the product
 * detail block: a dashed neutral frame with a small white pouch inside it.
 */
export function ShopPackFrame({
  title,
  meta,
  size = 'card',
}: {
  title: string;
  meta?: string | null;
  size?: 'card' | 'detail';
}) {
  return (
    <div
      className={cn(
        'grid place-items-center rounded-[10px] border border-dashed border-[var(--g-line-strong)] bg-[var(--g-ivory-deep)]',
        size === 'card' ? 'min-h-[230px] p-5' : 'min-h-[250px] p-6',
      )}
      data-testid="shop-pack-frame"
    >
      <div
        className="flex w-[118px] flex-col rounded-[8px_8px_14px_14px] border border-[var(--g-line)] bg-white p-4 shadow-[0_14px_34px_rgb(16_17_19/10%)]"
        style={{ minHeight: 154 }}
      >
        <Wordmark className="h-[14px] w-[62px]" />
        <strong className="mt-4 text-[11px] leading-[1.25] font-bold tracking-[-0.01em] text-[var(--g-ink)]">
          {title}
        </strong>
        {meta ? (
          <span className="mt-auto pt-3 font-mono text-[10px] text-[var(--g-text-secondary)]">
            {meta}
          </span>
        ) : null}
      </div>
    </div>
  );
}
