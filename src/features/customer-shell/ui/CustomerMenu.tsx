import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import { customerShellCopy as copy } from '../customerShellCopy';
import { CUSTOMER_MENU_DIAGNOSTIC_ROUTE, CUSTOMER_MENU_ITEMS } from '../customerMenu';
import { color, focusRing, motion, touch, type } from './tokens';

const FOCUSABLE =
  'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

/**
 * The customer top bar + global navigation drawer (PART 4). A wordmark and an
 * always-visible hamburger sit in a slim in-flow bar; the hamburger opens a
 * LIGHT, right-side premium drawer (light-first owner decision, UIUX Slice A)
 * that:
 *  - locks body scroll while open;
 *  - traps focus and closes on Escape (desktop) or backdrop tap;
 *  - respects the safe-area insets;
 *  - links ONLY routes that exist, plus the real auth login/logout actions.
 *
 * Navigation uses react-router `Link`; auth uses the existing stores. The drawer
 * renders the light-native `paper` surface directly.
 */
interface CustomerMenuProps {
  /**
   * Render the small wordmark next to the trigger. Surfaces that already show
   * their own brand lockup (the public landing) pass false so the page does
   * not carry two wordmarks (owner hotfix §2).
   */
  showBrand?: boolean;
}

export function CustomerMenu({ showBrand = true }: CustomerMenuProps = {}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const authAvailable = useAuthStore((s) => s.available);
  const authStatus = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const openAuthModal = useAuthModalStore((s) => s.open);

  const close = () => setOpen(false);

  // Body-scroll lock + Escape + focus trap, only while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    // Capture the opening trigger now so focus can return to it on close.
    const trigger = triggerRef.current;

    const focusables = () =>
      panelRef.current
        ? Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        : [];
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
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

  const iconButton = cn(
    'grid place-items-center rounded-full',
    touch.iconTarget,
    color.textPrimary,
    motion.base,
    focusRing,
    'hover:bg-ink/10',
  );

  return (
    <div
      className="flex items-center justify-between"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {showBrand ? (
        <span className={cn(type.label, color.textSecondary)}>{copy.menu.brand}</span>
      ) : (
        <span aria-hidden />
      )}
      <button
        ref={triggerRef}
        type="button"
        aria-label={copy.menu.open}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={iconButton}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label={copy.menu.close}
            onClick={close}
            className="absolute inset-0 h-full w-full bg-black/60 motion-safe:animate-[csFadeIn_150ms_ease-out]"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={copy.menu.title}
            className={cn(
              'absolute right-0 top-0 flex h-full w-[86vw] max-w-[360px] flex-col',
              color.surface,
              'border-l border-ink/10',
              'motion-safe:animate-[csDrawerIn_240ms_cubic-bezier(0.32,0.72,0,1)]',
            )}
          >
            <div
              className="flex items-center justify-between px-5 pb-2 pt-5"
              style={{ paddingTop: 'max(env(safe-area-inset-top), 1.25rem)' }}
            >
              <span className={cn(type.title, color.textPrimary)}>{copy.menu.title}</span>
              <button type="button" aria-label={copy.menu.close} onClick={close} className={iconButton}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-2">
              <p className={cn('px-3 pb-1 pt-2', type.label, color.textMuted)}>{copy.menu.sectionMain}</p>
              {CUSTOMER_MENU_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={close}
                  className={cn(
                    'flex items-center rounded-xl px-4',
                    touch.control,
                    type.body,
                    color.textPrimary,
                    'hover:bg-ink/10',
                    motion.base,
                    focusRing,
                  )}
                >
                  {copy.menu.primary[item.key]}
                </Link>
              ))}
            </nav>

            <div
              className="border-t border-ink/10 px-3 py-3"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
            >
              <p className={cn('px-3 pb-1', type.label, color.textMuted)}>{copy.menu.sectionAccount}</p>
              {!authAvailable ? (
                <p className={cn('px-4 py-2', type.caption, color.textMuted)}>{copy.menu.authUnavailable}</p>
              ) : authStatus === 'authed' && user ? (
                <div className="flex items-center justify-between gap-3 px-4 py-2">
                  <span
                    className={cn('min-w-0 truncate', type.secondary, color.textSecondary)}
                    title={user.email ?? undefined}
                  >
                    {user.email ?? copy.menu.signedInAs}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      void signOut();
                    }}
                    className={cn(
                      'shrink-0 rounded-lg px-3 py-1.5 font-medium',
                      type.secondary,
                      color.textPrimary,
                      'hover:bg-ink/10',
                      focusRing,
                      motion.base,
                    )}
                  >
                    {copy.menu.signOut}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    openAuthModal();
                  }}
                  className={cn(
                    'block w-full rounded-xl px-4 text-left',
                    touch.control,
                    type.body,
                    color.textPrimary,
                    'hover:bg-ink/10',
                    focusRing,
                    motion.base,
                  )}
                >
                  {copy.menu.signIn}
                </button>
              )}
              <Link
                to={CUSTOMER_MENU_DIAGNOSTIC_ROUTE}
                onClick={close}
                className={cn(
                  'mt-1 block rounded-xl px-4 py-2',
                  type.caption,
                  color.textMuted,
                  'hover:bg-ink/10',
                  focusRing,
                  motion.base,
                )}
              >
                {copy.menu.classic}
              </Link>
            </div>
          </div>

          {/* Scoped keyframes — no global CSS edited. */}
          <style>{`
            @keyframes csDrawerIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
            @keyframes csFadeIn { from { opacity: 0; } to { opacity: 1; } }
          `}</style>
        </div>
      ) : null}
    </div>
  );
}
