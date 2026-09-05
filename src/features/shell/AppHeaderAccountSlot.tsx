import { copy } from '@/copy/en';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';

const SLOT_CLASS =
  'app-header-account-slot ml-auto hidden h-11 w-auto shrink-0 items-center justify-center rounded-full border border-[var(--g-line)] px-3 text-[11px] font-medium whitespace-nowrap text-[var(--g-text-secondary)] transition-colors hover:border-ink/30 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';

/**
 * The header and drawer read the same auth store. The former hard-coded
 * `Zaloguj` even for a live Pro session, which made a healthy Save look like a
 * logout during served QA.
 */
export function AppHeaderAccountSlot() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const openAuthModal = useAuthModalStore((state) => state.open);

  if (status === 'authed' && user) {
    return (
      <button
        type="button"
        onClick={() => void signOut()}
        data-testid="app-header-account"
        data-auth-state="authed"
        aria-label={copy.shell.account.headerSignOut}
        className={SLOT_CLASS}
      >
        {copy.shell.account.headerSignOut}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openAuthModal}
      data-testid="app-header-login"
      data-auth-state="anon"
      className={SLOT_CLASS}
    >
      {copy.shell.account.headerSignIn}
    </button>
  );
}
