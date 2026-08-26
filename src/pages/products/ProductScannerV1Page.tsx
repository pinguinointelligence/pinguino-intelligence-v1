import { Link } from 'react-router';
import { LiveProductScanner } from '@/features/product-scanner/LiveProductScanner';
import { useAuthStore } from '@/stores/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';

const shell = 'mx-auto min-h-screen max-w-5xl bg-paper px-4 py-8 text-ink sm:px-8 lg:py-12';
const card =
  'rounded-[20px] border border-stone-200 bg-white shadow-[0_12px_32px_rgba(28,25,23,0.06)]';
const primaryButton =
  'pro-focus-ring inline-flex min-h-11 items-center justify-center rounded-xl bg-ink px-5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400';

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
      <main className={shell}>
        <Link to="/products" className="text-sm text-stone-600 hover:text-ink">
          ← Produkty
        </Link>
        <section className={`${card} mt-8 p-6 sm:p-9`}>
          <h1 className="text-3xl font-semibold tracking-[-0.035em]">Skanuj produkt</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-stone-600">
            Zaloguj się, aby skan, prywatne dane i limity produktu były przypisane do właściwego
            konta.
          </p>
          <button type="button" onClick={openAuthModal} className={`${primaryButton} mt-6`}>
            Zaloguj się
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={shell}>
      <Link
        to="/products"
        className="pro-focus-ring inline-flex min-h-11 items-center text-sm text-stone-600 hover:text-ink"
      >
        ← Produkty
      </Link>
      <header className="mt-5 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
          Gellatti Product Scanner
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          Skanuj produkt
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-600 sm:text-base">
          Dodaj jedno dobre zdjęcie opakowania. Gellatti sam odczyta etykietę, sprawdzi produkt i
          przygotuje go do użycia — bez formularza technicznego.
        </p>
      </header>
      <LiveProductScanner />
    </main>
  );
}
