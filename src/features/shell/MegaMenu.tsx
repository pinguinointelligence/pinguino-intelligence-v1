import { Link } from 'react-router';
import { copy } from '@/copy/en';
import type { NavItem } from './navConfig';
import {
  ImagePlaceholder,
  MegaMenuItem,
  NavLinkColumn,
  NavLinkRow,
} from './MegaMenuItem';

/**
 * The mega-menu surface (Phase 6C) — a Tesla-style FULL-WIDTH sheet, not a small
 * floating box. One continuous dark shell surface flush under the header, spanning
 * the viewport; the content sits in a centered max-width band. Each nav item keeps
 * its own `layout`, so the arrangement (and height) varies per category, while item
 * groups stay transparent (MegaMenuItem) — no boxed cards, no heavy shadow.
 */

function PanelBody({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const groups = item.groups ?? [];

  switch (item.layout) {
    case 'offers':
      return (
        <div>
          {item.blurb ? <p className="mb-7 text-sm text-ivory/55">{item.blurb}</p> : null}
          <div className="grid grid-cols-4 gap-8">
            {groups.map((group) => (
              <MegaMenuItem key={group.title} group={group} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      );

    case 'browse': {
      const [browse, categories] = groups;
      return (
        <div className="grid grid-cols-[1fr_auto] gap-10">
          <div className="grid grid-cols-3 gap-x-6 gap-y-6">
            {browse?.links.map((link) =>
              link.to ? (
                <Link
                  key={link.label}
                  to={link.to}
                  onClick={onNavigate}
                  className="group flex flex-col gap-2"
                >
                  <ImagePlaceholder className="aspect-[4/3] transition-colors group-hover:bg-ivory/[0.08]" />
                  <span className="text-sm text-ivory/70 transition-colors group-hover:text-ivory">
                    {link.label}
                  </span>
                </Link>
              ) : null,
            )}
          </div>
          {categories ? (
            <div className="border-l border-ivory/10 pl-10">
              <NavLinkColumn group={categories} onNavigate={onNavigate} />
            </div>
          ) : null}
        </div>
      );
    }

    case 'docs':
      return (
        <div>
          {item.blurb ? <p className="mb-6 text-sm text-ivory/55">{item.blurb}</p> : null}
          <div className="grid grid-cols-2 gap-x-12 gap-y-1">
            {groups.map((group, i) => (
              <NavLinkColumn key={i} group={group} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      );

    case 'product':
      return (
        <div>
          {item.blurb ? <p className="mb-5 text-sm text-ivory/55">{item.blurb}</p> : null}
          {groups[0] ? <NavLinkColumn group={groups[0]} onNavigate={onNavigate} /> : null}
          {item.engineLabel ? (
            <div className="mt-5 flex items-center justify-between border-t border-ivory/10 pt-4">
              <span className="text-xs text-ivory/45">{copy.nav.calculator.engineNote}</span>
              <span className="font-mono text-sm text-ivory">{item.engineLabel}</span>
            </div>
          ) : null}
        </div>
      );

    case 'steps': {
      const group = groups[0];
      return (
        <div className="grid grid-cols-[auto_1fr] gap-7">
          {group?.image ? <ImagePlaceholder className="aspect-[3/4] w-28" /> : null}
          <div className="flex flex-col">
            {item.blurb ? <p className="mb-3 text-sm text-ivory/55">{item.blurb}</p> : null}
            {group?.links.map((link) => (
              <NavLinkRow key={link.label} link={link} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      );
    }

    case 'plans':
    case 'links':
    default:
      return (
        <div className="flex flex-col">
          {item.blurb ? <p className="mb-3 text-sm text-ivory/55">{item.blurb}</p> : null}
          {groups[0] ? <NavLinkColumn group={groups[0]} onNavigate={onNavigate} /> : null}
        </div>
      );
  }
}

interface MegaMenuProps {
  item: NavItem;
  onNavigate: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/**
 * The currently open mega menu — a full-width sheet flush under the 64px header
 * (top-16), one continuous dark surface across the viewport, with content centered
 * in a max-width band. No floating box, no rounded panel, no heavy card shadow —
 * just a hairline at the sheet's bottom edge to separate it from the dimmed page.
 */
export function MegaMenu({ item, onNavigate, onMouseEnter, onMouseLeave }: MegaMenuProps) {
  return (
    <div
      id={`megamenu-${item.id}`}
      role="region"
      aria-label={item.label}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed inset-x-0 top-16 z-50 border-b border-ivory/10 bg-shell"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-9">
        <PanelBody item={item} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
