import { Link } from 'react-router';
import { ScanFlow } from '@/features/scan-flow/ScanFlow';
import { useAuthStore } from '@/stores/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { applicationPrimaryClasses } from '@/components/ui/applicationControlStyles';

/**
 * The standalone scanner destination (Produkty → „Skanuj produkt”). The scanning itself is the
 * ONE shared flow — camera → Scan Core → EAN/GTIN → Scan Import 2.0 — the same the recipe's
 * „Dodaj składnik → Skanuj” opens. Here a known product is shown as already existing (never
 * duplicated); an unknown one is recognised and, when the label still lacks data, completed by the
 * customer and saved as a private local product.
 */
export function ProductScannerV1Page() {
  const authStatus = useAuthStore((state) => state.status);
  const openAuthModal = useAuthModalStore((state) => state.open);

  if (authStatus !== 'authed' && !import.meta.env.DEV) {
    return (
      <DestinationSurface
        title="Skanuj produkt"
        blurb="Sprawdź produkt po kodzie kreskowym albo dodaj go do swojego katalogu."
      >
        <section className="rounded-[var(--radius-pro-studio)] border border-ink/10 bg-white p-5 sm:p-6">
          <p className="max-w-xl text-sm leading-6 text-stone-600">
            Zaloguj się, aby skan, prywatne dane i limity produktu były przypisane do właściwego
            konta.
          </p>
          <button
            type="button"
            onClick={openAuthModal}
            className={applicationPrimaryClasses('mt-5')}
          >
            Zaloguj się
          </button>
        </section>
      </DestinationSurface>
    );
  }

  return (
    <DestinationSurface
      title="Skanuj produkt"
      blurb="Pokaż kod kreskowy aparatowi. Znany produkt pokażemy od razu; nowy rozpoznamy i zapiszemy jako Twój."
    >
      <Link
        to="/products"
        className="pro-focus-ring mb-4 inline-flex min-h-9 items-center text-xs font-semibold text-stone-600 hover:text-ink max-sm:min-h-11"
      >
        ← Produkty
      </Link>
      <ScanFlow mode="catalog" />
    </DestinationSurface>
  );
}
