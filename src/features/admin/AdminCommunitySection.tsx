import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { adminCommunityAction, getAdminDirectory } from '@/services/adminControl';
import { customerErrorMessage } from '@/copy/customerError';

export function AdminCommunitySection() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['admin-directory', 'COMMUNITY'],
    queryFn: () => getAdminDirectory('COMMUNITY'),
  });
  const [reason, setReason] = useState('Przegląd moderacyjny');
  const mutation = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'START_REVIEW' | 'DISMISS' | 'HIDE_PUBLICATION' | 'RESTORE_PUBLICATION';
    }) => adminCommunityAction(id, action, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-directory', 'COMMUNITY'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-directory', 'AUDIT'] });
    },
  });
  return (
    <>
      <header className="border-b border-[var(--g-line)] pb-6">
        <SectionLabel>Tylko treści publiczne</SectionLabel>
        <h1 className="mt-2 text-[25px] leading-[1.08] font-[750] tracking-[-0.04em] text-[var(--g-ink)] sm:text-[30px]">
          Community i treści
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--g-text-secondary)]">
          Moderacja obejmuje wyłącznie zgłoszone/publiczne treści. Prywatne receptury i gramy nie są
          częścią projekcji.
        </p>
      </header>
      <label className="mt-6 block max-w-xl text-xs font-semibold">
        Powód dla następnej akcji
        <input
          className="mt-2 min-h-11 w-full border border-[var(--g-line)] px-3 font-normal"
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
        />
      </label>
      <div className="mt-7 space-y-4">
        {(query.data ?? []).map((report) => (
          <article key={String(report.id)} className="border-y border-[var(--g-line)] py-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--g-text-secondary)]">
                  <span>{String(report.status)}</span>
                  <span>{String(report.reason)}</span>
                  <span>{new Date(String(report.createdAt)).toLocaleString('pl-PL')}</span>
                </div>
                <h2 className="mt-2 text-base font-semibold text-ink">
                  {String(
                    report.publicationTitle ?? report.publicationId ?? report.creatorProfileId,
                  )}
                </h2>
                <p className="mt-2 text-sm text-[var(--g-text-secondary)]">
                  {String(report.detail ?? 'Brak opisu')}
                </p>
                <p className="mt-2 text-xs text-[var(--g-text-secondary)]">
                  Twórca: {String(report.creatorDisplayName ?? '—')} · Przypisanie partnera:{' '}
                  {String(report.partnerAttribution ?? 'brak')}
                </p>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <Button
                  variant="ghost"
                  onClick={() => mutation.mutate({ id: String(report.id), action: 'START_REVIEW' })}
                >
                  Przejrzyj
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => mutation.mutate({ id: String(report.id), action: 'DISMISS' })}
                >
                  Odrzuć zgłoszenie
                </Button>
                {report.publicationId ? (
                  <>
                    <Button
                      onClick={() =>
                        mutation.mutate({ id: String(report.id), action: 'HIDE_PUBLICATION' })
                      }
                    >
                      Ukryj
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        mutation.mutate({ id: String(report.id), action: 'RESTORE_PUBLICATION' })
                      }
                    >
                      Przywróć
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </article>
        ))}
        {(query.data?.length ?? 0) === 0 ? (
          <p className="py-8 text-sm text-[var(--g-text-secondary)]">Brak raportów moderacyjnych</p>
        ) : null}
      </div>
      {mutation.isError ? (
        <p className="mt-4 border border-red-300 bg-red-50 p-3 text-xs text-red-800">
          {customerErrorMessage(mutation.error, 'admin')}
        </p>
      ) : null}
    </>
  );
}
