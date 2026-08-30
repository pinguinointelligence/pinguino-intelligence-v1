import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * THE one page heading for every authenticated screen.
 *
 * Before this primitive the destinations carried an EDITORIAL rhythm
 * (`text-4xl md:text-6xl`, `pt-16`, a `text-lg` blurb, `mt-20` before the
 * content) while the Pro workspace carried the instrument rhythm the
 * `/pro/production` master defines (`text-3xl`, tight top offset, muted
 * supporting copy). Moving between Receptury and Production therefore felt like
 * moving between two products.
 *
 * One heading, one type ramp, one vertical rhythm — the eyebrow, the title and
 * the supporting line always relate to each other the same way, on every route.
 */
export function PageHeading({
  eyebrow,
  title,
  blurb,
  actions,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  blurb?: ReactNode;
  /** Optional page-level controls, aligned to the title's baseline block. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0">
        {eyebrow ? (
          /* V2.1: the authority sets the eyebrow at 10px/1.25 (12.5 px tall).
             Left at the browser's `normal`, it rendered 15 px tall and pushed
             the title 3 px down on every authenticated screen. */
          <p className="text-[10px] leading-[1.25] font-semibold tracking-[0.13em] text-stone-500 uppercase">
            {eyebrow}
          </p>
        ) : null}
        {/* V2.1: the authority sets the page title at -0.04em on both steps —
            measured -1px at 25px and -1.2px at 30px. The -0.035em this used to
            carry left the title 0.125px loose per character on mobile and
            0.15px on desktop, which reads as a slightly wider word on every
            authenticated screen. */}
        <h1 className="mt-[7px] max-w-3xl text-[25px] leading-[1.08] font-[750] tracking-[-0.04em] text-balance text-ink sm:text-[30px]">
          {title}
        </h1>
        {blurb ? (
          <p className="mt-3 max-w-[680px] text-sm leading-relaxed text-stone-600">{blurb}</p>
        ) : null}
      </div>
      {actions ? <div className="flex min-w-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** The one gap between a page heading and the content it introduces. */
export const PAGE_HEADING_CONTENT_GAP = 'mt-6';
