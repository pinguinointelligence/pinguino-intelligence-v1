import { cn } from '@/lib/cn';

const OFFICIAL_PRO_LOGO = '/logo/gellattiLOGO.png';

/**
 * Exact frontend rendering of the owner-supplied Gellatti AI lockup.
 * The source PNG stays untouched and keeps its exact proportions.
 */
export function OfficialProLogo({ className }: { className?: string }) {
  return (
    <span className="flex h-12 w-[136px] shrink-0 items-center sm:w-[146px]">
      <img
        src={OFFICIAL_PRO_LOGO}
        alt=""
        width={1000}
        height={350}
        aria-hidden
        data-logo-asset={OFFICIAL_PRO_LOGO}
        data-logo-source="/logo/gellattiLOGO.png"
        className={cn('max-h-12 w-full shrink-0 object-contain', className)}
      />
    </span>
  );
}
