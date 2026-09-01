import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import {
  accountStateTone,
  AdminEyebrow,
  AdminStatus,
  AdminTableCard,
  ADMIN_FIELD,
  ADMIN_ROW_ACTION,
  ADMIN_TABLE,
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_THEAD_ROW,
  formatMarketPreferences,
} from './adminUi';
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
      if (!selected) throw new Error('Wybierz użytkownika');
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
      <header className="border-b border-[var(--g-line)] pb-6">
        <AdminEyebrow>Obsługa kont</AdminEyebrow>
        <h1 className="mt-[7px] text-[25px] leading-[1.08] font-[750] tracking-[-0.04em] text-[var(--g-ink)] sm:text-[30px]">
          Użytkownicy
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--g-text-secondary)]">
          Role, stan konta, entitlementy, kraje, Favorites i zgłoszenia — bez haseł, kart oraz
          prywatnych receptur.
        </p>
      </header>
      <input
        className={`${ADMIN_FIELD} mt-6`}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        placeholder="Szukaj po e-mailu lub identyfikatorze"
      />
      <div className="mt-6 grid gap-7 xl:grid-cols-[minmax(0,1fr)_380px]">
        <AdminTableCard>
          <table className={`${ADMIN_TABLE} min-w-[780px]`}>
            <thead>
              <tr className={ADMIN_THEAD_ROW}>
                {['Użytkownik', 'Stan / tryby', 'Rynki', 'Ulubione', 'Zgłoszenia', ''].map(
                  (label) => (
                    <th key={label} className={ADMIN_TH}>
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)}>
                  <td className={ADMIN_TD}>
                    <strong className="text-[var(--g-ink)]">{String(row.email)}</strong>
                    <span className="mt-1 block font-mono text-[10px] text-[var(--g-text-muted)]">
                      {String(row.id)}
                    </span>
                  </td>
                  <td className={ADMIN_TD}>
                    <AdminStatus tone={accountStateTone(String(row.accountState))}>
                      {String(row.accountState)}
                    </AdminStatus>
                    <span className="mt-1.5 block text-[var(--g-text-secondary)]">
                      Admin: {String(row.adminRole ?? '—')} · Partner:{' '}
                      {String(row.partnerStatus ?? '—')}
                    </span>
                  </td>
                  {/* was `JSON.stringify(... ?? {})`, which printed a literal
                      `{}` into every row — the storage shape, not information. */}
                  <td className={`${ADMIN_TD} text-[var(--g-text-secondary)]`}>
                    {formatMarketPreferences(row.marketPreferences)}
                  </td>
                  <td className={`${ADMIN_TD} font-mono tabular-nums`}>
                    {String(row.favoritesCount ?? 0)}
                  </td>
                  <td className={`${ADMIN_TD} text-[var(--g-text-secondary)]`}>
                    <span className="font-mono tabular-nums">{String(row.requestsCount ?? 0)}</span>{' '}
                    · dodane{' '}
                    <span className="font-mono tabular-nums">
                      {String(row.contributedCount ?? 0)}
                    </span>
                  </td>
                  <td className={ADMIN_TD}>
                    <button
                      className={ADMIN_ROW_ACTION}
                      onClick={() => setSelectedId(String(row.id))}
                    >
                      Otwórz
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableCard>
        <aside className="h-max rounded-[12px] border border-[var(--g-line)] bg-[var(--g-ivory)] p-[18px]">
          <AdminEyebrow>Udokumentowana operacja</AdminEyebrow>
          {selected ? (
            <div className="mt-4 space-y-4">
              <strong className="text-sm">{String(selected.email)}</strong>
              <label className="block text-xs font-semibold">
                Powód
                <input
                  className={`${ADMIN_FIELD} mt-2`}
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
                  className={`${ADMIN_FIELD} mt-2`}
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
            <p className="mt-4 text-sm text-[var(--g-text-secondary)]">
              Wybierz konto. Każda zmiana wymaga powodu i roli SUPPORT
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
