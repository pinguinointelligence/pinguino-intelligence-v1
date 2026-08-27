import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import {
  listMyContributedProducts,
  listMyProductRequests,
  productRequestUserAction,
  resubmitProductRequest,
  type MyProductRequest,
} from '@/services/productRequests';
import { customerErrorMessage } from '@/copy/customerError';

const labels: Readonly<Record<string, string>> = {
  FRONT_PHOTO: 'czytelne zdjęcie przodu opakowania',
  BARCODE_OR_EAN: 'zdjęcie kodu kreskowego lub numer EAN',
  PRODUCT_NAME: 'pełna nazwa produktu',
  BRAND: 'marka',
  VARIANT: 'wariant produktu',
  NET_QUANTITY: 'masa lub objętość netto',
  INGREDIENTS: 'pełny skład produktu',
  NUTRITION_TABLE: 'pełna tabela wartości odżywczych',
  ALLERGEN_INFORMATION: 'informacja o alergenach',
  MANUFACTURER: 'producent',
  COUNTRY_OF_ORIGIN: 'kraj pochodzenia',
  MARKET_AVAILABILITY: 'kraj, w którym produkt jest dostępny',
  PROFESSIONAL_DOSAGE: 'profesjonalne dozowanie',
  USAGE_INSTRUCTIONS: 'instrukcja użycia',
  TECHNICAL_DOCUMENT: 'dokument techniczny',
  OTHER: 'inna informacja wskazana przez Admina',
};

const fileEligible = new Set([
  'FRONT_PHOTO',
  'BARCODE_OR_EAN',
  'INGREDIENTS',
  'NUTRITION_TABLE',
  'ALLERGEN_INFORMATION',
  'TECHNICAL_DOCUMENT',
  'OTHER',
]);

const terminal = new Set(['APPROVED', 'REJECTED', 'DUPLICATE', 'USER_CANCELED']);

