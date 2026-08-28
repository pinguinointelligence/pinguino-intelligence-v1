import { cn } from '@/lib/cn';

const OFFICIAL_PRO_LOGO = '/brand/gellatti-wordmark-graphite.svg';

/**
 * Exact frontend rendering of the owner-approved public Gellatti wordmark.
 * The artwork stays untouched and keeps its exact proportions; no AI suffix
 * is added to the public lockup.
 */
export function OfficialProLogo({ className }: { className?: string }) {
  return (
    <span className="flex h-12 w-[120px] shrink-0 items-center sm:w-[136px]">
      <img
        src={OFFICIAL_PRO_LOGO}
        alt=""
        width={1024}
        height={376}
        aria-hidden
        data-logo-asset={OFFICIAL_PRO_LOGO}
        data-logo-source="/brand/gellatti-wordmark-graphite.svg"
        className={cn('max-h-12 w-full shrink-0 object-contain', className)}
      />
    </span>
  );
}
