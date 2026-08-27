import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { getAdminInvites, mintHomeInvite } from '@/services/adminControl';
import { customerErrorMessage } from '@/copy/customerError';

export function AdminInvitesSection() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin-invites'], queryFn: getAdminInvites });
  const [email, setEmail] = useState('');
  const [issued, setIssued] = useState<{ code: string; email: string; expiresAt: string } | null>(
    null,
  );
  const mint = useMutation({
    mutationFn: () => mintHomeInvite(email),
    onSuccess: async (result) => {
      setIssued({ ...result, email });
      setEmail('');
      await queryClient.invalidateQueries({ queryKey: ['admin-invites'] });
    },
  });
  return (
    <section className="mt-9 border-t border-ink/10 pt-8">
      <SectionLabel>Osobny typ dostępu</SectionLabel>
      <h2 className="mt-2 text-xl font-semibold text-ink">
        Jednorazowe zaproszenia Home na miesiąc
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
        Kod jest przypisany do jednego e-maila, działa raz i nie jest kodem Partnera. Pełny kod
        pojawia się wyłącznie po utworzeniu.
      </p>
      <form
        className="mt-5 flex max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          mint.mutate();
        }}
      >
        <input
          className="pro-focus-ring min-h-11 flex-1 border border-ink/15 px-3 text-sm"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          placeholder="exact@email.com"
        />
        <Button type="submit">Utwórz kod</Button>
      </form>
      {issued ? (
        <div className="mt-4 max-w-xl border border-status-ideal/30 bg-status-ideal/5 p-4">
          <p className="text-xs text-stone-600">
            Skopiuj teraz dla {issued.email}. Nie będzie ponownie dostępny.
          </p>
          <strong className="mt-2 block font-mono text-xl tracking-[0.12em]">{issued.code}</strong>
          <p className="mt-2 text-xs text-stone-500">
            Wygasa: {new Date(issued.expiresAt).toLocaleString('pl-PL')}
          </p>
        </div>
      ) : null}
      {mint.isError ? (
        <p className="mt-3 text-xs text-red-700">{customerErrorMessage(mint.error, 'admin')}</p>
      ) : null}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead>
            <tr className="border-y border-ink/15 bg-stone-50">
              {['Miejsce', 'E-mail', 'Status', 'Utworzono', 'Wygasa', 'Wykorzystano'].map(
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
            {(query.data?.home ?? []).map((row) => (
              <tr key={String(row.id)} className="border-b border-ink/10">
                <td className="px-3 py-4">
                  {String(row.slot)} v{String(row.version)}
                </td>
                <td className="px-3 py-4">{String(row.email)}</td>
                <td className="px-3 py-4">{String(row.status)}</td>
                <td className="px-3 py-4">
                  {new Date(String(row.createdAt)).toLocaleDateString('pl-PL')}
                </td>
                <td className="px-3 py-4">
                  {row.expiresAt
                    ? new Date(String(row.expiresAt)).toLocaleDateString('pl-PL')
                    : '—'}
                </td>
                <td className="px-3 py-4">
                  {row.redeemedAt ? new Date(String(row.redeemedAt)).toLocaleString('pl-PL') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
