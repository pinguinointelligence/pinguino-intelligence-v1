import { useState } from 'react';
import { Link } from 'react-router';
import { IvoryLogoMark } from '@/components/shared/IvoryLogoMark';
import { copy } from '@/copy/en';
import { ACTIVE_ENGINE } from '@/data/engines';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';

const m = copy.menu;

const itemClass =
  'block rounded-md px-3 py-2 text-sm text-ink transition-colors hover:bg-ink/5';
const soonChip =
  'rounded border border-ink/10 px-1.5 py-0.5 text-[0.6rem] font-medium tracking-[0.08em] text-stone-400 uppercase';

/**
 * Hamburger menu — New, Advanced Studio, and future subscriber items (Step 6A).
 * In Phase 6C this is the mobile drawer behind the centered TopNav; `tone` only
 * colors the trigger glyph (ivory on the black shell, ink on white pages). The
 * drawer surface stays white so it also works on MyRecipesPage.
 */
export function AppMenu({ onNew, tone = 'ink' }: { onNew?: () => void; tone?: 'ivory' | 'ink' }) {
  const [open, setOpen] = useState(false);

  const authAvailable = useAuthStore((state) => state.available);
  const authStatus = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const openAuthModal = useAuthModalStore((state) => state.open);
  const subscriptionPlan = useSubscriptionStore((state) => state.plan);

  return (
    <>
      <button
        type="button"
        aria-label={m.title}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-md transition-colors',
          tone === 'ivory' ? 'text-ivory hover:bg-ivory/10' : 'text-ink hover:bg-ink/5',
        )}
      >
        <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 h-full w-full bg-ink/20"
            onClick={() => setOpen(false)}
          />
          <nav className="absolute left-0 top-0 flex h-full w-72 max-w-[80vw] flex-col gap-1 border-r border-ink/10 bg-paper p-5">
            <div className="mb-5 flex items-center gap-3">
              <IvoryLogoMark size={22} tone="ink" />
              <span className="text-sm font-light tracking-wordmark">{m.title}</span>
            </div>

            <Link
              to="/"
              className={itemClass}
              onClick={() => {
                onNew?.();
                setOpen(false);
              }}
            >
              {m.newRecipe}
            </Link>
            <Link to="/studio" className={itemClass} onClick={() => setOpen(false)}>
              {m.advancedStudio}
            </Link>

            <div className="mt-3 border-t border-ink/5 pt-3">
              <Link to="/recipes" className={itemClass} onClick={() => setOpen(false)}>
                {m.items.myRecipes}
              </Link>
              {[m.items.production, m.items.saved].map((label) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-stone-400"
                >
                  <span>{label}</span>
                  <span className={soonChip}>{m.soon}</span>
                </div>
              ))}
            </div>

            <div className="mt-auto border-t border-ink/5 pt-3">
              {!authAvailable ? (
                <p className="px-3 py-2 text-xs leading-relaxed text-stone-400">{m.authUnavailable}</p>
              ) : authStatus === 'authed' && user ? (
                <>
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate text-sm text-ink" title={user.email ?? undefined}>
                      {user.email ?? m.signedInAs}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-xs text-stone-500 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-ink"
                      onClick={() => {
                        void signOut();
                      }}
                    >
                      {m.signOut}
                    </button>
                  </div>
                  {subscriptionPlan === 'pro' ? (
                    <p className="px-3 pb-1 text-xs text-stone-500">{copy.billing.proActive}</p>
                  ) : (
                    <div className="flex items-center justify-between px-3 pb-1 text-sm text-stone-400">
                      <span>{copy.billing.upgrade}</span>
                      <span className={soonChip}>{copy.billing.comingSoon}</span>
                    </div>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  className={cn(itemClass, 'w-full text-left')}
                  onClick={() => {
                    setOpen(false);
                    openAuthModal();
                  }}
                >
                  {m.signIn}
                </button>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-ink/5 pt-3 text-xs text-stone-500">
              <span>{m.activeEngine}</span>
              <span className={cn('font-mono text-ink')}>{ACTIVE_ENGINE.label}</span>
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}
