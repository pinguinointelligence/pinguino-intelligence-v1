import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { adminUserAction, getAdminDirectory } from '@/services/adminControl';
import { customerErrorMessage } from '@/copy/customerError';

export function AdminUsersSection() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['admin-directory', 'USERS'],
    queryFn: () => getAdminDirectory('USERS'),
  });
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('Udokumentowana pomoc dla użytkownika');
  const [scope, setScope] = useState<'home' | 'pro'>('home');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      (query.data ?? []).filter((row) =>
        `${String(row.email)} ${String(row.id)}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [query.data, search],
  );
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const action = useMutation({
    mutationFn: (
      kind: 'SUSPEND' | 'REACTIVATE' | 'GRANT_COMPLIMENTARY' | 'REVOKE_COMPLIMENTARY',
    ) => {
      if (!selected) throw new Error('Wybierz użytkownika.');
      const activeAdminGrant = Array.isArray(selected.entitlements)
        ? (selected.entitlements.find((item: unknown) => {
            const value = item as Record<string, unknown>;
            return value.sourceType === 'admin_grant' && value.status === 'active';
          }) as Record<string, unknown> | undefined)
        : undefined;
      return adminUserAction(String(selected.id), kind, {
        reason,
        scope,
        grantId: activeAdminGrant?.sourceId,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-directory', 'USERS'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-directory', 'AUDIT'] });
    },
  });
  return (
    <>
      <header className="border-b border-ink/10 pb-6">
        <SectionLabel>Obsługa kont</SectionLabel>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-ink">Użytkownicy</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          Role, stan konta, entitlementy, kraje, Favorites i zgłoszenia — bez haseł, kart oraz
          prywatnych receptur.
        </p>
      </header>
      <input
        className="pro-focus-ring mt-6 min-h-11 w-full border border-ink/15 px-3 text-sm"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        placeholder="Szukaj po e-mailu lub identyfikatorze"
      />
      <div className="mt-6 grid gap-7 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-xs">
            <thead>
              <tr className="border-y border-ink/15 bg-stone-50">
                {['Użytkownik', 'Stan / tryby', 'Rynki', 'Ulubione', 'Zgłoszenia', ''].map(
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
              {rows.map((row) => (
                <tr key={String(row.id)} className="border-b border-ink/10">
                  <td className="px-3 py-4">
                    <strong>{String(row.email)}</strong>
                    <span className="mt-1 block font-mono text-[10px] text-stone-400">
                      {String(row.id)}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    {String(row.accountState)}
                    <span className="mt-1 block text-stone-500">
                      Admin: {String(row.adminRole ?? '—')} · Partner:{' '}
                      {String(row.partnerStatus ?? '—')}
                    </span>
                  </td>
                  <td className="px-3 py-4">{JSON.stringify(row.marketPreferences ?? {})}</td>
                  <td className="px-3 py-4 tabular-nums">{String(row.favoritesCount ?? 0)}</td>
                  <td className="px-3 py-4 tabular-nums">
                    {String(row.requestsCount ?? 0)} · dodane {String(row.contributedCount ?? 0)}
                  </td>
                  <td className="px-3 py-4">
                    <button
                      className="pro-focus-ring min-h-10 border border-ink/15 px-3 font-semibold"
                      onClick={() => setSelectedId(String(row.id))}
                    >
                      Otwórz
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <aside className="border border-ink/12 bg-[#f3ede3] p-5">
          <SectionLabel>Udokumentowana operacja</SectionLabel>
          {selected ? (
            <div className="mt-4 space-y-4">
              <strong className="text-sm">{String(selected.email)}</strong>
              <label className="block text-xs font-semibold">
                Powód
                <input
                  className="mt-2 min-h-11 w-full border border-ink/15 px-3 font-normal"
                  value={reason}
                  onChange={(event) => setReason(event.currentTarget.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={() => action.mutate('SUSPEND')}>
                  Zawieś
                </Button>
                <Button variant="ghost" onClick={() => action.mutate('REACTIVATE')}>
                  Przywróć
                </Button>
              </div>
              <label className="block text-xs font-semibold">
                Bezpłatny dostęp
                <select
                  className="mt-2 min-h-11 w-full border border-ink/15 px-3 font-normal"
                  value={scope}
                  onChange={(event) => setScope(event.currentTarget.value as 'home' | 'pro')}
                >
                  <option value="home">Home</option>
                  <option value="pro">Pro</option>
                </select>
              </label>
              <Button className="w-full" onClick={() => action.mutate('GRANT_COMPLIMENTARY')}>
                Przyznaj dostęp
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => action.mutate('REVOKE_COMPLIMENTARY')}
              >
                Cofnij aktywny dostęp
              </Button>
              <details>
                <summary className="cursor-pointer text-xs font-semibold">
                  Szczegóły dostępu
                </summary>
                <pre className="mt-2 max-h-60 overflow-auto bg-white p-3 text-[10px]">
                  {JSON.stringify(selected.entitlements, null, 2)}
                </pre>
              </details>
              {action.isError ? (
                <p className="border border-red-300 bg-red-50 p-3 text-xs text-red-800">
                  {customerErrorMessage(action.error, 'admin')}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-stone-500">
              Wybierz konto. Każda zmiana wymaga powodu i roli SUPPORT.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
