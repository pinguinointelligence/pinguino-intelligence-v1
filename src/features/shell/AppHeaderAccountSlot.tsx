import { Link } from 'react-router';
import { copy } from '@/copy/en';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';

const SLOT_CLASS =
  'app-header-account-slot ml-auto hidden max-w-52 shrink-0 items-center truncate rounded-full border border-[var(--g-line)] px-4 py-1.5 text-[12px] font-semibold whitespace-nowrap text-[var(--g-text-secondary)] transition-colors hover:border-ink/30 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';

/**
 * The header and drawer read the same auth store. The former hard-coded
 * `Zaloguj` even for a live Pro session, which made a healthy Save look like a
 * logout during served QA.
 */
export function AppHeaderAccountSlot() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const openAuthModal = useAuthModalStore((state) => state.open);

  if (status === 'authed' && user) {
    return (
      <Link
        to="/account"
        data-testid="app-header-account"
        data-auth-state="authed"
        aria-label="Otwórz konto"
        className={SLOT_CLASS}
      >
        <span className="truncate">{user.email ?? 'Konto'}</span>
      </Link>
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
      {copy.nav.signIn}
    </button>
  );
}
