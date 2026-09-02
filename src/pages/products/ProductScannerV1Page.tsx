import { Link } from 'react-router';
import { LiveProductScanner } from '@/features/product-scanner/LiveProductScanner';
import { useAuthStore } from '@/stores/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { applicationPrimaryClasses } from '@/components/ui/applicationControlStyles';

/**
 * The standalone scanner destination. The scanning itself lives in
 * `LiveProductScanner`, because the same session — the same camera, the same
 * evidence, the same Product Intelligence — is what the recipe's „Dodaj składnik"
 * opens (§37). There is one scanner, entered from two places.
 */
export function ProductScannerV1Page() {
  const authStatus = useAuthStore((state) => state.status);
  const openAuthModal = useAuthModalStore((state) => state.open);

  if (authStatus !== 'authed' && !import.meta.env.DEV) {
    return (
      <DestinationSurface
        title="Skanuj produkt"
        blurb="Dodaj produkt do właściwego katalogu Gellatti."
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
      blurb="Dodaj jedno dobre zdjęcie opakowania. Gellatti odczyta etykietę, sprawdzi produkt i przygotuje go do użycia."
    >
      <Link
        to="/products"
        className="pro-focus-ring mb-4 inline-flex min-h-9 items-center text-xs font-semibold text-stone-600 hover:text-ink max-sm:min-h-11"
      >
        ← Produkty
      </Link>
      <LiveProductScanner />
    </DestinationSurface>
  );
}
