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
          <p className="text-[10px] font-semibold tracking-[0.13em] text-stone-500 uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-2 max-w-3xl text-[25px] leading-[1.08] font-[750] tracking-[-0.035em] text-balance text-ink sm:text-[30px]">
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
