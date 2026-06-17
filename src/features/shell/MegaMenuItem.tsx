import { Link } from 'react-router';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import type { NavGroup, NavLink } from './navConfig';

/**
 * Mega-menu building blocks — all TRANSPARENT (Phase 6C / Tesla reference):
 * no boxed cards, no heavy borders. Item groups sit directly on the single
 * menu surface; the only fill is a faint image/object placeholder.
 */

const soonChip =
  'rounded border border-ivory/15 px-1.5 py-0.5 text-[0.55rem] font-medium tracking-[0.08em] text-ivory/40 uppercase';

/** A single menu link — or a muted "Coming soon" entry when not yet routable. */
export function NavLinkRow({ link, onNavigate }: { link: NavLink; onNavigate?: () => void }) {
  if (link.soon || !link.to) {
    return (
      <span className="flex items-center justify-between gap-3 py-1.5 text-sm text-ivory/35">
        <span>{link.label}</span>
        <span className={soonChip}>{copy.nav.comingSoon}</span>
      </span>
    );
  }
  return (
    <Link
      to={link.to}
      onClick={onNavigate}
      className="block py-1.5 text-sm text-ivory/65 transition-colors hover:text-ivory"
    >
      {link.label}
    </Link>
  );
}

/** A plain vertical column of links (with an optional uppercase column heading). */
export function NavLinkColumn({
  group,
  onNavigate,
}: {
  group: NavGroup;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col">
      {group.title ? (
        <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-label text-ivory/40">
          {group.title}
        </p>
      ) : null}
      {group.links.map((link) => (
        <NavLinkRow key={link.label} link={link} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

/** Faint image / object placeholder — the only filled element in a group. */
export function ImagePlaceholder({ className }: { className?: string }) {
  return <div aria-hidden className={cn('w-full rounded-xl bg-ivory/[0.05]', className)} />;
}

/**
 * A transparent feature/offer group: optional image placeholder, a prominent
 * title, short copy, and its link(s). Used by the Work With Us offers and the
 * Recipes browse group. No card chrome.
 */
export function MegaMenuItem({ group, onNavigate }: { group: NavGroup; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      {group.image ? <ImagePlaceholder className="aspect-[4/3]" /> : null}
      {group.title ? <p className="text-sm font-medium text-ivory">{group.title}</p> : null}
      {group.body ? (
        <p className="text-xs leading-relaxed text-ivory/55">{group.body}</p>
      ) : null}
      <div className="mt-auto flex flex-col">
        {group.links.map((link) => (
          <NavLinkRow key={link.label} link={link} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}
