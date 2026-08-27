import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { StatusChip } from '@/components/shared/StatusChip';
import type { AdminProductCapabilityReanalysisQueueRequest } from '@/services/adminControl';
import { adminProductCapabilityReanalysisAction } from '@/services/productCapabilityReanalysis';

const classificationLabel = (
  classification: AdminProductCapabilityReanalysisQueueRequest['currentClassification'],
): string => {
  if (classification === 'TOPPING_ONLY') return 'Topping';
  if (classification === 'INGREDIENT_ONLY') return 'Składnik';
  if (classification === 'BOTH') return 'Składnik i topping';
  return 'Brak aktywnej capability';
};

const requestedCopy = (
  capability: AdminProductCapabilityReanalysisQueueRequest['requestedCapability'],
): string =>
  capability === 'INGREDIENT'
    ? 'Sprawdź, czy produkt może działać również jako składnik'
    : 'Sprawdź, czy produkt może działać również jako topping';

const contextCopy = (
  context: AdminProductCapabilityReanalysisQueueRequest['attemptedContext'],
): string =>
  context === 'INGREDIENT_PICKER' ? 'wyszukano w Dodaj składnik' : 'wyszukano w Dodaj topping';

const currentCapabilityEnabled = (
  request: AdminProductCapabilityReanalysisQueueRequest,
): boolean => {
  if (!request.currentAuthority) return false;
  return request.requestedCapability === 'INGREDIENT'
    ? request.currentAuthority.ingredientAllowed === true
    : request.currentAuthority.toppingAllowed === true;
};

const statusTone = (
  status: AdminProductCapabilityReanalysisQueueRequest['status'],
): 'ideal' | 'risky' | 'needs_correction' | 'good' => {
  if (status === 'ACCEPTED') return 'ideal';
  if (status === 'REJECTED') return 'risky';
  if (status === 'IN_REVIEW') return 'needs_correction';
  return 'good';
};

export function AdminProductCapabilityReanalysisDetail({
  request,
  onClose,
}: {
  request: AdminProductCapabilityReanalysisQueueRequest;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState(request.reviewReason ?? '');
  const action = useMutation({
    mutationFn: (kind: 'START_REVIEW' | 'ACCEPT' | 'REJECT') =>
      adminProductCapabilityReanalysisAction(
        request.id,
        kind,
        kind === 'START_REVIEW' ? undefined : reason.trim(),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-product-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-directory', 'AUDIT'] }),
      ]);
    },
  });
  const mayResolve = request.status === 'OPEN' || request.status === 'IN_REVIEW';
  const canonicalReady = currentCapabilityEnabled(request);

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        className="min-h-10 text-xs font-semibold text-stone-600"
      >
        ← Wróć do PRODUCT REQUESTS
      </button>
      <header className="border-b border-ink/10 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>Ponowna analiza</SectionLabel>
          <StatusChip status={statusTone(request.status)}>{request.status}</StatusChip>
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-ink">{request.name}</h1>
        <p className="mt-2 font-mono text-xs text-stone-600">
          {request.productCode ?? request.canonicalProductId} · EAN {request.ean ?? '—'}
        </p>
        <p className="mt-2 break-all font-mono text-[10px] text-stone-500">Request {request.id}</p>
      </header>

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-7">
          <section aria-label="Reanalysis request summary">
            <h2 className="text-sm font-semibold text-ink">Zakres prośby</h2>
            <dl className="mt-3 grid border-l border-t border-ink/10 sm:grid-cols-2">
              {[
                ['Produkt', request.name ?? '—'],
                ['ID', request.productCode ?? '—'],
                ['EAN', request.ean ?? '—'],
                ['Obecnie', classificationLabel(request.currentClassification)],
                ['Użytkownik prosi', requestedCopy(request.requestedCapability)],
                ['Kontekst', contextCopy(request.attemptedContext)],
                ['Contributor', `${request.requesterEmail} · ${request.requestingUserId}`],
                ['Timestamp', new Date(request.submittedAt).toLocaleString('pl-PL')],
              ].map(([label, value]) => (
                <div key={label} className="border-r border-b border-ink/10 p-4">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">
                    {label}
                  </dt>
                  <dd className="mt-2 break-words text-xs leading-5 text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-ink">Evidence i current authority</h2>
            <p className="mt-2 text-xs leading-5 text-stone-600">
              Existing evidence: {request.evidenceReferences.length} · current classification i
              readiness pochodzą z wersjonowanego ProductBehavior. Original Scanner attribution
              pozostaje przypisane do konta autora.
            </p>
            <details className="mt-3 border border-ink/12 bg-stone-50 p-4" open>
              <summary className="cursor-pointer text-xs font-semibold text-ink">
                Existing evidence, readiness i original scanner attribution
              </summary>
              <pre className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap text-[10px] leading-5">
                {JSON.stringify(
                  {
                    identity: request.identitySnapshot,
                    currentClassification: request.currentClassification,
                    capabilitySnapshot: request.capabilitySnapshot,
                    readinessSnapshot: request.readinessSnapshot,
                    originalScannerAttribution: request.contributionReference,
                    existingEvidence: request.evidenceReferences,
                    currentAuthority: request.currentAuthority,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="border border-ink/12 bg-[#f3ede3] p-5">
            <SectionLabel>Admin actions</SectionLabel>
            <p className="mt-3 text-xs leading-5 text-stone-600">
              Samo zgłoszenie niczego nie zmienia. Zatwierdzenie zamyka request dopiero po
              niezależnym review, dowodach i opublikowaniu właściwej canonical capability.
            </p>

            {mayResolve ? (
              <label className="mt-4 block text-xs font-semibold text-ink">
                Uzasadnienie decyzji
                <textarea
                  rows={4}
                  value={reason}
                  onChange={(event) => setReason(event.currentTarget.value)}
                  className="mt-2 w-full border border-ink/15 bg-white p-3 font-normal"
                />
              </label>
            ) : null}

            <div className="mt-4 grid gap-2">
              <Button
                variant="ghost"
                disabled={action.isPending || request.status !== 'OPEN'}
                onClick={() => action.mutate('START_REVIEW')}
              >
                Rozpocznij analizę
              </Button>
              <Button
                disabled={
                  action.isPending ||
                  request.status !== 'IN_REVIEW' ||
                  reason.trim() === '' ||
                  !canonicalReady
                }
                onClick={() => action.mutate('ACCEPT')}
              >
                Zatwierdź zmianę
              </Button>
              <Button
                variant="ghost"
                disabled={action.isPending || !mayResolve || reason.trim() === ''}
                onClick={() => action.mutate('REJECT')}
              >
                Pozostaw bez zmian
              </Button>
            </div>

            {!canonicalReady && mayResolve ? (
              <p className="mt-4 border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                „Zatwierdź zmianę” pozostaje zablokowane, dopóki requested capability nie jest
                opublikowane w current canonical authority.
              </p>
            ) : null}
            {action.isError ? (
              <p
                role="alert"
                className="mt-4 border border-red-300 bg-red-50 p-3 text-xs text-red-800"
              >
                {action.error.message}
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </>
  );
}
