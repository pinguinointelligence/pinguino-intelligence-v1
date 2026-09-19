import { Link } from 'react-router';
import { copy } from '@/copy/en';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';

/* OWNER 2026-09-12 — the account YIELDS before the layout changes mode. Its
   ceiling is 208 px; below that the one scale authority narrows it
   progressively through `--gellatti-account-max-width` (down to 112 px at the
   desktop ↔ narrow handoff). A name wider than that ends in an ellipsis inside
   its own element — `text-overflow` never applies to a bare text node in a flex
   box — with the full value in `title`. It never shrinks on its own
   (`shrink-0`): only the budget decides, and the scale answers to the width it
   actually renders. */
const SLOT_CLASS =
  'app-header-account-slot hidden max-w-[min(208px,var(--gellatti-account-max-width,208px))] shrink-0 items-center rounded-full border border-[var(--g-line)] px-4 py-1.5 text-[12px] font-semibold whitespace-nowrap text-[var(--g-text-secondary)] transition-colors hover:border-ink/30 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';

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
        title={user.email ?? undefined}
        className={SLOT_CLASS}
      >
        <span className="min-w-0 truncate">{user.email ?? 'Konto'}</span>
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
      <span className="min-w-0 truncate">{copy.nav.signIn}</span>
    </button>
  );
}
