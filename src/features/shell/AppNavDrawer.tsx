import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { cn } from '@/lib/cn';
import { copy } from '@/copy/en';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { proCoreCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { MobileDesignReviewEntry } from '@/features/design-review/ReviewOverlay';
import {
  NAV_GROUP_ORDER,
  isGroupActive,
  navigationAudience,
  visibleNavItems,
  type NavGroupId,
} from './appNav';

const s = copy.shell;
const FOCUSABLE =
  'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';
const iconButton =
  'grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-ink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';

/** The one shallow, plan-aware destination drawer used by every shell. */
export function AppNavDrawer() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const location = useLocation();
  const persona = useProCorePersona();
  const capabilities = proCoreCapabilitiesFor(persona);
  const authStatus = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const openAuthModal = useAuthModalStore((state) => state.open);

  // The explicit DEV persona is an owner-review mechanism. Production remains
  // strictly auth-driven: an anonymous visitor always receives the guest menu.
  const devMemberPreview = import.meta.env.DEV && persona !== 'demo';
  const audience = navigationAudience({
    authenticated: authStatus === 'authed' || devMemberPreview,
    canSaveRecipes: capabilities.canSaveRecipe,
    canUseProductionMode: capabilities.canUseProductionMode,
  });
  const items = visibleNavItems(audience);
  const workspaceItem = items.find((item) => item.workspaceHome);
  const loc = { pathname: location.pathname, search: location.search };
  const planLabel =
    audience === 'pro' ? s.account.planPro : audience === 'home' ? s.account.planHome : null;
  const memberAccount = audience !== 'guest';
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    const trigger = triggerRef.current;
    const focusables = () =>
      panelRef.current ? Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    focusables()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const list = focusables();
      const first = list[0];
      const last = list[list.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      body.style.overflow = prevOverflow;
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={s.openMenu}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={iconButton}
        data-testid="app-nav-trigger"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          aria-hidden
        >
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label={s.closeMenu}
            onClick={close}
            className="absolute inset-0 h-full w-full bg-black/60 motion-safe:animate-[appFadeIn_150ms_ease-out]"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={s.menuTitle}
            data-testid="app-nav-drawer"
            data-audience={audience}
            className="absolute right-0 top-0 flex h-full w-[88vw] max-w-[360px] flex-col border-l border-ink/10 bg-paper text-ink motion-safe:animate-[appDrawerIn_240ms_cubic-bezier(0.32,0.72,0,1)]"
          >
            <div
              className="flex items-center justify-between px-6 pb-3 pt-5"
              style={{ paddingTop: 'max(env(safe-area-inset-top), 1.25rem)' }}
            >
              {workspaceItem ? (
                <Link
                  to={workspaceItem.to}
                  onClick={close}
                  aria-current={workspaceItem.isActive(loc) ? 'page' : undefined}
                  data-testid={`app-nav-item-${workspaceItem.id}`}
                  className="text-sm font-medium tracking-[0.08em] text-ink"
                >
                  {workspaceItem.label}
                </Link>
              ) : (
                <span className="text-sm font-light tracking-wordmark">{s.brand}</span>
              )}
              <button type="button" aria-label={s.closeMenu} onClick={close} className={iconButton}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.7}
                  aria-hidden
                >
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto px-4 pb-4" aria-label={s.menuTitle}>
              {NAV_GROUP_ORDER.map((group: NavGroupId) => {
                const groupItems = items.filter(
                  (item) => item.group === group && !item.workspaceHome,
                );
                if (groupItems.length === 0) return null;
                const groupActive = isGroupActive(group, loc, audience);
                return (
                  <div
                    key={group}
                    className={cn(
                      'py-3',
                      group === 'ecosystem' && 'mt-2 border-t border-ink/10 pt-5',
                    )}
                    data-active={groupActive || undefined}
                  >
                    <div className="space-y-0.5">
                      {groupItems.map((item) => {
                        const active = item.isActive(loc);
                        return (
                          <Link
                            key={item.id}
                            to={item.to}
                            onClick={close}
                            aria-current={active ? 'page' : undefined}
                            data-testid={`app-nav-item-${item.id}`}
                            className={cn(
                              'flex min-h-12 items-center rounded-sm px-4 py-2.5 text-[15px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40',
                              active ? 'bg-ink text-white' : 'text-ink hover:bg-ink/5',
                            )}
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <MobileDesignReviewEntry />
            </nav>

            <div
              className="border-t border-ink/10 px-4 py-4"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}
              data-testid="app-nav-account-block"
            >
              {memberAccount ? (
                <div className="flex items-center gap-2">
                  <Link
                    to="/account"
                    onClick={close}
                    className="min-w-0 flex-1 rounded-sm px-4 py-2 hover:bg-ink/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                    data-testid="app-nav-account-link"
                  >
                    <span
                      className="block truncate text-sm text-ink"
                      title={user?.email ?? undefined}
                    >
                      {user?.email ??
                        (devMemberPreview ? 'owner-review@pinguino.local' : s.account.signedInAs)}
                    </span>
                    <span
                      className="mt-0.5 block text-xs text-stone-500"
                      data-testid="app-nav-plan"
                    >
                      {planLabel}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      if (authStatus === 'authed') void signOut();
                    }}
                    className="min-h-11 shrink-0 rounded-sm px-3 text-xs font-medium text-ink hover:bg-ink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                    data-testid="app-nav-signout"
                  >
                    {s.account.signOut}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    openAuthModal();
                  }}
                  className="block min-h-12 w-full rounded-sm px-4 text-left text-[15px] text-ink hover:bg-ink/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                  data-testid="app-nav-signin"
                >
                  {s.account.signIn}
                </button>
              )}
            </div>
          </div>

          <style>{`
            @keyframes appDrawerIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
            @keyframes appFadeIn { from { opacity: 0; } to { opacity: 1; } }
          `}</style>
        </div>
      ) : null}
    </>
  );
}
