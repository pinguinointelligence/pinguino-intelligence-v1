/**
 * The Produkcja section bar — Partie · Produkty · Maszyna · Etykiety (package PRODUKCJA V3,
 * Etap 1 §1.2).
 *
 * One flat bar under the one global header: no second ☰, no landing page, no bottom navigation.
 * Every entry is a real `<Link>` built from `PRODUCTION_AREA_SECTIONS` — the same list the ☰
 * „Produkcja” entry is matched against. The current section carries `aria-current="page"`;
 * arrow keys, Home and End move between sections the way the old Production tabs did.
 *
 * A section returns to the last address it had in this session (`productionAreaMemory`); the
 * current section's own entry goes to the section's start. Leaving always goes through
 * `requestLeave`, so a half-edited area form is never dropped without the question.
 */
import { useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { productionAreaCopy } from '@/copy/productionArea';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import { productionAreaSectionAddress } from './productionAreaMemory';
import {
  PRODUCTION_AREA_SECTIONS,
  type ProductionAreaSection,
  type ProductionAreaSectionId,
} from './productionAreaSections';
import { hasUnsavedChanges, requestLeave, useUnsavedGuardStore } from './unsavedGuard';

const c = productionAreaCopy();

const isPlainClick = (event: MouseEvent<HTMLAnchorElement>) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

export function ProductionAreaNav({ current }: { current: ProductionAreaSectionId }) {
  const navigate = useNavigate();
  const ownerUserId = useAuthStore((state) => state.user?.id ?? null);
  const hasDirtyForm = useUnsavedGuardStore((state) => state.dirtyIds.length > 0);
  const links = useRef<Partial<Record<ProductionAreaSectionId, HTMLAnchorElement | null>>>({});

  const targetOf = (section: ProductionAreaSection) =>
    section.id === current ? section.to : productionAreaSectionAddress(ownerUserId, section.id);

  const go = (section: ProductionAreaSection) => {
    const target = targetOf(section);
    requestLeave(() => navigate(target));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    const last = PRODUCTION_AREA_SECTIONS.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    const section = PRODUCTION_AREA_SECTIONS[next]!;
    links.current[section.id]?.focus();
    go(section);
  };

  return (
    <nav
      aria-label={c.navLabel}
      data-testid="production-area-nav"
      className="mt-4 border-b border-[var(--g-line)]"
    >
      <ul className="grid grid-cols-4 lg:flex lg:gap-7">
        {PRODUCTION_AREA_SECTIONS.map((section, index) => {
          const active = section.id === current;
          return (
            <li key={section.id} className="min-w-0">
              <Link
                ref={(node) => {
                  links.current[section.id] = node;
                }}
                to={targetOf(section)}
                aria-current={active ? 'page' : undefined}
                data-testid={`production-area-section-${section.id}`}
                onClick={(event) => {
                  if (!isPlainClick(event) || !hasUnsavedChanges()) return;
                  event.preventDefault();
                  go(section);
                }}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={cn(
                  'pro-focus-ring relative -mb-px flex min-h-12 items-center justify-center border-b-2 px-1 text-[15px] transition-colors lg:justify-start lg:px-0 lg:text-[14px]',
                  active
                    ? 'border-[var(--g-orange)] font-semibold text-[var(--g-ink)]'
                    : 'border-transparent text-[var(--g-text-secondary)] hover:text-[var(--g-ink)]',
                )}
              >
                <span className="truncate">{section.label}</span>
                {active && hasDirtyForm ? (
                  <span
                    className="mt-3 ml-1 inline-block size-1.5 shrink-0 self-start rounded-full bg-[var(--g-orange-line)]"
                    data-testid="production-area-section-unsaved"
                  >
                    <span className="sr-only">{c.sectionUnsaved}</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