function RequestResponse({ request }: { request: MyProductRequest }) {
  const queryClient = useQueryClient();
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const mutation = useMutation({
    mutationFn: async () => {
      const suppliedFields = request.missingFields
        .filter((field) => field.status === 'REQUESTED')
        .map((field) => field.fieldType)
        .filter((field) => Boolean(corrections[field]?.trim()) || Boolean(files[field]));
      if (suppliedFields.length === 0)
        throw new Error('Uzupełnij co najmniej jedną wskazaną pozycję.');
      await resubmitProductRequest({
        requestId: request.id,
        suppliedFields,
        corrections: Object.fromEntries(
          suppliedFields.flatMap((field) =>
            corrections[field]?.trim() ? [[field, corrections[field].trim()]] : [],
          ),
        ),
        files: suppliedFields.flatMap((field) =>
          files[field] ? [{ fieldType: field, file: files[field] as File }] : [],
        ),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['my-product-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  const requested = request.missingFields.filter((field) => field.status === 'REQUESTED');
  if (request.status !== 'NEEDS_INFO' || requested.length === 0) return null;
  return (
    <form
      className="mt-5 border-t border-ink/10 pt-5"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
        Potrzebujemy jeszcze
      </p>
      {request.adminNote ? (
        <p className="mt-3 border-l-2 border-ink bg-[#f3ede3] px-4 py-3 text-sm leading-relaxed text-ink">
          {request.adminNote}
        </p>
      ) : null}
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        {requested.map((field) => (
          <fieldset key={field.id} className="min-w-0 border border-ink/10 bg-white p-4">
            <legend className="px-1 text-xs font-semibold text-ink">
              {labels[field.fieldType] ?? field.fieldType}
            </legend>
            {field.instruction ? (
              <p className="mb-3 text-xs text-stone-500">{field.instruction}</p>
            ) : null}
            {field.fieldType !== 'FRONT_PHOTO' && field.fieldType !== 'TECHNICAL_DOCUMENT' ? (
              <label className="block text-xs text-stone-600">
                Wpisz dane
                <textarea
                  value={corrections[field.fieldType] ?? ''}
                  onChange={(event) =>
                    setCorrections((current) => ({
                      ...current,
                      [field.fieldType]: event.currentTarget.value,
                    }))
                  }
                  rows={3}
                  className="pro-focus-ring mt-2 w-full border border-ink/15 bg-paper px-3 py-2 text-sm text-ink"
                />
              </label>
            ) : null}
            {fileEligible.has(field.fieldType) ? (
              <label className="mt-3 block text-xs text-stone-600">
                Dodaj zdjęcie lub dokument
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) =>
                    setFiles((current) => ({
                      ...current,
                      [field.fieldType]: event.currentTarget.files?.[0] ?? null,
                    }))
                  }
                  className="pro-focus-ring mt-2 block min-h-11 w-full border border-ink/15 bg-white px-3 py-2 text-xs"
                />
              </label>
            ) : null}
          </fieldset>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Wysyłam…' : 'Wyślij uzupełnienie'}
        </Button>
        <p className="max-w-2xl text-xs leading-relaxed text-stone-500">
          Wpisane dane są dowodem do weryfikacji. Nie stają się automatycznie zaufaną informacją o
          produkcie.
        </p>
      </div>
      {mutation.isError ? (
        <p className="mt-3 text-xs text-status-error" role="alert">
          {customerErrorMessage(mutation.error, 'catalog')}
        </p>
      ) : null}
    </form>
  );
}

function RequestRow({ request, archived }: { request: MyProductRequest; archived: boolean }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(request.status === 'NEEDS_INFO');
  const action = useMutation({
    mutationFn: async (kind: 'ARCHIVE' | 'REOPEN' | 'CANCEL') => {
      if (
        kind === 'CANCEL' &&
        !window.confirm('Anulować zgłoszenie? Tej operacji nie można cofnąć.')
      )
        return;
      await productRequestUserAction(request.id, kind);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-product-requests'] }),
  });
  return (
    <article className="py-5" data-request-status={request.status}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="pro-focus-ring flex min-h-11 w-full items-center justify-between gap-4 text-left"
      >
        <span className="min-w-0">
          <strong className="block truncate text-sm font-semibold text-ink">
            {request.name || 'Produkt bez rozpoznanej nazwy'}
          </strong>
          <span className="mt-1 block font-mono text-[11px] text-stone-500">
            #{request.requestNumber} · {request.status} ·{' '}
            {new Date(request.updatedAt).toLocaleDateString('pl-PL')}
          </span>
        </span>
        <span aria-hidden>{expanded ? '−' : '+'}</span>
      </button>
      {expanded ? (
        <div className="mt-4">
          <dl className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-stone-500">EAN</dt>
              <dd className="mt-1 font-mono text-ink">{request.ean ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Rynek</dt>
              <dd className="mt-1 text-ink">{request.marketCountryCode ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Marka</dt>
              <dd className="mt-1 text-ink">{request.brand ?? '—'}</dd>
            </div>
          </dl>
          {request.rejectionReason ? (
            <p className="mt-4 text-sm text-status-error">{request.rejectionReason}</p>
          ) : null}
          <RequestResponse request={request} />
          <div className="mt-5 flex flex-wrap gap-2">
            {archived ? (
              <Button variant="ghost" size="sm" onClick={() => action.mutate('REOPEN')}>
                Przywróć
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => action.mutate('ARCHIVE')}>
                Odłóż do archiwum
              </Button>
            )}
            {!terminal.has(request.status) ? (
              <Button variant="ghost" size="sm" onClick={() => action.mutate('CANCEL')}>
                Anuluj zgłoszenie
              </Button>
            ) : null}
            {request.approvedProductId || request.duplicateProductId ? (
              <Link
                to={`/products?product=${request.approvedProductId ?? request.duplicateProductId}`}
                className="pro-focus-ring inline-flex min-h-10 items-center border border-ink/15 px-4 text-xs font-semibold text-ink"
              >
                Otwórz produkt
              </Link>
            ) : null}
          </div>
          {action.isError ? (
            <p className="mt-3 text-xs text-status-error">
              {customerErrorMessage(action.error, 'catalog')}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function ProductRequestAccountSections() {
  const [params] = useSearchParams();
  const highlightedRequest = params.get('request');
  const active = useQuery({
    queryKey: ['my-product-requests', false],
    queryFn: () => listMyProductRequests(false),
  });
  const archived = useQuery({
    queryKey: ['my-product-requests', true],
    queryFn: () => listMyProductRequests(true),
  });
  const contributed = useQuery({
    queryKey: ['my-contributed-products'],
    queryFn: listMyContributedProducts,
  });
  const sortedActive = useMemo(() => {
    const rows = active.data ?? [];
    return highlightedRequest
      ? [...rows].sort((a) => (a.id === highlightedRequest ? -1 : 1))
      : rows;
  }, [active.data, highlightedRequest]);
  const loading = active.isPending || archived.isPending || contributed.isPending;
  return (
    <section className="py-5" aria-labelledby="product-requests-heading">
      <h2 id="product-requests-heading" className="text-sm font-semibold text-ink">
        Zgłoszenia produktów
      </h2>
      <p className="mt-1 max-w-xl text-xs leading-relaxed text-stone-600">
        Zgłoszenie nie jest składnikiem. Produkt staje się dostępny dopiero po zatwierdzeniu przez
        Gellatti.
      </p>
      {loading ? <p className="mt-5 text-sm text-stone-500">Wczytuję zgłoszenia…</p> : null}
      <div className="mt-5 grid gap-8 xl:grid-cols-3">
        <div>
          <h3 className="border-b border-ink/10 pb-3 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            Moje aktywne zgłoszenia produktów
          </h3>
          <div className="divide-y divide-ink/10">
            {sortedActive.map((request) => (
              <RequestRow key={request.id} request={request} archived={false} />
            ))}
            {!active.isPending && sortedActive.length === 0 ? (
              <p className="py-5 text-sm text-stone-500">Brak aktywnych zgłoszeń.</p>
            ) : null}
          </div>
        </div>
        <div>
          <h3 className="border-b border-ink/10 pb-3 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            Archiwum zgłoszeń
          </h3>
          <div className="divide-y divide-ink/10">
            {(archived.data ?? []).map((request) => (
              <RequestRow key={request.id} request={request} archived />
            ))}
            {!archived.isPending && (archived.data?.length ?? 0) === 0 ? (
              <p className="py-5 text-sm text-stone-500">Archiwum jest puste.</p>
            ) : null}
          </div>
        </div>
        <div>
          <h3 className="border-b border-ink/10 pb-3 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            Produkty dodane dzięki mnie
          </h3>
          <div className="divide-y divide-ink/10">
            {(contributed.data ?? []).map((product) => (
              <Link
                key={product.requestId}
                to={`/products?product=${product.productId}`}
                className={cn('block py-5', 'pro-focus-ring')}
              >
                <strong className="block text-sm text-ink">{product.name}</strong>
                <span className="mt-1 block font-mono text-[11px] text-stone-500">
                  {product.productCode}
                </span>
              </Link>
            ))}
            {!contributed.isPending && (contributed.data?.length ?? 0) === 0 ? (
              <p className="py-5 text-sm text-stone-500">Jeszcze żadnego.</p>
            ) : null}
          </div>
        </div>
      </div>
      {active.isError || archived.isError || contributed.isError ? (
        <p className="mt-4 text-xs text-status-error" role="alert">
          Nie udało się odczytać zgłoszeń.
        </p>
      ) : null}
    </section>
  );
}
