import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { StatusChip } from '@/components/shared/StatusChip';
import {
  adminProductCapabilityReanalysisAction,
  listAdminProductCapabilityReanalysisRequests,
  type AdminProductCapabilityReanalysisRequest,
  type ProductCapabilityReanalysisStatus,
} from '@/services/productCapabilityReanalysis';

const FILTERS: ReadonlyArray<{
  status: ProductCapabilityReanalysisStatus | 'ALL';
  label: string;
}> = [
  { status: 'OPEN', label: 'OPEN' },
  { status: 'IN_REVIEW', label: 'IN REVIEW' },
  { status: 'ACCEPTED', label: 'ACCEPTED' },
  { status: 'REJECTED', label: 'REJECTED' },
  { status: 'ALL', label: 'ALL' },
];

const statusTone = (
  status: ProductCapabilityReanalysisStatus,
): 'ideal' | 'risky' | 'needs_correction' | 'good' => {
  if (status === 'ACCEPTED') return 'ideal';
  if (status === 'REJECTED') return 'risky';
  if (status === 'IN_REVIEW') return 'needs_correction';
  return 'good';
};

export function AdminProductCapabilityReanalysisSection() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ProductCapabilityReanalysisStatus | 'ALL'>('OPEN');
  const [selected, setSelected] = useState<AdminProductCapabilityReanalysisRequest | null>(null);
  const [reason, setReason] = useState('');
  const query = useQuery({
    queryKey: ['admin-product-capability-reanalysis', status],
    queryFn: () => listAdminProductCapabilityReanalysisRequests(status),
  });
  const action = useMutation({
    mutationFn: (kind: 'START_REVIEW' | 'ACCEPT' | 'REJECT') =>
      adminProductCapabilityReanalysisAction(
        selected!.id,
        kind,
        kind === 'START_REVIEW' ? undefined : reason.trim(),
      ),
    onSuccess: async () => {
      setSelected(null);
      setReason('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-product-capability-reanalysis'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-directory', 'AUDIT'] }),
      ]);
    },
  });

  return (
    <section
      className="mt-12 border-t border-ink/12 pt-8"
      aria-labelledby="capability-review-title"
    >
      <SectionLabel>Canonical ProductBehavior review</SectionLabel>
      <h2
        id="capability-review-title"
        className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-ink"
      >
        Ponowna analiza capability
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
        Wspólna kolejka dla próśb o capability składnika i toppingu. Zgłoszenie nie zmienia
        produktu; decyzja ACCEPT potwierdza dopiero wcześniej opublikowane canonical authority.
      </p>

      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-ink/10 pb-3">
        {FILTERS.map((filter) => (
          <button
            key={filter.status}
            type="button"
            className={`min-h-10 shrink-0 px-3 text-[10px] font-semibold tracking-[0.1em] ${
              status === filter.status ? 'bg-ink text-white' : 'border border-ink/10 text-stone-600'
            }`}
            onClick={() => {
              setStatus(filter.status);
              setSelected(null);
              setReason('');
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-7 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead>
              <tr className="border-y border-ink/15 bg-stone-50">
                {['Produkt', 'Current → requested', 'Context', 'Submitted', 'Status', ''].map(
                  (label) => (
                    <th
                      key={label}
                      className="px-3 py-3 text-[10px] uppercase tracking-[0.1em] text-stone-500"
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {(query.data ?? []).map((request) => (
                <tr key={request.id} className="border-b border-ink/10">
                  <td className="px-3 py-4">
                    <strong className="text-ink">
                      {request.productCode ?? request.canonicalProductId} · {request.productName}
                    </strong>
                    <span className="mt-1 block font-mono text-[10px] text-stone-500">
                      EAN {request.ean ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-4 font-mono">
                    {request.currentClassification} → {request.requestedCapability}
                  </td>
                  <td className="px-3 py-4 font-mono text-[10px]">{request.attemptedContext}</td>
                  <td className="px-3 py-4">
                    {new Date(request.submittedAt).toLocaleString('pl-PL')}
                  </td>
                  <td className="px-3 py-4">
                    <StatusChip status={statusTone(request.status)}>{request.status}</StatusChip>
                  </td>
                  <td className="px-3 py-4">
                    <button
                      type="button"
                      className="min-h-10 border border-ink/15 px-3 font-semibold text-ink"
                      onClick={() => {
                        setSelected(request);
                        setReason(request.reviewReason ?? '');
                      }}
                    >
                      Otwórz →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {query.isError ? (
            <p
              role="alert"
              className="mt-4 border border-red-300 bg-red-50 p-3 text-xs text-red-800"
            >
              Nie udało się odczytać kolejki ponownej analizy.
            </p>
          ) : null}
          {!query.isPending && (query.data?.length ?? 0) === 0 ? (
            <p className="border-b border-ink/10 py-6 text-sm text-stone-500">
              Brak zgłoszeń w tym statusie.
            </p>
          ) : null}
        </div>

        <aside className="border border-ink/12 bg-[#f3ede3] p-5">
          <SectionLabel>Capability decision</SectionLabel>
          {selected ? (
            <div className="mt-4 space-y-4">
              <div>
                <strong className="text-sm text-ink">{selected.productName}</strong>
                <p className="mt-1 font-mono text-xs">
                  {selected.productCode ?? selected.canonicalProductId} · EAN {selected.ean ?? '—'}
                </p>
                <p className="mt-2 text-xs text-stone-600">
                  {selected.currentClassification} → {selected.requestedCapability} ·{' '}
                  {selected.attemptedContext}
                </p>
                <p className="mt-1 font-mono text-[10px] text-stone-500">{selected.reasonCode}</p>
              </div>

              <dl className="grid gap-2 border-y border-ink/10 py-3 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-500">Contributor</dt>
                  <dd className="break-all text-right font-mono">{selected.requestingUserId}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-500">Canonical UUID</dt>
                  <dd className="break-all text-right font-mono">{selected.canonicalProductId}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-500">Evidence refs</dt>
                  <dd className="font-mono">{selected.evidenceReferences.length}</dd>
                </div>
              </dl>

              <details className="border border-ink/12 bg-white p-3">
                <summary className="cursor-pointer text-xs font-semibold text-ink">
                  Authority, readiness i evidence references
                </summary>
                <pre className="mt-3 max-h-80 overflow-auto text-[10px] leading-5">
                  {JSON.stringify(
                    {
                      identity: selected.identitySnapshot,
                      capabilities: selected.capabilitySnapshot,
                      readiness: selected.readinessSnapshot,
                      contribution: selected.contributionReference,
                      evidence: selected.evidenceReferences,
                      currentAuthority: selected.currentAuthority,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>

              <p className="border border-ink/15 bg-white p-3 text-xs leading-5 text-stone-600">
                Canonical authority musi zostać opublikowane przez istniejący kontrakt wersji i
                ProductBehavior przed ACCEPT. Ta kolejka sama nie zmienia roli produktu.
              </p>

              {selected.status === 'OPEN' ? (
                <Button
                  variant="ghost"
                  className="w-full"
                  disabled={action.isPending}
                  onClick={() => action.mutate('START_REVIEW')}
                >
                  Rozpocznij review
                </Button>
              ) : null}
              {selected.status === 'OPEN' || selected.status === 'IN_REVIEW' ? (
                <>
                  <label className="block text-xs font-semibold text-ink">
                    Powód decyzji
                    <textarea
                      rows={3}
                      value={reason}
                      onChange={(event) => setReason(event.currentTarget.value)}
                      className="mt-2 w-full border border-ink/15 bg-white p-3 font-normal"
                    />
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      disabled={action.isPending || reason.trim() === ''}
                      onClick={() => action.mutate('ACCEPT')}
                    >
                      Potwierdź po canonical update
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={action.isPending || reason.trim() === ''}
                      onClick={() => action.mutate('REJECT')}
                    >
                      Odrzuć
                    </Button>
                  </div>
                </>
              ) : null}
              {action.isError ? (
                <p
                  role="alert"
                  className="border border-red-300 bg-red-50 p-3 text-xs text-red-800"
                >
                  {action.error.message}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-stone-500">Wybierz request z kolejki.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
