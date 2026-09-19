import { useState } from 'react';
import { cn } from '@/lib/cn';
import { OwnerAssetImage } from '@/features/work-with-us/OwnerAssetImage';
import type { OwnerAssetId } from '@/features/work-with-us/ownerAssets';

/**
 * The ONE gallery the four Franchise formats share (owner, 2026-09-19).
 *
 * A format used to show a single photograph, which is not enough to sell a
 * format that is really a way of working: a Food Truck is the open hatch AND
 * the trailer AND how it travels. So the block now carries the format's whole
 * set, in the order the owner listed, and nothing was dropped to make room —
 * the photograph that was already there simply became the last slide.
 *
 * DELIBERATELY NOT A CAROUSEL. No dots, no thumbnail strip, no autoplay and no
 * frame around the frame: one photograph, two quiet arrows inside its own
 * edges, and a small counter so it is obvious there is more. Switching is a
 * cross-fade between stacked images rather than a slide, which is why every
 * image stays mounted — the second view is instant and the box never reflows.
 *
 * A format with a single photograph renders exactly what it rendered before:
 * the controls are not drawn at all, so the page does not sprout dead arrows
 * while the owner is still sending pictures.
 *
 * The caller passes `key={format.id}` so choosing another format starts that
 * format at its own first image instead of inheriting a stale index.
 */
export function FranchiseFormatGallery({
  images,
  label,
}: {
  /** The format's photographs, in the order they should be seen. */
  readonly images: readonly OwnerAssetId[];
  /** The format's name, so the controls say WHAT they page through. */
  readonly label: string;
}) {
  const [index, setIndex] = useState(0);
  const count = images.length;
  /* A format the owner has not sent more pictures for yet. */
  const many = count > 1;
  const go = (delta: number) => setIndex((current) => (current + delta + count) % count);

  if (count === 0) return null;

  return (
    <div
      data-testid="franchise-format-gallery"
      data-gallery-count={count}
      data-gallery-index={index}
      className="group relative block overflow-hidden rounded-[12px] bg-[#efe8dc]"
      role={many ? 'group' : undefined}
      aria-roledescription={many ? 'Galeria' : undefined}
      aria-label={many ? `${label} — zdjęcia` : undefined}
      onKeyDown={
        many
          ? (event) => {
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                go(-1);
              } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                go(1);
              }
            }
          : undefined
      }
    >
      {/* The box is the format's, not the photograph's: every slide occupies the
          same aspect so paging never moves the text underneath. */}
      <span className="block aspect-[16/10] md:aspect-[16/9]">
        {images.map((id, position) => (
          <span
            key={id}
            data-gallery-slide={position}
            data-active={position === index ? 'true' : undefined}
            aria-hidden={position === index ? undefined : 'true'}
            className={cn(
              'absolute inset-0 block transition-opacity duration-500 ease-out',
              position === index ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          >
            {/* Never `priority`: the hero above is the route's LCP element and
                this block sits below it. Every slide stays mounted, so the
                second view costs no request at all. */}
            <OwnerAssetImage id={id} sizes="(min-width: 768px) 68vw, 100vw" />
          </span>
        ))}
      </span>

      {many ? (
        <>
          <GalleryArrow side="left" label={`${label} — poprzednie zdjęcie`} onClick={() => go(-1)} />
          <GalleryArrow side="right" label={`${label} — następne zdjęcie`} onClick={() => go(1)} />
          {/* Not dots: the count, set small, in the page's own mono. */}
          <span
            aria-hidden="true"
            className="absolute right-3 bottom-3 z-[2] rounded-full bg-[rgba(14,15,17,0.46)] px-2 py-[3px] font-mono text-[10px] leading-[1.2] font-medium tracking-[0.08em] text-white/90 backdrop-blur-[2px]"
          >
            {index + 1} / {count}
          </span>
          <span aria-live="polite" className="sr-only">
            {`Zdjęcie ${index + 1} z ${count}`}
          </span>
        </>
      ) : null}
    </div>
  );
}

/**
 * One arrow, inside the photograph's own edge.
 *
 * Quiet by default and fully present on hover or keyboard focus — visible
 * enough to be found, never loud enough to compete with the photograph. The
 * chevron is drawn inline because a two-line path does not need an icon set.
 */
function GalleryArrow({
  side,
  label,
  onClick,
}: {
  readonly side: 'left' | 'right';
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={`franchise-gallery-${side}`}
      onClick={onClick}
      className={cn(
        'pro-focus-ring absolute top-1/2 z-[2] grid size-9 -translate-y-1/2 place-items-center rounded-full',
        /* The scrim carries the chevron on a bright photograph without putting a
           border on the picture; the shadow keeps it readable on a pale sky. */
        'bg-[rgba(14,15,17,0.5)] text-white opacity-80 shadow-[0_1px_10px_rgba(0,0,0,0.22)] backdrop-blur-[2px]',
        'transition-[opacity,background-color] duration-200',
        'hover:bg-[rgba(14,15,17,0.7)] hover:opacity-100 focus-visible:opacity-100',
        'md:size-11',
        side === 'left' ? 'left-2.5 md:left-3.5' : 'right-2.5 md:right-3.5',
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[17px] md:size-[19px]"
      >
        <path d={side === 'left' ? 'M14.5 5.5 8 12l6.5 6.5' : 'M9.5 5.5 16 12l-6.5 6.5'} />
      </svg>
    </button>
  );
}
