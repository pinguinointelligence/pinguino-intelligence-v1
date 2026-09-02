import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/shared/EmptyState';
import {
  applicationCompactClasses,
  applicationSecondaryClasses,
} from '@/components/ui/applicationControlStyles';
import { communityCopy } from '@/copy/community';
import { receivedSharePath } from '@/features/community/domain/shareUrls';
import { cn } from '@/lib/cn';
import {
  listReceivedShares,
  listSentShares,
  removeReceivedShare,
  revokeShareLink,
  type ReceivedShare,
  type SentShare,
} from '@/services/community';

type ShareView = 'received' | 'sent';

/**
 * „Udostępnione mi" (§12, §13) — one primary tab with two views.
 *
 * §3 is explicit that outgoing shares do NOT get their own top-level nav item,
 * so „Wysłane przeze mnie" lives here as a secondary view.
 *
 * Two asymmetries are deliberate:
 *   * REMOVING a received recipe hides the row for this recipient only. The
 *     sender's recipe and the share record are untouched (§12).
 *   * The sent view shows COUNTS, never people. Who opened a link is the
 *     recipient's business (§13, §81) — this is not a read-receipt product.
 */
export function SharedWithMePanel({ className }: { className?: string }) {
  const copy = communityCopy;
  const [view, setView] = useState<ShareView>('received');
  const [received, setReceived] = useState<ReceivedShare[] | null>(null);
  const [sent, setSent] = useState<SentShare[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (view === 'received' && received === null) {
      listReceivedShares()
        .then((rows) => !cancelled && setReceived(rows))
        .catch(() => !cancelled && setReceived([]));
    }
    if (view === 'sent' && sent === null) {
      listSentShares()
        .then((rows) => !cancelled && setSent(rows))
        .catch(() => !cancelled && setSent([]));
    }
    return () => {
      cancelled = true;
    };
  }, [view, received, sent]);

  const remove = async (shareLinkId: string) => {
    await removeReceivedShare(shareLinkId);
    setReceived((rows) => rows?.filter((row) => row.share_link_id !== shareLinkId) ?? null);
  };

  const revoke = async (shareLinkId: string) => {
    await revokeShareLink(shareLinkId);
    setSent(
      (rows) =>
        rows?.map((row) =>
          row.share_link_id === shareLinkId ? { ...row, status: 'revoked' as const } : row,
        ) ?? null,
    );
  };

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <nav aria-label={copy.nav.sharedWithMe} className="flex gap-1">
        {(
          [
            ['received', copy.nav.received],
            ['sent', copy.nav.sentByMe],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={view === key ? 'page' : undefined}
            onClick={() => setView(key)}
            className={applicationCompactClasses(
              view === key ? '!border-ink !bg-ink !text-white hover:!border-ink' : 'text-stone-600',
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {view === 'received' ? (
        received === null ? (
          <ApplicationState kind="loading" title="Wczytuję udostępnione receptury…" />
        ) : received.length === 0 ? (
          <EmptyState title={copy.empty.received} />
        ) : (
          <ul className="flex flex-col gap-3">
            {received.map((share) => (
              <li key={share.share_link_id}>
                <Card className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{share.title}</p>
                    <p className="mt-1 text-sm text-stone-500">
                      {copy.roles.createdBy}{' '}
                      {share.created_by_handle ? (
                        <Link
                          to={`/@${share.created_by_handle}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {share.created_by}
                        </Link>
                      ) : (
                        share.created_by
                      )}
                      {!share.shared_by_is_creator && share.shared_by ? (
                        <>
                          {' · '}
                          {copy.roles.sharedBy} {share.shared_by}
                        </>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs tracking-label uppercase text-stone-400">
                      {share.entitlement === 'full' ? 'Odblokowane' : copy.demo.badge}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {/* The recipient does not have the token — it lived in
                        the link they were sent, and it was never stored. This
                        route resolves by membership instead (§12). */}
                    <Link
                      to={receivedSharePath(share.share_link_id)}
                      className={applicationSecondaryClasses()}
                    >
                      {copy.actions.view}
                    </Link>
                    <button
                      type="button"
                      className={applicationSecondaryClasses()}
                      onClick={() => remove(share.share_link_id)}
                    >
                      {copy.actions.removeFromReceived}
                    </button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : sent === null ? (
        <ApplicationState kind="loading" title="Wczytuję wysłane linki…" />
      ) : sent.length === 0 ? (
        <EmptyState title={copy.empty.sent} />
      ) : (
        <ul className="flex flex-col gap-3">
          {sent.map((share) => (
            <li key={share.share_link_id}>
              <Card className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{share.title}</p>
                  <p className="mt-1 text-sm text-stone-500 tabular-nums">
                    v{share.version_number} · {share.unique_opens} {copy.metrics.uniqueOpens}
                    {share.partner_attribution ? (
                      <span className="ml-2 text-xs tracking-label uppercase text-stone-400">
                        {copy.roles.partner}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs tracking-label uppercase text-stone-400">
                    {share.status === 'active' ? 'Aktywny' : 'Unieważniony'}
                  </p>
                </div>
                {share.status === 'active' ? (
                  <button
                    type="button"
                    className={applicationSecondaryClasses()}
                    onClick={() => revoke(share.share_link_id)}
                  >
                    {copy.actions.revokeLink}
                  </button>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
