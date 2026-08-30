import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * THE approved editorial vocabulary for global destinations (Gellatti V2.1 §5).
 *
 * PRESENTATION ONLY. Nothing here holds engine, pricing, entitlement, commerce
 * or navigation logic — these components render copy and children, so a page
 * can adopt the approved geometry without giving up any of its behaviour.
 *
 * Every number below was MEASURED from the approved preview at its 1440 × 900
 * reference viewport (`index.html?preview=<page>` on the V2.1 pack), not
 * estimated from the screenshots:
 *
 *   canvas            x 80 · w 1280 · page padding 42px 0 72px
 *   section rhythm    58px between blocks, 12px grid gap
 *   hero              radius 12px · 1px var(--g-line) · overflow hidden
 *   shop hero         470px · cols 670.94 / 607.05 (1.05fr / 0.95fr) · pad 74px
 *   franchise hero    380px · cols 702.89 / 575.11 (1.1fr  / 0.9fr)  · pad 66px
 *   editorial hero    372px · graphite #191a1d      (1.15fr / 0.85fr)
 *   h1                64px / 0.98 / 800 / -0.055em
 *   section h2        22px / 1.2  / 700 / -0.025em
 *   card              radius 12px · 1px var(--g-line) · padding 18px · white
 */

/** The one 10 px uppercase eyebrow used across every destination section. */
export function DestinationEyebrow({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'inverse';
}) {
  return (
    <span
      className={cn(
        'block text-[10px] leading-[1.25] font-bold tracking-[0.08em] uppercase',
        tone === 'inverse' ? 'text-[#aaa7a1]' : 'text-[var(--g-text-secondary)]',
      )}
    >
      {children}
    </span>
  );
}

/**
 * The approved section head: eyebrow, 22 px title, 12 px helper — with an
 * optional trailing slot the preview uses for a count chip.
 */
export function DestinationSectionHead({
  eyebrow,
  title,
  helper,
  trailing,
  className,
}: {
  eyebrow?: string;
  title: string;
  helper?: string;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-[18px] flex items-end gap-5', className)}>
      <div className="min-w-0 flex-1">
        {eyebrow ? <DestinationEyebrow>{eyebrow}</DestinationEyebrow> : null}
        <h2 className="m-0 text-[22px] leading-[1.2] font-bold tracking-[-0.025em] text-[var(--g-ink)]">
          {title}
        </h2>
        {helper ? (
          <p className="mt-1 text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">{helper}</p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

/** The 58 px block rhythm the approved destinations use between sections. */
export function DestinationSection({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn('pt-[58px]', className)}>
      {children}
    </section>
  );
}

/**
 * The approved destination hero.
 *
 * One component covers all three because the preview uses one recipe with
 * three calibrations: a 12 px rounded, hairline-bordered band on the `#e7e3dd`
 * surface, copy on the left at the page's own inset, and a page-owned visual on
 * the right. `tone='graphite'` flips the whole band to #191a1d for Współpraca.
 */
export function DestinationHero({
  eyebrow,
  title,
  blurb,
  actions,
  note,
  visual,
  variant,
}: {
  eyebrow?: string;
  title: string;
  blurb?: string;
  actions?: ReactNode;
  note?: string;
  visual?: ReactNode;
  variant: 'shop' | 'franchise' | 'editorial';
}) {
  const graphite = variant === 'editorial';
  return (
    <div
      data-destination-hero={variant}
      className={cn(
        'grid overflow-hidden rounded-[12px] border',
        graphite
          ? 'border-transparent bg-[var(--g-graphite)] text-white lg:min-h-[372px] lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]'
          : 'border-[var(--g-line)] bg-[#e7e3dd]',
        variant === 'shop' && 'lg:min-h-[470px] lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]',
        variant === 'franchise' &&
          'lg:min-h-[380px] lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]',
      )}
    >
      <div
        className={cn(
          'flex flex-col justify-center',
          variant === 'shop' && 'p-[clamp(28px,5.2vw,74px)]',
          variant === 'franchise' && 'p-[clamp(28px,4.6vw,66px)]',
          graphite && 'p-[clamp(28px,4.4vw,64px)]',
        )}
      >
        {eyebrow ? (
          <DestinationEyebrow tone={graphite ? 'inverse' : 'muted'}>{eyebrow}</DestinationEyebrow>
        ) : null}
        <h1
          className={cn(
            'my-[10px] text-[clamp(38px,4.45vw,64px)] leading-[0.98] font-extrabold tracking-[-0.055em]',
            graphite ? 'text-white' : 'text-[var(--g-ink)]',
          )}
        >
          {title}
        </h1>
        {blurb ? (
          <p
            className={cn(
              'max-w-[560px] text-[15px] leading-relaxed',
              graphite ? 'text-[#c6c3bd]' : 'text-[var(--g-text-secondary)]',
            )}
          >
            {blurb}
          </p>
        ) : null}
        {actions ? <div className="mt-5 flex flex-wrap items-center gap-3">{actions}</div> : null}
        {note ? (
          <p
            className={cn(
              'mt-5 text-[13px] leading-relaxed',
              graphite ? 'text-[#a9a69f]' : 'text-[var(--g-text-muted)]',
            )}
          >
            {note}
          </p>
        ) : null}
      </div>
      {visual}
    </div>
  );
}

/**
 * The approved image-direction frame: a panel that NAMES the asset it stands in
 * for. Deliberately not a silent grey rectangle — a reader should never have to
 * wonder whether an image failed to load.
 */
export function ImageDirection({
  lines,
  className,
  tone = 'paper',
}: {
  lines: readonly string[];
  className?: string;
  tone?: 'paper' | 'inverse';
}) {
  return (
    <div
      data-image-direction
      className={cn(
        'grid place-items-center rounded-[10px] border border-dashed p-4 text-center text-[10px] leading-[1.5]',
        tone === 'inverse'
          ? 'border-white/25 bg-white/[0.04] text-[#a9a69f]'
          : 'border-[var(--g-line-strong)] bg-[var(--g-ivory-deep)] text-[var(--g-text-secondary)]',
        className,
      )}
    >
      <span>
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </span>
    </div>
  );
}

/** The approved orange-ruled note the commercial destinations close on. */
export function CommerceLock({ children }: { children: ReactNode }) {
  return (
    <div className="mt-[18px] border-l-2 border-[var(--g-orange)] bg-[var(--g-ivory)] p-[18px] text-[12px] leading-[1.6] text-[var(--g-text-secondary)]">
      {children}
    </div>
  );
}

/** The approved destination card shell: 12 px radius, hairline, 18 px padding. */
export const DESTINATION_CARD =
  'flex min-w-0 flex-col rounded-[12px] border border-[var(--g-line)] bg-white p-[18px]';
