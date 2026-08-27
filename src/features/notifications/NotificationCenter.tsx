import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { useAuthStore } from '@/stores/authStore';
import { productRequestUserAction } from '@/services/productRequests';
import {
  getAdminNotificationPreferences,
  listNotifications,
  notificationAction,
  setAdminSalesSound,
  type DurableNotification,
} from '@/services/notifications';
import { LocalSalesSound } from './salesSound';
import { customerErrorMessage } from '@/copy/customerError';

const startupTypes = new Set([
  'PRODUCT_REQUEST_NEEDS_INFO',
  'PRODUCT_REQUEST_APPROVED',
  'PRODUCT_REQUEST_DUPLICATE',
  'PRODUCT_REQUEST_REJECTED',
  'PARTNER_ACTIVATED',
]);

function UserStartupNotice({ notification }: { notification: DurableNotification }) {
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: async (kind: 'ACKNOWLEDGE' | 'ARCHIVE' | 'CANCEL') => {
      if ((kind === 'ARCHIVE' || kind === 'CANCEL') && notification.entityId) {
        if (
          kind === 'CANCEL' &&
          !window.confirm('Anulować zgłoszenie? Tej operacji nie można cofnąć.')
        )
          return;
        await productRequestUserAction(notification.entityId, kind);
      }
      await notificationAction(notification.id, 'ACKNOWLEDGE');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      await queryClient.invalidateQueries({ queryKey: ['my-product-requests'] });
    },
  });
  const needsInfo = notification.type === 'PRODUCT_REQUEST_NEEDS_INFO';
  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-label={notification.title}
      className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-2xl border border-ink/15 bg-paper p-5 shadow-[0_24px_80px_rgba(16,17,19,0.22)] sm:bottom-6 sm:p-6"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
        Gellatti · zgłoszenie produktu
      </p>
      <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-ink">
        {notification.title}
      </h2>
      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-stone-600">
        {notification.body}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {notification.deepLink ? (
          <Link
            to={notification.deepLink}
            onClick={() => void notificationAction(notification.id, 'READ')}
            className="pro-focus-ring inline-flex min-h-11 items-center bg-ink px-5 text-sm font-semibold text-paper"
          >
            {needsInfo
              ? 'Uzupełnij dane'
              : notification.type === 'PARTNER_ACTIVATED'
                ? 'Otwórz tryb Partner'
                : 'Otwórz produkt'}
          </Link>
        ) : null}
        {needsInfo ? (
          <>
            <Button variant="ghost" onClick={() => action.mutate('ARCHIVE')}>
              Odłóż do archiwum
            </Button>
            <Button variant="ghost" onClick={() => action.mutate('CANCEL')}>
              Anuluj zgłoszenie
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => action.mutate('ACKNOWLEDGE')}>
            Rozumiem
          </Button>
        )}
      </div>
      {action.isError ? (
        <p className="mt-3 text-xs text-status-error">
          {customerErrorMessage(action.error, 'account')}
        </p>
      ) : null}
    </aside>
  );
}

