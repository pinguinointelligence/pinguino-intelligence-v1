import { cn } from '@/lib/cn';

const OFFICIAL_PRO_LOGO = '/logo/PI-logo-blackwhite-web.png';

/**
 * Exact frontend rendering of the owner-supplied PI-logo-blackwhite.pdf.
 *
 * The PNG is a technical crop of a 300 dpi Poppler render: the artwork,
 * proportions, typography and black/white palette are unchanged. This component
 * only controls proportional placement and whitespace in the compact Pro header.
 */
export function OfficialProLogo({ className }: { className?: string }) {
  return (
    <span className="flex items-center gap-2">
      <img
        src={OFFICIAL_PRO_LOGO}
        alt=""
        width={2755}
        height={2187}
        aria-hidden
        data-logo-asset={OFFICIAL_PRO_LOGO}
        data-logo-source="/logo/PI-logo-blackwhite.pdf"
        className={cn('h-11 w-auto shrink-0 object-contain sm:h-12', className)}
      />
      <span className="rounded-lg border border-ink/15 px-2 py-1 text-[10px] font-semibold tracking-[0.08em] text-ink">
        PRO
      </span>
    </span>
  );
}
