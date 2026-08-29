import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * THE approved editorial vocabulary for global destinations (Gellatti V2.1 §5).
 *
 * The commercial destinations — Sklep, Franchise, Współpracuj z nami — are not
 * plain heading-plus-grid pages in the approved preview. They open on a HERO
 * and then use one shared section rhythm underneath it. Before this module the
 * served pages had no hero at all and still carried `text-ivory` classes from
 * the retired dark shell, which remap to ink on the light destination surface
 * and read as washed-out grey.
 *
 * Every number here was MEASURED from the approved preview at its 1440 × 900
 * reference viewport:
 *
 *   `editorial-hero`   graphite, 1.15fr / 0.85fr, min 350 px  — Współpraca
 *   `shop-hero`        canvas,   1.05fr / 0.95fr, min 460 px  — Sklep
 *   `franchise-hero`   canvas,   1.1fr  / 0.9fr,  min 380 px  — Franchise
 *
 * PRESENTATION ONLY. These components render copy and children; they hold no
 * engine, pricing, entitlement or navigation logic.
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

/**
 * The GRAPHITE editorial hero (Współpracuj z nami). The right half is an
 * explicit image-DIRECTION placeholder, not a decorative block: the approved
 * preview states in the frame what the asset should be and that the asset is
 * not part of the preview, so nothing is implied to exist that does not.
 */
export function EditorialHero({
  eyebrow,
  title,
  blurb,
  action,
  directionLines,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  action?: ReactNode;
  directionLines: readonly string[];
}) {
  return (
    <div
      className="grid overflow-hidden rounded-[12px] bg-[var(--g-graphite)] text-white lg:min-h-[350px] lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]"
      data-destination-hero="editorial"
    >
      <div className="self-center p-[clamp(34px,5vw,64px)]">
        <DestinationEyebrow tone="inverse">{eyebrow}</DestinationEyebrow>
        <h1 className="my-[10px] max-w-[700px] text-[clamp(38px,4.5vw,60px)] leading-none font-extrabold tracking-[-0.05em] text-white">
          {title}
        </h1>
        <p className="max-w-[600px] text-[15px] leading-relaxed text-[#c6c3bd]">{blurb}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
      <div className="m-[26px] grid min-h-[320px] place-items-center rounded-[10px] border border-dashed border-white/25 bg-white/[0.04] p-4 text-center text-[10px] leading-[1.5] text-[#a9a69f]">
        <span>
          {directionLines.map((line, index) => (
            <span key={line} className="block">
              {index === 0 ? <strong className="font-normal">{line}</strong> : line}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/**
 * The CANVAS hero used by Sklep and Franchise: copy on the left, a page-owned
 * visual on the right. `ratio` and `minHeight` carry each page's own approved
 * proportion rather than averaging the two into one compromise.
 */
export function SplitHero({
  eyebrow,
  title,
  blurb,
  actions,
  note,
  visual,
  ratio = 'shop',
}: {
  eyebrow?: string;
  title: string;
  blurb?: string;
  actions?: ReactNode;
  note?: string;
  visual: ReactNode;
  ratio?: 'shop' | 'franchise';
}) {
  return (
    <div
      className={cn(
        'grid overflow-hidden rounded-[12px] border border-[var(--g-line)] bg-[var(--g-ivory-deep)]',
        ratio === 'shop'
          ? 'lg:min-h-[460px] lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]'
          : 'lg:min-h-[380px] lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]',
      )}
      data-destination-hero={ratio}
    >
      <div
        className={cn(
          'self-center',
          ratio === 'shop' ? 'p-[clamp(34px,6vw,74px)]' : 'p-[clamp(36px,5vw,66px)]',
        )}
      >
        {eyebrow ? <DestinationEyebrow>{eyebrow}</DestinationEyebrow> : null}
        <h1 className="my-[10px] max-w-[700px] text-[clamp(38px,4.5vw,56px)] leading-none font-extrabold tracking-[-0.05em] text-[var(--g-ink)]">
          {title}
        </h1>
        {blurb ? (
          <p className="max-w-[600px] text-[15px] leading-relaxed text-[var(--g-text-secondary)]">
            {blurb}
          </p>
        ) : null}
        {actions ? <div className="mt-5 flex flex-wrap items-center gap-3">{actions}</div> : null}
        {note ? (
          <p className="mt-5 text-[13px] leading-relaxed text-[var(--g-text-muted)]">{note}</p>
        ) : null}
      </div>
      {visual}
    </div>
  );
}

/**
 * The approved image-direction frame used inside destination cards: an ivory
 * panel that NAMES the asset it is standing in for. It is deliberately not a
 * silent grey rectangle — a reader should never wonder whether an image failed
 * to load.
 */
export function ImageDirection({
  lines,
  className,
}: {
  lines: readonly string[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid place-items-center rounded-[10px] border border-dashed border-[var(--g-line-strong)] bg-[var(--g-ivory-deep)] p-4 text-center text-[10px] leading-[1.5] text-[var(--g-text-secondary)]',
        className,
      )}
      data-image-direction
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

/** The approved orange-ruled note the commercial pages close on. */
export function CommerceLock({ children }: { children: ReactNode }) {
  return (
    <div className="mt-[18px] border-l-2 border-[var(--g-orange)] bg-[var(--g-ivory)] p-[18px] text-[12px] leading-[1.6] text-[var(--g-text-secondary)]">
      {children}
    </div>
  );
}
