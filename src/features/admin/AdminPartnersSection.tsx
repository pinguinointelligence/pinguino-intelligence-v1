import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { customerErrorMessage } from '@/copy/customerError';
import {
  activatePartner,
  addPartnerAdminNote,
  getAdminDirectory,
  getAdminCommissionRules,
  getAdminInvites,
  invitePartnerByEmail,
  provisionPartnerConnect,
  resendPartnerInvitation,
  setPartnerCodeStatus,
  setPartnerLinkStatus,
  setPartnerProfileStatus,
  setPartnerStatus,
  setAdminCommissionRule,
} from '@/services/adminControl';

const field = 'pro-focus-ring min-h-11 w-full border border-ink/15 bg-white px-3 text-sm';

export function AdminPartnersSection() {
  const queryClient = useQueryClient();
  const partners = useQuery({
    queryKey: ['admin-directory', 'PARTNERS'],
    queryFn: () => getAdminDirectory('PARTNERS'),
  });
  const invites = useQuery({ queryKey: ['admin-invites'], queryFn: getAdminInvites });
  const commissionRules = useQuery({
    queryKey: ['admin-commission-rules'],
    queryFn: getAdminCommissionRules,
  });
  const [invite, setInvite] = useState({ email: '', displayName: '', slug: '' });
  const [existing, setExisting] = useState({
    userId: '',
    displayName: '',
    slug: '',
    reason: 'Admin activation',
  });
  const [reason, setReason] = useState('Admin Partner operation');
  const [note, setNote] = useState('');
  const [commission, setCommission] = useState({
    product: 'home' as 'home' | 'pro',
    cadence: 'monthly' as 'monthly' | 'annual',
    tier: 'standard' as 'standard' | 'gold' | 'elite',
    amountCents: 0,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-directory', 'PARTNERS'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-invites'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-directory', 'AUDIT'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-commission-rules'] }),
    ]);
  };
  const inviteMutation = useMutation({
    mutationFn: () => invitePartnerByEmail(invite),
    onSuccess: refresh,
  });
  const activate = useMutation({ mutationFn: () => activatePartner(existing), onSuccess: refresh });
  const operation = useMutation({
    mutationFn: async (input: {
      kind:
        | 'suspend'
        | 'active'
        | 'connect'
        | 'note'
        | 'code-disable'
        | 'code-enable'
        | 'profile-approve'
        | 'profile-disable'
        | 'logo-remove'
        | 'link-disable'
        | 'link-enable';
      partnerId: string;
      codeId?: string;
      linkId?: string;
    }) => {
      if (input.kind === 'suspend' || input.kind === 'active')
        return setPartnerStatus(
          input.partnerId,
          input.kind === 'active' ? 'active' : 'suspended',
          reason,
        );
      if (input.kind === 'connect') return provisionPartnerConnect(input.partnerId);
      if (input.kind === 'note') return addPartnerAdminNote(input.partnerId, note);
      if (
        input.kind === 'profile-approve' ||
        input.kind === 'profile-disable' ||
        input.kind === 'logo-remove'
      )
        return setPartnerProfileStatus(
          input.partnerId,
          input.kind === 'profile-approve'
            ? 'APPROVE'
            : input.kind === 'profile-disable'
              ? 'DISABLE'
              : 'REMOVE_LOGO',
          reason,
        );
      if (input.kind === 'link-disable' || input.kind === 'link-enable') {
        if (!input.linkId) throw new Error('Brakuje identyfikatora linku.');
        return setPartnerLinkStatus(
          input.linkId,
          input.kind === 'link-disable' ? 'DISABLE' : 'REACTIVATE',
          reason,
        );
      }
      if (!input.codeId) throw new Error('Brakuje identyfikatora kodu.');
      return setPartnerCodeStatus(
        input.codeId,
        input.kind === 'code-disable' ? 'DISABLE' : 'REACTIVATE',
        reason,
      );
    },
    onSuccess: refresh,
  });
  const commissionMutation = useMutation({
    mutationFn: () => setAdminCommissionRule({ ...commission, reason }),
    onSuccess: refresh,
  });
  return (
    <>
      <header className="border-b border-ink/10 pb-6">
        <SectionLabel>Dostęp przez zaproszenie</SectionLabel>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-ink">Partnerzy</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          Jedna ścieżka Partner → przypisanie → rejestr prowizji → konto wypłat Connect. Brak
          publicznej rejestracji bez zaproszenia.
        </p>
      </header>
      <div className="mt-7 grid gap-6 xl:grid-cols-2">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            inviteMutation.mutate();
          }}
          className="border border-ink/10 bg-[#f3ede3] p-5"
        >
          <SectionLabel>Zaproś e-mailem</SectionLabel>
          <div className="mt-4 grid gap-3">
            <input
              className={field}
              type="email"
              required
              placeholder="Partner@example.com"
              value={invite.email}
              onChange={(event) => setInvite({ ...invite, email: event.currentTarget.value })}
            />
            <input
              className={field}
              required
              placeholder="Publiczna nazwa"
              value={invite.displayName}
              onChange={(event) => setInvite({ ...invite, displayName: event.currentTarget.value })}
            />
            <input
              className={field}
              required
              placeholder="approved-partner-slug"
              value={invite.slug}
              onChange={(event) =>
                setInvite({ ...invite, slug: event.currentTarget.value.toLowerCase() })
              }
            />
            <Button type="submit" disabled={inviteMutation.isPending}>
              Wyślij kontrolowane zaproszenie
            </Button>
          </div>
        </form>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            activate.mutate();
          }}
          className="border border-ink/10 p-5"
        >
          <SectionLabel>Aktywuj istniejącego użytkownika</SectionLabel>
          <div className="mt-4 grid gap-3">
            <input
              className={field}
              required
              placeholder="Identyfikator istniejącego użytkownika"
              value={existing.userId}
              onChange={(event) => setExisting({ ...existing, userId: event.currentTarget.value })}
            />
            <input
              className={field}
              required
              placeholder="Publiczna nazwa"
              value={existing.displayName}
              onChange={(event) =>
                setExisting({ ...existing, displayName: event.currentTarget.value })
              }
            />
            <input
              className={field}
              required
              placeholder="approved-partner-slug"
              value={existing.slug}
              onChange={(event) =>
                setExisting({ ...existing, slug: event.currentTarget.value.toLowerCase() })
              }
            />
            <Button type="submit" disabled={activate.isPending}>
              Aktywuj istniejącego użytkownika
            </Button>
          </div>
        </form>
      </div>
      {inviteMutation.isError || activate.isError ? (
        <p className="mt-4 border border-red-300 bg-red-50 p-3 text-xs text-red-800">
          {customerErrorMessage(inviteMutation.error ?? activate.error, 'admin')}
        </p>
      ) : null}
      <details className="mt-7 border-y border-ink/10 py-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          Wersjonowane zasady prowizji
        </summary>
        <p className="mt-3 text-xs text-stone-600">
          Zmiana kopiuje pełną bieżącą tabelę do nowej wersji. Historyczne wpisy prowizji zachowują
          poprzednią wersję.
        </p>
        <form
          className="mt-4 grid gap-2 sm:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            commissionMutation.mutate();
          }}
        >
          <select
            className={field}
            value={commission.product}
            onChange={(event) =>
              setCommission({ ...commission, product: event.currentTarget.value as 'home' | 'pro' })
            }
          >
            <option value="home">Home</option>
            <option value="pro">Pro</option>
          </select>
          <select
            className={field}
            value={commission.cadence}
            onChange={(event) =>
              setCommission({
                ...commission,
                cadence: event.currentTarget.value as 'monthly' | 'annual',
              })
            }
          >
            <option value="monthly">Miesięcznie</option>
            <option value="annual">Rocznie</option>
          </select>
          <select
            className={field}
            value={commission.tier}
            onChange={(event) =>
              setCommission({
                ...commission,
                tier: event.currentTarget.value as 'standard' | 'gold' | 'elite',
              })
            }
          >
            <option value="standard">Standard</option>
            <option value="gold">Gold</option>
            <option value="elite">Elite</option>
          </select>
          <input
            className={field}
            type="number"
            min="0"
            value={commission.amountCents}
            onChange={(event) =>
              setCommission({ ...commission, amountCents: Number(event.currentTarget.value) })
            }
          />
          <Button type="submit">Utwórz wersję</Button>
        </form>
        <pre className="mt-4 max-h-52 overflow-auto bg-stone-50 p-3 text-[10px]">
          {JSON.stringify(commissionRules.data ?? [], null, 2)}
        </pre>
        {commissionMutation.isError ? (
          <p className="mt-3 text-xs text-red-700">
            {customerErrorMessage(commissionMutation.error, 'admin')}
          </p>
        ) : null}
      </details>
      <div className="mt-9 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(invites.data?.partner ?? []).slice(0, 8).map((row) => (
          <div key={String(row.id)} className="border-l border-ink/15 pl-3 text-xs">
            <strong>{String(row.email)}</strong>
            <p className="mt-1 text-stone-500">
              {String(row.status)} · /{String(row.slug)}
            </p>
            {row.status === 'PENDING' ? (
              <button
                type="button"
                className="mt-2 min-h-9 font-semibold underline"
                onClick={() => void resendPartnerInvitation(String(row.id)).then(refresh)}
              >
                Wyślij zaproszenie ponownie
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <label className="mt-8 block max-w-xl text-xs font-semibold">
        Powód / notatka operacyjna
        <input
          className={`${field} mt-2`}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
        />
      </label>
      <div className="mt-6 space-y-5">
        {(partners.data ?? []).map((partner) => {
          const profile = (partner.profile ?? {}) as Record<string, unknown>;
          const codes = Array.isArray(partner.codes)
            ? (partner.codes as Array<Record<string, unknown>>)
            : [];
          const links = Array.isArray(partner.links)
            ? (partner.links as Array<Record<string, unknown>>)
            : [];
          return (
            <article key={String(partner.id)} className="border-y border-ink/10 py-5">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <strong className="text-base text-ink">
                    {String(profile.display_name ?? partner.email)}
                  </strong>
                  <p className="mt-1 font-mono text-[10px] text-stone-500">
                    {String(partner.id)} · {String(partner.status)} · profil{' '}
                    {String(profile.moderation_status ?? '—')} · Connect{' '}
                    {partner.connectAccountId ? 'GOTOWE' : 'BRAK'} · wypłaty{' '}
                    {String(partner.payoutsEnabled)}
                  </p>
                  <p className="mt-2 text-xs text-stone-600">
                    Kliknięcia {String(partner.clicks)} · Przypisania {String(partner.attributions)}{' '}
                    · Oczekująca prowizja {String(partner.pendingCommission)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {codes.map((code) => (
                      <span
                        key={String(code.id)}
                        className="border border-ink/10 px-2 py-1 font-mono text-[10px]"
                      >
                        {String(code.code)} · {String(code.status)}{' '}
                        <button
                          type="button"
                          className="ml-2 underline"
                          onClick={() =>
                            operation.mutate({
                              kind: code.status === 'blocked' ? 'code-enable' : 'code-disable',
                              partnerId: String(partner.id),
                              codeId: String(code.id),
                            })
                          }
                        >
                          {code.status === 'blocked' ? 'Włącz' : 'Wyłącz'}
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {links.map((link) => (
                      <span
                        key={String(link.id)}
                        className="border border-ink/10 px-2 py-1 font-mono text-[10px]"
                      >
                        {String(link.link_slug)} · {String(link.status)}{' '}
                        <button
                          type="button"
                          className="ml-2 underline"
                          onClick={() =>
                            operation.mutate({
                              kind: link.status === 'BLOCKED' ? 'link-enable' : 'link-disable',
                              partnerId: String(partner.id),
                              linkId: String(link.id),
                            })
                          }
                        >
                          {link.status === 'BLOCKED' ? 'Włącz' : 'Wyłącz'}
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex max-w-md flex-wrap items-start gap-2">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      operation.mutate({ kind: 'active', partnerId: String(partner.id) })
                    }
                  >
                    Przywróć
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      operation.mutate({ kind: 'suspend', partnerId: String(partner.id) })
                    }
                  >
                    Zawieś
                  </Button>
                  {!partner.connectAccountId ? (
                    <Button
                      onClick={() =>
                        operation.mutate({ kind: 'connect', partnerId: String(partner.id) })
                      }
                    >
                      Przygotuj konto Connect
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    onClick={() =>
                      operation.mutate({ kind: 'profile-approve', partnerId: String(partner.id) })
                    }
                  >
                    Zatwierdź profil
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      operation.mutate({ kind: 'profile-disable', partnerId: String(partner.id) })
                    }
                  >
                    Wyłącz profil
                  </Button>
                  {profile.logo_path ? (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        operation.mutate({ kind: 'logo-remove', partnerId: String(partner.id) })
                      }
                    >
                      Usuń logo
                    </Button>
                  ) : null}
                </div>
              </div>
              <form
                className="mt-4 flex max-w-2xl gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  operation.mutate({ kind: 'note', partnerId: String(partner.id) });
                }}
              >
                <input
                  className={field}
                  value={note}
                  onChange={(event) => setNote(event.currentTarget.value)}
                  placeholder="Notatka administratora"
                />
                <Button variant="ghost" type="submit">
                  Dodaj notatkę
                </Button>
              </form>
            </article>
          );
        })}
      </div>
      {operation.isError ? (
        <p className="mt-4 border border-red-300 bg-red-50 p-3 text-xs text-red-800">
          {customerErrorMessage(operation.error, 'admin')}
        </p>
      ) : null}
    </>
  );
}
