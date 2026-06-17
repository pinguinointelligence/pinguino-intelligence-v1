import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { BrandLockup } from '@/components/shared/BrandLockup';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import { AppMenu } from './AppMenu';
import { MegaMenu } from './MegaMenu';
import { NAV_ITEMS } from './navConfig';

/**
 * Premium black brand shell — top navigation (Phase 6C).
 *
 * Layout follows the Tesla reference: logo pinned LEFT, the nav group ABSOLUTELY
 * centered (so it never drifts with the logo / action widths), account + menu
 * controls RIGHT. Labels never wrap (whitespace-nowrap); below `xl` the centered
 * nav is hidden in favor of the hamburger drawer rather than wrapping awkwardly.
 * Hover / active state is a soft translucent ivory pill — never an underline, and
 * keyboard focus uses a subtle ivory outline (never the loud UA gold ring). Menus
 * open on hover and focus as a full-width sheet; the page behind dims + blurs.
 */

// Subtle ivory keyboard-focus outline — replaces the loud UA focus ring.
const FOCUS_RING =
  '[outline:none] focus-visible:[outline:1px_solid_rgba(239,233,220,0.35)] focus-visible:[outline-offset:2px]';

export function TopNav({ onNewRecipe }: { onNewRecipe?: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);
  const open = useCallback(
    (id: string) => {
      cancelClose();
      setOpenId(id);
    },
    [cancelClose],
  );
  const closeNow = useCallback(() => {
    cancelClose();
    setOpenId(null);
  }, [cancelClose]);
  // Hover-intent: a short grace period lets the cursor cross into the sheet.
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenId(null), 120);
  }, [cancelClose]);

  // Escape closes any open menu.
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNow();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, closeNow]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  const openItem = NAV_ITEMS.find((item) => item.id === openId) ?? null;

  return (
    <>
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between bg-shell px-6 text-ivory">
        {/* Left — logo */}
        <Link
          to="/"
          onClick={closeNow}
          aria-label={copy.brand.full}
          className={cn('shrink-0 rounded-md', FOCUS_RING)}
        >
          <BrandLockup variant="horizontal" tone="ivory" size={26} />
        </Link>

        {/* Center — absolutely centered nav group (cannot drift with logo width) */}
        <div
          ref={containerRef}
          className="absolute left-1/2 hidden -translate-x-1/2 xl:block"
          onMouseLeave={scheduleClose}
          onBlur={(e) => {
            if (!containerRef.current?.contains(e.relatedTarget as Node)) closeNow();
          }}
        >
          <nav aria-label={copy.brand.full} className="flex items-center gap-0.5">
            {NAV_ITEMS.map((item) => {
              const isOpen = openId === item.id;
              const isActive = pathname === item.to;
              return (
                <div key={item.id} onMouseEnter={() => open(item.id)}>
                  <Link
                    to={item.to}
                    onFocus={() => open(item.id)}
                    onClick={closeNow}
                    aria-haspopup={item.groups ? 'menu' : undefined}
                    aria-expanded={item.groups ? isOpen : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'whitespace-nowrap rounded-full px-3 py-2 text-sm transition-colors',
                      FOCUS_RING,
                      'hover:bg-ivory/10 hover:text-ivory focus-visible:bg-ivory/10 focus-visible:text-ivory',
                      // Soft pill ONLY while this item's menu is open (hover/focus
                      // also fill via the classes above). The current route is NOT
                      // permanently boxed — just a calm, slightly brighter label.
                      isOpen ? 'bg-ivory/10 text-ivory' : isActive ? 'text-ivory' : 'text-ivory/75',
                    )}
                  >
                    {item.label}
                  </Link>
                </div>
              );
            })}
          </nav>
        </div>

        {/* Right — account (desktop) + menu drawer (below xl) */}
        <div className="flex shrink-0 items-center gap-2">
          <AccountControl />
          <div className="xl:hidden">
            <AppMenu onNew={onNewRecipe} tone="ivory" />
          </div>
        </div>
      </header>

      {/* Full-width Tesla-style sheet + page-behind dim/blur while a menu is open */}
      {openItem?.groups ? (
        <>
          <MegaMenu
            item={openItem}
            onNavigate={closeNow}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          />
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onMouseEnter={scheduleClose}
            onClick={closeNow}
            className="fixed inset-0 top-16 z-40 cursor-default bg-black/40 backdrop-blur-sm"
          />
        </>
      ) : null}
    </>
  );
}

/** Compact desktop account control — sign-in or signed-in identity (no new chrome). */
function AccountControl() {
  const authAvailable = useAuthStore((state) => state.available);
  const authStatus = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const openAuthModal = useAuthModalStore((state) => state.open);

  if (!authAvailable) return null;

  const cls = cn(
    'hidden rounded-full px-3.5 py-2 text-sm text-ivory/75 transition-colors hover:bg-ivory/10 hover:text-ivory xl:block',
    FOCUS_RING,
  );

  if (authStatus === 'authed' && user) {
    return (
      <button type="button" onClick={() => void signOut()} className={cls}>
        {copy.nav.signOut}
      </button>
    );
  }

  return (
    <button type="button" onClick={openAuthModal} className={cls}>
      {copy.nav.signIn}
    </button>
  );
}