function AdminNotifications({ items }: { items: DurableNotification[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const sound = useRef<LocalSalesSound | null>(null);
  const preferences = useQuery({
    queryKey: ['admin-notification-preferences'],
    queryFn: getAdminNotificationPreferences,
  });
  const preferenceMutation = useMutation({
    mutationFn: setAdminSalesSound,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin-notification-preferences'] }),
  });
  const pendingSounds = useMemo(
    () => items.filter((item) => item.soundEligible && !item.soundPlayedAt),
    [items],
  );
  useEffect(() => {
    if (
      !audioUnlocked ||
      preferences.data?.salesSoundEnabled !== true ||
      pendingSounds.length === 0
    )
      return;
    let cancelled = false;
    const play = async () => {
      for (const item of pendingSounds) {
        if (cancelled) return;
        try {
          await sound.current?.play();
          await notificationAction(item.id, 'SOUND_PLAYED');
        } catch {
          return;
        }
      }
      if (!cancelled) await queryClient.invalidateQueries({ queryKey: ['notifications', true] });
    };
    void play();
    return () => {
      cancelled = true;
    };
  }, [audioUnlocked, pendingSounds, preferences.data?.salesSoundEnabled, queryClient]);
  const unread = items.filter((item) => !item.readAt).length;
  return (
    <div className="fixed right-3 top-3 z-[65] sm:right-6 sm:top-6">
      <button
        type="button"
        aria-label={`Powiadomienia Admin${unread ? `: ${unread} nowych` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="pro-focus-ring relative grid size-11 place-items-center border border-ink/15 bg-paper text-lg shadow-sm"
      >
        <span aria-hidden>◇</span>
        {unread ? (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center bg-ink px-1 font-mono text-[10px] text-white">
            {unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <aside className="mt-2 w-[min(92vw,420px)] border border-ink/15 bg-paper shadow-[0_20px_70px_rgba(16,17,19,0.2)]">
          <header className="border-b border-ink/10 bg-[#f3ede3] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Admin
                </p>
                <h2 className="mt-1 text-base font-semibold text-ink">Centrum powiadomień</h2>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={preferences.data?.salesSoundEnabled === true}
                  onChange={(event) => preferenceMutation.mutate(event.currentTarget.checked)}
                />
                Dźwięk sprzedaży
              </label>
            </div>
            {!audioUnlocked ? (
              <Button
                size="sm"
                className="mt-3"
                onClick={async () => {
                  sound.current ??= new LocalSalesSound();
                  await sound.current.unlock();
                  setAudioUnlocked(true);
                }}
              >
                Włącz dźwięk sprzedaży
              </Button>
            ) : (
              <p className="mt-3 text-xs text-status-ideal">Dźwięk odblokowany w tej sesji.</p>
            )}
          </header>
          <div className="max-h-[65vh] divide-y divide-ink/10 overflow-y-auto">
            {items.map((item) => (
              <article key={item.id} className="p-4" data-notification-type={item.type}>
                <div className="flex items-center gap-2">
                  {item.isTest ? (
                    <span className="border border-ink/20 px-1.5 py-0.5 font-mono text-[9px]">
                      TEST
                    </span>
                  ) : null}
                  <time className="font-mono text-[10px] text-stone-500">
                    {new Date(item.createdAt).toLocaleString('pl-PL')}
                  </time>
                </div>
                <strong className="mt-2 block text-sm text-ink">{item.title}</strong>
                <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-stone-600">
                  {item.body}
                </p>
                <div className="mt-3 flex gap-2">
                  {item.deepLink ? (
                    <Link
                      to={item.deepLink}
                      onClick={() => void notificationAction(item.id, 'READ')}
                      className="pro-focus-ring text-xs font-semibold text-ink underline underline-offset-4"
                    >
                      Otwórz
                    </Link>
                  ) : null}
                  {!item.acknowledgedAt ? (
                    <button
                      type="button"
                      onClick={() =>
                        void notificationAction(item.id, 'ACKNOWLEDGE').then(() =>
                          queryClient.invalidateQueries({ queryKey: ['notifications', true] }),
                        )
                      }
                      className="pro-focus-ring text-xs text-stone-500"
                    >
                      Potwierdź
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            {items.length === 0 ? (
              <p className="p-5 text-sm text-stone-500">Brak powiadomień.</p>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

/** Durable startup notices plus the permission-aware Admin notification center. */
export function NotificationCenter() {
  const status = useAuthStore((state) => state.status);
  const canAdmin = useProCoreAccessStore((state) => state.effectiveAccess?.canAdmin === true);
  const userQuery = useQuery({
    queryKey: ['notifications', false],
    queryFn: () => listNotifications(false),
    enabled: status === 'authed',
    refetchInterval: 15_000,
  });
  const adminQuery = useQuery({
    queryKey: ['notifications', true],
    queryFn: () => listNotifications(true),
    enabled: status === 'authed' && canAdmin,
    refetchInterval: 8_000,
  });
  if (status !== 'authed') return null;
  const startup = (userQuery.data ?? []).find(
    (item) => !item.acknowledgedAt && startupTypes.has(item.type),
  );
  return (
    <>
      {startup ? <UserStartupNotice notification={startup} /> : null}
      {canAdmin ? <AdminNotifications items={adminQuery.data ?? []} /> : null}
    </>
  );
}
