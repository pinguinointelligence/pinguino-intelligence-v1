import { useSearchParams } from 'react-router';
import { Link } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { WorkflowNotice } from '@/components/shared/WorkflowNotice';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { cn } from '@/lib/cn';
import { shopCopy } from '@/copy/shop';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { AccountProductMarkets } from '@/features/global-catalog/AccountProductMarkets';
import { HomeInviteRedemption } from '@/features/account/HomeInviteRedemption';
import { ProductRequestAccountSections } from '@/features/product-requests/ProductRequestAccountSections';
import { AccountRecipeDefaults } from '@/features/pro-workbench/AccountRecipeDefaults';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { ShopOrdersPanel } from '@/features/shop/ShopOrdersPanel';
import { useAuthStore } from '@/stores/authStore';

/**
 * ACCOUNT, ORGANISED.
 *
 * Six unrelated concerns used to share one scrolling page: profile, product
 * markets, an invite code, product requests, recipe defaults and the whole
 * order history. People visit them for different reasons and almost never two
 * at once, so the page is now sectioned like the Production screen — a nav, and
 * one thing at a time.
 *
 * THE SECTION LIVES IN THE URL (`?section=`). That is what makes
 * "Pokaż moje zamówienie" work: the post-purchase link carries both the section
 * and the order (`?section=orders&order=…`), so it opens the exact order rather
 * than an account landing page, and a refresh or a reopened tab returns to the
 * same place. Nothing is stored in memory that a reload would lose.
 *
 * Nothing was deleted here. Every capability the old page had is inside one of
 * these five sections.
 */

const SECTIONS = [
  { id: 'account', label: 'Konto' },
  { id: 'billing', label: 'Plan i płatności' },
  { id: 'orders', label: 'Zamówienia' },
  { id: 'products', label: 'Produkty i zgłoszenia' },
  { id: 'recipe', label: 'Ustawienia receptury' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const isSection = (value: string | null): value is SectionId =>
  SECTIONS.some((section) => section.id === value);

const PANEL = 'rounded-[12px] border border-[var(--g-line)] bg-white p-5';
const ROW = 'flex items-center justify-between gap-4 px-5 py-5';

export function AccountWorkspacePage() {
  const [params, setParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const persona = useProCorePersona();

  const requested = params.get('section');
  const active: SectionId = isSection(requested) ? requested : 'account';
  const focusOrderId = params.get('order');
  const justCreated = params.get('created') === '1';

  const plan =
    persona === 'pro' ? 'Plan Pro' : persona === 'home' ? 'Plan Home' : 'Brak aktywnego planu';

  const select = (id: SectionId) => {
    const next = new URLSearchParams(params);
    next.set('section', id);
    /* Leaving the section only clears the focus, never the history entry. */
    if (id !== 'orders') {
      next.delete('order');
      next.delete('created');
    }
    setParams(next, { replace: false });
  };

  if (status !== 'authed' && !import.meta.env.DEV) {
    return (
      <DestinationSurface
        eyebrow="Konto"
        title="Konto i ustawienia"
        blurb="Twój profil, plan i najważniejsze ustawienia konta."
      >
        <WorkflowNotice
          eyebrow="Konto"
          title="Zaloguj się, aby zarządzać kontem"
          description="Twój profil, plan i ustawienia czekają po zalogowaniu."
          variant="attention"
          emphasis="lead"
          stackAction
          action={
            <button
              type="button"
              onClick={() => useAuthModalStore.getState().open()}
              className={buttonClasses('primary', 'sm')}
            >
              Zaloguj się
            </button>
          }
          testId="account-sign-in-gate"
        />
      </DestinationSurface>
    );
  }

  return (
    <DestinationSurface
      eyebrow="Konto"
      title="Konto i ustawienia"
      blurb="Twój profil, plan, zamówienia i ustawienia — każde w swoim miejscu."
    >
      <nav
        className="flex flex-wrap gap-1.5 border-b border-[var(--g-line)] pb-3"
        aria-label="Sekcje konta"
        data-testid="account-sections"
      >
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => select(section.id)}
            aria-current={active === section.id ? 'page' : undefined}
            className={cn(
              'rounded-[9px] px-3 py-2 text-[13px] font-medium transition-colors',
              active === section.id
                ? 'bg-[var(--g-ink)] text-white'
                : 'text-[var(--g-text-secondary)] hover:text-[var(--g-ink)]',
            )}
            data-testid={`account-section-${section.id}`}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {active === 'account' ? (
          <div className="divide-y divide-[var(--g-line)] overflow-hidden rounded-[12px] border border-[var(--g-line)] bg-white">
            <div className={ROW}>
              <span className="text-sm text-[var(--g-text-secondary)]">Profil</span>
              <strong className="truncate text-sm font-medium">
                {user?.email ?? 'owner-review@pinguino.local'}
              </strong>
            </div>
            <div className={ROW}>
              <span className="text-sm text-[var(--g-text-secondary)]">Język</span>
              <strong className="text-sm font-medium">Polski</strong>
            </div>
            <div className={ROW}>
              <span className="text-sm text-[var(--g-text-secondary)]">Bezpieczeństwo</span>
              <span className="text-sm text-[var(--g-text-secondary)]">Ustawienia konta</span>
            </div>
          </div>
        ) : null}

        {active === 'billing' ? (
          <div className={PANEL}>
            <p className="text-xs text-[var(--g-text-secondary)]">Plan i płatności</p>
            <strong className="mt-1 block font-medium">{plan}</strong>
            <Link
              to="/subscription"
              className={cn(buttonClasses('ghost', 'sm'), 'mt-4 inline-flex')}
              data-testid="account-billing-link"
            >
              Zarządzaj subskrypcją
            </Link>
          </div>
        ) : null}

        {active === 'orders' ? (
          <section aria-labelledby="account-orders">
            <h2 id="account-orders" className="sr-only">
              {shopCopy.orders.title}
            </h2>
            {justCreated ? (
              <p
                className="mb-3 rounded-[10px] border border-[var(--g-orange)] bg-[var(--g-ivory)] px-4 py-3 text-[13px] text-[var(--g-ink)]"
                data-testid="account-order-created"
              >
                {shopCopy.orders.createdNotice}
              </p>
            ) : null}
            <ShopOrdersPanel focusOrderId={focusOrderId} />
          </section>
        ) : null}

        {active === 'products' ? (
          <div className="space-y-3">
            <div className={PANEL}>
              <AccountProductMarkets />
            </div>
            <div className={PANEL}>
              <HomeInviteRedemption />
            </div>
            <div className={PANEL}>
              <ProductRequestAccountSections />
            </div>
          </div>
        ) : null}

        {active === 'recipe' ? (
          <div className={PANEL}>
            <AccountRecipeDefaults />
          </div>
        ) : null}
      </div>
    </DestinationSurface>
  );
}
