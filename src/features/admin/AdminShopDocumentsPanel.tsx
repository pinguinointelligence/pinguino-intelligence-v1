import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/cn';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { EmptyState } from '@/components/shared/EmptyState';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { applicationSecondaryClasses } from '@/components/ui/applicationControlStyles';
import { shopCopy } from '@/copy/shop';
import {
  getAdminDocumentOrders,
  getDocumentDownload,
  openDocumentDownload,
  type AdminDocumentOrder,
} from '@/services/shopDigitalDocument';

/**
 * 0 € document orders, on their own list.
 *
 * A PDF is never packed, so it never enters the parcel queue ("Do wysłania" / "Wysłane")
 * and has no fulfilment buttons. Finance sees who ordered which version, whether the
 * notification was queued, and can open the exact file pinned in the order.
 */

const cell = 'border-b border-[var(--g-line-quiet)] px-3 py-3 align-top text-[var(--g-ink)]';
const head =
  'border-b border-[var(--g-line)] px-3 py-2.5 text-left font-semibold text-[var(--g-text-secondary)]';

function DownloadButton({ order }: { order: AdminDocumentOrder }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const open = async () => {
    setBusy(true);
    setFailed(false);
    try {
      openDocumentDownload(await getDocumentDownload(order.id));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        className={applicationSecondaryClasses()}
        data-testid={`admin-document-download-${order.orderNumber}`}
      >
        {busy ? shopCopy.infopak.downloadBusy : shopCopy.infopak.download}
      </button>
      {failed ? (
        <p className="mt-1 text-[12px] text-[var(--g-attention-ink)]">
          {shopCopy.infopak.downloadFailed}
        </p>
      ) : null}
    </div>
  );
}

export function AdminShopDocumentsPanel() {
  const documents = useQuery({
    queryKey: ['admin-shop-documents'],
    queryFn: getAdminDocumentOrders,
  });
  const rows = documents.data ?? [];
  return (
    <section className="mt-10" data-testid="admin-shop-documents">
      <SectionLabel>{shopCopy.infopak.adminTitle}</SectionLabel>
      {documents.isLoading ? <ApplicationState kind="loading" title="Wczytuję dokumenty…" /> : null}
      {documents.isError ? (
        <ApplicationState kind="error" title="Nie udało się wczytać dokumentów." />
      ) : null}
      {documents.data && rows.length === 0 ? (
        <EmptyState title={shopCopy.infopak.adminEmpty} />
      ) : null}
      {rows.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={head}>{shopCopy.orders.number}</th>
                <th className={head}>{shopCopy.orders.placed}</th>
                <th className={head}>E-mail</th>
                <th className={head}>{shopCopy.infopak.adminMarket}</th>
                <th className={head}>{shopCopy.infopak.adminVersion}</th>
                <th className={head}>{shopCopy.infopak.adminMail}</th>
                <th className={head}>PDF</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr key={order.id} data-testid={`admin-document-${order.orderNumber}`}>
                  <td className={cn(cell, 'font-mono text-xs')}>
                    {order.orderNumber}
                    {order.qaAccount ? (
                      <span className="ml-2 border border-[var(--g-line)] px-1.5 py-0.5 text-[10px] tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">
                        {shopCopy.infopak.adminQa}
                      </span>
                    ) : null}
                  </td>
                  <td className={cn(cell, 'font-mono text-xs')}>
                    {order.createdAt.slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className={cell}>{order.email}</td>
                  <td className={cn(cell, 'font-mono text-xs')}>
                    {order.countryIso2 ? `${order.countryIso2} · ${order.language ?? ''}` : '—'}
                  </td>
                  <td className={cn(cell, 'font-mono text-xs')}>
                    {order.documentVersion} · {order.documentSha256.slice(0, 8)}
                  </td>
                  <td className={cn(cell, 'text-xs text-[var(--g-text-secondary)]')}>
                    {order.emailStatus ?? '—'}
                  </td>
                  <td className={cell}>
                    <DownloadButton order={order} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
