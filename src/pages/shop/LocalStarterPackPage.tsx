import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { WorkflowNotice } from '@/components/shared/WorkflowNotice';
import { applicationPrimaryClasses } from '@/components/ui/applicationControlStyles';
import { shopCopy as c } from '@/copy/shop';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { createLocalStarterPackOrder, LocalPackError } from '@/features/shop/localStarterPack';
import {
  selectedShopCountry,
  selectedStarterPackMode,
  useShopCountryStore,
} from '@/features/shop/shopCountryStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/cn';

/**
 * The 0 EUR Local Starter Pack flow.
 *
 * INTENT LIVES IN THE URL. A signed-out visitor who presses the CTA lands here
 * and is asked to sign in ON THIS ROUTE — so returning from auth, or simply
 * reloading, resumes exactly where they were. Carrying the intent in the auth
 * modal instead would lose it on any refresh, and losing a chosen country after
 * a login is the kind of thing that makes people give up.
 *
 * The chosen country comes from the persisted Shop store, so it survives the
 * same round trip.
 */
const field =
  'h-[42px] w-full rounded-[10px] border border-[var(--g-line-strong)] bg-white px-3 ' +
  'text-[14px] text-[var(--g-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40';

const errorCopy: Record<string, string> = {
  local_pack_not_available:
    'Ten kraj nie ma jeszcze kompletnej listy lokalnych zamienników. Pracujemy nad tym.',
  country_unknown: 'Nie znamy jeszcze tego kraju.',
  country_required: 'Wybierz kraj.',
  address_incomplete: 'Uzupełnij imię i nazwisko, ulicę, kod pocztowy i miasto.',
  unauthorized: 'Zaloguj się, aby odebrać zestaw.',
};

export function LocalStarterPackPage() {
  const navigate = useNavigate();
  const status = useAuthStore((state) => state.status);
  const load = useShopCountryStore((state) => state.load);
  const country = useShopCountryStore(selectedShopCountry);
  const mode = useShopCountryStore(selectedStarterPackMode);

  const [name, setName] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const signedIn = status === 'authed';

  const submit = async () => {
    if (!country) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createLocalStarterPackOrder({
        countryIso2: country.iso2,
        address: { name, line1, line2, postalCode, city, phone },
      });
      /* J: land on the exact order, not the account landing page. */
      navigate(`/account?section=orders&order=${result.orderId}&created=1`);
    } catch (cause) {
      const code = cause instanceof LocalPackError ? cause.code : 'local_pack_failed';
      setError(errorCopy[code] ?? 'Nie udało się utworzyć zamówienia. Spróbuj ponownie.');
      setBusy(false);
    }
  };

  return (
    <DestinationSurface
      eyebrow={c.localPack.name}
      title={c.localPack.lede}
      blurb={c.localPack.body}
    >
      {/* The country must still be genuinely live. Someone can reach this route
          directly, and an honest refusal is better than a form that fails on
          submit. */}
      {mode !== 'local' ? (
        <WorkflowNotice
          eyebrow={c.localPack.name}
          title={c.country.noneHere}
          description={c.country.noneHelper}
          variant="attention"
          emphasis="lead"
          stackAction
          action={
            <button
              type="button"
              onClick={() => navigate('/shop')}
              className={applicationPrimaryClasses('min-h-[44px] px-6 text-[14px]')}
            >
              {c.country.change}
            </button>
          }
          testId="local-pack-unavailable"
        />
      ) : !signedIn ? (
        <WorkflowNotice
          eyebrow={c.localPack.name}
          title={c.localPack.ctaSignedOut}
          description={c.localPack.body}
          variant="attention"
          emphasis="lead"
          stackAction
          action={
            <button
              type="button"
              onClick={() => useAuthModalStore.getState().open()}
              className={applicationPrimaryClasses('min-h-[44px] px-6 text-[14px]')}
            >
              {c.localPack.ctaSignedOut}
            </button>
          }
          testId="local-pack-sign-in-gate"
        />
      ) : (
        <form
          className="max-w-[520px] space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          data-testid="local-pack-form"
        >
          <p className="text-[13px] text-[var(--g-text-secondary)]">
            {c.localPack.countryLabel}:{' '}
            <strong className="text-[var(--g-ink)]">{country?.name}</strong>
          </p>
          <input
            className={field}
            placeholder="Imię i nazwisko"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            data-testid="local-pack-name"
          />
          <input
            className={field}
            placeholder="Ulica i numer"
            value={line1}
            onChange={(event) => setLine1(event.target.value)}
            required
            data-testid="local-pack-line1"
          />
          <input
            className={field}
            placeholder="Dodatkowe informacje (opcjonalnie)"
            value={line2}
            onChange={(event) => setLine2(event.target.value)}
          />
          <div className="flex gap-3">
            <input
              className={cn(field, 'w-[140px]')}
              placeholder="Kod pocztowy"
              value={postalCode}
              onChange={(event) => setPostalCode(event.target.value)}
              required
              data-testid="local-pack-postal"
            />
            <input
              className={field}
              placeholder="Miasto"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              required
              data-testid="local-pack-city"
            />
          </div>
          <input
            className={field}
            placeholder="Telefon (opcjonalnie)"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          {error ? (
            <p className="text-[13px] text-[var(--g-attention-ink)]" data-testid="local-pack-error">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className={applicationPrimaryClasses('min-h-[46px] w-full px-7 text-[14px]')}
            data-testid="local-pack-submit"
          >
            {busy ? '…' : c.localPack.cta}
          </button>
          {/* D: the address is kept for later. Said plainly rather than buried
              in terms nobody reads. */}
          <p className="text-[12px] leading-[1.45] text-[var(--g-text-secondary)]">
            Zapiszemy ten adres, żeby zaproponować Ci fizyczny zestaw, gdy tylko będzie dostępny w
            Twoim kraju.
          </p>
        </form>
      )}
    </DestinationSurface>
  );
}
