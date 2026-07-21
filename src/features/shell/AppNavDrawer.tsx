import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { cn } from '@/lib/cn';
import { copy } from '@/copy/en';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import {
  NAV_GROUP_ORDER,
  NAV_GROUP_TITLE,
  visibleNavItems,
  type NavGroupId,
} from './appNav';

const s = copy.shell;
const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

const iconButton =
  'grid h-11 w-11 place-items-center rounded-full text-ink transition-colors hover:bg-ink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';

/**
 * The ONE canonical navigation drawer used by every application shell (AppShell). Renders the
 * hamburger trigger (top-right) + a LIGHT right-side drawer driven by the single `appNav` config:
 * grouped (Nawigacja / PINGÜINO Pro / Narzędzia / Plan i konto), capability-filtered (Pro sees the
 * Pro group; others see one safe upsell), with a consistent active state (nested + `?tab=` aware).
 * Accessible: backdrop, body-scroll lock, focus trap, Escape, focus return to the trigger, safe-area.
 */
export function AppNavDrawer() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const location = useLocation();

  const persona = useProCorePersona();
  const canPro = persona === 'pro';

  const authAvailable = useAuthStore((s2) => s2.available);
  const authStatus = useAuthStore((s2) => s2.status);
  const user = useAuthStore((s2) => s2.user);
  const signOut = useAuthStore((s2) => s2.signOut);
  const openAuthModal = useAuthModalStore((s2) => s2.open);

  const loc = { pathname: location.pathname, search: location.search };
  const items = visibleNavItems(canPro);
  const planLabel = canPro ? s.account.planPro : persona === 'home' ? s.account.planHome : s.account.planNone;

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      const first = list[0];
      const last = list[list.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
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
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
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
            className="absolute right-0 top-0 flex h-full w-[86vw] max-w-[360px] flex-col border-l border-ink/10 bg-paper text-ink motion-safe:animate-[appDrawerIn_240ms_cubic-bezier(0.32,0.72,0,1)]"
          >
            <div
              className="flex items-center justify-between px-5 pb-2 pt-5"
              style={{ paddingTop: 'max(env(safe-area-inset-top), 1.25rem)' }}
            >
              <span className="text-sm font-light tracking-wordmark">{s.menuTitle}</span>
              <button type="button" aria-label={s.closeMenu} onClick={close} className={iconButton}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label={s.menuTitle}>
              {NAV_GROUP_ORDER.map((group: NavGroupId) => {
                const groupItems = items.filter((i) => i.group === group);
                if (groupItems.length === 0) return null;
                return (
                  <div key={group} className="pb-2">
                    <p className="px-3 pb-1 pt-3 text-[0.65rem] font-medium tracking-label text-stone-400 uppercase">
                      {NAV_GROUP_TITLE[group]}
                    </p>
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
                            'flex min-h-11 items-center rounded-xl px-4 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40',
                            active ? 'bg-ink/10 font-medium text-ink' : 'text-ink hover:bg-ink/5',
                          )}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </nav>

            <div
              className="border-t border-ink/10 px-3 py-3"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
            >
              <p className="px-3 pb-1 text-[0.65rem] font-medium tracking-label text-stone-400 uppercase">
                {s.groups.plan}
              </p>
              {!authAvailable ? (
                <p className="px-4 py-2 text-xs leading-relaxed text-stone-400">{s.account.unavailable}</p>
              ) : authStatus === 'authed' && user ? (
                <div className="px-4 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm text-ink" title={user.email ?? undefined}>
                      {user.email ?? s.account.signedInAs}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        void signOut();
                      }}
                      className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-ink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                      data-testid="app-nav-signout"
                    >
                      {s.account.signOut}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-stone-500" data-testid="app-nav-plan">{planLabel}</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    openAuthModal();
                  }}
                  className="block min-h-11 w-full rounded-xl px-4 text-left text-sm text-ink transition-colors hover:bg-ink/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
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
